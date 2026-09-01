/**
 * Fronteira entre o `EstadoTrilha` (regras, `modelo.ts`) e o `jsonb`
 * persistido em `vtt_turn_tracks` (migration 0088).
 *
 * POR QUE VALIDAR NA LEITURA, se quem escreve é o próprio app: porque
 * o que volta do banco é `unknown` de verdade. Vem de outra sessão
 * (possivelmente numa versão anterior do app), de um payload de
 * realtime, ou de uma linha gravada antes de o formato mudar. Um
 * `as EstadoTrilha` faria o primeiro campo faltante explodir lá dentro
 * das regras, longe da causa — e pior, silenciosamente: `participantes`
 * indefinido vira `.filter` de undefined no meio de uma transição.
 *
 * A política é conservadora e explícita: forma inválida devolve `null`
 * ("não há trilha que eu saiba ler"), nunca um estado remendado. Campo
 * OPCIONAL ausente ganha o padrão do modelo; campo OBRIGATÓRIO
 * inválido invalida o participante inteiro, e um participante inválido
 * invalida a trilha — meio elenco é pior que elenco nenhum, porque a
 * alternância passaria a mentir.
 *
 * Nada aqui decide regra de combate. É só forma.
 */

import {
  type EstadoTrilha, type Janela, type Lado, type ModoCena, type Participante,
} from "./modelo";

const LADOS: readonly string[] = ["pj", "pn"];
const JANELAS: readonly string[] = ["rapidos", "lentos"];
const MODOS: readonly string[] = ["exploracao", "combate", "emboscada", "tregua"];

/**
 * PA/reflexos de um participante novo.
 *
 * A trilha nunca teve PA/reflexos de ficha: qualquer token da cena
 * pode entrar no combate (criado pela UI, sem elenco fixo), então o
 * valor é uma CONSTANTE documentada — não finge derivar de ficha
 * nenhuma. Integração real com o sistema de fichas fica pra quando os
 * recursos do personagem alimentarem a trilha; o dia que isso
 * acontecer, é só aqui que muda.
 */
export const PA_PADRAO_TRILHA = 3;
export const REFLEXOS_PADRAO_TRILHA = 2;

/** Só os campos do token que a trilha precisa — não arrasta `TokenApresentacao` inteiro pra cá. */
export interface TokenParaTrilha {
  id: string;
  nome: string;
  lado: "pj" | "pn" | "neutro";
  condicoes: readonly string[];
}

/**
 * Token → participante novo. Token "neutro" entra pelo lado do
 * narrador: a trilha só conhece DOIS lados (a alternância é binária),
 * e quem não é personagem de jogador é conduzido pelo narrador.
 */
export function participanteDeToken(t: TokenParaTrilha): Participante {
  return {
    id: t.id,
    nome: t.nome,
    lado: t.lado === "pj" ? "pj" : "pn",
    declaracao: null,
    paComprometido: null,
    paTotal: PA_PADRAO_TRILHA,
    paGasto: 0,
    reflexos: REFLEXOS_PADRAO_TRILHA,
    agiuEm: [],
    fragmentouEm: null,
    encerrou: false,
    incapaz: t.condicoes.includes("inconsciente") ? { motivo: "Inconsciente" } : null,
  };
}

/**
 * Estado inicial de uma trilha nova.
 *
 * Não reimplementa nada: é a MESMA forma que `proximaRodada` produz
 * pra rodada seguinte (PA zerado, sem declaração, sem marcas), só que
 * partindo da rodada 1 e sem alternância herdada (`ultimoLado: null` —
 * a primeira jogada da cena é livre, ninguém "devolve" a vez a
 * ninguém).
 */
export function estadoInicialTrilha(params: {
  tokens: readonly TokenParaTrilha[];
  modo: ModoCena;
  ladoSurpresa?: Lado | null;
}): EstadoTrilha {
  return {
    modo: params.modo,
    rodada: 1,
    janela: "rapidos",
    ultimoLado: null,
    agindoId: null,
    ladoSurpresa: params.modo === "emboscada" ? params.ladoSurpresa ?? null : null,
    participantes: params.tokens.map(participanteDeToken),
  };
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textoNaoVazio(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function inteiroNaoNegativo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

function umDe<T extends string>(v: unknown, valores: readonly string[]): T | null {
  return typeof v === "string" && valores.includes(v) ? (v as T) : null;
}

function participanteDeJson(bruto: unknown): Participante | null {
  if (!ehObjeto(bruto)) return null;

  const id = textoNaoVazio(bruto.id);
  const lado = umDe<Lado>(bruto.lado, LADOS);
  const paTotal = inteiroNaoNegativo(bruto.paTotal);
  const paGasto = inteiroNaoNegativo(bruto.paGasto);
  if (!id || !lado || paTotal === null || paGasto === null) return null;

  // `agiuEm` filtra silenciosamente entradas desconhecidas em vez de
  // invalidar: uma janela que este app não conhece não muda o que ele
  // sabe fazer, e derrubar a trilha inteira por causa disso seria
  // desproporcional.
  const agiuEm = Array.isArray(bruto.agiuEm)
    ? bruto.agiuEm.map((j) => umDe<Janela>(j, JANELAS)).filter((j): j is Janela => j !== null)
    : [];

  const incapazBruto = bruto.incapaz;
  const incapaz = ehObjeto(incapazBruto)
    ? { motivo: textoNaoVazio(incapazBruto.motivo) ?? "Incapaz de agir" }
    : null;

  return {
    id,
    // Nome vazio é aceitável (o retrato/sigla identifica), nome ausente não.
    nome: typeof bruto.nome === "string" ? bruto.nome : id,
    lado,
    declaracao: umDe<Janela>(bruto.declaracao, JANELAS),
    paComprometido: inteiroNaoNegativo(bruto.paComprometido),
    paTotal,
    paGasto,
    reflexos: inteiroNaoNegativo(bruto.reflexos) ?? 0,
    agiuEm,
    fragmentouEm: umDe<Janela>(bruto.fragmentouEm, JANELAS),
    encerrou: bruto.encerrou === true,
    incapaz,
  };
}

/**
 * `jsonb` → `EstadoTrilha`, ou `null` se a forma não for reconhecível.
 *
 * Um `null` aqui NÃO significa "sem combate": significa "não sei ler
 * esta trilha". Quem chama trata os dois iguais na tela (nada de
 * trilhos), mas quem escreve nunca deve sobrescrever por cima de um
 * estado ilegível — o narrador reinicia explicitamente.
 */
export function trilhaDeJson(bruto: unknown): EstadoTrilha | null {
  if (!ehObjeto(bruto)) return null;

  const modo = umDe<ModoCena>(bruto.modo, MODOS);
  const janela = umDe<Janela>(bruto.janela, JANELAS);
  const rodada = inteiroNaoNegativo(bruto.rodada);
  if (!modo || !janela || rodada === null || rodada < 1) return null;
  if (!Array.isArray(bruto.participantes) || bruto.participantes.length === 0) return null;

  const participantes: Participante[] = [];
  const vistos = new Set<string>();
  for (const p of bruto.participantes) {
    const participante = participanteDeJson(p);
    // Id repetido é tão corrosivo quanto participante inválido: as
    // transições casam por id, e um duplicado faria `assumirTurno`
    // agir sobre um e `concluirTurno` sobre outro.
    if (!participante || vistos.has(participante.id)) return null;
    vistos.add(participante.id);
    participantes.push(participante);
  }

  const agindoId = textoNaoVazio(bruto.agindoId);
  return {
    modo,
    rodada,
    janela,
    ultimoLado: umDe<Lado>(bruto.ultimoLado, LADOS),
    // Referência pendurada não é erro de forma, é lixo: quem está
    // agindo TEM que estar no elenco, senão o turno aberto ficaria
    // impossível de concluir.
    agindoId: agindoId && vistos.has(agindoId) ? agindoId : null,
    ladoSurpresa: modo === "emboscada" ? umDe<Lado>(bruto.ladoSurpresa, LADOS) : null,
    participantes,
  };
}

/**
 * `EstadoTrilha` → JSON puro pra gravar.
 *
 * Explícito campo a campo, nunca `JSON.parse(JSON.stringify(estado))`:
 * o que vai pro banco é contrato entre versões do app, e uma cópia
 * cega carregaria junto qualquer campo transitório que alguém venha a
 * pendurar no estado em memória.
 */
export function trilhaParaJson(estado: EstadoTrilha): Record<string, unknown> {
  return {
    modo: estado.modo,
    rodada: estado.rodada,
    janela: estado.janela,
    ultimoLado: estado.ultimoLado,
    agindoId: estado.agindoId,
    ladoSurpresa: estado.ladoSurpresa ?? null,
    participantes: estado.participantes.map((p) => ({
      id: p.id,
      nome: p.nome,
      lado: p.lado,
      declaracao: p.declaracao,
      paComprometido: p.paComprometido ?? null,
      paTotal: p.paTotal,
      paGasto: p.paGasto,
      reflexos: p.reflexos,
      agiuEm: [...p.agiuEm],
      fragmentouEm: p.fragmentouEm,
      encerrou: p.encerrou,
      incapaz: p.incapaz ? { motivo: p.incapaz.motivo } : null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────
// Edição de elenco — transições de ADMINISTRAÇÃO (ferramenta
// "Rodadas"), separadas das transições de REGRA (`modelo.ts`).
//
// Ficam aqui, e não em `modelo.ts`, de propósito: o livro não fala
// sobre "adicionar um token que chegou depois" nem sobre "remover
// alguém do combate" — isso é gestão de mesa, não regra de turno.
// Misturar as duas coisas no modelo tornaria mais difícil ver o que é
// regra de verdade.
// ─────────────────────────────────────────────────────────────────

/** Entra na trilha em andamento, já com o PA da rodada corrente cheio. Ignora quem já está. */
export function adicionarParticipantes(estado: EstadoTrilha, tokens: readonly TokenParaTrilha[]): EstadoTrilha {
  const existentes = new Set(estado.participantes.map((p) => p.id));
  const novos = tokens.filter((t) => !existentes.has(t.id)).map(participanteDeToken);
  if (novos.length === 0) return estado;
  return { ...estado, participantes: [...estado.participantes, ...novos] };
}

/**
 * Sai da trilha. Se era quem estava agindo, a ativação aberta CAI
 * junto (`agindoId` volta a `null`) — a interface avisa antes, mas o
 * estado nunca pode ficar apontando pra um participante que não existe
 * mais.
 *
 * `ultimoLado` é preservado: quem saiu não desfaz a alternância que
 * já aconteceu.
 */
export function removerParticipante(estado: EstadoTrilha, id: string): EstadoTrilha {
  const participantes = estado.participantes.filter((p) => p.id !== id);
  if (participantes.length === estado.participantes.length) return estado;
  return {
    ...estado,
    agindoId: estado.agindoId === id ? null : estado.agindoId,
    participantes,
  };
}

/**
 * Marca/desmarca "incapaz de agir" (inconsciente, imobilizado, fora da
 * cena…). O modelo já trata `incapaz` como motivo de inelegibilidade —
 * isto só liga e desliga o campo, com o motivo que o narrador deu.
 */
export function definirIncapaz(estado: EstadoTrilha, id: string, motivo: string | null): EstadoTrilha {
  return {
    ...estado,
    agindoId: motivo !== null && estado.agindoId === id ? null : estado.agindoId,
    participantes: estado.participantes.map((p) => (
      p.id === id ? { ...p, incapaz: motivo === null ? null : { motivo } } : p
    )),
  };
}
