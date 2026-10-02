/**
 * Desafio de Acesso — RUPTURA v1.2 (capítulo 20, Cenas de Investigação).
 *
 * Módulo puro. O narrador cria o desafio (Código secreto rolado em
 * segredo, Leitura, Tolerância); o operador gasta uma Ação de Acessar
 * (1 PA) e apresenta combinações — os dados NÃO são rolados, ele escolhe
 * os valores. Cada tentativa recebe a Leitura antes da seguinte.
 *
 *   · tentativas por ação: perícia 0–1 → 1, 2–3 → 2, 4–5 → 3, +1 por Auxílio;
 *   · terminar a ação sem superar a proteção consome 1 Tolerância (uma
 *     vez por ação, mesmo encerrando antes de usar todas as tentativas);
 *   · Tolerância 0 dispara a Contramedida (uma vez — não repete a cada ação).
 */

export type AccessReadingV12 = "direcional" | "confirmacao";
export type DirectionalFeedbackV12 = "aumentar" | "diminuir" | "correto";

export interface AccessChallengeV12 {
  /** Faces dos dados do Código (ex.: 3d6 → posicoes 3, faces 6). */
  faces: number;
  codigo: number[];
  leitura: AccessReadingV12;
  tolerancia: number;
  superado: boolean;
  contramedidaDisparada: boolean;
  /** Histórico compartilhável: trocar de operador não reinicia nada. */
  historico: AccessAttemptResultV12[];
}

export interface AccessAttemptResultV12 {
  combinacao: number[];
  /** Direcional: retorno por posição. */
  direcional?: DirectionalFeedbackV12[];
  /** Confirmação: quantas posições estão corretas. */
  corretas?: number;
  superado: boolean;
}

export interface AccessActionStateV12 {
  tentativasRestantes: number;
  encerrada: boolean;
}

/** "3d6" → { posicoes: 3, faces: 6 }. */
export function parseAccessCode(codigo: string): { posicoes: number; faces: number } {
  const m = /^(\d+)d(\d+)$/i.exec(codigo.trim());
  if (!m) throw new Error(`Código inválido: "${codigo}" (esperado NdX).`);
  const posicoes = Number(m[1]);
  const faces = Number(m[2]);
  if (posicoes < 1 || faces < 2) throw new Error(`Código inválido: "${codigo}".`);
  return { posicoes, faces };
}

export function createAccessChallengeV12(
  modelo: { codigo: string; leitura: AccessReadingV12; tolerancia: number },
  rng: () => number = Math.random,
): AccessChallengeV12 {
  const { posicoes, faces } = parseAccessCode(modelo.codigo);
  return {
    faces,
    codigo: Array.from({ length: posicoes }, () => 1 + Math.floor(rng() * faces)),
    leitura: modelo.leitura,
    tolerancia: Math.max(0, Math.trunc(modelo.tolerancia)),
    superado: false,
    contramedidaDisparada: false,
    historico: [],
  };
}

/** Tentativas por Ação de Acessar a partir do nível da perícia (+ Auxílios aplicáveis). */
export function accessAttemptsPerAction(nivelPericia: number, auxilios = 0): number {
  const n = Math.max(0, Math.trunc(nivelPericia));
  const base = n <= 1 ? 1 : n <= 3 ? 2 : 3;
  return base + Math.max(0, Math.trunc(auxilios));
}

/** Pode iniciar uma Ação de Acessar? (proteção ativa e Tolerância > 0). */
export function canStartAccessAction(desafio: AccessChallengeV12): boolean {
  return !desafio.superado && desafio.tolerancia > 0;
}

export function startAccessActionV12(desafio: AccessChallengeV12, nivelPericia: number, auxilios = 0): AccessActionStateV12 {
  if (!canStartAccessAction(desafio)) throw new Error("A proteção já foi superada ou a Tolerância se esgotou.");
  return { tentativasRestantes: accessAttemptsPerAction(nivelPericia, auxilios), encerrada: false };
}

function lerTentativa(desafio: AccessChallengeV12, combinacao: number[]): AccessAttemptResultV12 {
  const superado = combinacao.every((v, i) => v === desafio.codigo[i]);
  if (desafio.leitura === "direcional") {
    return {
      combinacao,
      superado,
      direcional: combinacao.map((v, i) => (v === desafio.codigo[i] ? "correto" : v < desafio.codigo[i] ? "aumentar" : "diminuir")),
    };
  }
  return { combinacao, superado, corretas: combinacao.filter((v, i) => v === desafio.codigo[i]).length };
}

/**
 * Apresenta uma combinação dentro da ação em curso. Superar a proteção
 * encerra a ação sem consumir Tolerância; a última tentativa sem sucesso
 * encerra a ação e consome 1 Tolerância.
 */
export function attemptAccessV12(
  desafio: AccessChallengeV12,
  acao: AccessActionStateV12,
  combinacao: number[],
): { desafio: AccessChallengeV12; acao: AccessActionStateV12; resultado: AccessAttemptResultV12 } {
  if (acao.encerrada || acao.tentativasRestantes < 1) throw new Error("A Ação de Acessar já terminou.");
  if (desafio.superado) throw new Error("A proteção já foi superada.");
  if (combinacao.length !== desafio.codigo.length) throw new Error(`A combinação precisa de ${desafio.codigo.length} valores.`);
  if (combinacao.some((v) => !Number.isInteger(v) || v < 1 || v > desafio.faces)) throw new Error(`Valores entre 1 e ${desafio.faces}.`);

  const resultado = lerTentativa(desafio, combinacao);
  let proximo: AccessChallengeV12 = { ...desafio, historico: [...desafio.historico, resultado] };
  let proximaAcao: AccessActionStateV12 = { tentativasRestantes: acao.tentativasRestantes - 1, encerrada: false };
  if (resultado.superado) {
    proximo = { ...proximo, superado: true };
    proximaAcao = { tentativasRestantes: 0, encerrada: true };
  } else if (proximaAcao.tentativasRestantes === 0) {
    const fim = endAccessActionV12(proximo, proximaAcao);
    proximo = fim.desafio;
    proximaAcao = fim.acao;
  }
  return { desafio: proximo, acao: proximaAcao, resultado };
}

/**
 * Encerra a ação (também voluntariamente). Sem superar a proteção,
 * consome 1 Tolerância; ao chegar a 0, marca a Contramedida (uma vez).
 */
export function endAccessActionV12(
  desafio: AccessChallengeV12,
  acao: AccessActionStateV12,
): { desafio: AccessChallengeV12; acao: AccessActionStateV12; contramedida: boolean } {
  if (acao.encerrada) return { desafio, acao, contramedida: false };
  const encerrada: AccessActionStateV12 = { tentativasRestantes: 0, encerrada: true };
  if (desafio.superado) return { desafio, acao: encerrada, contramedida: false };
  const tolerancia = Math.max(0, desafio.tolerancia - 1);
  const contramedida = tolerancia === 0 && !desafio.contramedidaDisparada;
  return {
    desafio: { ...desafio, tolerancia, contramedidaDisparada: desafio.contramedidaDisparada || contramedida },
    acao: encerrada,
    contramedida,
  };
}

/** Arrombamento com Marcador de Progresso: segmentos por resultado do teste. */
export const BREAK_IN_SEGMENTS_V12 = { sucesso_limitado: 1, sucesso_padrao: 2, sucesso_critico: 3, falha: 0 } as const;

export function advanceBreakIn(
  marcador: { preenchidos: number; total: number },
  resultado: keyof typeof BREAK_IN_SEGMENTS_V12,
): { preenchidos: number; total: number; aberto: boolean } {
  const preenchidos = Math.min(marcador.total, marcador.preenchidos + BREAK_IN_SEGMENTS_V12[resultado]);
  return { preenchidos, total: marcador.total, aberto: preenchidos >= marcador.total };
}
