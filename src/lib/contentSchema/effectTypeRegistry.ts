/**
 * Catálogo canônico de tipos de efeito (aditivo §9–10, plano §"matriz de
 * efeitos × executor").
 *
 * A auditoria encontrou ~150 valores distintos de `tipo` no conteúdo
 * real, sem taxonomia compartilhada entre content_types. Este catálogo é
 * a ÚNICA fonte de verdade sobre: (a) que efeitos canônicos existem, (b)
 * quais campos cada um espera, (c) qual o modo de automação real — nunca
 * duplicar essa informação em outro módulo (nem no editor, nem no
 * motor). `diagnostics.ts` só lê daqui.
 *
 * Cobre os 6 efeitos do MVP (aditivo §Etapa 4) + `teste_resistencia`
 * (necessário para o caso obrigatório 5) + `outro`, o balde de escape
 * para os ~140 tipos legados ainda não canonicalizados — nenhum dado é
 * perdido, só ainda não tem formulário/executor dedicado.
 */

import type { ModoAutomacao } from "./types";

export interface CampoEfeito {
  nome: string;
  tipo: "string" | "number" | "boolean" | "referencia" | "array" | "unknown";
  obrigatorio: boolean;
  descricao: string;
}

export interface EfeitoTipoDefinition {
  id: string;
  label: string;
  camposEspecificos: CampoEfeito[];
  executor: {
    modo: ModoAutomacao;
    modulo?: string;
    observacao: string;
  };
  /**
   * Valores de `tipo` (e, quando preciso, `familia`) crus encontrados no
   * conteúdo real que este efeito canônico representa, por content_type.
   * Usado pelos adapters para reconhecer o efeito legado — nunca
   * hardcoded de novo em cada adapter individualmente.
   */
  aliasesLegado: Partial<Record<string, string[]>>;
}

export const EFFECT_TYPE_REGISTRY: Record<string, EfeitoTipoDefinition> = {
  dano: {
    id: "dano",
    label: "Dano",
    camposEspecificos: [
      { nome: "dado", tipo: "string", obrigatorio: false, descricao: "Fórmula de dados, ex.: '1d8'." },
      { nome: "valorFixo", tipo: "number", obrigatorio: false, descricao: "Valor fixo, quando não há dado." },
      { nome: "tipoDano", tipo: "string", obrigatorio: true, descricao: "Tipo de dano (fisico, energetico, ...)." },
      { nome: "subtipoDano", tipo: "string", obrigatorio: false, descricao: "Subtipo (perfurante, igneo, ...)." },
      { nome: "sucesso", tipo: "string", obrigatorio: false, descricao: "Comportamento em sucesso na resistência (metade/zero)." },
    ],
    executor: {
      modo: "assistido",
      modulo: "src/lib/character/spells.ts, itemUse.ts, endRoundConditions.ts",
      observacao:
        "Rola a fórmula em todos os fluxos; só aplica automaticamente ao alvo quando vem de condição de fim de rodada (endRoundConditions.ts). Em magia/item, o resultado ainda depende de aplicação manual.",
    },
    aliasesLegado: {
      spell: ["dano"],
      item: ["dano", "dano_em_area"],
      condition: ["dano_fim_de_rodada"],
    },
  },
  cura: {
    id: "cura",
    label: "Cura",
    camposEspecificos: [
      { nome: "dado", tipo: "string", obrigatorio: false, descricao: "Fórmula de dados, ex.: '2d6'." },
      { nome: "valorFixo", tipo: "number", obrigatorio: false, descricao: "Valor fixo, quando não há dado." },
      { nome: "recurso", tipo: "string", obrigatorio: true, descricao: "Recurso curado (pv, pe, mana, integridade)." },
    ],
    executor: {
      modo: "automatico",
      modulo: "src/lib/character/itemUse.ts (applyGmHealing)",
      observacao: "Já aplica o recurso ao alvo, limitado ao máximo, e remove condições associadas (Sangrando/Contundido/Envenenado) quando aplicável.",
    },
    aliasesLegado: {
      item: ["cura"],
      spell: ["cura"],
    },
  },
  aplicar_condicao: {
    id: "aplicar_condicao",
    label: "Aplicar condição",
    camposEspecificos: [
      { nome: "condicao", tipo: "referencia", obrigatorio: true, descricao: "Condição da Biblioteca a aplicar." },
      { nome: "duracaoOverride", tipo: "unknown", obrigatorio: false, descricao: "Duração específica deste efeito, se substituir a padrão da condição." },
    ],
    executor: {
      modo: "assistido",
      modulo: "src/lib/character/conditionEffectExecutor.ts (executarAplicarCondicao) + gmActions.ts (applyGmCondition)",
      observacao:
        "Era o maior gap de automação do conteúdo (51 ocorrências na auditoria, sem executor). Etapa 4 conectou um executor genérico (valida a condição publicada, a duração e o acúmulo antes de mutar, preserva autoria e gera log) ao fluxo manual de aplicar condição em /dev/table — por isso o teto sobe para \"assistido\" (o narrador ainda seleciona alvo/confirma). Continua sem execução totalmente automática a partir de magia/item/runa (isso exigiria também resolver alvo/distância, fora do teatro da mente de Ruptura). O diagnóstico por instância (effectDiagnostics.ts) pode refinar para \"automático\" quando o efeito editável já resolve alvo e condição sem exigir confirmação adicional.",
    },
    aliasesLegado: {
      spell: ["aplicar_condicao"],
      item: ["aplicar_condicao"],
      rune: ["aplicar_condicao"],
      property: ["resistencia_critica_aplica_condicao"],
    },
  },
  remover_condicao: {
    id: "remover_condicao",
    label: "Remover condição",
    camposEspecificos: [
      { nome: "condicao", tipo: "referencia", obrigatorio: false, descricao: "Condição específica a remover." },
      { nome: "todas", tipo: "boolean", obrigatorio: false, descricao: "Remove todas as condições ativas compatíveis." },
    ],
    executor: {
      modo: "automatico",
      modulo: "src/lib/character/itemUse.ts, actionConsole.ts",
      observacao: "Já remove a condição quando ela está ativa no alvo e a origem é compatível com a Biblioteca.",
    },
    aliasesLegado: {
      item: ["remover_condicao"],
      condition: ["remover_ao_recuperar_pv"],
      combat_action: ["remover_condicao", "remover_condicoes"],
    },
  },
  modificar_teste: {
    id: "modificar_teste",
    label: "Modificar teste",
    camposEspecificos: [
      { nome: "valor", tipo: "number", obrigatorio: true, descricao: "Bônus (positivo) ou penalidade (negativo)." },
      { nome: "alvoTags", tipo: "array", obrigatorio: false, descricao: "Tags de teste afetadas." },
      { nome: "alvoAcoes", tipo: "array", obrigatorio: false, descricao: "Ações afetadas." },
      { nome: "recebido", tipo: "boolean", obrigatorio: false, descricao: "Verdadeiro quando o modificador se aplica a quem age CONTRA o portador (ex.: modificador_recebido de condição)." },
    ],
    executor: {
      modo: "automatico",
      modulo: "src/lib/character/activeEffects.ts, talents.ts, technicalEffects.ts",
      observacao:
        "Automático quando é bônus numérico simples com alvoTags/alvoAcoes; some para lembrete quando o efeito legado tem `quando`/`restrito_a` (contexto condicional que o motor ainda não avalia).",
    },
    aliasesLegado: {
      talent: ["modificador"],
      condition: ["modificador", "modificador_recebido"],
      rune: ["modificador"],
      escalpo: ["modificador"],
    },
  },
  alterar_recurso: {
    id: "alterar_recurso",
    label: "Alterar recurso",
    camposEspecificos: [
      { nome: "recurso", tipo: "string", obrigatorio: true, descricao: "Recurso afetado (pa, pe, mana, ram, cargas, municao, ...)." },
      { nome: "operacao", tipo: "string", obrigatorio: false, descricao: "somar | reduzir | definir | conceder_temporario." },
      { nome: "valor", tipo: "number", obrigatorio: false, descricao: "Valor da operação." },
    ],
    executor: {
      modo: "assistido",
      modulo: "src/lib/character/endRoundConditions.ts (reduzir_pa)",
      observacao: "Só PA em fim de rodada está automatizado hoje; Mana/PE/Integridade/RAM/cargas via efeito ainda dependem de ação manual do narrador ou de outros fluxos específicos (gasto de conjuração, uso de item).",
    },
    aliasesLegado: {
      talent: ["recurso"],
      condition: ["reduzir_pa"],
      spell: ["recurso", "recurso_temporario"],
      item: ["recurso"],
    },
  },
  teste_resistencia: {
    id: "teste_resistencia",
    label: "Teste ou resistência",
    camposEspecificos: [
      { nome: "pericia", tipo: "string", obrigatorio: false, descricao: "Perícia do teste/resistência." },
      { nome: "cdFormula", tipo: "string", obrigatorio: false, descricao: "Fórmula textual de CD, ex.: '5 + nivel_vertente' (ver nota de defasagem na auditoria §5.3)." },
      { nome: "cdValor", tipo: "number", obrigatorio: false, descricao: "CD literal, quando não há fórmula." },
      { nome: "acoes", tipo: "array", obrigatorio: false, descricao: "Ações de reação permitidas (resistir, esquivar, ...)." },
    ],
    executor: {
      modo: "assistido",
      modulo: "src/lib/character/spells.ts (getSpellDamageEffect / describeSpellManualEffects)",
      observacao: "Gera o texto de CD e a mecânica de dano condicionada a sucesso/falha, mas não resolve a rolagem do alvo nem aplica o efeito de falha automaticamente — a ramificação sucesso/falha em si é lembrete.",
    },
    aliasesLegado: {
      spell: ["efeito_com_resistencia"],
      item: ["efeito_com_resistencia"],
      rune: ["efeito_com_resistencia"],
    },
  },
  outro: {
    id: "outro",
    label: "Efeito ainda não canonicalizado",
    camposEspecificos: [{ nome: "tipoLegado", tipo: "string", obrigatorio: true, descricao: "Valor original de `tipo`/`familia` no payload legado." }],
    executor: {
      modo: "sem_executor",
      observacao:
        "Balde de escape: cobre os ~140 valores de `tipo` do conteúdo real (dano_modificador, protecao, ataque_adicional, economia_pa, autorreparo, revelar, promocao_margem, penalidade_pericia, companheiro, trama, etc.) que a Etapa 1 ainda não canonicalizou individualmente. payloadEspecifico preserva o efeito legado completo — nada é perdido, só não tem formulário/diagnóstico dedicado ainda.",
    },
    aliasesLegado: {},
  },
};

export function getEfeitoTipoDefinition(id: string): EfeitoTipoDefinition {
  return EFFECT_TYPE_REGISTRY[id] ?? EFFECT_TYPE_REGISTRY.outro;
}

/**
 * Resolve o `tipo` canônico a partir do `tipo` (ou `familia`) legado de
 * um content_type específico. Retorna "outro" quando não há alias
 * registrado — nunca lança erro (efeitos desconhecidos são esperados).
 */
export function resolverTipoCanonico(contentType: string, tipoLegado: string | undefined): string {
  if (!tipoLegado) return "outro";
  for (const def of Object.values(EFFECT_TYPE_REGISTRY)) {
    const aliases = def.aliasesLegado[contentType];
    if (aliases?.includes(tipoLegado)) return def.id;
  }
  return "outro";
}
