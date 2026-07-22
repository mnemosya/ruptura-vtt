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

/**
 * Cadências de uso/cadência (Etapa 8) — mesmo vocabulário de
 * `TALENT_CADENCES` (talentEngine.ts). Só espelhado aqui (não importado)
 * para não acoplar o pacote de tipos do editor ao runtime do personagem —
 * mesmo padrão de `FAIXAS_RESULTADO_TESTE` espelhando `MARGEM_CLASSIFICACOES`.
 * "sessao"/"sessao_malha"/"missao" resetam manualmente (sem gatilho
 * automático no app); "permanente"/"ao_adquirir" nunca resetam.
 */
export const CADENCIAS_USO_TALENTO = [
  "turno",
  "rodada",
  "cena",
  "combate",
  "dia",
  "descanso_longo",
  "sessao",
  "sessao_malha",
  "missao",
  "permanente",
  "ao_adquirir",
] as const;
export type CadenciaUsoTalento = (typeof CADENCIAS_USO_TALENTO)[number];

/**
 * Limite de usos/cadência reutilizável em QUALQUER tipo de efeito (Etapa 8)
 * — mesma representação já lida por `talentEngine.ts`
 * (`getTalentUsageState`/`canUseTalent`/`resetTalentCadence`) via
 * `efeito.usos`/`efeito.cadencia` no payload de talento. Só tem executor
 * real hoje para talento; magia/item ainda não têm leitor genérico de
 * usos/cadência (ficam lembrete quando configurado). `chaveUso` é
 * derivada no servidor (nunca livremente editável no fluxo principal).
 */
export interface UsoLimitado {
  usosMax: number;
  cadencia: CadenciaUsoTalento;
  chaveUso?: string;
  compartilhado?: boolean;
}

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
  usoLimitado?: UsoLimitado;
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

/**
 * Momento do consumo (Etapa 8) — só relevante quando `operacao === "reduzir"`
 * (isto é, quando o efeito representa um CONSUMO, não um ganho de recurso).
 * "consumo não pode ocorrer antes da validação quando a regra exige
 * confirmação ou alvo" — por isso "antes_ativacao" só é seguro para
 * recursos sem alvo/confirmação associados; o diagnóstico não bloqueia a
 * escolha (é a pessoa administradora que declara a regra real), mas o
 * texto de log deixa isso explícito.
 */
export const MOMENTOS_CONSUMO = ["antes_ativacao", "apos_validacao", "ao_confirmar", "ao_resolver", "ao_acertar", "ao_concluir", "manual"] as const;
export type MomentoConsumo = (typeof MOMENTOS_CONSUMO)[number];

export interface CamposAlterarRecurso {
  recurso: RecursoAlterar;
  operacao: OperacaoRecurso;
  valorFixo?: number;
  formula?: string;
  minimo?: number;
  maximo?: number;
  bloquearPorInsuficiencia: boolean;
  /** Consumo (Etapa 8) — reaproveita o mesmo campo/executor de `alterar_recurso`; nunca um tipo novo duplicado. */
  momentoConsumo?: MomentoConsumo;
  refundEmCancelamento?: boolean;
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

/**
 * Duração de um efeito temporário (Etapa 8) — mesmo vocabulário de
 * `TemporaryEffect.durationType` (character/types.ts): "rounds" decrementa
 * a cada fim de rodada, "scene" expira no fim de cena, "rest" no descanso
 * longo, "manual" só sai por remoção manual. Nunca converte turno↔rodada,
 * dia↔descanso longo ou cena↔combate — cada unidade é distinta.
 */
export const DURACOES_EFEITO_TEMPORARIO = ["rounds", "scene", "rest", "manual"] as const;
export type TipoDuracaoTemporario = (typeof DURACOES_EFEITO_TEMPORARIO)[number];

export interface DuracaoEfeitoTemporario {
  tipo: TipoDuracaoTemporario;
  /** Só quando `tipo === "rounds"` — quantidade de rodadas restantes ao criar o efeito. */
  rodadas?: number;
}

/**
 * Política de reaplicação — mapeia 1:1 para `TemporaryEffect.stackingMode`
 * (character/temporaryEffects.ts::addTemporaryEffect). "Renovar duração" e
 * "manter o mais forte" (citados no capítulo como comportamentos
 * possíveis) NÃO têm representação determinística no runtime hoje — não
 * oferecidos, só os 4 que o executor real sabe aplicar.
 */
export const POLITICAS_REAPLICACAO = ["substituir", "acumular_pilha", "ignorar", "manual"] as const;
export type PoliticaReaplicacao = (typeof POLITICAS_REAPLICACAO)[number];

/**
 * Modificador filho de um efeito temporário — reaproveita `modificar_teste`
 * (campos e executor) sem duplicar. Tipo estruturalmente restrito a esta
 * ÚNICA variante (nunca `EfeitoFilho` completo): impede por construção que
 * um efeito temporário contenha outro efeito temporário, um teste/
 * resistência, ou qualquer outro tipo — mesma técnica de exclusão de
 * profundidade usada em `ResultadoTeste.efeitos` (Etapa 7).
 */
export type ModificadorSimplesEfeitoTemporario = CamposEfeitoComuns & { tipo: "modificar_teste"; campos: CamposModificarTeste };

/** Limite explícito de filhos de um efeito temporário — documentado (Etapa 8, ver checkpoint). */
export const MAX_MODIFICADORES_EFEITO_TEMPORARIO = 4;

export interface CamposEfeitoTemporario {
  duracao: DuracaoEfeitoTemporario;
  politicaReaplicacao: PoliticaReaplicacao;
  acumulavel: boolean;
  maximoPilhas?: number;
  pilhasIniciais?: number;
  /** Reaproveita `modificar_teste` — ver `ModificadorSimplesEfeitoTemporario`. Máximo `MAX_MODIFICADORES_EFEITO_TEMPORARIO`. */
  modificadores: ModificadorSimplesEfeitoTemporario[];
  confirmacaoManual: boolean;
}

export const TIPOS_ACAO_ADICIONAL = ["acao", "reacao", "ataque"] as const;
export type TipoAcaoAdicional = (typeof TIPOS_ACAO_ADICIONAL)[number];

/**
 * Concede/permite uma ação, reação ou ataque adicional (Etapa 8). Auditoria
 * não encontrou executor genérico real para isto — sempre `lembrete`
 * (ver effectTypeRegistry.ts), preservado e representável, nunca fingido
 * como automação.
 */
export interface CamposAcaoReacaoAdicional {
  tipo: TipoAcaoAdicional;
  acaoPermitida?: string;
  quantidade: number;
  custoSubstituido?: string;
  gratuito: boolean;
  consomeReacao: boolean;
  consomePa?: number;
  janela?: string;
  penalidade?: string;
  /** Limite de ações adicionais encadeadas a partir desta — nunca permite loop (ver validação). */
  limite?: number;
  confirmacaoManual: boolean;
}

/**
 * Modifica uma INSTÂNCIA existente por operação enumerada (Etapa 9) —
 * nunca um caminho JSON arbitrário. Cada operação mapeia 1:1 a um
 * executor real e específico já existente ou adicionado nesta etapa
 * (`character/inventory.ts`): `alterar_carga_atual` →
 * `setItemCargaAtual`; `alterar_municao_carregada`/`recarregar` →
 * `setItemMunicaoAtual`; `alterar_mit_atual`/`reparar_mit` →
 * `setItemMitAtual`; `alterar_pd_atual`/`reparar_pd` → `setItemPdAtual`.
 * `reparar_*` é a mesma operação que `alterar_*_atual` com `valor`
 * positivo — mantidas como rótulos distintos porque o conteúdo real
 * (`runa_armadura_autorreparo`, tipo "autorreparo") já usa esse conceito
 * separadamente. Instalar/remover/ativar/desativar runa NÃO entram
 * aqui — já são um fluxo real e genérico próprio (`installRuneOnItem`/
 * `removeRuneFromItem`/`toggleInstalledRune`, ver checkpoint §runas).
 */
export const OPERACOES_MODIFICAR_INSTANCIA = [
  "alterar_carga_atual",
  "alterar_municao_carregada",
  "recarregar",
  "alterar_mit_atual",
  "alterar_pd_atual",
  "reparar_mit",
  "reparar_pd",
] as const;
export type OperacaoModificarInstancia = (typeof OPERACOES_MODIFICAR_INSTANCIA)[number];

export interface CamposModificarInstancia {
  operacao: OperacaoModificarInstancia;
  /** Delta (operações "alterar_") ou valor a somar (operações "reparar_"/"recarregar") — nunca um valor absoluto arbitrário fora do clamp do executor real. */
  valor?: number;
  limite?: number;
  confirmacaoManual: boolean;
}

/**
 * Concede conteúdo/cria instância de item (Etapa 9). Sem executor real
 * conectado nesta etapa (auditoria: nenhum schema tem um `tipo` legado
 * para "conceder item"; construir o fluxo completo de destino/bando/
 * aliado é fora de escopo — "não transformar esta etapa em um editor
 * geral de inventário"). Representável e preservável; sempre `lembrete`.
 */
export const DESTINOS_CONCEDER_ITEM = ["personagem", "aliado_selecionado", "bando"] as const;
export type DestinoConcederItem = (typeof DESTINOS_CONCEDER_ITEM)[number];

export interface CamposConcederItem {
  /** Slug do item publicado na Biblioteca — nunca texto livre. */
  itemSlug: string;
  quantidade: number;
  destino: DestinoConcederItem;
  /** Mesmo vocabulário real de `ItemLoadoutState` (inventory.ts): equipado|empunhado|acesso_rapido|mochila. */
  estadoInicial?: string;
  cargasIniciais?: number;
  quantidadeInicial?: number;
  origem?: string;
  motivo?: string;
  permitirDuplicata: boolean;
  empilharQuandoCompativel: boolean;
  confirmacaoManual: boolean;
}

/**
 * Consome/remove item ou instância (Etapa 9). Mesmo status de
 * `conceder_item`: sem executor real conectado nesta etapa — sempre
 * `lembrete`, representável e preservável.
 */
export const COMPORTAMENTOS_PILHA_CONSUMIR = ["reduzir_quantidade", "remover_instancia"] as const;
export type ComportamentoPilhaConsumir = (typeof COMPORTAMENTOS_PILHA_CONSUMIR)[number];

export interface CamposConsumirItem {
  itemSlug?: string;
  quantidade: number;
  comportamentoPilha: ComportamentoPilhaConsumir;
  condicao?: string;
  refund: boolean;
  destinoTransferencia?: string;
  confirmacaoManual: boolean;
}

/**
 * Altera preço/concede desconto (Etapa 9). Serializável hoje só para
 * talento — reaproveita EXATAMENTE o formato real já lido por
 * `getGarimpoDeRuaAvailability`/`getCadernetaDeDividaAvailability`
 * (talentEngine.ts): `desconto_percentual` → `tipo: "desconto_loja"`,
 * `permitir_compra_fiada` → `tipo: "compra_fiada"`. As demais operações
 * (desconto_fixo/multiplicador/sobretaxa/preco_minimo) não têm análogo
 * real no conteúdo hoje — representáveis, mas bloqueadas na publicação
 * (ver effectLegacySerialization.ts).
 */
export const OPERACOES_ALTERAR_PRECO = [
  "desconto_percentual",
  "desconto_fixo",
  "multiplicador",
  "sobretaxa",
  "preco_minimo",
  "permitir_compra_fiada",
] as const;
export type OperacaoAlterarPreco = (typeof OPERACOES_ALTERAR_PRECO)[number];

export interface CamposAlterarPreco {
  operacao: OperacaoAlterarPreco;
  percentual?: number;
  valorFixo?: number;
  multiplicador?: number;
  precoMinimo?: number;
  limitePorCompra?: number;
  /** Só relevante para `permitir_compra_fiada` — mesma escala real de `isRaridadeDentroDoLimite` (talentEngine.ts). */
  raridadeMaxima?: string;
  contextoTexto?: string;
  confirmacaoManual: boolean;
}

/**
 * Altera disponibilidade/estoque (Etapa 9). Auditoria: NENHUM estado de
 * estoque de campanha existe hoje (catálogo tratado como
 * infinitamente disponível) — sempre `lembrete`/`narrativo_rastreado`,
 * nunca automático. Representável para documentação/preview, nunca
 * fingido como sistema de estoque funcional.
 */
export const OPERACOES_DISPONIBILIDADE = ["marcar_disponivel", "marcar_indisponivel", "definir_estoque"] as const;
export type OperacaoDisponibilidade = (typeof OPERACOES_DISPONIBILIDADE)[number];

export interface CamposAlterarDisponibilidade {
  operacao: OperacaoDisponibilidade;
  quantidade?: number;
  fornecedor?: string;
  contextoTexto?: string;
  confirmacaoManual: boolean;
}

/**
 * Companheiro/Trama (Etapa 10) — auditoria de `talentEngine.ts` confirmou
 * que Droneiro/Mecatrônico/Tecelão são ~15 funções bespoke, hiper-
 * específicas por nível de talento (`registerDrone`, `iniciarTrama`,
 * `executarBypass`, etc.), disparadas por clique manual na ficha — não
 * por um efeito de conteúdo lido genericamente. NENHUMA delas é reusável
 * por natureza (nomes parecidos não implicam mecanismo genérico). Os 6
 * tipos abaixo são portanto sempre `lembrete` (nenhum executor real
 * conectado) e só representáveis em TALENTO — `familia:"companheiro"`/
 * `"trama"` já são valores REAIS do enum de família do schema de talento
 * (usados hoje só para classificar conteúdo legado como incompatível,
 * `legacyConversion.ts::FAMILIAS_INCOMPATIVEIS`). Não há catálogo de
 * modelos de drone/robô na Biblioteca (nenhum `db_drones.json`/schema —
 * `modelo`/`acoes`/`ordens` são texto livre até em `Character.drones[]`)
 * — por isso nenhum novo `content_type` foi criado nesta etapa; ver
 * checkpoint §2 "Decisão sobre tipos de conteúdo".
 *
 * RAM já é representável sem nenhum código novo: `RECURSOS_ALTERAR`
 * (acima) já inclui `"ram"` — reaproveita `alterar_recurso` tal como
 * está, nunca um segundo sistema de recurso.
 */
export const TIPOS_COMPANHEIRO = ["drone", "robo", "companheiro_tecnico", "outro"] as const;
export type TipoCompanheiro = (typeof TIPOS_COMPANHEIRO)[number];

export const DESTINOS_COMPANHEIRO = ["personagem", "aliado_selecionado", "bando"] as const;
export type DestinoCompanheiro = (typeof DESTINOS_COMPANHEIRO)[number];

/** Concede/registra uma instância de companheiro (drone/robô/etc.). Sem executor real — sempre lembrete. */
export interface CamposCompanheiro {
  tipo: TipoCompanheiro;
  /** Texto livre — não há catálogo de modelos de drone/robô na Biblioteca hoje (auditoria confirmada). */
  modeloReferencia?: string;
  destino: DestinoCompanheiro;
  controlador?: string;
  quantidade: number;
  estadoInicial?: string;
  paInicial?: number;
  persistente: boolean;
  duracao?: string;
  vinculo?: string;
  confirmacaoManual: boolean;
}

export const OPERACOES_MODIFICAR_COMPANHEIRO = [
  "conceder_pa",
  "reduzir_pa",
  "definir_pa",
  "alterar_pa_maximo_temporario",
  "reparar",
  "causar_dano",
  "aplicar_estado",
  "remover_estado",
  "equipar",
  "desequipar",
  "conceder_acao",
  "remover_acao",
  "alterar_programacao",
  "parear",
  "desemparelhar",
  "alterar_controlador",
  "compartilhar_comando",
  "desligar",
  "reativar",
] as const;
export type OperacaoModificarCompanheiro = (typeof OPERACOES_MODIFICAR_COMPANHEIRO)[number];

/** Operação enumerada sobre um companheiro — nunca caminho JSON arbitrário. Sem executor real — sempre lembrete. */
export interface CamposModificarCompanheiro {
  operacao: OperacaoModificarCompanheiro;
  alvo?: string;
  valor?: number;
  duracao?: string;
  requisito?: string;
  confirmacaoManual: boolean;
}

/** Limite explícito de consequências de uma ação de companheiro (Etapa 10, ver checkpoint). */
export const MAX_EFEITOS_CONSEQUENCIA_ACAO_COMPANHEIRO = 3;

/**
 * Ação de companheiro, com consequências reaproveitando o catálogo
 * universal (`EfeitoFilho` — já exclui `teste_resistencia`). Um
 * `acao_companheiro` NÃO pode aparecer entre suas próprias
 * `efeitosConsequencia` — validado em runtime (não estruturalmente,
 * diferente do padrão usual desde a Etapa 7): o teto de automação é
 * sempre `lembrete` aqui, então o risco de execução é nulo; a validação
 * ainda impede profundidade além de 1 nível extra.
 */
export interface CamposAcaoCompanheiro {
  acaoReferencia?: string;
  custoPaCompanheiro?: number;
  custoControlador?: number;
  alvo?: string;
  exigeTeste: boolean;
  janela?: string;
  independente: boolean;
  efeitosConsequencia: EfeitoFilho[];
  confirmacaoManual: boolean;
}

/**
 * Programação de gatilho — reaproveita o campo comum `gatilho`
 * (`CamposEfeitoComuns`, mesmo vocabulário de `GATILHOS_INICIAIS` já
 * usado por todo o catálogo) em vez de inventar um segundo conceito de
 * gatilho. Sem executor real — sempre lembrete.
 */
export interface CamposProgramarGatilho {
  companheiroAlvo?: string;
  acaoReferencia?: string;
  prioridade?: number;
  condicaoTexto?: string;
  limite?: number;
  substituiProgramaAnterior: boolean;
  confirmacaoManual: boolean;
}

export const TIPOS_COMPARTILHAMENTO_PAREAMENTO = ["comando", "percepcao", "acao", "estado", "pa", "sinal", "acao_coordenada"] as const;
export type TipoCompartilhamentoPareamento = (typeof TIPOS_COMPARTILHAMENTO_PAREAMENTO)[number];

/** Pareamento entre entidades. Sem executor real — sempre lembrete. */
export interface CamposParear {
  origem?: string;
  destino?: string;
  tiposCompativeis: string[];
  compartilhamentos: TipoCompartilhamentoPareamento[];
  duracao?: string;
  custo?: string;
  requisito?: string;
  confirmacaoManual: boolean;
}

/**
 * Ação de Trama. Cobre RAM (via `alterar_recurso` já existente, nunca
 * duplicado), Detecção/Rastro/Nó/Bloqueio/Presença/assinatura/Avançar
 * — todos texto livre hoje no runtime real (`Character.trama_ativa`:
 * `bloqueios`/`nos`/`presencasHostis` são `string[]`, sem catálogo
 * estruturado) — por isso `alvoTexto` é texto livre, não referência.
 * Sem executor real — sempre lembrete.
 */
export const ACOES_TRAMA = [
  "avancar",
  "revelar_no",
  "revelar_bloqueio",
  "criar_presenca",
  "modificar_assinatura",
  "reduzir_deteccao",
  "aumentar_deteccao",
  "reduzir_rastro",
  "aumentar_rastro",
  "isolar",
  "atravessar",
  "expulsar_presenca",
  "assumir_controle",
] as const;
export type AcaoTrama = (typeof ACOES_TRAMA)[number];

export interface CamposAcaoTrama {
  acao: AcaoTrama;
  custoPa?: number;
  custoRam?: number;
  exigeTeste: boolean;
  atributo?: string;
  pericia?: string;
  cdFixa?: number;
  alvoTexto?: string;
  /** Só relevante quando `acao === "avancar"` — unidade abstrata real (espaços), nunca metros/tokens. */
  alcanceAvancarEspacos?: number;
  requisito?: string;
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
  | (CamposEfeitoComuns & { tipo: "alterar_dano_recebido"; campos: CamposAlterarDanoRecebido })
  | (CamposEfeitoComuns & { tipo: "efeito_temporario"; campos: CamposEfeitoTemporario })
  | (CamposEfeitoComuns & { tipo: "acao_reacao_adicional"; campos: CamposAcaoReacaoAdicional })
  | (CamposEfeitoComuns & { tipo: "modificar_instancia"; campos: CamposModificarInstancia })
  | (CamposEfeitoComuns & { tipo: "conceder_item"; campos: CamposConcederItem })
  | (CamposEfeitoComuns & { tipo: "consumir_item"; campos: CamposConsumirItem })
  | (CamposEfeitoComuns & { tipo: "alterar_preco"; campos: CamposAlterarPreco })
  | (CamposEfeitoComuns & { tipo: "alterar_disponibilidade"; campos: CamposAlterarDisponibilidade })
  | (CamposEfeitoComuns & { tipo: "companheiro"; campos: CamposCompanheiro })
  | (CamposEfeitoComuns & { tipo: "modificar_companheiro"; campos: CamposModificarCompanheiro })
  | (CamposEfeitoComuns & { tipo: "acao_companheiro"; campos: CamposAcaoCompanheiro })
  | (CamposEfeitoComuns & { tipo: "programar_gatilho"; campos: CamposProgramarGatilho })
  | (CamposEfeitoComuns & { tipo: "parear"; campos: CamposParear })
  | (CamposEfeitoComuns & { tipo: "acao_trama"; campos: CamposAcaoTrama });

export type EfeitoEditavel =
  | EfeitoFilho
  | (CamposEfeitoComuns & { tipo: "teste_resistencia"; campos: CamposTesteResistencia });

export type TipoEfeitoMvp = "dano" | "cura" | "aplicar_condicao" | "remover_condicao" | "modificar_teste" | "alterar_recurso";

/** Os 6 tipos originais do MVP (Etapa 4) — usado onde a distinção histórica importa (ex.: rótulos). Para "é um tipo que o Construtor sabe criar/serializar", use `TIPOS_EFEITO_EDITAVEL`. */
export const TIPOS_EFEITO_MVP: readonly TipoEfeitoMvp[] = ["dano", "cura", "aplicar_condicao", "remover_condicao", "modificar_teste", "alterar_recurso"];

export function isTipoEfeitoMvp(tipo: string): tipo is TipoEfeitoMvp {
  return (TIPOS_EFEITO_MVP as readonly string[]).includes(tipo);
}

/** Tipo de qualquer efeito editável, incluindo os 3 da Etapa 7, os 2 da Etapa 8, os 5 da Etapa 9 e os 6 novos da Etapa 10 (companheiro/Trama). */
export type TipoEfeitoEditavel = EfeitoEditavel["tipo"];

/** Todos os tipos que o Construtor sabe criar/serializar nesta etapa — os 6 originais + 3 (Etapa 7) + 2 (Etapa 8) + 5 (Etapa 9) + 6 (Etapa 10). Usado pelo seletor de tipo da UI e por qualquer checagem "este tipo existe no catálogo editável". */
export const TIPOS_EFEITO_EDITAVEL: readonly TipoEfeitoEditavel[] = [
  ...TIPOS_EFEITO_MVP,
  "modificar_margem",
  "alterar_dano_recebido",
  "teste_resistencia",
  "efeito_temporario",
  "acao_reacao_adicional",
  "modificar_instancia",
  "conceder_item",
  "consumir_item",
  "alterar_preco",
  "alterar_disponibilidade",
  "companheiro",
  "modificar_companheiro",
  "acao_companheiro",
  "programar_gatilho",
  "parear",
  "acao_trama",
];

export function isTipoEfeitoEditavel(tipo: string): tipo is TipoEfeitoEditavel {
  return (TIPOS_EFEITO_EDITAVEL as readonly string[]).includes(tipo);
}

/**
 * Tipos válidos como filho de um resultado — todo o catálogo universal
 * exceto `teste_resistencia` (profundidade limitada por construção).
 * Os 6 novos tipos da Etapa 10 são seguros como filhos pela mesma razão
 * de `efeito_temporario`/`acao_reacao_adicional`: nenhum contém uma
 * árvore de teste/resistência aninhada. `acao_companheiro` contém
 * `EfeitoFilho[]` (sem `teste_resistencia`) como consequência — validado
 * em runtime para nunca conter outro `acao_companheiro` (ver
 * `effectLegacySerialization.ts`).
 */
export const TIPOS_EFEITO_FILHO: readonly EfeitoFilho["tipo"][] = [
  ...TIPOS_EFEITO_MVP,
  "modificar_margem",
  "alterar_dano_recebido",
  "efeito_temporario",
  "acao_reacao_adicional",
  "modificar_instancia",
  "conceder_item",
  "consumir_item",
  "alterar_preco",
  "alterar_disponibilidade",
  "companheiro",
  "modificar_companheiro",
  "acao_companheiro",
  "programar_gatilho",
  "parear",
  "acao_trama",
];

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
    case "efeito_temporario":
      return { ...comuns, tipo, campos: { duracao: { tipo: "rounds", rodadas: 1 }, politicaReaplicacao: "substituir", acumulavel: false, modificadores: [], confirmacaoManual: true } };
    case "acao_reacao_adicional":
      return { ...comuns, tipo, campos: { tipo: "acao", quantidade: 1, gratuito: true, consomeReacao: false, confirmacaoManual: true } };
    case "modificar_instancia":
      return { ...comuns, tipo, campos: { operacao: "reparar_mit", confirmacaoManual: true } };
    case "conceder_item":
      return { ...comuns, tipo, campos: { itemSlug: "", quantidade: 1, destino: "personagem", permitirDuplicata: false, empilharQuandoCompativel: true, confirmacaoManual: true } };
    case "consumir_item":
      return { ...comuns, tipo, campos: { quantidade: 1, comportamentoPilha: "reduzir_quantidade", refund: false, confirmacaoManual: true } };
    case "alterar_preco":
      return { ...comuns, tipo, campos: { operacao: "desconto_percentual", confirmacaoManual: true } };
    case "alterar_disponibilidade":
      return { ...comuns, tipo, campos: { operacao: "marcar_disponivel", confirmacaoManual: true } };
    case "companheiro":
      return { ...comuns, tipo, campos: { tipo: "drone", destino: "personagem", quantidade: 1, persistente: true, confirmacaoManual: true } };
    case "modificar_companheiro":
      return { ...comuns, tipo, campos: { operacao: "conceder_pa", confirmacaoManual: true } };
    case "acao_companheiro":
      return { ...comuns, tipo, campos: { exigeTeste: false, independente: false, efeitosConsequencia: [], confirmacaoManual: true } };
    case "programar_gatilho":
      return { ...comuns, tipo, campos: { substituiProgramaAnterior: true, confirmacaoManual: true } };
    case "parear":
      return { ...comuns, tipo, campos: { tiposCompativeis: [], compartilhamentos: [], confirmacaoManual: true } };
    case "acao_trama":
      return { ...comuns, tipo, campos: { acao: "avancar", exigeTeste: false, confirmacaoManual: true } };
  }
}
