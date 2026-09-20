-- 0142 — Conteúdo narrativo da campanha (CONT-02), sobre a taxonomia
-- aprovada em CONT-01.
--
-- Domínio SEPARADO do conteúdo de regras: nada aqui toca `content_type`
-- nem `campaign_content_documents`. Aquele enum é de item, magia, runa e
-- talento; este é de sessão, anotação, handout, NPC e lugar.
--
-- Regras de produto que o schema aplica:
--   * rascunho é só do narrador, sempre, aconteça o que acontecer;
--   * publicado é da mesa toda, com EXCEÇÃO por jogador quando o
--     narrador quiser o segredo de um só;
--   * arquivado sai das listas e volta atrás — arquivar não apaga;
--   * anexo é imagem, e reusa o pipeline do VTT; nenhum bucket novo;
--   * jogador comenta no que enxerga, e só nisso.
--
-- Quem pode ver um item é UMA pergunta, em UMA função
-- (`narrativa_pode_ver`), consultada por toda política daqui. Repetir o
-- predicado em cada tabela é como as regras divergem: a próxima pessoa
-- conserta uma e não sabe das outras. Mesma lição da 0118.
begin;

create type narrativa_tipo as enum ('sessao', 'anotacao', 'handout', 'npc', 'lugar');
create type narrativa_estado as enum ('rascunho', 'publicado', 'arquivado');

create table public.campaign_narrative_entries (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  tipo           narrativa_tipo not null,
  titulo         text,
  corpo          text,
  etiquetas      text[] not null default '{}',
  estado         narrativa_estado not null default 'rascunho',

  -- Específicos por tipo. Ficam nulos fora do seu tipo, e o check
  -- abaixo impede que um lugar ganhe data de sessão por descuido.
  acontecida_em     timestamptz,
  online_session_id uuid references public.campaign_online_sessions(id) on delete set null,
  character_id      uuid references public.characters(id) on delete set null,

  criado_por     uuid references auth.users(id) on delete set null,
  criado_em      timestamptz not null default clock_timestamp(),
  atualizado_em  timestamptz not null default clock_timestamp(),
  arquivado_em   timestamptz,

  -- Título é obrigatório em todo tipo MENOS handout, que pode ser só a
  -- imagem — foi a razão de handout existir como tipo próprio.
  constraint narrativa_titulo_obrigatorio
    check (tipo = 'handout' or coalesce(trim(titulo), '') <> ''),
  constraint narrativa_campos_de_sessao
    check (tipo = 'sessao' or (acontecida_em is null and online_session_id is null)),
  constraint narrativa_campos_de_npc
    check (tipo = 'npc' or character_id is null),
  constraint narrativa_arquivado_tem_data
    check ((estado = 'arquivado') = (arquivado_em is not null)),
  unique (id, campaign_id)
);
create index campaign_narrative_entries_campanha_idx
  on public.campaign_narrative_entries (campaign_id, tipo, estado, atualizado_em desc);
create index campaign_narrative_entries_etiquetas_idx
  on public.campaign_narrative_entries using gin (etiquetas);
create index campaign_narrative_entries_busca_idx
  on public.campaign_narrative_entries using gin
  (to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(corpo, '')));

-- Exceção por jogador. A ausência de linhas significa "a mesa toda vê",
-- que é o caso comum; havendo linhas, só quem está nelas vê.
create table public.campaign_narrative_visibility (
  entry_id    uuid not null references public.campaign_narrative_entries(id) on delete cascade,
  campaign_id uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  primary key (entry_id, user_id),
  -- FK COMPOSTA: sem ela o banco aceitaria revelar um item da campanha A
  -- usando a campanha B como contexto. Mesma proteção da 0099.
  foreign key (entry_id, campaign_id) references public.campaign_narrative_entries(id, campaign_id) on delete cascade
);
create index campaign_narrative_visibility_user_idx on public.campaign_narrative_visibility (user_id);

-- Relações simétricas e sem papel. O par é guardado ORDENADO para que
-- (a,b) e (b,a) sejam a mesma linha — sem isso, "já relacionei" viraria
-- duas perguntas e a interface mostraria a relação duas vezes.
create table public.campaign_narrative_links (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entry_a     uuid not null references public.campaign_narrative_entries(id) on delete cascade,
  entry_b     uuid not null references public.campaign_narrative_entries(id) on delete cascade,
  criado_em   timestamptz not null default clock_timestamp(),
  primary key (entry_a, entry_b),
  constraint narrativa_link_ordenado check (entry_a < entry_b),
  foreign key (entry_a, campaign_id) references public.campaign_narrative_entries(id, campaign_id) on delete cascade,
  foreign key (entry_b, campaign_id) references public.campaign_narrative_entries(id, campaign_id) on delete cascade
);
create index campaign_narrative_links_b_idx on public.campaign_narrative_links (entry_b);

-- Anexos: ponte para o asset de imagem que já existe, sem bucket novo,
-- sem mime novo e sem repetir a quota.
create table public.campaign_narrative_attachments (
  entry_id    uuid not null references public.campaign_narrative_entries(id) on delete cascade,
  image_id    uuid not null references public.vtt_image_assets(id) on delete cascade,
  campaign_id uuid not null,
  legenda     text,
  ordem       integer not null default 0,
  primary key (entry_id, image_id),
  foreign key (entry_id, campaign_id) references public.campaign_narrative_entries(id, campaign_id) on delete cascade,
  foreign key (image_id, campaign_id) references public.vtt_image_assets(id, campaign_id) on delete cascade
);

create table public.campaign_narrative_comments (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.campaign_narrative_entries(id) on delete cascade,
  campaign_id  uuid not null,
  autor_id     uuid not null references auth.users(id) on delete cascade,
  corpo        text not null check (coalesce(trim(corpo), '') <> ''),
  criado_em    timestamptz not null default clock_timestamp(),
  editado_em   timestamptz,
  foreign key (entry_id, campaign_id) references public.campaign_narrative_entries(id, campaign_id) on delete cascade
);
create index campaign_narrative_comments_entry_idx on public.campaign_narrative_comments (entry_id, criado_em);

-- ── Uma pergunta, uma função ────────────────────────────────────────
create function public.narrativa_pode_ver(p_entry uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.campaign_narrative_entries e
    where e.id = p_entry and (
      public.is_campaign_owner(e.campaign_id)               -- narrador vê tudo, inclusive rascunho
      or (
        e.estado = 'publicado'
        and public.is_campaign_member(e.campaign_id)
        and (
          not exists (select 1 from public.campaign_narrative_visibility v where v.entry_id = e.id)
          or exists (select 1 from public.campaign_narrative_visibility v
                     where v.entry_id = e.id and v.user_id = auth.uid())
        )
      )
    )
  );
$$;
revoke all on function public.narrativa_pode_ver(uuid) from public, anon;
grant execute on function public.narrativa_pode_ver(uuid) to authenticated;

alter table public.campaign_narrative_entries enable row level security;
alter table public.campaign_narrative_visibility enable row level security;
alter table public.campaign_narrative_links enable row level security;
alter table public.campaign_narrative_attachments enable row level security;
alter table public.campaign_narrative_comments enable row level security;
revoke all on public.campaign_narrative_entries, public.campaign_narrative_visibility,
  public.campaign_narrative_links, public.campaign_narrative_attachments,
  public.campaign_narrative_comments from public, anon;
grant select, insert, update, delete on public.campaign_narrative_entries,
  public.campaign_narrative_visibility, public.campaign_narrative_links,
  public.campaign_narrative_attachments to authenticated;
grant select, insert, update, delete on public.campaign_narrative_comments to authenticated;

-- Entradas: leitura pela função única; escrita só do narrador.
create policy narrativa_select on public.campaign_narrative_entries
  for select to authenticated using (public.narrativa_pode_ver(id));
create policy narrativa_insert on public.campaign_narrative_entries
  for insert to authenticated with check (public.is_campaign_owner(campaign_id));
create policy narrativa_update on public.campaign_narrative_entries
  for update to authenticated
  using (public.is_campaign_owner(campaign_id)) with check (public.is_campaign_owner(campaign_id));
create policy narrativa_delete on public.campaign_narrative_entries
  for delete to authenticated using (public.is_campaign_owner(campaign_id));

-- Visibilidade e relações: do narrador. O jogador NÃO lê a lista de
-- exceções — saber quem mais recebeu o segredo já é parte do segredo.
create policy narrativa_vis_tudo on public.campaign_narrative_visibility
  for all to authenticated
  using (public.is_campaign_owner(campaign_id)) with check (public.is_campaign_owner(campaign_id));

create policy narrativa_link_select on public.campaign_narrative_links
  for select to authenticated
  using (public.narrativa_pode_ver(entry_a) and public.narrativa_pode_ver(entry_b));
create policy narrativa_link_escrita on public.campaign_narrative_links
  for all to authenticated
  using (public.is_campaign_owner(campaign_id)) with check (public.is_campaign_owner(campaign_id));

create policy narrativa_anexo_select on public.campaign_narrative_attachments
  for select to authenticated using (public.narrativa_pode_ver(entry_id));
create policy narrativa_anexo_escrita on public.campaign_narrative_attachments
  for all to authenticated
  using (public.is_campaign_owner(campaign_id)) with check (public.is_campaign_owner(campaign_id));

-- Comentários: quem enxerga o item lê os comentários dele e escreve os
-- próprios. Autor edita e apaga o que é seu; o narrador apaga qualquer
-- um, porque a mesa é dele — mas não EDITA a fala de ninguém, que seria
-- pôr palavra na boca alheia.
create policy narrativa_comentario_select on public.campaign_narrative_comments
  for select to authenticated using (public.narrativa_pode_ver(entry_id));
create policy narrativa_comentario_insert on public.campaign_narrative_comments
  for insert to authenticated
  with check (autor_id = (select auth.uid()) and public.narrativa_pode_ver(entry_id));
create policy narrativa_comentario_update on public.campaign_narrative_comments
  for update to authenticated
  using (autor_id = (select auth.uid()) and public.narrativa_pode_ver(entry_id))
  with check (autor_id = (select auth.uid()));
create policy narrativa_comentario_delete on public.campaign_narrative_comments
  for delete to authenticated
  using (autor_id = (select auth.uid()) or public.is_campaign_owner(campaign_id));

-- `atualizado_em` no servidor: enviado pelo cliente seria uma alegação.
create function public.narrativa_touch() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.atualizado_em := clock_timestamp();
  return new;
end;
$$;
create trigger narrativa_touch_trg before update on public.campaign_narrative_entries
  for each row execute function public.narrativa_touch();

commit;
