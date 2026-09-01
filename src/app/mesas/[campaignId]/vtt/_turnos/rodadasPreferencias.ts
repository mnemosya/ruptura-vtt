/**
 * Preferência LOCAL da ferramenta Rodadas: se a pessoa escondeu os
 * trilhos pra si.
 *
 * A POSIÇÃO da janela não mora aqui — é de
 * `_ferramentas/janelasPreferencias.ts`, junto com a de todas as
 * outras janelas de ferramenta, porque "onde deixei esta janela" é a
 * mesma pergunta para todas elas.
 *
 * Mesmo padrão (e mesmas garantias) de
 * `_ferramentas/areasPreferencias.ts`: `localStorage`, chave
 * versionada por usuário e campanha, leitura tolerante a qualquer
 * coisa que não bata o formato, escrita que nunca quebra a mesa se o
 * storage estiver cheio ou desabilitado.
 *
 * O QUE NÃO ENTRA AQUI: absolutamente nada do combate. Rodada, janela,
 * elenco, quem está agindo — tudo isso é estado de MESA, vive em
 * `vtt_turn_tracks` e sincroniza por Realtime. Guardar qualquer pedaço
 * daquilo aqui criaria uma segunda verdade que só uma pessoa enxerga.
 * Aqui só mora o que é do navegador de UMA pessoa.
 *
 */

export interface PreferenciasRodadas {
  /** Trilhos escondidos só pra esta pessoa — nunca encerra o combate. */
  trilhaOculta: boolean;
}

export const PREFERENCIAS_RODADAS_PADRAO: PreferenciasRodadas = {
  trilhaOculta: false,
};

const VERSAO_SCHEMA = "v1";

/** Chave versionada por usuário e campanha — a preferência é individual e não vaza entre mesas. */
export function chavePreferenciasRodadas(usuarioId: string | null, campaignId: string): string {
  return `rv-rodadas:${VERSAO_SCHEMA}:${usuarioId ?? "anon"}:${campaignId}`;
}

function ehBooleano(v: unknown): v is boolean {
  return typeof v === "boolean";
}
/**
 * Lê a preferência salva. NUNCA lança e sempre devolve um objeto
 * completo: campo ausente, corrompido ou de tipo errado cai no padrão
 * campo a campo — nunca descarta o conjunto por causa de uma chave
 * nova.
 */
export function carregarPreferenciasRodadas(chave: string): PreferenciasRodadas {
  if (typeof window === "undefined") return PREFERENCIAS_RODADAS_PADRAO;
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return PREFERENCIAS_RODADAS_PADRAO;
    const json = JSON.parse(bruto) as Record<string, unknown>;
    return {
      trilhaOculta: ehBooleano(json.trilhaOculta) ? json.trilhaOculta : PREFERENCIAS_RODADAS_PADRAO.trilhaOculta,
    };
  } catch {
    return PREFERENCIAS_RODADAS_PADRAO;
  }
}

export function salvarPreferenciasRodadas(chave: string, prefs: PreferenciasRodadas): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(prefs));
  } catch {
    // Storage cheio/desabilitado (aba privada) — a preferência vira só
    // desta sessão, o que não é motivo pra quebrar a ferramenta.
  }
}
