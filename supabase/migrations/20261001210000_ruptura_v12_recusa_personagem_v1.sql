-- RUPTURA v1.2 — Fase 10: o banco recusa personagem fora do schema v2.
--
-- Critério de aceite do plano: "A aplicação rejeita payloads de personagem
-- anteriores ao schema v2". Depois do corte (Fase 7) não há personagem v1, e
-- nenhum caminho do produto cria um. Esta restrição torna isso garantido no
-- banco: qualquer INSERT ou UPDATE em `characters` precisa de
-- `payload.schema_version = 2`. (Personagem pendente — `criacao_pendente` —
-- já é v2.)
--
-- Também sai a RPC de criação v1 (`complete_character_creation`): sem
-- chamadas no app desde 01/10/2026 e incompatível com a restrição.

alter table public.characters
  drop constraint if exists characters_payload_schema_v2;
alter table public.characters
  add constraint characters_payload_schema_v2
  -- coalesce: sem ele, payload sem schema_version dá NULL e o CHECK passa.
  check (jsonb_typeof(payload) = 'object' and coalesce(payload->>'schema_version', '') = '2');

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'complete_character_creation'
  loop
    execute format('drop function %s', r.assinatura);
  end loop;
end $$;

-- Criação v1.2 idempotente sob concorrência real (cenário 3 de
-- validate-campaign-session-concurrency, que já falhava com a RPC v1).
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

  -- Duplo clique / duas abas com o mesmo pedido: serializa por (campanha,
  -- conta, pedido) antes de procurar o personagem já criado. Sem isto, as
  -- duas chamadas passam pela busca juntas e criam dois personagens.
  if p_creation_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text || ':' || v_uid::text || ':' || p_creation_request_id, 0));
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
