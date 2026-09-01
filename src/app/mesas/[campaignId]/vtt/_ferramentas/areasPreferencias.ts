/**
 * Preferências LOCAIS da ferramenta Áreas — snap, janela e seções
 * recolhidas. Mesmo padrão (e mesmas garantias) de
 * `_shell/PainelCamadas.tsx`: `localStorage`, chave versionada por
 * usuário e campanha, leitura tolerante a qualquer coisa que não bata
 * o formato, escrita que nunca quebra a mesa se o storage estiver
 * cheio ou desabilitado.
 *
 * A POSIÇÃO da janela saiu daqui: ela é de
 * `janelasPreferencias.ts`, junto com a de todas as outras janelas de
 * ferramenta — "onde deixei esta janela" é a mesma pergunta pra todas,
 * e ter uma cópia por painel foi o que deixou os formatos divergirem.
 *
 * O QUE NÃO ENTRA AQUI: dimensão, geometria, cor, opacidade,
 * visibilidade e rótulo da área. Isso é dado CANÔNICO da cena, vive em
 * `vtt_areas` e sincroniza por Realtime — nunca em preferência local.
 * Aqui só mora o que é do NAVEGADOR de uma pessoa: como ela gosta que
 * a ferramenta se comporte.
 */

export interface PreferenciasAreas {
  /** Snap angular de 15° — LIGADO por padrão. */
  snapDirecao: boolean;
  /** Snap da origem no token mais próximo — DESLIGADO por padrão (altera o ponto escolhido). */
  snapOrigemToken: boolean;
  /**
   * Snap da origem no centro da célula — LIGADO por padrão. Chave
   * DISTINTA de `snapOrigemToken`, com padrão DISTINTO: a ausência de
   * uma nunca é lida como a ausência da outra (ver
   * `carregarPreferenciasAreas` — cada campo cai no seu próprio
   * padrão, nunca um substitui o outro).
   */
  snapOrigemCelula: boolean;
  /** Seção "Aparência" do painel expandida? */
  aparenciaAberta: boolean;
  /** Painel recolhido ao cabeçalho? */
  painelRecolhido: boolean;
}

export const PREFERENCIAS_AREAS_PADRAO: PreferenciasAreas = {
  snapDirecao: true,
  snapOrigemToken: false,
  snapOrigemCelula: true,
  aparenciaAberta: false,
  painelRecolhido: false,
};

const VERSAO_SCHEMA = "v1";

/** Chave versionada por usuário e campanha — a preferência é individual e não deve vazar entre mesas. */
export function chavePreferenciasAreas(usuarioId: string | null, campaignId: string): string {
  return `rv-areas:${VERSAO_SCHEMA}:${usuarioId ?? "anon"}:${campaignId}`;
}

function ehBooleano(v: unknown): v is boolean {
  return typeof v === "boolean";
}
/**
 * Lê a preferência salva. NUNCA lança e sempre devolve um objeto
 * completo: campo ausente, corrompido, de schema antigo ou de tipo
 * errado simplesmente cai no padrão, campo a campo (nunca descarta o
 * conjunto inteiro por causa de uma chave nova).
 */
export function carregarPreferenciasAreas(chave: string): PreferenciasAreas {
  if (typeof window === "undefined") return PREFERENCIAS_AREAS_PADRAO;
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return PREFERENCIAS_AREAS_PADRAO;
    const json = JSON.parse(bruto) as Record<string, unknown>;
    return {
      snapDirecao: ehBooleano(json.snapDirecao) ? json.snapDirecao : PREFERENCIAS_AREAS_PADRAO.snapDirecao,
      snapOrigemToken: ehBooleano(json.snapOrigemToken) ? json.snapOrigemToken : PREFERENCIAS_AREAS_PADRAO.snapOrigemToken,
      snapOrigemCelula: ehBooleano(json.snapOrigemCelula) ? json.snapOrigemCelula : PREFERENCIAS_AREAS_PADRAO.snapOrigemCelula,
      aparenciaAberta: ehBooleano(json.aparenciaAberta) ? json.aparenciaAberta : PREFERENCIAS_AREAS_PADRAO.aparenciaAberta,
      painelRecolhido: ehBooleano(json.painelRecolhido) ? json.painelRecolhido : PREFERENCIAS_AREAS_PADRAO.painelRecolhido,
    };
  } catch {
    return PREFERENCIAS_AREAS_PADRAO;
  }
}

export function salvarPreferenciasAreas(chave: string, prefs: PreferenciasAreas): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(prefs));
  } catch {
    // Storage cheio/desabilitado (aba privada) — a preferência vira só
    // desta sessão, o que não é motivo pra quebrar a ferramenta.
  }
}
