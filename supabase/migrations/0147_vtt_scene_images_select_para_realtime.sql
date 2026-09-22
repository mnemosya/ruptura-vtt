-- =====================================================================
-- 0147 — A imagem da cena volta a chegar ao vivo (RT-03).
--
-- ── O defeito ────────────────────────────────────────────────────────
--
-- O narrador coloca uma imagem na cena — planta, mapa, handout — e
-- NINGUÉM na mesa vê até recarregar a página.
--
-- Medido: a colocação existe no banco, `read_vtt_scene_images` devolve
-- ela normalmente, a assinatura do Realtime é ACEITA (o servidor
-- responde `status: ok`), nenhum payload de `vtt_scene_images` chega
-- pelo WebSocket, e depois de um reload a imagem aparece.
--
-- ── A causa ──────────────────────────────────────────────────────────
--
-- `vtt_scene_images` estava com RLS ligada, ZERO políticas e SEM grant
-- de select para `authenticated`. O app lê essa tabela por RPC
-- `security definer` (`read_vtt_scene_images`), então o fechamento
-- total nunca incomodou ninguém no caminho normal.
--
-- Mas o Realtime entrega uma linha ao assinante só se ele puder
-- SELECIONÁ-la sob RLS. Sem grant e sem política, nenhuma linha é
-- entregue — nunca. Todas as outras sete tabelas do mesmo canal têm
-- exatamente uma política de select.
--
-- É o RT-01 pela metade. Lá o filtro no servidor era recusado e isso
-- derrubava o canal INTEIRO; a correção removeu o filtro e curou o dano
-- colateral (terreno, marcas, medições e áreas voltaram a chegar), mas
-- a imagem em si continuou sem chegar. Nada percebeu porque não havia
-- verificação ao vivo dessa camada — agora há
-- (`check-cena-ao-vivo.ts`, critérios 2 e 6).
--
-- ── A regra, e por que ela é EXATAMENTE esta ─────────────────────────
--
-- A política espelha, linha por linha, o que `read_vtt_scene_images` já
-- aplica hoje:
--
--   · `vtt_pode_ver_cena(scene_id)` — a mesma porta da cena que a RPC
--     abre antes de devolver qualquer coisa;
--   · `visivel or is_campaign_owner(campaign_id)` — colocação escondida
--     só para o narrador, que precisa enxergar o que escondeu para
--     poder trabalhar.
--
-- Ela é idêntica em forma à de `vtt_objects`, que resolve o mesmo
-- problema para a mesma pergunta.
--
-- NÃO é mais permissiva que o caminho que já existia: quem passa nesta
-- política já recebia estas mesmas colocações pela RPC. O que muda é a
-- porta, não o conteúdo — e é a porta que o Realtime precisa enxergar.
--
-- ── O que continua fechado ───────────────────────────────────────────
--
-- Só SELECT. Insert, update e delete seguem sem grant e sem política:
-- escrever nesta tabela continua sendo exclusividade das RPCs, que é
-- onde moram a reserva de quota, a revalidação de intenção e o controle
-- de revisão.
-- =====================================================================

begin;

grant select on public.vtt_scene_images to authenticated;

drop policy if exists vtt_scene_images_select on public.vtt_scene_images;
create policy vtt_scene_images_select on public.vtt_scene_images
  for select
  using (
    public.vtt_pode_ver_cena(scene_id)
    and (visivel or public.is_campaign_owner(campaign_id))
  );

comment on policy vtt_scene_images_select on public.vtt_scene_images is
  'Espelha read_vtt_scene_images: cena visível para a pessoa, e colocação escondida só para o narrador. Existe para o Realtime poder entregar a linha — sem política, postgres_changes nunca entrega nada (RT-03).';

commit;
