/**
 * Tipos da ficha mínima de personagem.
 *
 * Os tipos de "regras" abaixo (AttributeDefinition, SkillDefinition,
 * DerivedDefinition, CharacterRulesPayload) descrevem apenas o
 * subconjunto do payload de `character_rule` (regras_personagem) que a
 * ficha mínima realmente lê — não é uma tipagem exaustiva do schema.
 */

// ---------------------------------------------------------------------
// Personagem (estado local, ainda não persistido)
// ---------------------------------------------------------------------

export interface CharacterAttributes {
  corpo: number;
  mente: number;
  animo: number;
}

/** slug da perícia -> valor investido. */
export type CharacterSkills = Record<string, number>;

/**
 * Recursos atuais (não confundir com os _max, que são derivados
 * calculados pelas regras). Todos opcionais — uma ficha recém-criada
 * pode não ter acesso aos derivados ainda (regras não carregadas).
 */
export interface CharacterResources {
  pv?: number;
  pe?: number;
  mana?: number;
  integridade?: number;
  /**
   * PV temporário (checkpoint v0.36, PRD 10.2) — camada consumida
   * antes do PV normal, some no descanso longo. Representado como um
   * único número (total acumulado), não como lista de fontes — nada
   * no código atual ainda cria PV temporário por fonte separada
   * (isso é escopo de combate/magia/item, fora deste checkpoint); a
   * estrutura mais simples compatível com "zerar no descanso longo" é
   * só o total. Se um checkpoint futuro precisar rastrear fontes
   * individuais (para a regra "fontes iguais não empilham, diferentes
   * somam"), este campo pode evoluir para array sem quebrar leitura
   * antiga (normalizeCharacter trata ausência como 0).
   */
  pv_temporario?: number;
  /** Mana temporária (checkpoint v0.36, PRD 10.3) — mesmo formato/justificativa de `pv_temporario`. */
  mana_temporaria?: number;
}

/**
 * Metadados mínimos de versionamento do payload salvo. schema_version
 * existe para permitir migrações leves no futuro (ver
 * normalizeCharacter) sem quebrar personagens já salvos com um
 * payload mais antigo/incompleto. Nunca é usado no cálculo de
 * derivados — é só rastreabilidade.
 */
export interface CharacterMetadata {
  schema_version: number;
  criado_em?: string;
  atualizado_em?: string;
  /** Outros metadados livres (ex.: notas, origem) — não interpretados pela ficha mínima. */
  [key: string]: unknown;
}

/**
 * Estado operacional de turno/sessão — não é progressão nem ficha
 * permanente. Controla quanto de PA/Reações já foi gasto/usado na
 * rodada atual. Editável em Modo Jogo e Modo Evolução (não é travado
 * pelo seletor de modo, ao contrário de atributos/perícias).
 */
export interface CharacterGameState {
  pa_gastos?: number;
  reacoes_usadas?: number;
  /** Defesas realizadas sem Reação na rodada atual (checkpoint v0.43). */
  defesas_sem_reacao?: number;
  /** Outros campos operacionais futuros — não interpretados pela ficha mínima. */
  [key: string]: unknown;
}

export type TechnicalItemSourceType = "rune" | "property" | "manual";

/**
 * Propriedade textual/rastreável de uma instância de item. Ela descreve
 * capacidade ou observação técnica; não é um ActiveEffect e não altera
 * rolagens, dano, defesa ou recursos por conta própria.
 */
export interface TechnicalItemPropertyInstance {
  id: string;
  sourceType: TechnicalItemSourceType;
  sourceContentId: string;
  /** Identificador da instalação concreta quando a fonte também é uma instância (ex.: runa instalada). */
  sourceInstanceId?: string;
  sourceLabel?: string;
  key: string;
  label: string;
  value?: string | number | boolean | null;
  description?: string;
  mechanicalEffectAutomated?: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Campos futuros/desconhecidos sobrevivem ao normalize/save. */
  [key: string]: unknown;
}

/**
 * Estado mutável e puramente informativo de uma instância de item.
 * `active` pode ser alternado manualmente; qualquer custo exibido é
 * apenas metadado e nunca é consumido por este modelo.
 */
export interface TechnicalItemState {
  id: string;
  sourceType: TechnicalItemSourceType;
  sourceContentId: string;
  sourceInstanceId?: string;
  sourceLabel?: string;
  key: string;
  label: string;
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  activationHint?: string;
  actionPointCost?: number;
  createdAt?: string;
  updatedAt?: string;
  /** Campos futuros/desconhecidos sobrevivem ao normalize/save. */
  [key: string]: unknown;
}

/**
 * Condição ativa (ou já removida, se `ativa: false`) registrada no
 * personagem — checkpoint v0.32. Ainda sem automação de modificadores:
 * é só registro manual, visível na ficha e logado na mesa. `conditionId`
 * aponta para o slug de `content_documents` (content_type="condition",
 * ver db_condicoes_normalizado) quando a condição foi escolhida da
 * Biblioteca; fica `null`/ausente para condições totalmente manuais
 * (nome livre, sem vínculo com a Biblioteca).
 */
export interface ActiveCondition {
  /** uuid gerado no cliente (crypto.randomUUID()) — não é id de content_documents. */
  id: string;
  /** slug de content_documents (content_type="condition"), se veio da Biblioteca. */
  conditionId?: string | null;
  nome: string;
  descricao?: string;
  origem?: string;
  /** Texto livre — "3 rodadas", "até recuperar 1 PV", "cena inteira", etc. Não é contador automático. */
  duracao?: string;
  /** ISO timestamp de quando foi aplicada. */
  aplicadaEm: string;
  /** ISO timestamp de quando foi removida — null enquanto ativa. */
  removidaEm?: string | null;
  ativa: boolean;
  observacoes?: string;
  /**
   * Como a remoção aconteceu (checkpoint v0.34) — ausente/undefined
   * para remoção manual (botão "Remover", v0.32). `"cura_pv"` marca
   * remoção automática por ter recuperado 1+ PV (PRD 9.3), permitindo
   * ao "Desfazer" reativar só as condições removidas pela cura mais
   * recente, sem tocar em remoções manuais anteriores. `"acao_combate"`
   * (checkpoint v0.42) marca remoção por efeito simples automatizado do
   * Console de Ação (ex.: Levantar removendo Caído). `"item_use"`
   * (checkpoint pós-v0.61) marca remoção por item de farmácia com
   * `remover_condicao` estruturado no payload (ver itemUse.ts).
   */
  removidaOrigem?: "cura_pv" | "acao_combate" | "end_round_condition_check" | "item_use";
  /**
   * Autoria estruturada (checkpoint talentos, Fase 6) — além do `origem`
   * livre em texto, campos programáticos para talentos que precisam
   * identificar "efeitos aplicados por VOCÊ" entre vários ativos no
   * mesmo alvo (ex.: Praga › Sangria Lenta estende a duração só dos
   * efeitos negativos QUE VOCÊ aplicou; Contágio propaga o efeito que
   * você acabou de aplicar). Todos opcionais — ausência não quebra nada
   * já existente, condições antigas/manuais simplesmente não têm autoria
   * estruturada (só o `origem` textual).
   */
  sourceCharacterId?: string | null;
  /** slug do nível de talento que aplicou (ex.: "praga_marca_da_dor"). */
  sourceTalentId?: string | null;
  sourceType?: "talent" | "item" | "spell" | "condition" | "manual";
  /** Alvo ORIGINAL antes de qualquer propagação/redirecionamento (ex.: Contágio propagando a partir do alvo original) — igual a `null` quando não houve propagação. */
  originalTargetId?: string | null;
  /** Agrupa condições nascidas do MESMO evento de aplicação (ex.: Contágio aplica a mesma condição em vários alvos de uma vez — todos compartilham este id). */
  applicationEventId?: string | null;
}

/**
 * Pendência de teste de resistência de fim de rodada/exposição
 * (checkpoint v0.44) — criada por `resolveEndRoundConditionsForCharacter`
 * (endRoundConditions.ts) quando o payload de uma condição ativa exige
 * `teste_fim_de_rodada`, `teste_fim_de_rodada_para_remover_condicao` ou
 * `teste_apos_exposicao`. Nunca rolada automaticamente — fica pendente
 * até o jogador/narrador marcar "Sucesso" ou "Falha" manualmente (ver
 * `resolveConditionResistanceCheck`).
 */
export interface ConditionResistanceCheck {
  id: string;
  /** slug canônico da condição de origem (ex.: "envenenado"). */
  conditionId: string;
  conditionName: string;
  effectType: "teste_fim_de_rodada" | "teste_fim_de_rodada_para_remover_condicao" | "teste_apos_exposicao";
  round: number;
  scene: number;
  createdAt: string;
  status: "pending" | "success" | "failure";
  resolvedAt?: string;
  resistance: { pericia: string; cd: number };
  /** payload bruto `falha` da condição — interpretado só na resolução manual. */
  onFailure?: unknown;
  /** payload bruto `sucesso`, se a condição declarar algo (nenhuma condição atual usa isso). */
  onSuccess?: unknown;
  /** só presente em `teste_fim_de_rodada_para_remover_condicao` — slug da condição a remover em sucesso. */
  targetConditionId?: string;
  source: "end_round_condition";
}

/**
 * Registro de cadência de um efeito de fim de rodada/exposição já
 * processado (checkpoint v0.44) — chave única em
 * `Character.condition_effect_history`, usado só para idempotência
 * (não aplicar o mesmo dano/pendência duas vezes na mesma rodada) e
 * para a regra "uma vez por cena" de `teste_apos_exposicao`
 * (Saturado/Insaturado). Nunca apagado — histórico simples.
 */
export interface ConditionEffectHistoryEntry {
  conditionId: string;
  effectType: string;
  scene?: number;
  round?: number;
  createdAt: string;
  resolvedAt?: string;
}

/**
 * Um modificador estruturado de um efeito temporário (checkpoint
 * pós-v0.71). Modelo canônico mínimo — nunca inventado a partir de
 * texto: só é preenchido quando o payload da fonte declara o alvo/
 * operação/valor de forma estruturada. `target: "roll"` com
 * `appliesTo` (tags de rolagem, ex.: "resistir", "reflexos") é o ÚNICO
 * caso aplicado automaticamente hoje — vira `ActiveEffect` e soma nas
 * rolagens do RollsTab. Os demais (`damage`/`defense`/`resource`/`dc`)
 * são exibidos e viram lembrete, sem aplicação automática (nenhum ponto
 * de integração canônico existe para eles ainda — `computeDerivedStats`
 * não lê efeitos temporários; dano/defesa são resolvidos manualmente em
 * /dev/table). `manual` é sempre só lembrete.
 */
export interface TemporaryEffectModifier {
  target: "roll" | "skill" | "attribute" | "damage" | "defense" | "resource" | "dc" | "manual";
  /** Chave específica do alvo quando aplicável (ex.: recurso "pa", atributo "corpo"). */
  targetKey?: string;
  operation: "add" | "subtract" | "set" | "advantage" | "reroll" | "manual";
  value?: number;
  dice?: string;
  label?: string;
  /** Tags de rolagem afetadas (perícia/atributo/ação) — só usadas quando target é "roll"/"skill"/"attribute". */
  appliesTo?: string[];
  reminder?: string;
}

/**
 * Efeito temporário/buff canônico no personagem (checkpoint pós-v0.71,
 * PRD 9.4 "efeitos de item/talento ativos"). Resolve a pendência
 * documentada de "buff temporário com duração rastreada". Campo novo
 * e OPCIONAL (`Character.efeitos_temporarios`) — personagem antigo sem
 * ele carrega como lista vazia (normalizeCharacter), sem migration
 * (o personagem já é payload JSON). Preserva a FONTE do efeito e nunca
 * apaga o histórico: expirar/remover marca `active: false` (mesmo
 * padrão de `ActiveCondition`). Só é criado automaticamente quando o
 * payload estruturado permite (`canApplyTemporaryEffect`); efeito
 * textual vira lembrete, nunca automação falsa.
 */
export interface TemporaryEffect {
  /** uuid gerado no cliente. */
  id: string;
  sourceType: "talent" | "item" | "spell" | "surge" | "manual";
  /** slug/id da fonte na Biblioteca, quando houver. */
  sourceId?: string;
  sourceName: string;
  name: string;
  description?: string;
  /** "rounds" decrementa a cada fim de rodada; "scene" expira no fim de cena; "rest" expira no descanso longo; "manual" só sai por remoção manual. */
  durationType: "rounds" | "scene" | "rest" | "manual";
  /** Rodadas restantes — só presente quando durationType="rounds". Expira ao chegar a 0. */
  remainingRounds?: number;
  createdRound?: number;
  createdScene?: number;
  /** Como lidar com um efeito duplicado da mesma fonte — "replace"/"ignore" evitam duplicata; "stack" soma pilhas; "manual" registra lembrete quando a regra de stack não é estruturada. */
  stackingMode?: "replace" | "stack" | "ignore" | "manual";
  stacks?: number;
  maxStacks?: number;
  modifiers?: TemporaryEffectModifier[];
  reminders?: string[];
  active: boolean;
  createdAt: string;
  /** ISO de quando expirou/foi removido — null enquanto ativo. */
  endedAt?: string | null;
  /** Como saiu — "manual" (botão Remover), "rounds" (chegou a 0), "scene"/"rest" (fim de cena/descanso). */
  endedReason?: "manual" | "rounds" | "scene" | "rest";
}

export interface Character {
  nome: string;
  atributos: CharacterAttributes;
  pericias: CharacterSkills;
  /** Recursos atuais, se já existirem — opcional na ficha mínima. */
  recursos_atuais?: CharacterResources;
  /** Metadados simples e livres, incluindo schema_version. */
  metadados?: CharacterMetadata;
  /** PA gastos / reações usadas no turno atual, se já existirem. */
  estado_jogo?: CharacterGameState;
  /**
   * Condições ativas e histórico de remoções (checkpoint v0.32).
   * Inclui entradas com `ativa: false` para manter histórico simples —
   * nunca apagadas do array, só marcadas como removidas.
   */
  condicoes_ativas?: ActiveCondition[];
  /**
   * Surtos de Sobrecarga usados no dia (checkpoint v0.36, PRD 10.5) —
   * campo mínimo só para o descanso longo poder resetar algo real.
   * NÃO é o sistema de Sobrecarga completo (sem cargas visuais, sem
   * seletor de tipo de surto, sem dano psíquico, sem teste de Vontade
   * no terceiro surto) — isso é trabalho futuro. Ausente/undefined =
   * 0 (nenhum surto usado ainda).
   */
  sobrecarga_usada_dia?: number;
  /**
   * Ruptura pendente (checkpoint v0.37, PRD 10.6) — marcada quando o
   * personagem atinge o 3º surto de Sobrecarga no dia. Resolvida
   * separadamente no fim da cena (Marca/Traço — fora de escopo ainda).
   * Descanso NUNCA limpa isso — só a resolução de Ruptura (futura).
   */
  ruptura_pendente?: boolean;
  /** Placeholder documentado — sem modelo real de "nível de Ruptura" ainda; sempre 1 quando ruptura_pendente vira true. */
  ruptura_nivel_pendente?: number;
  /** Último surto de Sobrecarga usado — só para exibição/histórico simples, não é log persistente. */
  ultimo_surto?: {
    tipo: string;
    indice: number;
    danoPsiquico: number;
    criadoEm: string;
  };
  /**
   * Colapso (checkpoint v0.38, PRD 10.7; teste/avanço/desfecho
   * automáticos de fim de rodada no v0.51) — dispara quando PV ou PE
   * chega a 0. Ausente = personagem nunca colapsou.
   */
  colapso?: {
    ativo: boolean;
    tipo: "pv" | "pe" | null;
    /** 0..3 — no 3º, teste imediato: 8+ mantém, senão morte (PV) ou coma (PE). */
    segmentos: number;
    /** Estabilizar interrompe o avanço de segmento, mas NÃO cura nem remove Inconsciente. */
    estabilizado: boolean;
    iniciadoEm?: string;
    /** null enquanto ativo. */
    encerradoEm?: string | null;
    /** true após sobreviver a um colapso (cura) — campo de cicatriz pendente de preenchimento manual (fora de escopo ainda). */
    cicatrizPendente?: boolean;
    /**
     * Desfecho terminal do 3º segmento (checkpoint v0.51) — `"morte"`
     * (colapso de PV/físico) ou `"coma"` (colapso de PE/mental).
     * Ausente/null enquanto o personagem não atingiu o desfecho. A
     * resolução narrativa final (remover da mesa, ficha de coma) fica a
     * cargo do narrador — este campo só REGISTRA o desfecho mecânico.
     */
    desfecho?: "morte" | "coma" | null;
    ultimoEvento?: string;
  };
  /**
   * PM (Pontos de Maestria/evolução, checkpoint v0.40, PRD 3.3/4.3) —
   * total recebido ao longo da campanha e o que ainda não foi gasto.
   * `pm_disponivel` nunca é negativo (gasto além do disponível é
   * clampado a 0, com warning — ver `spendPm`).
   */
  pm_total?: number;
  pm_disponivel?: number;
  /**
   * Histórico de evolução (checkpoint v0.40, PRD 4.3) — append-only,
   * nunca reescrito/apagado. Cobre ganho/gasto de PM e ajustes
   * permanentes de atributo/perícia feitos em Modo Evolução.
   */
  historico_evolucao?: EvolutionHistoryEntry[];
  /**
   * Pendências de teste de resistência de fim de rodada/exposição
   * (checkpoint v0.44) ainda não resolvidas — resolvidas são removidas
   * deste array (o histórico de resolução vive em `table_logs`, não
   * aqui). Ausente/undefined = nenhuma pendência.
   */
  pending_condition_checks?: ConditionResistanceCheck[];
  /**
   * Histórico de efeitos de fim de rodada/exposição já processados
   * (checkpoint v0.44), por chave única (ver `getEndRoundEffectKey`) —
   * garante idempotência (não aplicar o mesmo dano duas vezes na mesma
   * rodada) e a cadência "uma vez por cena" de `teste_apos_exposicao`.
   * Nunca apagado.
   */
  condition_effect_history?: Record<string, ConditionEffectHistoryEntry>;
  /**
   * Rodada local do personagem (checkpoint v0.44) — incrementada pelo
   * botão "Encerrar Rodada" da própria ficha. Não é a rodada da mesa
   * (`campaigns.current_round`, v0.39): a arquitetura atual não liga os
   * dois automaticamente (ver pendência do relatório). Serve só para
   * dar um número de rodada estável aos efeitos de condição e à
   * idempotência. Ausente/undefined = 1 (primeira rodada).
   */
  current_round?: number;
  /**
   * Cena local do personagem (checkpoint v0.44) — usada só para a
   * cadência "uma vez por cena" de `teste_apos_exposicao`. Não avança
   * automaticamente neste checkpoint (sem gatilho de "encerrar cena"
   * ligado à ficha ainda) — fica sempre 1, documentado como pendência.
   * Ausente/undefined = 1.
   */
  current_scene?: number;
  /**
   * Bônus acumulado de Mana máxima por Ruptura resolvida (checkpoint
   * v0.45, PRD 10.6: "Aumenta Mana em Ânimo + 2"). Somado ao `mana_max`
   * derivado (ver `computeDerivedStats`) — nunca um número solto
   * substituindo o cálculo, e nunca altera o atributo Ânimo. Ausente =
   * 0 (nenhuma Ruptura resolvida ainda).
   */
  mana_bonus_ruptura?: number;
  /**
   * Pendências de Marca/Traço narrativos criados ao resolver uma
   * Ruptura (checkpoint v0.45, PRD 10.6) — texto livre, nunca
   * obrigatório nem validado contra uma lista oficial (que ainda não
   * existe como conteúdo da Biblioteca). Resolvidas ficam no array com
   * `status: "resolved"` (histórico simples, nunca apagadas).
   */
  pending_rupture_choices?: PendingRuptureChoice[];
  /**
   * Marca que a Integridade chegou a 0 por causa de uma Ruptura
   * (checkpoint v0.45, PRD 10.6: "Se a perda final veio de Ruptura,
   * libera Última Vontade"). Nunca apaga o personagem, nunca bloqueia a
   * UI, nunca aplica narrativa automática — só um sinalizador para a
   * ficha/mesa mostrarem o aviso. Uma vez true, só volta a false por
   * ação manual futura (fora de escopo deste checkpoint).
   */
  ultima_vontade_pendente?: boolean;
  /**
   * Histórico append-only de Rupturas resolvidas (checkpoint v0.45) —
   * nunca reescrito/apagado, só para auditoria/exibição simples.
   */
  historico_ruptura?: RuptureResolvedEntry[];
  /**
   * Ruptura especial concedida por Mago de Batalha › Ascensão ao adquirir
   * o nível pela primeira vez (checkpoint talentos). Esta Ruptura NÃO
   * reduz Integridade e NÃO entra em cálculos futuros de Integridade — é
   * puramente narrativa/marcadora. Presença = já aplicada (idempotente:
   * nunca reaplicar ao carregar/remover/readquirir estado legado).
   */
  ruptura_especial_ascensao?: {
    id: string;
    nivelId: string;
    aplicadaEm: string;
    nota: string;
  };
  /**
   * Artífice › Bricolagem (checkpoint talentos) — vulnerabilidade
   * identificada em um mecanismo/estrutura/sistema, com bônus consumível
   * de +1 no PRÓXIMO teste relacionado. `consumida: true` preserva
   * histórico mínimo (nunca reaplica); uma nova vulnerabilidade
   * substitui a anterior (sempre a última registrada conta).
   */
  bricolagem_vulnerabilidade?: {
    id: string;
    nivelId: string;
    tipo: "mecanismo" | "estrutura" | "sistema_simples";
    alvoDescricao: string;
    falhaPrincipal: string;
    periciaBeneficiada: "engenharia" | "robotica";
    criadaEm: string;
    consumida: boolean;
    consumidaEm?: string;
  };
  /**
   * Artífice › Gambiarra Expressa (checkpoint talentos) — atividade
   * narrativa 1/sessão (5 minutos, sem teste estendido). Estado ativo
   * até o narrador confirmar encerramento; `talentos_estado.usos` guarda
   * a cadência "sessao" (reset manual, sem gatilho canônico de sessão).
   */
  gambiarra_expressa_ativa?: {
    id: string;
    nivelId: string;
    alvo: "estrutura" | "equipamento" | "automato";
    materialBase: string;
    criacaoOuModificacao: "criacao" | "modificacao";
    efeitoObtido: string;
    duracao: string;
    observacoes?: string;
    criadaEm: string;
  };
  /**
   * Atirador de Elite › 1 Tiro, 1 Acerto — estado canônico de Mirar
   * (checkpoint talentos). Criado quando o jogador CONFIRMA o resultado
   * do teste de Mirar (sucesso/crítico); expira no fim da rodada
   * (`criadaNaRodada` comparado à rodada atual — sem relógio de rodada
   * canônico, `expirada` também pode ser marcada manualmente).
   * `consumido: true` preserva o registro para a rolagem que o usou
   * (mesmo critério de `bricolagem_vulnerabilidade` — nunca remove
   * retroativamente o efeito da rolagem que acabou de consumi-lo).
   */
  mirar_ativo?: {
    id: string;
    nivelId: string;
    resultado: "sucesso" | "critico";
    bonus: number;
    criadaNaRodada: number | null;
    criadaEm: string;
    consumido: boolean;
  };
  /**
   * Rúnico › Entalhe Rápido — tentativa pendente de confirmação por
   * instância de item (checkpoint talentos, Fase 1 — revisão). Antes
   * vivia só em estado local do componente (`useState`), então um reload
   * no meio do fluxo (1 PA já gasto, teste ainda não confirmado) perdia o
   * registro sem devolver o PA nem permitir confirmar depois — persistido
   * aqui para sobreviver a salvar/recarregar como qualquer outro estado
   * de talento em andamento (mesmo critério de `mirar_ativo`).
   */
  entalhe_rapido_tentativas?: Record<string, { mode: "instalar" | "remover"; alvo: string; cd: number }>;
  /**
   * Totem › Benção (N1) — token concedido por um aliado com o talento
   * (checkpoint talentos, Fase 1). "O primeiro teste realizado" DESDE a
   * concessão consome o token (promove falha_limitada→sucesso_limitado
   * se for o caso) — vive no personagem que RECEBE, não em quem concede,
   * já que é o próximo teste do recebedor que importa.
   */
  bencao_token_ativo?: { origem: string; concedidoEm: string };
  /**
   * Sorrateiro › estado real de Furtividade (checkpoint talentos, Fase 3)
   * — entrada/saída manual (narrativa, sem teste estruturado próprio para
   * "entrar"; testes de Furtividade em si usam a perícia normalmente,
   * ver `getMarginPromotions` para Passo Fantasma). Camuflagem Óptica
   * (N2) usa `plausibleCoverConfirmed` para permitir manter o estado após
   * um movimento exposto; Ataque Fatal (N3) consome/encerra ao declarar
   * o ataque de saída.
   */
  furtividade_ativa?: {
    active: boolean;
    source: string;
    enteredAt: string;
    plausibleCoverConfirmed: boolean;
    detected: boolean;
    exitReason: string | null;
  };
  /**
   * Talentos adquiridos (checkpoint v0.48, PRD 12) — um item por NÍVEL
   * adquirido (não uma pilha de "nível máximo"). Data-driven a partir
   * de `content_documents` (content_type="talent") — nunca lista
   * talentos manualmente. Ausente = nenhum talento adquirido ainda.
   */
  talentos_adquiridos?: {
    id: string;
    talentoId: string;
    nivelId: string;
    nivel: number;
    adquiridoEm: string;
  }[];
  /**
   * Estado operacional de talentos (checkpoint pós-v0.63, "segunda
   * camada") — contadores de uso por cadência e toggles ligados.
   * Chave = `${nivelId}:${efeitoIndex}`. `usos[key].cadencia` é copiada
   * do payload no momento do uso para o reset não depender do catálogo.
   * NUNCA guarda regra — só contadores/flags de instância.
   */
  talentos_estado?: {
    usos?: Record<string, { usados: number; cadencia: string | null; atualizadoEm: string }>;
    toggles?: Record<string, boolean>;
    /**
     * Reservas de recurso próprio de talento (checkpoint canônico —
     * engine de operação). Chave = `${nivelId}:${efeitoIndex}` do efeito
     * que define o recurso (ex.: dados de gatilho do Pistoleiro). Só
     * contadores de instância — nunca regra. `disponivel` é derivado do
     * `max` do payload quando ausente.
     */
    recursos?: Record<string, { disponivel: number; max: number; cadenciaRecuperacao: string | null; atualizadoEm: string }>;
    /**
     * Oportunidades contextuais pendentes que precisam SOBREVIVER a
     * reload (checkpoint canônico — engine de operação). Oportunidades
     * efêmeras derivadas do estado atual NÃO entram aqui (são
     * recalculadas). Só o que o narrador precisa resolver depois. Nunca
     * guarda regra — só o ponteiro para o talento + rótulo + contexto.
     */
    oportunidades?: {
      id: string;
      talentoNome: string;
      nivelId: string;
      efeitoIndex: number;
      rotulo: string;
      contexto?: string;
      criadaEm: string;
    }[];
  };
  /**
   * Carteira (checkpoint v0.49, PRD 13.1) — três saldos separados,
   * nunca uma soma única. Ausente = 0 em todos.
   */
  carteira?: {
    aretz_informal: number;
    cdi: number;
    cdi_craqueada: number;
  };
  /**
   * Inventário (checkpoint v0.49, PRD 13) — instâncias ligadas a
   * modelos publicados da Biblioteca (content_type="item"), nunca uma
   * lista hardcoded. Ausente = nenhum item ainda.
   */
  inventario?: {
    id: string;
    itemSlug: string;
    itemNome: string;
    categoria: string;
    /** subtipo do modelo no momento da compra (ex.: "corpo_a_corpo") — checkpoint v0.56, usado só para checar compatibilidade de runa. */
    subtipo?: string;
    quantidade: number;
    estado: "equipado" | "empunhado" | "acesso_rapido" | "mochila";
    adquiridoEm: string;
    precoPago?: number;
    /**
     * Runas instaladas nesta instância de item (checkpoint v0.56) —
     * referência ao MODELO publicado (content_type="rune") por slug,
     * nunca uma cópia do payload. Ausente = nenhuma runa instalada
     * ainda. Sem efeito mecânico (isso é escopo futuro).
     */
    runasInstaladas?: {
      id: string;
      runeContentId: string;
      installedAt: string;
      notas?: string;
      /** Rúnico › Gatilho Rúnico — ativa/inativa sem PA. Ausente = ativa. */
      ativa?: boolean;
    }[];
    /**
     * Propriedades/estados técnicos pertencem à INSTÂNCIA. Ausência em
     * payload legado normaliza para arrays vazios; não geram ActiveEffect.
     */
    propriedadesTecnicas?: TechnicalItemPropertyInstance[];
    estadosTecnicos?: TechnicalItemState[];
    /**
     * Equipamento defensivo (checkpoint v0.58) — `true` quando esta
     * instância é a fonte ATIVA de MIT/PD do personagem. Só uma
     * instância por `equipamentoSlot` fica ativa por vez.
     */
    equipadoDefensivo?: boolean;
    equipamentoSlot?: "armadura" | "escudo";
    mitAtual?: number;
    pdAtual?: number;
    /** Munição atual no carregador/câmara (checkpoint v0.59) — armas de fogo e bestas. */
    municaoAtual?: number;
    /**
     * Presente só em instâncias de Aljava (checkpoint v0.60) — stacks
     * de flechas agrupadas por tipo. Um personagem pode ter várias
     * Aljavas; cada instância carrega seu próprio `aljava`.
     */
    aljava?: {
      capacidade: number;
      stacks: { contentSlug: string; nome: string; quantidade: number }[];
    };
    /** Em instâncias de ARCO (checkpoint v0.60): id da Aljava usada para atacar. */
    selectedAljavaInstanceId?: string;
    /** Em instâncias de ARCO (checkpoint v0.60): slug do tipo de flecha ativo. */
    selectedFlechaSlug?: string;
    /** Cargas restantes deste item físico (checkpoint pós-v0.58, uso de farmácia/granadas com `cargas_max`). Ausente = assume `item.cargasMax` na primeira leitura. */
    cargasAtual?: number;
    /**
     * Toque de Midas (Artífice N2) — efeito temporário nesta instância
     * real do inventário (ver `InventoryItemInstance.toqueDeMidas` em
     * inventory.ts para os helpers). Vive na instância, então acompanha
     * o item ao equipar/transferir/recarregar a página. `active: false`
     * preserva o histórico (nunca apaga) — todo cálculo real usa
     * `isItemTemporaryEffectActive` (active E dentro do prazo), nunca só
     * a presença do campo.
     */
    toqueDeMidas?: {
      id: string;
      sourceTalentId: string;
      sourceCharacterId: string | null;
      appliedAt: string;
      expiresAt: string;
      active: boolean;
      itemCategory: "arma" | "armadura" | "escudo" | "ferramenta_dispositivo";
      modifiers: { ataque?: number; dano?: number; mit?: number; testeRelacionado?: number };
      /** Só escudo: PD temporário total concedido (3) e já consumido — nunca soma ao PD-base. */
      temporaryPdGranted?: number;
      temporaryPdConsumed?: number;
      /** Só ferramenta/dispositivo: perícia/contexto escolhido para o +1. */
      relatedSkill?: string;
    };
    /**
     * Rúnico › Sobregravação (N3) — autorização de acesso aos espaços
     * extras desta instância (ver `InventoryItemInstance.sobregravacao`
     * em inventory.ts para os helpers). Vive na instância, então
     * acompanha transferência.
     */
    sobregravacao?: {
      ownerCharacterId: string;
      instructedAllyIds: string[];
      multiplicador: number;
      accessGrantedCharacterIds?: string[];
      appliedAt: string;
    };
  }[];
  /**
   * Magias aprendidas individualmente (checkpoint v0.50.1/v0.50.2) —
   * cada magia precisa ser aprendida separadamente para poder ser
   * conjurada (mesmo padrão de `talentos_adquiridos`, v0.48). A
   * vertente "conhecida" é DERIVADA daqui (`getKnownVertentes`, ver
   * `spells.ts`) — não existe campo/passo separado de "conhecer
   * vertente". Ausente = nenhuma magia aprendida ainda.
   */
  magias_aprendidas?: {
    id: string;
    spellSlug: string;
    aprendidaEm: string;
  }[];
  /**
   * Nível investido por vertente (checkpoint pós-v0.69) — chave é o
   * slug da vertente (ex.: "cinetica", "sinaptica"), valor é o nível
   * (0 = nenhum investimento ainda). Usado para calcular a CD de
   * resistência das magias da vertente (regra do VTT: CD = 6 + nível —
   * NUNCA 5 + nível) e para sinalizar magias além do nível investido.
   * Ausente/sem entrada para uma vertente = nível DESCONHECIDO (não
   * 0!) — preserva compatibilidade com personagens antigos que já
   * aprenderam magias antes deste campo existir (`getKnownVertentes`
   * continua sendo a fonte de "vertente conhecida"; este campo é só o
   * nível numérico, opcional e aditivo).
   */
  niveis_vertente?: Record<string, number>;
  /**
   * Escalpos instalados (checkpoint v0.54, PRD §0/2.1/4/8/11 —
   * instância passiva, sem efeito mecânico ainda) — referencia o
   * MODELO publicado na Biblioteca (`content_type="escalpo"`,
   * `listEscalpos()`) por slug, nunca uma cópia do payload. Ausente =
   * nenhum escalpo instalado ainda. Runas em item ficaram fora deste
   * checkpoint (Caso B — ver relatório): `InventoryItemInstance` ainda
   * não tem um conceito de "slot" validável para runa, e forçar isso
   * agora arriscaria inventar uma regra de compatibilidade.
   */
  escalpos_instalados?: {
    id: string;
    /** slug do content_documents (content_type="escalpo"). */
    contentId: string;
    nomeCustomizado?: string;
    notas?: string;
    instaladoEm: string;
  }[];
  /**
   * Efeitos temporários/buffs ativos e histórico (checkpoint pós-v0.71)
   * — modelo canônico com duração rastreada (ver `TemporaryEffect` e
   * `temporaryEffects.ts`). Inclui entradas com `active: false` para
   * manter histórico (mesmo padrão de `condicoes_ativas`). Ausente =
   * lista vazia (personagem antigo compatível, sem migration).
   */
  efeitos_temporarios?: TemporaryEffect[];
}

/**
 * Pendência de Marca/Traço narrativo de uma Ruptura resolvida
 * (checkpoint v0.45, PRD 10.6) — ver `src/lib/character/rupture.ts`.
 */
export interface PendingRuptureChoice {
  id: string;
  ruptureLevel: number;
  scene: number;
  createdAt: string;
  status: "pending" | "resolved";
  marca?: string;
  traco?: string;
  resolvedAt?: string;
}

/** Uma entrada do histórico de Ruptura resolvida (checkpoint v0.45). */
export interface RuptureResolvedEntry {
  id: string;
  scene: number;
  ruptureLevel: number;
  integridadeAntes: number;
  integridadeDepois: number;
  manaMaxBonusAntes: number;
  manaMaxBonusDepois: number;
  manaBonusAplicado: number;
  pendingChoiceId: string;
  ultimaVontadePendente: boolean;
  resolvidoEm: string;
}

export type EvolutionHistoryEntryTipo = "ganho" | "gasto" | "ajuste";

export interface EvolutionHistoryEntry {
  id: string;
  tipo: EvolutionHistoryEntryTipo;
  /** PM ganhos/gastos — 0 para entradas "ajuste" (atributo/perícia, sem custo de PM fechado ainda). */
  quantidade: number;
  descricao: string;
  /** Ex.: "atributo:corpo", "pericia:luta" — só presente em "ajuste". */
  campoAfetado?: string;
  antes?: number;
  depois?: number;
  criadoEm: string;
  criadoPor: "character_sheet";
}

// ---------------------------------------------------------------------
// Persistência (tabela `characters`, migration 0002_characters.sql)
// ---------------------------------------------------------------------

/** Linha completa da tabela `characters`. payload é o Character inteiro. */
export interface CharacterRecord {
  id: string;
  name: string;
  owner_label: string | null;
  status: string;
  payload: Character;
  created_at: string;
  updated_at: string;
  /** Mesa a que o personagem pertence (migration 0011). Null = legado/sem mesa. */
  campaign_id: string | null;
  /** Perfil a que o personagem pertence dentro da mesa (migration 0011). Null = sem perfil. */
  profile_id: string | null;
  /** Narrador logado dono do registro (migration 0011). Null = criado sem login. */
  owner_id: string | null;
  /** Momento em que foi arquivado (migration 0012). Null = ativo/vivo. */
  archived_at: string | null;
}

// ---------------------------------------------------------------------
// Fórmulas de derivados, como vêm em regras_personagem.derivados[].formula
// ---------------------------------------------------------------------

export type FormulaNode =
  | { const: number }
  | { ref: "atributo" | "derivado"; id: string }
  | { op: "+" | "-" | "*" | "/"; args: FormulaNode[] };

/** ids dos 8 derivados básicos cobertos pela ficha mínima. */
export const DERIVED_IDS = [
  "pv_max",
  "pe_max",
  "mana_max",
  "integridade_max",
  "reacoes_por_rodada",
  "andar_m",
  "correr_m",
  "pa_max",
] as const;

export type DerivedId = (typeof DERIVED_IDS)[number];

export type DerivedStats = Record<DerivedId, number>;

// ---------------------------------------------------------------------
// Subconjunto do payload de regras_personagem usado pela ficha mínima
// ---------------------------------------------------------------------

export interface AttributeDefinition {
  id: string;
  nome: string;
  abreviacao?: string;
  valor_minimo: number;
  valor_maximo: number;
}

export interface SkillDefinition {
  id: string;
  nome: string;
  atributo_primario: string;
  valor_minimo: number;
  valor_maximo: number;
}

export interface DerivedDefinition {
  id: string;
  nome: string;
  abreviacao?: string;
  categoria: string;
  unidade?: string;
  formula: FormulaNode;
  formula_label?: string;
}

export interface CharacterRulesPayload {
  atributos: AttributeDefinition[];
  pericias: SkillDefinition[];
  derivados: DerivedDefinition[];
  /**
   * Orçamentos de criação de personagem (checkpoint v0.41) — vêm do
   * payload real de `regras_personagem.criacao_personagem`
   * (confirmado via inspeção do conteúdo publicado: pontos_adicionais
   * de atributo = 3, teto de criação = 3, pontos de perícia = 25,
   * aretz iniciais = 5000). Todos opcionais — o assistente cai em
   * fallback documentado se o campo específico não vier no payload
   * (nunca inventa um número diferente do que já existe no PRD).
   */
  criacao_personagem?: {
    atributos?: { valor_inicial?: number; pontos_adicionais?: number; maximo_na_criacao?: number };
    pericias?: { pontos_totais?: number; maximo_na_criacao?: number };
    pa_base?: number;
    inventario?: { aretz_iniciais?: number };
  };
  /**
   * Regra canônica de Colapso (checkpoint v0.51, achado A3 da auditoria
   * v0.50) — vem do payload real de `regras_personagem.colapso`
   * (`db_regras_personagem_normalizado_v1_4.json`). Subconjunto mínimo
   * lido por `resolveCollapseEndRound` (collapse.ts): qual atributo
   * testar e o limiar de falha por recurso (`gatilhos`), e o desfecho
   * do teste imediato do 3º segmento (`terceiro_segmento`). Ausente =
   * `resolveCollapseEndRound` não inventa teste nem desfecho (fallback
   * defensivo).
   */
  colapso?: CollapseRulesPayload;
  /**
   * Regra canônica de Sobrecarga (checkpoint pós-v0.65) — vem do payload
   * real de `regras_personagem.sobrecarga`. Subconjunto lido por
   * `useOverloadSurge`/`getOverloadWillTestRule` (overload.ts): máximo
   * de cargas por dia, dado do dano imediato do surto e o teste do 3º
   * surto. Ausente = fallbacks defensivos idênticos aos valores atuais
   * do PRD (3 cargas, 1d4, Vontade CD 7, Atordoado 1 rodada).
   */
  sobrecarga?: OverloadRulesPayload;
}

export interface OverloadRulesPayload {
  cargas_maximas_por_dia?: number;
  recupera_em?: string;
  surto?: {
    dano_imediato?: { dado?: string; tipo_dano?: string };
    /** Declarado `true` no conteúdo, mas o RECURSO-alvo do dano psíquico não é estruturado — aplicação continua manual (pendência de conteúdo). */
    aplicar_dano_na_hora?: boolean;
    [key: string]: unknown;
  };
  terceiro_surto?: {
    momento_teste?: string;
    teste?: { pericia?: string; cd?: number };
    falha?: { aplicar_condicao?: string; duracao?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * `payload_automacao`-equivalente de Colapso — não vem de
 * `content_documents` (não é uma condição da Biblioteca), mas do
 * mesmo singleton `character_rule` acima. `falha_se_menor_que`: abaixo
 * disso no teste de fim de rodada avança 1 segmento; 7+ mantém (PRD
 * 10.7). `terceiro_segmento` é aberto (`[key: string]: unknown`)
 * porque o limiar do teste imediato vem codificado no NOME da chave
 * (ex.: `"resultado_8"` → 8, ver `parseTerceiroSegmentoThreshold` em
 * collapse.ts) — evita hardcoded "8" no código.
 */
export interface CollapseGatilhoTeste {
  atributo: string;
  falha_se_menor_que: number;
}

export interface CollapseGatilho {
  recurso: "pv" | "pe";
  /** "fisico" | "mental" — chave usada em `terceiro_segmento.falha` para achar o desfecho certo. */
  tipo: string;
  condicao?: string;
  teste_fim_rodada: CollapseGatilhoTeste;
}

export interface CollapseTerceiroSegmentoRules {
  teste_imediato?: boolean;
  /** ex.: `{ fisico: "morte", mental: "coma_profundo_fora_de_jogo" }`. */
  falha?: Record<string, string>;
  [key: string]: unknown;
}

export interface CollapseRulesPayload {
  segmentos?: number;
  gatilhos?: CollapseGatilho[];
  terceiro_segmento?: CollapseTerceiroSegmentoRules;
}
