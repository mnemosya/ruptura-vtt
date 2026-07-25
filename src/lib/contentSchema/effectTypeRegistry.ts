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
      rune: ["dano_modificador"],
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
      rune: ["recurso"],
    },
  },
  teste_resistencia: {
    id: "teste_resistencia",
    label: "Teste ou resistência",
    camposEspecificos: [
      { nome: "modo", tipo: "string", obrigatorio: true, descricao: "teste | resistencia." },
      { nome: "quemTesta", tipo: "string", obrigatorio: false, descricao: "usuario | alvo | atacante | defensor | portador | selecionado_manualmente." },
      { nome: "pericia", tipo: "string", obrigatorio: false, descricao: "Perícia do teste/resistência, vinda da Biblioteca/regras carregadas." },
      { nome: "cd", tipo: "unknown", obrigatorio: false, descricao: "CD fixa (número validado) ou derivada (só \"vertente\", 6 + nível — nunca fórmula livre nem a fórmula legada '5 + nivel_vertente')." },
      { nome: "resultados", tipo: "array", obrigatorio: true, descricao: "Árvore de resultados (sucesso/falha/crítico/faixa/manual), cada um com seus efeitos filhos do catálogo universal." },
    ],
    executor: {
      // Teto explícito: nunca "automatico" nesta etapa — não existe resolvedor
      // genérico conectado a um fluxo real que dispense confirmação do
      // narrador (alvo, resultado do teste e aplicação continuam assistidos).
      modo: "assistido",
      modulo: "src/lib/character/testResistanceTreeExecutor.ts (Etapa 7) + spells.ts (getVertenteCd)",
      observacao:
        "Etapa 7 adiciona um resolvedor genérico (valida ator/alvo/árvore, identifica o ramo pelo resultado informado pela mesa, prepara e aplica os efeitos filhos de forma atômica) conectado à mesa do narrador — mas a rolagem do alvo e a escolha de alvo continuam manuais (teatro da mente). Nunca sobe a automático nesta etapa.",
    },
    aliasesLegado: {
      spell: ["efeito_com_resistencia"],
      item: ["efeito_com_resistencia"],
      rune: ["efeito_com_resistencia"],
    },
  },
  modificar_margem: {
    id: "modificar_margem",
    label: "Modificar margem",
    camposEspecificos: [
      { nome: "operacao", tipo: "string", obrigatorio: true, descricao: "promover | rebaixar | definir." },
      { nome: "faixaOrigem", tipo: "string", obrigatorio: false, descricao: "Faixa de margem de origem (mesmo enum de MARGEM_CLASSIFICACOES)." },
      { nome: "faixaDestino", tipo: "string", obrigatorio: false, descricao: "Faixa de margem de destino." },
      { nome: "pericias", tipo: "array", obrigatorio: false, descricao: "Perícias afetadas — mesmo formato usado por getMarginPromotions (talentEngine.ts)." },
      { nome: "contexto", tipo: "string", obrigatorio: true, descricao: "teste | ataque | defesa | pericia | acao." },
    ],
    executor: {
      modo: "assistido",
      modulo: "src/lib/character/talentEngine.ts (getMarginPromotions) + rollRuptura.ts (promocaoMargem)",
      observacao:
        "Para talento, serializa exatamente no formato que getMarginPromotions já lê hoje (tipo \"promocao_margem\", família \"margem\") — mecanismo real e funcionando, mas sempre assistido: a pessoa jogadora confirma que o contexto da rolagem bate antes de aplicar. Para magia/item não há leitor equivalente ainda — fica lembrete.",
    },
    aliasesLegado: {
      talent: ["promocao_margem"],
    },
  },
  alterar_dano_recebido: {
    id: "alterar_dano_recebido",
    label: "Alterar dano recebido",
    camposEspecificos: [
      { nome: "operacao", tipo: "string", obrigatorio: true, descricao: "reduzir | anular | multiplicar." },
      { nome: "valorFixo", tipo: "number", obrigatorio: false, descricao: "Valor fixo de redução." },
      { nome: "multiplicador", tipo: "number", obrigatorio: false, descricao: "Multiplicador (>= 0)." },
      { nome: "tipoDano", tipo: "string", obrigatorio: false, descricao: "Restringe a um tipo de dano específico." },
      { nome: "momento", tipo: "string", obrigatorio: true, descricao: "antes_mit | depois_mit | antes_pd | depois_pd | apos_defesas — ordem real de defense.ts::resolveDamageWithMitPd." },
    ],
    executor: {
      // Sem integração real hoje (auditoria: temporaryEffects.ts documenta
      // explicitamente a ausência desse ponto de integração) — nunca subir
      // sozinho por decisão de UI.
      modo: "lembrete",
      observacao: "Nenhum executor real aplica isso automaticamente ainda — mesmo conceito real existe em conteúdo legado (rune \"protecao\"/\"reduz_dano_recebido\"), mas sem ponto de integração no motor. Sempre lembrete nesta etapa.",
    },
    // "reduzir_dano_recebido" é o `tipo` legado real produzido para
    // TALENTO (TIPO_LEGADO.talent) — sem isso, reeditar duplicava a
    // entrada a cada republicação (mesmo achado desta rodada).
    aliasesLegado: {
      rune: ["protecao"],
      talent: ["reduzir_dano_recebido"],
    },
  },
  efeito_temporario: {
    id: "efeito_temporario",
    label: "Efeito temporário",
    camposEspecificos: [
      { nome: "duracao", tipo: "unknown", obrigatorio: true, descricao: "rounds (com quantidade) | scene | rest | manual — mesmo vocabulário de TemporaryEffect.durationType." },
      { nome: "politicaReaplicacao", tipo: "string", obrigatorio: true, descricao: "substituir | acumular_pilha | ignorar | manual — mapeia 1:1 para TemporaryEffect.stackingMode." },
      { nome: "maximoPilhas", tipo: "number", obrigatorio: false, descricao: "Só quando acumulável." },
      { nome: "modificadores", tipo: "array", obrigatorio: false, descricao: "Filhos do tipo modificar_teste (máx. 4) — reaproveita campos/executor, não duplica." },
    ],
    executor: {
      modo: "assistido",
      modulo: "src/lib/character/temporaryEffects.ts (addTemporaryEffect, tickRoundTemporaryEffects, expireSceneTemporaryEffects, expireRestTemporaryEffects, deriveActiveEffectsFromTemporaryEffects)",
      observacao:
        "Executor real e genérico já existe e roda hoje a partir do payload `buff_temporario` de itens (itemUse.ts). A CRIAÇÃO do efeito continua exigindo uma ação (usar item/lançar magia/ativar talento) — nunca 'automático' puro — mas expiração por rodada/cena/descanso e modificadores de rolagem (target roll/skill/attribute) já aplicam sozinhos depois de criado. Para talento, o payload é preservado mas não há leitor genérico equivalente ainda — o diagnóstico por instância cai para 'lembrete' nesse caso.",
    },
    // "buff_temporario" também é o `tipo` legado real produzido para
    // TALENTO (não só item) — "buff_empilhavel" é um alias legado
    // diferente, pré-existente, preservado à parte.
    aliasesLegado: {
      item: ["buff_temporario"],
      talent: ["buff_empilhavel", "buff_temporario"],
    },
  },
  acao_reacao_adicional: {
    id: "acao_reacao_adicional",
    label: "Ação ou reação adicional",
    camposEspecificos: [
      { nome: "tipo", tipo: "string", obrigatorio: true, descricao: "acao | reacao | ataque." },
      { nome: "quantidade", tipo: "number", obrigatorio: true, descricao: "Quantidade concedida." },
      { nome: "gratuito", tipo: "boolean", obrigatorio: true, descricao: "Se não substitui nenhum custo." },
      { nome: "consomeReacao", tipo: "boolean", obrigatorio: false, descricao: "Se o USO desta concessão consome uma Reação do próprio personagem." },
    ],
    executor: {
      // Auditoria (talentEngine.ts, actionConsole.ts) não encontrou executor
      // genérico que conceda ação/reação/ataque adicional automaticamente —
      // sempre lembrete, nunca fingir automação.
      modo: "lembrete",
      observacao: "Nenhum executor real concede ação/reação/ataque adicional automaticamente ainda — sempre lembrete para o narrador aplicar manualmente (o console de ação já rastreia PA/Reações gastos, mas não CONCEDE novos).",
    },
    aliasesLegado: {
      talent: ["ataque_adicional", "reacao"],
      item: ["ataque_adicional"],
      rune: ["ataque_adicional", "reacao"],
    },
  },
  modificar_instancia: {
    id: "modificar_instancia",
    label: "Modificar instância",
    camposEspecificos: [
      { nome: "operacao", tipo: "string", obrigatorio: true, descricao: "alterar_carga_atual | alterar_municao_carregada | recarregar | alterar_mit_atual | alterar_pd_atual | reparar_mit | reparar_pd." },
      { nome: "valor", tipo: "number", obrigatorio: false, descricao: "Delta ou valor a somar, conforme a operação." },
    ],
    executor: {
      modo: "assistido",
      modulo: "src/lib/character/inventory.ts (setItemCargaAtual, setItemMunicaoAtual, setItemMitAtual, setItemPdAtual)",
      observacao:
        "Cada operação mapeia 1:1 a um executor real e genérico já existente (MIT/PD) ou adicionado nesta etapa espelhando o mesmo padrão (carga/munição) — nunca um caminho JSON arbitrário. Sempre assistido: a seleção da instância-alvo e a confirmação continuam manuais.",
    },
    // "modificar_instancia" também é o `tipo` legado real produzido para
    // TALENTO (TIPO_LEGADO.talent) — sem isso, reeditar duplicava a
    // entrada a cada republicação (achado real desta rodada).
    aliasesLegado: {
      rune: ["autorreparo"],
      talent: ["modificar_instancia"],
    },
  },
  conceder_item: {
    id: "conceder_item",
    label: "Conceder item ou criar instância",
    camposEspecificos: [
      { nome: "itemSlug", tipo: "referencia", obrigatorio: true, descricao: "Item publicado na Biblioteca." },
      { nome: "quantidade", tipo: "number", obrigatorio: true, descricao: "Quantidade de instâncias a criar." },
      { nome: "destino", tipo: "string", obrigatorio: true, descricao: "personagem | aliado_selecionado | bando." },
    ],
    executor: {
      // Auditoria: nenhum schema tem um `tipo` legado para "conceder item";
      // construir o fluxo completo (resolver destino/bando/aliado em
      // runtime) é fora do escopo desta etapa ("foco é o catálogo de
      // efeitos e defaults administráveis", não um editor geral de
      // inventário). Sempre lembrete.
      modo: "lembrete",
      observacao: "Sem executor conectado nesta etapa — representável e preservável, sempre lembrete para o narrador aplicar manualmente.",
    },
    // "conceder_item" é o próprio `tipo` legado que este efeito serializa
    // para talento (TIPO_LEGADO.talent em effectLegacySerialization.ts) —
    // precisa constar aqui para que a reedição substitua a entrada
    // anterior em vez de duplicá-la (achado: republicar acumulava cópias).
    aliasesLegado: { talent: ["conceder_item"] },
  },
  consumir_item: {
    id: "consumir_item",
    label: "Consumir ou remover item",
    camposEspecificos: [
      { nome: "quantidade", tipo: "number", obrigatorio: true, descricao: "Quantidade a consumir/remover." },
      { nome: "comportamentoPilha", tipo: "string", obrigatorio: true, descricao: "reduzir_quantidade | remover_instancia." },
    ],
    executor: {
      modo: "lembrete",
      observacao: "Mesmo status de conceder_item — sem executor conectado nesta etapa, sempre lembrete.",
    },
    aliasesLegado: { talent: ["consumir_item"] },
  },
  alterar_preco: {
    id: "alterar_preco",
    label: "Alterar preço ou conceder desconto",
    camposEspecificos: [
      { nome: "operacao", tipo: "string", obrigatorio: true, descricao: "desconto_percentual | desconto_fixo | multiplicador | sobretaxa | preco_minimo | permitir_compra_fiada." },
      { nome: "percentual", tipo: "number", obrigatorio: false, descricao: "Só para desconto_percentual." },
    ],
    executor: {
      modo: "assistido",
      modulo: "src/lib/character/talentEngine.ts (getGarimpoDeRuaAvailability, getCadernetaDeDividaAvailability)",
      observacao:
        "Para talento, \"desconto_percentual\" e \"permitir_compra_fiada\" serializam exatamente no formato real já lido por essas funções (tipo \"desconto_loja\"/\"compra_fiada\", família \"economia_loja\") — genuinamente genéricas (leem QUALQUER efeito com esse tipo, não hardcoded por talento). As demais operações não têm leitor real — ficam bloqueadas na publicação (nunca fingidas).",
    },
    aliasesLegado: {
      talent: ["desconto_loja", "compra_fiada"],
    },
  },
  alterar_disponibilidade: {
    id: "alterar_disponibilidade",
    label: "Alterar disponibilidade ou estoque",
    camposEspecificos: [
      { nome: "operacao", tipo: "string", obrigatorio: true, descricao: "marcar_disponivel | marcar_indisponivel | definir_estoque." },
      { nome: "quantidade", tipo: "number", obrigatorio: false, descricao: "Só para definir_estoque." },
    ],
    executor: {
      // Auditoria: nenhum estado de estoque de campanha existe hoje — o
      // catálogo é tratado como infinitamente disponível. Nunca automático.
      modo: "lembrete",
      observacao: "Nenhum estado real de estoque/disponibilidade de campanha existe hoje — sempre lembrete, nunca um sistema de estoque fingido.",
    },
    aliasesLegado: { talent: ["alterar_disponibilidade"] },
  },
  companheiro: {
    id: "companheiro",
    label: "Companheiro (conceder/registrar)",
    camposEspecificos: [
      { nome: "tipo", tipo: "string", obrigatorio: true, descricao: "drone | robo | companheiro_tecnico | outro." },
      { nome: "modeloReferencia", tipo: "string", obrigatorio: false, descricao: "Texto livre — sem catálogo de modelos de drone/robô na Biblioteca hoje." },
      { nome: "destino", tipo: "string", obrigatorio: true, descricao: "personagem | aliado_selecionado | bando." },
    ],
    executor: {
      // Auditoria (talentEngine.ts): registerDrone/registerRobo são
      // invocados por clique manual na ficha, nunca por um efeito de
      // conteúdo lido genericamente — não há executor real conectado.
      modo: "lembrete",
      observacao: "Nenhum executor real cria instância de companheiro a partir de um efeito de conteúdo — sempre lembrete. Droneiro/Mecatrônico/Tecelão continuam bespoke em talentEngine.ts (registerDrone/registerRobo), não generalizados.",
    },
    // "conceder_companheiro" é o `tipo` legado real que este efeito
    // serializa para talento (TIPO_LEGADO.talent) — precisa constar aqui,
    // senão reeditar/republicar duplica a entrada a cada ciclo (achado
    // real, ver docs/CHECKPOINT_ETAPA10_COMPANHEIROS_TRAMA.md).
    aliasesLegado: { talent: ["conceder_companheiro"] },
  },
  modificar_companheiro: {
    id: "modificar_companheiro",
    label: "Modificar companheiro",
    camposEspecificos: [
      { nome: "operacao", tipo: "string", obrigatorio: true, descricao: "conceder_pa | reduzir_pa | definir_pa | reparar | causar_dano | aplicar_estado | equipar | parear | desligar | etc. (enumeradas, nunca caminho JSON arbitrário)." },
    ],
    executor: {
      modo: "lembrete",
      observacao: "Nenhum executor genérico existe — as funções reais equivalentes (applySinalLimpoBonus, activateOverclock, ajustarRamTrama etc.) são hiper-específicas por talento, não reutilizáveis por um efeito genérico.",
    },
    // "modificar_companheiro" é o próprio `tipo` legado real (TIPO_LEGADO.talent)
    // — "companheiro_pa_bonus" é um alias GENUINAMENTE legado diferente
    // (pré-existente, real), preservado à parte.
    aliasesLegado: {
      talent: ["companheiro_pa_bonus", "modificar_companheiro"],
    },
  },
  acao_companheiro: {
    id: "acao_companheiro",
    label: "Ação de companheiro",
    camposEspecificos: [
      { nome: "acaoReferencia", tipo: "string", obrigatorio: false, descricao: "Ação do modelo (texto livre — sem catálogo estruturado)." },
      { nome: "efeitosConsequencia", tipo: "array", obrigatorio: false, descricao: "Reaproveita o catálogo universal (EfeitoFilho) como consequência — nunca duplicado." },
    ],
    executor: {
      modo: "lembrete",
      observacao: "Nenhum executor real resolve ação de companheiro a partir de conteúdo — sempre lembrete. Distância/linha de visão nunca automatizadas (teatro da mente).",
    },
    aliasesLegado: { talent: ["acao_companheiro"] },
  },
  programar_gatilho: {
    id: "programar_gatilho",
    label: "Programação de gatilho",
    camposEspecificos: [
      { nome: "companheiroAlvo", tipo: "string", obrigatorio: false, descricao: "Texto livre." },
      { nome: "acaoReferencia", tipo: "string", obrigatorio: false, descricao: "Ação disparada." },
    ],
    executor: {
      // Auditoria: Droneiro/Script já tem um gatilho real (Character.drones[].gatilho:
      // {descricao, acaoAssociada, ocorrido}, texto livre) — mas é lido/escrito só pela
      // UI da ficha, não por um efeito de conteúdo genérico.
      modo: "lembrete",
      observacao: "Reaproveita o campo comum `gatilho` (mesmo vocabulário de GATILHOS_INICIAIS) em vez de inventar um segundo conceito — mas sem executor genérico conectado. Sempre lembrete.",
    },
    aliasesLegado: { talent: ["programar_gatilho"] },
  },
  parear: {
    id: "parear",
    label: "Pareamento",
    camposEspecificos: [
      { nome: "compartilhamentos", tipo: "array", obrigatorio: false, descricao: "comando | percepcao | acao | estado | pa | sinal | acao_coordenada." },
    ],
    executor: {
      // Auditoria: pairDronesEnxame já existe (Droneiro Enxame), mas
      // hiper-específico (só drones do MESMO modelo string, máx. 3,
      // hardcoded pelo payload daquele talento) — não generalizável.
      modo: "lembrete",
      observacao: "Nenhum executor genérico de pareamento existe — pairDronesEnxame (talentEngine.ts) é bespoke ao talento Enxame, não reutilizável por conteúdo genérico.",
    },
    aliasesLegado: { talent: ["parear"] },
  },
  acao_trama: {
    id: "acao_trama",
    label: "Ação de Trama",
    camposEspecificos: [
      { nome: "acao", tipo: "string", obrigatorio: true, descricao: "avancar | revelar_no | revelar_bloqueio | criar_presenca | modificar_assinatura | reduzir/aumentar_deteccao | reduzir/aumentar_rastro | isolar | atravessar | expulsar_presenca | assumir_controle." },
      { nome: "custoRam", tipo: "number", obrigatorio: false, descricao: "RAM reaproveita alterar_recurso (recurso 'ram', já no enum) — nunca um segundo sistema de recurso." },
    ],
    executor: {
      // Auditoria: iniciarTrama/ajustarRamTrama/ajustarDeteccaoTrama/
      // executarBypass/executarAgulhaFina são reais, mas bespoke ao
      // Tecelão (Character.trama_ativa é um objeto único, não um
      // catálogo/efeito genérico). Nó/Bloqueio/Presença são
      // string[] livres, sem catálogo estruturado.
      modo: "lembrete",
      observacao: "Nenhum executor genérico resolve ação de Trama a partir de conteúdo — sempre lembrete. Nó/Bloqueio/Presença permanecem texto livre (sem catálogo estruturado no runtime real).",
    },
    // "acao_trama" é o próprio `tipo` legado real (TIPO_LEGADO.talent) —
    // os outros 3 são aliases GENUINAMENTE legados (Bypass/Agulha Fina do
    // Tecelão, pré-existentes), preservados à parte.
    aliasesLegado: {
      talent: ["comando_sem_teste", "comando_livre_sem_custo", "alterar_protocolo", "acao_trama"],
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
