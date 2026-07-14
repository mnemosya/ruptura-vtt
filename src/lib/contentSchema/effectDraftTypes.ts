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

export type EfeitoEditavel =
  | (CamposEfeitoComuns & { tipo: "dano"; campos: CamposDano })
  | (CamposEfeitoComuns & { tipo: "cura"; campos: CamposCura })
  | (CamposEfeitoComuns & { tipo: "aplicar_condicao"; campos: CamposAplicarCondicao })
  | (CamposEfeitoComuns & { tipo: "remover_condicao"; campos: CamposRemoverCondicao })
  | (CamposEfeitoComuns & { tipo: "modificar_teste"; campos: CamposModificarTeste })
  | (CamposEfeitoComuns & { tipo: "alterar_recurso"; campos: CamposAlterarRecurso });

export type TipoEfeitoMvp = EfeitoEditavel["tipo"];

export const TIPOS_EFEITO_MVP: readonly TipoEfeitoMvp[] = ["dano", "cura", "aplicar_condicao", "remover_condicao", "modificar_teste", "alterar_recurso"];

export function isTipoEfeitoMvp(tipo: string): tipo is TipoEfeitoMvp {
  return (TIPOS_EFEITO_MVP as readonly string[]).includes(tipo);
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

/** Cria um efeito em branco do tipo escolhido, com valores padrão seguros (nunca "automático" por padrão). */
export function novoEfeitoEditavel(tipo: TipoEfeitoMvp, ordem: number): EfeitoEditavel {
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
  }
}
