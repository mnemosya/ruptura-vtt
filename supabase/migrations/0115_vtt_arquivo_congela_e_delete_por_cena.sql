-- =====================================================================
-- 0115 — Duas lacunas da auditoria 0112: DELETE atravessa cena, e
--        "arquivada" não congelava nada
--
-- ── 1. DELETE ────────────────────────────────────────────────────────
--
-- A 0112 trocou o predicado dos INSERT de marcação e medição e deixou
-- os DELETE como estavam, com a justificativa de que "ninguém tem o
-- que apagar numa cena onde nunca escreveu". A justificativa é falsa, e
-- o contraexemplo é simples: o jogador cria uma marcação na cena
-- apresentada, o narrador apresenta outra cena, e o jogador continua
-- com o id daquela linha na memória do navegador. As policies antigas
-- conferem só autoria — nada impedia o DELETE depois da troca. O mesmo
-- vale para uma cena arquivada com marcações antigas dele.
--
-- ── 2. Arquivada ≠ congelada ─────────────────────────────────────────
--
-- `vtt_pode_interagir_cena` recusa cena arquivada, mas só vale onde foi
-- plantado. As RPCs narrador-only (token, objeto, trilha, configuração,
-- camadas) conferem `is_campaign_owner` e nada mais — e narrador de
-- campanha arquivada continua sendo narrador. Resultado: arquivar
-- escondia a cena do catálogo sem torná-la imutável.
--
-- A correção NÃO é remendar as ~20 funções uma a uma. São ~20 corpos
-- regenerados a partir do banco vivo, que é justamente a prática de
-- maior risco desta leva — e não cobriria a vigésima primeira, escrita
-- no mês que vem. É um GATILHO por tabela de conteúdo: uma regra, um
-- lugar, válida para todo caminho de escrita que exista hoje ou venha
-- a existir, RPC `SECURITY DEFINER` inclusive (gatilho não é RLS; roda
-- mesmo quando a policy é ignorada).
--
-- O gatilho é por LINHA, não por comando, de propósito: a versão por
-- comando com tabelas de transição seria mais barata e bem menos
-- óbvia, e o que se ganha em ciclos aqui se paga em quem lê. A consulta
-- é busca por chave primária numa tabela pequena.
--
-- ESCAPE: sessão sem `auth.uid()` passa. É a service role — a coleta de
-- lixo de imagens, os scripts de manutenção e as próprias migrations
-- precisam mexer em cena arquivada, e é o mesmo princípio que o resto
-- do projeto já usa (service role ignora RLS por construção).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. DELETE por cena
-- ---------------------------------------------------------------------
drop policy if exists vtt_marks_delete on vtt_marks;
create policy vtt_marks_delete on vtt_marks
  for delete to authenticated
  using (
    public.vtt_pode_interagir_cena(scene_id)
    and (autor_id = (select auth.uid()) or is_campaign_owner(campaign_id))
  );

drop policy if exists vtt_measurements_delete on vtt_measurements;
create policy vtt_measurements_delete on vtt_measurements
  for delete to authenticated
  using (
    public.vtt_pode_interagir_cena(scene_id)
    and (autor_id = (select auth.uid()) or is_campaign_owner(campaign_id))
  );

-- ---------------------------------------------------------------------
-- 2. O congelamento
-- ---------------------------------------------------------------------
create or replace function public.vtt_recusar_escrita_em_cena_arquivada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scene_id uuid := coalesce(new.scene_id, old.scene_id);
begin
  -- Sem sessão = service role (coleta, manutenção, migration). Passa.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if exists (select 1 from public.vtt_scenes s
              where s.id = v_scene_id and s.archived_at is not null) then
    raise exception 'Esta cena está arquivada — restaure antes de editar.'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.vtt_recusar_escrita_em_cena_arquivada is
  'Gatilho: nenhuma escrita de usuário entra em cena arquivada, por qualquer caminho. Vale onde a RLS não vale (RPC SECURITY DEFINER). Service role passa.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'vtt_tokens', 'vtt_terrain', 'vtt_marks', 'vtt_measurements',
    'vtt_areas', 'vtt_objects', 'vtt_object_cells', 'vtt_turn_tracks',
    'vtt_scene_images'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'vtt_congela_' || t, t);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.vtt_recusar_escrita_em_cena_arquivada()',
      'vtt_congela_' || t, t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 3. A própria linha da cena
--
-- `vtt_scenes` não entra no laço acima: ela não tem `scene_id`, e nem
-- tudo nela deve congelar. Uma cena arquivada precisa continuar podendo
-- ser REORDENADA (ela aparece na aba de arquivo) e, sobretudo,
-- RESTAURADA — um congelamento que impedisse `archived_at = null`
-- trancaria a porta por dentro.
--
-- Então o congelamento aqui é do CONTEÚDO: nome, local, resumo,
-- dimensões e camadas. É o que `set_vtt_scene_config` (0097) e
-- `set_vtt_scene_camadas` (0093) escrevem — as duas RPCs que conferem
-- só `is_campaign_owner` e que, sem isto, editariam cena arquivada.
-- ---------------------------------------------------------------------
create or replace function public.vtt_recusar_edicao_de_cena_arquivada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or old.archived_at is null then
    return new;
  end if;

  if (new.nome, new.local, new.resumo, new.largura, new.altura, new.camadas)
     is distinct from
     (old.nome, old.local, old.resumo, old.largura, old.altura, old.camadas) then
    raise exception 'Esta cena está arquivada — restaure antes de editar.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.vtt_recusar_edicao_de_cena_arquivada is
  'Gatilho: cena arquivada não muda de conteúdo. Ordem, `ativa` e o próprio `archived_at` continuam livres — senão não haveria como reordenar o arquivo nem restaurar.';

drop trigger if exists vtt_congela_vtt_scenes on public.vtt_scenes;
create trigger vtt_congela_vtt_scenes
  before update on public.vtt_scenes
  for each row execute function public.vtt_recusar_edicao_de_cena_arquivada();

commit;
