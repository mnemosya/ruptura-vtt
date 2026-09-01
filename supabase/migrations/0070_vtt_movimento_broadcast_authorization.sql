-- =====================================================================
-- Ruptura VTT — Animação de movimento de token
-- Migration: 0070_vtt_movimento_broadcast_authorization
--
-- Autorização de Realtime (Broadcast) pro canal
-- `campaign:{id}:vtt:movimento` (src/app/mesas/[campaignId]/vtt/
-- _realtime/vttRealtime.ts, `subscribeToVttTokenMovement`) — evento
-- EFÊMERO com a rota expandida de um movimento de token, transmitido
-- pra outros clientes reproduzirem a mesma animação (a linha que
-- `postgres_changes` entrega em `vtt_tokens` só tem a posição final,
-- sem rota).
--
-- MESMO princípio já usado pra Presence (migration 0062, mesmo
-- raciocínio documentado lá): Broadcast não herda a RLS de
-- `campaign_members` automaticamente — é uma autorização SEPARADA,
-- específica de Realtime, e sem `private: true` + policy aqui,
-- qualquer client que soubesse o UUID da campanha (não é segredo, está
-- na URL) podia entrar no canal e ouvir/forjar movimentos de token de
-- qualquer campanha.
--
-- Canal PRÓPRIO (`campaign:{id}:vtt:movimento`), separado do canal já
-- existente de `postgres_changes` (`campaign:{id}:vtt`, sem
-- `private: true` — não precisa: autorização de `postgres_changes` vem
-- da RLS das TABELAS, não de `realtime.messages`) — aditivo de baixo
-- risco, não reconfigura o canal já testado e em produção.
--
-- MESMO REQUISITO DE IMPLANTAÇÃO da 0062, não consultável nem
-- aplicável por SQL: "Allow public access" precisa estar DESLIGADO em
-- supabase.com/dashboard/project/_/realtime/settings — com essa opção
-- ligada, o Realtime ignora `private`/RLS pra qualquer canal. Já
-- confirmado desligado pra este projeto na 0062 (teste negativo real);
-- um ambiente novo (staging, outro projeto) precisa da mesma checagem
-- antes de confiar na policy abaixo.
--
-- MESMA limitação que Presence já documenta e não tem como fechar por
-- SQL: o payload do broadcast é escolhido pelo CLIENTE — um
-- participante de verdade ainda pode, chamando a API diretamente
-- (fora do app), publicar um evento com `tokenId`/`rota` inventados.
-- Por isso o evento é só a APRESENTAÇÃO da animação, nunca a fonte de
-- verdade: `move_vtt_token` (RPC, `security definer`, migrations
-- 0066/0069) continua sendo quem de fato move o token, com toda a
-- validação de permissão/adjacência/bloqueio já existente — um evento
-- forjado no máximo anima visualmente algo que a chamada real de RPC
-- vai aceitar ou recusar do mesmo jeito de sempre.
-- =====================================================================

begin;

create policy "campaign_members_use_movimento_channel"
on "realtime"."messages"
for all
to authenticated
using (
  is_campaign_member(
    (regexp_match(realtime.topic(), '^campaign:([0-9a-fA-F-]{36}):vtt:movimento$'))[1]::uuid
  )
)
with check (
  is_campaign_member(
    (regexp_match(realtime.topic(), '^campaign:([0-9a-fA-F-]{36}):vtt:movimento$'))[1]::uuid
  )
);

commit;
