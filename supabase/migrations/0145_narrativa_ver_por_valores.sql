-- 0145 — A política de leitura das entradas deixa de reler a própria
-- tabela (CONT-02/CONT-03).
--
-- A 0142 escreveu `narrativa_select ... using (narrativa_pode_ver(id))`,
-- e `narrativa_pode_ver` procura a linha na própria
-- `campaign_narrative_entries`. Numa leitura comum isso funciona. Num
-- `INSERT ... RETURNING` — que é como o cliente cria e recebe a linha de
-- volta — não: a linha em inserção ainda não está visível para uma
-- subconsulta dentro do mesmo comando, a função não a encontra, e a
-- política conclui que ninguém pode vê-la. O narrador era barrado da
-- própria criação, com "new row violates row-level security policy".
--
-- O teste transacional não pegou porque inseria sem RETURNING. A lição
-- ficou no check: agora ele cria das duas formas.
--
-- ── Continua sendo UMA regra ─────────────────────────────────────────
--
-- A tentação seria copiar o predicado para dentro da política e deixar
-- a função para as outras tabelas. Seriam duas cópias da mesma regra —
-- exatamente o que a 0142 evitou citando a 0118. Em vez disso, a regra
-- passa a viver em `narrativa_pode_ver_valores`, que recebe os VALORES
-- da linha e não precisa procurá-la. `narrativa_pode_ver(id)` vira uma
-- casca fina que busca a linha e delega — é o que as tabelas de
-- relação, anexo e comentário usam, e para elas a busca é legítima,
-- porque a linha que procuram é de OUTRA tabela, já existente.
begin;

create function public.narrativa_pode_ver_valores(
  p_campaign_id uuid, p_estado narrativa_estado, p_entry_id uuid
) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_campaign_owner(p_campaign_id)          -- narrador vê tudo, inclusive rascunho
    or (
      p_estado = 'publicado'
      and public.is_campaign_member(p_campaign_id)
      and (
        not exists (select 1 from public.campaign_narrative_visibility v where v.entry_id = p_entry_id)
        or exists (select 1 from public.campaign_narrative_visibility v
                   where v.entry_id = p_entry_id and v.user_id = auth.uid())
      )
    );
$$;
revoke all on function public.narrativa_pode_ver_valores(uuid, narrativa_estado, uuid) from public, anon;
grant execute on function public.narrativa_pode_ver_valores(uuid, narrativa_estado, uuid) to authenticated;

-- Casca fina: para quem só tem o id de uma linha de OUTRA tabela.
create or replace function public.narrativa_pode_ver(p_entry uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select public.narrativa_pode_ver_valores(e.campaign_id, e.estado, e.id)
    from public.campaign_narrative_entries e where e.id = p_entry
  ), false);
$$;

drop policy narrativa_select on public.campaign_narrative_entries;
create policy narrativa_select on public.campaign_narrative_entries
  for select to authenticated
  using (public.narrativa_pode_ver_valores(campaign_id, estado, id));

commit;
