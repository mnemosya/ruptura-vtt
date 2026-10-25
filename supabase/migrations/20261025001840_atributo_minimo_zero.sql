-- Atributo de personagem v1.2 vai de 0 a 5: os perfis de Atributos da
-- criação já trazem 0 (ex.: 3/1/0, 2/2/0) e a progressão só soma. A
-- validação exigia 1–5 e travava a gravação de qualquer ficha com um
-- Atributo em 0. Só o mínimo muda; o resto da função é o que estava valendo.
CREATE OR REPLACE FUNCTION public.update_character_sheet_payload(p_character_id uuid, p_payload jsonb)
 RETURNS characters
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_campaign_id uuid;
  v_result characters;
  v_existing jsonb;
  v_existing_tipo jsonb;
  v_final_payload jsonb;
  v_campo text;
  v_limite int;
  v_regras jsonb;
  v_valor int;
begin
  select campaign_id, payload into v_campaign_id, v_existing from characters where id = p_character_id;
  if v_campaign_id is null then
    raise exception 'character has no campaign; use narrator update path' using errcode = 'check_violation';
  end if;
  -- Narrador da campanha OU jogador controlador. Sem o primeiro, o
  -- Console do Personagem não conseguia gravar nada como narrador.
  if not (
    is_character_controller_for(p_character_id, v_campaign_id, auth.uid())
    or is_campaign_owner(v_campaign_id, auth.uid())
  ) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  v_final_payload := p_payload;

  if not is_campaign_owner(v_campaign_id, auth.uid()) then
    -- Quem chama é o jogador controlador (única outra possibilidade
    -- autorizada acima): tipo_personagem é metadado administrativo do
    -- narrador, não pode ser criado, alterado ou removido por um
    -- payload completo enviado pelo jogador — reescrito de volta ao
    -- valor já persistido, incondicionalmente.
    v_existing_tipo := v_existing->'metadados'->'tipo_personagem';

    -- jsonb_set com caminho aninhado ("{metadados,tipo_personagem}") NÃO
    -- cria o objeto intermediário "metadados" quando ele está ausente do
    -- payload enviado — só cria o último nível do caminho. Por isso o
    -- objeto "metadados" é garantido primeiro, incondicionalmente.
    v_final_payload := jsonb_set(
      v_final_payload,
      '{metadados}',
      coalesce(v_final_payload->'metadados', '{}'::jsonb)
    );

    if v_existing_tipo is null then
      v_final_payload := jsonb_set(
        v_final_payload,
        '{metadados}',
        (v_final_payload->'metadados') - 'tipo_personagem'
      );
    else
      v_final_payload := jsonb_set(
        v_final_payload,
        '{metadados,tipo_personagem}',
        v_existing_tipo,
        true
      );
    end if;

    -- RUPTURA v1.2: a progressão só muda por advance_character_ranking_v2.
    -- Os campos voltam ao valor persistido; um payload v1 não rebaixa o
    -- personagem. Atributos e Perícias ficam editáveis pelo jogador (Modo
    -- Evolução, para corrigir a criação), dentro dos limites conferidos abaixo.
    if (v_existing->>'schema_version') = '2' then
      foreach v_campo in array array['schema_version','ruleset_version','progressao','trajetoria','niveis_vertente','criacao_pendente'] loop
        if v_existing ? v_campo then
          v_final_payload := jsonb_set(v_final_payload, array[v_campo], v_existing->v_campo);
        else
          v_final_payload := v_final_payload - v_campo;
        end if;
      end loop;
      v_final_payload := jsonb_set(v_final_payload, '{magia}', coalesce(v_final_payload->'magia', '{}'::jsonb));
      foreach v_campo in array array['vertente_primaria','niveis_vertente','escolhas_pendentes'] loop
        if (v_existing->'magia') ? v_campo then
          v_final_payload := jsonb_set(v_final_payload, array['magia', v_campo], v_existing->'magia'->v_campo);
        else
          v_final_payload := jsonb_set(v_final_payload, '{magia}', (v_final_payload->'magia') - v_campo);
        end if;
      end loop;
    end if;
  end if;

  -- Limites de Atributos e Perícias de personagens v1.2 (vale também para o
  -- narrador): Atributo 0–5; Perícia 0 até o limite do Ranking na Classe.
  -- Personagem pendente (só o nome) ainda não tem Atributos: a conclusão valida tudo.
  if (v_existing->>'schema_version') = '2' and coalesce((v_existing->>'criacao_pendente')::boolean, false) is not true then
    foreach v_campo in array array['corpo','mente','animo'] loop
      v_valor := (v_final_payload->'atributos'->>v_campo)::int;
      if v_valor is null or v_valor < 0 or v_valor > 5 then
        raise exception 'Atributo "%" deve ficar entre 0 e 5.', v_campo using errcode = '22023';
      end if;
    end loop;
    v_limite := coalesce((resolve_effective_content_payload(
      v_campaign_id, 'class', v_existing->'progressao'->>'classe_id'
    )->'progressao'->(v_existing->'progressao'->>'ranking')->>'limite_pericia')::int, 5);
    v_regras := resolve_effective_content_payload(v_campaign_id, 'character_rule', 'regras_personagem');
    for v_campo in select k from jsonb_object_keys(coalesce(v_final_payload->'pericias', '{}')) k loop
      v_valor := (v_final_payload->'pericias'->>v_campo)::int;
      if v_valor is null or v_valor < 0 or v_valor > v_limite then
        raise exception 'Perícia "%" deve ficar entre 0 e % no Ranking atual.', v_campo, v_limite using errcode = '22023';
      end if;
      if v_regras is not null and not exists (select 1 from jsonb_array_elements(v_regras->'pericias') p where p->>'id' = v_campo) then
        raise exception 'Perícia desconhecida: "%".', v_campo using errcode = '22023';
      end if;
    end loop;
  end if;

  update characters
     set payload = v_final_payload,
         updated_at = now()
   where id = p_character_id
  returning * into v_result;
  return v_result;
end;
$function$;
