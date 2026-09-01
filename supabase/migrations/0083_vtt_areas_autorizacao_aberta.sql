-- =====================================================================
-- 0083 — Áreas: criação aberta a qualquer participante da campanha;
-- edição/exclusão/duplicação continuam narrador-ou-autor.
--
-- MUDANÇA DE REGRA (pedido explícito desta rodada, não um bug): a 0081
-- exigia autorização EXPLÍCITA (`vtt_area_permissoes`, concedida pelo
-- narrador) pra um JOGADOR sequer criar uma área — e, pior, a MESMA
-- checagem (`pode_gerenciar_vtt_areas`) também guardava editar/excluir/
-- duplicar, então um jogador com a concessão podia (por essa checagem)
-- mexer numa área de OUTRO jogador se a segunda camada de `update_vtt_area`
-- (a comparação com `criador_id`) não estivesse lá — as duas
-- responsabilidades nunca deviam ter sido a mesma função.
--
-- REGRA NOVA, com as duas responsabilidades SEPARADAS:
--   - `pode_criar_vtt_area(campaign_id, scene_id)`: só exige ser
--     participante da campanha (narrador ou jogador) com a cena
--     pertencendo a ela. Sem tabela de concessão nenhuma.
--   - `pode_editar_vtt_area(area_id)`: narrador da campanha da área, OU
--     `auth.uid() = criador_id` — e SÓ enquanto essa pessoa ainda for
--     membro da campanha (perder acesso derruba a edição de sessões
--     antigas, mesmo que o token de sessão em si ainda seja válido).
--     Vale pra UPDATE, DELETE e DUPLICATE — nunca uma quarta checagem
--     paralela que possa divergir.
--
-- O QUE NÃO MUDA: a policy de SELECT de `vtt_areas` (0081) já
-- implementava exatamente a regra de leitura pedida agora — narrador
-- vê tudo, o CRIADOR vê a própria mesmo oculta, os demais só veem
-- `visivel = true` — e continua intocada aqui. `vtt_token_visivel_para`
-- (visibilidade do token de origem de uma Aura) também não muda.
--
-- SISTEMA ANTIGO (`vtt_area_permissoes`, `set_vtt_area_permissao`,
-- `pode_gerenciar_vtt_areas`): fica como estrutura HISTÓRICA, sem
-- efeito nenhum sobre autorização daqui em diante — nenhuma policy ou
-- RPC nova a consulta, o EXECUTE das duas funções é revogado de
-- `authenticated` (só `pode_gerenciar_vtt_areas` ainda é referenciada
-- por ELA MESMA — não por mais nada — então também perde o grant), e a
-- interface para de mostrar a seção. A TABELA fica — apagá-la exigiria
-- confirmar que nenhuma sessão em voo ainda a referencia e não é
-- necessário pra fechar a regra nova (a ausência de grant/uso já
-- fecha), então o risco de dropar agora não compensa o benefício.
-- Dados históricos preservados; zero linhas migradas ou apagadas.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. `pode_criar_vtt_area` — só participação na campanha + cena válida.
-- ---------------------------------------------------------------------
create or replace function pode_criar_vtt_area(p_campaign_id uuid, p_scene_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select is_campaign_member(p_campaign_id, check_user_id)
     and exists (select 1 from vtt_scenes s where s.id = p_scene_id and s.campaign_id = p_campaign_id);
$$;

revoke all on function pode_criar_vtt_area(uuid, uuid, uuid) from public;
grant execute on function pode_criar_vtt_area(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. `pode_editar_vtt_area` — narrador OU autor, autor só enquanto
--    ainda for membro (sessão de quem saiu/foi removido não edita mais,
--    mesmo com token de auth ainda válido).
-- ---------------------------------------------------------------------
create or replace function pode_editar_vtt_area(p_area_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from vtt_areas a
    where a.id = p_area_id
      and is_campaign_member(a.campaign_id, check_user_id)
      and (is_campaign_owner(a.campaign_id, check_user_id) or a.criador_id = check_user_id)
  );
$$;

revoke all on function pode_editar_vtt_area(uuid, uuid) from public;
grant execute on function pode_editar_vtt_area(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. `vtt_validar_area` — criação passa a exigir só participação
--    (`pode_criar_vtt_area`), não mais a autorização explícita antiga.
--    Mensagens de erro distintas preservadas (não-membro vs. cena
--    inexistente) — a checagem de token/pontos da Aura é idêntica à
--    0082, intocada.
-- ---------------------------------------------------------------------
create or replace function vtt_validar_area(
  p_campaign_id uuid,
  p_scene_id uuid,
  p_tipo text,
  p_token_id uuid,
  p_pontos jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_campaign_member(p_campaign_id) then
    raise exception 'Você não é participante desta campanha.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from vtt_scenes where id = p_scene_id and campaign_id = p_campaign_id) then
    raise exception 'Cena não encontrada para esta campanha.' using errcode = 'no_data_found';
  end if;

  if p_tipo = 'aura' then
    if p_token_id is null then
      raise exception 'Uma aura precisa de um token de origem.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from vtt_tokens t where t.id = p_token_id and t.scene_id = p_scene_id) then
      raise exception 'O token de origem da aura não está nesta cena.' using errcode = 'no_data_found';
    end if;
    if not vtt_token_visivel_para(p_token_id) then
      raise exception 'Você não pode criar uma aura sobre um token que não consegue ver.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if p_tipo = 'parede' and not vtt_area_pontos_validos(p_pontos, 2) then
    raise exception 'Percurso de parede inválido.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'personalizada' and not vtt_area_pontos_validos(p_pontos, 3) then
    raise exception 'Polígono personalizado inválido.' using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. `update_vtt_area` — a segunda checagem (narrador OU criador) vira
--    a chamada canônica `pode_editar_vtt_area`, no lugar da comparação
--    inline — mesma regra, uma função só, reusada por delete/duplicate
--    também.
-- ---------------------------------------------------------------------
create or replace function update_vtt_area(
  p_area_id uuid,
  p_origem_q numeric,
  p_origem_r numeric,
  p_direcao_graus numeric,
  p_raio_m numeric,
  p_comprimento_m numeric,
  p_largura_m numeric,
  p_altura_m numeric,
  p_lado_m numeric,
  p_nivel_origem_m numeric,
  p_modo_linha text,
  p_pontos jsonb,
  p_token_id uuid,
  p_cor text,
  p_opacidade numeric,
  p_rotulo text,
  p_visivel boolean,
  p_expected_revision integer
) returns vtt_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_area vtt_areas;
begin
  select * into v_area from vtt_areas where id = p_area_id for update;
  if v_area is null then
    raise exception 'Área não encontrada.' using errcode = 'no_data_found';
  end if;
  if not pode_editar_vtt_area(p_area_id) then
    raise exception 'Você só pode alterar as áreas que você criou.' using errcode = 'insufficient_privilege';
  end if;
  perform vtt_validar_area(v_area.campaign_id, v_area.scene_id, v_area.tipo, coalesce(p_token_id, v_area.token_id), p_pontos);
  if v_area.revision <> p_expected_revision then
    raise exception 'Esta área mudou em outra sessão. Recarregue antes de editar.' using errcode = 'serialization_failure';
  end if;

  update vtt_areas set
    origem_q = p_origem_q,
    origem_r = p_origem_r,
    direcao_graus = p_direcao_graus,
    raio_m = p_raio_m,
    comprimento_m = p_comprimento_m,
    largura_m = case when v_area.tipo = 'parede' then 1 else p_largura_m end,
    altura_m = case when v_area.tipo = 'cubo' then p_lado_m else p_altura_m end,
    lado_m = p_lado_m,
    nivel_origem_m = p_nivel_origem_m,
    modo_linha = p_modo_linha,
    pontos = p_pontos,
    token_id = case when v_area.tipo = 'aura' then coalesce(p_token_id, v_area.token_id) else null end,
    cor = coalesce(p_cor, v_area.cor),
    opacidade = coalesce(p_opacidade, v_area.opacidade),
    rotulo = nullif(btrim(coalesce(p_rotulo, '')), ''),
    visivel = coalesce(p_visivel, v_area.visivel),
    revision = v_area.revision + 1,
    updated_at = now()
  where id = p_area_id
  returning * into v_area;

  perform vtt_publicar_areas_alteradas(v_area.campaign_id, v_area.scene_id);
  return v_area;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. `duplicate_vtt_area` — autorização de EDIÇÃO (narrador ou autor da
--    ORIGINAL), não mais a autorização ampla de criar. A cópia sempre
--    pertence a quem duplicou (`auth.uid()`, já era assim desde a
--    0081) — se o narrador duplica a área de um jogador, a cópia vira
--    do narrador; se o próprio jogador duplica, a cópia continua dele.
-- ---------------------------------------------------------------------
create or replace function duplicate_vtt_area(p_area_id uuid)
returns vtt_areas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orig vtt_areas;
  v_nova vtt_areas;
begin
  select * into v_orig from vtt_areas where id = p_area_id;
  if v_orig is null then
    raise exception 'Área não encontrada.' using errcode = 'no_data_found';
  end if;
  if not pode_editar_vtt_area(p_area_id) then
    raise exception 'Você não tem autorização para duplicar esta área.' using errcode = 'insufficient_privilege';
  end if;

  insert into vtt_areas (
    scene_id, campaign_id, tipo,
    origem_q, origem_r, direcao_graus, raio_m, comprimento_m, largura_m, altura_m, lado_m,
    abertura_graus, nivel_origem_m, modo_linha, pontos, token_id,
    cor, opacidade, rotulo, visivel, criador_id
  ) values (
    v_orig.scene_id, v_orig.campaign_id, v_orig.tipo,
    case when v_orig.origem_q is null then null else v_orig.origem_q + 1 end,
    v_orig.origem_r, v_orig.direcao_graus, v_orig.raio_m, v_orig.comprimento_m, v_orig.largura_m, v_orig.altura_m, v_orig.lado_m,
    v_orig.abertura_graus, v_orig.nivel_origem_m, v_orig.modo_linha,
    case
      when v_orig.pontos is null then null
      else (select jsonb_agg(jsonb_build_object('q', (e ->> 'q')::numeric + 1, 'r', (e ->> 'r')::numeric))
            from jsonb_array_elements(v_orig.pontos) e)
    end,
    v_orig.token_id,
    v_orig.cor, v_orig.opacidade, v_orig.rotulo, v_orig.visivel, auth.uid()
  )
  returning * into v_nova;

  perform vtt_publicar_areas_alteradas(v_nova.campaign_id, v_nova.scene_id);
  return v_nova;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. `delete_vtt_area` — mesma troca: `pode_editar_vtt_area` no lugar
--    da dupla checagem antiga.
-- ---------------------------------------------------------------------
create or replace function delete_vtt_area(p_area_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_area vtt_areas;
begin
  select * into v_area from vtt_areas where id = p_area_id;
  if v_area is null then
    return; -- já não existe: apagar de novo é sucesso, não erro
  end if;
  if not pode_editar_vtt_area(p_area_id) then
    raise exception 'Você só pode remover as áreas que você criou.' using errcode = 'insufficient_privilege';
  end if;

  delete from vtt_areas where id = p_area_id;
  perform vtt_publicar_areas_alteradas(v_area.campaign_id, v_area.scene_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Sistema antigo — desligado, preservado como histórico.
--
-- `vtt_area_permissoes` fica intacta (nenhuma policy nova a consulta a
-- partir de agora). `set_vtt_area_permissao` e `pode_gerenciar_vtt_areas`
-- ficam definidas (histórico auditável de como a regra antiga
-- funcionava) mas SEM grant de execução — ninguém alcança nenhuma das
-- duas via API a partir daqui, e nenhuma RPC/policy nova as chama.
-- ---------------------------------------------------------------------
revoke execute on function set_vtt_area_permissao(uuid, uuid, boolean) from authenticated;
revoke execute on function pode_gerenciar_vtt_areas(uuid, uuid) from authenticated;

comment on table vtt_area_permissoes is 'HISTÓRICO — descontinuada na migration 0083. Nenhuma policy/RPC nova consulta esta tabela; criar área agora só exige participação na campanha (`pode_criar_vtt_area`). Preservada por segurança de migração, sem efeito sobre autorização.';
comment on function pode_gerenciar_vtt_areas(uuid, uuid) is 'HISTÓRICO — descontinuada na migration 0083 (sem grant de EXECUTE). Ver `pode_criar_vtt_area`/`pode_editar_vtt_area`.';
comment on function set_vtt_area_permissao(uuid, uuid, boolean) is 'HISTÓRICO — descontinuada na migration 0083 (sem grant de EXECUTE). A criação de área não depende mais de concessão explícita.';

commit;
