"use client";

/**
 * Aviso GLOBAL de sincronização interrompida — mora no cabeçalho da
 * casca, que é a única superfície visível em toda rota e em todo
 * breakpoint da campanha.
 *
 * Por que não no `SessionPanel`: aquele painel vira drawer FECHADO no
 * breakpoint intermediário (`display: none`) — o mesmo motivo que
 * obrigou o contador de não lidos a subir pro botão "Sessão". Um aviso
 * de "você parou de receber eventos" escondido atrás de um drawer
 * fechado é o pior lugar possível pra ele. Por que não na Mesa: os dois
 * indicadores de sync (`mesa-sync-status`) só existem lá, então quem
 * estivesse em Personagens, Conteúdo da campanha ou qualquer outra rota
 * não saberia que ficou mudo — que é justamente a lacuna que a
 * auditoria apontou.
 *
 * Silencioso quando está tudo bem, DE PROPÓSITO: o indicador verbo de
 * "Sincronizado" continua sendo o da Mesa (discreto, contextual). Aqui
 * só aparece coisa quando há o que agir. `renovando` também não mostra
 * nada — uma troca de token leva milissegundos e piscar "reconectando"
 * a cada hora seria ruído, não informação.
 *
 * Chega em `CampaignShell` como PROP (criado em `layout.tsx`, dentro da
 * árvore do provider), nunca importado lá dentro — mesma razão de
 * `painelSessao`/`turnTrackDock`: mantém a casca testável em isolamento,
 * sem exigir um `CampaignRealtimeProvider` real.
 */

import { useCampaignSession } from "./CampaignRealtimeProvider";

export function SyncAlert() {
  const { realtimeAuthEstado, renovarRealtimeAuth } = useCampaignSession();

  if (realtimeAuthEstado === "ok" || realtimeAuthEstado === "renovando") return null;

  const precisaLogin = realtimeAuthEstado === "precisa_login";

  return (
    <div className="rm-sync-alerta" role="status" data-estado={realtimeAuthEstado} data-testid="campshell-sync-alerta">
      <span className="rm-sync-alerta-texto">
        {precisaLogin ? "Sessão expirada — entre novamente para voltar a receber eventos." : "Sincronização interrompida."}
      </span>
      {precisaLogin ? (
        <a className="rm-sync-alerta-acao" href="/login" data-testid="campshell-sync-alerta-login">
          Entrar
        </a>
      ) : (
        <button
          type="button"
          className="rm-sync-alerta-acao"
          onClick={() => renovarRealtimeAuth()}
          data-testid="campshell-sync-alerta-retry"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
