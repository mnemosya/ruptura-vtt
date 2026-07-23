/**
 * Limites de segurança de conteúdo de campanha (Etapa 12, correção).
 * Validação SEMPRE no servidor, ANTES de persistir — nunca só na UI.
 * O banco também reforça um teto absoluto (gatilho
 * `enforce_campaign_content_limits`, migration 0026) como defesa em
 * profundidade, nunca como única barreira.
 *
 * Valores escolhidos para cobrir um playtest real (poucas dezenas de
 * homebrews/overrides por mesa) sem aceitar volume ilimitado nem travar
 * uma mesa normal — mesma ordem de grandeza do catálogo oficial inteiro.
 */

export const LIMITE_CONTEUDO_PUBLICADO_POR_CAMPANHA = 300;
export const LIMITE_RASCUNHOS_ATIVOS_POR_CAMPANHA = 50;
/** Bytes do payload público serializado (JSON.stringify) — mesma ordem de grandeza do maior documento oficial real. */
export const LIMITE_TAMANHO_PAYLOAD_BYTES = 200_000;
export const LIMITE_EFEITOS_POR_DOCUMENTO = 40;
export const LIMITE_REFERENCIAS_POR_DOCUMENTO = 40;
export const LIMITE_TAMANHO_TEXTO_LONGO = 20_000;

export interface ResultadoLimite {
  ok: boolean;
  erro?: string;
}

export function validarTamanhoPayload(payload: unknown): ResultadoLimite {
  const tamanho = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (tamanho > LIMITE_TAMANHO_PAYLOAD_BYTES) {
    return { ok: false, erro: `Payload excede o limite de ${LIMITE_TAMANHO_PAYLOAD_BYTES} bytes (${tamanho} bytes).` };
  }
  return { ok: true };
}

export function validarQuantidadeEfeitos(efeitos: unknown[]): ResultadoLimite {
  if (efeitos.length > LIMITE_EFEITOS_POR_DOCUMENTO) {
    return { ok: false, erro: `Máximo de ${LIMITE_EFEITOS_POR_DOCUMENTO} efeitos por documento (${efeitos.length} enviados).` };
  }
  return { ok: true };
}

export function validarQuantidadeReferencias(referencias: unknown[]): ResultadoLimite {
  if (referencias.length > LIMITE_REFERENCIAS_POR_DOCUMENTO) {
    return { ok: false, erro: `Máximo de ${LIMITE_REFERENCIAS_POR_DOCUMENTO} referências por documento (${referencias.length} enviadas).` };
  }
  return { ok: true };
}

export function validarTamanhoTexto(texto: string | undefined, nomeCampo: string): ResultadoLimite {
  if (texto && texto.length > LIMITE_TAMANHO_TEXTO_LONGO) {
    return { ok: false, erro: `${nomeCampo} excede ${LIMITE_TAMANHO_TEXTO_LONGO} caracteres.` };
  }
  return { ok: true };
}

export function validarQuantidadePublicados(quantidadeAtual: number): ResultadoLimite {
  if (quantidadeAtual >= LIMITE_CONTEUDO_PUBLICADO_POR_CAMPANHA) {
    return { ok: false, erro: `Limite de ${LIMITE_CONTEUDO_PUBLICADO_POR_CAMPANHA} conteúdos publicados por campanha atingido.` };
  }
  return { ok: true };
}

export function validarQuantidadeRascunhos(quantidadeAtual: number): ResultadoLimite {
  if (quantidadeAtual >= LIMITE_RASCUNHOS_ATIVOS_POR_CAMPANHA) {
    return { ok: false, erro: `Limite de ${LIMITE_RASCUNHOS_ATIVOS_POR_CAMPANHA} rascunhos ativos por campanha atingido.` };
  }
  return { ok: true };
}
