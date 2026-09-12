-- =====================================================================
-- 0090 — Pastas e ordem manual do diretório de Personagens
--        (painel lateral da Mesa, `vtt/_painel/PersonagensTab.tsx`)
--
-- A aba Personagens do painel é um DIRETÓRIO de documentos persistentes
-- (estilo Actors Directory do Foundry), não uma lista de tokens da
-- cena. O modelo atual (`characters` + `character_controllers`) já
-- responde "quem existe" e "quem pode ver", mas não tinha onde guardar
-- as duas coisas que um diretório precisa: PASTAS (com subpastas) e
-- ORDEM MANUAL. Este é o schema mínimo pra isso — nada de payload ad
-- hoc dentro de `characters.payload` (que é a ficha, revalidada e
-- reescrita por outros fluxos; organização de diretório não tem nada a
-- ver com ficha e não pode viajar junto numa duplicação de personagem).
--
-- DUAS tabelas, ambas ESCOPADAS À CAMPANHA:
--
--   · campaign_character_folders   — a árvore. `parent_id` nulo = raiz.
--   · campaign_character_placements — onde cada personagem está e em
--     que ordem. Uma linha por personagem, no máximo (PK em
--     character_id). Personagem SEM linha aqui = raiz do diretório,
--     ordenado alfabeticamente — o diretório nunca depende de esta
--     tabela estar preenchida.
--
-- AUTORIZAÇÃO (fail-closed, sem ampliar nada do modelo existente):
-- estas duas tabelas são do NARRADOR — leitura e escrita exigem
-- `is_campaign_owner(campaign_id)` (migration 0025). Não é só sobre
-- escrita: nome de pasta é material de narrador ("Emboscada do ato 3",
-- "PNs que ainda não apareceram") e não deve vazar pro jogador só
-- porque ele participa da campanha. O diretório do jogador continua
-- sendo a lista plana dos personagens que ele controla
-- (`listControlledCharacters`), sem pasta nenhuma — nenhuma consulta
-- do jogador toca estas tabelas.
--
-- INTEGRIDADE:
--   · `campaign_character_placements` amarra personagem e campanha por
--     FK COMPOSTA contra `characters (id, campaign_id)` — o mesmo
--     mecanismo (e o mesmo índice único, criado na 0051) que
--     `character_controllers` usa. Personagem sem campanha não pode ser
--     colocado em pasta nenhuma, e mover o personagem de campanha
--     apaga a colocação em cascata em vez de deixá-la órfã.
--   · `folder_id` também é FK composta contra
--     `campaign_character_folders (id, campaign_id)`: é impossível
--     colocar um personagem numa pasta de OUTRA campanha.
--   · Ciclos e profundidade da árvore são barrados por trigger (um
--     `check` não consegue enxergar outra linha).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Árvore de pastas
-- ---------------------------------------------------------------------
create table if not exists campaign_character_folders (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  parent_id   uuid references campaign_character_folders(id) on delete cascade,
  nome        text not null,
  posicao     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint campaign_character_folders_nome_ck
    check (length(btrim(nome)) between 1 and 60),
  constraint campaign_character_folders_posicao_ck
    check (posicao >= 0),
  constraint campaign_character_folders_nao_e_pai_de_si_ck
    check (parent_id is null or parent_id <> id)
);

-- Par único exigido pela FK composta de `placements` (garante que a
-- pasta referenciada é da MESMA campanha).
create unique index if not exists campaign_character_folders_id_campaign_uidx
  on campaign_character_folders (id, campaign_id);

create index if not exists campaign_character_folders_campanha_idx
  on campaign_character_folders (campaign_id, parent_id, posicao);

comment on table campaign_character_folders is
  'Pastas do diretório de Personagens do painel da Mesa (por campanha, árvore com no máximo 3 níveis). Só o narrador dono lê e escreve.';

-- ---------------------------------------------------------------------
-- Colocação (pasta + ordem manual) de cada personagem
-- ---------------------------------------------------------------------
create table if not exists campaign_character_placements (
  character_id uuid primary key,
  campaign_id  uuid not null,
  folder_id    uuid,
  posicao      integer not null default 0,
  updated_at   timestamptz not null default now(),
  constraint campaign_character_placements_posicao_ck
    check (posicao >= 0),
  foreign key (character_id, campaign_id)
    references characters (id, campaign_id)
    on delete cascade,
  foreign key (folder_id, campaign_id)
    references campaign_character_folders (id, campaign_id)
    on delete set null
);

create index if not exists campaign_character_placements_campanha_idx
  on campaign_character_placements (campaign_id, folder_id, posicao);

comment on table campaign_character_placements is
  'Pasta e ordem manual de um personagem no diretório do painel da Mesa. Personagem sem linha aqui vive na raiz, em ordem alfabética.';

-- ---------------------------------------------------------------------
-- Trigger de integridade da árvore — pai na mesma campanha, sem ciclo,
-- profundidade máxima 3 (raiz + duas subpastas). O limite existe pra
-- manter a navegação do painel legível e pra dar um teto barato ao
-- laço de detecção de ciclo abaixo.
-- ---------------------------------------------------------------------
create or replace function campaign_character_folders_valida_arvore()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pai      campaign_character_folders;
  v_atual    uuid := new.parent_id;
  v_profund  integer := 1;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_pai from campaign_character_folders where id = new.parent_id;
  if v_pai is null then
    raise exception 'Pasta pai não encontrada.' using errcode = 'foreign_key_violation';
  end if;
  if v_pai.campaign_id <> new.campaign_id then
    raise exception 'Pasta pai pertence a outra campanha.' using errcode = 'foreign_key_violation';
  end if;

  -- Sobe a cadeia de pais: se reencontrar a própria pasta, é ciclo; se
  -- passar do teto, é fundo demais. O laço é limitado pelo teto, então
  -- nunca roda indefinidamente nem em dado corrompido.
  while v_atual is not null loop
    if v_atual = new.id then
      raise exception 'Uma pasta não pode ser descendente de si mesma.' using errcode = 'check_violation';
    end if;
    v_profund := v_profund + 1;
    if v_profund > 3 then
      raise exception 'O diretório aceita no máximo 3 níveis de pasta.' using errcode = 'check_violation';
    end if;
    select parent_id into v_atual from campaign_character_folders where id = v_atual;
  end loop;

  return new;
end;
$$;

drop trigger if exists campaign_character_folders_valida_arvore_trg on campaign_character_folders;
create trigger campaign_character_folders_valida_arvore_trg
  before insert or update of parent_id, campaign_id on campaign_character_folders
  for each row execute function campaign_character_folders_valida_arvore();

-- ---------------------------------------------------------------------
-- `updated_at` automático — nenhuma Server Action precisa lembrar.
-- ---------------------------------------------------------------------
create or replace function toca_updated_at_painel_personagens()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists campaign_character_folders_updated_at_trg on campaign_character_folders;
create trigger campaign_character_folders_updated_at_trg
  before update on campaign_character_folders
  for each row execute function toca_updated_at_painel_personagens();

drop trigger if exists campaign_character_placements_updated_at_trg on campaign_character_placements;
create trigger campaign_character_placements_updated_at_trg
  before update on campaign_character_placements
  for each row execute function toca_updated_at_painel_personagens();

-- ---------------------------------------------------------------------
-- RLS — narrador dono da campanha, e ninguém mais (nem `anon`).
-- ---------------------------------------------------------------------
alter table campaign_character_folders enable row level security;
alter table campaign_character_placements enable row level security;

drop policy if exists campaign_character_folders_owner_all on campaign_character_folders;
create policy campaign_character_folders_owner_all on campaign_character_folders
  for all to authenticated
  using (is_campaign_owner(campaign_id))
  with check (is_campaign_owner(campaign_id));

drop policy if exists campaign_character_placements_owner_all on campaign_character_placements;
create policy campaign_character_placements_owner_all on campaign_character_placements
  for all to authenticated
  using (is_campaign_owner(campaign_id))
  with check (is_campaign_owner(campaign_id));

revoke all on campaign_character_folders from anon, authenticated;
revoke all on campaign_character_placements from anon, authenticated;
grant select, insert, update, delete on campaign_character_folders to authenticated;
grant select, insert, update, delete on campaign_character_placements to authenticated;

revoke all on function campaign_character_folders_valida_arvore() from public, anon;
revoke all on function toca_updated_at_painel_personagens() from public, anon;

commit;
