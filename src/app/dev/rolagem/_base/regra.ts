/**
 * REGRA DO TESTE — fonte única dos protótipos `/dev/rolagem-*`.
 *
 * Transcreve o Notion, não o motor atual (`src/lib/dice`, ainda Nd8):
 *   · cap. 13 ROLANDO OS DADOS — 1d10 + Atributo + Perícia + Modificadores,
 *     Margem de Impacto, as seis faixas, teste contestado;
 *   · cap. 18 SOBRECARGA E RUPTURA — Usando a Sobrecarga, Alcançando o
 *     limite, Ultrapassando o limite, Resolvendo as consequências, e a
 *     perda de Integridade da Ruptura (Como funciona, A Última Vontade).
 *
 * Puro de propósito: sem React, sem DOM e sem sorteio. Quem rola é a
 * física da mesa (ou a bancada, no modo forçado); quem rola os d4 da
 * perda de Integridade também. Este arquivo só resolve números que já
 * existem — é o que deixa o teste de unidade cobrir o exemplo da Ilya
 * e os três cenários de custo sem depender de sorte.
 */

/* ── Faixas de margem (cap. 13, MARGEM DE IMPACTO) ─────────────────── */

export type Faixa =
  | "sucesso_critico"
  | "sucesso_padrao"
  | "sucesso_limitado"
  | "falha_limitada"
  | "falha_padrao"
  | "falha_critica";

export const FAIXAS: Record<Faixa, { rotulo: string; sucesso: boolean; impacto: "Limitado" | "Padrão" | "Crítico" }> = {
  sucesso_critico: { rotulo: "Sucesso Crítico", sucesso: true, impacto: "Crítico" },
  sucesso_padrao: { rotulo: "Sucesso Padrão", sucesso: true, impacto: "Padrão" },
  sucesso_limitado: { rotulo: "Sucesso Limitado", sucesso: true, impacto: "Limitado" },
  falha_limitada: { rotulo: "Falha Limitada", sucesso: false, impacto: "Limitado" },
  falha_padrao: { rotulo: "Falha Padrão", sucesso: false, impacto: "Padrão" },
  falha_critica: { rotulo: "Falha Crítica", sucesso: false, impacto: "Crítico" },
};

/**
 * Sucesso 0 a +2 limitado, +3 a +6 padrão, +7 ou mais crítico;
 * falha –1 a –2 limitada, –3 a –6 padrão, –7 ou menos crítica.
 * Só a margem decide — o valor natural do dado nunca entra aqui.
 */
export function classificarMargem(margem: number): Faixa {
  if (margem >= 7) return "sucesso_critico";
  if (margem >= 3) return "sucesso_padrao";
  if (margem >= 0) return "sucesso_limitado";
  if (margem >= -2) return "falha_limitada";
  if (margem >= -6) return "falha_padrao";
  return "falha_critica";
}

/* ── Teste (cap. 13, REALIZANDO UM TESTE / TIPOS DE TESTE) ─────────── */

/** Contra o que o resultado final é comparado. */
export type Alvo =
  | { tipo: "livre" }
  | { tipo: "cd"; cd: number }
  /** Testes contestados: maior resultado vence; empate vence quem iniciou. */
  | { tipo: "contestado"; oponente: number; iniciou: "eu" | "oponente" };

export interface Parcelas {
  atributo: number;
  pericia: number;
  modificador: number;
}

export interface Resolucao {
  dado: number;
  total: number;
  /** `null` sem CD nem oponente: não existe sucesso nem margem. */
  margem: number | null;
  faixa: Faixa | null;
  sucesso: boolean | null;
  /**
   * Só no contestado empatado. `eu`: quem rola iniciou e vence com
   * sucesso limitado, margem 0 (texto do capítulo). `oponente`: o
   * oponente iniciou e vence; o capítulo não dá faixa para o lado que
   * perde no empate — fica `faixa: null` (pergunta em aberto).
   */
  empate: null | "eu" | "oponente";
}

/** Resultado final = Dado escolhido + Atributo + Perícia + Modificadores. */
export function totalDoTeste(parcelas: Parcelas, dado: number): number {
  return dado + parcelas.atributo + parcelas.pericia + parcelas.modificador;
}

export function resolverTeste(parcelas: Parcelas, alvo: Alvo, dado: number): Resolucao {
  const total = totalDoTeste(parcelas, dado);
  if (alvo.tipo === "livre") return { dado, total, margem: null, faixa: null, sucesso: null, empate: null };
  if (alvo.tipo === "cd") {
    const margem = total - alvo.cd;
    return { dado, total, margem, faixa: classificarMargem(margem), sucesso: margem >= 0, empate: null };
  }
  const diferenca = total - alvo.oponente;
  if (diferenca !== 0) {
    return { dado, total, margem: diferenca, faixa: classificarMargem(diferenca), sucesso: diferenca > 0, empate: null };
  }
  return alvo.iniciou === "eu"
    ? { dado, total, margem: 0, faixa: "sucesso_limitado", sucesso: true, empate: "eu" }
    : { dado, total, margem: 0, faixa: null, sucesso: false, empate: "oponente" };
}

/* ── Sobrecarga (cap. 18) ──────────────────────────────────────────── */

/** O que a bancada controla e o que a troca altera. */
export interface Conduto {
  /** Pontos de Sobrecarga recebidos desde o último descanso longo. */
  sobrecarga: number;
  /** Limite de Sobrecarga — começa em 3, máximo 5. */
  limite: number;
  integridade: number;
  /** Total de Rupturas já sofridas (decide a perda da próxima). */
  rupturas: number;
}

export const LIMITE_INICIAL = 3;
export const LIMITE_MAXIMO = 5;

/**
 * Preço de UMA troca (o Dado de Sobrecarga no lugar do Normal), sempre
 * +1 Sobrecarga. Três situações:
 *
 *  · abaixo     — a troca não alcança o limite: só o ponto.
 *  · alcanca    — a troca alcança o limite pela primeira vez desde o
 *                 descanso longo (os pontos só zeram no descanso, então
 *                 alcançar é sempre a primeira vez): Ruptura, e a
 *                 Integridade cai o total de Rupturas, incluindo esta.
 *  · ultrapassa — cada ponto excedente custa Integridade em progressão
 *                 (1º 1d4, 2º 2d4, 3º 3d4…), contada desde o descanso.
 *
 * Integridade em 0 por perda causada pela Sobrecarga = Última Vontade.
 */
export type CustoTroca =
  | { faixa: "abaixo"; sobrecargaDepois: number; limite: number }
  | {
      faixa: "alcanca";
      sobrecargaDepois: number;
      limite: number;
      /** Número desta Ruptura (1ª, 2ª…) — é também a perda de Integridade. */
      ruptura: number;
      perdaIntegridade: number;
      integridadeDepois: number;
      ultimaVontade: boolean;
    }
  | {
      faixa: "ultrapassa";
      sobrecargaDepois: number;
      limite: number;
      /** Ordem do ponto excedente (1º, 2º…) — é também o número de d4. */
      excedente: number;
      d4: number;
      perdaMinima: number;
      perdaMaxima: number;
      /** `certa`: até a perda mínima zera; `pode`: alguma soma zera; `nao`: nenhuma zera. */
      ultimaVontade: "nao" | "pode" | "certa";
      /** Perda que zera a Integridade (= Integridade atual). */
      perdaQueZera: number;
    };

export function custoDaTroca(c: Conduto): CustoTroca {
  const depois = c.sobrecarga + 1;
  if (depois < c.limite) return { faixa: "abaixo", sobrecargaDepois: depois, limite: c.limite };
  if (depois === c.limite) {
    const ruptura = c.rupturas + 1;
    const restante = c.integridade - ruptura;
    return {
      faixa: "alcanca",
      sobrecargaDepois: depois,
      limite: c.limite,
      ruptura,
      perdaIntegridade: ruptura,
      integridadeDepois: Math.max(0, restante),
      ultimaVontade: restante <= 0,
    };
  }
  const excedente = depois - c.limite;
  return {
    faixa: "ultrapassa",
    sobrecargaDepois: depois,
    limite: c.limite,
    excedente,
    d4: excedente,
    perdaMinima: excedente,
    perdaMaxima: excedente * 4,
    ultimaVontade: c.integridade <= excedente ? "certa" : c.integridade <= excedente * 4 ? "pode" : "nao",
    perdaQueZera: c.integridade,
  };
}

export interface TrocaAplicada {
  custo: CustoTroca;
  antes: Conduto;
  depois: Conduto;
  /** d4 rolados pela perda dos excedentes (vazio fora de `ultrapassa`). */
  d4: number[];
  perdaIntegridade: number;
  ultimaVontade: boolean;
}

/**
 * Aplica a troca. `d4` só existe em `ultrapassa` e precisa ter
 * exatamente `custo.d4` valores de 1 a 4 — quem rola é a mesa (ou o
 * sorteio silencioso, conforme a proposta).
 */
export function aplicarTroca(c: Conduto, d4: number[] = []): TrocaAplicada {
  const custo = custoDaTroca(c);
  let perda = 0;
  let rupturas = c.rupturas;
  if (custo.faixa === "alcanca") {
    perda = custo.perdaIntegridade;
    rupturas += 1;
  } else if (custo.faixa === "ultrapassa") {
    if (d4.length !== custo.d4 || d4.some((v) => !Number.isInteger(v) || v < 1 || v > 4)) {
      throw new Error(`A troca no ${custo.excedente}º ponto excedente pede ${custo.d4}d4.`);
    }
    perda = d4.reduce((s, v) => s + v, 0);
  }
  const integridade = Math.max(0, c.integridade - perda);
  return {
    custo,
    antes: c,
    depois: { ...c, sobrecarga: custo.sobrecargaDepois, integridade, rupturas },
    d4: custo.faixa === "ultrapassa" ? d4 : [],
    perdaIntegridade: perda,
    ultimaVontade: perda > 0 && integridade === 0,
  };
}

/** Desfazer devolve o conduto de antes da troca — ponto, Ruptura e Integridade. */
export function desfazerTroca(t: TrocaAplicada): Conduto {
  return t.antes;
}

/**
 * Desfazer sobre o conduto de AGORA: devolve só o que esta troca
 * cobrou. Com várias rolagens na mesa (uma troca desfeita depois de
 * outra feita), voltar ao `antes` inteiro apagaria a outra.
 */
export function reverterTroca(atual: Conduto, t: TrocaAplicada): Conduto {
  return {
    ...atual,
    sobrecarga: Math.max(0, atual.sobrecarga - 1),
    // O que de fato saiu da Integridade — a rolagem pode passar do que
    // havia (2d4 = 6 contra Integridade 5 zera, mas só tira 5).
    integridade: atual.integridade + (t.antes.integridade - t.depois.integridade),
    rupturas: Math.max(0, atual.rupturas - (t.custo.faixa === "alcanca" ? 1 : 0)),
  };
}

/** Distribui uma perda total forçada (bancada) em `n` d4 válidos. */
export function distribuirD4(total: number, n: number): number[] {
  const alvo = Math.max(n, Math.min(n * 4, Math.round(total)));
  const base = Math.floor(alvo / n);
  const resto = alvo - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/** "1º", "2º"… — como o capítulo escreve a ordem dos excedentes. */
export function ordinal(n: number): string {
  return `${n}º`;
}

/** "1ª", "2ª"… — para Ruptura (feminino). */
export function ordinalF(n: number): string {
  return `${n}ª`;
}
