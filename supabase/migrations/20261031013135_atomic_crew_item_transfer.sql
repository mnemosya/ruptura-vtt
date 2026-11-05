-- Uma chamada RPC = uma transação para as duas pontas do inventário.
-- O servidor calcula a divisão/mesclagem usando os helpers de domínio;
-- esta função trava as linhas, rejeita snapshots obsoletos e grava ambas.
create or replace function public.atomic_crew_item_transfer(
  p_campaign_id uuid,
  p_character_id uuid,
  p_direction text,
  p_expected_character jsonb,
  p_next_character jsonb,
  p_moved_instance jsonb,
  p_crew_row_id uuid default null,
  p_expected_crew jsonb default null,
  p_next_crew jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_character public.characters%rowtype;
  v_saved public.characters%rowtype;
  v_crew public.campaign_inventory_items%rowtype;
  v_owner boolean;
  v_before_other jsonb;
  v_after_other jsonb;
  v_before_quantity integer;
  v_after_quantity integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_direction is null or p_direction not in ('crew_to_character', 'character_to_crew')
     or p_expected_character is null or p_next_character is null
     or p_moved_instance is null or coalesce(p_moved_instance->>'id', '') = ''
     or coalesce(p_moved_instance->>'itemSlug', '') = ''
     or coalesce((p_moved_instance->>'quantidade')::integer, 0) < 1 then
    raise exception 'invalid_transfer' using errcode = '22023';
  end if;

  select * into v_character from public.characters
    where id = p_character_id and campaign_id = p_campaign_id for update;
  if not found then
    raise exception 'character_not_found_in_campaign' using errcode = '22023';
  end if;
  v_owner := public.is_campaign_owner(p_campaign_id, (select auth.uid()));
  if not (v_owner or public.is_character_controller_for(p_character_id, p_campaign_id, (select auth.uid()))) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if p_direction = 'crew_to_character' and not v_owner then
    raise exception 'only_narrator_can_withdraw' using errcode = '42501';
  end if;
  if p_direction = 'character_to_crew' and not (v_owner or public.is_campaign_member(p_campaign_id)) then
    raise exception 'not_campaign_member' using errcode = '42501';
  end if;
  if v_character.payload is distinct from p_expected_character then
    raise exception 'character_changed_retry_transfer' using errcode = '40001';
  end if;
  -- Nenhum outro campo do personagem pode ser alterado por esta RPC.
  if (p_next_character - 'inventario') is distinct from (p_expected_character - 'inventario') then
    raise exception 'transfer_can_only_change_inventory' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_before_other
    from jsonb_array_elements(coalesce(p_expected_character->'inventario', '[]'::jsonb)) with ordinality as x(item, ord)
    where item->>'itemSlug' is distinct from p_moved_instance->>'itemSlug';
  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_after_other
    from jsonb_array_elements(coalesce(p_next_character->'inventario', '[]'::jsonb)) with ordinality as x(item, ord)
    where item->>'itemSlug' is distinct from p_moved_instance->>'itemSlug';
  if v_before_other is distinct from v_after_other then
    raise exception 'unrelated_inventory_change' using errcode = '22023';
  end if;
  select coalesce(sum((item->>'quantidade')::integer), 0) into v_before_quantity
    from jsonb_array_elements(coalesce(p_expected_character->'inventario', '[]'::jsonb)) as x(item)
    where item->>'itemSlug' = p_moved_instance->>'itemSlug';
  select coalesce(sum((item->>'quantidade')::integer), 0) into v_after_quantity
    from jsonb_array_elements(coalesce(p_next_character->'inventario', '[]'::jsonb)) as x(item)
    where item->>'itemSlug' = p_moved_instance->>'itemSlug';
  if (p_direction = 'crew_to_character' and v_after_quantity - v_before_quantity <> (p_moved_instance->>'quantidade')::integer)
     or (p_direction = 'character_to_crew' and v_before_quantity - v_after_quantity <> (p_moved_instance->>'quantidade')::integer) then
    raise exception 'inventory_quantity_mismatch' using errcode = '22023';
  end if;

  if p_direction = 'crew_to_character' then
    if p_crew_row_id is null or p_expected_crew is null then
      raise exception 'crew_source_required' using errcode = '22023';
    end if;
    select * into v_crew from public.campaign_inventory_items
      where id = p_crew_row_id and campaign_id = p_campaign_id for update;
    if not found or v_crew.payload is distinct from p_expected_crew then
      raise exception 'crew_item_changed_retry_transfer' using errcode = '40001';
    end if;
    if p_moved_instance->>'itemSlug' is distinct from p_expected_crew->>'itemSlug'
       or p_moved_instance->>'categoria' is distinct from p_expected_crew->>'categoria'
       or coalesce((p_expected_crew->>'quantidade')::integer, 0) < (p_moved_instance->>'quantidade')::integer
       or coalesce((p_next_crew->>'quantidade')::integer, 0) <> coalesce((p_expected_crew->>'quantidade')::integer, 0) - (p_moved_instance->>'quantidade')::integer then
      raise exception 'crew_quantity_mismatch' using errcode = '22023';
    end if;
    if p_next_crew is not null and (
      p_next_crew->>'id' is distinct from p_expected_crew->>'id'
      or p_next_crew->>'itemSlug' is distinct from p_expected_crew->>'itemSlug'
      or coalesce((p_next_crew->>'quantidade')::integer, 0) >= coalesce((p_expected_crew->>'quantidade')::integer, 0)
    ) then
      raise exception 'invalid_crew_remainder' using errcode = '22023';
    end if;

    v_saved := public.update_character_sheet_payload(p_character_id, p_next_character);
    if p_next_crew is null then
      delete from public.campaign_inventory_items where id = v_crew.id;
    else
      update public.campaign_inventory_items
        set payload = p_next_crew,
            quantity = (p_next_crew->>'quantidade')::integer,
            item_name = p_next_crew->>'itemNome',
            item_slug = p_next_crew->>'itemSlug'
        where id = v_crew.id;
    end if;
  else
    if p_crew_row_id is not null or p_expected_crew is not null or p_next_crew is not null then
      raise exception 'unexpected_crew_source' using errcode = '22023';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(p_expected_character->'inventario', '[]'::jsonb)) as x(item)
      where item->>'itemSlug' = p_moved_instance->>'itemSlug'
        and item->>'categoria' = p_moved_instance->>'categoria'
    ) then
      raise exception 'item_not_owned_by_character' using errcode = '22023';
    end if;
    v_saved := public.update_character_sheet_payload(p_character_id, p_next_character);
    if p_moved_instance->>'categoria' = 'municao' then
      perform public.upsert_crew_inventory_munition(
        p_campaign_id, p_moved_instance->>'itemSlug', p_moved_instance
      );
    else
      insert into public.campaign_inventory_items
        (campaign_id, item_instance_id, item_name, item_slug, quantity, payload)
      values
        (p_campaign_id, p_moved_instance->>'id', p_moved_instance->>'itemNome',
         p_moved_instance->>'itemSlug', (p_moved_instance->>'quantidade')::integer,
         p_moved_instance);
    end if;
  end if;
  return jsonb_build_object('character', v_saved.payload);
end;
$$;

revoke all on function public.atomic_crew_item_transfer(uuid, uuid, text, jsonb, jsonb, jsonb, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.atomic_crew_item_transfer(uuid, uuid, text, jsonb, jsonb, jsonb, uuid, jsonb, jsonb) to authenticated;
