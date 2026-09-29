-- =====================================================================
-- 0151 — Permissão por controlador: VISUALIZAR ou EDITAR
--
-- "Configurar acesso" virou "Configurar permissões". Cada conta com
-- acesso a um personagem tem UMA de duas permissões:
--
--   · visualizar — vê o personagem na aba e abre a ficha, sem alterar;
--   · editar     — o que "controlar" sempre foi: edita a ficha, põe o
--                  token no mapa, move, age no turno.
--
-- COMO, sem reescrever cada caminho de escrita:
--   `is_character_controller_for` é a pergunta que TODOS os caminhos de
--   escrita fazem (update_character_sheet_payload, can_move_vtt_token,
--   create_vtt_token via is_character_controller, seed, cena). Ela passa
--   a exigir `permissao = 'editar'`. A LEITURA (`can_read_character`)
--   deixa de usá-la e consulta a tabela direto, aceitando as duas.
--
-- Linhas existentes nascem como 'editar' (default): ninguém que joga
-- hoje perde nada.
-- =====================================================================

begin;

alter table public.character_controllers
  add column if not exists permissao text not null default 'editar'
  check (permissao in ('visualizar', 'editar'));

comment on column public.character_controllers.permissao is
  'visualizar = só lê a ficha; editar = controla de fato (ficha, token, turno).';

-- ── Escrita: só quem EDITA ────────────────────────────────────────────
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
      and cc.permissao = 'editar'
  );
$$;

-- ── Leitura: qualquer permissão ───────────────────────────────────────
create or replace function can_read_character(
  p_character_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from characters c
    where c.id = p_character_id
      and (
        (c.campaign_id is not null and is_campaign_owner(c.campaign_id, check_user_id))
        or (c.campaign_id is null and c.owner_id = check_user_id)
        or (
          c.campaign_id is not null
          and exists (
            select 1 from character_controllers cc
            where cc.character_id = c.id
              and cc.campaign_id = c.campaign_id
              and cc.user_id = check_user_id
          )
          and is_campaign_member(c.campaign_id, check_user_id)
        )
      )
  );
$$;

-- ── Conceder com permissão (e atualizar a de quem já tem) ─────────────
-- Assinatura nova (3 parâmetros): a de 2 sai, senão o PostgREST recusa
-- por ambiguidade (lição 0094/0096).
drop function if exists grant_character_control(uuid, uuid);

create function grant_character_control(
  p_character_id uuid,
  p_user_id uuid,
  p_permissao text default 'editar'
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  if p_permissao not in ('visualizar', 'editar') then
    raise exception 'Permissão inválida: "%".', p_permissao using errcode = 'invalid_parameter_value';
  end if;
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

  insert into character_controllers (character_id, campaign_id, user_id, granted_by, permissao)
  values (p_character_id, v_campaign_id, p_user_id, auth.uid(), p_permissao)
  on conflict (character_id, user_id) do update set permissao = excluded.permissao;
end;
$$;
revoke all on function grant_character_control(uuid, uuid, text) from public;
revoke all on function grant_character_control(uuid, uuid, text) from anon;
grant execute on function grant_character_control(uuid, uuid, text) to authenticated;

commit;
