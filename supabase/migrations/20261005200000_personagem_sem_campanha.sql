-- Personagem sem campanha (Etapa 1 — banco).
--
-- 1. `complete_character_creation_v2` aceita `p_campaign_id` nulo: o
--    personagem nasce solto, com o jogador como dono, validado contra o
--    conteúdo oficial. Com campanha, nada muda.
-- 2. Pedido de entrada: `pending_campaign_id` guarda a campanha para a qual
--    o dono pediu entrada. O narrador aceita (o personagem entra e o dono
--    vira controlador) ou recusa; o dono pode cancelar.
-- 3. Saída: quando o personagem sai da campanha — liberado pelo narrador ou
--    porque o dono foi removido dela — ele volta a ser solto, do dono.
--
-- As regras de acesso de `characters` não mudam: o dono já lê e edita o
-- personagem solto (`characters_authenticated_*`), e o narrador nunca
-- passa a ler personagem solto alheio — os pedidos chegam a ele só pelas
-- funções abaixo.

begin;

-- ---------------------------------------------------------------------
-- 1. Criação sem campanha
-- ---------------------------------------------------------------------

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
  -- Sem campanha (05/10/2026): o personagem nasce solto, do próprio jogador,
  -- validado só contra o conteúdo oficial (`resolve_effective_content_payload`
  -- com campanha nula cai no oficial).
  if p_campaign_id is not null and not is_campaign_member(p_campaign_id, v_uid) then
    raise exception 'Você não é participante ativo desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  -- Completar um personagem criado só com o nome (criacao_pendente).
  if p_character_id is not null then
    select * into v_pendente from characters where id = p_character_id for update;
    if not found or v_pendente.campaign_id is distinct from p_campaign_id or v_pendente.archived_at is not null
       or (p_campaign_id is null and v_pendente.owner_id is distinct from v_uid) then
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
    perform pg_advisory_xact_lock(hashtextextended(coalesce(p_campaign_id::text, 'sem-campanha') || ':' || v_uid::text || ':' || p_creation_request_id, 0));
  end if;

  if p_creation_request_id is not null then
    select * into v_existing
      from characters
      where campaign_id is not distinct from p_campaign_id
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

  if p_campaign_id is not null and not is_campaign_owner(p_campaign_id, v_uid) then
    insert into character_controllers (character_id, campaign_id, user_id, granted_by)
    values (v_new.id, p_campaign_id, v_uid, v_uid)
    on conflict (character_id, user_id) do nothing;
  end if;

  delete from character_creation_drafts where campaign_id = p_campaign_id and owner_id = v_uid;

  return jsonb_build_object('character', to_jsonb(v_new), 'idempotentReplay', false);
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Pedido de entrada
-- ---------------------------------------------------------------------

alter table public.characters
  add column if not exists pending_campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists pending_requested_at timestamptz;

alter table public.characters drop constraint if exists characters_pedido_so_solto;
alter table public.characters
  add constraint characters_pedido_so_solto
  check (pending_campaign_id is null or campaign_id is null);

create index if not exists characters_pending_campaign_id_idx
  on public.characters (pending_campaign_id) where pending_campaign_id is not null;

-- O dono pede entrada numa campanha da qual participa.
create or replace function public.solicitar_entrada_personagem(p_character_id uuid, p_campaign_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_char characters%rowtype;
begin
  select * into v_char from characters where id = p_character_id for update;
  if not found or v_char.owner_id is distinct from v_uid then
    raise exception 'Personagem não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_char.campaign_id is not null then
    raise exception 'Este personagem já está numa campanha.' using errcode = '22023';
  end if;
  if v_char.archived_at is not null then
    raise exception 'Este personagem está arquivado.' using errcode = '22023';
  end if;
  if coalesce((v_char.payload->>'criacao_pendente')::boolean, false) then
    raise exception 'Conclua a criação do personagem antes de enviá-lo.' using errcode = '22023';
  end if;
  if not is_campaign_member(p_campaign_id, v_uid) then
    raise exception 'Você não é participante ativo desta campanha.' using errcode = 'insufficient_privilege';
  end if;
  update characters
     set pending_campaign_id = p_campaign_id, pending_requested_at = now(), updated_at = now()
   where id = p_character_id;
end;
$$;

-- O dono desiste do pedido.
create or replace function public.cancelar_entrada_personagem(p_character_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update characters
     set pending_campaign_id = null, pending_requested_at = null, updated_at = now()
   where id = p_character_id and owner_id = auth.uid() and pending_campaign_id is not null;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'no_data_found';
  end if;
end;
$$;

-- O narrador vê os pedidos da própria campanha, com a ficha para avaliar.
create or replace function public.listar_pedidos_personagem(p_campaign_id uuid)
returns table (character_id uuid, nome text, owner_id uuid, payload jsonb, avatar_image_id uuid, solicitado_em timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Só o narrador da campanha vê os pedidos.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.id, c.name, c.owner_id, c.payload, c.avatar_image_id, c.pending_requested_at
      from characters c
     where c.pending_campaign_id = p_campaign_id
       and c.campaign_id is null
       and c.archived_at is null
       -- O dono precisa continuar na campanha: se saiu, o pedido não vale.
       and is_campaign_member(p_campaign_id, c.owner_id)
     order by c.pending_requested_at;
end;
$$;

-- O narrador aceita: o personagem entra e o dono vira controlador.
create or replace function public.aceitar_pedido_personagem(p_character_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_char characters%rowtype;
begin
  select * into v_char from characters where id = p_character_id for update;
  if not found or v_char.pending_campaign_id is null or not is_campaign_owner(v_char.pending_campaign_id, v_uid) then
    raise exception 'Pedido não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_member(v_char.pending_campaign_id, v_char.owner_id) then
    raise exception 'O jogador não participa mais desta campanha.' using errcode = '22023';
  end if;
  update characters
     set campaign_id = v_char.pending_campaign_id, pending_campaign_id = null, pending_requested_at = null, updated_at = now()
   where id = p_character_id;
  if v_char.owner_id is distinct from v_uid then
    insert into character_controllers (character_id, campaign_id, user_id, granted_by)
    values (p_character_id, v_char.pending_campaign_id, v_char.owner_id, v_uid)
    on conflict (character_id, user_id) do nothing;
  end if;
end;
$$;

-- O narrador recusa.
create or replace function public.recusar_pedido_personagem(p_character_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campanha uuid;
begin
  select pending_campaign_id into v_campanha from characters where id = p_character_id for update;
  if v_campanha is null or not is_campaign_owner(v_campanha, auth.uid()) then
    raise exception 'Pedido não encontrado.' using errcode = 'no_data_found';
  end if;
  update characters
     set pending_campaign_id = null, pending_requested_at = null, updated_at = now()
   where id = p_character_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Saída da campanha: o personagem volta solto para o dono
-- ---------------------------------------------------------------------

-- O narrador libera um personagem de jogador da campanha.
create or replace function public.liberar_personagem_da_campanha(p_character_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_char characters%rowtype;
begin
  select * into v_char from characters where id = p_character_id for update;
  if not found or v_char.campaign_id is null or not is_campaign_owner(v_char.campaign_id, v_uid) then
    raise exception 'Personagem não encontrado nesta campanha.' using errcode = 'no_data_found';
  end if;
  if v_char.owner_id is null or v_char.owner_id = v_uid then
    raise exception 'Só personagens de jogador voltam para o jogador; os seus podem ser arquivados.' using errcode = '22023';
  end if;
  delete from character_controllers where character_id = p_character_id;
  update characters set campaign_id = null, updated_at = now() where id = p_character_id;
end;
$$;

-- Remover um participante leva junto os personagens de que ele é dono.
create or replace function public.remove_campaign_member(
  p_campaign_id uuid,
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador dono da campanha pode remover participantes.' using errcode = 'insufficient_privilege';
  end if;

  select role into v_role from campaign_members
    where campaign_id = p_campaign_id and user_id = p_user_id;

  if v_role = 'owner' then
    raise exception 'O narrador dono da campanha não pode remover a si mesmo.' using errcode = 'insufficient_privilege';
  end if;

  update campaign_members
     set status = 'removed', updated_at = now()
   where campaign_id = p_campaign_id and user_id = p_user_id;

  delete from character_controllers
   where campaign_id = p_campaign_id and user_id = p_user_id;

  -- Personagens do jogador saem com ele, de volta para a lista dele.
  delete from character_controllers
   where character_id in (select id from characters where campaign_id = p_campaign_id and owner_id = p_user_id);
  update characters
     set campaign_id = null, updated_at = now()
   where campaign_id = p_campaign_id and owner_id = p_user_id;

  -- E os pedidos dele para esta campanha caem.
  update characters
     set pending_campaign_id = null, pending_requested_at = null
   where pending_campaign_id = p_campaign_id and owner_id = p_user_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'solicitar_entrada_personagem(uuid, uuid)',
    'cancelar_entrada_personagem(uuid)',
    'listar_pedidos_personagem(uuid)',
    'aceitar_pedido_personagem(uuid)',
    'recusar_pedido_personagem(uuid)',
    'liberar_personagem_da_campanha(uuid)',
    'remove_campaign_member(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

commit;
