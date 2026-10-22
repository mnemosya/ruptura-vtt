-- Permite um Antecedente autoral por personagem sem criar conteúdo publicado global.
-- Mantém a validação do catálogo para todos os outros slugs.
do $migration$
declare
  definition text;
  antigo text := $body$if resolve_effective_content_payload(p_campaign_id, 'background', v_traj->'antecedente'->>'antecedente_id') is null then
    raise exception 'Antecedente inexistente ou não publicado: "%".', v_traj->'antecedente'->>'antecedente_id' using errcode = 'no_data_found';
  end if;$body$;
  novo text := $body$if v_traj->'antecedente'->>'antecedente_id' = 'personalizado' then
    if length(btrim(coalesce(v_traj->'antecedente'->>'titulo', ''))) not between 1 and 120
      or length(btrim(coalesce(v_traj->'antecedente'->>'descricao', ''))) not between 1 and 2000
      or length(btrim(coalesce(v_traj->'antecedente'->>'familiaridade', ''))) not between 1 and 2000 then
      raise exception 'Antecedente personalizado exige título, descrição e familiaridade válidos.' using errcode = '22023';
    end if;
  elsif resolve_effective_content_payload(p_campaign_id, 'background', v_traj->'antecedente'->>'antecedente_id') is null then
    raise exception 'Antecedente inexistente ou não publicado: "%".', v_traj->'antecedente'->>'antecedente_id' using errcode = 'no_data_found';
  end if;$body$;
begin
  select pg_get_functiondef(oid) into definition
    from pg_proc where oid = 'public.complete_character_creation_v2(uuid,jsonb,text,text,uuid)'::regprocedure;
  if definition is null or position(antigo in definition) = 0 then
    raise exception 'Função de criação mudou; revisar antes de habilitar Antecedente personalizado.';
  end if;
  execute replace(definition, antigo, novo);
end $migration$;
