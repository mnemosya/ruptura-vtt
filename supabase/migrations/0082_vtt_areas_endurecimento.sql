-- =====================================================================
-- 0082 — Endurecimento pós-auditoria de `vtt_areas` (0081).
--
-- Três problemas CONFIRMADOS por teste adversarial direto contra as
-- RPCs (não apenas leitura de código):
--
--  1. Uma Aura podia ser criada/editada apontando pra um token OCULTO
--     que o próprio criador não consegue ver — `vtt_validar_area`
--     checava cena/campanha do token, nunca visibilidade.
--  2. `origem_q`/`origem_r` não tinham limite de magnitude (aceito:
--     1e15) — puramente um problema de robustez a entrada abusiva
--     (nenhuma regra de jogo depende de coordenada tão grande), mas um
--     valor assim, combinado com o item 3, é o vetor real de
--     travamento de cliente.
--  3. Cada ponto de `pontos` (Parede/Personalizada) só era validado
--     como "é um número JSON" — sem limite de magnitude (aceito:
--     1e9). Isso é o achado mais sério: a caixa envolvente de uma
--     Parede/Personalizada com um vértice desses vira a base do laço
--     de busca de células candidatas no cliente
--     (`_dominio/areaEfeito.ts::celulasCandidatas`), que hoje NÃO
--     recorta essa caixa contra o tamanho real do mapa antes de
--     iterar — um vértice adversarial (ou um bug futuro) pendura a
--     aba de QUALQUER sessão que renderize essa área. A correção
--     complementar do lado do cliente (recortar a caixa contra
--     `largura`/`altura` da cena antes de iterar) está fora desta
--     migration — é código TypeScript, não SQL — mas as duas quase
--     eliminam a classe inteira: sem este limite, mesmo a correção do
--     cliente teria que lidar com coordenadas arbitrariamente grandes
--     por outros vetores (edição direta no banco, dado histórico).
--
-- LIMITE ESCOLHIDO: ±1000 unidades axiais. O mapa mais largo permitido
-- por `vtt_scenes` é 200 células (`largura`/`altura between 1 and
-- 200`, migration 0065) — 1000 dá 5× de folga pra uma origem legítima
-- ficar um pouco fora da borda visível sem chegar perto de qualquer
-- valor que preocupe performance (mesmo o pior caso teórico, uma
-- Parede/Personalizada com vértices nos extremos opostos de ±1000,
-- gera uma caixa de 2000×2000 = 4.000.000 candidatos — grande, mas
-- finito e não é mais o "trava o navegador" de 1e9; combinado com o
-- recorte do lado do cliente contra o tamanho real da cena, o número
-- de candidatos OBSERVADOS por qualquer usuário nunca passa de
-- `largura × altura` da própria cena, no máximo 200×200 = 40.000).
--
-- ACHADO REGISTRADO, NÃO CORRIGIDO AQUI (fora do escopo desta rodada,
-- sistêmico e pré-existente): o papel `anon` tem EXECUTE em TODA
-- função já criada neste projeto (inclusive `move_vtt_token`,
-- `create_vtt_token` de migrations 0065-0080) via
-- `ALTER DEFAULT PRIVILEGES` do schema `public`, nunca revogado
-- explicitamente — `revoke all ... from public` não atinge um grant
-- que já foi concedido DIRETAMENTE a `anon` no momento da criação da
-- função. A lógica interna de cada RPC (baseada em `auth.uid()`, nulo
-- pra `anon`) já recusa qualquer escrita real — não há exploração
-- conhecida — mas é privilégio maior que o necessário. Esta migration
-- fecha isso SÓ para as RPCs de área (nosso escopo); as funções mais
-- antigas não são tocadas (não editamos migrations anteriores) e o
-- padrão mais amplo fica registrado no relatório desta auditoria.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Limite de magnitude da origem
-- ---------------------------------------------------------------------
alter table vtt_areas
  add constraint vtt_areas_origem_q_magnitude check (origem_q is null or abs(origem_q) <= 1000),
  add constraint vtt_areas_origem_r_magnitude check (origem_r is null or abs(origem_r) <= 1000);

-- ---------------------------------------------------------------------
-- 2. `vtt_area_pontos_validos` passa a checar magnitude de CADA ponto,
--    além de checar que é um array de objetos {q,r} numéricos entre
--    2 e 64 elementos (comportamento anterior, preservado).
-- ---------------------------------------------------------------------
create or replace function vtt_area_pontos_validos(p_pontos jsonb, p_minimo integer)
returns boolean
language sql
immutable
as $$
  select p_pontos is not null
     and jsonb_typeof(p_pontos) = 'array'
     and jsonb_array_length(p_pontos) between p_minimo and 64
     and not exists (
       select 1 from jsonb_array_elements(p_pontos) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'q') <> 'number'
          or jsonb_typeof(e -> 'r') <> 'number'
          or abs((e ->> 'q')::numeric) > 1000
          or abs((e ->> 'r')::numeric) > 1000
     );
$$;

-- ---------------------------------------------------------------------
-- 3. `vtt_validar_area` passa a exigir que o token de origem de uma
--    Aura seja VISÍVEL pra quem está criando/editando (narrador sempre
--    vê; jogador só o que a RLS de `vtt_tokens_select` já deixaria ele
--    ler). Mesma função `vtt_token_visivel_para` que a policy de
--    SELECT de `vtt_areas` já usa — nunca uma segunda checagem de
--    visibilidade que possa divergir dela.
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
  if not pode_gerenciar_vtt_areas(p_campaign_id) then
    raise exception 'Você não tem autorização para criar ou alterar áreas nesta campanha.' using errcode = 'insufficient_privilege';
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
-- 4. Privilégio excessivo — fecha o `anon` fora das RPCs de escrita e
--    das funções internas de área (escopo desta migration só).
-- ---------------------------------------------------------------------
revoke execute on function create_vtt_area(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb, uuid, text, numeric, text, boolean) from anon;
revoke execute on function update_vtt_area(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb, uuid, text, numeric, text, boolean, integer) from anon;
revoke execute on function duplicate_vtt_area(uuid) from anon;
revoke execute on function delete_vtt_area(uuid) from anon;
revoke execute on function set_vtt_area_permissao(uuid, uuid, boolean) from anon;
revoke execute on function pode_gerenciar_vtt_areas(uuid, uuid) from anon;
revoke execute on function vtt_token_visivel_para(uuid, uuid) from anon;
revoke execute on function vtt_validar_area(uuid, uuid, text, uuid, jsonb) from anon;
revoke execute on function vtt_area_pontos_validos(jsonb, integer) from anon;
revoke execute on function vtt_publicar_areas_alteradas(uuid, uuid) from anon;
revoke execute on function vtt_areas_changed_channel_autorizado(text) from anon;

commit;
