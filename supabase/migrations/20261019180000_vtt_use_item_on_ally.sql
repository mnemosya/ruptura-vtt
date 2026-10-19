-- Usar item de farmácia num ALIADO pela mesa (janela de ação rápida do VTT).
--
-- O jogador não grava a ficha de outro personagem (update_character_sheet_payload
-- só aceita o controlador ou o narrador), e Server Action de domínio não usa a
-- service role. Então a regra do item roda AQUI, numa transação só: valida quem
-- controla o token, o alvo na mesma cena, o item no inventário, aplica o efeito
-- no alvo e consome o item + PA do usuário.
--
-- Escopo (espelha useItemOnAlly em lib/character/itemUse.ts):
--   · cura sem gatilho (pv/pe, "NdM", bônus) — limitada ao máximo derivado;
--   · remover_condicao — desativa UMA condição compatível ativa no alvo;
--   · cura com gatilho — não aplica, volta como lembrete;
--   · buff_temporario / estabilizar — recusado (continua pela ficha).
-- Fora do escopo do SQL: remoção automática de condição por cura e detecção
-- de colapso (applyGmHealing) — o narrador ajusta se preciso.
-- Dados: as faces vêm dos dados 3D da mesa (p_faces, na ordem das fórmulas);
-- o banco só confere cada face contra o dado. Sem faces, sorteia aqui.
-- Custo de PA: estatisticas.custo_pa numérico; sem custo nenhum = 1 PA; custo
-- em texto (tempo de uso) = sem PA. PA insuficiente é aviso, não bloqueio.

drop function if exists public.vtt_use_item_on_ally(uuid, uuid, text, text);

create or replace function public.vtt_use_item_on_ally(
  p_actor_token uuid,
  p_target_token uuid,
  p_instance_id text,
  p_faces int[] default null,
  p_condition_instance_id text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a vtt_tokens; t vtt_tokens;
  v_src characters; v_tgt characters;
  v_rules jsonb;
  v_inv jsonb; v_inst jsonb; v_idx int;
  v_item jsonb; v_efeitos jsonb; e jsonb;
  v_custo jsonb; v_pa int;
  v_cargas_max int; v_cargas int; v_qtd int; v_usos int; v_texto text;
  v_src_payload jsonb; v_tgt_payload jsonb;
  v_slugs text[] := '{}'; v_cond jsonb; v_cond_idx int; v_compat int := 0;
  v_removidas text[] := '{}'; v_lembretes text[] := '{}';
  v_mudancas jsonb := '[]'::jsonb;
  v_recurso text; v_dado text; v_m text[]; v_n int; v_lados int; v_rolado int; v_i int; v_fi int := 0; v_face int;
  v_max int; v_antes int; v_depois int; v_tem_remocao boolean := false; v_tem_cura boolean := false;
  v_pa_antes int; v_pa_max int;
  v_agora text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into a from vtt_tokens where id = p_actor_token;
  if a.id is null or a.character_id is null or not can_move_vtt_token(a.id)
     or (not a.visivel and not is_campaign_owner(a.campaign_id)) then
    raise exception 'Você não controla este personagem.' using errcode = '42501';
  end if;
  select * into t from vtt_tokens where id = p_target_token and scene_id = a.scene_id
    and campaign_id = a.campaign_id and (visivel or is_campaign_owner(campaign_id));
  if t.id is null then raise exception 'Alvo indisponível nesta cena.' using errcode = '42501'; end if;
  if t.character_id is null then raise exception 'Itens só podem ser usados em personagens.' using errcode = 'check_violation'; end if;
  if t.character_id = a.character_id then raise exception 'Para usar em si mesmo, desmarque o alvo.' using errcode = 'check_violation'; end if;

  -- Ordem fixa dos locks (menor id primeiro) evita deadlock entre dois usos cruzados.
  perform 1 from characters where id in (a.character_id, t.character_id) order by id for update;
  select * into v_src from characters where id = a.character_id and campaign_id = a.campaign_id and archived_at is null;
  select * into v_tgt from characters where id = t.character_id and campaign_id = a.campaign_id and archived_at is null;
  if v_src.id is null or v_tgt.id is null then
    raise exception 'O alvo não é um personagem ativo desta mesa.' using errcode = 'check_violation';
  end if;

  v_inv := coalesce(v_src.payload -> 'inventario', '[]'::jsonb);
  select x, (o - 1)::int into v_inst, v_idx from jsonb_array_elements(v_inv) with ordinality as z(x, o)
    where x ->> 'id' = p_instance_id;
  if v_inst is null then raise exception 'Item não está mais no inventário.' using errcode = 'check_violation'; end if;

  select payload into v_item from content_documents
    where content_type = 'item' and slug = v_inst ->> 'itemSlug' and status = 'published' limit 1;
  if v_item is null then raise exception 'Item não encontrado na Biblioteca.' using errcode = 'check_violation'; end if;
  v_efeitos := coalesce(v_item -> 'payload_automacao' -> 'efeitos', '[]'::jsonb);
  if jsonb_typeof(v_efeitos) <> 'array' then v_efeitos := '[]'::jsonb; end if;

  if not (v_item ->> 'categoria' = 'farmacia'
          or coalesce(v_item -> 'tags', '[]'::jsonb) ? 'cura'
          or exists (select 1 from jsonb_array_elements(v_efeitos) x where x ->> 'tipo' = 'cura')) then
    raise exception 'Só itens de farmácia podem ser usados em aliados.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(v_efeitos) x where x ->> 'tipo' in ('buff_temporario', 'estabilizar')) then
    raise exception 'Este item ainda não pode ser usado em aliado pela mesa. Use pela ficha.' using errcode = 'check_violation';
  end if;

  select select_rules.payload into v_rules from content_documents select_rules
    where content_type = 'character_rule' and slug = 'regras_personagem' and status = 'published' limit 1;
  v_rules := coalesce(v_rules, '{}'::jsonb);

  -- Estoque.
  v_qtd := coalesce((v_inst ->> 'quantidade')::int, 0);
  -- Usos vêm do texto do Notion ("Uso único." / "3 usos."), igual a usosDoItem em inventory.ts.
  v_texto := concat_ws(' ', v_item -> 'estatisticas' -> 'campos_tabela' ->> 'Efeito', v_item ->> 'descricao_curta');
  v_usos := case when v_texto ~* 'uso\s+único' then 1
                 when v_texto ~* '\d+\s+usos?\M' then (substring(v_texto from '(?i)(\d+)\s+usos?'))::int
                 when v_item ->> 'categoria' in ('explosivo', 'vertina') then 1 end;
  v_cargas_max := case when jsonb_typeof(v_item -> 'estatisticas' -> 'cargas_max') = 'number' then (v_item -> 'estatisticas' ->> 'cargas_max')::int
                       when v_usos > 1 then v_usos end;
  v_cargas := coalesce((v_inst ->> 'cargasAtual')::int, v_cargas_max);
  if (v_cargas_max is null and v_qtd <= 0) or (v_cargas_max is not null and coalesce(v_cargas, 0) <= 0) then
    raise exception 'Sem cargas/quantidade disponíveis para usar este item.' using errcode = 'check_violation';
  end if;

  -- Remoção de condição: resolvida contra o ALVO, antes de consumir.
  for e in select * from jsonb_array_elements(v_efeitos) loop
    if e ->> 'tipo' = 'remover_condicao' or e ? 'remover_condicao' then
      v_tem_remocao := true;
      if jsonb_typeof(e -> 'condicao') = 'string' then v_slugs := v_slugs || (e ->> 'condicao'); end if;
      if jsonb_typeof(e -> 'remover_condicao') = 'string' then v_slugs := v_slugs || (e ->> 'remover_condicao'); end if;
      if jsonb_typeof(e -> 'remover_condicao') = 'array' then v_slugs := v_slugs || array(select jsonb_array_elements_text(e -> 'remover_condicao')); end if;
      if jsonb_typeof(e -> 'condicoes_possiveis') = 'array' then v_slugs := v_slugs || array(select jsonb_array_elements_text(e -> 'condicoes_possiveis')); end if;
    elsif e ->> 'tipo' = 'cura' and jsonb_typeof(e -> 'gatilho') is distinct from 'string' then
      v_tem_cura := true;
    end if;
  end loop;

  v_tgt_payload := v_tgt.payload;
  if v_tem_remocao then
    select count(*) into v_compat from jsonb_array_elements(coalesce(v_tgt_payload -> 'condicoes_ativas', '[]'::jsonb)) c
      where (c ->> 'ativa')::boolean is true and c ->> 'conditionId' = any(v_slugs);
    if p_condition_instance_id is not null then
      select c, (o - 1)::int into v_cond, v_cond_idx from jsonb_array_elements(coalesce(v_tgt_payload -> 'condicoes_ativas', '[]'::jsonb)) with ordinality z(c, o)
        where c ->> 'id' = p_condition_instance_id and (c ->> 'ativa')::boolean is true and c ->> 'conditionId' = any(v_slugs);
      if v_cond is null then raise exception 'A condição escolhida não está mais ativa no alvo.' using errcode = 'check_violation'; end if;
    elsif v_compat = 1 then
      select c, (o - 1)::int into v_cond, v_cond_idx from jsonb_array_elements(coalesce(v_tgt_payload -> 'condicoes_ativas', '[]'::jsonb)) with ordinality z(c, o)
        where (c ->> 'ativa')::boolean is true and c ->> 'conditionId' = any(v_slugs) limit 1;
    elsif v_compat > 1 then
      raise exception 'O alvo tem mais de uma condição compatível. Use pela ficha para escolher qual remover.' using errcode = 'check_violation';
    elsif not v_tem_cura then
      raise exception 'Nenhuma condição compatível ativa no alvo (%). Item não consumido.', array_to_string(v_slugs, ', ') using errcode = 'check_violation';
    end if;
    if v_cond is not null then
      v_tgt_payload := jsonb_set(v_tgt_payload, array['condicoes_ativas', v_cond_idx::text],
        v_cond || jsonb_build_object('ativa', false, 'removidaEm', v_agora, 'removidaOrigem', 'item_use'));
      v_removidas := v_removidas || coalesce(v_cond ->> 'nome', v_cond ->> 'conditionId');
    end if;
  end if;

  -- Curas.
  for e in select * from jsonb_array_elements(v_efeitos) loop
    if e ->> 'tipo' <> 'cura' then continue; end if;
    if jsonb_typeof(e -> 'gatilho') = 'string' then
      v_lembretes := v_lembretes || format('%s: cura %s de %s vinculada ao gatilho "%s" — aplicar quando ocorrer.',
        v_item ->> 'nome', coalesce(e ->> 'dado', '?'), upper(coalesce(e ->> 'recurso', 'pv')), replace(e ->> 'gatilho', '_', ' '));
      continue;
    end if;
    v_recurso := e ->> 'recurso'; v_dado := e ->> 'dado';
    v_m := regexp_match(coalesce(v_dado, ''), '^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$', 'i');
    if v_recurso is null or v_recurso not in ('pv', 'pe') or v_m is null then
      v_lembretes := v_lembretes || format('%s: cura sem fórmula estruturada — aplicar manualmente.', v_item ->> 'nome');
      continue;
    end if;
    v_n := coalesce(nullif(v_m[1], '')::int, 1); v_lados := v_m[2]::int; v_rolado := 0;
    for v_i in 1 .. least(v_n, 100) loop
      if p_faces is null then
        v_face := 1 + floor(random() * v_lados)::int;
      else
        v_fi := v_fi + 1; v_face := p_faces[v_fi];
        if v_face is null or v_face < 1 or v_face > v_lados then
          raise exception 'Rolagem inválida para %.', v_dado using errcode = 'check_violation';
        end if;
      end if;
      v_rolado := v_rolado + v_face;
    end loop;
    if v_m[3] is not null then v_rolado := v_rolado + (case when v_m[3] = '-' then -1 else 1 end) * v_m[4]::int; end if;
    if jsonb_typeof(e -> 'bonus') = 'number' then v_rolado := v_rolado + (e ->> 'bonus')::int; end if;
    v_rolado := greatest(0, v_rolado);
    v_max := vtt_hud_derived(v_tgt_payload, v_rules, v_recurso || '_max');
    v_antes := coalesce((v_tgt_payload -> 'recursos_atuais' ->> v_recurso)::int, v_max);
    v_depois := least(greatest(0, v_max), v_antes + v_rolado);
    v_tgt_payload := jsonb_set(v_tgt_payload, '{recursos_atuais}',
      coalesce(v_tgt_payload -> 'recursos_atuais', '{}'::jsonb) || jsonb_build_object(v_recurso, v_depois));
    v_mudancas := v_mudancas || jsonb_build_object('recurso', v_recurso, 'dado', v_dado, 'rolado', v_rolado, 'antes', v_antes, 'depois', v_depois);
  end loop;

  -- Consumo no usuário (mesma regra de consumeItemCharge).
  if p_faces is not null and v_fi <> coalesce(array_length(p_faces, 1), 0) then
    raise exception 'A rolagem não confere com os dados do item.' using errcode = 'check_violation';
  end if;

  v_src_payload := v_src.payload;
  if v_usos is null then
    null; -- item sem usos não é gasto
  elsif v_cargas_max is null or v_cargas - 1 <= 0 then
    if v_qtd - 1 <= 0 then
      v_src_payload := jsonb_set(v_src_payload, '{inventario}', v_inv - v_idx);
    else
      v_src_payload := jsonb_set(v_src_payload, array['inventario', v_idx::text, 'quantidade'], to_jsonb(v_qtd - 1));
      if v_cargas_max is not null then
        v_src_payload := jsonb_set(v_src_payload, array['inventario', v_idx::text, 'cargasAtual'], to_jsonb(v_cargas_max));
      end if;
    end if;
  else
    v_src_payload := jsonb_set(v_src_payload, array['inventario', v_idx::text, 'cargasAtual'], to_jsonb(v_cargas - 1));
  end if;

  v_custo := v_item -> 'estatisticas' -> 'custo_pa';
  v_pa := case when jsonb_typeof(v_custo) = 'number' then (v_custo #>> '{}')::numeric::int
               when v_custo is null or jsonb_typeof(v_custo) = 'null' then 1 end;
  v_pa_max := vtt_hud_derived(v_src_payload, v_rules, 'pa_max');
  v_pa_antes := greatest(0, coalesce(v_pa_max, 0) - coalesce((v_src_payload -> 'estado_jogo' ->> 'pa_gastos')::int, 0));
  if v_pa is not null then
    if v_pa > v_pa_antes then
      v_lembretes := v_lembretes || format('PA insuficiente (atual: %s, necessário: %s).', v_pa_antes, v_pa);
    end if;
    v_src_payload := jsonb_set(v_src_payload, '{estado_jogo}',
      coalesce(v_src_payload -> 'estado_jogo', '{}'::jsonb)
      || jsonb_build_object('pa_gastos', coalesce((v_src_payload -> 'estado_jogo' ->> 'pa_gastos')::int, 0) + v_pa));
  end if;

  update characters set payload = v_tgt_payload where id = v_tgt.id;
  update characters set payload = v_src_payload where id = v_src.id returning * into v_src;

  return jsonb_build_object(
    'source', to_jsonb(v_src),
    'alvoNome', coalesce(v_tgt.name, t.nome),
    'alvoCharacterId', v_tgt.id,
    'itemNome', v_item ->> 'nome',
    'paCusto', v_pa, 'paAntes', v_pa_antes, 'paDepois', case when v_pa is null then v_pa_antes else v_pa_antes - v_pa end,
    'quantidadeAntes', v_qtd,
    'quantidadeDepois', coalesce((select (x ->> 'quantidade')::int from jsonb_array_elements(v_src_payload -> 'inventario') x where x ->> 'id' = p_instance_id), 0),
    'consumido', v_usos is not null,
    'mudancas', v_mudancas,
    'removidas', to_jsonb(v_removidas),
    'lembretes', to_jsonb(v_lembretes));
end;
$$;

revoke all on function public.vtt_use_item_on_ally(uuid, uuid, text, int[], text) from public, anon;
grant execute on function public.vtt_use_item_on_ally(uuid, uuid, text, int[], text) to authenticated;
