-- RUPTURA v1.2 — personagem criado só com o nome e completado depois.
--
-- Decisão de 01/10/2026: o "+ Personagem" (narrador e jogador, inclusive PN)
-- cria um personagem v1.2 incompleto (`criacao_pendente: true`, só o nome),
-- que depois é completado pelo assistente sem perder id, controladores,
-- tokens e pasta.
--
-- 1. create_pending_character_v2: cria o personagem pendente. Narrador cria
--    jogador ou PN; jogador cria só para si e recebe o controle.
-- 2. complete_character_creation_v2 ganha `p_character_id`: com ele, faz as
--    mesmas validações da criação e ATUALIZA o personagem pendente em vez de
--    inserir outro. Sem ele, comportamento idêntico ao anterior.

create or replace function public.create_pending_character_v2(
  p_campaign_id uuid,
  p_nome text,
  p_pn boolean default false
) returns characters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_narrador boolean;
  v_meta jsonb := jsonb_build_object('schema_version', 1);
  v_new characters;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado.' using errcode = 'insufficient_privilege';
  end if;
  if not is_campaign_member(p_campaign_id, v_uid) then
    raise exception 'Você não é participante ativo desta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Dê um nome ao personagem.' using errcode = '22023';
  end if;
  v_narrador := is_campaign_owner(p_campaign_id, v_uid);
  if p_pn and not v_narrador then
    raise exception 'Só o narrador cria PN.' using errcode = '42501';
  end if;
  if p_pn then
    v_meta := v_meta || jsonb_build_object('tipo_personagem', 'pn');
  end if;

  insert into characters (name, status, payload, campaign_id, owner_id)
  values (
    trim(p_nome), 'draft',
    jsonb_build_object('schema_version', 2, 'ruleset_version', '1.2', 'nome', trim(p_nome), 'criacao_pendente', true, 'metadados', v_meta),
    p_campaign_id, v_uid
  )
  returning * into v_new;

  if not v_narrador then
    insert into character_controllers (character_id, campaign_id, user_id, granted_by)
    values (v_new.id, p_campaign_id, v_uid, v_uid)
    on conflict (character_id, user_id) do nothing;
  end if;
  return v_new;
end;
$$;

revoke all on function public.create_pending_character_v2(uuid, text, boolean) from public, anon;
grant execute on function public.create_pending_character_v2(uuid, text, boolean) to authenticated;

drop function if exists public.complete_character_creation_v2(uuid, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.complete_character_creation_v2(p_campaign_id uuid, p_character_payload jsonb, p_owner_label text DEFAULT NULL::text, p_creation_request_id text DEFAULT NULL::text, p_character_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing characters%rowtype;
  v_new characters%rowtype;
  v_pendente characters%rowtype;
  p jsonb := p_character_payload;

  v_classe_slug text;
  v_classe jsonb;
  v_criacao jsonb;
  v_regras jsonb;
  v_escolhas jsonb;
  v_perfil jsonb;

  v_attrs numeric[];
  v_perfil_vals numeric[];
  v_attr text;

  v_catalogo text[];
  v_skill text;
  v_valor numeric;
  v_qtd_1 int := 0;
  v_qtd_2 int := 0;
  v_qtd_3 int := 0;

  v_vertente text;
  v_permitidas text[];
  v_recurso text;
  v_formula jsonb;
  v_esperado numeric;
  v_formulas_esperadas jsonb := '{}'::jsonb;
  v_textos_esperados jsonb := '{}'::jsonb;
  v_mapa jsonb := '{"pv":"pv_max","pe":"pe_max","mana":"mana_max","integridade":"integridade_max","reacoes":"reacoes_por_rodada","andar":"andar_m","correr":"correr_m"}'::jsonb;
  v_derivado text;

  v_traj jsonb;
  v_entry jsonb;
  v_soma int;
  v_opcao jsonb;

  v_item jsonb;
  v_item_payload jsonb;
  v_quantidade numeric;
  v_preco numeric;
  v_gasto numeric := 0;
  v_aretz numeric;
  v_carteira jsonb;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para concluir a criação do personagem.' using errcode = 'insufficient_privilege';
  end if;
  if not is_campaign_member(p_campaign_id, v_uid) then
    raise exception 'Você não é participante ativo desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  -- Completar um personagem criado só com o nome (criacao_pendente).
  if p_character_id is not null then
    select * into v_pendente from characters where id = p_character_id for update;
    if not found or v_pendente.campaign_id is distinct from p_campaign_id or v_pendente.archived_at is not null then
      raise exception 'Personagem a completar não encontrado nesta campanha.' using errcode = 'no_data_found';
    end if;
    if coalesce((v_pendente.payload->>'criacao_pendente')::boolean, false) is not true then
      raise exception 'Este personagem já foi criado; use o avanço de Ranking ou o Ajustar.' using errcode = '22023';
    end if;
    if not (
      v_pendente.owner_id = v_uid
      or is_campaign_owner(p_campaign_id, v_uid)
      or is_character_controller_for(p_character_id, p_campaign_id, v_uid)
    ) then
      raise exception 'insufficient_privilege' using errcode = '42501';
    end if;
  end if;

  if p_creation_request_id is not null then
    select * into v_existing
      from characters
      where campaign_id = p_campaign_id
        and owner_id = v_uid
        and archived_at is null
        and payload->'metadados'->>'creationRequestId' = p_creation_request_id
      limit 1;
    if found then
      delete from character_creation_drafts where campaign_id = p_campaign_id and owner_id = v_uid;
      return jsonb_build_object('character', to_jsonb(v_existing), 'idempotentReplay', true);
    end if;
  end if;

  -- Envelope e progressão.
  if jsonb_typeof(p) <> 'object' then
    raise exception 'Payload de personagem inválido.' using errcode = '22023';
  end if;
  if (p->>'schema_version') is distinct from '2' or (p->>'ruleset_version') is distinct from '1.2' then
    raise exception 'A criação v1.2 exige schema_version 2 e ruleset_version "1.2".' using errcode = '22023';
  end if;
  if coalesce(trim(p->>'nome'), '') = '' then
    raise exception 'Nome do personagem é obrigatório.' using errcode = '22023';
  end if;
  if (p->'progressao'->>'ranking') is distinct from 'F' then
    raise exception 'Personagem novo começa no Ranking F.' using errcode = '22023';
  end if;
  if p->'progressao' ? 'subclasse_id' then
    raise exception 'Ranking F ainda não escolheu Subclasse.' using errcode = '22023';
  end if;

  v_classe_slug := p->'progressao'->>'classe_id';
  v_classe := resolve_effective_content_payload(p_campaign_id, 'class', v_classe_slug);
  if v_classe is null then
    raise exception 'Classe inexistente, arquivada ou não publicada: "%".', v_classe_slug using errcode = 'no_data_found';
  end if;
  v_criacao := v_classe->'criacao';
  v_escolhas := p->'progressao'->'escolhas_por_ranking'->'F';

  -- Atributos: permutação de um perfil da Classe.
  select elem into v_perfil
    from jsonb_array_elements(v_criacao->'perfis_atributos') elem
    where elem->>'slug' = v_escolhas->>'perfil_atributos';
  if v_perfil is null then
    raise exception 'Perfil de Atributos inexistente na Classe: "%".', v_escolhas->>'perfil_atributos' using errcode = '22023';
  end if;
  foreach v_attr in array array['corpo', 'mente', 'animo'] loop
    if jsonb_typeof(p->'atributos'->v_attr) <> 'number' then
      raise exception 'Atributo "%" ausente ou inválido.', v_attr using errcode = '22023';
    end if;
  end loop;
  select array_agg(v order by v) into v_attrs
    from (values ((p->'atributos'->>'corpo')::numeric), ((p->'atributos'->>'mente')::numeric), ((p->'atributos'->>'animo')::numeric)) t(v);
  select array_agg(v::numeric order by v::numeric) into v_perfil_vals from jsonb_array_elements_text(v_perfil->'valores') v;
  if v_attrs is distinct from v_perfil_vals then
    raise exception 'Atributos não correspondem ao perfil "%".', v_perfil->>'nome' using errcode = 'insufficient_privilege';
  end if;

  -- Perícias.
  v_regras := resolve_effective_content_payload(p_campaign_id, 'character_rule', 'regras_personagem');
  select array_agg(elem->>'id') into v_catalogo from jsonb_array_elements(coalesce(v_regras->'pericias', '[]'::jsonb)) elem;
  select elem into v_perfil
    from jsonb_array_elements(v_criacao->'perfis_pericias') elem
    where elem->>'slug' = v_escolhas->>'perfil_pericias';
  if v_perfil is null then
    raise exception 'Perfil de Perícias inexistente na Classe: "%".', v_escolhas->>'perfil_pericias' using errcode = '22023';
  end if;
  if jsonb_typeof(p->'pericias') <> 'object' then
    raise exception 'Perícias com formato inválido.' using errcode = '22023';
  end if;
  for v_skill, v_valor in select key, value::numeric from jsonb_each_text(p->'pericias') loop
    if not (v_skill = any(v_catalogo)) then
      raise exception 'Perícia desconhecida: "%".', v_skill using errcode = 'no_data_found';
    end if;
    if v_valor not in (0, 1, 2, 3) then
      raise exception 'Perícia "%" com valor inválido na criação: %.', v_skill, v_valor using errcode = '22023';
    end if;
    if v_valor = 3 then
      v_qtd_3 := v_qtd_3 + 1;
      if not exists (select 1 from jsonb_array_elements_text(v_criacao->'pericias_valor_3') s where s = v_skill) then
        raise exception 'Perícia "%" não está entre as opções de valor 3 da Classe.', v_skill using errcode = 'insufficient_privilege';
      end if;
    elsif v_valor = 2 then
      v_qtd_2 := v_qtd_2 + 1;
      if not exists (select 1 from jsonb_array_elements_text(v_criacao->'pericias_valor_2') s where s = v_skill) then
        raise exception 'Perícia "%" não está entre as opções de valor 2 da Classe.', v_skill using errcode = 'insufficient_privilege';
      end if;
    elsif v_valor = 1 then
      v_qtd_1 := v_qtd_1 + 1;
      if jsonb_typeof(v_criacao->'pericias_valor_1') = 'array'
         and not exists (select 1 from jsonb_array_elements_text(v_criacao->'pericias_valor_1') s where s = v_skill) then
        raise exception 'Perícia "%" não está entre as opções de valor 1 da Classe.', v_skill using errcode = 'insufficient_privilege';
      end if;
    end if;
  end loop;
  if v_qtd_3 <> (v_perfil->'quantidades'->>'valor_3')::int
     or v_qtd_2 <> (v_perfil->'quantidades'->>'valor_2')::int
     or v_qtd_1 <> (v_perfil->'quantidades'->>'valor_1')::int then
    raise exception 'Perícias não correspondem ao perfil "%" (recebido %/%/% nos valores 3/2/1).', v_perfil->>'nome', v_qtd_3, v_qtd_2, v_qtd_1
      using errcode = 'insufficient_privilege';
  end if;

  -- Vertente Primária: nível 1 e nenhum outro investimento; sem magias por enquanto.
  v_vertente := p->'magia'->>'vertente_primaria';
  if jsonb_typeof(v_criacao->'vertentes_primarias') = 'array' then
    select array_agg(v) into v_permitidas from jsonb_array_elements_text(v_criacao->'vertentes_primarias') v;
  else
    v_permitidas := array['biotica', 'cinetica', 'cognitiva', 'energetica', 'material', 'sinaptica'];
  end if;
  if v_vertente is null or not (v_vertente = any(v_permitidas)) then
    raise exception 'Vertente Primária não permitida: "%".', v_vertente using errcode = 'insufficient_privilege';
  end if;
  if p->'magia'->'niveis_vertente' is distinct from jsonb_build_object(v_vertente, 1)
     or coalesce(p->'niveis_vertente', 'null'::jsonb) is distinct from jsonb_build_object(v_vertente, 1) then
    raise exception 'Na criação, apenas a Vertente Primária recebe 1 ponto.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_array_length(p->'magia'->'magias_aprendidas'), 0) <> 0
     or coalesce(jsonb_array_length(p->'magias_aprendidas'), 0) <> 0 then
    raise exception 'Magias iniciais da v1.2 ainda não estão disponíveis na criação.' using errcode = 'feature_not_supported';
  end if;
  if coalesce(jsonb_array_length(p->'talentos_adquiridos'), 0) <> 0 then
    raise exception 'Talentos não fazem parte da criação v1.2.' using errcode = 'insufficient_privilege';
  end if;

  -- Recursos atuais = fórmulas da Classe.
  foreach v_recurso in array array['pv', 'pe', 'mana', 'integridade'] loop
    v_formula := v_criacao->'recursos'->v_recurso;
    if v_formula is null then
      raise exception 'Classe sem fórmula de recurso "%".', v_recurso using errcode = 'no_data_found';
    end if;
    v_esperado := (v_formula->>'constante')::numeric
      + coalesce((p->'atributos'->>(v_formula->>'atributo'))::numeric * coalesce((v_formula->>'multiplicador_atributo')::numeric, 1), 0);
    if (p->'recursos_atuais'->>v_recurso)::numeric is distinct from v_esperado then
      raise exception 'Recurso "%" inconsistente: esperado %, recebido %.', v_recurso, v_esperado, p->'recursos_atuais'->>v_recurso
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  -- Cópia das fórmulas da Classe (lida pela ficha e pelo HUD): precisa ser
  -- exatamente a construção de classDerivedFormulasV12 para o Ranking F.
  for v_recurso, v_derivado in select key, value #>> '{}' from jsonb_each(v_mapa) loop
    v_formula := v_criacao->'recursos'->v_recurso;
    continue when v_formula is null;
    v_formulas_esperadas := v_formulas_esperadas || jsonb_build_object(v_derivado,
      case when v_formula ? 'atributo' then
        jsonb_build_object('op', '+', 'args', jsonb_build_array(
          jsonb_build_object('const', (v_formula->>'constante')::numeric),
          jsonb_build_object('op', '*', 'args', jsonb_build_array(
            jsonb_build_object('ref', 'atributo', 'id', v_formula->>'atributo'),
            jsonb_build_object('const', coalesce((v_formula->>'multiplicador_atributo')::numeric, 1))))))
      else jsonb_build_object('const', (v_formula->>'constante')::numeric) end);
    v_textos_esperados := v_textos_esperados || jsonb_build_object(v_derivado, v_formula->'texto');
  end loop;
  if v_classe->'progressao'->'F' ? 'pa' then
    v_formulas_esperadas := v_formulas_esperadas || jsonb_build_object('pa_max', jsonb_build_object('const', (v_classe->'progressao'->'F'->>'pa')::numeric));
    v_textos_esperados := v_textos_esperados || jsonb_build_object('pa_max', (v_classe->'progressao'->'F'->>'pa') || ' (Ranking F)');
  end if;
  if p->'progressao'->'formulas_derivados' is distinct from v_formulas_esperadas
     or p->'progressao'->'formulas_derivados_texto' is distinct from v_textos_esperados then
    raise exception 'Fórmulas de recursos não correspondem à Classe "%".', v_classe_slug using errcode = 'insufficient_privilege';
  end if;

  -- Trajetória.
  v_traj := p->'trajetoria';
  if jsonb_typeof(v_traj) <> 'object' then
    raise exception 'Trajetória ausente.' using errcode = '22023';
  end if;
  if (v_traj->>'regiao_id') is null or (v_traj->>'regiao_id') not in ('beldran', 'kravus', 'talesh', 'torvash', 'vastra') then
    raise exception 'Região de origem inválida: "%".', v_traj->>'regiao_id' using errcode = '22023';
  end if;
  if (v_traj->'rpi_forjado'->>'nivel') is distinct from '1' then
    raise exception 'Personagem novo começa com RPI Forjado de nível 1.' using errcode = '22023';
  end if;
  if resolve_effective_content_payload(p_campaign_id, 'background', v_traj->'antecedente'->>'antecedente_id') is null then
    raise exception 'Antecedente inexistente ou não publicado: "%".', v_traj->'antecedente'->>'antecedente_id' using errcode = 'no_data_found';
  end if;

  -- Qualidades: soma exata de 3; custo permitido; repetição só se repetível.
  -- Efeitos aretz_inicial_adicional (ex.: Recursos) ampliam o Ⱥ inicial.
  v_aretz := (v_criacao->'equipamento_inicial'->>'aretz')::numeric;
  v_soma := 0;
  for v_entry in select * from jsonb_array_elements(coalesce(v_traj->'qualidades', '[]'::jsonb)) loop
    v_opcao := resolve_effective_content_payload(p_campaign_id, 'quality', v_entry->>'quality_id');
    if v_opcao is null then
      raise exception 'Qualidade inexistente ou não publicada: "%".', v_entry->>'quality_id' using errcode = 'no_data_found';
    end if;
    if not exists (select 1 from jsonb_array_elements_text(v_opcao->'custos_permitidos') c where c = v_entry->>'pontos') then
      raise exception 'Qualidade "%" não pode custar % ponto(s).', v_entry->>'quality_id', v_entry->>'pontos' using errcode = 'insufficient_privilege';
    end if;
    if coalesce((v_opcao->>'repetivel')::boolean, false) is false
       and (select count(*) from jsonb_array_elements(v_traj->'qualidades') q where q->>'quality_id' = v_entry->>'quality_id') > 1 then
      raise exception 'Qualidade "%" não pode ser escolhida mais de uma vez.', v_entry->>'quality_id' using errcode = 'insufficient_privilege';
    end if;
    v_soma := v_soma + (v_entry->>'pontos')::int;
    v_aretz := v_aretz + coalesce((
      select sum((e->'por_pontos'->>(v_entry->>'pontos'))::numeric)
        from jsonb_array_elements(coalesce(v_opcao->'efeitos', '[]'::jsonb)) e
        where e->>'tipo' = 'aretz_inicial_adicional'
    ), 0);
  end loop;
  if v_soma <> 3 then
    raise exception 'Qualidades devem somar 3 pontos (recebido %).', v_soma using errcode = 'insufficient_privilege';
  end if;

  -- Complicações: ao menos 2 pontos (adicionais são permitidas por acordo do grupo).
  v_soma := 0;
  for v_entry in select * from jsonb_array_elements(coalesce(v_traj->'complicacoes', '[]'::jsonb)) loop
    v_opcao := resolve_effective_content_payload(p_campaign_id, 'complication', v_entry->>'complication_id');
    if v_opcao is null then
      raise exception 'Complicação inexistente ou não publicada: "%".', v_entry->>'complication_id' using errcode = 'no_data_found';
    end if;
    if not exists (select 1 from jsonb_array_elements_text(v_opcao->'custos_permitidos') c where c = v_entry->>'pontos') then
      raise exception 'Complicação "%" não pode custar % ponto(s).', v_entry->>'complication_id', v_entry->>'pontos' using errcode = 'insufficient_privilege';
    end if;
    if coalesce((v_opcao->>'repetivel')::boolean, false) is false
       and (select count(*) from jsonb_array_elements(v_traj->'complicacoes') c where c->>'complication_id' = v_entry->>'complication_id') > 1 then
      raise exception 'Complicação "%" não pode ser escolhida mais de uma vez.', v_entry->>'complication_id' using errcode = 'insufficient_privilege';
    end if;
    v_soma := v_soma + (v_entry->>'pontos')::int;
  end loop;
  if v_soma < 2 then
    raise exception 'Complicações devem somar ao menos 2 pontos (recebido %).', v_soma using errcode = 'insufficient_privilege';
  end if;

  -- Inventário e carteira (v_aretz já inclui bônus de Qualidades).
  for v_item in select * from jsonb_array_elements(coalesce(p->'inventario', '[]'::jsonb)) loop
    v_item_payload := resolve_effective_content_payload(p_campaign_id, 'item', v_item->>'itemSlug');
    if v_item_payload is null then
      raise exception 'Item inexistente, arquivado ou não publicado: "%".', v_item->>'itemSlug' using errcode = 'no_data_found';
    end if;
    v_quantidade := coalesce((v_item->>'quantidade')::numeric, 0);
    if v_quantidade <= 0 or v_quantidade <> trunc(v_quantidade) then
      raise exception 'Quantidade inválida para o item "%".', v_item->>'itemSlug' using errcode = '22023';
    end if;
    v_preco := coalesce((v_item_payload->>'preco')::numeric, 0) * v_quantidade;
    if coalesce((v_item->>'precoPago')::numeric, -1) <> v_preco then
      raise exception 'Preço adulterado para o item "%": pago %, canônico %.', v_item->>'itemSlug', v_item->>'precoPago', v_preco
        using errcode = 'insufficient_privilege';
    end if;
    v_gasto := v_gasto + v_preco;
  end loop;
  if v_gasto > v_aretz then
    raise exception 'Saldo insuficiente: gasto % excede o orçamento inicial %.', v_gasto, v_aretz using errcode = 'insufficient_privilege';
  end if;
  v_carteira := coalesce(p->'carteira', '{}'::jsonb);
  if coalesce((v_carteira->>'aretz_informal')::numeric, -1) <> v_aretz - v_gasto
     or coalesce((v_carteira->>'cdi')::numeric, 0) <> 0
     or coalesce((v_carteira->>'cdi_craqueada')::numeric, 0) <> 0 then
    raise exception 'Carteira final inconsistente: esperado Ⱥ % e CDI zerado.', v_aretz - v_gasto using errcode = 'insufficient_privilege';
  end if;

  if p_character_id is not null then
    -- Mantém id, dono, controladores, tokens e pasta; o tipo (PN) é do narrador.
    if v_pendente.payload->'metadados' ? 'tipo_personagem' then
      p := jsonb_set(p, '{metadados}', coalesce(p->'metadados', '{}'::jsonb) || jsonb_build_object('tipo_personagem', v_pendente.payload->'metadados'->'tipo_personagem'));
    end if;
    update characters
       set name = trim(p->>'nome'), payload = p, updated_at = now()
     where id = p_character_id
    returning * into v_new;
    return jsonb_build_object('character', to_jsonb(v_new), 'idempotentReplay', false);
  end if;

  insert into characters (name, owner_label, status, payload, campaign_id, owner_id)
  values (trim(p->>'nome'), p_owner_label, 'draft', p, p_campaign_id, v_uid)
  returning * into v_new;

  if not is_campaign_owner(p_campaign_id, v_uid) then
    insert into character_controllers (character_id, campaign_id, user_id, granted_by)
    values (v_new.id, p_campaign_id, v_uid, v_uid)
    on conflict (character_id, user_id) do nothing;
  end if;

  delete from character_creation_drafts where campaign_id = p_campaign_id and owner_id = v_uid;

  return jsonb_build_object('character', to_jsonb(v_new), 'idempotentReplay', false);
end;
$function$;

revoke all on function public.complete_character_creation_v2(uuid, jsonb, text, text, uuid) from public, anon;
grant execute on function public.complete_character_creation_v2(uuid, jsonb, text, text, uuid) to authenticated;

-- 3. A RPC de ficha protege `criacao_pendente` para o jogador (só a conclusão o remove).
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
  -- narrador): Atributo 1–5; Perícia 0 até o limite do Ranking na Classe.
  -- Personagem pendente (só o nome) ainda não tem Atributos: a conclusão valida tudo.
  if (v_existing->>'schema_version') = '2' and coalesce((v_existing->>'criacao_pendente')::boolean, false) is not true then
    foreach v_campo in array array['corpo','mente','animo'] loop
      v_valor := (v_final_payload->'atributos'->>v_campo)::int;
      if v_valor is null or v_valor < 1 or v_valor > 5 then
        raise exception 'Atributo "%" deve ficar entre 1 e 5.', v_campo using errcode = '22023';
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
