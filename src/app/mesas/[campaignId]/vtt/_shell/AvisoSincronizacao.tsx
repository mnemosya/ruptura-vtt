"use client";

/**
 * "VOCÊ PAROU DE RECEBER EVENTOS" — o aviso de sincronização, agora uma
 * peça do palco.
 *
 * O socket de realtime é autenticado por um token que expira e se
 * renova sozinho. Quando a renovação falha, ele morre e a mesa
 * emudece: token que o narrador move não anda, mensagem do chat não
 * chega, roster e presença congelam. E o modo de falha é SILENCIOSO —
 * não há erro na tela, nada pisca. Parece mesa parada, não conexão
 * caída. É esse silêncio que isto quebra.
 *
 * Ele morava no cabeçalho da casca, escolhido por ser "a única
 * superfície visível em toda rota". Só que na Mesa a casca inteira era
 * desenhada DEBAIXO do VTT (`position: fixed; inset: 0`): o aviso
 * existia no DOM e não chegava a olho nenhum, justo na rota onde ficar
 * mudo é mais caro. Aqui ele flutua sobre o mapa, como os outros
 * avisos da mesa.
 *
 * TRÊS diferenças em relação ao aviso comum do palco (`rv-aviso-palco`),
 * e cada uma tem motivo:
 *
 *   · NÃO SOME NO CLIQUE. Aquele relata algo que já aconteceu e por
 *     isso é descartável; este relata um estado que CONTINUA
 *     acontecendo. Ele sai quando a sincronização volta, e só;
 *   · CARREGA AÇÃO, porque há o que fazer — tentar de novo, ou entrar
 *     de novo;
 *   · é ÂMBAR ou VERMELHO, não o ciano informativo: "interrompido" se
 *     resolve com um clique, "sessão expirada" exige sair e voltar.
 *     Tratá-los com a mesma cor esconderia essa diferença.
 *
 * Silencioso em `ok` e em `renovando`, de propósito: uma troca de token
 * leva milissegundos, e piscar "reconectando" a cada hora seria ruído.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useCampaignSession } from "../../_shell/CampaignRealtimeProvider";

export function AvisoSincronizacao() {
  const { realtimeAuthEstado, renovarRealtimeAuth } = useCampaignSession();

  if (realtimeAuthEstado === "ok" || realtimeAuthEstado === "renovando") return null;

  const precisaLogin = realtimeAuthEstado === "precisa_login";

  return (
    <div
      className="rv-flutuante rv-aviso-sync"
      role="alert"
      data-estado={realtimeAuthEstado}
      data-testid="vtt-aviso-sync"
    >
      <AlertTriangle size={14} aria-hidden="true" />
      <span className="rv-aviso-sync-txt">
        {precisaLogin
          ? "Sessão expirada — entre novamente para voltar a receber eventos."
          : "Sincronização interrompida: a mesa parou de receber eventos."}
      </span>
      {precisaLogin ? (
        <a className="rv-aviso-sync-acao" href="/login" data-testid="vtt-aviso-sync-login">
          Entrar
        </a>
      ) : (
        <button
          type="button"
          className="rv-aviso-sync-acao"
          onClick={() => renovarRealtimeAuth()}
          data-testid="vtt-aviso-sync-retry"
        >
          <RefreshCw size={12} aria-hidden="true" /> Tentar novamente
        </button>
      )}
    </div>
  );
}
