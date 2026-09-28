-- 0143 — Visibilidade narrativa atômica e auditável (CONT-02).
--
-- A 0142 deixou a troca de visibilidade a cargo do cliente: apagar as
-- exceções e inserir as novas, em duas instruções. Falhar entre as duas
-- deixa a lista VAZIA — que nesta modelagem significa "a mesa toda vê".
-- Ou seja: a falha revelava. Num recurso cujo propósito é o segredo, o
-- erro tem de caber para o lado de esconder, nunca para o de mostrar.
--
-- Aqui as duas viram uma. E como revelar é decisão que se presta a
-- disputa depois ("eu não mostrei isso a ele"), fica registrado quem
-- mudou, quando, e de quê para quê.
begin;

create table public.campaign_narrative_visibility_log (
  id          bigserial primary key,
  entry_id    uuid not null references public.campaign_narrative_entries(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  alterado_por uuid references auth.users(id) on delete set null,
  alterado_em timestamptz not null default clock_timestamp(),
  -- null = "a mesa toda", que é o mesmo significado da lista vazia na
  -- tabela de exceções. Guardar os dois lados torna o registro legível
  -- sozinho, sem ter de reconstruir o passado a partir das linhas atuais.
  antes       uuid[],
  depois      uuid[]
);
create index campaign_narrative_visibility_log_entry_idx
  on public.campaign_narrative_visibility_log (entry_id, alterado_em desc);

alter table public.campaign_narrative_visibility_log enable row level security;
revoke all on public.campaign_narrative_visibility_log from public, anon, authenticated;
grant select on public.campaign_narrative_visibility_log to authenticated;

-- Só o narrador lê o histórico: ele contém a lista de quem viu o quê, e
-- essa lista é justamente o que a 0142 já esconde dos jogadores.
create policy narrativa_vis_log_select on public.campaign_narrative_visibility_log
  for select to authenticated using (public.is_campaign_owner(campaign_id));

-- p_user_ids null (ou vazio) = revelar para a mesa toda.
create function public.set_narrative_visibility(p_entry_id uuid, p_user_ids uuid[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  camp uuid;
  antes uuid[];
  depois uuid[];
begin
  select campaign_id into camp from public.campaign_narrative_entries where id = p_entry_id for update;
  if not found or not public.is_campaign_owner(camp) then
    raise exception 'Só o narrador altera a visibilidade.' using errcode = '42501';
  end if;

  select array_agg(user_id order by user_id) into antes
    from public.campaign_narrative_visibility where entry_id = p_entry_id;

  -- Só quem é da campanha pode estar na lista: revelar para alguém de
  -- fora não é erro silencioso, é recusa.
  if p_user_ids is not null then
    depois := (select array_agg(distinct u order by u) from unnest(p_user_ids) u);
    if exists (
      select 1 from unnest(coalesce(depois, '{}'::uuid[])) u
      where not public.is_campaign_member(camp, u)
    ) then
      raise exception 'Só participantes da campanha podem receber um item.' using errcode = '42501';
    end if;
  end if;

  delete from public.campaign_narrative_visibility where entry_id = p_entry_id;
  if depois is not null and cardinality(depois) > 0 then
    insert into public.campaign_narrative_visibility(entry_id, campaign_id, user_id)
      select p_entry_id, camp, u from unnest(depois) u;
  else
    depois := null; -- lista vazia e "todos" são a mesma coisa; registra como todos
  end if;

  -- Uma função, uma transação: ou as exceções trocam por inteiro, ou
  -- nada muda. Não existe janela em que o item fique revelado por erro.
  insert into public.campaign_narrative_visibility_log(entry_id, campaign_id, alterado_por, antes, depois)
    values (p_entry_id, camp, auth.uid(), antes, depois);
end;
$$;
revoke all on function public.set_narrative_visibility(uuid, uuid[]) from public, anon;
grant execute on function public.set_narrative_visibility(uuid, uuid[]) to authenticated;

commit;
