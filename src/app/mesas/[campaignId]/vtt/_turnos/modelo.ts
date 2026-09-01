/**
 * Trilha de turnos de Ruptura — modelo e regras.
 *
 * Fonte: `docs/fontes/16 COMBATE`, seções "TURNOS E RODADAS", "JANELAS
 * DE TURNOS", "ORDEM DE TURNOS", "FRAGMENTANDO OS PONTOS DE AÇÃO",
 * "EMBOSCADA" e "TRÉGUA".
 *
 * O QUE ESTE SISTEMA **NÃO** É, e por que isso importa pro desenho:
 * não existe valor de iniciativa, não existe fila fixa determinada por
 * rolagem, e não existe ordenação por retrato. Reaproveitar a UI de
 * iniciativa de um VTT genérico aqui produziria uma interface que
 * mente sobre a regra. O que a interface precisa comunicar é ESTADO e
 * ELEGIBILIDADE — quem PODE agir agora e por quê —, não posição numa
 * lista.
 *
 * As regras que o modelo codifica:
 *
 *  1. A rodada (~10s) tem DUAS janelas: Rápidos (até 2 PA) e Lentos
 *     (3+ PA). Encerrada a de Lentos, a rodada termina e o PA renova.
 *  2. Dentro da janela, as jogadas ALTERNAM entre PJ e PN. Se um PJ
 *     age, o próximo é um PN, e vice-versa.
 *  3. A alternância só vale enquanto AMBOS os lados têm participantes
 *     aptos. Quando um lado acaba, o outro age em sequência.
 *  4. Quem abre os Lentos depende de quem agiu por último nos Rápidos
 *     — a alternância atravessa a fronteira das janelas.
 *  5. Fragmentar PA: gastar parte e guardar o resto, UMA VEZ por
 *     rodada. Quem fragmentou nos Rápidos volta nos Lentos, mas segue
 *     preso ao teto de 2 PA da janela de origem (gastou 1, tem mais 1).
 *  6. Emboscada: rodada surpresa, o lado surpreendente age inteiro sem
 *     alternância, só com ações de Rápidos.
 *  7. Trégua: suspende a contagem de turnos e PA por completo.
 *  8. Desempate no MESMO lado: maior treinamento em Reflexos age antes;
 *     persistindo, teste de Reflexos. (A interface sugere, não impõe —
 *     a escolha final de quem age é do grupo.)
 */

export type Lado = "pj" | "pn";
export type Janela = "rapidos" | "lentos";
export type ModoCena = "exploracao" | "combate" | "emboscada" | "tregua";

/** Teto de PA por janela (`JANELAS DE TURNOS`). */
export const TETO_PA: Record<Janela, number> = { rapidos: 2, lentos: Infinity };
export const PISO_PA: Record<Janela, number> = { rapidos: 0, lentos: 3 };

export interface Participante {
  id: string;
  nome: string;
  lado: Lado;
  /**
   * Janela em que o personagem DECLAROU que vai agir — o grupo onde o
   * card dele aparece na trilha. `null` = ainda não declarou.
   *
   * Declarar é diferente de agir: os dois grupos ficam abertos a
   * rodada inteira e o jogador pode declarar num deles enquanto o
   * outro está sendo resolvido. Sem este campo, "em que grupo o card
   * mora" viraria uma função da janela em resolução, e aí um card
   * saltaria de grupo sozinho quando a resolução avançasse — que é
   * exatamente o que a referência proíbe.
   */
  declaracao: Janela | null;
  /**
   * PA que o personagem COMPROMETEU ao declarar — o que ele pretende
   * gastar naquela janela. É isso que o card mostra, não o total da
   * rodada: dois personagens com 3 PA podem ter comprometido 2 e 1, e
   * mostrar "3 PA" nos dois esconderia justamente a informação que faz
   * o grupo decidir quem age. `null` = declarou sem comprometer valor.
   */
  paComprometido?: number | null;
  /** PA total da rodada (renovado a cada rodada). */
  paTotal: number;
  /** PA já gasto NESTA rodada. */
  paGasto: number;
  /** Treinamento em Reflexos — só pra sugerir desempate dentro do lado. */
  reflexos: number;
  /** Janelas em que este participante já concluiu um turno. */
  agiuEm: Janela[];
  /**
   * Se fragmentou, guarda a janela em que isso aconteceu. Fragmentar é
   * "gastou parte dos PA e passou a vez" — só uma vez por rodada.
   */
  fragmentouEm: Janela | null;
  /** Encerrou a participação na rodada de propósito (passou definitivamente). */
  encerrou: boolean;
  /** Incapaz de agir (inconsciente, imobilizado por efeito, fora da cena…). */
  incapaz?: { motivo: string } | null;
}

export interface EstadoTrilha {
  modo: ModoCena;
  rodada: number;
  janela: Janela;
  /** Lado que agiu por último — motor da alternância, inclusive entre janelas. */
  ultimoLado: Lado | null;
  /** Participante agindo agora (turno aberto), se houver. */
  agindoId: string | null;
  /** No caso de emboscada, qual lado surpreendeu. */
  ladoSurpresa?: Lado | null;
  participantes: Participante[];
}

/** PA que ainda restam ao participante nesta rodada. */
export function paRestante(p: Participante): number {
  return Math.max(0, p.paTotal - p.paGasto);
}

/**
 * Teto de PA que este participante pode gastar SE agir agora.
 *
 * A sutileza da regra 5: quem fragmentou nos Rápidos e volta nos
 * Lentos "ainda mantém o limite de 2 PA dos turnos rápidos" — ou seja,
 * o teto não é o da janela atual, é o da janela em que ele começou.
 */
export function tetoPaAgora(p: Participante, janela: Janela): number {
  if (p.fragmentouEm === "rapidos") {
    return Math.max(0, TETO_PA.rapidos - p.paGasto);
  }
  const teto = TETO_PA[janela];
  return teto === Infinity ? paRestante(p) : Math.max(0, teto - p.paGasto);
}

/** Motivo textual de indisponibilidade — a interface DEVE saber explicar. */
export type MotivoIndisponivel =
  | { tipo: "incapaz"; texto: string }
  | { tipo: "encerrou"; texto: string }
  | { tipo: "sem_pa"; texto: string }
  | { tipo: "ja_agiu_na_janela"; texto: string }
  | { tipo: "fragmentacao_gasta"; texto: string }
  | { tipo: "aguarda_alternancia"; texto: string }
  | { tipo: "janela_incompativel"; texto: string };

export interface Elegibilidade {
  apto: boolean;
  motivo?: MotivoIndisponivel;
}

/**
 * O participante pode assumir um turno AGORA?
 *
 * `ignorarAlternancia` existe pra responder duas perguntas diferentes
 * com a mesma função: "quem está apto nesta janela em geral" (usado
 * pra saber se um lado ainda tem gente, e pra listar o outro lado como
 * 'aguardando') e "quem pode ser escolhido neste exato momento".
 */
export function elegibilidade(
  p: Participante,
  estado: EstadoTrilha,
  opcoes?: { ignorarAlternancia?: boolean },
): Elegibilidade {
  if (p.incapaz) return { apto: false, motivo: { tipo: "incapaz", texto: p.incapaz.motivo } };
  if (p.encerrou) return { apto: false, motivo: { tipo: "encerrou", texto: "Encerrou a participação nesta rodada." } };

  const restante = paRestante(p);
  if (restante <= 0) return { apto: false, motivo: { tipo: "sem_pa", texto: "Sem PA restante nesta rodada." } };

  const jaAgiuNestaJanela = p.agiuEm.includes(estado.janela);
  const voltandoDeFragmento = p.fragmentouEm !== null && p.fragmentouEm !== estado.janela;

  // Já agiu nesta janela e não é um retorno de fragmentação → fora.
  if (jaAgiuNestaJanela && !voltandoDeFragmento) {
    return {
      apto: false,
      motivo: { tipo: "ja_agiu_na_janela", texto: `Já agiu nos turnos ${estado.janela === "rapidos" ? "rápidos" : "lentos"}.` },
    };
  }

  // Quem fragmentou nos Rápidos só retorna nos Lentos (regra 5).
  if (p.fragmentouEm === "rapidos" && estado.janela === "rapidos" && jaAgiuNestaJanela) {
    return { apto: false, motivo: { tipo: "fragmentacao_gasta", texto: "Fragmentou nos rápidos — retorna nos turnos lentos." } };
  }

  const teto = tetoPaAgora(p, estado.janela);
  if (teto <= 0) {
    return {
      apto: false,
      motivo: { tipo: "janela_incompativel", texto: "Atingiu o teto de PA da janela em que começou." },
    };
  }

  // Nos Lentos, quem ainda não agiu na rodada precisa de 3+ PA
  // disponíveis pra entrar (piso da janela). Quem está VOLTANDO de
  // fragmentação é exceção explícita — ele entra com o que sobrou.
  if (estado.janela === "lentos" && !voltandoDeFragmento && restante < PISO_PA.lentos) {
    return {
      apto: false,
      motivo: { tipo: "janela_incompativel", texto: `Turnos lentos exigem ${PISO_PA.lentos}+ PA; restam ${restante}.` },
    };
  }

  // Precisa ter declarado a janela que está em resolução. Quem
  // declarou o outro grupo não está "indisponível por regra" — está
  // esperando a vez do grupo dele, e a interface diz isso.
  if (p.declaracao !== null && p.declaracao !== estado.janela && !voltandoDeFragmento) {
    return {
      apto: false,
      motivo: {
        tipo: "janela_incompativel",
        texto: `Declarou turnos ${p.declaracao === "rapidos" ? "rápidos" : "lentos"}.`,
      },
    };
  }
  if (p.declaracao === null) {
    return { apto: false, motivo: { tipo: "janela_incompativel", texto: "Ainda não declarou turno." } };
  }

  if (opcoes?.ignorarAlternancia) return { apto: true };

  // Emboscada: o lado surpreendente age inteiro, sem alternar (regra 6).
  if (estado.modo === "emboscada") {
    if (estado.ladoSurpresa && p.lado !== estado.ladoSurpresa) {
      return { apto: false, motivo: { tipo: "aguarda_alternancia", texto: "Rodada surpresa — só o lado que emboscou age." } };
    }
    return { apto: true };
  }

  // Alternância (regras 2 e 3): só restringe se o OUTRO lado ainda tem
  // alguém apto. Se não tem, este lado segue em sequência.
  if (estado.ultimoLado === p.lado) {
    const outro: Lado = p.lado === "pj" ? "pn" : "pj";
    const outroTemApto = estado.participantes.some(
      (q) => q.lado === outro && elegibilidade(q, estado, { ignorarAlternancia: true }).apto,
    );
    if (outroTemApto) {
      return {
        apto: false,
        motivo: { tipo: "aguarda_alternancia", texto: `Alternância: a vez é do lado ${outro === "pj" ? "dos jogadores" : "do narrador"}.` },
      };
    }
  }

  return { apto: true };
}

/** Lado que deve agir agora, ou `null` quando qualquer um pode (lado único restante). */
export function ladoDaVez(estado: EstadoTrilha): Lado | null {
  if (estado.modo === "emboscada") return estado.ladoSurpresa ?? null;
  if (estado.ultimoLado === null) return null;
  const outro: Lado = estado.ultimoLado === "pj" ? "pn" : "pj";
  const outroTemApto = estado.participantes.some(
    (q) => q.lado === outro && elegibilidade(q, estado, { ignorarAlternancia: true }).apto,
  );
  return outroTemApto ? outro : null;
}

/** Quem pode ser escolhido pra assumir o próximo turno. */
export function elegiveisAgora(estado: EstadoTrilha): Participante[] {
  return estado.participantes.filter((p) => elegibilidade(p, estado).apto);
}

/**
 * Ordem SUGERIDA de desempate dentro do mesmo lado: maior Reflexos
 * primeiro (`ORDEM DE TURNOS`). É sugestão de interface — a escolha é
 * do grupo, então isto ordena a lista, não decide por ninguém.
 */
export function sugestaoDesempate(candidatos: Participante[]): Participante[] {
  return [...candidatos].sort((a, b) => b.reflexos - a.reflexos || a.nome.localeCompare(b.nome));
}

/** A janela atual pode ser encerrada? (ninguém mais apto nela) */
export function podeEncerrarJanela(estado: EstadoTrilha): boolean {
  return elegiveisAgora(estado).length === 0;
}

/**
 * Quem abre a PRÓXIMA janela — a alternância atravessa a fronteira
 * (regra 4). Se ninguém agiu nos Rápidos, não há restrição.
 */
export function ladoQueAbreProximaJanela(estado: EstadoTrilha): Lado | null {
  if (estado.ultimoLado === null) return null;
  return estado.ultimoLado === "pj" ? "pn" : "pj";
}

// ─────────────────────────────────────────────────────────────────
// Transições (puras — devolvem estado novo, nunca mutam)
// ─────────────────────────────────────────────────────────────────

/**
 * Declara (ou muda) a janela em que o participante pretende agir.
 *
 * Mover o card de um grupo pro outro é ESTA transição — nunca uma
 * cópia. Só é permitido antes de ele agir na rodada: depois de agir, a
 * declaração está consumada e mudá-la reescreveria o passado.
 */
export function declarar(estado: EstadoTrilha, id: string, janela: Janela): EstadoTrilha {
  return {
    ...estado,
    participantes: estado.participantes.map((p) => {
      if (p.id !== id) return p;
      if (p.agiuEm.length > 0 && p.fragmentouEm === null) return p; // já resolveu: declaração travada
      return { ...p, declaracao: janela };
    }),
  };
}

/** Participantes que declararam determinada janela. */
export function declaradosEm(estado: EstadoTrilha, janela: Janela): Participante[] {
  return estado.participantes.filter((p) => p.declaracao === janela);
}

/** Abre o turno de um participante (ele assume a vez). */
export function assumirTurno(estado: EstadoTrilha, id: string): EstadoTrilha {
  const p = estado.participantes.find((x) => x.id === id);
  if (!p || !elegibilidade(p, estado).apto) return estado;
  return { ...estado, agindoId: id };
}

/**
 * Conclui o turno de quem está agindo, gastando `paGasto` PA.
 *
 * Se sobrou PA e ele ainda não fragmentou nesta rodada, marca como
 * FRAGMENTADO — a regra não exige anúncio ("basta não usar todos em um
 * único turno"), então o modelo infere pelo gasto.
 */
export function concluirTurno(estado: EstadoTrilha, paGastoAgora: number): EstadoTrilha {
  const id = estado.agindoId;
  if (!id) return estado;

  const participantes = estado.participantes.map((p) => {
    if (p.id !== id) return p;
    const gasto = p.paGasto + Math.max(0, paGastoAgora);
    const sobrou = Math.max(0, p.paTotal - gasto);
    const tetoDaJanela = tetoPaAgora(p, estado.janela);
    const usouTudoQuePodia = paGastoAgora >= tetoDaJanela;

    // Fragmentou se guardou PA podendo gastar mais E ainda não tinha
    // fragmentado nesta rodada.
    const fragmentouAgora = sobrou > 0 && !usouTudoQuePodia && p.fragmentouEm === null;

    return {
      ...p,
      paGasto: gasto,
      agiuEm: p.agiuEm.includes(estado.janela) ? p.agiuEm : [...p.agiuEm, estado.janela],
      fragmentouEm: fragmentouAgora ? estado.janela : p.fragmentouEm,
      // Sem PA e sem fragmentação pendente → encerrou de fato.
      encerrou: sobrou <= 0 ? true : p.encerrou,
    };
  });

  const lado = estado.participantes.find((p) => p.id === id)!.lado;
  return { ...estado, participantes, agindoId: null, ultimoLado: lado };
}

/** Participante passa a vez definitivamente nesta rodada. */
export function encerrarParticipacao(estado: EstadoTrilha, id: string): EstadoTrilha {
  return {
    ...estado,
    agindoId: estado.agindoId === id ? null : estado.agindoId,
    participantes: estado.participantes.map((p) => (p.id === id ? { ...p, encerrou: true } : p)),
  };
}

/** Rápidos → Lentos, preservando a alternância (regra 4). */
export function avancarParaLentos(estado: EstadoTrilha): EstadoTrilha {
  if (estado.janela !== "rapidos") return estado;
  return { ...estado, janela: "lentos", agindoId: null };
}

/**
 * Encerra a rodada e começa a próxima: PA renovado, marcas de janela e
 * fragmentação zeradas. `ultimoLado` é PRESERVADO de propósito — a
 * alternância não reinicia junto com a rodada.
 */
export function proximaRodada(estado: EstadoTrilha): EstadoTrilha {
  return {
    ...estado,
    modo: estado.modo === "emboscada" ? "combate" : estado.modo,
    ladoSurpresa: null,
    rodada: estado.rodada + 1,
    janela: "rapidos",
    agindoId: null,
    participantes: estado.participantes.map((p) => ({
      ...p,
      paGasto: 0,
      agiuEm: [],
      fragmentouEm: null,
      encerrou: false,
      declaracao: null,
      paComprometido: null,
    })),
  };
}

/** Rótulos curtos, num lugar só — a interface repete muito isto. */
export const ROTULO_JANELA: Record<Janela, string> = { rapidos: "Turnos Rápidos", lentos: "Turnos Lentos" };
export const ROTULO_JANELA_CURTO: Record<Janela, string> = { rapidos: "Rápidos", lentos: "Lentos" };
export const DICA_JANELA: Record<Janela, string> = {
  rapidos: "Ações de até 2 PA",
  lentos: "Ações de 3 PA ou mais",
};
export const ROTULO_LADO: Record<Lado, string> = { pj: "Jogadores", pn: "Narrador" };
