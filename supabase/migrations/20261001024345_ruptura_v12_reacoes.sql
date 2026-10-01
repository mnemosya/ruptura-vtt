-- RUPTURA v1.2 — Reações por rodada = Mente + 1.
--
-- O HUD normalmente lê a fórmula do documento character_rule
-- publicado. Esta função também possui fallbacks para quando esse
-- documento está ausente ou incompleto; o fallback precisa obedecer à
-- mesma regra para não produzir uma ficha diferente no mapa.

create or replace function public.vtt_hud_derived(
  p_character jsonb,
  p_rules jsonb,
  p_id text
) returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_formula jsonb;
  v_value numeric;
begin
  select item -> 'formula' into v_formula
  from jsonb_array_elements(coalesce(p_rules -> 'derivados', '[]'::jsonb)) item
  where item ->> 'id' = p_id
  limit 1;

  if v_formula is null then
    v_formula := case p_id
      when 'pv_max' then '{"op":"+","args":[{"const":10},{"ref":"atributo","id":"corpo"}]}'::jsonb
      when 'pe_max' then '{"op":"+","args":[{"const":10},{"ref":"atributo","id":"mente"}]}'::jsonb
      when 'mana_max' then '{"op":"+","args":[{"const":10},{"op":"*","args":[{"ref":"atributo","id":"animo"},{"const":2}]}]}'::jsonb
      when 'pa_max' then '{"const":3}'::jsonb
      when 'reacoes_por_rodada' then '{"op":"+","args":[{"ref":"atributo","id":"mente"},{"const":1}]}'::jsonb
      else '{"const":0}'::jsonb
    end;
  end if;

  v_value := public.vtt_hud_eval_formula(v_formula, p_character, p_rules, array[p_id]);
  if p_id = 'mana_max' then
    v_value := v_value + coalesce((p_character ->> 'mana_bonus_ruptura')::numeric, 0);
  end if;
  return trunc(v_value)::integer;
end;
$$;

revoke all on function public.vtt_hud_derived(jsonb, jsonb, text) from public, anon, authenticated;
