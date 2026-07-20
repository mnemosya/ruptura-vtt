/**
 * Relatório de conversão de conteúdo legado (Etapa 6).
 *
 * Reusa os adapters já existentes (Etapa 1) — nunca reimplementa
 * parsing de campo. Este módulo só ADICIONA uma camada de
 * classificação por (campo, efeito), em cima do `ConteudoCanonico` e
 * dos `EfeitoCanonico[]` que os adapters já produzem — nunca decide
 * "qual é o formato legado", só "essa conversão específica é segura,
 * ambígua, somente leitura, incompatível ou inválida".
 *
 * DETERMINÍSTICO por construção: só lê `raw`/`canonico`/`efeitos` (sem
 * I/O, sem relógio, sem aleatoriedade) — o mesmo payload com a mesma
 * `ADAPTER_VERSIONS` sempre produz o mesmo relatório. A verificação de
 * referência quebrada (que precisa consultar o banco) fica FORA deste
 * módulo, em `legacyConversionServer.ts` — só ela tem I/O.
 */

import { adaptItem, adaptSpell, adaptTalentLevel } from "./adapters";
import { isTipoEfeitoMvp } from "./effectDraftTypes";
import type { CampoDesconhecido, ClassificacaoLegado, EfeitoCanonico, ModoAutomacao, Referencia, ResultadoAdaptacao } from "./types";
import type { DraftContentType } from "./draftTypes";

/**
 * Versão de cada adapter — muda só quando a LÓGICA de classificação
 * (não o adapter canônico em si) muda de forma que afetaria um
 * relatório já gerado. Um rascunho grava a versão usada no momento da
 * conversão (`origemLegado.adapterVersion`) — uma mudança futura aqui
 * nunca altera silenciosamente um rascunho já iniciado.
 */
export const ADAPTER_VERSIONS: Record<DraftContentType, string> = {
  spell: "spell.legacy.v1",
  item: "item.legacy.v1",
  talent: "talent.legacy.v1",
};

/** Famílias de talento que sinalizam a necessidade de um sistema/etapa futura (não simplesmente "não reconhecido ainda"). */
const FAMILIAS_INCOMPATIVEIS = new Set(["companheiro", "trama", "propagacao_efeito", "meta_talento"]);

export type Confianca = "alta" | "media" | "baixa";

export interface CampoConversao {
  caminho: string;
  classificacao: ClassificacaoLegado;
  valorOriginal: unknown;
  interpretacaoProposta?: unknown;
  motivo: string;
  confianca: Confianca;
}

export interface EfeitoConversao {
  /** Id canônico estável do efeito (`<slug>#efeito-N`) — vira o id editorial na primeira conversão. */
  id: string;
  ordem: number;
  tipoLegado: string | undefined;
  tipoCanonico: string;
  familia?: string;
  classificacao: ClassificacaoLegado;
  editavel: boolean;
  modoAutomacao: ModoAutomacao;
  motivo: string;
}

export interface ReferenciaEncontrada {
  caminho: string;
  referencia: Referencia;
  obrigatoria: boolean;
}

export interface RelatorioConversaoLegado {
  adapterId: DraftContentType;
  adapterVersion: string;
  contentType: DraftContentType;
  slug: string;
  versaoPublicada: string | undefined;
  /** Pior classificação entre campos/efeitos — só informativo, nunca usado para decidir bloqueio sozinho. */
  classificacaoGeral: ClassificacaoLegado;
  campos: CampoConversao[];
  efeitos: EfeitoConversao[];
  referencias: ReferenciaEncontrada[];
  camposDesconhecidos: CampoDesconhecido[];
  avisosSchema: string[];
  riscoDePerda: boolean;
  bloqueado: boolean;
  motivosBloqueio: string[];
}

const RANK: Record<ClassificacaoLegado, number> = {
  conversao_direta: 0,
  conversao_com_confirmacao: 1,
  somente_leitura: 2,
  incompativel: 3,
  invalido: 4,
};

function pior(a: ClassificacaoLegado, b: ClassificacaoLegado): ClassificacaoLegado {
  return RANK[b] > RANK[a] ? b : a;
}

// ---------------------------------------------------------------------
// Classificação de duração — mesmo padrão textual usado por
// `fields/duracao.ts::TEXTO_PARA_TIPO`, mas aqui julgamos AMBIGUIDADE
// (múltiplos padrões batendo, ou nenhum) em vez de só extrair o tipo.
// ---------------------------------------------------------------------
const PADROES_DURACAO: Array<{ padrao: RegExp; tipo: string }> = [
  { padrao: /instant/i, tipo: "instantâneo" },
  { padrao: /rodada/i, tipo: "rodadas" },
  { padrao: /turno/i, tipo: "turno" },
  { padrao: /cena/i, tipo: "cena" },
  { padrao: /combate/i, tipo: "combate" },
  { padrao: /manual/i, tipo: "manual" },
];

function classificarDuracao(caminho: string, bruto: unknown): CampoConversao | undefined {
  if (bruto == null) return undefined;

  if (typeof bruto === "object" && !Array.isArray(bruto)) {
    return { caminho, classificacao: "conversao_direta", valorOriginal: bruto, motivo: "Duração já estruturada (objeto com texto/sustentável).", confianca: "alta" };
  }

  if (typeof bruto !== "string") {
    return { caminho, classificacao: "conversao_com_confirmacao", valorOriginal: bruto, motivo: "Formato de duração não reconhecido.", confianca: "baixa" };
  }

  const composta = /_ou_|_e_|\bou\b|\be\b(?!fim)/i.test(bruto);
  const batidas = PADROES_DURACAO.filter((p) => p.padrao.test(bruto));

  if (composta || batidas.length > 1) {
    return {
      caminho,
      classificacao: "conversao_com_confirmacao",
      valorOriginal: bruto,
      interpretacaoProposta: batidas[0]?.tipo,
      motivo: `Duração composta/ambígua ("${bruto}") — mais de uma interpretação possível, confirme antes de tornar editável.`,
      confianca: "baixa",
    };
  }
  if (batidas.length === 1) {
    return { caminho, classificacao: "conversao_direta", valorOriginal: bruto, interpretacaoProposta: batidas[0].tipo, motivo: `Duração reconhecida como "${batidas[0].tipo}".`, confianca: "alta" };
  }
  return {
    caminho,
    classificacao: "conversao_com_confirmacao",
    valorOriginal: bruto,
    motivo: `Duração "${bruto}" não corresponde a nenhum padrão conhecido (rodada/turno/cena/combate/manual) — confirme o significado antes de tornar editável.`,
    confianca: "baixa",
  };
}

// ---------------------------------------------------------------------
// Classificação de resistência — conflito quando cd_formula E cd
// literal aparecem juntos (o motor real usa fórmula; o normalizador
// preserva os dois, mas isso é uma ambiguidade de qual é a fonte de verdade).
// ---------------------------------------------------------------------
function classificarResistencia(caminho: string, bruto: unknown): CampoConversao | undefined {
  if (bruto == null || typeof bruto !== "object" || Array.isArray(bruto)) return undefined;
  const obj = bruto as Record<string, unknown>;
  const temFormula = typeof obj.cd_formula === "string" && obj.cd_formula.trim() !== "";
  const temValor = typeof obj.cd === "number";

  if (temFormula && temValor) {
    return {
      caminho,
      classificacao: "conversao_com_confirmacao",
      valorOriginal: bruto,
      interpretacaoProposta: { cdFormula: obj.cd_formula },
      motivo: `Resistência tem fórmula ("${obj.cd_formula}") E valor literal (${obj.cd}) simultaneamente — a regra vigente do motor usa fórmula; confirme antes de descartar o valor literal.`,
      confianca: "media",
    };
  }
  return { caminho, classificacao: "conversao_direta", valorOriginal: bruto, motivo: "Resistência com uma única fonte (fórmula ou valor literal).", confianca: "alta" };
}

// ---------------------------------------------------------------------
// Classificação de efeito individual — reusa o tipo canônico já
// resolvido pelo catálogo (Etapa 1); nunca reimplementa o despacho.
// ---------------------------------------------------------------------
function classificarEfeito(contentType: DraftContentType, efeito: EfeitoCanonico, bruto: Record<string, unknown>): EfeitoConversao {
  const tipoLegado = typeof bruto.tipo === "string" ? bruto.tipo : undefined;
  const familia = typeof bruto.familia === "string" ? bruto.familia : undefined;

  if (!tipoLegado) {
    return { id: efeito.id, ordem: efeito.ordem, tipoLegado, tipoCanonico: efeito.tipo, familia, classificacao: "invalido", editavel: false, modoAutomacao: efeito.modoAutomacao, motivo: "Efeito sem campo \"tipo\" — não satisfaz o contrato legado mínimo." };
  }

  if (isTipoEfeitoMvp(efeito.tipo)) {
    const ambiguidade = classificarAmbiguidadeEfeitoMvp(efeito.tipo, bruto);
    return {
      id: efeito.id,
      ordem: efeito.ordem,
      tipoLegado,
      tipoCanonico: efeito.tipo,
      familia,
      classificacao: ambiguidade ?? "conversao_direta",
      editavel: true,
      modoAutomacao: efeito.modoAutomacao,
      motivo: ambiguidade
        ? `Efeito "${tipoLegado}" reconhecido, mas com campo ambíguo — exige confirmação antes de virar editável.`
        : `Efeito "${tipoLegado}" mapeado diretamente para "${efeito.tipo}" — seguro para editar.`,
    };
  }

  if (familia && FAMILIAS_INCOMPATIVEIS.has(familia)) {
    return {
      id: efeito.id,
      ordem: efeito.ordem,
      tipoLegado,
      tipoCanonico: efeito.tipo,
      familia,
      classificacao: "incompativel",
      editavel: false,
      modoAutomacao: efeito.modoAutomacao,
      motivo: `Família "${familia}" exige um sistema ainda não implementado (companheiro/trama/propagação de efeito/meta-talento) — preservado, sem edição.`,
    };
  }

  return {
    id: efeito.id,
    ordem: efeito.ordem,
    tipoLegado,
    tipoCanonico: efeito.tipo,
    familia,
    classificacao: "somente_leitura",
    editavel: false,
    modoAutomacao: efeito.modoAutomacao,
    motivo:
      efeito.tipo === "teste_resistencia"
        ? "Teste de resistência com ramificação — preservado e somente leitura até a Etapa 7."
        : `Efeito "${tipoLegado}" fora dos 6 tipos do MVP — preservado e somente leitura nesta etapa.`,
  };
}

/** Ambiguidades conhecidas por tipo MVP, a partir de exemplos reais auditados. Retorna undefined quando não há ambiguidade. */
function classificarAmbiguidadeEfeitoMvp(tipoCanonico: string, bruto: Record<string, unknown>): ClassificacaoLegado | undefined {
  if (tipoCanonico === "modificar_teste") {
    // "bonus" vs "valor" — exemplo do pedido; hoje não ocorre nos dados reais, mas tratado quando aparecer.
    if (bruto.bonus !== undefined && bruto.valor !== undefined && bruto.bonus !== bruto.valor) return "conversao_com_confirmacao";
    if (bruto.bonus !== undefined && bruto.valor === undefined) return "conversao_com_confirmacao";
  }
  if (tipoCanonico === "remover_condicao") {
    // Formatos distintos de "remover todas": `todas: true` vs lista `condicoes[]` vs `condicao` única — ambíguo quando mais de um aparece.
    const temTodas = bruto.todas === true;
    const temLista = Array.isArray(bruto.condicoes) && bruto.condicoes.length > 0;
    const temUnica = typeof bruto.condicao === "string" && bruto.condicao.trim() !== "";
    if ([temTodas, temLista, temUnica].filter(Boolean).length > 1) return "conversao_com_confirmacao";
  }
  if (tipoCanonico === "dano") {
    if (bruto.dado === undefined && bruto.valor === undefined) return "conversao_com_confirmacao";
  }
  return undefined;
}

/**
 * Monta o relatório de conversão a partir do resultado JÁ ADAPTADO
 * (Etapa 1) e do raw original. Puro/síncrono — sem I/O.
 */
export function montarRelatorioConversao(
  contentType: DraftContentType,
  slug: string,
  versaoPublicada: string | undefined,
  adaptado: ResultadoAdaptacao,
  efeitosBrutos: unknown[],
  camposParaClassificar: Array<{ caminho: string; bruto: unknown; tipo: "duracao" | "resistencia" }>,
): RelatorioConversaoLegado {
  const campos: CampoConversao[] = [];
  for (const c of camposParaClassificar) {
    const resultado = c.tipo === "duracao" ? classificarDuracao(c.caminho, c.bruto) : classificarResistencia(c.caminho, c.bruto);
    if (resultado) campos.push(resultado);
  }

  const efeitos: EfeitoConversao[] = adaptado.canonico.efeitos.map((efeito, indice) => {
    const bruto = (efeitosBrutos[indice] && typeof efeitosBrutos[indice] === "object" ? (efeitosBrutos[indice] as Record<string, unknown>) : {}) ?? {};
    return classificarEfeito(contentType, efeito, bruto);
  });

  const referencias: ReferenciaEncontrada[] = adaptado.canonico.referencias.map((ref) => ({
    caminho: `payload_automacao.efeitos[].${ref.papel ?? ref.tipoConteudo}`,
    referencia: ref,
    obrigatoria: true,
  }));

  let classificacaoGeral: ClassificacaoLegado = "conversao_direta";
  for (const c of campos) classificacaoGeral = pior(classificacaoGeral, c.classificacao);
  for (const e of efeitos) classificacaoGeral = pior(classificacaoGeral, e.classificacao);
  if (adaptado.classificacaoLegado) classificacaoGeral = pior(classificacaoGeral, adaptado.classificacaoLegado === "somente_leitura" && efeitos.some((e) => e.editavel) ? "conversao_com_confirmacao" : adaptado.classificacaoLegado);

  const motivosBloqueio: string[] = [];
  if (efeitos.some((e) => e.classificacao === "invalido")) motivosBloqueio.push("Um ou mais efeitos não satisfazem o contrato legado mínimo (sem \"tipo\").");
  if (adaptado.classificacaoLegado === "invalido" && adaptado.errosFatais) motivosBloqueio.push(...adaptado.errosFatais);

  return {
    adapterId: contentType,
    adapterVersion: ADAPTER_VERSIONS[contentType],
    contentType,
    slug,
    versaoPublicada,
    classificacaoGeral,
    campos,
    efeitos,
    referencias,
    camposDesconhecidos: adaptado.camposDesconhecidos,
    avisosSchema: [],
    riscoDePerda: efeitos.some((e) => e.classificacao === "incompativel" || e.classificacao === "invalido"),
    bloqueado: motivosBloqueio.length > 0,
    motivosBloqueio,
  };
}

/** Caminhos ambíguos que exigem confirmação explícita — a UI usa isso para saber o que ainda falta confirmar. */
export function caminhosPendentesDeConfirmacao(relatorio: RelatorioConversaoLegado): string[] {
  const doDocumento = relatorio.campos.filter((c) => c.classificacao === "conversao_com_confirmacao").map((c) => c.caminho);
  const doEfeito = relatorio.efeitos.filter((e) => e.classificacao === "conversao_com_confirmacao").map((e) => `efeito:${e.id}`);
  return [...doDocumento, ...doEfeito];
}

function asRecordSafe(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function efeitosBrutosDe(raw: Record<string, unknown>): unknown[] {
  const automacao = asRecordSafe(raw.payload_automacao);
  return Array.isArray(automacao.efeitos) ? automacao.efeitos : [];
}

/** Relatório de conversão para uma magia publicada (raw = `content_documents.payload`). */
export function gerarRelatorioSpell(slug: string, raw: Record<string, unknown>): RelatorioConversaoLegado {
  const adaptado = adaptSpell(raw);
  const estatisticas = asRecordSafe(raw.estatisticas);
  return montarRelatorioConversao("spell", slug, adaptado.canonico.versao, adaptado, efeitosBrutosDe(raw), [
    { caminho: "estatisticas.duracao", bruto: estatisticas.duracao, tipo: "duracao" },
  ]);
}

/** Relatório de conversão para um item publicado. */
export function gerarRelatorioItem(slug: string, raw: Record<string, unknown>): RelatorioConversaoLegado {
  const adaptado = adaptItem(raw);
  return montarRelatorioConversao("item", slug, adaptado.canonico.versao, adaptado, efeitosBrutosDe(raw), []);
}

/**
 * Relatório de conversão para um talento publicado — agrega os 3
 * níveis num único relatório (a árvore nunca vira documentos
 * separados; ver `talent.ts`).
 */
export function gerarRelatorioTalento(slug: string, raw: Record<string, unknown>): RelatorioConversaoLegado {
  const nome = String(raw.nome ?? slug);
  const niveisRaw = Array.isArray(raw.niveis) ? raw.niveis : [];
  const relatoriosPorNivel = niveisRaw.map((nivelRaw, indice) => {
    const nivel = asRecordSafe(nivelRaw);
    const adaptado = adaptTalentLevel(slug, nome, nivel);
    const relatorioNivel = montarRelatorioConversao("talent", slug, String(nivel.versao ?? raw.versao ?? ""), adaptado, efeitosBrutosDe(nivel), []);
    // Prefixa caminhos/ids com o nível para diferenciar na agregação.
    return {
      ...relatorioNivel,
      campos: relatorioNivel.campos.map((c) => ({ ...c, caminho: `niveis[${indice}].${c.caminho}` })),
      efeitos: relatorioNivel.efeitos.map((e) => ({ ...e, id: `nivel-${indice + 1}:${e.id}` })),
      camposDesconhecidos: relatorioNivel.camposDesconhecidos.map((c) => ({ ...c, caminho: `niveis[${indice}].${c.caminho}` })),
    };
  });

  let classificacaoGeral: ClassificacaoLegado = "conversao_direta";
  for (const r of relatoriosPorNivel) classificacaoGeral = pior(classificacaoGeral, r.classificacaoGeral);

  return {
    adapterId: "talent",
    adapterVersion: ADAPTER_VERSIONS.talent,
    contentType: "talent",
    slug,
    versaoPublicada: typeof raw.versao === "string" ? raw.versao : undefined,
    classificacaoGeral,
    campos: relatoriosPorNivel.flatMap((r) => r.campos),
    efeitos: relatoriosPorNivel.flatMap((r) => r.efeitos),
    referencias: relatoriosPorNivel.flatMap((r) => r.referencias),
    camposDesconhecidos: [...coletarCamposDesconhecidosTalentoTopo(raw), ...relatoriosPorNivel.flatMap((r) => r.camposDesconhecidos)],
    avisosSchema: [],
    riscoDePerda: relatoriosPorNivel.some((r) => r.riscoDePerda),
    bloqueado: relatoriosPorNivel.some((r) => r.bloqueado) || niveisRaw.length !== 3,
    motivosBloqueio: [
      ...relatoriosPorNivel.flatMap((r) => r.motivosBloqueio),
      ...(niveisRaw.length !== 3 ? [`Talento deveria ter exatamente 3 níveis, encontrado ${niveisRaw.length}.`] : []),
    ],
  };
}

const CHAVES_TALENTO_TOPO = ["id", "slug", "nome", "tags", "descricao_curta", "descricao_longa", "niveis", "status", "versao", "created_at", "updated_at"];

function coletarCamposDesconhecidosTalentoTopo(raw: Record<string, unknown>): CampoDesconhecido[] {
  const conhecidas = new Set(CHAVES_TALENTO_TOPO);
  const resultado: CampoDesconhecido[] = [];
  for (const [chave, valor] of Object.entries(raw)) {
    if (conhecidas.has(chave) || valor === undefined) continue;
    resultado.push({ caminho: chave, valor, motivo: "Campo presente no payload legado do talento sem representação no envelope canônico desta etapa." });
  }
  return resultado;
}
