-- =====================================================================
-- Ruptura VTT — character_controllers (Fase 1 do plano de contas/campanhas/
-- convites/personagens, revisão 4 — docs/relatorios/AUDITORIA_REFATORACAO_
-- CONTAS_CAMPANHAS_CONVITES_PERSONAGENS.md, seção 13)
-- Migration: 0051_character_controllers
--
-- Passo 1 da ordem interna segura (§13.7): cria o schema novo, ADITIVO.
-- campaign_profiles/profile_sessions continuam existindo e funcionando
-- normalmente após esta migration — nada é removido aqui.
--
-- character_controllers é a relação N:N conta<->personagem exigida pelo
-- aditivo. campaign_id é armazenado (não derivado por join a cada leitura
-- de RLS), mas nunca fica solto: é garantido por FK composta contra
-- characters(id, campaign_id), que por sua vez exige um índice único
-- nesse par (trivialmente satisfeito, já que characters.id já é único
-- sozinho). Consequência desejada: um personagem sem campanha
-- (campaign_id is null) não pode ter controladores — controle só faz
-- sentido dentro do contexto de uma campanha.
-- =====================================================================

begin;

create unique index if not exists characters_id_campaign_id_uidx
  on characters (id, campaign_id);

create table if not exists character_controllers (
  character_id uuid not null,
  campaign_id  uuid not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  granted_by   uuid references auth.users(id) on delete set null,
  granted_at   timestamptz not null default now(),
  primary key (character_id, user_id),
  foreign key (character_id, campaign_id)
    references characters (id, campaign_id)
    on delete cascade
);

create index if not exists character_controllers_user_idx
  on character_controllers (user_id);
create index if not exists character_controllers_campaign_idx
  on character_controllers (campaign_id);

alter table character_controllers enable row level security;

-- Leitura: o próprio controlador vê a própria linha; o narrador dono da
-- campanha vê todas as linhas da campanha (necessário para a página de
-- personagens do narrador, Fase 4).
drop policy if exists character_controllers_select on character_controllers;
create policy character_controllers_select on character_controllers
  for select to authenticated
  using (user_id = (select auth.uid()) or is_campaign_owner(campaign_id));

-- Nenhuma policy de INSERT/UPDATE/DELETE para authenticated: toda escrita
-- passa pelas RPCs grant_character_control/revoke_character_control
-- (SECURITY DEFINER), que revalidam autorização e pré-condições de negócio
-- (personagem pertence a uma campanha, usuário-alvo é membro ativo dela).
revoke all on character_controllers from anon;
revoke all on character_controllers from authenticated;
grant select on character_controllers to authenticated;

-- ---------------------------------------------------------------------
-- Helper interno (lacuna 6 do pedido de revisão): checa controle para um
-- usuário ARBITRÁRIO, sem exigir participação ativa (isso é feito por
-- quem chama, ex.: can_read_character). Não é exposto a anon/authenticated
-- — só é chamável de dentro de outras funções SECURITY DEFINER do mesmo
-- dono (postgres), nunca diretamente via RPC do cliente.
-- ---------------------------------------------------------------------
create or replace function is_character_controller_for(
  p_character_id uuid,
  p_campaign_id uuid,
  p_user_id uuid
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from character_controllers cc
    where cc.character_id = p_character_id
      and cc.campaign_id = p_campaign_id
      and cc.user_id = p_user_id
  );
$$;
revoke all on function is_character_controller_for(uuid, uuid, uuid) from public;
revoke all on function is_character_controller_for(uuid, uuid, uuid) from anon;
revoke all on function is_character_controller_for(uuid, uuid, uuid) from authenticated;

-- ---------------------------------------------------------------------
-- Helper público (lacuna 6): variante de uso comum, baseada só em
-- auth.uid() — nenhum parâmetro de usuário arbitrário exposto. Combina
-- controle (character_controllers) com participação ATIVA na campanha
-- do personagem (lacuna 1) — um jogador removido da campanha nunca
-- recebe true aqui, mesmo com linha residual em character_controllers.
-- ---------------------------------------------------------------------
create or replace function is_character_controller(
  p_character_id uuid
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from characters c
    where c.id = p_character_id
      and c.campaign_id is not null
      and is_character_controller_for(c.id, c.campaign_id, auth.uid())
      and is_campaign_member(c.campaign_id, auth.uid())
  );
$$;
revoke all on function is_character_controller(uuid) from public;
grant execute on function is_character_controller(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- grant_character_control / revoke_character_control — únicas RPCs que
-- escrevem em character_controllers. Só o narrador dono da campanha do
-- personagem pode chamar; grant exige que o usuário-alvo já seja membro
-- ATIVO da campanha (não é possível conceder controle a quem não está
-- na campanha).
-- ---------------------------------------------------------------------
create or replace function grant_character_control(
  p_character_id uuid,
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id from characters where id = p_character_id;
  if v_campaign_id is null then
    raise exception 'Personagem sem campanha não pode ter controlador.' using errcode = 'check_violation';
  end if;
  if not is_campaign_owner(v_campaign_id) then
    raise exception 'Só o narrador dono da campanha pode conceder controle.' using errcode = 'insufficient_privilege';
  end if;
  if not is_campaign_member(v_campaign_id, p_user_id) then
    raise exception 'O usuário-alvo não é um participante ativo desta campanha.' using errcode = 'check_violation';
  end if;

  insert into character_controllers (character_id, campaign_id, user_id, granted_by)
  values (p_character_id, v_campaign_id, p_user_id, auth.uid())
  on conflict (character_id, user_id) do nothing;
end;
$$;
revoke all on function grant_character_control(uuid, uuid) from public;
revoke all on function grant_character_control(uuid, uuid) from anon;
grant execute on function grant_character_control(uuid, uuid) to authenticated;

create or replace function revoke_character_control(
  p_character_id uuid,
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id from characters where id = p_character_id;
  if v_campaign_id is null or not is_campaign_owner(v_campaign_id) then
    raise exception 'Só o narrador dono da campanha pode remover controle.' using errcode = 'insufficient_privilege';
  end if;

  delete from character_controllers
  where character_id = p_character_id and user_id = p_user_id;
end;
$$;
revoke all on function revoke_character_control(uuid, uuid) from public;
revoke all on function revoke_character_control(uuid, uuid) from anon;
grant execute on function revoke_character_control(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- update_character_sheet_payload — único caminho de escrita do jogador
-- controlador (lacuna 3). Whitelist de colunas = a própria assinatura da
-- função: só `payload` é alterável por este caminho. campaign_id,
-- owner_id, archived_at e qualquer outro campo administrativo não têm
-- parâmetro correspondente — não é uma checagem condicional que pode
-- ter lacuna, é a ausência estrutural do parâmetro.
-- Exige participação ATIVA (lacuna 1) via is_character_controller_for
-- combinado com is_campaign_member, revalidados aqui dentro (nunca
-- confia em dado do cliente além de character_id/payload).
-- ---------------------------------------------------------------------
create or replace function update_character_sheet_payload(
  p_character_id uuid,
  p_payload jsonb
) returns characters
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_result characters;
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado.' using errcode = 'insufficient_privilege';
  end if;

  select campaign_id into v_campaign_id from characters where id = p_character_id;
  if v_campaign_id is null then
    raise exception 'Personagem sem campanha — use o caminho de edição do narrador.' using errcode = 'check_violation';
  end if;

  if not (
    is_character_controller_for(p_character_id, v_campaign_id, auth.uid())
    and is_campaign_member(v_campaign_id, auth.uid())
  ) then
    raise exception 'Você não controla este personagem nesta campanha.' using errcode = 'insufficient_privilege';
  end if;

  update characters
     set payload = p_payload,
         updated_at = now()
   where id = p_character_id
  returning * into v_result;

  return v_result;
end;
$$;
revoke all on function update_character_sheet_payload(uuid, jsonb) from public;
revoke all on function update_character_sheet_payload(uuid, jsonb) from anon;
grant execute on function update_character_sheet_payload(uuid, jsonb) to authenticated;

commit;
