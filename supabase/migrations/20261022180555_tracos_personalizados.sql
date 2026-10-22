-- Aceita Qualidades e Complicações autorais na criação, sem publicar conteúdo global.
-- Cada escolha carrega título e descrição em detalhes, com custo de 1 ou 2 pontos.
do $migration$
declare
  definition text;
  quality_old text := $body$v_opcao := resolve_effective_content_payload(p_campaign_id, 'quality', v_entry->>'quality_id');$body$;
  quality_new text := $body$if v_entry->>'quality_id' ~ '^personalizado_[0-9a-f]{32}$' then
      if jsonb_typeof(v_entry->'detalhes'->'titulo') is distinct from 'string'
        or jsonb_typeof(v_entry->'detalhes'->'descricao') is distinct from 'string'
        or length(btrim(coalesce(v_entry->'detalhes'->>'titulo', ''))) not between 1 and 120
        or length(btrim(coalesce(v_entry->'detalhes'->>'descricao', ''))) not between 1 and 2000 then
        raise exception 'Qualidade personalizada exige título e descrição válidos.' using errcode = '22023';
      end if;
      v_opcao := '{"custos_permitidos":[1,2],"repetivel":false,"efeitos":[]}'::jsonb;
    else
      v_opcao := resolve_effective_content_payload(p_campaign_id, 'quality', v_entry->>'quality_id');
    end if;$body$;
  complication_old text := $body$v_opcao := resolve_effective_content_payload(p_campaign_id, 'complication', v_entry->>'complication_id');$body$;
  complication_new text := $body$if v_entry->>'complication_id' ~ '^personalizado_[0-9a-f]{32}$' then
      if jsonb_typeof(v_entry->'detalhes'->'titulo') is distinct from 'string'
        or jsonb_typeof(v_entry->'detalhes'->'descricao') is distinct from 'string'
        or length(btrim(coalesce(v_entry->'detalhes'->>'titulo', ''))) not between 1 and 120
        or length(btrim(coalesce(v_entry->'detalhes'->>'descricao', ''))) not between 1 and 2000 then
        raise exception 'Complicação personalizada exige título e descrição válidos.' using errcode = '22023';
      end if;
      v_opcao := '{"custos_permitidos":[1,2],"repetivel":false}'::jsonb;
    else
      v_opcao := resolve_effective_content_payload(p_campaign_id, 'complication', v_entry->>'complication_id');
    end if;$body$;
begin
  select pg_get_functiondef(oid) into definition
    from pg_proc where oid = 'public.complete_character_creation_v2(uuid,jsonb,text,text,uuid)'::regprocedure;
  if definition is null or position(quality_old in definition) = 0 or position(complication_old in definition) = 0 then
    raise exception 'Função de criação mudou; revisar antes de habilitar traços personalizados.';
  end if;
  execute replace(replace(definition, quality_old, quality_new), complication_old, complication_new);
end $migration$;
