"use client";

/**
 * Presence de campanha (Fase 3b da reestrutura) — quem está com a
 * campanha ABERTA agora, não quem É membro (isso já é `roster`, Fases
 * 0/3 — dado persistente, vem do banco). Presence é efêmero: nunca toca
 * `campaign_members` nem nenhuma tabela — existe só enquanto o
 * WebSocket estiver vivo, propagado pelo próprio Supabase Realtime
 * entre os clients conectados ao mesmo canal (`track`/`untrack`, não
 * INSERT/UPDATE/DELETE).
 *
 * ── Autorização do canal (achado de auditoria) ──────────────────────
 * Presence/Broadcast NÃO herdam a RLS de `campaign_members` automático
 * — é uma autorização SEPARADA, de canal, que só existe se o canal for
 * `private: true` E houver policy em `realtime.messages` (migration
 * `0062_campaign_presence_authorization`, usa `is_campaign_member` — a
 * MESMA função que autoriza `list_campaign_roster`). Sem isso, qualquer
 * client que soubesse o UUID da campanha (não é segredo, está na URL)
 * podia entrar no canal e ver quem está online sem ser participante.
 *
 * O que a autorização de canal NÃO resolve, e Realtime não oferece como
 * resolver: a `key` de presença (linha abaixo) é uma STRING QUE O
 * CLIENTE ESCOLHE — o servidor não valida `key === auth.uid()`. Um
 * participante DE VERDADE (que passa pela autorização de canal) ainda
 * poderia, chamando a API diretamente, `track()` como se fosse outro
 * userId do roster. Por isso `onlineUserIds` é e sempre será um sinal
 * DECORATIVO — nunca uma fonte de autorização, nunca base pra decisão
 * de gameplay (quem pode agir, quem viu o quê). Se algum dia isso
 * importar de verdade, a resposta é um dado diferente, verificado
 * server-side — não presença.
 *
 * REQUISITO DE IMPLANTAÇÃO, não consultável nem aplicável por código:
 * "Allow public access" precisa estar DESLIGADO em
 * supabase.com/dashboard/project/_/realtime/settings — com essa opção
 * ligada, o Realtime ignora `private`/RLS pra qualquer canal. Não há
 * SQL nem Management API pra ler ou mudar esse valor (confirmado contra
 * a documentação oficial); só o dashboard. Para o projeto ATUAL, o
 * enforcement já foi confirmado por TESTE NEGATIVO real (não por leitura
 * do toggle): uma conta autenticada mas não-membro tentando entrar
 * neste canal recebe `CHANNEL_ERROR` e nunca sincroniza, enquanto um
 * membro de verdade assina normalmente pelo mesmo código — se a opção
 * estivesse ligada, os dois teriam sucesso igual (`check-campanha-
 * presence-fase3b.ts`, critério 6). Continua documentado aqui porque
 * migrations não garantem essa configuração externa: um projeto Supabase
 * NOVO (staging, outro ambiente) precisa da mesma checagem — o teste
 * negativo é o jeito de confirmar, não a suposição de que "já deve estar
 * certo". Ver a nota completa na migration 0062.
 *
 * Pré-requisito desta fase (já resolvido nas correções pós-auditoria da
 * Fase 3): o client de Realtime do browser precisa estar AUTENTICADO
 * (`setBrowserSupabaseRealtimeAuth`) e com o token RENOVADO — Presence
 * usa o mesmo client, e um canal `private: true` exige handshake
 * autenticado pra sequer tentar a autorização acima.
 *
 * MÚLTIPLAS ABAS DO MESMO USUÁRIO CONTAM COMO UMA presença — mas a
 * dedupe é feita AQUI, no cliente, NUNCA compartilhando a `key` do
 * Realtime entre abas. Achado de auditoria, direto de teste (não
 * suposição): com `config.presence.key = userId` (a versão anterior
 * deste arquivo), abrir uma SEGUNDA aba do mesmo usuário faz as duas
 * conexões dividirem uma chave já ocupada — e a partir daí o `leave` de
 * QUALQUER uma das duas conexões (mesmo a única que sobra depois de
 * fechar a outra) parava de ser processado pelo Realtime: a entrada
 * ficava presa em `presenceState()` para sempre, confirmado com um
 * client observador independente (fora da UI, fora do app) vendo o
 * mesmo estado travado. Uma única conexão sob uma key nunca compartilhada
 * sempre limpou em ~2s, medido repetidamente. Então cada CONEXÃO
 * (aba/socket) recebe uma key PRÓPRIA (gerada aqui, sem relação com
 * `userId`), e o `userId` vai dentro do PAYLOAD rastreado
 * (`track({ user_id, online_at })`) — a dedupe "múltiplas abas = 1"
 * vira um `Set` no cliente (`onOnlineChange`, abaixo), lendo o
 * `user_id` de cada entrada de `presenceState()` independente de quem
 * é a key. Zero dependência do comportamento de merge do Realtime pra
 * chaves compartilhadas — só o que já provamos ser confiável (uma
 * conexão, uma key, leave sempre processado rápido).
 *
 * TIMEOUT DE DESCONEXÃO: não é implementado por conta própria, de
 * propósito. O Supabase Realtime já detecta socket morto (aba fechada,
 * rede caiu, laptop suspenso) via o heartbeat do próprio protocolo
 * Phoenix/WebSocket e dispara o evento `leave` sozinho — não há como
 * (nem motivo pra) reimplementar isso do lado do cliente sem acesso ao
 * servidor Realtime. "Tempo razoável" (critério da Fase 3b) é o próprio
 * heartbeat do Supabase, não um número que este módulo escolhe — e só é
 * rápido de verdade com uma conexão por key (ver acima).
 */

import type { RealtimeChannel, RealtimePresenceState } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "../supabase/browserClient";
import type { RealtimeStatus } from "./tableRealtime";

export function buildCampaignPresenceChannelName(campaignId: string): string {
  return `presence:campaign:${campaignId}`;
}

function mapPresenceChannelStatus(status: string): RealtimeStatus {
  if (status === "SUBSCRIBED") return "subscribed";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") return "error";
  return "connecting";
}

interface PresencePayload {
  user_id?: string;
  online_at?: string;
}

/**
 * Assina o canal de presença da campanha. `onOnlineChange` recebe o
 * conjunto ATUAL e completo de `userId`s online a cada `sync` — nunca
 * um delta parcial, então quem consome não precisa reconciliar
 * join/leave por conta própria (o próprio Realtime já resolveu isso
 * antes de emitir `sync`). A dedupe de múltiplas abas é feita AQUI
 * (lendo `user_id` de cada entrada, não a `key` do Realtime) — ver o
 * porquê no cabeçalho do arquivo.
 */
export function subscribeToCampaignPresence(params: {
  campaignId: string;
  userId: string;
  onOnlineChange: (onlineUserIds: Set<string>) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) {
    params.onStatusChange?.("disabled");
    return () => {};
  }

  // `private: true` é o que efetivamente ativa a autorização de canal
  // (ver cabeçalho do arquivo) — sem isto, o Realtime trata o canal
  // como público e a policy da migration 0062 nunca chega a rodar.
  //
  // Key ALEATÓRIA, gerada aqui, ÚNICA por conexão — nunca `userId`.
  // Achado ao testar: `config.presence` sofre um `Object.assign` RASO
  // contra o default `{ key: '', enabled: false }` (realtime-js) — pass
  // ar `presence: {}` (tentativa de "deixar o Realtime escolher a key")
  // zera o campo `key` de vez (some, vira `undefined`), e a sincronização
  // nunca aconteceu num teste real (`presenceSyncStatus` travado em
  // "connecting" pra sempre). Gerar a própria key evita depender de
  // qualquer comportamento implícito do lado do servidor.
  const chaveDaConexao = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const channel: RealtimeChannel = client.channel(buildCampaignPresenceChannelName(params.campaignId), {
    config: { private: true, presence: { key: chaveDaConexao } },
  });

  channel.on("presence", { event: "sync" }, () => {
    const estado = channel.presenceState<PresencePayload>() as RealtimePresenceState<PresencePayload>;
    const idsOnline = new Set<string>();
    for (const entradas of Object.values(estado)) {
      for (const entrada of entradas) {
        if (typeof entrada.user_id === "string") idsOnline.add(entrada.user_id);
      }
    }
    params.onOnlineChange(idsOnline);
  });

  channel.subscribe((status) => {
    params.onStatusChange?.(mapPresenceChannelStatus(status));
    if (status === "SUBSCRIBED") {
      // `track` só depois de `SUBSCRIBED` — o canal precisa ter
      // completado o join antes de aceitar broadcast de presença.
      // `user_id` no PAYLOAD (não na key) é o que permite a dedupe de
      // múltiplas abas no cliente, sem depender de compartilhar key.
      channel.track({ user_id: params.userId, online_at: new Date().toISOString() } satisfies PresencePayload);
    }
  });

  return () => {
    channel.untrack();
    client.removeChannel(channel);
  };
}
