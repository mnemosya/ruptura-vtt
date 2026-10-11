"use client";

/**
 * Página de DEBUG da ficha mínima — não é a interface final do VTT.
 *
 * Estado do personagem em edição é local (useState) até o usuário
 * clicar em "Salvar personagem" — aí é persistido na tabela
 * `characters` via Server Actions (src/lib/character/storage.ts).
 * Os derivados são recalculados automaticamente a cada render porque
 * dependem de `character.atributos` via useMemo.
 *
 * UI organizada em abas (useState local, sem lib nova) só para
 * preparar o crescimento futuro (inventário/magia/combate) sem
 * empilhar tudo numa página só — nenhuma regra muda por causa disso.
 *
 * Este componente é o único que guarda estado e Server Actions; os
 * componentes em ./components são só apresentação — recebem dados e
 * callbacks via props, sem estado próprio (exceto estado visual
 * trivial, se algum dia precisar) e sem acesso direto ao Supabase.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialCharacter,
  characterDerivedFormulas,
  computeDerivedStats,
  normalizeCharacter,
  applyConsoleMutation,
  deriveActiveEffectsFromConditions,
  applyAutoHealRemoval,
  undoAutoHealRemoval,
  applyShortRest,
  applyLongRest,
  useOverloadSurge,
  getOverloadMaxPerDay,
  OVERLOAD_SURGE_TYPES,
  getOverloadSurgeDamageDie,
  getOverloadWillTestRule,
  applyStunFromFailedWillTest,
  detectCollapseOnResourceChange,
  pisoPeNegativo,
  advanceCollapseSegment,
  stabilizeCollapse,
  confirmReturnAfterCollapseOutcome,
  resolveCollapseEndRound,
  resolveCollapseAdditionalDamage,
  MAX_COLLAPSE_SEGMENTS,
  logPermanentAdjustment,
  buildActionConsoleItems,
  executeActionOnCharacter,
  hasAplicarPosturaEffect,
  deriveReactionDefenseEffect,
  getReactionAvailability,
  spendReactionForDefense,
  undoLastReactionUse,
  resetRoundReactionState,
  resolveEndRoundConditionsForCharacter,
  resolveConditionResistanceCheck,
  applyRoundScopedPaReductions,
  resolvePendingRuptureChoice,
  deriveActiveEffectsFromTemporaryEffects,
  tickRoundTemporaryEffects,
  removeTemporaryEffect,
  getActiveTemporaryEffects,
  formatTemporaryEffectSummary,
  deriveInstalledTechnicalEffects,
  deriveInstalledRuneEffects,
  getSpellAttackProfile,
  purchaseItem,
  setItemLoadoutState,
  setItemEmEncaixe,
  applyToqueDeMidas,
  endToqueDeMidas,
  applyShieldDamage,
  expireItemTemporaryEffects,
  deriveActiveEffectsFromItemTemporaryEffects,
  removeItemFromInventory,
  adjustItemQuantity,
  deriveItemProperties,
  removeQuantityFromInventory,
  useItemOnCharacter,
  useItemOnAlly,
  installRuneOnItem,
  removeRuneFromItem,
  toggleInstalledRune,
  applySobregravacao,
  setSobregravacaoInstructedAllies,
  grantSobregravacaoAccess,
  getSlotsRunaMaxEfetivo,
  countInstalledRunes,
  equipDefensiveItem,
  unequipDefensiveItem,
  setItemMitAtual,
  setItemPdAtual,
  setWeaponAmmoAtual,
  setAljavaFlechaQuantidade,
  storeFletchasInAljava,
  withdrawFletchasFromAljava,
  reloadMagazineWeapon,
  reloadAljava,
  consumeAttackAmmo,
  checkAttackAmmoBlock,
  deriveModoMunicao,
  migrateEmbeddedAljavas,
  getAljavaInstances,
  getAljavaTotalFlechas,
  getWeaponAmmoAtual,
  setBowAljavaSelection,
  setBowFlechaSelection,
  ALJAVA_ITEM_SLUG,
  getAttackWeaponCandidates,
  resolveAttackDetails,
  castSpell,
  rollSpellDamage,
  getSpellDamageEffect,
  prepareSpellCastResolution,
  rollSpellAttack,
  castSpellWithFusion,
  learnSpell,
  forgetSpell,
  isSpellLearned,
  getVertenteLevel,
  getVertenteCd,
  checkSpellVertenteLevel,
  installEscalpo,
  removeInstalledEscalpo,
} from "../../../lib/character";
import {
  updateCharacter,
  getCharacter,
  listLegacyCharactersDev,
  deleteCharacter,
  getCharacterForCampaign,
  updateCharacterSheetPayload,
} from "../../../lib/character/storage";
import type {
  ActiveCondition,
  Character,
  CharacterAttributes,
  CharacterGameState,
  CharacterRecord,
  CharacterResources,
  CharacterRulesPayload,
  DerivedStats,
  CombatActionContent,
  ReactionRules,
  ConditionContent,
  ItemContent,
  WalletId,
  ItemLoadoutState,
  SpellContent,
  InventoryItemInstance,
  AttackWeaponCandidate,
  TemporaryEffect,
  CompanionModelSummary,
} from "../../../lib/character";
import type { TechnicalContentItem } from "../../../lib/content";
import { catalogWithMarketEscalpos } from "../../../lib/character/marketEscalpos";
import { lerPermissaoNaFicha } from "../../../lib/campaign/sessionActions";
import { resolverPericia, rollPericia, type PreparedRoll } from "../../../lib/dice";
import { addLog } from "../../../lib/table/storage";
import { upsertCrewInventoryItem } from "../../../lib/table/crewInventory";
import type { Campaign, TableLogVisibility } from "../../../lib/table";
import { useCharacterRealtime } from "../../../lib/realtime/useCharacterRealtime";
import { describeRealtimeStatus } from "../../../lib/realtime/tableRealtime";
import { CharacterSheetTabs, type TabId } from "./components/CharacterSheetTabs";
import { CharacterConsole } from "../../ficha/_console/CharacterConsole";
import { ConsoleErrorBoundary } from "../../ficha/_console/ConsoleErrorBoundary";
import { useConsoleCloseOverride } from "../../ficha/_console/ConsoleCloseContext";
import { PainelAcaoToken, type OpcaoAcaoToken } from "../../mesas/[campaignId]/vtt/_shell/PainelAcaoToken";
import { PainelRolagem } from "../../ficha/_console/panels/PainelRolagem";
import { contextoAcaoTokenAction } from "../../mesas/[campaignId]/vtt/_painel/acoes/targetsPainel";
import { declararAtaqueAction } from "../../mesas/[campaignId]/vtt/_painel/acoes/ataquePainel";
import type { AlvoAcaoToken, ContextoAcaoToken, PedidoAcaoToken } from "../../mesas/[campaignId]/vtt/_dominio/targets";
import { deriveItemUseKind, getItemUsePreview, getItemUsePaCost } from "../../../lib/character/itemUse";
import { registrarRolagemPericiaAction } from "../../mesas/[campaignId]/vtt/_painel/acoes/rolagemPainel";
import type { TurnWindow } from "../../../lib/table/turnTrack";
import type { ConsoleApi, ConsolePin, TermoDeRegra } from "../../ficha/_console/types";
import { resumoDeCarga } from "../../../lib/character/carga";
import type { BodySlotId } from "../../ficha/_console/slots";
import { GeneralTab } from "./components/GeneralTab";
import { AttributesTab } from "./components/AttributesTab";
import { SkillsTab } from "./components/SkillsTab";
import { ResourcesTab } from "./components/ResourcesTab";
import { RollsTab } from "./components/RollsTab";
import { LogTab, type LogEntry, type LogTipo } from "./components/LogTab";
import { ConditionsTab, type ConditionOption } from "./components/ConditionsTab";
import { applyGmCondition } from "../../../lib/character/gmActions";
import { LIMITE_PERICIA_POR_RANKING_V12, type RankingV12 } from "../../../lib/rulesetV12";
import { InventoryTab } from "./components/InventoryTab";
import { SpellsTab } from "./components/SpellsTab";
import { BibliotecaTab } from "./components/BibliotecaTab";
import { ActionsTab } from "./components/ActionsTab";
import { ActiveStateStrip } from "./components/ActiveStateStrip";
import { MesaTab } from "./components/MesaTab";
import { SavedCharactersTab } from "./components/SavedCharactersTab";
import { DebugTab } from "./components/DebugTab";
import type { SheetMode } from "./components/ModeToggle";
import { buttonStyle } from "./components/styles";

const LOG_MAX = 50;
const ACTION_DOUBLE_CLICK_GUARD_MS = 500;

/**
 * Texto/cor do indicador discreto de sincronização de DADOS do
 * personagem (checkpoint v0.62) — distinto do status do canal
 * Realtime (`describeRealtimeStatus`, que fala da conexão em si).
 */
const CHARACTER_DATA_SYNC_LABEL: Record<"synced" | "updating" | "pending_remote" | "error", { texto: string; cor: string }> = {
  synced: { texto: "Sincronizado", cor: "#4caf50" },
  updating: { texto: "Atualizando…", cor: "#f5a623" },
  pending_remote: { texto: "Mudança disponível no servidor", cor: "#f5a623" },
  error: { texto: "Erro ao atualizar", cor: "#ff6b6b" },
};

const RECURSO_LABELS: Record<keyof CharacterResources, string> = {
  pv: "PV",
  pe: "PE",
  mana: "Mana",
  integridade: "Integridade",
  pv_temporario: "PV temporário",
  mana_temporaria: "Mana temporária",
};

interface Props {
  acaoToken?: PedidoAcaoToken | null;
  alvosNoMapa?: AlvoAcaoToken[];
  regras: CharacterRulesPayload | null;
  usandoFallback: boolean;
  personagensIniciais: CharacterRecord[];
  mesasIniciais: Campaign[];
  /** Condições publicadas na Biblioteca do Sistema (checkpoint v0.32) — só pré-preenchimento, não obrigatório. */
  condicoesDisponiveis: ConditionOption[];
  /** slug + acoes_habilitadas de cada condição (checkpoint v0.42) — cruzado com a visibilidade das ações. */
  condicoesParaAcoes: { slug: string; acoes_habilitadas?: { acao: string }[] }[];
  /** Ações de combate publicadas na Biblioteca do Sistema (checkpoint v0.42) — fonte única do Console de Ação. */
  combatActionsIniciais: CombatActionContent[];
  /** Conteúdo completo de cada condição publicada (checkpoint v0.44) — fonte única do motor de fim de rodada. */
  conditionContents: ConditionContent[];
  /** Falha explícita ao carregar o catálogo — nunca substituída por lista local. */
  combatActionsError: string | null;
  /** Regras canônicas de Reação interpretadas do singleton combat_flow. */
  reactionRules: ReactionRules;
  /** Itens publicados na Biblioteca do Sistema (checkpoint v0.49) — fonte única da loja/inventário. */
  itemsIniciais: ItemContent[];
  itemsError: string | null;
  /** Magias publicadas na Biblioteca do Sistema (checkpoint v0.50) — fonte única da aba Magias. */
  spellsIniciais: SpellContent[];
  spellsError: string | null;
  /** Propriedades/Runas/Escalpos publicados na Biblioteca (checkpoint v0.53) — fonte única da aba Biblioteca (consulta, sem instância/equipamento). */
  propertiesIniciais: TechnicalContentItem[];
  propertiesError: string | null;
  runesIniciais: TechnicalContentItem[];
  runesError: string | null;
  escalposIniciais: TechnicalContentItem[];
  escalposError: string | null;
  /** Catálogo de modelos de drone/robô (checkpoint "Catálogo oficial de drones e robôs consumido pela ficha") — preenche registerDrone/registerRobo. */
  companionModelsIniciais: CompanionModelSummary[];
  companionModelsError: string | null;
  /**
   * Mesa/personagem pré-selecionados via query string (`?campaignId=...&
   * characterId=...`). `null` quando a ficha é aberta diretamente, sem
   * link.
   */
  initialCampaignId: string | null;
  initialCharacterId: string | null;
  /**
   * Janela de turno do combate que a MESA está rodando, quando a ficha
   * é aberta de dentro dela. `undefined` fora da mesa (rota `/ficha`
   * direta, `/dev/character-sheet`), onde o valor antigo — vindo de
   * `campaigns.turn_track` — continua valendo.
   */
  janelaDeTurno?: TurnWindow | null;
  /**
   * "dev" (`/dev/character-sheet`) mantém todo o comportamento de
   * diagnóstico (lista global de personagens, seletor livre de mesa, aba
   * Debug). "product" (`/ficha`) exige que `initialCampaignId`/
   * `initialCharacterId` resolvam para um personagem real via
   * `getCharacterForCampaign` (ver `productSessionState` abaixo) antes
   * de mostrar qualquer coisa — nunca a lista global nem um personagem
   * arbitrário.
   */
  mode: "dev" | "product";
  /**
   * Aba inicial (Fase 3, deep-link do item de menu "Mercado" para a
   * aba Inventário — `?tab=inventario`) — só define o valor inicial de
   * `activeTab`; não é seletor de personagem nem retorno de ficha
   * (isso é Fase 5). Ignorado se não for um TabId válido.
   */
  initialTab?: TabId;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Estado da resolução do personagem no modo "product":
 *   • "pending": ainda checando (efeito de carregamento ainda não rodou).
 *   • "no_params": `/ficha` foi aberta sem campaignId/characterId na URL.
 *   • "not_found": personagem não encontrado, ou usuário sem acesso a ele
 *     (RLS não distingue os dois casos).
 *   • "valid": personagem carregado — ficha liberada.
 */
type ProductSessionState = "pending" | "no_params" | "not_found" | "valid";

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Recurso atual: inteiro, sem teto (pode passar do máximo), nunca negativo. */
/**
 * `piso` existe por causa do PE: ele é o único recurso que continua
 * contando abaixo de zero (até −⌈pe_max/2⌉, ver `pisoPeNegativo`).
 * PV e Mana seguem parando em zero.
 */
function parseRecursoAtual(rawValue: number, piso = 0): number {
  if (!Number.isFinite(rawValue)) return piso;
  return Math.max(piso, Math.trunc(rawValue));
}

export default function CharacterSheetClient({
  acaoToken,
  alvosNoMapa = [],
  regras,
  usandoFallback,
  personagensIniciais,
  mesasIniciais,
  condicoesDisponiveis,
  condicoesParaAcoes,
  combatActionsIniciais,
  conditionContents,
  combatActionsError,
  reactionRules,
  itemsIniciais,
  itemsError,
  spellsIniciais,
  spellsError,
  propertiesIniciais,
  propertiesError,
  runesIniciais,
  runesError,
  escalposIniciais,
  escalposError,
  companionModelsIniciais,
  companionModelsError,
  initialCampaignId,
  initialCharacterId,
  janelaDeTurno,
  mode,
  initialTab,
}: Props) {
  const [character, setCharacter] = useState<Character>(() => createInitialCharacter(regras));
  const characterRef = useRef(character);
  characterRef.current = character;
  // Último payload conhecido como "igual ao banco" — atualizado sempre
  // que `character` vem de uma leitura/gravação canônica (handleLoad,
  // handleSave, loadProductSession, refetch por Realtime aceito). Serve
  // só para detectar edição local pendente (checkpoint v0.62): se
  // `character` divergir disto quando a mesa mudar o personagem no
  // servidor, a ficha NUNCA sobrescreve silenciosamente — em vez disso
  // oferece a escolha via `pendingRemoteCharacter` (ver
  // refetchCharacterFromRealtime abaixo).
  const lastSyncedCharacterRef = useRef(character);
  /**
   * Ordem das gravações automáticas. Os passos de +/− do Modo Evolução
   * são clicáveis em rajada, e a resposta do servidor volta com o
   * personagem gravado: sem este selo, uma resposta ATRASADA do
   * primeiro clique reescreveria por cima do segundo, e o valor
   * "voltaria" sozinho na tela. Só a gravação mais recente escreve
   * estado.
   */
  const seloGravacaoRef = useRef(0);
  /**
   * Gravação automática SERIALIZADA. O selo acima já impedia uma
   * resposta atrasada de reescrever a TELA, mas não impedia duas
   * gravações de correrem no SERVIDOR: cada uma manda o payload
   * INTEIRO, e a que commitar por último vence. Dois cliques em
   * sequência no Modo Evolução (um atributo, depois uma perícia)
   * podiam terminar com o banco guardando só o primeiro — a tela
   * mostrava os dois e o histórico registrava os dois.
   *
   * Uma de cada vez, e o que fica pendente é sempre o estado MAIS
   * NOVO (não a fila de passos intermediários: cada payload já é um
   * retrato completo, então gravar o último grava todos).
   */
  const gravacaoEmVooRef = useRef(false);
  const gravacaoPendenteRef = useRef<{ personagem: Character; oQueFalhou: string } | null>(null);
  // Versão do personagem vinda do servidor via Realtime enquanto havia
  // edição local pendente — não nulo só quando a ficha está esperando o
  // usuário decidir entre "Recarregar do servidor" e "Manter minha versão".
  const [pendingRemoteCharacter, setPendingRemoteCharacter] = useState<Character | null>(null);
  // Estado do ciclo de sincronização automática do PERSONAGEM (distinto
  // do status do canal Realtime em si, `characterSyncStatus` abaixo) —
  // só para o indicador discreto da UI.
  const [characterDataSyncState, setCharacterDataSyncState] = useState<"synced" | "updating" | "pending_remote" | "error">("synced");
  const [characterId, setCharacterId] = useState<string | null>(null);
  /**
   * Permissão da conta sobre o personagem aberto (migration 0151). Com
   * "visualizar" a ficha é SÓ LEITURA: nada grava (as duas rotas de
   * gravação saem cedo) e o Console trava os controles de edição. O
   * servidor recusaria de qualquer jeito — isto evita a pessoa editar,
   * ver a mudança na tela e descobrir no erro de gravação que não podia.
   */
  const [permissaoFicha, setPermissaoFicha] = useState<"editar" | "visualizar" | null>(null);
  // Atalho SÓ DE DESENVOLVIMENTO pra revisar o layout da ficha em modo
  // leitura sem precisar de uma segunda conta:
  // `localStorage.setItem("ruptura:forcarLeitura", "1")` e reabrir a ficha.
  const forcarLeituraDev = process.env.NODE_ENV === "development"
    && typeof window !== "undefined"
    && (() => { try { return window.localStorage.getItem("ruptura:forcarLeitura") === "1"; } catch { return false; } })();
  const somenteLeitura = mode === "product" && (permissaoFicha === "visualizar" || forcarLeituraDev);
  useEffect(() => {
    if (mode !== "product" || !characterId) { setPermissaoFicha(null); return; }
    let vivo = true;
    lerPermissaoNaFicha(characterId)
      .then((p) => { if (vivo) setPermissaoFicha(p); })
      .catch(() => { /* sem resposta: segue editável; o servidor ainda barra a escrita */ });
    return () => { vivo = false; };
  }, [mode, characterId]);
  const [personagens, setPersonagens] = useState<CharacterRecord[]>(personagensIniciais);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? "geral");
  /**
   * Console do Personagem — janela flutuante sobre a ficha (aditiva).
   * Em `mode === "product"` (rota real /ficha, usada pelos cards de
   * "Fichas ao seu alcance" e "Abrir ficha") ele abre AUTOMATICAMENTE:
   * clicar num personagem precisa levar direto ao Console, não a uma
   * tela intermediária com um botão para abri-lo. Em `mode === "dev"`
   * continua manual, controlado pelo botão de teste.
   */
  const [consoleAberto, setConsoleAberto] = useState(mode === "product");
  const [consolePins, setConsolePins] = useState<ConsolePin[]>([]);
  // Estado de UI local — não vai para o payload salvo (ver handleSave).
  const [sheetMode, setSheetMode] = useState<SheetMode>("jogo");
  // "Rolagem preparada" — ponte entre o clique em "Rolar" nas abas
  // Atributos/Perícias e a aba Rolagens (ver RollsTab). Também é só
  // estado de UI, nunca persiste no payload.
  const [preparedRoll, setPreparedRoll] = useState<PreparedRoll | null>(null);
  // Seleção de arma para "Atacar" (checkpoint pós-v0.50) — estado de UI
  // local, não persistido na ficha (mesmo critério de preparedRoll):
  // qual arma empunhada usar quando há mais de uma, ou "__desarmado__".
  const [selectedAttackWeaponId, setSelectedAttackWeaponId] = useState<string | null>(null);
  /** Rúnico › Sobregravação — instância com teste de Tecnomagia/Arcanismo CD 8 pendente de confirmação (terceiro tentando acessar o espaço extra). */
  const [sobregravacaoTestPending, setSobregravacaoTestPending] = useState<Record<string, true>>({});
  // Mesa (campaign) selecionada — estado de UI local, não persiste no
  // payload do personagem. Quando presente, RollsTab também grava cada
  // rolagem em table_logs (ver checkpoint v0.2 do relatório de Mesas).
  const [mesas, setMesas] = useState<Campaign[]>(mesasIniciais);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  /**
   * Outros personagens ATIVOS na mesa (checkpoint pós-v0.71 — uso de item
   * em aliado). Fase 1: deixou de depender da antiga tabela de perfis de
   * mesa/`active_character_id` (perfil removido) — agora é derivado
   * diretamente dos personagens já carregados em `personagens` que
   * pertencem à mesa selecionada, excluindo o próprio personagem.
   * Recalculado ao trocar de mesa e ao abrir o painel "Usar em aliado" de
   * um item.
   */
  const [alliesAtivos, setAlliesAtivos] = useState<{ id: string; nome: string; character: Character }[]>([]);
  // Log local mínimo (não persiste no Supabase) — alimentado por rolagens
  // (via callback passado a RollsTab) e pelos handlers de recurso/PA/
  // reação abaixo. Limitado às últimas 50 entradas.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logCounterRef = useRef(0);
  // A Aljava e a flecha ativa que cada arco usa para atacar (checkpoint
  // v0.60) são PERSISTIDAS na própria instância do arco
  // (`selectedAljavaInstanceId`/`selectedFlechaSlug`, ver
  // lib/character/ammunition) — não há mais estado local aqui. Um
  // personagem pode ter várias Aljavas; cada arco escolhe qual usa.
  // Trava síncrona contra clique duplo antes do próximo render.
  const actionExecutionLockRef = useRef(false);
  const lastActionExecutionRef = useRef<{ actionId: string; at: number } | null>(null);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  // Aviso de remoção automática por cura (checkpoint v0.34, PRD 9.3) —
  // guarda a última leva de condições removidas por ter recuperado 1+
  // PV, para exibir o aviso e permitir "Desfazer" (reativa só essa
  // leva, nunca remoções manuais). Estado só de UI desta aba — some ao
  // recarregar a página.
  const [autoHealBanner, setAutoHealBanner] = useState<{ ids: string[]; nomes: string[]; pvAnterior: number; pvNovo: number } | null>(
    null,
  );
  // 3º surto de Sobrecarga do dia exige teste de Vontade CD 7 (checkpoint
  // v0.37) — true entre "usar o 3º surto" e "rolar o teste".
  const [overloadWillRollPending, setOverloadWillRollPending] = useState(false);
  // Resumo textual da última "Encerrar Rodada" (checkpoint v0.44) — só
  // estado de UI, não persiste no payload; some ao trocar de aba/reload
  // (o histórico real fica em table_logs + Log local).
  const [endRoundSummary, setEndRoundSummary] = useState<{ logs: string[]; warnings: string[] } | null>(null);

  function addLogEntry(tipo: LogTipo, resumo: string) {
    logCounterRef.current += 1;
    const entry: LogEntry = {
      id: `log-${logCounterRef.current}`,
      horario: new Date().toLocaleTimeString("pt-BR"),
      tipo,
      resumo,
    };
    setLog((prev) => [entry, ...prev].slice(0, LOG_MAX));
  }

  // Pré-seleção via link de mesa (checkpoint v0.10): se a página foi
  // aberta com ?campaignId=...&characterId=..., seleciona a mesa e
  // carrega diretamente esse personagem — reusa `handleLoad`, a mesma
  // função usada pela aba Personagens (SavedCharactersTab), sem duplicar
  // lógica de carregamento. Roda só uma vez (didPrefillRef). Só no modo
  // dev — o modo product tem seu próprio efeito de carregamento
  // (loadProductSession, mais abaixo), que não usa seletor livre de mesa.
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (mode !== "dev" || didPrefillRef.current || !initialCampaignId) return;
    didPrefillRef.current = true;
    handleSelectCampaign(initialCampaignId).then(() => {
      if (initialCharacterId) handleLoad(initialCharacterId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialCampaignId, initialCharacterId]);

  // =====================================================================
  // Resolução do personagem no modo "product" (/ficha)
  // =====================================================================
  //
  // /ficha não usa seletor livre de mesa: campaignId/characterId vêm
  // fixos da URL (query string). Resolve direto por campanha+personagem
  // via `getCharacterForCampaign` — autorizado no servidor via RLS (dono
  // da campanha OU controlador com participação ativa); devolve `null`
  // tanto para "não encontrado" quanto para "sem autorização".
  const [productSessionState, setProductSessionState] = useState<ProductSessionState>("pending");

  async function loadProductSession() {
    if (!initialCharacterId) {
      setProductSessionState("no_params");
      return;
    }
    setProductSessionState("pending");
    try {
      // Sem campanha: personagem solto do próprio jogador (página
      // Personagens). A RLS só devolve se a conta for a dona.
      const record = initialCampaignId
        ? await getCharacterForCampaign(initialCampaignId, initialCharacterId)
        : await getCharacter(initialCharacterId).then((r) => (r && !r.campaign_id ? r : null));
      if (!record) {
        setProductSessionState("not_found");
        return;
      }
      setSelectedCampaignId(initialCampaignId);
      setCharacterId(record.id);
      const loadedRaw = normalizeCharacter(record.payload);
      const { character: loaded, expiredInstanceIds } = expireItemTemporaryEffects(loadedRaw, new Date().toISOString());
      lastSyncedCharacterRef.current = loaded;
      setCharacter(loaded);
      setProductSessionState("valid");
      if (expiredInstanceIds.length > 0) {
        addLogEntry("condicao", `Toque de Midas expirado ao carregar em ${expiredInstanceIds.length} item(ns) — bônus/PD temporário removidos.`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar personagem.");
      setProductSessionState("not_found");
    }
  }

  useEffect(() => {
    if (mode !== "product") return;
    loadProductSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialCampaignId, initialCharacterId]);

  // Posturas (checkpoint v0.64) como pseudo-"ConditionContent" — mesmo
  // shape mínimo que `deriveActiveEffectsFromConditions` já espera
  // (id/slug/nome/categoria/status/payload_automacao), montado a partir
  // da própria ação de combate (nunca um catálogo hardcoded: qualquer
  // ação publicada com efeito `aplicar_postura` entra aqui
  // automaticamente). Isso é o que permite o +1/-1 de postura aparecer
  // como chip real de modificador em RollsTab sem nenhuma infraestrutura
  // paralela — reaproveita 100% o pipeline de condição já existente.
  const postureConditionContents = useMemo(
    () =>
      combatActionsIniciais
        .filter(hasAplicarPosturaEffect)
        .map((a) => ({
          id: a.id,
          slug: a.slug,
          nome: a.nome,
          categoria: a.categoria,
          status: a.status,
          payload_automacao: a.payload_automacao,
        })),
    [combatActionsIniciais],
  );

  // Efeitos ativos derivados das condições (checkpoint v0.33, agora
  // data-driven via payload_automacao — checkpoint v0.51) — função
  // pura, recalculada só quando condicoes_ativas ou o catálogo mudam.
  // Fonte única compartilhada entre ConditionsTab (lista) e RollsTab (chips).
  const activeEffects = useMemo(
    () => {
      const conditionEffects = deriveActiveEffectsFromConditions(character, [...conditionContents, ...postureConditionContents]);
      const escalpoEffects = deriveInstalledTechnicalEffects(character, escalposIniciais);
      const runeEffects = deriveInstalledRuneEffects(character, runesIniciais);
      // Efeitos temporários/buffs rastreados (checkpoint pós-v0.71) — modificadores de rolagem
      // entram no mesmo pipeline; recurso/dano/defesa viram aviso (nunca somados).
      const temporaryEffects = deriveActiveEffectsFromTemporaryEffects(character);
      const reactionEffect = deriveReactionDefenseEffect(character, reactionRules);
      const itemTempEffects = deriveActiveEffectsFromItemTemporaryEffects(character, new Date().toISOString());
      const base = [...conditionEffects, ...escalpoEffects, ...runeEffects, ...temporaryEffects, ...itemTempEffects];
      return reactionEffect ? [...base, reactionEffect] : base;
    },
    [character, conditionContents, postureConditionContents, reactionRules, escalposIniciais, runesIniciais],
  );

  // instanceIds de escalpos com pelo menos 1 ActiveEffect derivado (checkpoint v0.55, fase 2) —
  // só para o aviso "modificador aplicado automaticamente" na aba Biblioteca (BibliotecaTab).
  const installedEscalpoIdsWithEffect = useMemo(() => {
    const ids = new Set<string>();
    for (const effect of activeEffects) {
      if (effect.sourceType !== "escalpo") continue;
      const instanceId = effect.id.split(":")[1];
      if (instanceId) ids.add(instanceId);
    }
    return ids;
  }, [activeEffects]);

  // runeInstallationIds com pelo menos 1 ActiveEffect derivado (checkpoint v0.57) —
  // só para o aviso "modificador aplicado" na aba Inventário (InventoryTab).
  const installedRuneIdsWithEffect = useMemo(() => {
    const ids = new Set<string>();
    for (const effect of activeEffects) {
      if (effect.sourceType !== "rune") continue;
      const installId = effect.id.split(":")[1];
      if (installId) ids.add(installId);
    }
    return ids;
  }, [activeEffects]);

  const derivados = useMemo(
    () => computeDerivedStats(character.atributos, regras, character.mana_bonus_ruptura ?? 0, characterDerivedFormulas(character)),
    [character.atributos, regras, character.mana_bonus_ruptura],
  );
  // Janela atual da trilha de turnos (checkpoint pós-v0.94, fase 1;
  // achado da rodada de consolidação — sem isto, `buildActionConsoleItems`/
  // `executeActionOnCharacter` nunca recebiam a janela real, então o
  // bloqueio de PA>2 em Rápidos nunca disparava de verdade na ficha).
  // Janela de turno: fonte ÚNICA, `vtt_turn_tracks`, entregue por quem
  // abriu a ficha (`janelaDeTurno`). A leitura antiga era
  // `campaigns.turn_track` via `mesas` — outro sistema de combate, que
  // o VTT nunca escreveu e que em modo product era sempre `[]`: as
  // regras de janela (teto de PA em Rápidos) nunca disparavam.
  const currentTurnWindow = janelaDeTurno ?? null;
  const reactionAvailability = useMemo(
    () => getReactionAvailability(character, derivados.reacoes_por_rodada, reactionRules),
    [character, derivados.reacoes_por_rodada, reactionRules],
  );

  // Itens do Console de Ação (checkpoint v0.42) — recalculados sempre que
  // as condições ativas mudam (visibilidade condicional) ou o PA/Reação
  // disponível muda (habilitação do botão "Executar"). Nenhuma lista de
  // ações é mantida à mão aqui — combatActionsIniciais vem inteiro da
  // Biblioteca (ver CharacterSheetView.tsx).
  const actionConsoleItems = useMemo(
    () =>
      buildActionConsoleItems(
        character,
        combatActionsIniciais,
        condicoesParaAcoes,
        derivados.pa_max,
        derivados.reacoes_por_rodada,
        regras?.pericias.map((pericia) => pericia.id) ?? [],
        reactionRules,
        { items: itemsIniciais, properties: propertiesIniciais, runes: runesIniciais },
        currentTurnWindow,
        false,
        activeEffects,
      ),
    [
      character,
      combatActionsIniciais,
      condicoesParaAcoes,
      derivados.pa_max,
      derivados.reacoes_por_rodada,
      regras,
      reactionRules,
      itemsIniciais,
      propertiesIniciais,
      runesIniciais,
      activeEffects,
      currentTurnWindow,
    ],
  );

  // Candidatos de arma para "Atacar" (checkpoint pós-v0.50): armas
  // empunhadas + "Ataque desarmado" sempre disponível. Se a seleção
  // guardada não existir mais na lista atual (arma desequipada/trocada),
  // cai para: 1 candidato real -> auto-seleciona; 0 -> desarmado.
  const attackWeaponCandidates: AttackWeaponCandidate[] = useMemo(
    () => getAttackWeaponCandidates(character, itemsIniciais),
    [character, itemsIniciais],
  );
  const effectiveSelectedAttackWeaponId: string | null = useMemo(() => {
    if (selectedAttackWeaponId === "__desarmado__") return null;
    const armas = attackWeaponCandidates.filter((c) => c.instanceId !== null);
    if (selectedAttackWeaponId !== null && armas.some((c) => c.instanceId === selectedAttackWeaponId)) {
      return selectedAttackWeaponId;
    }
    return armas.length > 0 ? armas[0].instanceId : null;
  }, [attackWeaponCandidates, selectedAttackWeaponId]);
  const attackActionContent = useMemo(() => combatActionsIniciais.find((a) => a.slug === "atacar") ?? null, [combatActionsIniciais]);
  const attackPreview = useMemo(() => {
    if (!attackActionContent) return null;
    const weaponInstance = effectiveSelectedAttackWeaponId
      ? (character.inventario ?? []).find((i) => i.id === effectiveSelectedAttackWeaponId) ?? null
      : null;
    const weaponModel = weaponInstance ? itemsIniciais.find((m) => m.slug === weaponInstance.itemSlug) ?? null : null;
    return resolveAttackDetails(character, attackActionContent, weaponModel);
  }, [attackActionContent, character, effectiveSelectedAttackWeaponId, itemsIniciais]);

  /**
   * Recarrega a lista de personagens salvos. No modo "product" (/ficha)
   * é um no-op deliberado — a ficha real nunca busca a lista global de
   * personagens de outras mesas, só o personagem já carregado via
   * loadProductSession.
   */
  async function refreshList() {
    if (mode === "product") return;
    try {
      setPersonagens(await listLegacyCharactersDev());
    } catch {
      // Falha ao atualizar a lista não deve esconder o resultado do save/load.
    }
  }

  async function handleSave() {
    if (somenteLeitura) return;
    // Defesa em profundidade: a ficha real (/ficha) só edita o
    // personagem já resolvido via getCharacterForCampaign — nunca cria
    // um personagem novo/solto. Na prática characterId/selectedCampaignId
    // nunca são null aqui em modo product (a UI de edição só aparece com
    // productSessionState "valid", que exige o personagem já carregado).
    if (mode === "product" && (!characterId || !selectedCampaignId)) return;
    // Personagem novo só nasce v1.2, pelo "+ Personagem" da mesa — a ficha só grava um existente.
    if (!characterId) {
      setSaveState("error");
      setErrorMessage("Carregue um personagem antes de salvar. Personagens novos são criados pelo \"+ Personagem\" da mesa.");
      return;
    }
    setSaveState("saving");
    setErrorMessage(null);
    try {
      // normalizeCharacter garante metadados.schema_version e preenche
      // recursos_atuais ausentes com os _max calculados aqui na UI
      // (derivados) — storage.ts só carimba atualizado_em por cima.
      const toSave = normalizeCharacter(character, derivados);
      const record =
        mode === "product" && selectedCampaignId
          ? await updateCharacterSheetPayload(characterId as string, toSave)
          : await updateCharacter(characterId as string, toSave);
      lastSyncedCharacterRef.current = record.payload;
      setCharacter(record.payload);
      setCharacterId(record.id);
      setSaveState("saved");
      await refreshList();
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao salvar.");
    }
  }

  async function handleLoad(id: string) {
    setSaveState("idle");
    setErrorMessage(null);
    try {
      const record = await getCharacter(id);
      if (!record) {
        setSaveState("error");
        setErrorMessage(`Personagem "${id}" não encontrado.`);
        return;
      }
      // normalizeCharacter aceita payload antigo/incompleto sem quebrar
      // (personagens salvos antes do schema_version, por exemplo).
      // migrateEmbeddedAljavas garante que aljava embutida em arcos seja
      // convertida para instância compartilhada (idempotente).
      const loadedRaw = migrateEmbeddedAljavas(normalizeCharacter(record.payload));
      const { character: loaded, expiredInstanceIds } = expireItemTemporaryEffects(loadedRaw, new Date().toISOString());
      lastSyncedCharacterRef.current = loaded;
      setCharacter(loaded);
      setCharacterId(record.id);
      setPendingRemoteCharacter(null);
      setCharacterDataSyncState("synced");
      if (expiredInstanceIds.length > 0) {
        addLogEntry("condicao", `Toque de Midas expirado ao carregar em ${expiredInstanceIds.length} item(ns) — bônus/PD temporário removidos.`);
      }
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar.");
    }
  }

  /**
   * Refetch canônico do PRÓPRIO personagem, disparado por Realtime
   * (checkpoint v0.46) — mesma leitura de `handleLoad` (`getCharacter`
   * + `normalizeCharacter`), nunca patch parcial. Cobre os cenários
   * pedidos: a mesa encerra rodada/cena (v0.44.1/v0.45) e persiste
   * PA/Reações/PV/Integridade/Mana/pendências direto no personagem —
   * este refetch é só o que traz isso para a ficha sem reload manual.
   * Não decide regra nenhuma; não roda se não houver personagem
   * carregado ainda (`characterId` nulo).
   *
   * Checkpoint v0.62 — nunca sobrescreve edição local pendente em
   * silêncio: se `character` já divergiu de `lastSyncedCharacterRef`
   * (o jogador mexeu em algo antes de salvar), a versão do servidor
   * fica em `pendingRemoteCharacter` e a UI oferece a escolha
   * ("Recarregar do servidor" / "Manter minha versão") em vez de
   * aplicar direto.
   */
  async function refetchCharacterFromRealtime() {
    if (!characterId) return;
    setCharacterDataSyncState("updating");
    try {
      const record = await getCharacter(characterId);
      if (!record) {
        setCharacterDataSyncState("synced");
        return;
      }
      const next = normalizeCharacter(record.payload);
      const temEdicaoLocalPendente = JSON.stringify(characterRef.current) !== JSON.stringify(lastSyncedCharacterRef.current);
      if (temEdicaoLocalPendente) {
        setPendingRemoteCharacter(next);
        setCharacterDataSyncState("pending_remote");
        return;
      }
      characterRef.current = next;
      lastSyncedCharacterRef.current = next;
      setCharacter(next);
      setCharacterDataSyncState("synced");
    } catch {
      // Best-effort — Realtime é só conveniência; reload manual continua funcionando.
      setCharacterDataSyncState("error");
    }
  }

  /** Jogador escolheu "Recarregar do servidor" — descarta a edição local pendente. */
  function handleAcceptRemoteCharacter() {
    if (!pendingRemoteCharacter) return;
    characterRef.current = pendingRemoteCharacter;
    lastSyncedCharacterRef.current = pendingRemoteCharacter;
    setCharacter(pendingRemoteCharacter);
    setPendingRemoteCharacter(null);
    setCharacterDataSyncState("synced");
  }

  /**
   * Jogador escolheu "Manter minha versão" — descarta o aviso; a edição
   * local permanece até o jogador salvar (o que então sobrescreve o
   * servidor com a versão local, de forma explícita e intencional).
   */
  function handleKeepLocalCharacter() {
    setPendingRemoteCharacter(null);
    setCharacterDataSyncState("synced");
  }

  // Checkpoint v0.46 — Realtime mínimo: assina o próprio `characterId`
  // em `characters` e refaz a leitura canônica quando o registro muda
  // (ex.: a mesa processou "Encerrar Rodada"/"Encerrar Cena"). Se
  // Realtime não estiver disponível, `characterSyncStatus` vira
  // "disabled"/"error" e a ficha continua funcionando só com reload.
  const characterSyncStatus = useCharacterRealtime(characterId, refetchCharacterFromRealtime);

  async function handleDelete(id: string) {
    setErrorMessage(null);
    try {
      await deleteCharacter(id);
      if (id === characterId) {
        setCharacterId(null);
        setSaveState("idle");
      }
      await refreshList();
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao apagar.");
    }
  }

  /**
   * Troca de mesa selecionada (aba Geral) — também recalcula
   * `alliesAtivos` para a mesa nova (ou limpa, se nenhuma mesa).
   */
  async function handleSelectCampaign(id: string | null) {
    setSelectedCampaignId(id);
    if (!id) {
      setAlliesAtivos([]);
      return;
    }
    refreshAlliesAtivos(id);
  }

  /**
   * Outros personagens ATIVOS na mesa (checkpoint pós-v0.71 — uso de
   * item em aliado). Fase 1: deixou de depender da antiga tabela de
   * perfis de mesa/`active_character_id` (perfil removido do backend) —
   * agora deriva
   * direto de `personagens`, a lista já carregada no estado (dev: lista
   * global via `listLegacyCharactersDev`), filtrando pela mesa
   * selecionada e excluindo o próprio personagem carregado. Sem I/O
   * extra — só recalcula em cima do que já está em memória.
   */
  function refreshAlliesAtivos(campaignId: string) {
    setAlliesAtivos(
      personagens
        .filter((p) => p.campaign_id === campaignId && p.id !== characterId)
        .map((p) => ({ id: p.id, nome: p.name, character: normalizeCharacter(p.payload) })),
    );
  }

  /** Botão "Recarregar personagem" (modo product) — refaz loadProductSession, útil se o narrador mudou algo no personagem durante a sessão (sem realtime). */
  async function handleLoadPersonagemAtivo() {
    if (mode === "product") {
      await loadProductSession();
    }
  }

  /**
   * Registra um evento de evolução (ganho/gasto de PM ou ajuste
   * permanente de atributo/perícia) em `table_logs`
   * (`type="character_evolution"`, `visibility="gm"` — evento
   * operacional de progressão, não mensagem de jogador) — best-effort,
   * mesmo padrão dos demais eventos.
   */
  async function persistEvolutionEvent(
    charAfter: Character,
    tipo: "ganho" | "gasto" | "ajuste",
    quantidade: number,
    descricao: string,
    antes?: number,
    depois?: number,
  ) {
    if (!selectedCampaignId) return;
    try {
      await addLog({
        campaignId: selectedCampaignId,
        characterId: characterId ?? undefined,
        type: "character_evolution",
        visibility: "gm",
        payload: {
          characterId,
          characterNome: charAfter.nome,
          tipo,
          quantidade,
          descricao,
          antes: antes ?? null,
          depois: depois ?? null,
          source: "character_sheet",
        },
      });
    } catch {
      avisarFalhaLogMesa();
      // Best-effort — mesma justificativa de handleAddCondition.
    }
  }

  /**
   * Publica na MESA uma rolagem feita no Console.
   *
   * O Console rolava só no log local (`addLogEntry`) — volátil, da
   * sessão da ficha, invisível pra todo mundo. Quem estava na mesa não
   * via a pessoa rolar Balística; o rolador 3D do VTT, sim, porque
   * chama `registrarRolagemPericiaAction`. Agora o Console chama a
   * MESMA ação: um vocabulário só de rolagem no `table_logs`, com o
   * mesmo payload que o feed já sabe desenhar.
   *
   * O servidor não confia nas faces: revalida a quantidade contra o
   * atributo LIDO DO BANCO e recalcula margem e total. Se a ficha
   * local estiver à frente do que foi gravado, a ação recusa — e o
   * aviso vai pro log local, sem tocar no que já aconteceu na tela.
   */
  async function publicarRolagemNaMesa(
    atributoId: string,
    periciaId: string | null,
    dados: number[],
    modificador: number,
    cd: number | null = null,
    // `public` continua sendo o padrão: uma rolagem disparada de um
    // atalho da ficha (sem painel aberto pra escolher) é da mesa.
    visibilidade: TableLogVisibility = "public",
    /** Ver `rolarTeste` em `_console/types.ts`. */
    intencao: { tipo: string; nome: string } | null = null,
  ) {
    if (!selectedCampaignId || !characterId) return; // ficha solta, sem mesa — nada a publicar
    try {
      const r = await registrarRolagemPericiaAction({
        campaignId: selectedCampaignId,
        characterId,
        atributoId,
        periciaId,
        modificador,
        cd,
        dados,
        visibilidade,
        intencao,
        origem: { rotulo: "Console do Personagem", source: "console_personagem" },
      });
      if (!r.ok) addLogEntry("recurso", `⚠ A rolagem não foi publicada na mesa: ${r.erro}`);
    } catch {
      avisarFalhaLogMesa();
    }
  }

  /**
   * Alteração permanente de atributo (Modo Evolução, checkpoint v0.40)
   * — recalcula os derivados máximos antes/depois e soma a MESMA
   * diferença nos recursos atuais correspondentes ("atuais sobem junto
   * na medida aplicável", PRD 4.2), registra no histórico de evolução
   * (`logPermanentAdjustment`) e loga (local + `table_logs`).
   */
  function updateAtributo(id: keyof CharacterAttributes, rawValue: number) {
    // Defesa em profundidade: o input já vem `disabled` em Modo Jogo
    // (não dispara onChange), mas o handler também recusa por garantia.
    if (sheetMode === "jogo") return;
    const def = regras?.atributos.find((a) => a.id === id);
    const min = def?.valor_minimo ?? 1;
    const max = def?.valor_maximo ?? 5;
    const antes = character.atributos[id];
    const depois = clamp(rawValue, min, max);
    if (depois === antes) return;

    const atributosNovos = { ...character.atributos, [id]: depois };
    const manaBonus = character.mana_bonus_ruptura ?? 0;
    const derivadosAntes = computeDerivedStats(character.atributos, regras, manaBonus, characterDerivedFormulas(character));
    const derivadosDepois = computeDerivedStats(atributosNovos, regras, manaBonus, characterDerivedFormulas(character));

    const RECURSO_MAX_MAP = {
      pv: "pv_max",
      pe: "pe_max",
      mana: "mana_max",
      integridade: "integridade_max",
    } as const satisfies Record<keyof CharacterResources & ("pv" | "pe" | "mana" | "integridade"), keyof DerivedStats>;

    const recursos_atuais: CharacterResources = { ...character.recursos_atuais };
    (Object.keys(RECURSO_MAX_MAP) as (keyof typeof RECURSO_MAX_MAP)[]).forEach((campo) => {
      const maxId = RECURSO_MAX_MAP[campo];
      const delta = derivadosDepois[maxId] - derivadosAntes[maxId];
      if (delta !== 0) {
        recursos_atuais[campo] = Math.max(0, (recursos_atuais[campo] ?? 0) + delta);
      }
    });

    const nowIso = new Date().toISOString();
    const nomeAtributo = def?.nome ?? id;
    const descricao = `${nomeAtributo}: ${antes} → ${depois}`;
    const proximo = logPermanentAdjustment(
      { ...character, atributos: atributosNovos, recursos_atuais },
      `atributo:${id}`,
      antes,
      depois,
      descricao,
      nowIso,
    );
    setCharacter(proximo);
    addLogEntry("recurso", `Evolução — ${descricao}.`);
    void persistEvolutionEvent(proximo, "ajuste", 0, descricao, antes, depois);
  }

  /** Alteração permanente de perícia (Modo Evolução) — mesma auditoria de `updateAtributo`, sem impacto em derivados. */
  function updatePericia(id: string, rawValue: number) {
    if (sheetMode === "jogo") return;
    const def = regras?.pericias.find((p) => p.id === id);
    const min = def?.valor_minimo ?? 0;
    // v1.2: o Modo Evolução só corrige a criação — nunca acima do limite do Ranking atual (o banco confere o mesmo).
    const rankingV12 = (character as { progressao?: { ranking?: RankingV12 } }).progressao?.ranking;
    const max = Math.min(def?.valor_maximo ?? 5, rankingV12 ? LIMITE_PERICIA_POR_RANKING_V12[rankingV12] : 5);
    const antes = character.pericias[id] ?? 0;
    const depois = clamp(rawValue, min, max);
    if (depois === antes) return;

    const nowIso = new Date().toISOString();
    const nomePericia = def?.nome ?? id;
    const descricao = `${nomePericia}: ${antes} → ${depois}`;
    const proximo = logPermanentAdjustment(
      { ...character, pericias: { ...character.pericias, [id]: depois } },
      `pericia:${id}`,
      antes,
      depois,
      descricao,
      nowIso,
    );
    setCharacter(proximo);
    addLogEntry("recurso", `Evolução — ${descricao}.`);
    void persistEvolutionEvent(proximo, "ajuste", 0, descricao, antes, depois);
  }

  /**
   * Efeitos colaterais de uma leva de remoção automática por cura
   * (checkpoint v0.34, PRD 9.3): Log local, aviso com "Desfazer"
   * (`autoHealBanner`) e registro best-effort em `table_logs`
   * (`condition_auto_removed`) — mesmo padrão de melhor-esforço já
   * usado por `handleAddCondition`/`handleRemoveCondition` (v0.32):
   * falha ao gravar no log persistente não desfaz a remoção já
   * aplicada no estado local.
   */
  async function handleAutoHealRemovals(removidas: ActiveCondition[], pvAnterior: number, pvNovo: number) {
    const nomes = removidas.map((c) => c.nome);
    addLogEntry("condicao", `Removida(s) automaticamente por cura (PV ${pvAnterior} → ${pvNovo}): ${nomes.join(", ")}.`);
    setAutoHealBanner({ ids: removidas.map((c) => c.id), nomes, pvAnterior, pvNovo });
    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "condition_auto_removed",
          visibility: "public",
          payload: {
            conditionLocalIds: removidas.map((c) => c.id),
            conditionIds: removidas.map((c) => c.conditionId),
            nomes,
            origem: "cura_pv",
            pvAnterior,
            pvNovo,
            characterId,
            characterNome: character.nome,
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — mesma justificativa de handleAddCondition.
      }
    }
  }

  /** Botão "Desfazer" do aviso de remoção automática — reativa só a última leva removida por cura. */
  async function handleUndoAutoHeal() {
    if (!autoHealBanner) return;
    const banner = autoHealBanner;
    setCharacter((prev) => ({
      ...prev,
      condicoes_ativas: undoAutoHealRemoval(prev.condicoes_ativas ?? [], banner.ids),
    }));
    addLogEntry("condicao", `Desfeita remoção automática por cura: ${banner.nomes.join(", ")} reativada(s).`);
    setAutoHealBanner(null);
    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "condition_auto_removal_undone",
          visibility: "public",
          payload: {
            conditionLocalIds: banner.ids,
            nomes: banner.nomes,
            pvAnterior: banner.pvAnterior,
            pvNovo: banner.pvNovo,
            characterId,
            characterNome: character.nome,
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — mesma justificativa de handleAddCondition.
      }
    }
  }

  /**
   * Registra um descanso (curto/longo) no Log local e em `table_logs`
   * (checkpoint v0.36) — mesmo padrão best-effort dos demais eventos.
   */
  async function persistRest(
    tipo: "rest_short" | "rest_long",
    result: { before: unknown; after: unknown; diff: unknown; effectsApplied: string[]; warnings: string[] },
  ) {
    if (!selectedCampaignId) return;
    try {
      await addLog({
        campaignId: selectedCampaignId,
        characterId: characterId ?? undefined,
        type: tipo,
        visibility: "public",
        payload: {
          characterId,
          characterNome: character.nome,
          before: result.before,
          after: result.after,
          diff: result.diff,
          effectsApplied: result.effectsApplied,
          warnings: result.warnings,
          source: "character_sheet",
        },
      });
    } catch {
      avisarFalhaLogMesa();
      // Best-effort — mesma justificativa de handleAddCondition.
    }
  }

  /** Botão "Aplicar descanso curto" (checkpoint v0.36, PRD 10.4) — Mana += floor(manaMax/2), nada mais. */
  async function handleApplyShortRest() {
    const nowIso = new Date().toISOString();
    const result = applyShortRest(characterRef.current, derivados, nowIso);
    characterRef.current = result.character;
    setCharacter(result.character);
    addLogEntry("descanso", `Descanso curto — Mana ${result.before.mana} → ${result.after.mana}.`);
    await persistRest("rest_short", result);
  }

  /**
   * Botão "Aplicar descanso longo" — pede confirmação (item 6 do
   * pedido), aplica PV/PE/Mana/temporários/Sobrecarga via
   * `applyLongRest`, e reaproveita `applyAutoHealRemoval` (v0.34)
   * exatamente como `updateRecursoAtual`/`handleRestoreRecursosMax`
   * já fazem — se o PV aumentou, Contundido/Envenenado/Sangrando
   * ativos podem ser removidos automaticamente pelo mesmo mecanismo,
   * sem duplicar a lógica de cura aqui.
   */
  async function handleApplyLongRest(opcoes?: { jaConfirmado?: boolean }) {
    // O Console confirma no próprio menu de descanso; a ficha antiga, aqui.
    const confirmado = opcoes?.jaConfirmado === true || window.confirm(
      "Aplicar descanso longo (8h)? PV recupera Corpo+2, PE recupera Mente+2, Mana volta ao máximo, PV/Mana temporários são removidos e Sobrecarga é resetada. Integridade NÃO é recuperada.",
    );
    if (!confirmado) return;

    const nowIso = new Date().toISOString();
    const result = applyLongRest(characterRef.current, derivados, nowIso);
    const { condicoes: proximasCondicoes, removidas } = applyAutoHealRemoval(
      result.character.condicoes_ativas ?? [],
      result.before.pv,
      result.after.pv,
      nowIso,
    );

    const proximo = { ...result.character, condicoes_ativas: proximasCondicoes };
    characterRef.current = proximo;
    setCharacter(proximo);
    addLogEntry(
      "descanso",
      `Descanso longo — PV ${result.before.pv} → ${result.after.pv}, PE ${result.before.pe} → ${result.after.pe}, Mana ${result.before.mana} → ${result.after.mana}.`,
    );
    await persistRest("rest_long", result);
    if (removidas.length > 0) void handleAutoHealRemovals(removidas, result.before.pv, result.after.pv);
  }

  /**
   * Botão "Usar surto" (checkpoint v0.37; data-driven pela regra
   * canônica `regras_personagem.sobrecarga` no pós-v0.65) — dado do dano
   * psíquico, máximo de cargas/dia e teste do 3º surto vêm da regra
   * (fallbacks idênticos ao PRD). Sem sobrecarga suficiente, bloqueia
   * sem mudar nada. Loga `overload_surge_used` (canônico) na mesa.
   */
  /** Desfaz o último surto do dia — correção manual do contador. */
  async function handleRemoveOverloadSurge() {
    const current = characterRef.current;
    const antes = current.sobrecarga_usada_dia ?? 0;
    if (antes <= 0) return;
    const next = { ...current, sobrecarga_usada_dia: antes - 1 };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Sobrecarga: ${antes} → ${antes - 1} (surto removido).`);
    await persistAutomatedActionExecution(next);
  }

  async function handleUseOverloadSurge(tipo: string, danoRolado?: number) {
    const nowIso = new Date().toISOString();
    const sobrecargaAntes = character.sobrecarga_usada_dia ?? 0;
    const overloadRules = regras?.sobrecarga;
    const maxSurtos = getOverloadMaxPerDay(overloadRules);
    const result = useOverloadSurge(characterRef.current, tipo, nowIso, undefined, overloadRules, undefined, danoRolado);

    if (!result.surge) {
      addLogEntry("recurso", result.warnings[0] ?? "Limite de surtos de Sobrecarga atingido.");
      return;
    }

    // Dano psíquico do surto vai direto em PE (cap. 16 da 1.2: "dano
    // psíquico … causado por Sobrecargas … reduz os PE"), pelo mesmo
    // caminho da edição de recurso — piso negativo, perda de
    // Integridade e Colapso inclusos.
    const peAntes = result.character.recursos_atuais?.pe ?? 0;
    const peDepois = parseRecursoAtual(peAntes - result.surge.danoPsiquico, pisoPeNegativo(derivados.pe_max));
    const comDano = applyConsoleMutation(
      result.character,
      { type: "resource", resource: "pe", value: peDepois, nowIso },
      { derived: derivados, rules: regras, reactionRules },
    );
    characterRef.current = comDano.character;
    setCharacter(comDano.character);
    if (comDano.meta.collapseStarted) {
      addLogEntry("recurso", "Colapso iniciado (PE no limite) — Inconsciente aplicado.");
      void persistCollapseEvent("collapse_started", { tipo: comDano.meta.collapseStarted });
    }
    const dado = getOverloadSurgeDamageDie(overloadRules);
    addLogEntry(
      "recurso",
      `Surto de Sobrecarga (${tipo}) — ${result.surge.indice}/${maxSurtos}, dano psíquico ${result.surge.danoPsiquico} (${dado}) — PE ${peAntes} → ${peDepois}.`,
    );
    if (result.requiresWillRoll) {
      const willRule = getOverloadWillTestRule(overloadRules);
      addLogEntry("condicao", `Ruptura pendente (${result.surge.indice}º surto) — role ${willRule.pericia} CD ${willRule.cd}.`);
      setOverloadWillRollPending(true);
    }

    await persistAutomatedActionExecution(comDano.character);

    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "overload_surge_used",
          visibility: "public",
          payload: {
            characterId,
            characterNome: character.nome,
            tipo,
            indice: result.surge.indice,
            maxSurtos,
            danoPsiquico: result.surge.danoPsiquico,
            danoDado: dado,
            sobrecargaAntes,
            peAntes,
            peDepois,
            sobrecargaDepois: result.surge.indice,
            rupturaPendente: result.rupturePending,
            requiresWillRoll: result.requiresWillRoll,
            reminders: result.warnings,
            source: "character_sheet",
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — mesma justificativa de handleAddCondition.
      }
    }
  }

  /** Rolagem do teste do 3º surto (perícia/CD da regra canônica; fallback Vontade CD 7) — falha aplica Atordoado via sistema de condições. */
  async function handleRollOverloadWillTest() {
    const willRule = getOverloadWillTestRule(regras?.sobrecarga);
    const periciaDef = regras?.pericias.find((p) => p.id === willRule.pericia);
    const atributoId = (periciaDef?.atributo_primario as "corpo" | "mente" | "animo" | undefined) ?? "animo";
    const atributoDef = regras?.atributos.find((a) => a.id === atributoId);

    const resultado = rollPericia({
      atributoId,
      atributoNome: atributoDef?.nome ?? atributoId,
      atributoValor: character.atributos[atributoId],
      periciaId: willRule.pericia,
      periciaNome: periciaDef?.nome ?? willRule.pericia,
      periciaValor: character.pericias[willRule.pericia] ?? 0,
      modificador: 0,
      cd: willRule.cd,
    });
    const sucesso = resultado.sucesso ?? false;

    addLogEntry(
      "recurso",
      `Teste de ${periciaDef?.nome ?? willRule.pericia} CD ${willRule.cd} (Sobrecarga): total ${resultado.total} — ${sucesso ? "Sucesso" : "Falha"}.`,
    );
    setOverloadWillRollPending(false);

    if (!sucesso) {
      const nowIso = new Date().toISOString();
      setCharacter((prev) => ({
        ...prev,
        condicoes_ativas: applyStunFromFailedWillTest(prev.condicoes_ativas ?? [], nowIso),
      }));
      addLogEntry("condicao", "Atordoado aplicado (falha no teste de Vontade CD 7 da Sobrecarga).");
    }

    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "overload_will_roll",
          visibility: "public",
          payload: {
            characterId,
            characterNome: character.nome,
            total: resultado.total,
            cd: getOverloadWillTestRule(regras?.sobrecarga).cd,
            sucesso,
            source: "character_sheet",
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — mesma justificativa de handleAddCondition.
      }
    }
  }

  /**
   * Registra collapse_started/collapse_ended no Log local e em
   * `table_logs` (checkpoint v0.38) — mesmo padrão best-effort dos
   * demais eventos.
   */
  async function persistCollapseEvent(
    tipo: "collapse_started" | "collapse_advanced" | "collapse_stabilized" | "collapse_ended",
    extra: Record<string, unknown>,
  ) {
    if (!selectedCampaignId) return;
    try {
      await addLog({
        campaignId: selectedCampaignId,
        characterId: characterId ?? undefined,
        type: tipo,
        visibility: "public",
        payload: {
          characterId,
          characterNome: character.nome,
          source: "character_sheet",
          ...extra,
        },
      });
    } catch {
      avisarFalhaLogMesa();
      // Best-effort — mesma justificativa de handleAddCondition.
    }
  }

  /**
   * Aplica os efeitos colaterais de uma mudança de PV/PE em conjunto —
   * remoção automática por cura (v0.34, só PV), detecção de Colapso
   * (v0.38, PV e PE) e avanço por "dano adicional da mesma dimensão"
   * (checkpoint v0.52, quando a edição é uma REDUÇÃO e o personagem já
   * estava em Colapso NAQUELE recurso ANTES desta mudança — nunca no
   * mesmo evento que inicia o Colapso) — sobre um `Character` base,
   * devolvendo o `Character` final e o que aconteceu, para o chamador
   * decidir log/persistência. Não faz nenhum `setCharacter` sozinho.
   */
  function applyPvPeSideEffects(
    base: Character,
    beforePvPe: { pv: number; pe: number },
    afterPvPe: { pv: number; pe: number },
    nowIso: string,
  ) {
    const { condicoes: condsAposCura, removidas } = applyAutoHealRemoval(
      base.condicoes_ativas ?? [],
      beforePvPe.pv,
      afterPvPe.pv,
      nowIso,
    );
    const baseAposCura: Character = { ...base, condicoes_ativas: condsAposCura };
    const colapso = detectCollapseOnResourceChange(
      baseAposCura,
      beforePvPe,
      afterPvPe,
      nowIso,
      pisoPeNegativo(derivados.pe_max),
    );

    let finalCharacter = colapso.character;
    let collapseAdvance: ReturnType<typeof resolveCollapseAdditionalDamage> | null = null;
    if (!colapso.started && !colapso.ended) {
      const pvDelta = beforePvPe.pv - afterPvPe.pv;
      const peDelta = beforePvPe.pe - afterPvPe.pe;
      const resource: "pv" | "pe" | null = pvDelta > 0 ? "pv" : peDelta > 0 ? "pe" : null;
      if (resource) {
        collapseAdvance = resolveCollapseAdditionalDamage({
          character: finalCharacter,
          resource,
          damageAmount: resource === "pv" ? pvDelta : peDelta,
          rules: regras?.colapso,
          round: finalCharacter.current_round,
          scene: finalCharacter.current_scene,
          nowIso,
        });
        finalCharacter = collapseAdvance.character;
      }
    }

    return { character: finalCharacter, removidasPorCura: removidas, colapso, collapseAdvance };
  }

  /**
   * Edição manual de recursos atuais (PV/PE/Mana/Integridade). Aceita
   * só inteiro >= 0; não trava no máximo de propósito — combate/dano
   * fica para depois, aqui é só edição livre com aviso visual.
   *
   * PV/PE (checkpoints v0.34 e v0.38): qualquer mudança nesses dois
   * campos passa por `applyPvPeSideEffects` — cura automática de
   * condição (só PV) e detecção de início/fim de Colapso (PV ou PE) —
   * tudo combinado num único `setCharacter`, para nunca existir um
   * estado intermediário inconsistente.
   */
  function updateRecursoAtual(id: keyof CharacterResources, rawValue: number, opcoes?: { confirmarRetorno?: boolean }) {
    const anterior = character.recursos_atuais?.[id] ?? 0;
    const novo = parseRecursoAtual(rawValue, id === "pe" ? pisoPeNegativo(derivados.pe_max) : 0);

    if (id === "pv" || id === "pe" || id === "mana") {
      const nowIso = new Date().toISOString();
      const beforePvPe = { pv: character.recursos_atuais?.pv ?? 0, pe: character.recursos_atuais?.pe ?? 0 };
      const result = applyConsoleMutation(
        character,
        { type: "resource", resource: id, value: novo, nowIso },
        { derived: derivados, rules: regras, reactionRules },
      );

      const retornoConfirmado = opcoes?.confirmarRetorno === true && (
        id === "pv" && character.colapso?.desfecho === "morte" && novo >= 1
        || id === "pe" && character.colapso?.desfecho === "coma" && novo >= pisoPeNegativo(derivados.pe_max) + 1
      );
      const finalCharacter = retornoConfirmado
        ? confirmReturnAfterCollapseOutcome(result.character, nowIso)
        : result.character;
      characterRef.current = finalCharacter;
      setCharacter(finalCharacter);
      if (novo !== anterior) {
        addLogEntry("recurso", `${RECURSO_LABELS[id]}: ${anterior} → ${novo}`);
      }
      if ((result.meta.autoRemovedConditions?.length ?? 0) > 0) {
        void handleAutoHealRemovals(result.meta.autoRemovedConditions ?? [], beforePvPe.pv, id === "pv" ? novo : beforePvPe.pv);
      }
      if (result.meta.collapseStarted) {
        addLogEntry("recurso", `Colapso iniciado (${result.meta.collapseStarted === "pv" ? "PV" : "PE"} a 0) — Inconsciente aplicado.`);
        void persistCollapseEvent("collapse_started", { tipo: result.meta.collapseStarted });
      }
      if (result.meta.collapseEnded) {
        addLogEntry("recurso", `Colapso encerrado por cura — cicatriz pendente.`);
        void persistCollapseEvent("collapse_ended", { tipo: result.meta.collapseEnded, motivo: "cura" });
      }
      if (retornoConfirmado) {
        addLogEntry("recurso", `${character.colapso?.desfecho === "morte" ? "Morte" : "Coma"} encerrado por retorno confirmado — personagem volta à atividade; cicatriz pendente.`);
        void persistCollapseEvent("collapse_ended", { tipo: id, motivo: "retorno_confirmado", desfechoAnterior: character.colapso?.desfecho });
      }
      if ((result.meta.collapseAdvanceLogs?.length ?? 0) > 0) {
        for (const line of result.meta.collapseAdvanceLogs ?? []) addLogEntry("recurso", line);
        void persistCollapseEvent("collapse_advanced", { tipo: id, motivo: "dano_adicional", outcome: result.meta.collapseAdvanceOutcome });
      }
      return;
    }

    setCharacter((prev) => ({
      ...prev,
      recursos_atuais: { ...prev.recursos_atuais, [id]: novo },
    }));
    if (novo !== anterior) {
      addLogEntry("recurso", `${RECURSO_LABELS[id]}: ${anterior} → ${novo}`);
    }
  }

  function handleRestoreRecursosMax() {
    const pvAnterior = character.recursos_atuais?.pv ?? 0;
    const peAnterior = character.recursos_atuais?.pe ?? 0;
    const pvNovo = derivados.pv_max;
    const peNovo = derivados.pe_max;
    const nowIso = new Date().toISOString();
    const { character: charComEfeitos, removidasPorCura: removidas, colapso } = applyPvPeSideEffects(
      character,
      { pv: pvAnterior, pe: peAnterior },
      { pv: pvNovo, pe: peNovo },
      nowIso,
    );

    setCharacter({
      ...charComEfeitos,
      recursos_atuais: {
        pv: pvNovo,
        pe: peNovo,
        mana: derivados.mana_max,
        integridade: derivados.integridade_max,
      },
    });
    addLogEntry(
      "recurso",
      `Restaurados ao máximo — PV ${derivados.pv_max}, PE ${derivados.pe_max}, Mana ${derivados.mana_max}, Integridade ${derivados.integridade_max}`,
    );
    if (removidas.length > 0) void handleAutoHealRemovals(removidas, pvAnterior, pvNovo);
    if (colapso.ended) {
      addLogEntry("recurso", `Colapso encerrado por cura — cicatriz pendente.`);
      void persistCollapseEvent("collapse_ended", { tipo: colapso.tipo, motivo: "cura" });
    }
  }

  /** Botão "Estabilizar Colapso" — interrompe avanço de segmento, NUNCA cura nem remove Inconsciente (regra explícita do PRD). */
  function handleStabilizeCollapse() {
    const nowIso = new Date().toISOString();
    setCharacter((prev) => stabilizeCollapse(prev, nowIso));
    addLogEntry("recurso", "Colapso estabilizado — avanço de segmento interrompido (não cura).");
    void persistCollapseEvent("collapse_stabilized", { tipo: character.colapso?.tipo ?? null });
  }

  /** Botão "Avançar segmento manualmente" — sem fim de rodada automático ainda (checkpoint v0.38). */
  function handleAdvanceCollapseSegmentManual() {
    const nowIso = new Date().toISOString();
    const result = advanceCollapseSegment(character, "manual", nowIso);
    setCharacter(result.character);
    addLogEntry("recurso", `Colapso — segmento avançado manualmente: ${result.segmentos}/${MAX_COLLAPSE_SEGMENTS}.`);
    void persistCollapseEvent("collapse_advanced", { segmentos: result.segmentos, motivo: "manual", tipo: character.colapso?.tipo ?? null });
  }

  /** Atalho do Console em 3/3 — resolve só o teste decisivo, sem encerrar a rodada. */
  async function handleResolveCollapseDecisiveTest(dados: number[]) {
    const current = characterRef.current;
    if (!current.colapso?.ativo || current.colapso.estabilizado || current.colapso.segmentos < MAX_COLLAPSE_SEGMENTS) return;

    const result = resolveCollapseEndRound({
      character: current,
      rules: regras?.colapso,
      round: current.current_round ?? 1,
      scene: current.current_scene ?? 1,
      nowIso: new Date().toISOString(),
      dados,
    });

    characterRef.current = result.character;
    setCharacter(result.character);
    for (const line of result.logs) addLogEntry("recurso", line);
    for (const warning of result.warnings) addLogEntry("recurso", `⚠ ${warning}`);

    if (selectedCampaignId) {
      for (const entry of result.tableLogs) {
        try {
          await addLog({
            campaignId: selectedCampaignId,
            characterId: characterId ?? undefined,
            type: entry.type,
            visibility: "public",
            payload: { ...entry.payload, characterId, characterNome: current.nome },
          });
        } catch {
          avisarFalhaLogMesa();
        }
      }
    }
  }

  /**
   * Botões "Teste de Colapso — Corpo/Mente CD 7" — rola sem perícia
   * (só o atributo puro, como pede o PRD 10.7: "teste simples de
   * Corpo/Mente"); resultado abaixo de 7 avança 1 segmento.
   */
  function handleRollCollapseTest(atributoId: "corpo" | "mente") {
    const atributoDef = regras?.atributos.find((a) => a.id === atributoId);
    const resultado = rollPericia({
      atributoId,
      atributoNome: atributoDef?.nome ?? atributoId,
      atributoValor: character.atributos[atributoId],
      modificador: 0,
      cd: 7,
    });
    const nowIso = new Date().toISOString();
    addLogEntry(
      "recurso",
      `Teste de Colapso — ${atributoDef?.nome ?? atributoId} CD 7: total ${resultado.total} — ${resultado.sucesso ? "mantém" : "avança segmento"}.`,
    );
    if (!resultado.sucesso) {
      const result = advanceCollapseSegment(character, `teste_${atributoId}`, nowIso);
      setCharacter(result.character);
      void persistCollapseEvent("collapse_advanced", { segmentos: result.segmentos, motivo: `teste_${atributoId}`, total: resultado.total, tipo: character.colapso?.tipo ?? null });
    }
  }

  /**
   * Contadores de turno (PA gastos / reações usadas). Estado
   * operacional, não progressão — por isso editável em Modo Jogo E
   * Modo Evolução (sem guard de sheetMode, ao contrário de
   * updateAtributo/updatePericia). Nunca negativo; sem teto — se passar
   * do máximo, a UI mostra aviso discreto, não bloqueia.
   */
  function adjustEstadoJogo(key: keyof Pick<CharacterGameState, "pa_gastos" | "reacoes_usadas">, delta: number) {
    const anterior = character.estado_jogo?.[key] ?? 0;
    const novo = Math.max(0, Math.trunc(anterior + delta));
    setCharacter((prev) => {
      const atual = prev.estado_jogo?.[key] ?? 0;
      const novoPrev = Math.max(0, Math.trunc(atual + delta));
      return { ...prev, estado_jogo: { ...prev.estado_jogo, [key]: novoPrev } };
    });
    if (novo !== anterior) {
      const tipo: LogTipo = key === "pa_gastos" ? "pa" : "reacao";
      const label = key === "pa_gastos" ? "PA gastos" : "Reações usadas";
      addLogEntry(tipo, `${label}: ${anterior} → ${novo}`);
    }
  }

  /** Mesmo redutor puro consumido pelo HUD; esta camada só mantém o log local da ficha. */
  function ajustarPaConsole(delta: number) {
    const current = characterRef.current;
    const before = current.estado_jogo?.pa_gastos ?? 0;
    const result = applyConsoleMutation(
      current,
      { type: "pa", delta },
      { derived: derivados, rules: regras, reactionRules },
    );
    const after = result.character.estado_jogo?.pa_gastos ?? 0;
    characterRef.current = result.character;
    setCharacter(result.character);
    if (after !== before) addLogEntry("pa", `PA gastos: ${before} → ${after}`);
  }

  /**
   * Ajusta Reações (delta negativo = recuperar) e, quando recupera com
   * penalidade cumulativa de "defesa sem Reação" ainda ativa da rodada
   * (`defesas_sem_reacao`), zera essa penalidade junto — ela só faz
   * sentido enquanto a Reação segue indisponível; assim que volta, a
   * próxima defesa já pode gastar Reação de novo, sem carregar
   * penalidade de antes. Fora esse caso, comportamento idêntico a
   * `adjustEstadoJogo("reacoes_usadas", delta)`.
   */
  function ajustarReacoesConsole(delta: number) {
    const current = characterRef.current;
    const usedBefore = current.estado_jogo?.reacoes_usadas ?? 0;
    const overflowBefore = current.estado_jogo?.defesas_sem_reacao ?? 0;
    const result = applyConsoleMutation(
      current,
      { type: "reactions", delta },
      { derived: derivados, rules: regras, reactionRules },
    );
    const usedAfter = result.character.estado_jogo?.reacoes_usadas ?? 0;
    const overflowAfter = result.character.estado_jogo?.defesas_sem_reacao ?? 0;
    characterRef.current = result.character;
    setCharacter(result.character);
    if (usedAfter !== usedBefore || overflowAfter !== overflowBefore) {
      addLogEntry(
        "reacao",
        `Reações usadas: ${usedBefore} → ${usedAfter}${overflowAfter !== overflowBefore ? `; defesas sem Reação zeradas (${overflowBefore} → ${overflowAfter})` : ""}.`,
      );
    }
  }

  function resetEstadoJogo(key: keyof Pick<CharacterGameState, "pa_gastos" | "reacoes_usadas">) {
    const anterior = character.estado_jogo?.[key] ?? 0;
    setCharacter((prev) => ({ ...prev, estado_jogo: { ...prev.estado_jogo, [key]: 0 } }));
    if (anterior !== 0) {
      const tipo: LogTipo = key === "pa_gastos" ? "pa" : "reacao";
      const label = key === "pa_gastos" ? "PA gastos" : "Reações usadas";
      addLogEntry(tipo, `${label} resetado: ${anterior} → 0`);
    }
  }

  /** Controle manual de Reação usa a mesma regra data-driven do Console. */
  function handleUseReactionManual() {
    const current = characterRef.current;
    const result = spendReactionForDefense(
      current,
      derivados.reacoes_por_rodada,
      reactionRules,
    );
    if (result.character === current) {
      if (result.warnings[0]) addLogEntry("reacao", result.warnings[0]);
      return;
    }
    characterRef.current = result.character;
    setCharacter(result.character);
    if (result.defenseWithoutReaction) {
      addLogEntry(
        "reacao",
        `Defesa sem Reação: ${result.defensesWithoutReactionBefore} → ${result.defensesWithoutReactionAfter}; penalidade ${result.penaltyApplied}.`,
      );
    } else {
      addLogEntry(
        "reacao",
        `Reações usadas: ${current.estado_jogo?.reacoes_usadas ?? 0} → ${result.character.estado_jogo?.reacoes_usadas ?? 0}.`,
      );
    }
  }

  function handleUndoReactionManual() {
    const current = characterRef.current;
    const overflowBefore = current.estado_jogo?.defesas_sem_reacao ?? 0;
    const usedBefore = current.estado_jogo?.reacoes_usadas ?? 0;
    const next = undoLastReactionUse(current);
    if (next.estado_jogo?.defesas_sem_reacao === overflowBefore && next.estado_jogo?.reacoes_usadas === usedBefore) {
      return;
    }
    characterRef.current = next;
    setCharacter(next);
    if (overflowBefore > 0) {
      addLogEntry(
        "reacao",
        `Defesa sem Reação desfeita: ${overflowBefore} → ${next.estado_jogo?.defesas_sem_reacao ?? 0}.`,
      );
    } else {
      addLogEntry(
        "reacao",
        `Reações usadas: ${usedBefore} → ${next.estado_jogo?.reacoes_usadas ?? 0}.`,
      );
    }
  }

  function handleResetReactions() {
    const current = characterRef.current;
    const usedBefore = current.estado_jogo?.reacoes_usadas ?? 0;
    const overflowBefore = current.estado_jogo?.defesas_sem_reacao ?? 0;
    if (usedBefore === 0 && overflowBefore === 0) return;
    const next = resetRoundReactionState(current);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry(
      "reacao",
      `Reações resetadas: usadas ${usedBefore} → 0; defesas sem Reação ${overflowBefore} → 0.`,
    );
  }

  /**
   * "Encerrar Rodada" (checkpoint v0.44) — ordem operacional:
   *   1. Resolve efeitos de fim de rodada das condições ativas na
   *      rodada ATUAL (dano determinístico + pendências de teste) via
   *      `resolveEndRoundConditionsForCharacter` (endRoundConditions.ts,
   *      data-driven a partir de `conditionContents`).
   *   2. Avança para a nova rodada: reseta PA (`pa_gastos=0`) e
   *      Reações/penalidade de defesa sem Reação
   *      (`resetRoundReactionState`, v0.43).
   *   3. Aplica redução de PA por condição (Envenenado) já na rodada
   *      nova, via `applyRoundScopedPaReductions`.
   *   4. Incrementa `current_round`.
   * `current_round`/`current_scene` são LOCAIS ao personagem — não
   * ligados à rodada/cena da mesa (`campaigns.current_round`, v0.39)
   * neste checkpoint (ver pendência do relatório).
   */
  async function handleEndRoundForCharacter() {
    const current = characterRef.current;
    const round = current.current_round ?? 1;
    const scene = current.current_scene ?? 1;
    const nowIso = new Date().toISOString();

    // Colapso (checkpoint v0.51): teste/avanço/desfecho de fim de rodada
    // ANTES das condições, a partir da regra canônica `regras.colapso`
    // (mesma ordem de `endRound.ts` da mesa). Um colapso iniciado pelo
    // dano de condição desta rodada só é testado na próxima.
    const collapseResult = resolveCollapseEndRound({
      character: current,
      rules: regras?.colapso,
      round,
      scene,
      nowIso,
    });

    const resolved = resolveEndRoundConditionsForCharacter({
      character: collapseResult.character,
      conditions: conditionContents,
      round,
      scene,
      nowIso,
      collapseRules: regras?.colapso,
    });

    let nextCharacter = resolved.character;
    nextCharacter = { ...nextCharacter, estado_jogo: { ...nextCharacter.estado_jogo, pa_gastos: 0 } };
    nextCharacter = resetRoundReactionState(nextCharacter);

    const paReduction = applyRoundScopedPaReductions({
      character: nextCharacter,
      conditions: conditionContents,
      paMax: derivados.pa_max,
      round: round + 1,
      scene,
    });
    // Efeitos temporários com duração por rodadas (checkpoint pós-v0.71) — reduz 1 rodada e expira os que zeram.
    const tick = tickRoundTemporaryEffects(paReduction.character, nowIso);
    nextCharacter = { ...tick.character, current_round: round + 1 };

    characterRef.current = nextCharacter;
    setCharacter(nextCharacter);

    const tempLogs: string[] = [
      ...tick.ticked.map((e) => `Efeito temporário "${e.name}": ${e.remainingRounds} rodada(s) restante(s).`),
      ...tick.expired.map((e) => `Efeito temporário "${e.name}" expirou (duração por rodadas).`),
    ];
    const allLogs = [...collapseResult.logs, ...resolved.logs, ...paReduction.logs, ...tempLogs];
    setEndRoundSummary({ logs: allLogs, warnings: [...collapseResult.warnings, ...resolved.warnings] });
    addLogEntry(
      "rodada",
      `Rodada ${round} encerrada → rodada ${round + 1} iniciada.${allLogs.length > 0 ? " " + allLogs.join(" ") : ""}`,
    );

    // Efeitos temporários expirados por rodada geram log persistente (checkpoint pós-v0.71).
    const tempExpiryTableLogs = tick.expired.map((e) => ({
      type: "temporary_effect_expired",
      payload: {
        effectId: e.id,
        effectName: e.name,
        sourceType: e.sourceType,
        sourceName: e.sourceName,
        durationType: e.durationType,
        remainingRounds: 0,
        stacks: e.stacks ?? 1,
        modifiers: e.modifiers ?? [],
        reason: "Duração por rodadas chegou a 0 no fim da rodada.",
        source: "temporary_effect",
      },
    }));
    const allTableLogs = [...collapseResult.tableLogs, ...resolved.tableLogs, ...paReduction.tableLogs, ...tempExpiryTableLogs];
    if (selectedCampaignId) {
      for (const entry of allTableLogs) {
        try {
          await addLog({
            campaignId: selectedCampaignId,
            characterId: characterId ?? undefined,
            type: entry.type,
            visibility: "public",
            payload: { ...entry.payload, characterId, characterNome: current.nome },
          });
        } catch {
          avisarFalhaLogMesa();
          // Best-effort — os efeitos já foram aplicados no estado local.
        }
      }
    }
  }

  /**
   * Resolve manualmente uma pendência de teste de resistência
   * (checkpoint v0.44, "Marcar sucesso"/"Marcar falha") — nunca rola
   * automático; a consequência vem inteiramente de
   * `resolveConditionResistanceCheck` (endRoundConditions.ts).
   */
  async function handleResolveConditionCheck(checkId: string, outcome: "success" | "failure") {
    const current = characterRef.current;
    const check = (current.pending_condition_checks ?? []).find((c) => c.id === checkId);
    if (!check) return;
    const nowIso = new Date().toISOString();
    const result = resolveConditionResistanceCheck({
      character: current,
      check,
      outcome,
      conditions: conditionContents,
      nowIso,
      collapseRules: regras?.colapso,
    });
    characterRef.current = result.character;
    setCharacter(result.character);
    for (const line of result.logs) addLogEntry("condicao", line);
    for (const warning of result.warnings) addLogEntry("condicao", `⚠ ${warning}`);

    if (selectedCampaignId) {
      for (const entry of result.tableLogs) {
        try {
          await addLog({
            campaignId: selectedCampaignId,
            characterId: characterId ?? undefined,
            type: entry.type,
            visibility: "public",
            payload: { ...entry.payload, characterId, characterNome: current.nome },
          });
        } catch {
          avisarFalhaLogMesa();
          // Best-effort — a resolução já foi aplicada no estado local.
        }
      }
    }
  }

  /**
   * Preenche Marca/Traço de uma pendência de Ruptura (checkpoint
   * v0.45, "Salvar Marca e Traço") — texto livre, nunca obrigatório.
   * Registra log local e `table_log` best-effort (mesmo padrão dos
   * demais handlers), preservando histórico (a pendência vira
   * `status: "resolved"`, nunca é removida do array).
   */
  async function handleResolveRuptureChoice(choiceId: string, marca: string, traco: string) {
    const current = characterRef.current;
    const nowIso = new Date().toISOString();
    const next = resolvePendingRuptureChoice(current, choiceId, marca, traco, nowIso);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("ruptura", `Marca e Traço registrados: ${marca.trim() || "(sem marca)"} / ${traco.trim() || "(sem traço)"}.`);

    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "rupture_choice_resolved",
          visibility: "public",
          payload: {
            characterId,
            characterNome: current.nome,
            pendingChoiceId: choiceId,
            marca: marca.trim() || null,
            traco: traco.trim() || null,
            resolvedAt: nowIso,
            source: "character_sheet",
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — a resolução já foi aplicada no estado local.
      }
    }
  }

  /**
   * Comprar item na loja (aba Inventário, checkpoint v0.49) — desconta
   * a carteira escolhida e cria a instância no inventário
   * (`purchaseItem`, `lib/character/inventory.ts`). Sem fundos
   * suficientes, não muda nada e só avisa no log local.
   */
  function handleBuyItem(itemSlug: string, quantidade: number, walletId: WalletId, precoUnitario: number) {
    const current = characterRef.current;
    const item = catalogoItens.get(itemSlug);
    if (!item) return;
    const result = purchaseItem({ character: current, item, quantidade, walletId, precoUnitario, nowIso: new Date().toISOString(), catalog: [...catalogoItens.values()] });
    if (!result.ok) {
      addLogEntry("recurso", result.reason ?? "Compra não realizada.");
      return;
    }
    characterRef.current = result.character;
    setCharacter(result.character);
    addLogEntry("recurso", `Comprado: ${item.nome} x${quantidade} — ${result.totalCost} (${result.walletBefore} → ${result.walletAfter}).`);
  }

  /** Mercador › Caderneta de Dívida — marca uma dívida como quitada manualmente (o pagamento em si é narrativo). */
  function handleQuitarDivida(dividaId: string) {
    const current = characterRef.current;
    const dividas = current.dividas_mercador ?? [];
    const divida = dividas.find((d) => d.id === dividaId);
    if (!divida || divida.quitada) return;
    const nowIso = new Date().toISOString();
    const next = {
      ...current,
      dividas_mercador: dividas.map((d) => (d.id === dividaId ? { ...d, quitada: true, quitadaEm: nowIso } : d)),
    };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Dívida quitada: ${divida.itemNome} (${divida.saldoDevido} a ${divida.fornecedor}).`);
  }

  function handleChangeCarteira(walletId: WalletId, value: number) {
    const current = characterRef.current;
    const carteira = current.carteira ?? { aretz_informal: 0, cdi: 0, cdi_craqueada: 0 };
    const next = { ...current, carteira: { ...carteira, [walletId]: Number.isFinite(value) ? value : 0 } };
    characterRef.current = next;
    setCharacter(next);
  }

  function handleSetItemEstado(instanceId: string, estado: ItemLoadoutState) {
    const current = characterRef.current;
    const next = setItemLoadoutState(current, instanceId, estado);
    characterRef.current = next;
    setCharacter(next);
  }

  /** Aplica dano a um escudo consumindo o PD temporário (Toque de Midas) antes do PD-base — fluxo real de teste. */
  function handleApplyShieldDamage(instanceId: string, amount: number) {
    const current = characterRef.current;
    const instance = (current.inventario ?? []).find((i) => i.id === instanceId);
    const model = instance ? itemsIniciais.find((m) => m.slug === instance.itemSlug) : null;
    if (!instance || !model || model.pdMax == null || amount <= 0) return;
    const nowIso = new Date().toISOString();
    const result = applyShieldDamage(current, instanceId, amount, model, nowIso);
    characterRef.current = result.character;
    setCharacter(result.character);
    const partes: string[] = [];
    if (result.fromTemp > 0) partes.push(`${result.fromTemp} do PD temporário`);
    if (result.fromBase > 0) partes.push(`${result.fromBase} do PD-base`);
    addLogEntry("condicao", `${instance.itemNome}: ${amount} de dano no escudo (${partes.join(" + ") || "nenhum PD disponível — dano não absorvido"}).`);
  }

  function handleRemoveItem(instanceId: string) {
    const current = characterRef.current;
    const next = removeItemFromInventory(current, instanceId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", "Item removido do inventário.");
  }

  /**
   * Grava um `table_log` `temporary_effect_added` para um efeito
   * temporário criado (checkpoint pós-v0.71). `targetName`/`targetId`
   * são de QUEM recebeu o efeito (o próprio personagem no uso próprio,
   * o aliado no uso em aliado). Best-effort, mesmo padrão dos demais.
   */
  async function logTemporaryEffectAdded(effect: TemporaryEffect, targetId: string | null, targetName: string) {
    if (!selectedCampaignId) return;
    try {
      await addLog({
        campaignId: selectedCampaignId,
        characterId: targetId ?? undefined,
        type: "temporary_effect_added",
        visibility: "public",
        payload: {
          characterId: targetId,
          characterNome: targetName,
          effectId: effect.id,
          effectName: effect.name,
          sourceType: effect.sourceType,
          sourceName: effect.sourceName,
          durationType: effect.durationType,
          remainingRounds: effect.remainingRounds ?? null,
          stacks: effect.stacks ?? 1,
          modifiers: effect.modifiers ?? [],
          reason: formatTemporaryEffectSummary(effect),
          source: "temporary_effect",
        },
      });
    } catch {
      avisarFalhaLogMesa();
    }
  }

  /**
   * Remove/encerra manualmente um efeito temporário (checkpoint
   * pós-v0.71) — marca `active: false` (mantém histórico), persiste
   * quando conectado e grava `temporary_effect_removed`.
   */
  async function handleRemoveTemporaryEffect(effectId: string) {
    const current = characterRef.current;
    const effect = (current.efeitos_temporarios ?? []).find((e) => e.id === effectId && e.active);
    if (!effect) return;
    const nowIso = new Date().toISOString();
    const next = removeTemporaryEffect(current, effectId, nowIso);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Efeito temporário removido: ${effect.name} (${effect.sourceName}).`);
    await persistAutomatedActionExecution(next);
    await logTemporaryEffectRemoved(effect, "Removido manualmente na ficha.");
  }

  /** Grava um `table_log` `temporary_effect_removed` (checkpoint pós-v0.71/v0.72). Best-effort, mesmo padrão dos demais. */
  async function logTemporaryEffectRemoved(effect: TemporaryEffect, reason: string) {
    if (!selectedCampaignId) return;
    try {
      await addLog({
        campaignId: selectedCampaignId,
        characterId: characterId ?? undefined,
        type: "temporary_effect_removed",
        visibility: "public",
        payload: {
          characterId,
          characterNome: characterRef.current.nome,
          effectId: effect.id,
          effectName: effect.name,
          sourceType: effect.sourceType,
          sourceName: effect.sourceName,
          durationType: effect.durationType,
          remainingRounds: effect.remainingRounds ?? null,
          stacks: effect.stacks ?? 1,
          modifiers: effect.modifiers ?? [],
          reason,
          source: "temporary_effect",
        },
      });
    } catch {
      avisarFalhaLogMesa();
    }
  }

  /**
   * Usar item consumível (farmácia/granadas, checkpoint pós-v0.58) —
   * checa PA/carga ANTES de mudar qualquer estado (`useItemOnCharacter`,
   * `lib/character/itemUse.ts` — nunca gasta PA nem consome item se
   * bloqueado). Cura aplicada via `applyGmHealing` (com remoção
   * automática de condição por PV embutida); dano de granada/explosivo
   * é só rolado, nunca aplicado a nenhum personagem — resolução de
   * alvo fica para o painel do narrador em /dev/table. Persiste
   * automaticamente quando conectado à mesa (mesmo padrão de
   * `persistAutomatedActionExecution` já usado por ataque/compra), e
   * grava `table_logs` (`type: "item_used"`) quando há mesa selecionada.
   * Remoção de condição (checkpoint pós-v0.61): `options.selectedConditionInstanceId`
   * vem do seletor do card quando há várias condições compatíveis ativas.
   */
  async function handleUseItem(instanceId: string, options?: { selectedConditionInstanceId?: string }, contexto?: ContextoAcaoToken) {
    const current = characterRef.current;
    const instance = (current.inventario ?? []).find((i) => i.id === instanceId);
    if (!instance) return;
    const itemModelo = itemsIniciais.find((m) => m.slug === instance.itemSlug);
    if (!itemModelo) {
      addLogEntry("recurso", "Item não encontrado na Biblioteca — não é possível usar.");
      return;
    }

    const nowIso = new Date().toISOString();
    const result = useItemOnCharacter({
      character: current,
      instance,
      item: itemModelo,
      paMax: derivados.pa_max,
      pvMax: derivados.pv_max,
      peMax: derivados.pe_max,
      nowIso,
      selectedConditionInstanceId: options?.selectedConditionInstanceId ?? null,
    });

    if (!result.ok) {
      addLogEntry("recurso", result.reason ?? "Não foi possível usar o item.");
      return;
    }

    characterRef.current = result.character;
    setCharacter(result.character);

    const partesLog: string[] = [];
    if (result.paCost != null) partesLog.push(`PA ${result.paBefore} → ${result.paAfter}`);
    for (const mudanca of result.resourceChanges) {
      partesLog.push(`${mudanca.resource.toUpperCase()} ${mudanca.before} → ${mudanca.after}`);
    }
    if (result.chargesAfter != null) {
      partesLog.push(`cargas ${result.chargesBefore} → ${result.chargesAfter}`);
    } else {
      partesLog.push(`quantidade ${result.quantityBefore} → ${result.quantityAfter}`);
    }
    if (result.damageRolled.length > 0) {
      partesLog.push(`dano rolado ${result.damageRolled.map((d) => `${d.result} (${d.formula}${d.damageType ? `/${d.damageType}` : ""})`).join(", ")}`);
    }
    if (result.removedConditions.length > 0) {
      partesLog.push(`removeu ${result.removedConditions.join(", ")}`);
    }
    if (result.stabilizedCollapse) {
      partesLog.push(`estabilizou colapso (${result.stabilizedCollapse.toUpperCase()})`);
    }
    for (const efeito of result.temporaryEffectsAdded) {
      partesLog.push(`efeito temporário: ${formatTemporaryEffectSummary(efeito)}`);
    }
    addLogEntry(
      result.useKind === "grenade" || result.useKind === "explosive" ? "acao_combate" : "recurso",
      `Usou ${itemModelo.nome} (${partesLog.join(" · ")})${result.reminders.length > 0 ? ` — Lembrete: ${result.reminders.join(" ")}` : ""}.`,
    );

    // Sempre persiste automaticamente quando conectado (uso de item sempre muda estado real:
    // PA/recurso/quantidade/carga) — mesmo padrão de isConnected já usado por persistAutomatedActionExecution.
    await persistAutomatedActionExecution(result.character);

    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "item_used",
          visibility: contexto?.logVisibility ?? "public",
          payload: {
            ...contexto,
            characterId,
            characterNome: current.nome,
            itemInstanceId: instanceId,
            itemName: itemModelo.nome,
            itemCategory: itemModelo.categoria,
            itemSubtype: itemModelo.subtipo ?? null,
            itemTags: itemModelo.tags,
            useType: result.useKind,
            paCost: result.paCost,
            paBefore: result.paBefore,
            paAfter: result.paAfter,
            quantityBefore: result.quantityBefore,
            quantityAfter: result.quantityAfter,
            chargesBefore: result.chargesBefore,
            chargesAfter: result.chargesAfter,
            resourceChanges: result.resourceChanges,
            healingRolled: result.healingRolled,
            damageRolled: result.damageRolled,
            damageType: result.damageRolled[0]?.damageType ?? null,
            area: itemModelo.areaMetros,
            range: itemModelo.alcanceArremessoMetros,
            appliedConditions: [],
            removedConditions: result.removedConditions,
            stabilizedCollapse: result.stabilizedCollapse,
            temporaryEffectsAdded: result.temporaryEffectsAdded.map((e) => e.name),
            reminders: result.reminders,
            source: "inventory_item_use",
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — o item já foi usado no estado local/persistido; falha aqui não bloqueia o jogador.
      }
      // Log persistente por efeito temporário criado (checkpoint pós-v0.71).
      for (const efeito of result.temporaryEffectsAdded) {
        await logTemporaryEffectAdded(efeito, characterId, current.nome);
      }
    }
  }

  /**
   * Usar item de farmácia em OUTRO personagem ativo da mesa (checkpoint
   * pós-v0.71) — `useItemOnAlly` (`lib/character/itemUse.ts`) valida
   * PA/carga do usuário E aplicabilidade do efeito no alvo ANTES de
   * mutar qualquer coisa (nunca gasta PA/carga se o efeito no alvo não
   * puder ser aplicado). Sem transação real entre dois registros de
   * `characters`: persiste o ALVO primeiro — se falhar, nada muda (item
   * segue no inventário do usuário, nenhum estado local foi tocado);
   * só depois do alvo confirmado é que o usuário perde PA/carga local e
   * é persistido. Risco residual documentado: se a persistência do
   * USUÁRIO falhar DEPOIS do alvo já ter sido salvo (rede caiu no meio),
   * o alvo fica curado/sem-condição mas o consumo do item pode não ter
   * sido salvo no servidor — mesmo padrão de erro do restante da ficha
   * (`persistAutomatedActionExecution`: mantém o estado local aplicado,
   * mostra erro, nunca finge sucesso; "Salvar personagem" resolve).
   */
  async function handleUseItemOnAlly(
    instanceId: string,
    targetCharacterId: string,
    options?: { selectedConditionInstanceId?: string },
  ) {
    if (!selectedCampaignId) {
      addLogEntry("recurso", "Uso em aliado exige mesa conectada.");
      return;
    }
    const current = characterRef.current;
    const instance = (current.inventario ?? []).find((i) => i.id === instanceId);
    if (!instance) return;
    const itemModelo = itemsIniciais.find((m) => m.slug === instance.itemSlug);
    if (!itemModelo) {
      addLogEntry("recurso", "Item não encontrado na Biblioteca — não é possível usar.");
      return;
    }
    const ally = alliesAtivos.find((a) => a.id === targetCharacterId);
    if (!ally) {
      addLogEntry("recurso", "Alvo não encontrado entre os personagens ativos da mesa — atualize a lista de aliados.");
      return;
    }

    const nowIso = new Date().toISOString();
    const targetDerivados = computeDerivedStats(ally.character.atributos, regras, ally.character.mana_bonus_ruptura ?? 0, characterDerivedFormulas(ally.character));
    const result = useItemOnAlly({
      source: current,
      target: ally.character,
      instance,
      item: itemModelo,
      sourcePaMax: derivados.pa_max,
      targetPvMax: targetDerivados.pv_max,
      targetPeMax: targetDerivados.pe_max,
      nowIso,
      selectedConditionInstanceId: options?.selectedConditionInstanceId ?? null,
    });

    if (!result.ok) {
      addLogEntry("recurso", result.reason ?? "Não foi possível usar o item no aliado.");
      return;
    }

    // Persiste o ALVO primeiro (ver docstring acima) — só então o usuário perde PA/carga localmente.
    let targetRecord;
    try {
      targetRecord = await updateCharacter(ally.id, result.target);
    } catch (err) {
      addLogEntry(
        "recurso",
        err instanceof Error
          ? `Falha ao aplicar efeito em ${ally.nome}: ${err.message} — item NÃO foi consumido.`
          : `Falha ao aplicar efeito em ${ally.nome} — item NÃO foi consumido.`,
      );
      return;
    }
    setAlliesAtivos((prev) => prev.map((a) => (a.id === ally.id ? { ...a, character: normalizeCharacter(targetRecord.payload) } : a)));

    const characterAposItemAliado = result.source;
    characterRef.current = characterAposItemAliado;
    setCharacter(characterAposItemAliado);

    const partesLog: string[] = [];
    if (result.paCost != null) partesLog.push(`PA ${result.paBefore} → ${result.paAfter}`);
    if (result.chargesAfter != null) {
      partesLog.push(`cargas ${result.chargesBefore} → ${result.chargesAfter}`);
    } else {
      partesLog.push(`quantidade ${result.quantityBefore} → ${result.quantityAfter}`);
    }
    for (const mudanca of result.targetResourceChanges) {
      partesLog.push(`${mudanca.resource.toUpperCase()} de ${ally.nome} ${mudanca.before} → ${mudanca.after}`);
    }
    if (result.targetRemovedConditions.length > 0) {
      partesLog.push(`removeu de ${ally.nome}: ${result.targetRemovedConditions.join(", ")}`);
    }
    if (result.stabilizedCollapse) {
      partesLog.push(`estabilizou colapso de ${ally.nome} (${result.stabilizedCollapse.toUpperCase()})`);
    }
    for (const efeito of result.targetTemporaryEffectsAdded) {
      partesLog.push(`efeito temporário em ${ally.nome}: ${formatTemporaryEffectSummary(efeito)}`);
    }
    addLogEntry(
      "recurso",
      `Usou ${itemModelo.nome} em ${ally.nome} (${partesLog.join(" · ")})${result.reminders.length > 0 ? ` — Lembrete: ${result.reminders.join(" ")}` : ""}.`,
    );

    await persistAutomatedActionExecution(result.source);

    try {
      await addLog({
        campaignId: selectedCampaignId,
        characterId: characterId ?? undefined,
        type: "item_used",
        visibility: "public",
        payload: {
          characterId,
          characterNome: current.nome,
          sourceCharacterId: characterId,
          sourceCharacterName: current.nome,
          targetCharacterId: ally.id,
          targetCharacterName: ally.nome,
          targetMode: "ally",
          itemInstanceId: instanceId,
          itemName: itemModelo.nome,
          itemCategory: itemModelo.categoria,
          itemSubtype: itemModelo.subtipo ?? null,
          itemTags: itemModelo.tags,
          useType: result.useKind,
          paCost: result.paCost,
          paBefore: result.paBefore,
          paAfter: result.paAfter,
          quantityBefore: result.quantityBefore,
          quantityAfter: result.quantityAfter,
          chargesBefore: result.chargesBefore,
          chargesAfter: result.chargesAfter,
          resourceChanges: [],
          targetResourceChanges: result.targetResourceChanges,
          healingRolled: result.healingRolled,
          appliedConditions: [],
          removedConditions: [],
          targetRemovedConditions: result.targetRemovedConditions,
          stabilizedCollapse: result.stabilizedCollapse,
          targetTemporaryEffectsAdded: result.targetTemporaryEffectsAdded.map((e) => e.name),
          reminders: result.reminders,
          source: "inventory_item_use",
        },
      });
    } catch {
      avisarFalhaLogMesa();
      // Best-effort — o item já foi usado (alvo e usuário já persistidos); falha aqui não bloqueia o jogador.
    }
    // Log persistente por efeito temporário criado NO ALVO (checkpoint pós-v0.71).
    for (const efeito of result.targetTemporaryEffectsAdded) {
      await logTemporaryEffectAdded(efeito, ally.id, ally.nome);
    }
  }

  /**
   * Enviar item ao inventário do bando (aba Inventário, checkpoint
   * pós-v0.68, CP7) — usa `removeQuantityFromInventory` (helper puro,
   * `lib/character/inventory.ts`) para tirar a quantidade do
   * personagem preservando cargas/munição/Aljava/propriedades, e
   * `upsertCrewInventoryItem` (mescla só munição, mesmo critério de
   * `purchaseItem`) para gravar no bando. Ordem SEGURA sem transação
   * real entre `characters` e `campaign_inventory_items`: reduz o
   * personagem só DEPOIS de confirmar a escrita no bando — se a escrita
   * no bando falhar, nada muda no personagem (falha limpa, sem duplicar
   * nem perder o item). RLS do bando é estrita (migration 0019): exige
   * narrador dono da mesa autenticado — sem isso, o erro aparece aqui e
   * o item NUNCA some do personagem.
   */
  async function handleSendItemToCrew(instanceId: string, quantidade: number) {
    if (!selectedCampaignId) {
      addLogEntry("recurso", "Enviar ao bando exige mesa conectada.");
      return;
    }
    const current = characterRef.current;
    const instance = (current.inventario ?? []).find((i) => i.id === instanceId);
    if (!instance) return;
    const nowIso = new Date().toISOString();

    const removal = removeQuantityFromInventory(current, instanceId, quantidade, nowIso);
    if (!removal.ok) {
      addLogEntry("recurso", removal.reason);
      return;
    }

    try {
      // 1) grava no bando primeiro — falhar aqui (ex.: sem narrador autenticado) não tira nada do personagem.
      await upsertCrewInventoryItem(selectedCampaignId, removal.removedInstance);

      // 2) só então reduz/remove do personagem.
      characterRef.current = removal.character;
      setCharacter(removal.character);
      const quantityAfterSource = removal.character.inventario?.find((i) => i.id === instanceId)?.quantidade ?? 0;
      addLogEntry(
        "recurso",
        `Enviado ao bando: ${removal.removedInstance.itemNome} x${removal.removedInstance.quantidade}${quantityAfterSource > 0 ? ` (restam ${quantityAfterSource})` : ""}.`,
      );
      await persistAutomatedActionExecution(removal.character);

      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "inventory_transfer",
          visibility: "public",
          payload: {
            campaignId: selectedCampaignId,
            direction: "character_to_crew",
            sourceCharacterId: characterId,
            sourceCharacterName: current.nome,
            itemInstanceId: removal.removedInstance.id,
            itemName: removal.removedInstance.itemNome,
            itemSlug: removal.removedInstance.itemSlug,
            quantityMoved: removal.removedInstance.quantidade,
            quantityBeforeSource: instance.quantidade,
            quantityAfterSource,
            chargesMoved: removal.removedInstance.cargasAtual ?? null,
            payloadPreserved: true,
            source: "crew_inventory_transfer",
          },
        });
      } catch {
        avisarFalhaLogMesa();
      }
    } catch (err) {
      addLogEntry(
        "recurso",
        err instanceof Error
          ? `Falha ao enviar ao bando: ${err.message} (exige narrador dono da mesa autenticado — ver /dev/login).`
          : "Falha ao enviar ao bando — exige narrador dono da mesa autenticado.",
      );
    }
  }

  /**
   * Instalar runa em item (aba Inventário, checkpoint v0.56) — cria só
   * uma referência passiva na instância do item (`installRuneOnItem`,
   * `lib/character/inventory.ts`); nenhum efeito mecânico é aplicado.
   * Bloqueia só em incompatibilidade INEQUÍVOCA ou limite de slots
   * canônico atingido — compatibilidade incerta nunca bloqueia.
   */
  function handleInstallRune(instanceId: string, runeSlug: string) {
    const current = characterRef.current;
    const rune = runesIniciais.find((r) => r.slug === runeSlug);
    if (!rune) {
      addLogEntry("recurso", "Runa não encontrada na Biblioteca.");
      return;
    }
    const instance = current.inventario?.find((i) => i.id === instanceId);
    const itemContent = instance ? itemsIniciais.find((i) => i.slug === instance.itemSlug) : undefined;
    const result = installRuneOnItem({
      character: current,
      instanceId,
      itemContent,
      rune,
      nowIso: new Date().toISOString(),
      currentCharacterId: characterId,
    });
    if (!result.ok) {
      addLogEntry("recurso", result.reason ?? "Runa não instalada.");
      return;
    }
    characterRef.current = result.character;
    setCharacter(result.character);
    addLogEntry("recurso", `Runa instalada: ${rune.nome}${instance ? ` em ${instance.itemNome}` : ""}.`);
  }

  function handleRemoveRune(instanceId: string, runeInstallationId: string) {
    const current = characterRef.current;
    const next = removeRuneFromItem(current, instanceId, runeInstallationId);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", "Runa removida do item.");
  }

  /**
   * Equipar/desequipar armadura/escudo ATIVO (aba Inventário,
   * checkpoint v0.58) — só marca `equipadoDefensivo`/inicializa MIT/PD
   * atual; nenhum dano é aplicado ainda (isso é escopo de checkpoint
   * seguinte). Equipar outro item do mesmo slot troca o anterior
   * automaticamente (`equipDefensiveItem`).
   */
  function handleEquipDefensive(instanceId: string) {
    const current = characterRef.current;
    const instance = current.inventario?.find((i) => i.id === instanceId);
    const item = instance ? itemsIniciais.find((i) => i.slug === instance.itemSlug) : undefined;
    if (!instance || !item) {
      addLogEntry("recurso", "Item não encontrado na Biblioteca para equipar.");
      return;
    }
    const next = equipDefensiveItem(current, instanceId, item, itemsIniciais);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Equipado: ${instance.itemNome} (${item.categoria}).`);
  }

  function handleUnequipDefensive(instanceId: string) {
    const current = characterRef.current;
    const instance = current.inventario?.find((i) => i.id === instanceId);
    const next = unequipDefensiveItem(current, instanceId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Desequipado: ${instance?.itemNome ?? "item"}.`);
  }

  function handleSetMitAtual(instanceId: string, value: number) {
    const current = characterRef.current;
    const instance = current.inventario?.find((i) => i.id === instanceId);
    const item = instance ? itemsIniciais.find((i) => i.slug === instance.itemSlug) : undefined;
    const next = setItemMitAtual(current, instanceId, value, item?.mitMax ?? null);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleSetPdAtual(instanceId: string, value: number) {
    const current = characterRef.current;
    const instance = current.inventario?.find((i) => i.id === instanceId);
    const item = instance ? itemsIniciais.find((i) => i.slug === instance.itemSlug) : undefined;
    const next = setItemPdAtual(current, instanceId, value, item?.pdMax ?? null);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleSetMunicaoAtual(instanceId: string, value: number) {
    const current = characterRef.current;
    const instance = current.inventario?.find((i) => i.id === instanceId);
    const item = instance ? itemsIniciais.find((i) => i.slug === instance.itemSlug) : undefined;
    const next = setWeaponAmmoAtual(current, instanceId, value, item?.municaoMax ?? null);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleSetFlechaQuantidade(aljavaInstanceId: string, contentSlug: string, value: number) {
    const next = setAljavaFlechaQuantidade(characterRef.current, aljavaInstanceId, contentSlug, value);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleStoreFletchas(aljavaInstanceId: string, ammoInstanceId: string, contentSlug: string, nome: string, quantidade: number) {
    const result = storeFletchasInAljava(characterRef.current, aljavaInstanceId, ammoInstanceId, contentSlug, nome, quantidade);
    characterRef.current = result.character;
    setCharacter(result.character);
  }

  function handleWithdrawFletchas(aljavaInstanceId: string, contentSlug: string, quantidade: number, nomeFlexa: string) {
    const result = withdrawFletchasFromAljava(characterRef.current, aljavaInstanceId, contentSlug, quantidade, nomeFlexa, new Date().toISOString());
    characterRef.current = result.character;
    setCharacter(result.character);
  }

  function handleSelectAljava(bowInstanceId: string, aljavaInstanceId: string | null) {
    const next = setBowAljavaSelection(characterRef.current, bowInstanceId, aljavaInstanceId);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleSelectFlechaAtiva(bowInstanceId: string, flechaSlug: string | null) {
    const next = setBowFlechaSelection(characterRef.current, bowInstanceId, flechaSlug);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleReloadWeapon(instanceId: string) {
    const current = characterRef.current;
    const instance = current.inventario?.find((i) => i.id === instanceId);
    if (!instance) return;
    // allAmmoProfiles derivados dos itens do catálogo com categoria "municao"
    const allAmmoProfiles = itemsIniciais
      .filter((i) => i.categoria === "municao")
      .map((i) => ({
        slug: i.slug,
        nome: i.nome,
        familia: i.ammoFamilia,
        armasCompativeis: i.ammoArmasCompativeis,
        kitQuantidade: null, // não necessário para recarga
      }));
    let result;
    // A própria Aljava (item especial, sem municaoMax no catálogo) chama
    // "Recarregar" diretamente pelo seu card — recarrega A SI MESMA.
    if (instance.itemSlug === ALJAVA_ITEM_SLUG) {
      result = reloadAljava(current, instanceId, allAmmoProfiles);
    } else {
      const weaponItem = itemsIniciais.find((i) => i.slug === instance.itemSlug);
      if (!weaponItem) return;
      const modoMunicao = deriveModoMunicao(weaponItem.subtipo, weaponItem.municaoMax ?? null, weaponItem.municaoCompativelSlug ?? null);
      if (modoMunicao === "aljava") {
        // Arco sem botão próprio de recarga na UI atual — se chamado,
        // recarrega a Aljava selecionada deste arco (ou a única, se só
        // houver uma).
        const aljavaInstances = getAljavaInstances(current);
        const aljavaAlvoId =
          instance.selectedAljavaInstanceId ?? (aljavaInstances.length === 1 ? aljavaInstances[0].id : null);
        if (!aljavaAlvoId) return;
        result = reloadAljava(current, aljavaAlvoId, allAmmoProfiles);
      } else if (modoMunicao === "carregador" || modoMunicao === "virote") {
        result = reloadMagazineWeapon(current, instanceId, weaponItem, allAmmoProfiles);
      } else {
        return;
      }
    }
    characterRef.current = result.character;
    setCharacter(result.character);
  }

  /**
   * Aprender/esquecer magia individual (aba Magias, checkpoint
   * v0.50.1) — conhecer a vertente (Modo Evolução) só decide quais
   * magias aparecem para aprender; cada uma precisa ser aprendida
   * separadamente antes de poder ser conjurada (mesmo padrão de
   * Talentos, v0.48).
   */
  function handleLearnSpell(slug: string) {
    const current = characterRef.current;
    const next = learnSpell(current, slug, new Date().toISOString());
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    const spell = spellsIniciais.find((s) => s.slug === slug);
    const nivelCheck = spell ? checkSpellVertenteLevel(spell, current) : null;
    addLogEntry(
      "condicao",
      `Magia aprendida: ${spell?.nome ?? slug}.${nivelCheck?.aboveLevel ? ` Aviso: nível ${spell!.estatisticas.nivel} está acima do nível ${nivelCheck.vertenteLevel} investido em ${spell!.vertente} — sinalizado, não bloqueado.` : ""}`,
    );
  }

  /**
   * Define o nível investido numa vertente (checkpoint pós-v0.69) —
   * usado para calcular a CD de resistência das magias dessa vertente
   * (regra do VTT: `6 + nível`, nunca `5 + nível`). Só editável em Modo
   * Evolução (mesmo padrão de atributos/perícias).
   */
  function handleSetVertenteLevel(vertente: string, value: number) {
    const current = characterRef.current;
    const nivel = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
    const next: Character = {
      ...current,
      niveis_vertente: { ...(current.niveis_vertente ?? {}), [vertente]: nivel },
    };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Nível de ${vertente} definido: ${nivel} (CD da vertente: ${getVertenteCd(nivel)}).`);
  }

  function handleForgetSpell(learnedId: string) {
    const current = characterRef.current;
    const next = forgetSpell(current, learnedId);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Magia esquecida.");
  }

  /**
   * Instalar escalpo (aba Biblioteca, checkpoint v0.54) — cria só uma
   * referência passiva ao modelo (`installEscalpo`, `lib/character/
   * escalpos.ts`); nenhum efeito mecânico é aplicado nesta fase.
   */
  function handleInstallEscalpo(contentId: string) {
    const current = characterRef.current;
    const next = installEscalpo(current, { contentId, nowIso: new Date().toISOString() });
    characterRef.current = next;
    setCharacter(next);
    const escalpo = escalposIniciais.find((e) => e.slug === contentId);
    addLogEntry("condicao", `Escalpo instalado: ${escalpo?.nome ?? contentId}.`);
  }

  function handleRemoveEscalpo(instanceId: string) {
    const current = characterRef.current;
    const next = removeInstalledEscalpo(current, instanceId);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Escalpo removido.");
  }

  /**
   * Conjurar magia (aba Magias, checkpoint v0.50; cartão de resolução e
   * `spell_cast` persistido no pós-v0.64) — desconta PA/Mana
   * (`castSpell`, `lib/character/spells.ts`), monta o cartão de
   * resolução (`prepareSpellCastResolution`: dano rolado, CD/ações de
   * resistência, efeitos manuais) e grava `table_logs.type="spell_cast"`
   * quando conectado. NADA é aplicado em alvo automaticamente — teatro
   * da mente; o narrador resolve pelas ferramentas de /dev/table. Sem
   * PA/Mana suficiente, não muda nada e só avisa. Exige magia aprendida.
   */
  async function handleCastSpell(slug: string, contexto?: ContextoAcaoToken) {
    const current = characterRef.current;
    const spell = spellsIniciais.find((s) => s.slug === slug);
    if (!spell) return;
    if (!isSpellLearned(current, slug)) {
      addLogEntry("recurso", `${spell.nome} ainda não foi aprendida.`);
      return;
    }
    const result = castSpell({ character: current, spell, paMax: derivados.pa_max, manaMax: derivados.mana_max });
    if (!result.ok) {
      addLogEntry("recurso", result.reason ?? "Conjuração não realizada.");
      return;
    }
    if (result.reason) addLogEntry("recurso", result.reason);
    const characterAposMagia = result.character;
    characterRef.current = characterAposMagia;
    setCharacter(characterAposMagia);

    // Chegou aqui só se castSpell aprovou — nível de vertente já foi validado
    // DENTRO de castSpell (checkpoint pós-v0.70, bloqueio real, não só aviso).
    const vertenteLevel = getVertenteLevel(current, spell.vertente);
    const resolution = prepareSpellCastResolution(spell, undefined, vertenteLevel);
    const temporariaConsumida = (result.manaTemporariaBefore ?? 0) - (result.manaTemporariaAfter ?? 0);
    const manaTexto = result.manaCostUnknown
      ? "custo de Mana ainda não definido (placeholder)"
      : `Mana ${result.manaBefore} → ${result.manaAfter}${temporariaConsumida > 0 ? ` (${temporariaConsumida} da Mana temporária)` : ""}`;
    const partes: string[] = [`PA ${result.paBefore} → ${result.paAfter}`, manaTexto];
    if (resolution.damage) {
      partes.push(
        `dano ${resolution.damage.fixo ? "fixo" : "rolado"} ${resolution.damage.result} (${resolution.damage.formula}/${resolution.damage.tipoDano}${resolution.damage.subtipoDano ? `/${resolution.damage.subtipoDano}` : ""})`,
      );
    }
    const extras = [...resolution.manualEffects, ...resolution.reminders];
    addLogEntry(
      "recurso",
      `Conjurado: ${spell.nome} — ${partes.join("; ")}.${extras.length > 0 ? ` — ${extras.join(" ")}` : ""}`,
    );

    // Ataque mágico (checkpoint pós-v0.70) — só rola quando o payload estrutura
    // perícia+atributo de acerto (atributoAtaque "vertente"); nunca inventa fallback.
    const attackRoll = resolution.attackProfile.isAttack
      ? rollSpellAttack({ spell, character: current, vertenteLevel })
      : null;
    if (resolution.attackProfile.isAttack) {
      if (attackRoll) {
        addLogEntry(
          "recurso",
          `Ataque mágico — ${current.nome} conjurou ${spell.nome}: total ${attackRoll.total}${resolution.damage ? `, dano ${resolution.damage.result} (${resolution.damage.tipoDano})` : ""}. Resolva em /dev/table.`,
        );
      } else if (resolution.attackProfile.notRollableReason) {
        addLogEntry("recurso", `Ataque mágico — ${resolution.attackProfile.notRollableReason}`);
      }
    }

    // Conjurar muda estado real (PA/Mana) — persiste automaticamente quando conectado, mesmo padrão de item/talento.
    await persistAutomatedActionExecution(result.character);

    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "spell_cast",
          visibility: contexto?.logVisibility ?? "public",
          payload: {
            ...contexto,
            characterId,
            characterNome: current.nome,
            spellSlug: spell.slug,
            spellNome: spell.nome,
            vertente: spell.vertente,
            nivel: spell.estatisticas.nivel,
            tipoMagia: spell.estatisticas.tipo_magia,
            resolucao: resolution.resolucao,
            usaReacao: spell.estatisticas.usa_reacao,
            paCost: spell.estatisticas.custo_pa,
            paBefore: result.paBefore,
            paAfter: result.paAfter,
            manaCost: spell.estatisticas.custo_mana,
            manaCostUnknown: result.manaCostUnknown,
            manaBefore: result.manaBefore ?? null,
            manaAfter: result.manaAfter ?? null,
            manaTemporariaConsumida: temporariaConsumida,
            resistance: resolution.resistance,
            damage: resolution.damage,
            manualEffects: resolution.manualEffects,
            reminders: resolution.reminders,
            source: "character_sheet_spells",
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — a conjuração já foi aplicada no estado local/persistido.
      }

      if (resolution.attackProfile.isAttack) {
        try {
          await addLog({
            campaignId: selectedCampaignId,
            characterId: characterId ?? undefined,
            type: "spell_attack_used",
            visibility: contexto?.logVisibility ?? "public",
            payload: {
              ...contexto,
              characterId,
              characterNome: current.nome,
              spellSlug: spell.slug,
              spellId: spell.slug,
              spellName: spell.nome,
              spellVertente: spell.vertente,
              spellLevel: spell.estatisticas.nivel,
              casterVertenteLevel: vertenteLevel,
              vertenteCd: vertenteLevel != null ? getVertenteCd(vertenteLevel) : null,
              attackAttribute: resolution.attackProfile.attackAttribute,
              attackSkill: resolution.attackProfile.attackSkill,
              dice: attackRoll?.dice ?? null,
              highestDie: attackRoll?.highestDie ?? null,
              skillValue: attackRoll?.skillValue ?? null,
              modifiersTotal: attackRoll?.modifiersTotal ?? null,
              total: attackRoll?.total ?? null,
              damageFormula: resolution.damage?.formula ?? null,
              damageRolled: resolution.damage?.result ?? null,
              damageType: resolution.damage?.tipoDano ?? null,
              range: spell.estatisticas.alcanceTexto ?? null,
              area: spell.estatisticas.areaTexto ?? spell.estatisticas.areaTipo ?? null,
              resistance: resolution.resistance,
              reminders: resolution.reminders,
              source: "spell_attack",
            },
          });
        } catch {
          avisarFalhaLogMesa();
          // Best-effort — a conjuração/rolagem já foi aplicada no estado local/persistido.
        }
      }
    }
  }

  /**
   * Conjurar com Fusão (checkpoint pós-v0.66) — regra conhecida: Fusão
   * custa SEMPRE 1 Sobrecarga (do mesmo contador diário dos surtos).
   * Custos estruturados da magia PRINCIPAL são pagos via castSpell; os
   * efeitos/custos da magia FUNDIDA viram lembretes no cartão — nunca
   * somados automaticamente. Bloqueia sem Sobrecarga disponível.
   */
  async function handleCastSpellWithFusion(slug: string, fusedSlug: string) {
    const current = characterRef.current;
    const spell = spellsIniciais.find((s) => s.slug === slug);
    const fusedSpell = spellsIniciais.find((s) => s.slug === fusedSlug);
    if (!spell || !fusedSpell) return;
    if (!isSpellLearned(current, slug) || !isSpellLearned(current, fusedSlug)) {
      addLogEntry("recurso", "Fusão exige que AMBAS as magias estejam aprendidas.");
      return;
    }
    const vertenteLevel = getVertenteLevel(current, spell.vertente);
    const fusedVertenteLevel = getVertenteLevel(current, fusedSpell.vertente);
    const result = castSpellWithFusion({
      character: current,
      spell,
      fusedSpell,
      paMax: derivados.pa_max,
      manaMax: derivados.mana_max,
      overloadRules: regras?.sobrecarga,
      fusedVertenteLevel,
    });
    if (!result.ok || !result.cast) {
      addLogEntry("recurso", result.reason ?? "Fusão não realizada.");
      return;
    }
    characterRef.current = result.character;
    setCharacter(result.character);

    const cast = result.cast;
    const resolution = prepareSpellCastResolution(spell, undefined, vertenteLevel);
    const temporariaConsumida = (cast.manaTemporariaBefore ?? 0) - (cast.manaTemporariaAfter ?? 0);
    const manaTexto = cast.manaCostUnknown
      ? "custo de Mana ainda não definido (placeholder)"
      : `Mana ${cast.manaBefore} → ${cast.manaAfter}${temporariaConsumida > 0 ? ` (${temporariaConsumida} da Mana temporária)` : ""}`;
    const partes: string[] = [
      `PA ${cast.paBefore} → ${cast.paAfter}`,
      manaTexto,
      `Sobrecarga ${result.sobrecargaBefore} → ${result.sobrecargaAfter}/${result.sobrecargaMax} (Fusão custa 1)`,
    ];
    if (resolution.damage) {
      partes.push(`dano ${resolution.damage.fixo ? "fixo" : "rolado"} ${resolution.damage.result} (${resolution.damage.formula}/${resolution.damage.tipoDano})`);
    }
    // Chegou aqui só se castSpellWithFusion aprovou — nível de vertente da
    // principal E da fundida já foi validado DENTRO dela (bloqueio real).
    const extras = [...resolution.manualEffects, ...resolution.reminders, ...result.fusionReminders];
    addLogEntry(
      "recurso",
      `Conjurado com FUSÃO: ${spell.nome} + ${fusedSpell.nome} — ${partes.join("; ")}.${extras.length > 0 ? ` — ${extras.join(" ")}` : ""}`,
    );

    // Ataque mágico (checkpoint pós-v0.70) — a magia PRINCIPAL é a que carrega o
    // ataque estruturado; a fundida nunca soma/altera dano ou acerto automaticamente.
    const attackRoll = resolution.attackProfile.isAttack
      ? rollSpellAttack({ spell, character: current, vertenteLevel })
      : null;
    if (resolution.attackProfile.isAttack) {
      if (attackRoll) {
        addLogEntry(
          "recurso",
          `Ataque mágico — ${current.nome} conjurou ${spell.nome} (Fusão com ${fusedSpell.nome}): total ${attackRoll.total}${resolution.damage ? `, dano ${resolution.damage.result} (${resolution.damage.tipoDano})` : ""}. Resolva em /dev/table.`,
        );
      } else if (resolution.attackProfile.notRollableReason) {
        addLogEntry("recurso", `Ataque mágico — ${resolution.attackProfile.notRollableReason}`);
      }
    }

    await persistAutomatedActionExecution(result.character);

    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "spell_cast",
          visibility: "public",
          payload: {
            characterId,
            characterNome: current.nome,
            spellSlug: spell.slug,
            spellNome: spell.nome,
            vertente: spell.vertente,
            nivel: spell.estatisticas.nivel,
            tipoMagia: spell.estatisticas.tipo_magia,
            resolucao: resolution.resolucao,
            usaReacao: spell.estatisticas.usa_reacao,
            paCost: spell.estatisticas.custo_pa,
            paBefore: cast.paBefore,
            paAfter: cast.paAfter,
            manaCost: spell.estatisticas.custo_mana,
            manaCostUnknown: cast.manaCostUnknown,
            manaBefore: cast.manaBefore ?? null,
            manaAfter: cast.manaAfter ?? null,
            manaTemporariaConsumida: temporariaConsumida,
            resistance: resolution.resistance,
            damage: resolution.damage,
            manualEffects: resolution.manualEffects,
            reminders: [...resolution.reminders, ...result.fusionReminders],
            fusion: {
              fusedSpellSlug: fusedSpell.slug,
              fusedSpellNome: fusedSpell.nome,
              fusedVertente: fusedSpell.vertente,
              fusedManaCost: fusedSpell.estatisticas.custo_mana,
              sobrecargaBefore: result.sobrecargaBefore,
              sobrecargaAfter: result.sobrecargaAfter,
              sobrecargaMax: result.sobrecargaMax,
              rupturaPendente: result.rupturaPendente,
            },
            source: "character_sheet_spells",
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — a fusão já foi aplicada no estado local/persistido.
      }

      if (resolution.attackProfile.isAttack) {
        try {
          await addLog({
            campaignId: selectedCampaignId,
            characterId: characterId ?? undefined,
            type: "spell_attack_used",
            visibility: "public",
            payload: {
              characterId,
              characterNome: current.nome,
              spellSlug: spell.slug,
              spellId: spell.slug,
              spellName: spell.nome,
              spellVertente: spell.vertente,
              spellLevel: spell.estatisticas.nivel,
              casterVertenteLevel: vertenteLevel,
              vertenteCd: vertenteLevel != null ? getVertenteCd(vertenteLevel) : null,
              attackAttribute: resolution.attackProfile.attackAttribute,
              attackSkill: resolution.attackProfile.attackSkill,
              dice: attackRoll?.dice ?? null,
              highestDie: attackRoll?.highestDie ?? null,
              skillValue: attackRoll?.skillValue ?? null,
              modifiersTotal: attackRoll?.modifiersTotal ?? null,
              total: attackRoll?.total ?? null,
              damageFormula: resolution.damage?.formula ?? null,
              damageRolled: resolution.damage?.result ?? null,
              damageType: resolution.damage?.tipoDano ?? null,
              range: spell.estatisticas.alcanceTexto ?? null,
              area: spell.estatisticas.areaTexto ?? spell.estatisticas.areaTipo ?? null,
              resistance: resolution.resistance,
              reminders: [...resolution.reminders, ...result.fusionReminders],
              fusion: {
                fusedSpellSlug: fusedSpell.slug,
                fusedSpellNome: fusedSpell.nome,
                fusedVertente: fusedSpell.vertente,
                sobrecargaBefore: result.sobrecargaBefore,
                sobrecargaAfter: result.sobrecargaAfter,
                sobrecargaMax: result.sobrecargaMax,
                rupturaPendente: result.rupturaPendente,
              },
              source: "spell_attack",
            },
          });
        } catch {
          avisarFalhaLogMesa();
          // Best-effort — a conjuração/rolagem já foi aplicada no estado local/persistido.
        }
      }
    }
  }

  /** "Rolar dano" (aba Magias, checkpoint v0.50) — atalho de rolagem para magias com efeito de dano. */
  function handleRollSpellDamage(slug: string) {
    const spell = spellsIniciais.find((s) => s.slug === slug);
    if (!spell) return;
    const dano = getSpellDamageEffect(spell);
    if (!dano) return;
    const resultado = rollSpellDamage(spell);
    if (resultado == null) return;
    addLogEntry("recurso", `${spell.nome}: ${resultado} de dano ${dano.tipo_dano}${dano.subtipo_dano ? ` (${dano.subtipo_dano})` : ""} (${dano.dado ?? `fixo ${dano.valor}`}).`);
  }

  /**
   * Adicionar condição (aba Condições, checkpoint v0.32) — atualiza o
   * estado local do personagem (persiste só ao "Salvar personagem",
   * igual atributos/perícias) e registra o evento tanto no Log local
   * quanto em table_logs (type="condition_applied", visibility=
   * "public" por padrão — narrador e mesa toda veem que a condição foi
   * aplicada). Falha ao gravar em table_logs é melhor-esforço: não
   * bloqueia a condição de entrar na ficha.
   */
  async function handleAddCondition(input: {
    conditionId: string | null;
    nome: string;
    descricao: string;
    origem: string;
    duracao: string;
  }) {
    const option = input.conditionId ? condicoesDisponiveis.find((item) => item.slug === input.conditionId) : undefined;
    const novaCondicao: ActiveCondition = {
      id: crypto.randomUUID(),
      conditionId: input.conditionId,
      nome: input.nome,
      descricao: input.descricao || undefined,
      origem: input.origem || undefined,
      duracao: input.duracao || undefined,
      aplicadaEm: new Date().toISOString(),
      removidaEm: null,
      ativa: true,
    };
    const result = input.conditionId
      ? applyGmCondition(
          characterRef.current,
          {
            slug: input.conditionId,
            nome: input.nome,
            duracao: input.duracao || undefined,
            nivelMaximo: option?.nivel_maximo,
            round: characterRef.current.current_round,
          },
          novaCondicao.aplicadaEm,
        )
      : null;
    if (result?.transbordo) {
      characterRef.current = result.character;
      setCharacter(result.character);
      addLogEntry("condicao", result.transbordo === "cego"
        ? `"${input.nome}" já estava no nível máximo: Cego até o fim do próximo turno.`
        : `"${input.nome}" já estava no nível máximo: a nova aplicação fratura um membro.`);
      return;
    }
    if (result?.jaAtiva && !result.agravada) return;
    const condicaoRegistrada = result?.condicao ?? novaCondicao;
    const addResult = result ?? applyConsoleMutation(
      characterRef.current,
      { type: "condition_add", condition: novaCondicao },
      { derived: derivados, rules: regras, reactionRules },
    );
    characterRef.current = addResult.character;
    setCharacter(addResult.character);
    addLogEntry("condicao", result?.agravada
      ? `Condição agravada: "${condicaoRegistrada.nome}" ${condicaoRegistrada.nivel}/${condicaoRegistrada.nivelMaximo}.`
      : `Condição aplicada: "${condicaoRegistrada.nome}".`);
    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "condition_applied",
          visibility: "public",
          payload: {
            conditionLocalId: condicaoRegistrada.id,
            conditionId: condicaoRegistrada.conditionId,
            nome: condicaoRegistrada.nome,
            descricao: condicaoRegistrada.descricao,
            origem: condicaoRegistrada.origem,
            duracao: condicaoRegistrada.duracao,
            nivel: condicaoRegistrada.nivel,
            nivelMaximo: condicaoRegistrada.nivelMaximo,
            agravada: result?.agravada ?? false,
            characterId,
            characterNome: character.nome,
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — a condição já foi aplicada no estado local; falha
        // aqui não deve impedir o jogador de continuar.
      }
    }
  }

  /**
   * Remover condição — marca `ativa: false` e carimba `removidaEm`
   * (NUNCA apaga a entrada do array, preservando histórico simples).
   * Registra "condition_removed" em table_logs, mesmo padrão de
   * best-effort de handleAddCondition.
   */
  async function handleRemoveCondition(id: string) {
    const condicao = (character.condicoes_ativas ?? []).find((c) => c.id === id);
    if (!condicao || !condicao.ativa) return;
    const removidaEm = new Date().toISOString();
    const removeResult = applyConsoleMutation(
      characterRef.current,
      { type: "condition_remove", conditionId: id, nowIso: removidaEm },
      { derived: derivados, rules: regras, reactionRules },
    );
    characterRef.current = removeResult.character;
    setCharacter(removeResult.character);
    addLogEntry("condicao", `Condição removida: "${condicao.nome}".`);
    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "condition_removed",
          visibility: "public",
          payload: {
            conditionLocalId: condicao.id,
            conditionId: condicao.conditionId,
            nome: condicao.nome,
            characterId,
            characterNome: character.nome,
          },
        });
      } catch {
        avisarFalhaLogMesa();
        // Best-effort — mesma justificativa de handleAddCondition.
      }
    }
  }

  /**
   * Executa uma ação do Console de Ação (checkpoint v0.42). Encontra o
   * ActionConsoleItem atual (revalida enabled em cima do character mais
   * recente, não confia em um snapshot antigo passado pela UI), aplica
   * custo de PA/Reação + remoção simples de condição no próprio
   * personagem via `executeActionOnCharacter` (lib/character/
   * actionConsole.ts — pura, não decide nada aqui), registra no Log
   * local e em table_logs (type="action_used", best-effort, mesmo
   * padrão de handleAddCondition/handleRemoveCondition).
   */
  /**
   * Persistência automática de ações do Console (checkpoint v0.65).
   * Só dispara para ações que já automatizam algo REAL no personagem
   * (remoção de condição própria — Escapar/Soltar alvo/Apagar fogo/
   * Levantar — ou toggle de postura), detectado por
   * `result.removedConditions.length > 0 || result.postureChange`
   * (mesma condição usada por `actionConsole.ts` para contar como
   * automatizado) — nunca por lista de slugs fixa. Outras ações do
   * Console (Atacar, Mirar etc., que só gastam PA/Reação sem automação
   * real) continuam no modelo "local até Salvar personagem" de antes;
   * isto não é um auto-save geral do console.
   *
   * Reaproveita o MESMO par storage+log de `handleSave`
   * (`updateCharacterSheetPayload`/`updateCharacter`) — nenhum
   * caminho de persistência novo. Falha aqui NUNCA reverte a mudança
   * local (ela já aconteceu antes desta chamada): só avisa via
   * `saveState`/`errorMessage` e deixa "Salvar personagem" disponível
   * como caminho manual, exatamente como pedido.
   */
  /**
   * Aviso de falha ao gravar `table_logs` (checkpoint pós-v0.68) —
   * chamado pelos catches best-effort dos addLog: o EVENTO fica só no
   * log local (o estado do personagem não é afetado nem revertido).
   * Nunca finge sucesso em silêncio.
   */
  function avisarFalhaLogMesa() {
    addLogEntry(
      "recurso",
      "⚠ Falha ao gravar o evento no log da mesa — o registro ficou só neste log local; o estado do personagem não foi afetado. Verifique a conexão e tente novamente se necessário.",
    );
  }

  /**
   * O par storage+estado de TODA gravação automática do console.
   *
   * Os derivados saem do PRÓPRIO personagem que está sendo gravado, e
   * não do memo `derivados` do render: numa mudança de atributo o memo
   * ainda é o de ANTES (o `setCharacter` desta mesma chamada só chega
   * no próximo render), e gravar com ele carimbaria pv_max/pe_max
   * velhos por cima dos valores recém-calculados.
   *
   * Falha aqui NUNCA reverte a mudança local — ela já aconteceu antes
   * desta chamada: só avisa via `saveState`/`errorMessage` e deixa
   * "Salvar personagem" disponível como caminho manual.
   */
  async function persistCharacterAuto(nextCharacter: Character, oQueFalhou: string) {
    const isConnected = Boolean(characterId && selectedCampaignId);
    if (!isConnected) return; // Modo local (sem mesa/personagem salvo) — nada a persistir, sem erro.
    if (somenteLeitura) return; // Quem só visualiza não grava — ver `permissaoFicha`.

    // Já tem uma gravação no ar: esta vira a pendente e sai. Quem está
    // em voo grava este payload assim que voltar — nunca duas subindo
    // o personagem inteiro ao mesmo tempo, onde a mais VELHA pode
    // commitar por último e apagar a mais nova.
    gravacaoPendenteRef.current = { personagem: nextCharacter, oQueFalhou };
    if (gravacaoEmVooRef.current) return;

    gravacaoEmVooRef.current = true;
    try {
      while (gravacaoPendenteRef.current) {
        const alvo = gravacaoPendenteRef.current;
        gravacaoPendenteRef.current = null;
        const selo = ++seloGravacaoRef.current;
        try {
          const toSave = normalizeCharacter(
            alvo.personagem,
            computeDerivedStats(alvo.personagem.atributos, regras, alvo.personagem.mana_bonus_ruptura ?? 0, characterDerivedFormulas(alvo.personagem)),
          );
          const record =
            mode === "product" && selectedCampaignId
              ? await updateCharacterSheetPayload(characterId as string, toSave)
              : await updateCharacter(characterId as string, toSave);
          // Outra gravação começou enquanto esta ia e voltava: o payload
          // desta já é passado. Ela FOI gravada (a de agora vai por cima no
          // servidor); o que não pode é ela reescrever a tela.
          if (selo !== seloGravacaoRef.current || gravacaoPendenteRef.current) continue;
          lastSyncedCharacterRef.current = record.payload;
          characterRef.current = record.payload;
          setCharacter(record.payload);
          setSaveState("saved");
        } catch (err) {
          setSaveState("error");
          setErrorMessage(
            err instanceof Error
              ? `${alvo.oQueFalhou} localmente, mas falhou ao salvar automaticamente: ${err.message}`
              : `${alvo.oQueFalhou} localmente, mas falhou ao salvar automaticamente.`,
          );
        }
      }
    } finally {
      gravacaoEmVooRef.current = false;
    }
  }

  async function persistAutomatedActionExecution(nextCharacter: Character) {
    await persistCharacterAuto(nextCharacter, "Ação executada");
  }

  /**
   * Gravação das mudanças PERMANENTES do Modo Evolução (atributo,
   * perícia, PM ganho/gasto).
   *
   * Elas precisam disto por um motivo que as ações do Console não têm:
   * o Console vive dentro do VTT e da ficha, onde não existe botão
   * "Salvar personagem" nenhum. Sem gravar aqui, subir um atributo
   * ficava só no estado do React e sumia ao fechar a janela — que é
   * exatamente o que acontecia. O log de evolução (`table_logs`) já era
   * escrito, então o histórico registrava uma mudança que o personagem
   * não tinha.
   */
  /**
   * AUTOSAVE DO CONSOLE — tudo que muda a ficha grava sozinho.
   *
   * ── Por que virou automático ────────────────────────────────────
   * O modelo antigo era "local até Salvar personagem". Ele não se
   * sustentava: o Console é uma JANELA sobre a página da ficha, e o
   * botão "Salvar personagem" fica na página DE BAIXO — coberto.
   * Medido: o botão existe em (440,413), dentro da área que o Console
   * ocupa. Para salvar era preciso fechar a ficha para salvar a ficha.
   *
   * O resultado era perda silenciosa: editar PV mostrava 8/11 no card,
   * o banco seguia em 11, e recarregar devolvia 11/11 — sem aviso
   * nenhum de que havia algo pendente. O `persistEvolucao` já era um
   * remendo disso ("o Console vive dentro do VTT e da ficha, onde não
   * existe botão Salvar personagem nenhum"); isto estende a mesma
   * conclusão ao resto.
   *
   * ── Por que um efeito, e não 148 chamadas ───────────────────────
   * São 148 pontos que chamam `setCharacter`. Passar por cada um é
   * convite a esquecer um — e o que se esquece é justamente o que
   * perde dados em silêncio. Um lugar só, olhando o resultado.
   *
   * ── A guarda ────────────────────────────────────────────────────
   * `lastSyncedCharacterRef` é o último payload conhecido como igual ao
   * banco, e já era mantido por leitura e gravação canônicas. Comparar
   * contra ele evita regravar o que acabou de CHEGAR do servidor
   * (carga inicial, refetch por Realtime) — sem isso, cada eco viraria
   * uma escrita nova, e duas fichas abertas ficariam se regravando em
   * looping.
   *
   * ── O Modo Evolução fica de fora, de propósito ──────────────────
   * Subir atributo e perícia é mudança PERMANENTE e cara. Ela continua
   * pedindo confirmação — sair do modo pelo ✓ é o commit.
   */
  useEffect(() => {
    if (sheetMode === "evolucao") return;
    if (JSON.stringify(character) === JSON.stringify(lastSyncedCharacterRef.current)) return;
    const id = setTimeout(() => { void persistCharacterAuto(characterRef.current, "Mudança na ficha"); }, 400);
    return () => clearTimeout(id);
    // `character` é a única dependência de verdade: o resto é lido de
    // refs, que não disparam efeito e sempre trazem o valor atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, sheetMode]);

  async function persistEvolucao(nextCharacter: Character) {
    await persistCharacterAuto(nextCharacter, "Evolução aplicada");
  }

  /**
   * SAIR DO MODO EVOLUÇÃO É O COMMIT.
   *
   * Antes cada passo de +/− gravava sozinho, e não havia como recuar:
   * clicar errado num atributo já era permanente. Subir atributo e
   * perícia é a mudança mais cara da ficha — ela merece um gesto de
   * confirmação, e o ✓ do chip já era esse gesto na cabeça de quem usa.
   *
   * Entrar no modo não grava nada. Os passos ficam no estado local, o
   * autosave geral não toca neles (ele para em `sheetMode === "evolucao"`),
   * e sair pelo ✓ grava tudo de uma vez.
   */
  function alternarModo(proximo: SheetMode) {
    const saindoDaEvolucao = sheetMode === "evolucao" && proximo !== "evolucao";
    setSheetMode(proximo);
    if (saindoDaEvolucao) void persistEvolucao(characterRef.current);
  }

  async function handleUseAction(actionId: string, armaId?: string | null, contexto?: ContextoAcaoToken, opcaoInteracao?: string) {
    const nowMs = Date.now();
    const lastExecution = lastActionExecutionRef.current;
    if (
      lastExecution?.actionId === actionId &&
      nowMs - lastExecution.at < ACTION_DOUBLE_CLICK_GUARD_MS
    ) {
      return;
    }
    if (actionExecutionLockRef.current) return;
    actionExecutionLockRef.current = true;
    lastActionExecutionRef.current = { actionId, at: nowMs };
    setExecutingActionId(actionId);

    const actionContent = combatActionsIniciais.find((a) => a.id === actionId);
    const currentCharacter = characterRef.current;
    const currentItems = buildActionConsoleItems(
      currentCharacter,
      combatActionsIniciais,
      condicoesParaAcoes,
      derivados.pa_max,
      derivados.reacoes_por_rodada,
      regras?.pericias.map((pericia) => pericia.id) ?? [],
      reactionRules,
      { items: itemsIniciais, properties: propertiesIniciais, runes: runesIniciais },
      currentTurnWindow,
      false,
      activeEffects,
    );
    const item = currentItems.find((candidate) => candidate.id === actionId);
    if (!actionContent || !item || !item.enabled) {
      actionExecutionLockRef.current = false;
      setExecutingActionId(null);
      return;
    }

    // Fase 4 (v0.59) / checkpoint pós-v0.50 (Atacar ligado às armas):
    // detecta pelo efeito "resolver_ataque" no payload da ação — sem
    // automatizar Rajada/Dispersão, alvo, distância, MIT/PD ou crítico.
    const temEfeitoAtaque = Array.isArray(
      (actionContent.payload_automacao as Record<string, unknown> | undefined)?.efeitos,
    ) && ((actionContent.payload_automacao as Record<string, unknown>).efeitos as unknown[]).some(
      (e) => typeof e === "object" && e !== null && (e as Record<string, unknown>).tipo === "resolver_ataque",
    );

    // Resolve arma/perícia/dano ANTES de gastar PA: se a munição bloquear,
    // o PA não pode ter sido gasto (regra do checkpoint).
    const attackWeaponInstanceId = temEfeitoAtaque ? (armaId === undefined ? effectiveSelectedAttackWeaponId : armaId) : null;
    const attackWeaponInstance: InventoryItemInstance | null = attackWeaponInstanceId
      ? (currentCharacter.inventario ?? []).find((i) => i.id === attackWeaponInstanceId) ?? null
      : null;
    const attackWeaponModel: ItemContent | null = attackWeaponInstance
      ? itemsIniciais.find((m) => m.slug === attackWeaponInstance.itemSlug) ?? null
      : null;

    if (temEfeitoAtaque && attackWeaponModel?.usesAmmunition && attackWeaponInstanceId) {
      const bloqueio = checkAttackAmmoBlock(currentCharacter, itemsIniciais, { weaponInstanceId: attackWeaponInstanceId });
      const bloqueioMensagem: Record<string, string> = {
        sem_municao: "Arma sem munição. Recarregue antes de atacar.",
        aljava_nao_selecionada: "Selecione qual Aljava este arco usa antes de atacar.",
        flecha_nao_selecionada: "Selecione o tipo de flecha na aljava antes de atacar.",
        flecha_sem_estoque: "Flecha selecionada sem estoque na aljava. Escolha outra ou recarregue.",
      };
      if (bloqueio && bloqueioMensagem[bloqueio]) {
        addLogEntry("acao_combate", bloqueioMensagem[bloqueio]);
        actionExecutionLockRef.current = false;
        setExecutingActionId(null);
        return;
      }
    }

    // Munição validada (ou ação não é ataque) — agora sim gasta PA/aplica efeitos automatizados.
    const nowIso = new Date().toISOString();
    const result = executeActionOnCharacter(
      currentCharacter,
      actionContent,
      derivados.pa_max,
      derivados.reacoes_por_rodada,
      nowIso,
      reactionRules,
      currentTurnWindow,
      false,
      activeEffects,
      opcaoInteracao,
    );
    const characterAposAcao: Character = result.character;
    characterRef.current = characterAposAcao;
    setCharacter(characterAposAcao);

    let attackLogFields: Record<string, unknown> = {};
    if (temEfeitoAtaque) {
      const resolved = resolveAttackDetails(characterRef.current, actionContent, attackWeaponModel);

      let ammoConsumed = false;
      let ammoBefore: number | null = null;
      let ammoAfter: number | null = null;
      let quiverInstanceId: string | null = null;
      let quiverName: string | null = null;
      let arrowType: string | null = null;

      if (attackWeaponModel?.usesAmmunition && attackWeaponInstanceId) {
        const afterAttack = consumeAttackAmmo(characterRef.current, itemsIniciais, { weaponInstanceId: attackWeaponInstanceId });
        if (afterAttack.consumedFromInstanceId) {
          const beforeInst = (currentCharacter.inventario ?? []).find((i) => i.id === afterAttack.consumedFromInstanceId);
          characterRef.current = afterAttack.character;
          setCharacter(afterAttack.character);
          const afterInst = (afterAttack.character.inventario ?? []).find((i) => i.id === afterAttack.consumedFromInstanceId);
          ammoConsumed = true;
          if (beforeInst?.aljava && afterInst?.aljava) {
            ammoBefore = getAljavaTotalFlechas(beforeInst.aljava);
            ammoAfter = getAljavaTotalFlechas(afterInst.aljava);
            quiverInstanceId = beforeInst.id;
            quiverName = beforeInst.itemNome;
            arrowType = afterAttack.consumedFlechaSlug
              ? itemsIniciais.find((m) => m.slug === afterAttack.consumedFlechaSlug)?.nome ?? afterAttack.consumedFlechaSlug
              : null;
            if (afterAttack.isFlechaEspecial && afterAttack.consumedFlechaSlug) {
              addLogEntry("acao_combate", `Sugestão: aplicar efeito especial de ${arrowType} (resolução manual).`);
            }
          } else {
            ammoBefore = beforeInst ? getWeaponAmmoAtual(beforeInst) : null;
            ammoAfter = afterInst ? getWeaponAmmoAtual(afterInst) : null;
          }
        }
      }

      attackLogFields = {
        weaponInstanceId: attackWeaponInstanceId,
        weaponName: attackWeaponModel?.nome ?? "Ataque desarmado",
        weaponCategory: attackWeaponModel?.categoria ?? null,
        weaponSubtype: attackWeaponModel?.subtipo ?? null,
        weaponTags: attackWeaponModel?.tags ?? [],
        attackSkill: resolved.skill,
        attackAttribute: resolved.attribute,
        damageBase: resolved.danoBase,
        damageType: resolved.tipoDano,
        damageSubtype: resolved.subtipoDano,
        damageStructured: resolved.danoEstruturado,
        ammoConsumed,
        ammoBefore,
        ammoAfter,
        quiverInstanceId,
        quiverName,
        arrowType,
      };
    }

    // Checkpoint v0.65 — ações que automatizaram remoção de
    // condição/toggle de postura persistem sozinhas quando conectado a
    // mesa/personagem salvo (ver persistAutomatedActionExecution acima).
    // Atacar entra na mesma regra quando consome munição/flecha (inventário mudou).
    if (contexto || result.removedConditions.length > 0 || (result.interactionChanges?.length ?? 0) > 0 || result.postureChange || attackLogFields.ammoConsumed) {
      await persistAutomatedActionExecution(characterRef.current);
    }

    const custoResumo = result.defenseWithoutReaction
      ? `defesa sem Reação ${result.defensesWithoutReactionBefore} → ${result.defensesWithoutReactionAfter}; penalidade ${result.reactionPenaltyApplied}`
      : result.paBefore !== result.paAfter
        ? `PA ${result.paBefore} → ${result.paAfter}`
        : result.reactionBefore !== result.reactionAfter
          ? `Reação ${result.reactionBefore} → ${result.reactionAfter}`
          : "sem custo";
    const removidasResumo = (result.removedConditions.length > 0 ? ` — removeu ${result.removedConditions.join(", ")}` : "")
      + ((result.interactionChanges?.length ?? 0) > 0 ? ` — ${result.interactionChanges!.join(", ")}` : "");
    const posturaResumo = result.postureChange
      ? result.postureChange.direction === "ativar"
        ? ` — ativou ${result.postureChange.conditionName}${result.postureChange.replacedConditionName ? ` (desligou ${result.postureChange.replacedConditionName})` : ""}`
        : ` — encerrou ${result.postureChange.conditionName}`
      : "";
    const pendenciasResumo =
      result.pendingEffects.length > 0 ? " Uso registrado; efeitos pendentes exigem resolução manual." : "";
    // item.nome já reflete "Encerrar X" quando a ação é uma postura já
    // ativa (ver buildActionConsoleItems) — usar aqui em vez do nome
    // bruto do conteúdo evita "Ativar Postura Ofensiva: ... — encerrou
    // Postura Ofensiva" (confuso).
    addLogEntry("acao_combate", `${item.nome}: ${custoResumo}${removidasResumo}${posturaResumo}.${pendenciasResumo}`);
    for (const aviso of result.warnings) addLogEntry("acao_combate", aviso);
    for (const lembrete of result.reminders) {
      addLogEntry("acao_combate", `Lembrete: ${lembrete}`);
    }
    if (temEfeitoAtaque) {
      const danoTexto = attackLogFields.damageStructured
        ? `${attackLogFields.damageBase} (${attackLogFields.damageType}/${attackLogFields.damageSubtype})`
        : "dano não estruturado";
      const municaoTexto = attackLogFields.ammoConsumed
        ? attackLogFields.quiverName
          ? ` — ${attackLogFields.quiverName}: ${attackLogFields.arrowType} (${attackLogFields.ammoBefore} → ${attackLogFields.ammoAfter})`
          : ` — munição ${attackLogFields.ammoBefore} → ${attackLogFields.ammoAfter}`
        : "";
      addLogEntry(
        "acao_combate",
        `Ataque: ${attackLogFields.weaponName} — perícia ${attackLogFields.attackSkill ?? "?"}, dano-base ${danoTexto}${municaoTexto}.`,
      );
    }

    try {
      if (selectedCampaignId) {
        // actionSlug distingue ativar/encerrar para posturas (mesma ação
        // de conteúdo, direção diferente) — actionId/actionName
        // continuam apontando pro conteúdo publicado em si.
        const actionSlug = result.postureChange ? `${actionContent.slug}_${result.postureChange.direction}` : actionContent.slug;
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          type: "action_used",
          visibility: contexto?.logVisibility ?? "public",
          payload: {
            ...contexto,
            characterId,
            characterNome: currentCharacter.nome,
            actionId: actionContent.id,
            actionSlug,
            actionName: item.nome,
            category: actionContent.categoria,
            actionType: actionContent.tipo,
            cost: { label: item.custoLabel, pa: item.custoPA, reacao: item.custoReacao },
            reminders: result.reminders,
            ...attackLogFields,
            appliedState: result.postureChange?.direction === "ativar" ? result.postureChange.conditionSlug : undefined,
            removedStates:
              result.postureChange?.direction === "encerrar"
                ? [result.postureChange.conditionSlug]
                : result.postureChange?.replacedConditionSlug
                  ? [result.postureChange.replacedConditionSlug]
                  : undefined,
            paBefore: result.paBefore,
            paAfter: result.paAfter,
            reactionBefore: result.reactionBefore,
            reactionAfter: result.reactionAfter,
            removedConditions: result.removedConditions,
            automatedEffects: result.automatedEffects,
            pendingEffects: result.pendingEffects,
            usedReaction: result.usedReaction,
            defenseWithoutReaction: result.defenseWithoutReaction,
            defensesWithoutReactionBefore: result.defensesWithoutReactionBefore,
            defensesWithoutReactionAfter: result.defensesWithoutReactionAfter,
            reactionPenaltyApplied: result.reactionPenaltyApplied,
            reactionRulesSource: "combat_flow",
            source: "character_sheet",
          },
        });
      }
    } catch {
      // Best-effort — a ação já foi executada no estado local; falha aqui não bloqueia o jogador.
    } finally {
      actionExecutionLockRef.current = false;
      setExecutingActionId(null);
    }
    return true;
  }

  /**
   * "Rolar" numa ação (aba Ações) — só disponível quando `acao.teste`
   * tem `pericias` (ver ActionConsoleItem.testeTexto). Reaproveita a
   * mesma ponte de handleRollPericia: muda para a aba Rolagens com a
   * primeira perícia do teste pré-selecionada. Margem, região do corpo,
   * dano e defesa do alvo continuam fora de escopo (pendência do
   * relatório) — este botão só evita repetir a seleção manual de
   * atributo/perícia.
   */
  function handleRollAction(actionId: string) {
    const item = actionConsoleItems.find((action) => action.id === actionId);
    if (!item) return;
    // Preparar ataque: expira (persiste) efeitos de item vencidos ANTES de computar
    // bônus escopados — evita que um Toque de Midas vencido conte, mesmo que ninguém
    // tenha recarregado a página desde então.
    {
      const expired = expireItemTemporaryEffects(characterRef.current, new Date().toISOString());
      if (expired.expiredInstanceIds.length > 0) {
        characterRef.current = expired.character;
        setCharacter(expired.character);
      }
    }
    // "Atacar" não tem `teste.pericias` simples (é contestado_ou_simples,
    // ver getSimpleActionRollSkill) — a perícia correta depende da arma
    // selecionada, resolvida em attackPreview (mesma lógica de handleUseAction).
    if (actionContentHasResolverAtaque(item) && attackPreview?.skill) {
      const extraTags = effectiveSelectedAttackWeaponId ? [`item:${effectiveSelectedAttackWeaponId}`] : [];

      if (attackPreview.attribute) {
        const weaponName = attackWeaponCandidates.find((c) => c.instanceId === effectiveSelectedAttackWeaponId)?.nome ?? "Ataque desarmado";
        setPreparedRoll({
          atributoId: attackPreview.attribute,
          periciaId: attackPreview.skill,
          origem: `Atacar: ${weaponName}`,
          extraTags,
        });
        setActiveTab("rolagens");
        return;
      }
      // Sem atributo estruturado (arma à distância sem `atributoAtaque` no catálogo) —
      // mesmo fallback de handleRollPericia, mas preservando as tags escopadas.
      const periciaDef = regras?.pericias.find((p) => p.id === attackPreview.skill);
      const atributoPadrao: keyof CharacterAttributes =
        periciaDef?.atributo_primario === "corpo" || periciaDef?.atributo_primario === "mente" || periciaDef?.atributo_primario === "animo"
          ? periciaDef.atributo_primario
          : "corpo";
      setPreparedRoll({
        atributoId: atributoPadrao,
        periciaId: attackPreview.skill,
        origem: `Atacar: ${attackWeaponCandidates.find((c) => c.instanceId === effectiveSelectedAttackWeaponId)?.nome ?? "Ataque desarmado"}`,
        extraTags,
      });
      setActiveTab("rolagens");
      return;
    }
    if (!item.rollSkillId) return;
    handleRollPericia(item.rollSkillId);
  }

  function actionContentHasResolverAtaque(item: { payloadAutomacao?: unknown }): boolean {
    const efeitos = (item.payloadAutomacao as Record<string, unknown> | undefined)?.efeitos;
    return (
      Array.isArray(efeitos) &&
      efeitos.some((e) => typeof e === "object" && e !== null && (e as Record<string, unknown>).tipo === "resolver_ataque")
    );
  }

  /**
   * "Rolar" num atributo (aba Atributos): muda para a aba Rolagens com
   * esse atributo selecionado e SEM perícia. Funciona nos dois modos —
   * rolar não é "editar a ficha", por isso não tem guard de sheetMode
   * (mesmo critério já usado para PA/Reações).
   */
  function handleRollAtributo(id: keyof CharacterAttributes) {
    const nome = regras?.atributos.find((a) => a.id === id)?.nome ?? id;
    setPreparedRoll({ atributoId: id, periciaId: null, origem: `Atributo: ${nome}` });
    setActiveTab("rolagens");
  }

  /**
   * "Rolar" numa perícia (aba Perícias): muda para a aba Rolagens com
   * essa perícia selecionada e o atributo padrão dela.
   *
   * Atributo padrão: usa skill.atributo_primario do payload de
   * regras_personagem quando é um id válido (corpo/mente/animo) — dado
   * REAL das regras, não inventado (ver checkpoint v0.10 no relatório).
   * Só cai para "corpo" como fallback se atributo_primario estiver
   * ausente ou vier um valor fora dos 3 atributos conhecidos.
   */
  function handleRollPericia(periciaId: string) {
    const def = regras?.pericias.find((p) => p.id === periciaId);
    const candidato = def?.atributo_primario;
    const atributoPadrao: keyof CharacterAttributes =
      candidato === "corpo" || candidato === "mente" || candidato === "animo" ? candidato : "corpo";
    setPreparedRoll({ atributoId: atributoPadrao, periciaId, origem: `Perícia: ${def?.nome ?? periciaId}` });
    setActiveTab("rolagens");
  }

  // ── Console do Personagem ──────────────────────────────────────
  // O Console é ADITIVO: a ficha em abas continua intacta por baixo.
  // Ele não implementa regra — só reempacota os handlers já existentes
  // no contrato `ConsoleApi`, para nenhuma lógica ser duplicada.
  //
  // ESTE HOOK PRECISA VIR ANTES do `return` de bloqueio do modo product
  // logo abaixo — Regras dos Hooks: nenhum hook pode ficar atrás de um
  // return condicional, senão a CONTAGEM de hooks muda entre renders
  // (aqui: 1º render com productSessionState "pending" retorna cedo
  // SEM rodar este useMemo; quando o personagem termina de carregar e
  // productSessionState vira "valid", o mesmo componente de repente
  // roda um hook A MAIS que no render anterior). React detecta isso e
  // quebra com "Rendered more hooks than during the previous render" —
  // exatamente o crash que derrubava /ficha inteira ao abrir um
  // personagem real (nunca aparecia em /dev/character-sheet, que nunca
  // passa por esse bloqueio: lá `mode` é sempre "dev").
  const catalogoItens = useMemo(() => catalogWithMarketEscalpos(itemsIniciais, escalposIniciais), [itemsIniciais, escalposIniciais]);

  /* Espaços ocupados/capacidade. A regra inteira (porte → espaços,
     capacidade total, o que pesa e o que não pesa) vive em
     `lib/character/carga.ts`; aqui é só a leitura memoizada. */
  const cargaAtual = useMemo(
    () => resumoDeCarga(character, catalogoItens),
    [character, catalogoItens],
  );

  /* Glossário para os tooltips de regra dentro de textos: as ações de
     combate e as condições publicadas, achatadas num formato só. Vem
     de conteúdo real — nada é escrito à mão aqui. */
  const glossarioDeRegras = useMemo<TermoDeRegra[]>(
    () => [
      ...combatActionsIniciais.map((a) => ({
        tipo: "acao" as const,
        slug: a.slug,
        nome: a.nome,
        descricao: a.descricao_curta ?? a.descricao_longa ?? null,
      })),
      ...condicoesDisponiveis.map((c) => ({
        tipo: "condicao" as const,
        slug: c.slug,
        nome: c.nome,
        descricao: c.descricao_curta ?? null,
      })),
    ],
    [combatActionsIniciais, condicoesDisponiveis],
  );
  // Também precisa vir antes do return de bloqueio — mesma regra acima.
  // `null` na rota /ficha normal; vira `router.back()` só quando esta
  // árvore está montada dentro da rota interceptada do modal.
  const consoleCloseOverride = useConsoleCloseOverride();
  const [rolagemToken, setRolagemToken] = useState<{
    pericia: string;
    nome: string;
    visibilidade: "public" | "gm";
    onRolado?: (entrada: { atributoId: string; periciaId: string | null; modificador: number; dados: number[] }) => void;
  } | null>(null);

  // Modo product (/ficha): antes de mostrar qualquer ficha, exige o
  // personagem já resolvido por campanha+id (ver
  // productSessionState/loadProductSession acima). Cada estado tem uma
  // mensagem de bloqueio própria — nenhum deles renderiza os dados do
  // personagem/mesa por baixo.
  if (mode === "product" && productSessionState !== "valid") {
    const bloqueio: Record<Exclude<ProductSessionState, "valid">, string> = {
      pending: "Carregando…",
      no_params: "Link incompleto — volte pelo convite ou pela lista de personagens.",
      not_found: "Personagem não encontrado ou você não tem acesso a ele. Volte pelo link da campanha.",
    };
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <p data-testid="ficha-bloqueio" role={productSessionState === "pending" ? "status" : "alert"} style={{ fontSize: 14, opacity: 0.85 }}>
          {bloqueio[productSessionState]}
        </p>
      </main>
    );
  }

  const consoleApi: ConsoleApi = {
    somenteLeitura,
    escalpos: {
      catalogo: escalposIniciais,
      erro: escalposError,
      instalar: handleInstallEscalpo,
      remover: handleRemoveEscalpo,
      comEfeitoAutomatico: installedEscalpoIdsWithEffect,
    },
    magias: {
      spells: spellsIniciais,
      catalogError: spellsError,
      magiasAprendidas: character.magias_aprendidas ?? [],
      niveisVertente: character.niveis_vertente ?? {},
      sheetMode,
      onLearn: handleLearnSpell,
      onForget: handleForgetSpell,
      onCast: handleCastSpell,
      onCastWithFusion: handleCastSpellWithFusion,
      onRollDamage: handleRollSpellDamage,
      onSetVertenteLevel: handleSetVertenteLevel,
    },
    gravacao: { estado: saveState, erro: errorMessage },
    character,
    derivados,
    regras,
    catalogo: catalogoItens,

    // Modo Evolução no Console: a MESMA porta que `ModeToggle` já
    // oferecia na aba Geral, agora alcançável de dentro da janela (e
    // portanto de dentro do VTT). Nenhuma regra nova — `updateAtributo`
    // e `updatePericia` continuam sendo o único caminho de alteração
    // permanente, com clamp, derivados, histórico e `table_logs`.
    modo: sheetMode,
    definirModo: setSheetMode,
    editarAtributo: updateAtributo,
    editarPericia: updatePericia,
    editarNome: (nome) => setCharacter((prev) => ({ ...prev, nome })),

    rolarAtributo: (id) => {
      const def = regras?.atributos.find((a) => a.id === id);
      const r = rollPericia({
        atributoId: id,
        atributoNome: def?.nome ?? id,
        atributoValor: character.atributos[id],
        modificador: 0,
      });
      addLogEntry("rolagem_pericia", `Console — ${def?.nome ?? id}: ${r.dados.join(", ")} → ${r.modoSelecao === "lowest" ? "menor" : "maior"} ${r.dadoEscolhido}, total ${r.total}.`);
      void publicarRolagemNaMesa(id, null, r.dados, 0);
      return r;
    },
    rolarPericia: (periciaId) => {
      const def = regras?.pericias.find((p) => p.id === periciaId);
      const candidato = def?.atributo_primario;
      const atributoId: keyof CharacterAttributes =
        candidato === "corpo" || candidato === "mente" || candidato === "animo" ? candidato : "corpo";
      const atributoDef = regras?.atributos.find((a) => a.id === atributoId);
      const r = rollPericia({
        atributoId,
        atributoNome: atributoDef?.nome ?? atributoId,
        atributoValor: character.atributos[atributoId],
        periciaId,
        periciaNome: def?.nome,
        periciaValor: character.pericias[periciaId] ?? 0,
        modificador: 0,
      });
      addLogEntry("rolagem_pericia", `Console — ${def?.nome ?? periciaId}: ${r.dados.join(", ")} → ${r.modoSelecao === "lowest" ? "menor" : "maior"} ${r.dadoEscolhido}, total ${r.total}.`);
      void publicarRolagemNaMesa(atributoId, periciaId, r.dados, 0);
      return r;
    },
    mesa: selectedCampaignId && characterId ? { campaignId: selectedCampaignId, characterId } : null,

    /**
     * Atributo primário de uma perícia, com o mesmo fallback que as
     * três rolagens já usavam soltas. Vira função porque agora quem
     * escolhe a perícia é o painel, não o clique.
     */
    atributoDaPericia: (periciaId) => {
      const candidato = regras?.pericias.find((p) => p.id === periciaId)?.atributo_primario;
      return candidato === "corpo" || candidato === "mente" || candidato === "animo" ? candidato : "corpo";
    },

    /**
     * Gasta a Reação da defesa SEM rolar.
     *
     * A rolagem deixou de ser instantânea: o painel abre, a pessoa
     * ajusta perícia/modificador/CD e só então rola. A Reação, porém,
     * é consumida pela DECLARAÇÃO da defesa — então este passo existe
     * separado, e a penalidade que ele devolve entra como modificador
     * da rolagem que vier depois.
     */
    prepararDefesa: () => {
      const current = characterRef.current;
      const mutation = applyConsoleMutation(
        current,
        { type: "defense" },
        { derived: derivados, rules: regras, reactionRules },
      );
      if (mutation.character !== current) {
        characterRef.current = mutation.character;
        setCharacter(mutation.character);
      }
      const reacaoLog = mutation.meta.defenseWithoutReaction
        ? `Defesa sem Reação: ${mutation.meta.defensesWithoutReactionBefore ?? 0} → ${mutation.meta.defensesWithoutReaction ?? 0}; penalidade ${mutation.meta.reactionPenalty ?? 0}.`
        : mutation.meta.usedReaction
          ? `Reações usadas: ${mutation.meta.reactionBefore ?? 0} → ${mutation.meta.reactionAfter ?? 0}.`
          : (mutation.meta.warnings?.[0] ?? "");
      if (reacaoLog) addLogEntry("recurso", `Console — defesa declarada. ${reacaoLog}`);
      return {
        usouReacao: mutation.meta.usedReaction === true,
        penalidade: mutation.meta.reactionPenalty ?? 0,
        defesasSemReacao: mutation.meta.defensesWithoutReaction ?? 0,
      };
    },

    /**
     * A rolagem do PAINEL — atributo, perícia, modificador e CD como a
     * pessoa configurou, e as faces vindas dos dados 3D quando eles
     * rolaram (`dados`). Sem `dados`, sorteia — é o caminho de quando
     * não há mesa física por perto.
     *
     * `resolverPericia` é a mesma regra de `rollPericia`, só que a
     * partir de dados que já existem: é o que deixa os d8 de verdade da
     * mesa e o sorteio interno terminarem no MESMO resultado.
     */
    rolarTeste: ({ atributoId, periciaId, modificador, cd, dados, visibilidade, intencao, publicar }) => {
      const atributoDef = regras?.atributos.find((a) => a.id === atributoId);
      const periciaDef = periciaId ? regras?.pericias.find((p) => p.id === periciaId) : null;
      const params = {
        atributoId,
        atributoNome: atributoDef?.nome ?? atributoId,
        atributoValor: character.atributos[atributoId],
        periciaId: periciaId ?? undefined,
        periciaNome: periciaDef?.nome,
        periciaValor: periciaId ? character.pericias[periciaId] ?? 0 : 0,
        modificador,
        cd: cd ?? undefined,
      };
      const r = dados && dados.length > 0 ? resolverPericia(params, dados) : rollPericia(params);
      const alvo = periciaDef?.nome ?? atributoDef?.nome ?? atributoId;
      addLogEntry(
        "rolagem_pericia",
        `Console — ${alvo}: ${r.dados.join(", ")} → ${r.modoSelecao === "lowest" ? "menor" : "maior"} ${r.dadoEscolhido}, total ${r.total}${cd != null ? ` (CD ${cd})` : ""}.`,
      );
      if (publicar !== false) void publicarRolagemNaMesa(atributoId, periciaId, r.dados, modificador, cd, visibilidade, intencao ?? null);
      return r;
    },

    // Mesma regra data-driven do controle manual de Reação do harness
    // (`handleUseReactionManual`) — só que combinada com a rolagem em
    // vez de um botão separado, e a penalidade cumulativa (se houver)
    // já entra como `modificador` da própria rolagem.
    rolarDefesa: (periciaId) => {
      const current = characterRef.current;
      const mutation = applyConsoleMutation(
        current,
        { type: "defense" },
        { derived: derivados, rules: regras, reactionRules },
      );
      if (mutation.character !== current) {
        characterRef.current = mutation.character;
        setCharacter(mutation.character);
      }
      const def = regras?.pericias.find((p) => p.id === periciaId);
      const candidato = def?.atributo_primario;
      const atributoId: keyof CharacterAttributes =
        candidato === "corpo" || candidato === "mente" || candidato === "animo" ? candidato : "corpo";
      const atributoDef = regras?.atributos.find((a) => a.id === atributoId);
      const r = rollPericia({
        atributoId,
        atributoNome: atributoDef?.nome ?? atributoId,
        atributoValor: character.atributos[atributoId],
        periciaId,
        periciaNome: def?.nome,
        periciaValor: character.pericias[periciaId] ?? 0,
        modificador: mutation.meta.reactionPenalty ?? 0,
      });
      const reacaoLog = mutation.meta.defenseWithoutReaction
        ? `Defesa sem Reação: ${mutation.meta.defensesWithoutReactionBefore ?? 0} → ${mutation.meta.defensesWithoutReaction ?? 0}; penalidade ${mutation.meta.reactionPenalty ?? 0}.`
        : mutation.meta.usedReaction
          ? `Reações usadas: ${mutation.meta.reactionBefore ?? 0} → ${mutation.meta.reactionAfter ?? 0}.`
          : (mutation.meta.warnings?.[0] ?? "");
      addLogEntry(
        "rolagem_pericia",
        `Console — ${def?.nome ?? periciaId} (defesa): ${r.dados.join(", ")} → ${r.modoSelecao === "lowest" ? "menor" : "maior"} ${r.dadoEscolhido}, total ${r.total}. ${reacaoLog}`,
      );
      // A penalidade de Reação entra como modificador da rolagem, então
      // vai junto pra mesa — senão o total publicado não bateria com o
      // que a pessoa viu na ficha.
      void publicarRolagemNaMesa(atributoId, periciaId, r.dados, mutation.meta.reactionPenalty ?? 0);
      return {
        resultado: r,
        usouReacao: mutation.meta.usedReaction === true,
        penalidade: mutation.meta.reactionPenalty ?? 0,
        defesasSemReacao: mutation.meta.defensesWithoutReaction ?? 0,
      };
    },

    editarRecurso: (id, valor, opcoes) => updateRecursoAtual(id, valor, opcoes),
    editarIntegridade: (valor) => updateRecursoAtual("integridade", valor),
    ajustarPa: (delta) => ajustarPaConsole(delta),
    ajustarReacoes: (delta) => ajustarReacoesConsole(delta),

    usarSobrecarga: (tipo, danoRolado) => void handleUseOverloadSurge(tipo, danoRolado),
    dadoDoSurto: getOverloadSurgeDamageDie(regras?.sobrecarga),
    removerSobrecarga: () => void handleRemoveOverloadSurge(),
    descansar: (tipo) => void (tipo === "curto" ? handleApplyShortRest() : handleApplyLongRest({ jaConfirmado: true })),
    tiposDeSurto: OVERLOAD_SURGE_TYPES,
    // Ruptura pendente bloqueia novos surtos até o próximo descanso longo.
    podeUsarSobrecarga: !(character.ruptura_pendente ?? false),

    avancarColapso: handleAdvanceCollapseSegmentManual,
    aplicarTesteDecisivoColapso: (dados) => void handleResolveCollapseDecisiveTest(dados),
    estabilizarColapso: handleStabilizeCollapse,

    equiparNoSlot: (instanceId: string, slot: BodySlotId) => {
      const instancia = character.inventario?.find((i) => i.id === instanceId);
      const modelo = instancia ? itemsIniciais.find((m) => m.slug === instancia.itemSlug) : undefined;
      if (!instancia || !modelo) return;
      // Armadura/escudo passam pelo fluxo defensivo (MIT/PD ativos);
      // o resto é só mudança de estado de loadout.
      if (modelo.categoria === "armadura" || modelo.categoria === "escudo") {
        handleEquipDefensive(instanceId);
        return;
      }
      if (slot === "arma_primaria" || slot === "arma_secundaria" || slot === "acesso_rapido_1" || slot === "acesso_rapido_2") {
        // A mão/posição escolhida fica gravada — sem isto a ordem de
        // aquisição decidia, e a secundária virava primária.
        const next = setItemEmEncaixe(characterRef.current, instanceId, slot);
        characterRef.current = next;
        setCharacter(next);
        return;
      }
      handleSetItemEstado(instanceId, "acesso_rapido");
    },
    desequipar: (instanceId: string) => {
      const instancia = character.inventario?.find((i) => i.id === instanceId);
      if (instancia?.equipadoDefensivo) handleUnequipDefensive(instanceId);
      else handleSetItemEstado(instanceId, "mochila");
    },
    definirMit: handleSetMitAtual,
    definirPd: handleSetPdAtual,
    recarregar: handleReloadWeapon,

    /* Inventário. Nenhuma regra nova mora aqui: cada uma destas é a
       porta para um fluxo que já existia e já loga/salva. */
    moverItemPara: (instanceId, estado) => {
      const instancia = character.inventario?.find((i) => i.id === instanceId);
      // Armadura/escudo ATIVOS têm MIT/PD vivos; tirá-los do corpo passa
      // pelo fluxo defensivo, senão a fonte de MIT some sem desligar.
      if (instancia?.equipadoDefensivo && estado !== "equipado") {
        handleUnequipDefensive(instanceId);
      }
      handleSetItemEstado(instanceId, estado);
    },
    usarItem: (instanceId) => void handleUseItem(instanceId),
    /**
     * Saldo de carteira (INV-03). Mesmo padrão das demais mutações da
     * ficha: altera o personagem em memória e deixa a persistência
     * para o salvamento, que passa por `update_character_sheet_payload`
     * — a RPC revalida controle e participação ativa no servidor.
     *
     * Nunca negativo: saldo devedor não existe no contrato (PRD 13.1),
     * e deixar um número abaixo de zero aqui criaria um estado que o
     * resto do sistema não sabe ler.
     */
    definirCarteira: (walletId, valor) => {
      const atual = characterRef.current.carteira ?? { aretz_informal: 0, cdi: 0, cdi_craqueada: 0 };
      const novo = Math.max(0, Math.round(valor));
      if (atual[walletId] === novo) return;
      const next = { ...characterRef.current, carteira: { ...atual, [walletId]: novo } };
      characterRef.current = next;
      setCharacter(next);
    },
    ajustarQuantidade: (instanceId, delta) => {
      const next = adjustItemQuantity(characterRef.current, instanceId, delta);
      characterRef.current = next;
      setCharacter(next);
    },
    descartarItem: handleRemoveItem,
    comprarItem: handleBuyItem,
    carga: cargaAtual,
    glossario: glossarioDeRegras,
    /* As propriedades saem inteiras de `deriveItemProperties` — modelo,
       runas instaladas e técnicas juntas, já resolvidas. Aqui só vira
       termo com dica; o Console não interpreta propriedade. */
    propriedadesDoItem: (instanceId: string) => {
      const instancia = character.inventario?.find((i) => i.id === instanceId);
      if (!instancia) return [];
      return deriveItemProperties({
        instance: instancia,
        item: itemsIniciais.find((m) => m.slug === instancia.itemSlug),
        properties: propertiesIniciais,
        runes: runesIniciais,
      }).map((p) => ({
        tipo: "propriedade" as const,
        slug: p.slug,
        nome: p.label,
        descricao: p.description ?? null,
      }));
    },

    adicionarCondicao: (input) => void handleAddCondition(input),
    removerCondicao: (id) => void handleRemoveCondition(id),
    condicoesDisponiveis: condicoesDisponiveis.map((c) => ({
      slug: c.slug,
      nome: c.nome,
      descricao_curta: c.descricao_curta,
      nivel_maximo: c.nivel_maximo,
    })),

    // `pinned` ainda não existe no payload do personagem — os três slots
    // ficam livres até o modelo existir, sem simular conteúdo.
    pins: consolePins,
    removerPin: (id) => setConsolePins((atuais) => atuais.filter((p) => p.id !== id)),

    erro: saveState === "error" ? errorMessage : null,
  };


  if (acaoToken) {
    let opcoes: OpcaoAcaoToken[] = [];
    if (acaoToken.categoria === "atacar" && attackActionContent) {
      const acao = actionConsoleItems.find(a => a.id === attackActionContent.id);
      opcoes = attackWeaponCandidates.map(c => {
        const modelo = itemsIniciais.find(i => i.slug === c.itemSlug) ?? null;
        const resolucao = resolveAttackDetails(character, attackActionContent, modelo);
        const municao = c.instanceId && modelo?.usesAmmunition ? checkAttackAmmoBlock(character, itemsIniciais, { weaponInstanceId: c.instanceId }) : null;
        return { id: c.instanceId ?? "__desarmado__", nome: c.nome, custo: acao?.custoLabel ?? "Custo indisponível", aviso: acao?.warning, alvo: "obrigatorio", pericia: resolucao.skill,
          fatos: [{ rotulo: "Dano-base", valor: resolucao.danoBase ?? "—" }, { rotulo: "Perícia", valor: regras?.pericias.find(p => p.id === resolucao.skill)?.nome ?? resolucao.skill ?? "—" }],
          detalhe: "Após confirmar, abre a rolagem. Com alvo, o ataque segue no chat: o alvo defende, você escolhe a região pela margem e o narrador aplica o dano.",
          bloqueio: !acao?.enabled ? acao?.disabledReason ?? "Ação indisponível." : municao ? "Munição indisponível; confira arma e aljava na ficha." : !resolucao.skill ? "Perícia de ataque não definida no catálogo." : null };
      });
    } else if (acaoToken.categoria === "conjurar") {
      opcoes = spellsIniciais.filter(s => s.status === "published" && isSpellLearned(character, s.slug)).map(s => {
        const teste = castSpell({ character, spell: s, paMax: derivados.pa_max, manaMax: derivados.mana_max });
        return { id: s.slug, nome: s.nome, custo: `${s.estatisticas.custo_pa} PA · ${s.estatisticas.custo_mana ?? "não definido"} Mana`, alvo: "opcional",
          fatos: [{ rotulo: "Alcance", valor: s.estatisticas.alcanceTexto ?? "—" }],
          detalhe: "Resistências e efeitos no alvo são resolvidos manualmente.", aviso: teste.ok ? teste.reason : undefined, bloqueio: teste.ok ? null : teste.reason };
      });
    } else if (acaoToken.categoria === "item") {
      opcoes = (character.inventario ?? []).flatMap(i => {
        const m = catalogoItens.get(i.itemSlug);
        if (!m || !deriveItemUseKind(m)) return [];
        const preview = getItemUsePreview(m, character);
        const proprio = deriveItemUseKind(m) === "pharmacy";
        const custoPa = getItemUsePaCost(m);
        const paAtual = Math.max(0, derivados.pa_max - (character.estado_jogo?.pa_gastos ?? 0));
        return [{ id: i.id, nome: `${i.itemNome || m.nome} · ${i.quantidade} un.`, alvo: proprio ? "proprio" : "opcional",
          custo: `${custoPa ?? m.custoPaUsoTexto ?? "conforme regra do item"} PA · consome 1 uso`,
          aviso: custoPa != null && custoPa > paAtual ? `PA insuficiente (atual: ${paAtual}, necessário: ${custoPa}).` : undefined,
          detalhe: [...preview.automatic, ...preview.manual, ...(proprio ? ["Uso em si mesmo. Uso em aliados permanece no fluxo da ficha."] : [])].join(" "),
          bloqueio: i.quantidade <= 0 ? "Sem estoque." : preview.blockedReason } satisfies OpcaoAcaoToken];
      });
    }
    const executar = async (opcao: OpcaoAcaoToken, alvoId: string | null) => {
      const r = await contextoAcaoTokenAction(acaoToken.tokenId, alvoId);
      if (!r.ok || !r.dados) throw new Error(r.erro ?? "Contexto indisponível.");
      if (r.dados.actorCharacterId !== characterId || r.dados.campaignId !== selectedCampaignId) throw new Error("O personagem mudou. Reabra as ações do token.");
      const antes = characterRef.current;
      if (acaoToken.categoria === "atacar") {
        if (!attackActionContent || !getAttackWeaponCandidates(antes, itemsIniciais).some(c => (c.instanceId ?? "__desarmado__") === opcao.id)) throw new Error("Arma indisponível.");
        const ok = await handleUseAction(attackActionContent.id, opcao.id === "__desarmado__" ? null : opcao.id, r.dados);
        if (!ok) throw new Error("Ataque bloqueado. Confira PA, condições e munição.");
        const ctx = r.dados;
        const desarmado = opcao.id === "__desarmado__" ? resolveAttackDetails(antes, attackActionContent, null) : null;
        if (opcao.pericia) setRolagemToken({
          pericia: opcao.pericia,
          nome: `Atacar · ${opcao.nome}${ctx.alvoNome ? ` → ${ctx.alvoNome}` : ""}`,
          visibilidade: ctx.logVisibility,
          // Com alvo, a rolagem abre o ATAQUE CONTESTADO no chat: a
          // defesa, a região (pela margem) e o dano seguem no cartão.
          onRolado: ctx.alvoTokenId ? (entrada) => {
            void declararAtaqueAction({
              campaignId: ctx.campaignId,
              actorTokenId: ctx.actorTokenId,
              alvoTokenId: ctx.alvoTokenId!,
              armaInstanceId: opcao.id === "__desarmado__" ? null : opcao.id,
              armaNome: opcao.nome,
              ...entrada,
              desarmado: desarmado ? { danoFormula: desarmado.danoBase, tipoDano: desarmado.tipoDano, subtipoDano: desarmado.subtipoDano } : null,
            }).then((d) => { if (!d.ok) addLogEntry("recurso", `Ataque não registrado na mesa: ${d.erro ?? "erro desconhecido"}.`); });
          } : undefined,
        });
      } else if (acaoToken.categoria === "conjurar") await handleCastSpell(opcao.id, r.dados);
      else await handleUseItem(opcao.id, undefined, r.dados);
      if (characterRef.current === antes) throw new Error("Ação não executada. Confira os recursos e as condições de uso na ficha.");
    };
    return <>
      <PainelAcaoToken key={`${acaoToken.tokenId}:${acaoToken.categoria}`} pedido={acaoToken} nome={character.nome} opcoes={opcoes} alvos={alvosNoMapa}
        erroCatalogo={acaoToken.categoria === "atacar" ? combatActionsError : acaoToken.categoria === "conjurar" ? spellsError : itemsError}
        erroGravacao={consoleApi.erro} onExecutar={executar}
        onConcluir={() => { if (acaoToken.categoria !== "atacar") consoleCloseOverride?.(); }}
        onFechar={() => { setRolagemToken(null); consoleCloseOverride?.(); }} />
      {rolagemToken && <PainelRolagem api={consoleApi} prefill={{ tipo: "pericia", periciaId: rolagemToken.pericia }} acaoToken={rolagemToken} onFechar={() => { setRolagemToken(null); consoleCloseOverride?.(); }} />}
    </>;
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      {consoleAberto && (
        <ConsoleErrorBoundary>
          <CharacterConsole
            aberto={consoleAberto}
            onClose={() => {
              setConsoleAberto(false);
              // Rota interceptada (modal sobre Personagens): fechar
              // literalmente volta para a página de origem em vez de
              // deixar a ficha clássica visível na URL /ficha.
              consoleCloseOverride?.();
            }}
            api={consoleApi}
            // "Mercado" da mesa pede a aba antiga "inventario": no Console é a Mochila (onde fica a loja provisória).
            abaInicial={initialTab === "inventario" ? "mochila" : undefined}
          />
        </ConsoleErrorBoundary>
      )}
      <button
        type="button"
        data-testid="abrir-console"
        onClick={() => setConsoleAberto(true)}
        style={{ ...buttonStyle, marginBottom: 12 }}
      >
        Abrir Console do Personagem
      </button>
      {/* A legenda dizia 'Edição é local até clicar em "Salvar
          personagem"'. Desde o autosave isso é falso, e o botão não
          existe mais. Só sobrou o aviso do ambiente de dev. */}
      {mode === "dev" && (
        <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
          /dev/character-sheet — ficha mínima (dev).
        </p>
      )}
      {mode === "dev" && characterId && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <span data-testid="ficha-sync-status" style={{ fontSize: 11, color: describeRealtimeStatus(characterSyncStatus, "ficha").cor }}>
            ● {describeRealtimeStatus(characterSyncStatus, "ficha").texto}
          </span>
          <span data-testid="ficha-data-sync-status" style={{ fontSize: 11, color: CHARACTER_DATA_SYNC_LABEL[characterDataSyncState].cor }}>
            {CHARACTER_DATA_SYNC_LABEL[characterDataSyncState].texto}
          </span>
          <button data-testid="ficha-recarregar" onClick={refetchCharacterFromRealtime} style={{ ...buttonStyle, padding: "3px 10px", fontSize: 11 }}>
            Atualizar agora
          </button>
        </div>
      )}
      {mode === "dev" && saveState === "error" && errorMessage && (
        // Checkpoint v0.65 — visível em QUALQUER aba (não só Geral), já
        // que a persistência automática de ações do Console pode falhar
        // enquanto o jogador está na aba Ações. A mudança local já
        // aconteceu e não é revertida; "Salvar personagem" (aba Geral)
        // continua disponível para tentar de novo manualmente.
        <p data-testid="ficha-erro-persistencia" style={{ fontSize: 11, color: "#ff6b6b", marginBottom: 8 }}>
          ⚠ {errorMessage}
        </p>
      )}
      {pendingRemoteCharacter && (
        <div
          data-testid="ficha-remoto-pendente-banner"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            background: "#241d10",
            border: "1px solid #f5a623",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <span>⚠ Há uma versão mais recente no servidor. Recarregar estado?</span>
          <button data-testid="ficha-remoto-recarregar" onClick={handleAcceptRemoteCharacter} style={{ ...buttonStyle, padding: "3px 10px", fontSize: 12 }}>
            Recarregar do servidor
          </button>
          <button data-testid="ficha-remoto-manter-local" onClick={handleKeepLocalCharacter} style={{ ...buttonStyle, padding: "3px 10px", fontSize: 12, opacity: 0.8 }}>
            Manter minha versão
          </button>
        </div>
      )}
      {mode === "dev" && usandoFallback && (
        <p style={{ color: "#f5a623", fontSize: 13, marginBottom: 16 }}>
          ⚠ regras_personagem não veio do banco — usando fórmulas de fallback temporárias.
        </p>
      )}
      {mode === "dev" && autoHealBanner && (
        <div
          data-testid="auto-heal-banner"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            background: "#15251a",
            border: "1px solid #4caf50",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <span>
            ✚ Removida(s) automaticamente por cura (PV {autoHealBanner.pvAnterior} → {autoHealBanner.pvNovo}):{" "}
            <strong>{autoHealBanner.nomes.join(", ")}</strong>.
          </span>
          <button data-testid="auto-heal-desfazer-button" onClick={handleUndoAutoHeal} style={buttonStyle}>
            Desfazer
          </button>
          <button
            data-testid="auto-heal-dispensar-button"
            onClick={() => setAutoHealBanner(null)}
            style={{ ...buttonStyle, opacity: 0.7 }}
          >
            Dispensar
          </button>
        </div>
      )}
      {/* ══ A FICHA ANTIGA ═════════════════════════════════════════
          Só em `dev`. Em PRODUTO ela não é mais renderizada.

          Ela ficava montada EMBAIXO do Console, que abre automaticamente
          em `/ficha` — e isso não era neutro: 18 controles interativos
          ficavam cobertos pela janela, entre eles "Salvar personagem",
          medido em (440,413), dentro da área do Console. Quem editava PV
          não tinha como salvar sem fechar a ficha para salvar a ficha, e
          nada avisava que havia mudança pendente.

          O Console é a ficha hoje. A de baixo é trabalho antigo, e
          mantê-la montada só criava uma segunda interface invisível
          competindo com a primeira.

          O que NÃO vem aqui dentro, de propósito: o estado de
          sincronização, o aviso de erro de gravação, o banner de
          auto-heal e o diálogo de conflito remoto. Aqueles não são "a
          página velha" — são retorno sobre o que está acontecendo com
          ESTE personagem, e sumir com eles devolveria a falha silenciosa
          que o autosave acabou de resolver. ══ */}
      {mode !== "product" && (<>

      <ActiveStateStrip
        condicoes={character.condicoes_ativas ?? []}
        activeEffects={activeEffects}
        conditionContents={conditionContents}
        onVerCondicoes={() => setActiveTab("condicoes")}
        pvTemporario={character.recursos_atuais?.pv_temporario ?? 0}
        manaTemporaria={character.recursos_atuais?.mana_temporaria ?? 0}
        sobrecargaUsadaDia={character.sobrecarga_usada_dia ?? 0}
        rupturaPendente={character.ruptura_pendente ?? false}
        colapso={character.colapso}
      />

      <CharacterSheetTabs
        activeTab={activeTab}
        personagensCount={personagens.length}
        onChange={setActiveTab}

      />

      {activeTab === "geral" && (
        <GeneralTab
          mode={mode}
          nome={character.nome}
          metadados={character.metadados}
          characterId={characterId}
          schemaVersion={character.metadados?.schema_version}
          saveState={saveState}
          errorMessage={errorMessage}
          sheetMode={sheetMode}
          onModeChange={alternarModo}
          onNomeChange={(value) => setCharacter((prev) => ({ ...prev, nome: value }))}
          onSave={handleSave}
          mesas={mesas}
          selectedCampaignId={selectedCampaignId}
          onSelectCampaign={handleSelectCampaign}
          onLoadPersonagemAtivo={handleLoadPersonagemAtivo}
          historicoEvolucao={character.historico_evolucao ?? []}
        />
      )}

      {activeTab === "atributos" && (
        <AttributesTab
          atributos={character.atributos}
          definitions={regras?.atributos}
          readOnly={sheetMode === "jogo"}
          onChange={updateAtributo}
          onRoll={handleRollAtributo}
        />
      )}

      {activeTab === "pericias" && (
        <SkillsTab
          pericias={character.pericias}
          definitions={regras?.pericias}
          readOnly={sheetMode === "jogo"}
          onChange={updatePericia}
          onRoll={handleRollPericia}
        />
      )}

      {activeTab === "recursos" && (
        <ResourcesTab
          regras={regras}
          formulaLabels={(character as { progressao?: { formulas_derivados_texto?: Record<string, string> } }).progressao?.formulas_derivados_texto}
          derivados={derivados}
          recursosAtuais={character.recursos_atuais}
          onChangeRecursoAtual={updateRecursoAtual}
          onRestoreMax={handleRestoreRecursosMax}
          estadoJogo={character.estado_jogo}
          penalidadeDefensivaAtual={reactionAvailability.currentOverflowPenalty}
          onGastarPA={() => adjustEstadoJogo("pa_gastos", 1)}
          onDesfazerPA={() => adjustEstadoJogo("pa_gastos", -1)}
          onResetarPA={() => resetEstadoJogo("pa_gastos")}
          onUsarReacao={handleUseReactionManual}
          onDesfazerReacao={handleUndoReactionManual}
          onResetarReacoes={handleResetReactions}
          atributos={character.atributos}
          onApplyShortRest={handleApplyShortRest}
          onApplyLongRest={() => void handleApplyLongRest()}
          sobrecargaUsadaDia={character.sobrecarga_usada_dia ?? 0}
          rupturaEspecialAscensao={character.ruptura_especial_ascensao ?? null}
          rupturaPendente={character.ruptura_pendente ?? false}
          overloadWillRollPending={overloadWillRollPending}
          onUseOverloadSurge={handleUseOverloadSurge}
          onRollOverloadWillTest={handleRollOverloadWillTest}
          colapso={character.colapso}
          onStabilizeCollapse={handleStabilizeCollapse}
          onAdvanceCollapseSegment={handleAdvanceCollapseSegmentManual}
          onRollCollapseTest={handleRollCollapseTest}
          currentRound={character.current_round ?? 1}
          onEndRound={handleEndRoundForCharacter}
          endRoundSummary={endRoundSummary}
          ultimaVontadePendente={character.ultima_vontade_pendente ?? false}
          ruptureChoices={character.pending_rupture_choices ?? []}
          onResolveRuptureChoice={handleResolveRuptureChoice}
        />
      )}

      {activeTab === "condicoes" && (
        <ConditionsTab
          condicoes={character.condicoes_ativas ?? []}
          condicoesDisponiveis={condicoesDisponiveis}
          activeEffects={activeEffects}
          pendingChecks={character.pending_condition_checks ?? []}
          temporaryEffects={getActiveTemporaryEffects(character)}
          onRemoveTemporaryEffect={handleRemoveTemporaryEffect}
          onResolveCheck={handleResolveConditionCheck}
          onAdd={handleAddCondition}
          onRemove={handleRemoveCondition}
        />
      )}


      {activeTab === "inventario" && (
        <InventoryTab
          items={itemsIniciais}
          catalogError={itemsError}
          carteira={character.carteira ?? { aretz_informal: 0, cdi: 0, cdi_craqueada: 0 }}
          inventario={character.inventario ?? []}
          condicoesAtivas={character.condicoes_ativas ?? []}
          colapso={character.colapso}
          onBuy={handleBuyItem}
          onChangeCarteira={handleChangeCarteira}
          onSetEstado={handleSetItemEstado}
          onRemoveItem={handleRemoveItem}
          onUseItem={handleUseItem}
          runes={runesIniciais}
          runesError={runesError}
          onInstallRune={handleInstallRune}
          onRemoveRune={handleRemoveRune}
          installedRuneIdsWithEffect={installedRuneIdsWithEffect}
          properties={propertiesIniciais}
          onEquipDefensive={handleEquipDefensive}
          onUnequipDefensive={handleUnequipDefensive}
          onSetMitAtual={handleSetMitAtual}
          onSetPdAtual={handleSetPdAtual}
          onSetMunicaoAtual={handleSetMunicaoAtual}
          onSetFlechaQuantidade={handleSetFlechaQuantidade}
          onStoreFletchas={handleStoreFletchas}
          onWithdrawFletchas={handleWithdrawFletchas}
          onReloadWeapon={handleReloadWeapon}
          onSelectAljava={handleSelectAljava}
          onSelectFlechaAtiva={handleSelectFlechaAtiva}
          isConnectedToCampaign={Boolean(characterId && selectedCampaignId)}
          onSendToCrew={handleSendItemToCrew}
          allies={alliesAtivos}
          onUseItemOnAlly={handleUseItemOnAlly}
          onRefreshAllies={() => selectedCampaignId && refreshAlliesAtivos(selectedCampaignId)}
          onApplyShieldDamage={handleApplyShieldDamage}
          currentCharacterId={characterId}
        />
      )}

      {activeTab === "magias" && (
        <SpellsTab
          spells={spellsIniciais}
          catalogError={spellsError}
          magiasAprendidas={character.magias_aprendidas ?? []}
          niveisVertente={character.niveis_vertente ?? {}}
          sheetMode={sheetMode}
          onLearn={handleLearnSpell}
          onForget={handleForgetSpell}
          onCast={handleCastSpell}
          onCastWithFusion={handleCastSpellWithFusion}
          onRollDamage={handleRollSpellDamage}
          onSetVertenteLevel={handleSetVertenteLevel}
        />
      )}

      {activeTab === "biblioteca" && (
        <BibliotecaTab
          properties={propertiesIniciais}
          propertiesError={propertiesError}
          runes={runesIniciais}
          runesError={runesError}
          escalpos={escalposIniciais}
          escalposError={escalposError}
          escalposInstalados={character.escalpos_instalados ?? []}
          onInstallEscalpo={handleInstallEscalpo}
          onRemoveEscalpo={handleRemoveEscalpo}
          installedEscalpoIdsWithEffect={installedEscalpoIdsWithEffect}
        />
      )}

      {activeTab === "acoes" && (
        <ActionsTab
          actions={actionConsoleItems}
          paAtual={Math.max(0, derivados.pa_max - (character.estado_jogo?.pa_gastos ?? 0))}
          paMax={derivados.pa_max}
          reacaoAtual={Math.max(0, derivados.reacoes_por_rodada - (character.estado_jogo?.reacoes_usadas ?? 0))}
          reacaoMax={derivados.reacoes_por_rodada}
          defesasSemReacao={reactionAvailability.defensesWithoutReaction}
          penalidadeDefensivaAtual={reactionAvailability.currentOverflowPenalty}
          catalogError={combatActionsError}
          executingActionId={executingActionId}
          onExecute={(id, opcao) => void handleUseAction(id, undefined, undefined, opcao)}
          onRoll={handleRollAction}
          attackWeaponOptions={attackWeaponCandidates.map((c) => ({ instanceId: c.instanceId, nome: c.nome }))}
          selectedAttackWeaponId={effectiveSelectedAttackWeaponId}
          onSelectAttackWeapon={(id) => setSelectedAttackWeaponId(id ?? "__desarmado__")}
          attackPreview={attackPreview}
        />
      )}

      {activeTab === "rolagens" && (
        <RollsTab
          atributos={character.atributos}
          atributoDefinitions={regras?.atributos}
          pericias={character.pericias}
          periciaDefinitions={regras?.pericias}
          preparedRoll={preparedRoll}
          onPreparedRollApplied={() => setPreparedRoll(null)}
          onLog={addLogEntry}
          campaignId={selectedCampaignId}
          characterId={characterId}
          characterNome={character.nome}
          activeEffects={activeEffects}
        />
      )}

      {activeTab === "log" && <LogTab log={log} onClear={() => setLog([])} />}

      {activeTab === "mesa" && (
        <>
          <MesaTab
            campaignId={selectedCampaignId}
            mesaNome={mesas.find((m) => m.id === selectedCampaignId)?.name ?? null}
            characterId={characterId}
            characterNome={character.nome}
          />
        </>
      )}

      {mode === "dev" && activeTab === "personagens" && (
        <SavedCharactersTab
          personagens={personagens}
          characterId={characterId}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      )}

      {mode === "dev" && activeTab === "debug" && (
        <DebugTab
          characterId={characterId}
          schemaVersion={character.metadados?.schema_version}
          saveState={saveState}
          errorMessage={errorMessage}
          personagensCount={personagens.length}
          usandoFallback={usandoFallback}
        />
      )}
      </>)}
    </main>
  );
}
