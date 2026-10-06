-- Avanço de Ranking para personagem sem campanha.
--
-- A Forja deixa escolher o rank inicial também na criação sem campanha:
-- o personagem nasce no F e sobe até o rank escolhido pela mesma função
-- de avanço da ficha. Esta versão aceita o personagem solto quando quem
-- chama é o dono; a validação é a mesma, contra o conteúdo oficial.

begin;

create or replace function public.advance_character_ranking_v2(
  p_character_id uuid,
  p_payload jsonb
) returns characters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_char characters;
  v_old jsonb;
  v_new jsonb := p_payload;
  v_rankings text[] := array['F','E','D','C','B','A','S','S+'];
  v_vertentes text[] := array['biotica','cinetica','cognitiva','energetica','material','sinaptica'];
  v_de text;
  v_para text;
  v_idx int;
  v_classe jsonb;
  v_av jsonb;
  v_sub jsonb;
  v_regras jsonb;
  v_key text;
  v_delta int;
  v_soma int;
  v_novo int;
  v_old_pend jsonb;
  v_new_pend jsonb;
  v_volateis text[] := array['ranking','subclasse_id','escolhas_por_ranking','formulas_derivados','formulas_derivados_texto'];
  v_result characters;
begin
  select * into v_char from characters where id = p_character_id for update;
  if not found then
    raise exception 'Personagem não encontrado.' using errcode = 'no_data_found';
  end if;
  -- Sem campanha (05/10/2026): o dono do personagem solto avança o rank
  -- dele; o conteúdo vem do oficial (resolve_effective_content_payload
  -- com campanha nula). Com campanha, nada muda.
  if not (
    (v_char.campaign_id is null and v_char.owner_id = v_uid)
    or (v_char.campaign_id is not null and (
      is_character_controller_for(p_character_id, v_char.campaign_id, v_uid)
      or is_campaign_owner(v_char.campaign_id, v_uid)
    ))
  ) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  v_old := v_char.payload;
  if (v_old->>'schema_version') is distinct from '2' or (v_new->>'schema_version') is distinct from '2' then
    raise exception 'O avanço de Ranking v1.2 só se aplica a personagens v1.2.' using errcode = '22023';
  end if;
  if (v_new->'progressao'->>'classe_id') is distinct from (v_old->'progressao'->>'classe_id') then
    raise exception 'O avanço não pode trocar a Classe.' using errcode = '22023';
  end if;

  -- Ranking: exatamente o seguinte ao persistido.
  v_de := v_old->'progressao'->>'ranking';
  v_idx := array_position(v_rankings, v_de);
  if v_idx is null or v_idx = array_length(v_rankings, 1) then
    raise exception 'O Ranking % não tem avanço regular.', coalesce(v_de, '?') using errcode = '22023';
  end if;
  v_para := v_rankings[v_idx + 1];
  if (v_new->'progressao'->>'ranking') is distinct from v_para then
    raise exception 'O personagem está no Ranking %; o avanço deve levá-lo ao %.', v_de, v_para using errcode = '22023';
  end if;

  v_classe := resolve_effective_content_payload(v_char.campaign_id, 'class', v_old->'progressao'->>'classe_id');
  if v_classe is null then
    raise exception 'Classe "%" não está publicada.', v_old->'progressao'->>'classe_id' using errcode = 'no_data_found';
  end if;
  v_av := v_classe->'progressao'->v_para;
  if v_av is null then
    raise exception 'A Classe não define o Ranking %.', v_para using errcode = 'no_data_found';
  end if;

  -- Progressão: só os campos do avanço mudam.
  if ((v_new->'progressao') - v_volateis) is distinct from ((v_old->'progressao') - v_volateis) then
    raise exception 'O avanço alterou campos de progressão que não pertencem a ele.' using errcode = '22023';
  end if;
  if (coalesce(v_new->'progressao'->'escolhas_por_ranking', '{}') - v_para)
     is distinct from coalesce(v_old->'progressao'->'escolhas_por_ranking', '{}') then
    raise exception 'O avanço alterou escolhas de Rankings anteriores.' using errcode = '22023';
  end if;
  if (coalesce(v_new->'progressao'->'formulas_derivados', '{}') - 'pa_max')
     is distinct from (coalesce(v_old->'progressao'->'formulas_derivados', '{}') - 'pa_max')
     or (coalesce(v_new->'progressao'->'formulas_derivados_texto', '{}') - 'pa_max')
     is distinct from (coalesce(v_old->'progressao'->'formulas_derivados_texto', '{}') - 'pa_max') then
    raise exception 'O avanço alterou fórmulas de recurso da Classe.' using errcode = '22023';
  end if;
  if (v_new->'progressao'->'formulas_derivados'->'pa_max') is distinct from jsonb_build_object('const', (v_av->>'pa')::int) then
    raise exception 'PA do Ranking % deve ser %.', v_para, v_av->>'pa' using errcode = '22023';
  end if;

  -- Subclasse.
  if coalesce((v_av->>'escolhe_subclasse')::boolean, false) then
    v_sub := resolve_effective_content_payload(v_char.campaign_id, 'subclass', v_new->'progressao'->>'subclasse_id');
    if v_sub is null
       or not (v_classe->'subclasses') ? (v_new->'progressao'->>'subclasse_id')
       or (v_sub->>'classe_slug') is distinct from (v_classe->>'slug') then
      raise exception 'O Ranking % exige uma Subclasse publicada da Classe.', v_para using errcode = '22023';
    end if;
  elsif (v_new->'progressao'->'subclasse_id') is distinct from (v_old->'progressao'->'subclasse_id') then
    raise exception 'A Subclasse só é escolhida no Ranking E.' using errcode = '22023';
  end if;

  -- Atributos.
  v_soma := 0;
  foreach v_key in array array['corpo','mente','animo'] loop
    v_novo := (v_new->'atributos'->>v_key)::int;
    v_delta := v_novo - (v_old->'atributos'->>v_key)::int;
    if v_delta is null or v_delta < 0 or v_novo > 5 then
      raise exception 'Atributo "%" inválido no avanço.', v_key using errcode = '22023';
    end if;
    v_soma := v_soma + v_delta;
  end loop;
  if v_soma <> coalesce((v_av->>'pontos_atributo')::int, 0) then
    raise exception 'O Ranking % concede % ponto(s) de Atributo; recebido %.', v_para, coalesce(v_av->>'pontos_atributo', '0'), v_soma using errcode = '22023';
  end if;

  -- Perícias.
  v_regras := resolve_effective_content_payload(v_char.campaign_id, 'character_rule', 'regras_personagem');
  v_soma := 0;
  for v_key in
    select k from jsonb_object_keys(coalesce(v_new->'pericias', '{}')) k
    union select k from jsonb_object_keys(coalesce(v_old->'pericias', '{}')) k
  loop
    v_novo := coalesce((v_new->'pericias'->>v_key)::int, 0);
    v_delta := v_novo - coalesce((v_old->'pericias'->>v_key)::int, 0);
    if v_delta < 0 then
      raise exception 'O avanço não pode reduzir a Perícia "%".', v_key using errcode = '22023';
    end if;
    if v_delta > 0 then
      if not exists (select 1 from jsonb_array_elements(v_regras->'pericias') p where p->>'id' = v_key) then
        raise exception 'Perícia desconhecida: "%".', v_key using errcode = '22023';
      end if;
      if v_novo > (v_av->>'limite_pericia')::int then
        raise exception 'Perícia "%" ficaria em %, acima do limite % do Ranking %.', v_key, v_novo, v_av->>'limite_pericia', v_para using errcode = '22023';
      end if;
    end if;
    v_soma := v_soma + v_delta;
  end loop;
  if v_soma <> coalesce((v_av->>'pontos_pericia')::int, 0) then
    raise exception 'O Ranking % concede % ponto(s) de Perícia; recebido %.', v_para, coalesce(v_av->>'pontos_pericia', '0'), v_soma using errcode = '22023';
  end if;

  -- Vertentes.
  v_soma := 0;
  for v_key in
    select k from jsonb_object_keys(coalesce(v_new->'magia'->'niveis_vertente', '{}')) k
    union select k from jsonb_object_keys(coalesce(v_old->'magia'->'niveis_vertente', '{}')) k
  loop
    v_novo := coalesce((v_new->'magia'->'niveis_vertente'->>v_key)::int, 0);
    v_delta := v_novo - coalesce((v_old->'magia'->'niveis_vertente'->>v_key)::int, 0);
    if v_delta < 0 or v_novo > 5 or (v_delta > 0 and not v_key = any(v_vertentes)) then
      raise exception 'Vertente "%" inválida no avanço.', v_key using errcode = '22023';
    end if;
    v_soma := v_soma + v_delta;
  end loop;
  if v_soma <> coalesce((v_av->>'pontos_vertente')::int, 0) then
    raise exception 'O Ranking % concede % ponto(s) de Vertente; recebido %.', v_para, coalesce(v_av->>'pontos_vertente', '0'), v_soma using errcode = '22023';
  end if;

  -- Magias pendentes: as antigas intactas, mais uma por ponto de Vertente e magia adicional.
  v_old_pend := coalesce(v_old->'magia'->'escolhas_pendentes', '[]');
  v_new_pend := coalesce(v_new->'magia'->'escolhas_pendentes', '[]');
  if jsonb_array_length(v_new_pend) <> jsonb_array_length(v_old_pend)
       + coalesce((v_av->>'pontos_vertente')::int, 0) + coalesce((v_av->>'magias_adicionais')::int, 0)
     or exists (
       select 1 from jsonb_array_elements(v_old_pend) with ordinality o(e, i)
       where o.e is distinct from v_new_pend->(o.i::int - 1)
     ) then
    raise exception 'Magias pendentes do avanço não conferem com o Ranking %.', v_para using errcode = '22023';
  end if;

  -- Grava só a progressão sobre o payload persistido.
  v_old := jsonb_set(v_old, '{progressao}', v_new->'progressao');
  v_old := jsonb_set(v_old, '{atributos}', v_new->'atributos');
  v_old := jsonb_set(v_old, '{pericias}', coalesce(v_new->'pericias', '{}'));
  v_old := jsonb_set(v_old, '{magia,niveis_vertente}', v_new->'magia'->'niveis_vertente');
  v_old := jsonb_set(v_old, '{magia,escolhas_pendentes}', v_new_pend);
  v_old := jsonb_set(v_old, '{niveis_vertente}', v_new->'magia'->'niveis_vertente');

  update characters set payload = v_old, updated_at = now()
   where id = p_character_id
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.advance_character_ranking_v2(uuid, jsonb) from public, anon;
revoke all on function public.advance_character_ranking_v2(uuid, jsonb) from public, anon;
grant execute on function public.advance_character_ranking_v2(uuid, jsonb) to authenticated;

commit;
