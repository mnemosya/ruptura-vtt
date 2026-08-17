-- =====================================================================
-- Ruptura VTT — Reestrutura da área de campanha, Fase 3b
-- Migration: 0062_campaign_presence_authorization
--
-- Autorização de Realtime (Presence) pro canal `presence:campaign:{id}`
-- (src/lib/realtime/presenceRealtime.ts) — achado de auditoria: o canal
-- era criado só com `config.presence.key`, sem `private: true` nem
-- policy nenhuma em `realtime.messages`. Sem isso, QUALQUER client que
-- descobrisse o UUID da campanha (não é segredo — aparece na URL)
-- podia entrar no canal e ver quem está online, mesmo sem ser
-- participante — Presence não herda a RLS de `campaign_members`
-- automaticamente, é uma autorização SEPARADA, específica de Realtime.
--
-- O que esta migration resolve: quem pode ENTRAR no canal (ler presença
-- e publicar a própria). O que ela NÃO resolve, e não tem como resolver
-- por SQL: um participante DE VERDADE (autorizado a entrar) ainda pode,
-- em tese, chamar `track()` com uma `key` que não é a própria — a chave
-- de presença é uma string que o CLIENTE escolhe, o Realtime não valida
-- ela contra `auth.uid()`. Por isso `onlineUserIds`/Presence é e
-- continua sendo um sinal DECORATIVO, nunca autoritativo — ver o aviso
-- em `presenceRealtime.ts` e no campo `onlineUserIds` do contexto do
-- provider. Esta migration fecha "gente de fora vendo/participando do
-- canal"; não fecha (porque Realtime não oferece como fechar)
-- "participante legítimo mentindo sobre QUAL participante ele é".
--
-- REQUISITO DE IMPLANTAÇÃO, não consultável nem aplicável por SQL:
-- "Allow public access" precisa estar DESLIGADO em
-- supabase.com/dashboard/project/_/realtime/settings. Com essa opção
-- ligada (aparenta ser o padrão de projetos novos), o Realtime ignora
-- `private: true` e as policies abaixo para qualquer canal — não há
-- Management API nem SQL pra ler ou mudar esse valor, só o painel.
--
-- Para o projeto ATUAL, o enforcement já foi CONFIRMADO — não por
-- leitura do toggle, por TESTE NEGATIVO real: uma conta autenticada mas
-- não-membro tentando entrar no canal `presence:campaign:{id}` recebe
-- `CHANNEL_ERROR` e nunca sincroniza, enquanto um membro de verdade
-- assina normalmente pelo MESMO código — se a opção estivesse ligada,
-- os dois teriam sucesso igual (`check-campanha-presence-fase3b.ts`,
-- critério 6). Continua documentado aqui porque esta migration não
-- garante essa configuração externa: um projeto Supabase NOVO (staging,
-- outro ambiente) precisa da mesma checagem antes de confiar na policy
-- abaixo — rode o teste negativo lá, não assuma "já deve estar certo".
-- =====================================================================

begin;

-- RLS já vem ligada por padrão em `realtime.messages` (tabela do
-- próprio serviço Realtime) — não precisa de `alter table`, só das
-- policies. `for all` cobre leitura (entrar/ouvir presença) e escrita
-- (`track()`), o mesmo padrão usado pelas outras duas RPCs desta área
-- (`is_campaign_member`, migration 0026).
--
-- `realtime.topic()` devolve o nome do canal que o client está
-- tentando usar — comparado contra o padrão exato que
-- `buildCampaignPresenceChannelName` gera (`presence:campaign:<uuid>`).
-- Tópico que não bate com o padrão (`regexp_match` sem resultado) cai
-- em `is_campaign_member(null)`, que a função já trata como "não
-- autorizado" (nenhuma linha de `campaigns`/`campaign_members` tem id
-- null) — nunca um erro de cast, só nega.
create policy "campaign_members_use_presence_channel"
on "realtime"."messages"
for all
to authenticated
using (
  is_campaign_member(
    (regexp_match(realtime.topic(), '^presence:campaign:([0-9a-fA-F-]{36})$'))[1]::uuid
  )
)
with check (
  is_campaign_member(
    (regexp_match(realtime.topic(), '^presence:campaign:([0-9a-fA-F-]{36})$'))[1]::uuid
  )
);

commit;
