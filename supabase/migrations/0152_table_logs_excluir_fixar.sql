-- 0152 — Excluir e fixar cards do chat (CHAT-02/CHAT-03).
--
-- EXCLUIR é lógico, não `delete`: o log é o histórico da mesa, e sumir
-- com a linha apagaria também o rastro de quem apagou. A leitura do feed
-- (`listLogs`) filtra `deleted_at is null`.
--   • narrador (dono da campanha): qualquer card;
--   • demais membros: só os que ELES registraram (`created_by_user_id`).
--
-- FIXAR é compartilhado: qualquer membro que VÊ o card pode fixá-lo ou
-- desafixá-lo, e o fixado aparece para todos que o veem.
--   • card público: qualquer membro;
--   • privado/gm: o narrador ou o autor (os únicos que o veem).
--
-- As duas escritas passam por RPC SECURITY DEFINER; a tabela continua
-- sem política de UPDATE para o cliente.

begin;

alter table public.table_logs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references auth.users(id) on delete set null;

create index if not exists table_logs_campaign_pinned_idx
  on public.table_logs (campaign_id)
  where pinned_at is not null and deleted_at is null;

create or replace function public.excluir_table_log(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_log table_logs%rowtype;
begin
  if v_uid is null then
    raise exception 'Sessão expirada.' using errcode = '28000';
  end if;

  select * into v_log from table_logs where id = p_log_id for update;
  if not found or v_log.deleted_at is not null then
    raise exception 'Card não encontrado.' using errcode = 'P0002';
  end if;

  if not (
    is_campaign_owner(v_log.campaign_id, v_uid)
    or (is_campaign_member(v_log.campaign_id, v_uid) and v_log.created_by_user_id = v_uid)
  ) then
    raise exception 'Você só pode excluir os cards que registrou.' using errcode = '42501';
  end if;

  update table_logs
     set deleted_at = now(), deleted_by = v_uid, pinned_at = null, pinned_by = null
   where id = p_log_id;
end;
$$;

create or replace function public.fixar_table_log(p_log_id uuid, p_fixar boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_log table_logs%rowtype;
begin
  if v_uid is null then
    raise exception 'Sessão expirada.' using errcode = '28000';
  end if;

  select * into v_log from table_logs where id = p_log_id for update;
  if not found or v_log.deleted_at is not null then
    raise exception 'Card não encontrado.' using errcode = 'P0002';
  end if;

  if not (
    is_campaign_owner(v_log.campaign_id, v_uid)
    or (
      is_campaign_member(v_log.campaign_id, v_uid)
      and (v_log.visibility = 'public' or v_log.created_by_user_id = v_uid)
    )
  ) then
    raise exception 'Você não pode fixar este card.' using errcode = '42501';
  end if;

  update table_logs
     set pinned_at = case when p_fixar then now() else null end,
         pinned_by = case when p_fixar then v_uid else null end
   where id = p_log_id;
end;
$$;

revoke all on function public.excluir_table_log(uuid) from public;
revoke all on function public.fixar_table_log(uuid, boolean) from public;
grant execute on function public.excluir_table_log(uuid) to authenticated;
grant execute on function public.fixar_table_log(uuid, boolean) to authenticated;

commit;
