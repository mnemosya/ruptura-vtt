/**
 * Estrutura compartilhada do Construtor de Efeitos MVP (Etapa 4).
 *
 * Os 6 efeitos do MVP (dano, cura, aplicar_condicao, remover_condicao,
 * modificar_teste, alterar_recurso) NÃO são 6 sistemas isolados — todos
 * compartilham `CamposEfeitoComuns` (id estável, habilitado, ordem,
 * gatilho, alvo, duração, textos de log/lembrete) e um único mecanismo
 * de diagnóstico (`effectDiagnostics.ts`). Só `campos` varia por tipo,
 * como um discriminated union sobre `tipo`.
 *
 * `id` é gerado uma única vez (na criação do efeito) e nunca recriado —
 * reordenar/duplicar/habilitar-desabilitar preserva identidade.
 */

import type { DuracaoCanonica } from "./types";

export const GATILHOS_INICIAIS = [
  "ao_usar",
  "ao_acertar",
  "ao_causar_dano",
  "ao_sofrer_dano",
  "ao_curar",
  "ao_receber_cura",
  "ao_aplicar_condicao",
  "ao_remover_condicao",
  "ao_iniciar_rodada",
  "ao_encerrar_rodada",
  "ao_iniciar_turno",
  "ao_encerrar_turno",
  "ao_iniciar_cena",
  "ao_encerrar_cena",
  "ao_chegar_a_0_pv",
  "ao_ativar",
  "ao_desativar",
  "manualmente",
] as const;
export type GatilhoInicial = (typeof GATILHOS_INICIAIS)[number];

/**
 * Ruptura permanece em teatro da mente — distância/adjacência/linha de
 * visão nunca viram alvo automático; "selecionado_manualmente" é o
 * escape hatch explícito para isso, nunca inventado silenciosamente.
 */
export const ALVOS_INICIAIS = [
  "proprio",
  "alvo_principal",
  "aliado",
  "inimigo",
  "portador",
  "usuario",
  "item",
  "arma",
  "area",
  "selecionado_manualmente",
] as const;
export type AlvoInicial = (typeof ALVOS_INICIAIS)[number];

export interface CamposEfeitoComuns {
  id: string;
  habilitado: boolean;
  ordem: number;
  nomeOpcional?: string;
  gatilho?: GatilhoInicial | string;
  alvo?: AlvoInicial | string;
  duracao?: DuracaoCanonica;
  textoLog?: string;
  textoLembrete?: string;
}

export type TipoFormula = "fixo" | "dados" | "dados_com_modificador";

export interface CamposDano {
  tipoFormula: TipoFormula;
  quantidadeDados?: number;
  faces?: number;
  modificador?: number;
  valorFixo?: number;
  tipoDano: string;
  subtipoDano?: string;
  danoPrincipalOuAdicional: "principal" | "adicional";
  ignoraMit: boolean;
  ignoraPd: boolean;
  metadeEmSucesso: boolean;
}

export type RecursoCura = "pv" | "pe" | "mana" | "integridade" | "pd";

export interface CamposCura {
  tipoFormula: "fixo" | "dados";
  quantidadeDados?: number;
  faces?: number;
  valorFixo?: number;
  recurso: RecursoCura;
  limitarAoMaximo: boolean;
  permitirValorTemporario: boolean;
}

export interface CamposAplicarCondicao {
  /** Referência estruturada (slug da condição publicada) — nunca texto livre. */
  condicaoSlug: string;
  intensidadeOuPilhas?: number;
  acumulavel: boolean;
  maximoDePilhas?: number;
  autoria: "sem_autoria" | "personagem_de_origem" | "conteudo_de_origem";
  confirmacaoManual: boolean;
}

export interface CamposRemoverCondicao {
  condicaoSlug?: string;
  condicoesPossiveis: string[];
  selecaoManual: boolean;
  quantidadeRemovida?: number;
  removerTodas: boolean;
  bloquearSemCondicaoCompativel: boolean;
}

export type ModoModificarTeste = "bonus" | "penalidade" | "vantagem" | "desvantagem";

export interface CamposModificarTeste {
  modo: ModoModificarTeste;
  valor?: number;
  atributo?: string;
  pericia?: string;
  acao?: string;
  defesa?: string;
  tags: string[];
  acumulavel: boolean;
  maximo?: number;
  consumirNoProximoTeste: boolean;
  confirmacaoDeContexto: boolean;
}

/** Recursos reconhecidos hoje pelo motor (auditoria Etapa 0/1) — não generalizar recursos inexistentes. */
export const RECURSOS_ALTERAR = ["pv", "pe", "mana", "integridade", "pa", "reacoes", "sobrecarga", "ram", "cargas", "municao", "dados_de_gatilho"] as const;
export type RecursoAlterar = (typeof RECURSOS_ALTERAR)[number];

export type OperacaoRecurso = "somar" | "reduzir" | "definir" | "conceder_temporariamente";

export interface CamposAlterarRecurso {
  recurso: RecursoAlterar;
  operacao: OperacaoRecurso;
  valorFixo?: number;
  formula?: string;
  minimo?: number;
  maximo?: number;
  bloquearPorInsuficiencia: boolean;
}

/**
 * Faixas de margem reais do motor de dados (`src/lib/dice/types.ts::
 * MARGEM_CLASSIFICACOES`) — a ÚNICA fonte de verdade sobre quais faixas
 * existem. Nunca inventar uma faixa nova aqui; "manual" é o escape
 * hatch explícito para um resultado que a mesa resolve fora dessas 6
 * (ex.: efeito "quando o narrador decidir").
 */
export const FAIXAS_RESULTADO_TESTE = [
  "falha_critica",
  "falha",
  "falha_limitada",
  "sucesso_limitado",
  "sucesso_padrao",
  "sucesso_critico",
  "manual",
] as const;
export type FaixaResultadoTeste = (typeof FAIXAS_RESULTADO_TESTE)[number];

export const MODOS_TESTE_RESISTENCIA = ["teste", "resistencia"] as const;
export type ModoTesteResistencia = (typeof MODOS_TESTE_RESISTENCIA)[number];

/** "quem testa" — nunca automatiza distância/linha de visão; `selecionado_manualmente` cobre o resto do teatro da mente. */
export const QUEM_TESTA_OPCOES = ["usuario", "alvo", "atacante", "defensor", "portador", "selecionado_manualmente"] as const;
export type QuemTesta = (typeof QUEM_TESTA_OPCOES)[number];

/**
 * CD fixa (número validado) ou derivada — e a ÚNICA origem determinística
 * suportada nesta etapa é a CD de vertente (`6 + nível`, nunca a fórmula
 * legada `5 + nivel_vertente`). Sem campo de fórmula livre — a pessoa
 * administradora nunca escreve uma fórmula arbitrária.
 */
export type CdTesteResistencia = { tipo: "fixa"; valor: number } | { tipo: "derivada"; origem: "vertente" };

export interface CamposTesteResistencia {
  modo: ModoTesteResistencia;
  quemTesta?: QuemTesta;
  atributo?: string;
  pericia?: string;
  cd?: CdTesteResistencia;
  /** Repetição só quando representável nesta etapa — nenhum executor ainda a consome; vive como metadado/lembrete. */
  repeticao?: "nenhuma" | "cada_rodada" | "cada_turno";
  confirmacaoManual: boolean;
  resultados: ResultadoTeste[];
}

export interface ResultadoTeste {
  id: string;
  ordem: number;
  faixa: FaixaResultadoTeste;
  textoResultado?: string;
  /** Reusa o catálogo universal — nunca `teste_resistencia` (sem recursão; ver EfeitoFilho). */
  efeitos: EfeitoFilho[];
}

export type OperacaoMargem = "promover" | "rebaixar" | "definir";
export type ContextoMargem = "teste" | "ataque" | "defesa" | "pericia" | "acao";

export interface CamposModificarMargem {
  operacao: OperacaoMargem;
  quantidadeFaixas?: number;
  faixaOrigem?: FaixaResultadoTeste;
  faixaDestino?: FaixaResultadoTeste;
  contexto: ContextoMargem;
  /** Perícias afetadas — mesmo formato de `getMarginPromotions` (`talentEngine.ts`), nunca uma lista nova. */
  pericias: string[];
  tags: string[];
  /** Texto livre descrevendo o contexto real em que a promoção vale (ex.: "ataque com arma de fogo") — o motor real exige confirmação manual de que o contexto bate. */
  contextoTexto?: string;
  confirmacaoManual: boolean;
}

export type OperacaoDanoRecebido = "reduzir" | "anular" | "multiplicar";
export type MomentoMitigacao = "antes_mit" | "depois_mit" | "antes_pd" | "depois_pd" | "apos_defesas";

export interface CamposAlterarDanoRecebido {
  operacao: OperacaoDanoRecebido;
  valorFixo?: number;
  multiplicador?: number;
  tipoDano?: string;
  subtipoDano?: string;
  momento: MomentoMitigacao;
  limite?: number;
  confirmacaoManual: boolean;
}

/** Tipos aceitos como filho de um resultado de teste/resistência — todo o catálogo universal, exceto o próprio teste/resistência (sem recursão, sem ciclo possível). */
export type EfeitoFilho =
  | (CamposEfeitoComuns & { tipo: "dano"; campos: CamposDano })
  | (CamposEfeitoComuns & { tipo: "cura"; campos: CamposCura })
  | (CamposEfeitoComuns & { tipo: "aplicar_condicao"; campos: CamposAplicarCondicao })
  | (CamposEfeitoComuns & { tipo: "remover_condicao"; campos: CamposRemoverCondicao })
  | (CamposEfeitoComuns & { tipo: "modificar_teste"; campos: CamposModificarTeste })
  | (CamposEfeitoComuns & { tipo: "alterar_recurso"; campos: CamposAlterarRecurso })
  | (CamposEfeitoComuns & { tipo: "modificar_margem"; campos: CamposModificarMargem })
  | (CamposEfeitoComuns & { tipo: "alterar_dano_recebido"; campos: CamposAlterarDanoRecebido });

export type EfeitoEditavel =
  | EfeitoFilho
  | (CamposEfeitoComuns & { tipo: "teste_resistencia"; campos: CamposTesteResistencia });

export type TipoEfeitoMvp = "dano" | "cura" | "aplicar_condicao" | "remover_condicao" | "modificar_teste" | "alterar_recurso";

/** Os 6 tipos originais do MVP (Etapa 4) — usado onde a distinção histórica importa (ex.: rótulos). Para "é um tipo que o Construtor sabe criar/serializar", use `TIPOS_EFEITO_EDITAVEL`. */
export const TIPOS_EFEITO_MVP: readonly TipoEfeitoMvp[] = ["dano", "cura", "aplicar_condicao", "remover_condicao", "modificar_teste", "alterar_recurso"];

export function isTipoEfeitoMvp(tipo: string): tipo is TipoEfeitoMvp {
  return (TIPOS_EFEITO_MVP as readonly string[]).includes(tipo);
}

/** Tipo de qualquer efeito editável, incluindo os 3 novos da Etapa 7 (`teste_resistencia`/`modificar_margem`/`alterar_dano_recebido`). */
export type TipoEfeitoEditavel = EfeitoEditavel["tipo"];

/** Todos os tipos que o Construtor sabe criar/serializar nesta etapa — os 6 originais + os 3 da Etapa 7. Usado pelo seletor de tipo da UI e por qualquer checagem "este tipo existe no catálogo editável". */
export const TIPOS_EFEITO_EDITAVEL: readonly TipoEfeitoEditavel[] = [...TIPOS_EFEITO_MVP, "modificar_margem", "alterar_dano_recebido", "teste_resistencia"];

export function isTipoEfeitoEditavel(tipo: string): tipo is TipoEfeitoEditavel {
  return (TIPOS_EFEITO_EDITAVEL as readonly string[]).includes(tipo);
}

/** Tipos válidos como filho de um resultado — os 6 originais + margem/dano recebido, nunca `teste_resistencia` (profundidade limitada por construção). */
export const TIPOS_EFEITO_FILHO: readonly EfeitoFilho["tipo"][] = [...TIPOS_EFEITO_MVP, "modificar_margem", "alterar_dano_recebido"];

export function isTipoEfeitoFilho(tipo: string): tipo is EfeitoFilho["tipo"] {
  return (TIPOS_EFEITO_FILHO as readonly string[]).includes(tipo);
}

function gerarIdEfeito(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `efeito-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Gera a fórmula legível a partir do controle amigável (quantidade + dado + modificador) — nunca o inverso. */
export function formatarFormulaDano(c: CamposDano): string {
  if (c.tipoFormula === "fixo") return String(c.valorFixo ?? 0);
  const base = `${c.quantidadeDados ?? 0}d${c.faces ?? 0}`;
  if (c.tipoFormula === "dados_com_modificador" && c.modificador) return `${base}${c.modificador >= 0 ? "+" : ""}${c.modificador}`;
  return base;
}

export function formatarFormulaCura(c: CamposCura): string {
  if (c.tipoFormula === "fixo") return String(c.valorFixo ?? 0);
  return `${c.quantidadeDados ?? 0}d${c.faces ?? 0}`;
}

function gerarIdResultado(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `resultado-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Cria um resultado em branco (sem efeitos filhos) para uma faixa ainda não usada na árvore. */
export function novoResultadoTeste(faixa: FaixaResultadoTeste, ordem: number): ResultadoTeste {
  return { id: gerarIdResultado(), ordem, faixa, efeitos: [] };
}

/** Cria um efeito em branco do tipo escolhido, com valores padrão seguros (nunca "automático" por padrão). */
export function novoEfeitoEditavel(tipo: TipoEfeitoEditavel, ordem: number): EfeitoEditavel {
  const comuns: CamposEfeitoComuns = { id: gerarIdEfeito(), habilitado: true, ordem };

  switch (tipo) {
    case "dano":
      return { ...comuns, tipo, campos: { tipoFormula: "dados", tipoDano: "", danoPrincipalOuAdicional: "principal", ignoraMit: false, ignoraPd: false, metadeEmSucesso: false } };
    case "cura":
      return { ...comuns, tipo, campos: { tipoFormula: "dados", recurso: "pv", limitarAoMaximo: true, permitirValorTemporario: false } };
    case "aplicar_condicao":
      return { ...comuns, tipo, campos: { condicaoSlug: "", acumulavel: false, autoria: "sem_autoria", confirmacaoManual: false } };
    case "remover_condicao":
      return { ...comuns, tipo, campos: { condicoesPossiveis: [], selecaoManual: false, removerTodas: false, bloquearSemCondicaoCompativel: true } };
    case "modificar_teste":
      return { ...comuns, tipo, campos: { modo: "bonus", tags: [], acumulavel: false, consumirNoProximoTeste: false, confirmacaoDeContexto: false } };
    case "alterar_recurso":
      return { ...comuns, tipo, campos: { recurso: "pa", operacao: "somar", bloquearPorInsuficiencia: false } };
    case "modificar_margem":
      return { ...comuns, tipo, campos: { operacao: "promover", contexto: "teste", pericias: [], tags: [], confirmacaoManual: true } };
    case "alterar_dano_recebido":
      return { ...comuns, tipo, campos: { operacao: "reduzir", momento: "antes_mit", confirmacaoManual: true } };
    case "teste_resistencia":
      return { ...comuns, tipo, campos: { modo: "resistencia", confirmacaoManual: true, resultados: [] } };
  }
}
