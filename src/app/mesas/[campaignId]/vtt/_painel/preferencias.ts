/**
 * Preferências LOCAIS do painel lateral da Mesa: última aba aberta, se
 * está aberto ou recolhido, e a largura escolhida.
 *
 * Mesmo padrão (e mesmas garantias) de
 * `_ferramentas/areasPreferencias.ts` e `_turnos/rodadasPreferencias.ts`:
 * `localStorage`, chave versionada por USUÁRIO e CAMPANHA, leitura
 * tolerante campo a campo, escrita que nunca derruba a mesa se o
 * storage estiver cheio ou desabilitado (aba anônima).
 *
 * O QUE NÃO ENTRA AQUI: nada que outra pessoa precise ver. Mensagem,
 * personagem, item, pasta — tudo isso é estado de MESA e vive no
 * banco. Aqui só mora o que é do navegador de UMA pessoa.
 */

import { LARGURA_PADRAO, ehAbaId, limitarLarguraPainel, type AbaId } from "./tipos";

export interface PreferenciasPainel {
  /** Última aba escolhida. Vale mesmo com o painel recolhido — reabrir volta pra ela. */
  aba: AbaId;
  /** `false` = faixa de ícones só. */
  aberto: boolean;
  /** Largura do painel aberto, já dentro dos limites de `limitarLarguraPainel`. */
  largura: number;
}

export const PREFERENCIAS_PAINEL_PADRAO: PreferenciasPainel = {
  aba: "chat",
  aberto: true,
  largura: LARGURA_PADRAO,
};

const VERSAO_SCHEMA = "v2";

/** Chave versionada por usuário e campanha — a preferência é individual e não vaza entre mesas. */
export function chavePreferenciasPainel(usuarioId: string | null, campaignId: string): string {
  return `rv-painel:${VERSAO_SCHEMA}:${usuarioId ?? "anon"}:${campaignId}`;
}

/**
 * Lê a preferência salva. NUNCA lança e sempre devolve um objeto
 * completo: campo ausente, corrompido ou de tipo errado cai no padrão
 * campo a campo — nunca descarta o conjunto por causa de uma chave
 * nova. A largura passa por `limitarLarguraPainel`, então um valor
 * salvo por uma versão com outros limites entra clampado em vez de
 * quebrar o layout.
 */
export function carregarPreferenciasPainel(chave: string): PreferenciasPainel {
  if (typeof window === "undefined") return PREFERENCIAS_PAINEL_PADRAO;
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return PREFERENCIAS_PAINEL_PADRAO;
    return normalizarPreferenciasPainel(JSON.parse(bruto) as unknown);
  } catch {
    return PREFERENCIAS_PAINEL_PADRAO;
  }
}

/** Núcleo puro da leitura — separado pra ser testado sem `localStorage`. */
export function normalizarPreferenciasPainel(json: unknown): PreferenciasPainel {
  if (typeof json !== "object" || json === null) return PREFERENCIAS_PAINEL_PADRAO;
  const obj = json as Record<string, unknown>;
  return {
    aba: ehAbaId(obj.aba) ? obj.aba : PREFERENCIAS_PAINEL_PADRAO.aba,
    aberto: typeof obj.aberto === "boolean" ? obj.aberto : PREFERENCIAS_PAINEL_PADRAO.aberto,
    largura: typeof obj.largura === "number" ? limitarLarguraPainel(obj.largura) : PREFERENCIAS_PAINEL_PADRAO.largura,
  };
}

export function salvarPreferenciasPainel(chave: string, prefs: PreferenciasPainel): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(prefs));
  } catch {
    // Storage cheio/desabilitado — a preferência vira só desta sessão,
    // o que não é motivo pra quebrar a mesa.
  }
}
