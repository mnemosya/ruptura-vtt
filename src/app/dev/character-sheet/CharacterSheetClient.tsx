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
  computeDerivedStats,
  normalizeCharacter,
  deriveActiveEffectsFromConditions,
  applyAutoHealRemoval,
  undoAutoHealRemoval,
  applyShortRest,
  applyLongRest,
  useOverloadSurge,
  getOverloadMaxPerDay,
  getOverloadSurgeDamageDie,
  getOverloadWillTestRule,
  applyStunFromFailedWillTest,
  detectCollapseOnResourceChange,
  advanceCollapseSegment,
  stabilizeCollapse,
  resolveCollapseEndRound,
  resolveCollapseAdditionalDamage,
  MAX_COLLAPSE_SEGMENTS,
  gainPm,
  spendPm,
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
  deriveActiveEffectsFromTalents,
  deriveActiveEffectsFromTemporaryEffects,
  tickRoundTemporaryEffects,
  addTemporaryEffect,
  removeTemporaryEffect,
  getActiveTemporaryEffects,
  formatTemporaryEffectSummary,
  deriveInstalledTechnicalEffects,
  deriveInstalledRuneEffects,
  acquireTalentLevel,
  removeTalentLevel,
  getUsableTalentEffects,
  getTalentContextualOpportunities,
  getTalentSpellRangeAreaMultiplier,
  applyRangeAreaMultiplierToText,
  getTalentOverloadLimitOverride,
  applyAscensaoSpecialRupture,
  getSpellAttackProfile,
  getCanalizarState,
  markCanalizarUsed,
  useTalentEffect,
  toggleTalentEffect,
  resetTalentUse,
  resetTalentUses,
  purchaseItem,
  setItemLoadoutState,
  applyToqueDeMidas,
  endToqueDeMidas,
  applyShieldDamage,
  expireItemTemporaryEffects,
  deriveActiveEffectsFromItemTemporaryEffects,
  getBricolagemModifier,
  registerBricolagemVulnerabilidade,
  consumeBricolagemUse,
  endBricolagemVulnerabilidade,
  getBricolagemTag,
  getBricolagemActiveEffects,
  getGambiarraAvailability,
  registerGambiarraExpressa,
  endGambiarraExpressa,
  getMarginPromotions,
  getMirarModifier,
  confirmMirarResult,
  isMirarActive,
  getMirarActiveEffects,
  consumeMirar,
  endMirar,
  MIRAR_TAG,
  startFurtividade,
  isFurtividadeActive,
  endFurtividade,
  confirmCamuflagemOpticaMovement,
  hasCamuflagemOptica,
  hasAtaqueFatal,
  getGatilhoQuenteAvailability,
  consumeGatilhoDado,
  consumeGatilhoDados,
  hasBangBangSegundoDisparo,
  getShowdownAvailability,
  markShowdownUsed,
  hasTotemBencao,
  getTotemBencaoTokenAvailability,
  markTotemBencaoTokenUsed,
  getGarimpoDeRuaAvailability,
  activateGarimpoDeRua,
  getCadernetaDeDividaAvailability,
  markCadernetaDeDividaUsed,
  isRaridadeDentroDoLimite,
  getRedeDeFavoresAvailability,
  markRedeDeFavoresUsed,
  getZeDaEsquinaAvailability,
  markZeDaEsquinaUsed,
  getGatoDeTelhadoAvailability,
  markGatoDeTelhadoUsed,
  getSaidaDosFundosAvailability,
  markSaidaDosFundosUsed,
  registerDrone,
  removeDrone,
  activateDrone,
  deactivateDrone,
  getSinalLimpoAvailability,
  applySinalLimpoBonus,
  expireDroneRoundBonuses,
  hasScript,
  setDroneGatilho,
  markDroneGatilhoOcorrido,
  getEnxameAvailability,
  pairDronesEnxame,
  unpairDrones,
  hasChaveDeArranque,
  registerRobo,
  removeRobo,
  programRobo,
  consumeRoboPrimeiroTesteBonus,
  getMarchaDuplaAvailability,
  applyMarchaDupla,
  expireMarchaDuplaRoundState,
  getOverclockAvailability,
  activateOverclock,
  resetRoboSceneState,
  iniciarTrama,
  encerrarTrama,
  adicionarElementoTrama,
  removerElementoTrama,
  ajustarRamTrama,
  ajustarDeteccaoTrama,
  getBypassAvailability,
  executarBypass,
  getAgulhaFinaAvailability,
  executarAgulhaFina,
  isPvGatedToggleAllowedToActivate,
  enforcePvGatedToggleDeactivation,
  hasSaqueFantasma,
  getEstocarAvailability,
  markEstocarUsed,
  getFalcaoAvailability,
  markFalcaoUsed,
  getBriefingDeCampoAvailability,
  getImposicaoDeRitmoAvailability,
  markImposicaoDeRitmoUsed,
  getEntrelinhasAvailability,
  markEntrelinhasUsed,
  getPuxarOsFiosAvailability,
  markPuxarOsFiosUsed,
  getProntoSocorroAvailability,
  markProntoSocorroUsed,
  applyProntoSocorroToAlly,
  getRitmoDeCampoAvailability,
  computeRitmoDeCampoReducao,
  getProtocoloDeEmergenciaAvailability,
  markProtocoloDeEmergenciaUsed,
  applyProtocoloDeEmergenciaToAlly,
  hasOndaSolidaria,
  getChamaRedobradaAvailability,
  markChamaRedobradaUsed,
  applyResourceDeltas,
  copyTemporaryEffect,
  doubleTemporaryEffectValue,
  doubleTemporaryEffectDuration,
  getEspetaculoMortalAvailability,
  markEspetaculoMortalUsed,
  getToqueDeMidasAvailability,
  getToqueDeMidasModifiersForTarget,
  markToqueDeMidasUsed,
  removeItemFromInventory,
  removeQuantityFromInventory,
  useItemOnCharacter,
  useItemOnAlly,
  installRuneOnItem,
  removeRuneFromItem,
  toggleInstalledRune,
  hasGatilhoRunico,
  hasEntalheRapido,
  hasSobregravacao,
  getSobregravacaoMultiplier,
  applySobregravacao,
  setSobregravacaoInstructedAllies,
  grantSobregravacaoAccess,
  hasSobregravacaoAccess,
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
  createCharacter,
  updateCharacter,
  getCharacter,
  listLegacyCharactersDev,
  deleteCharacter,
  getCharacterForProfileSession,
  saveCharacterForProfileSession,
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
  ConditionResistanceCheck,
  TalentContent,
  ItemContent,
  WalletId,
  ItemLoadoutState,
  SpellContent,
  InventoryItemInstance,
  AttackWeaponCandidate,
  TemporaryEffect,
} from "../../../lib/character";
import type { TechnicalContentItem } from "../../../lib/content";
import { rollPericia, type PreparedRoll } from "../../../lib/dice";
import {
  listCampaignProfiles,
  enterCampaignProfile,
  heartbeatCampaignProfile,
  leaveCampaignProfile,
  addLog,
} from "../../../lib/table/storage";
import { upsertCrewInventoryItem } from "../../../lib/table/crewInventory";
import { PROFILE_HEARTBEAT_INTERVAL_MS } from "../../../lib/table";
import type { Campaign, CampaignProfile } from "../../../lib/table";
import { useCharacterRealtime } from "../../../lib/realtime/useCharacterRealtime";
import { describeRealtimeStatus } from "../../../lib/realtime/tableRealtime";
import {
  getOrCreateBrowserSessionId,
  readProfileSessionToken,
  saveProfileSessionToken,
  clearProfileSessionToken,
  type StoredProfileSessionToken,
} from "../../../lib/table/browserSession";
import { computeProfileStatus } from "../../../lib/table/profileStatus";
import { CharacterSheetTabs, type TabId } from "./components/CharacterSheetTabs";
import { GeneralTab } from "./components/GeneralTab";
import { AttributesTab } from "./components/AttributesTab";
import { SkillsTab } from "./components/SkillsTab";
import { ResourcesTab } from "./components/ResourcesTab";
import { RollsTab } from "./components/RollsTab";
import { LogTab, type LogEntry, type LogTipo } from "./components/LogTab";
import { ConditionsTab, type ConditionOption } from "./components/ConditionsTab";
import { TalentsTab } from "./components/TalentsTab";
import { InventoryTab } from "./components/InventoryTab";
import { SpellsTab } from "./components/SpellsTab";
import { BibliotecaTab } from "./components/BibliotecaTab";
import { ActionsTab } from "./components/ActionsTab";
import { ActiveStateStrip } from "./components/ActiveStateStrip";
import { MesaTab } from "./components/MesaTab";
import TurnTrackPanel from "../../components/TurnTrackPanel";
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
  /** Talentos publicados na Biblioteca do Sistema (checkpoint v0.48) — fonte única da aba Talentos. */
  talentsIniciais: TalentContent[];
  talentsError: string | null;
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
  /**
   * Mesa/perfil pré-selecionados via query string (`?campaignId=...&
   * profileId=...`) — vindos de `/dev/join/[campaignId]` (checkpoint
   * v0.10). `null` quando a ficha é aberta diretamente, sem link.
   */
  initialCampaignId: string | null;
  initialProfileId: string | null;
  /**
   * "dev" (`/dev/character-sheet`) mantém todo o comportamento de
   * diagnóstico (lista global de personagens, seletor livre de
   * mesa/perfil, aba Debug). "product" (`/ficha`, checkpoint v0.24)
   * exige uma sessão de perfil real e válida (ver
   * `productSessionState` abaixo) antes de mostrar qualquer coisa, e só
   * carrega o personagem ATIVO do perfil da sessão — nunca a lista
   * global nem um personagem arbitrário.
   */
  mode: "dev" | "product";
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Estado da validação de sessão real de perfil (modo "product", v0.24):
 *   • "pending": ainda checando (efeito de validação ainda não rodou).
 *   • "no_params": `/ficha` foi aberta sem campaignId/profileId na URL.
 *   • "invalid": sessionId do navegador não é o dono do bloqueio deste
 *     perfil (nunca entrou, ou outra sessão assumiu o perfil).
 *   • "no_character": sessão válida, mas o perfil ainda não tem
 *     personagem ativo vinculado (ver dashboard /mesas/[campaignId]).
 *   • "left": o próprio jogador saiu do perfil nesta aba (botão "Sair
 *     do perfil") — precisa entrar de novo pelo convite.
 *   • "valid": sessão válida e personagem carregado — ficha liberada.
 */
type ProductSessionState = "pending" | "no_params" | "invalid" | "no_character" | "left" | "valid";

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Recurso atual: inteiro, sem teto (pode passar do máximo), nunca negativo. */
function parseRecursoAtual(rawValue: number): number {
  if (!Number.isFinite(rawValue)) return 0;
  return Math.max(0, Math.trunc(rawValue));
}

export default function CharacterSheetClient({
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
  talentsIniciais,
  talentsError,
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
  initialCampaignId,
  initialProfileId,
  mode,
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
  // Versão do personagem vinda do servidor via Realtime enquanto havia
  // edição local pendente — não nulo só quando a ficha está esperando o
  // usuário decidir entre "Recarregar do servidor" e "Manter minha versão".
  const [pendingRemoteCharacter, setPendingRemoteCharacter] = useState<Character | null>(null);
  // Estado do ciclo de sincronização automática do PERSONAGEM (distinto
  // do status do canal Realtime em si, `characterSyncStatus` abaixo) —
  // só para o indicador discreto da UI.
  const [characterDataSyncState, setCharacterDataSyncState] = useState<"synced" | "updating" | "pending_remote" | "error">("synced");
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [personagens, setPersonagens] = useState<CharacterRecord[]>(personagensIniciais);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("geral");
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
  /** Espadachim › Estocar (checkpoint talentos, Fase 4) — confirmação manual do jogador para o próximo Atacar (lâmina não é dado estruturado, mesmo critério de Aparar/Ripostar). */
  const [estocarAtivo, setEstocarAtivo] = useState(false);
  /**
   * Paramédico › Ritmo de Campo (checkpoint talentos, Fase 7) — "armado" para a PRÓXIMA
   * ação/item/magia de cura (ação do Console, item, ou magia — sem tag "cura" estruturada
   * no catálogo, então é confirmação manual do jogador em vez de detecção automática,
   * conforme decisão do checkpoint). Consumido automaticamente pelo primeiro dos três
   * fluxos que gastar PA depois de armado.
   */
  const [ritmoDeCampoAtivo, setRitmoDeCampoAtivo] = useState(false);
  /**
   * Totem › Onda Solidária/Chama Redobrada (checkpoint talentos, Fase 9) — snapshot do
   * ÚLTIMO efeito positivo real aplicado via item em UM aliado (o fluxo mais geral de
   * "aplicar efeito positivo em alguém" já construído nesta base). Onda Solidária copia
   * para um segundo aliado; Chama Redobrada dobra no mesmo alvo. `null` até o primeiro
   * uso de item em aliado nesta sessão.
   */
  const [ultimoEfeitoPositivoAliado, setUltimoEfeitoPositivoAliado] = useState<{
    targetCharacterId: string;
    targetNome: string;
    resourceDeltas: { resource: "pv" | "pe"; delta: number }[];
    temporaryEffects: TemporaryEffect[];
  } | null>(null);
  /** Rúnico › Sobregravação — instância com teste de Tecnomagia/Arcanismo CD 8 pendente de confirmação (terceiro tentando acessar o espaço extra). */
  const [sobregravacaoTestPending, setSobregravacaoTestPending] = useState<Record<string, true>>({});
  // Mesa (campaign) selecionada — estado de UI local, não persiste no
  // payload do personagem. Quando presente, RollsTab também grava cada
  // rolagem em table_logs (ver checkpoint v0.2 do relatório de Mesas).
  const [mesas, setMesas] = useState<Campaign[]>(mesasIniciais);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  // Perfis da mesa selecionada (campaign_profiles, migration 0004) — UI
  // local, recarregada toda vez que a mesa muda. Perfil escolhido aqui
  // também não persiste no payload do personagem, só serve para
  // "Carregar personagem ativo" e para anotar profileId/profileNickname
  // no payload das rolagens gravadas em table_logs (ver RollsTab).
  const [perfis, setPerfis] = useState<CampaignProfile[]>([]);
  /** Outros personagens ATIVOS na mesa (checkpoint pós-v0.71 — uso de item em aliado): um por perfil com `active_character_id` != o próprio personagem carregado. Recarregado ao trocar de mesa e ao abrir o painel "Usar em aliado" de um item. */
  const [alliesAtivos, setAlliesAtivos] = useState<{ id: string; nome: string; character: Character }[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  // Heartbeat dev de perfil (checkpoint v0.9) — sessionId é um id local
  // de navegador (localStorage), não autenticação real (ver
  // sessionId.ts e a migration 0005). null até o efeito de montagem
  // rodar no cliente (localStorage não existe durante SSR).
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Perfil que ESTA aba/sessão entrou via heartbeat (distinto de
  // `selectedProfileId`, que é só o perfil em foco no <select> — pode
  // estar olhando um perfil sem ter entrado nele).
  const [enteredProfile, setEnteredProfile] = useState<{ id: string; nickname: string } | null>(null);
  // Token REAL de sessão de perfil (checkpoint v0.30) — par
  // {profileSessionId, rawSessionToken} gerado por enterCampaignProfile
  // e guardado no localStorage por perfil (browserSession.ts). É o que
  // autoriza heartbeat/sair/ler/salvar personagem — nunca o sessionId
  // de navegador sozinho. Nulo até entrar (ou retomar de localStorage);
  // limpo ao sair ou quando o servidor rejeita o token.
  const [profileSessionToken, setProfileSessionToken] = useState<StoredProfileSessionToken | null>(null);
  // Aviso de sessão expirada (checkpoint v0.26, modo product/ficha) —
  // true quando o heartbeat desta aba foi rejeitado (outra sessão
  // assumiu o perfil, ou expireStaleProfileSessions liberou o
  // bloqueio por inatividade). Não bloqueia a ficha sozinho — só avisa;
  // a ficha continua legível/editável, mas o vínculo de "dono" do
  // perfil pode já ter mudado no banco.
  const [sessionExpiredWarning, setSessionExpiredWarning] = useState(false);
  // Tick local (atualizado a cada 5s) só para forçar recalcular o
  // status "Expirado" exibido na UI, comparando last_seen_at com o
  // relógio do navegador — não busca nada novo do servidor.
  const [nowTick, setNowTick] = useState(() => Date.now());
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
  // recarregar a página, igual sessionExpiredWarning.
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

  // sessionId só existe no navegador (localStorage) — gerado/lido uma
  // vez na montagem do componente, nunca durante SSR.
  useEffect(() => {
    setSessionId(getOrCreateBrowserSessionId());
  }, []);

  // Pré-seleção via link de mesa (/dev/join/[campaignId], checkpoint
  // v0.10): se a página foi aberta com ?campaignId=...&profileId=...,
  // seleciona a mesa (que já dispara o fetch de perfis) e, em seguida,
  // o perfil — roda só uma vez (didPrefillRef), sem depender de
  // sessionId (handleSelectCampaign não precisa dele). Só no modo dev —
  // o modo product tem seu próprio efeito de validação (mais abaixo),
  // que não usa seletor livre de mesa/perfil.
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (mode !== "dev" || didPrefillRef.current || !initialCampaignId) return;
    didPrefillRef.current = true;
    handleSelectCampaign(initialCampaignId).then(() => {
      if (initialProfileId) setSelectedProfileId(initialProfileId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialCampaignId, initialProfileId]);

  // Retomar heartbeat após vir de /dev/join: se o perfil pré-selecionado
  // já está bloqueado por ESTA MESMA sessão (porque a entrada já
  // aconteceu na tela de join, via enterCampaignProfile), assume
  // enteredProfile aqui para o useEffect de heartbeat (mais abaixo)
  // retomar o envio de last_seen_at — sem chamar enterCampaignProfile
  // de novo. resumedHeartbeatRef garante que isso só roda uma vez,
  // mesmo que `perfis` mude depois por outros motivos. Só no modo dev.
  const resumedHeartbeatRef = useRef(false);
  useEffect(() => {
    if (mode !== "dev" || resumedHeartbeatRef.current || !sessionId || !initialProfileId) return;
    const perfil = perfis.find((p) => p.id === initialProfileId);
    if (!perfil) return; // perfis desta mesa ainda não carregou
    resumedHeartbeatRef.current = true;
    if (perfil.lock_session_id === sessionId) {
      // v0.30: o token real de sessão vem do localStorage (salvo por
      // JoinClient ao entrar) — sem ele, não há como retomar heartbeat
      // (sessionId sozinho não autoriza mais nada).
      const token = readProfileSessionToken(perfil.id);
      if (token) {
        setEnteredProfile({ id: perfil.id, nickname: perfil.nickname });
        setProfileSessionToken(token);
      }
    }
  }, [mode, perfis, sessionId, initialProfileId]);

  // =====================================================================
  // Sessão real de perfil (modo "product" — /ficha, checkpoint v0.24/v0.30)
  // =====================================================================
  //
  // /ficha não usa seletor livre de mesa/perfil: campaignId/profileId
  // vêm fixos da URL (query string, montada por /join/[token] ao clicar
  // "Abrir ficha"). O TOKEN REAL de sessão (profileSessionId +
  // rawSessionToken, checkpoint v0.30) vem do localStorage — nunca da
  // URL — salvo por JoinClient no momento de "Entrar como perfil".
  // Sem token guardado, nem tenta validar no servidor: mostra
  // diretamente "sessão inválida ou expirada". Com token, valida no
  // servidor via getCharacterForProfileSession (hard check contra
  // profile_sessions — checkpoint v0.28/v0.30) — só então carrega o
  // personagem ATIVO desse perfil (nunca uma lista global, nunca um id
  // arbitrário).
  const [productSessionState, setProductSessionState] = useState<ProductSessionState>("pending");

  async function loadProductSession() {
    if (!initialCampaignId || !initialProfileId) {
      setProductSessionState("no_params");
      return;
    }
    const token = readProfileSessionToken(initialProfileId);
    if (!token) {
      setProductSessionState("no_params");
      return;
    }
    setProductSessionState("pending");
    try {
      const result = await getCharacterForProfileSession(
        initialCampaignId,
        initialProfileId,
        token.profileSessionId,
        token.rawSessionToken,
      );
      if (!result.profile) {
        // Token guardado não bate mais (expirado/trocado/revogado) —
        // limpa para não ficar tentando de novo com um token morto.
        clearProfileSessionToken(initialProfileId);
        setProductSessionState("invalid");
        return;
      }
      setSelectedCampaignId(initialCampaignId);
      setSelectedProfileId(initialProfileId);
      setPerfis([result.profile]);
      if (result.campaign) setMesas([result.campaign]);
      setEnteredProfile({ id: result.profile.id, nickname: result.profile.nickname });
      setProfileSessionToken(token);

      if (!result.character) {
        setCharacterId(null);
        setProductSessionState("no_character");
        return;
      }
      const loadedRaw = normalizeCharacter(result.character.payload);
      const { character: loaded, expiredInstanceIds } = expireItemTemporaryEffects(loadedRaw, new Date().toISOString());
      lastSyncedCharacterRef.current = loaded;
      setCharacter(loaded);
      setCharacterId(result.character.id);
      setProductSessionState("valid");
      if (expiredInstanceIds.length > 0) {
        addLogEntry("condicao", `Toque de Midas expirado ao carregar em ${expiredInstanceIds.length} item(ns) — bônus/PD temporário removidos.`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao validar sessão.");
      setProductSessionState("invalid");
    }
  }

  useEffect(() => {
    if (mode !== "product") return;
    loadProductSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialCampaignId, initialProfileId]);

  // Tick de exibição (não busca nada do servidor) — só recalcula se um
  // perfil parece "Expirado" comparando last_seen_at já carregado com
  // Date.now() local. Roda sempre que há mesa selecionada (perfis na
  // tela), evitado nas outras abas.
  useEffect(() => {
    if (!selectedCampaignId) return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [selectedCampaignId]);

  /**
   * Registra um evento de perfil (entrar/sair/heartbeat_expirado) no
   * Log local (sempre) e em table_logs como type="profile_event"
   * (melhor esforço — falha de gravação não bloqueia o fluxo de
   * entrar/sair). Visibilidade "gm": evento operacional de mesa, não é
   * mensagem de jogador.
   */
  async function persistProfileEvent(
    campaignId: string | null,
    profile: { id: string; nickname: string },
    evento: "enter" | "leave" | "heartbeat_expirado",
  ) {
    if (!campaignId) return;
    try {
      await addLog({
        campaignId,
        characterId: characterId ?? undefined,
        profileId: profile.id,
        type: "profile_event",
        visibility: "gm",
        profileSessionId: profileSessionToken?.profileSessionId ?? null,
        payload: {
          evento,
          profileId: profile.id,
          profileNickname: profile.nickname,
          sessionId,
          characterId,
          characterNome: character.nome,
        },
      });
    } catch {
      avisarFalhaLogMesa();
      // Best effort — o evento já foi registrado no Log local; falha
      // aqui não deve travar entrar/sair/expirar.
    }
  }

  /** Botão "Entrar como perfil" — ver regras de heartbeat em enterCampaignProfile (src/lib/table/storage.ts). */
  async function handleEnterProfile() {
    if (!selectedProfileId || !sessionId) return;
    setProfileWarning(null);
    try {
      // v0.30: enterCampaignProfile agora também gera o token real de
      // sessão — guardado no localStorage por perfil, usado por
      // heartbeat/sair/salvar personagem daqui em diante.
      const { profile: updated, profileSessionId, rawSessionToken } = await enterCampaignProfile(selectedProfileId, sessionId);
      saveProfileSessionToken(selectedProfileId, { profileSessionId, rawSessionToken });
      setProfileSessionToken({ profileSessionId, rawSessionToken });
      setPerfis((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEnteredProfile({ id: updated.id, nickname: updated.nickname });
      addLogEntry("perfil", `Entrou no perfil "${updated.nickname}".`);
      await persistProfileEvent(selectedCampaignId, { id: updated.id, nickname: updated.nickname }, "enter");
    } catch (err) {
      setProfileWarning(err instanceof Error ? err.message : "Erro desconhecido ao entrar no perfil.");
    }
  }

  /** Botão "Sair do perfil" — valida o token real da sessão (ver leaveCampaignProfile, checkpoint v0.30). */
  async function handleLeaveProfile() {
    if (!enteredProfile || !profileSessionToken) return;
    setProfileWarning(null);
    const profileSaindo = enteredProfile;
    try {
      const updated = await leaveCampaignProfile(
        profileSaindo.id,
        profileSessionToken.profileSessionId,
        profileSessionToken.rawSessionToken,
      );
      setPerfis((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      addLogEntry("perfil", `Saiu do perfil "${updated.nickname}".`);
      await persistProfileEvent(selectedCampaignId, profileSaindo, "leave");
    } catch (err) {
      setProfileWarning(err instanceof Error ? err.message : "Erro desconhecido ao sair do perfil.");
    } finally {
      clearProfileSessionToken(profileSaindo.id);
      setEnteredProfile(null);
      setProfileSessionToken(null);
      // No modo product (/ficha), sair do perfil invalida a sessão desta
      // aba — precisa entrar de novo pelo convite (não tem seletor livre
      // de perfil para "trocar" para outro).
      if (mode === "product") setProductSessionState("left");
    }
  }

  // Heartbeat: enquanto esta sessão estiver "dentro" de um perfil,
  // renova last_seen_at a cada PROFILE_HEARTBEAT_INTERVAL_MS — validado
  // pelo token real de sessão (checkpoint v0.30), não mais pelo
  // sessionId de navegador sozinho. Se o heartbeat for rejeitado (token
  // inválido, sessão não mais 'active', ou perfil liberado/assumido por
  // outra sessão), a sessão perde o perfil automaticamente e registra
  // o evento.
  useEffect(() => {
    if (!enteredProfile || !profileSessionToken) return;
    const profileAtual = enteredProfile;
    const tokenAtual = profileSessionToken;

    const intervalId = setInterval(async () => {
      try {
        const updated = await heartbeatCampaignProfile(profileAtual.id, tokenAtual.profileSessionId, tokenAtual.rawSessionToken);
        setPerfis((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } catch {
        addLogEntry("perfil", `Heartbeat expirado — perfil "${profileAtual.nickname}" foi perdido por esta aba.`);
        clearProfileSessionToken(profileAtual.id);
        setEnteredProfile(null);
        setProfileSessionToken(null);
        // v0.26: /ficha detecta a própria sessão expirando e avisa —
        // não bloqueia a ficha (o jogador pode continuar vendo/editando
        // localmente), só sinaliza que o vínculo de perfil pode ter mudado.
        if (mode === "product") setSessionExpiredWarning(true);
        await persistProfileEvent(selectedCampaignId, profileAtual, "heartbeat_expirado");
      }
    }, PROFILE_HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enteredProfile, profileSessionToken]);

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
      const talentEffects = deriveActiveEffectsFromTalents(character, talentsIniciais);
      const escalpoEffects = deriveInstalledTechnicalEffects(character, escalposIniciais);
      const runeEffects = deriveInstalledRuneEffects(character, runesIniciais);
      // Efeitos temporários/buffs rastreados (checkpoint pós-v0.71) — modificadores de rolagem
      // entram no mesmo pipeline; recurso/dano/defesa viram aviso (nunca somados).
      const temporaryEffects = deriveActiveEffectsFromTemporaryEffects(character);
      const reactionEffect = deriveReactionDefenseEffect(character, reactionRules);
      const itemTempEffects = deriveActiveEffectsFromItemTemporaryEffects(character, new Date().toISOString());
      const bricolagemEffects = getBricolagemActiveEffects(character, talentsIniciais);
      const mirarEffects = getMirarActiveEffects(character, character.current_round ?? null);
      const base = [...conditionEffects, ...talentEffects, ...escalpoEffects, ...runeEffects, ...temporaryEffects, ...itemTempEffects, ...bricolagemEffects, ...mirarEffects];
      return reactionEffect ? [...base, reactionEffect] : base;
    },
    [character, conditionContents, postureConditionContents, reactionRules, talentsIniciais, escalposIniciais, runesIniciais],
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
    () => computeDerivedStats(character.atributos, regras, character.mana_bonus_ruptura ?? 0),
    [character.atributos, regras, character.mana_bonus_ruptura],
  );
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
        undefined,
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
   * personagens de outros perfis/mesas (checkpoint v0.24), só o
   * personagem ativo já carregado via loadProductSession.
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
    // Defesa em profundidade: a ficha real (/ficha) só edita o
    // personagem ativo do perfil da sessão — nunca cria um personagem
    // novo/solto. Na prática characterId/selectedCampaignId/
    // selectedProfileId/profileSessionToken nunca são null aqui em modo
    // product (a UI de edição só aparece com productSessionState
    // "valid", que exige a sessão já validada e um personagem já
    // carregado).
    if (mode === "product" && (!characterId || !selectedCampaignId || !selectedProfileId || !profileSessionToken)) return;
    setSaveState("saving");
    setErrorMessage(null);
    try {
      // normalizeCharacter garante metadados.schema_version e preenche
      // recursos_atuais ausentes com os _max calculados aqui na UI
      // (derivados) — storage.ts só carimba atualizado_em por cima.
      const toSave = normalizeCharacter(character, derivados);
      const record =
        mode === "product"
          ? await saveCharacterForProfileSession(
              selectedCampaignId as string,
              selectedProfileId as string,
              (profileSessionToken as StoredProfileSessionToken).profileSessionId,
              (profileSessionToken as StoredProfileSessionToken).rawSessionToken,
              characterId as string,
              toSave,
            )
          : characterId
            ? await updateCharacter(characterId, toSave)
            : await createCharacter(toSave);
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
   * Troca de mesa selecionada (aba Geral) — também recarrega os perfis
   * dessa mesa (campaign_profiles). Trocar de mesa limpa o perfil
   * selecionado anterior (perfis são por mesa, não fazem sentido
   * "vazar" de uma mesa para outra).
   */
  async function handleSelectCampaign(id: string | null) {
    setSelectedCampaignId(id);
    setSelectedProfileId(null);
    setProfileWarning(null);
    if (!id) {
      setPerfis([]);
      setAlliesAtivos([]);
      return;
    }
    try {
      setPerfis(await listCampaignProfiles(id));
    } catch (err) {
      setPerfis([]);
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar perfis da mesa.");
    }
    await refreshAlliesAtivos(id);
  }

  /**
   * Outros personagens ATIVOS na mesa (checkpoint pós-v0.71 — uso de
   * item em aliado) — mesmo critério de "ativo" usado em /dev/table
   * (`personagensAtivos`): um por perfil com `active_character_id`
   * preenchido, aqui excluindo o próprio personagem carregado. Usa
   * `listCampaignProfiles`/`getCharacter`, ambos já anon-safe (mesmas
   * chamadas que a ficha já faz para o próprio perfil/personagem — sem
   * client narrador, sem service role). Falha silenciosa (lista vazia)
   * — a UI trata "nenhum aliado ativo" e "erro" da mesma forma (opção
   * escondida/indisponível), não há necessidade de um banner extra.
   */
  async function refreshAlliesAtivos(campaignId: string) {
    try {
      const perfisAtuais = await listCampaignProfiles(campaignId);
      const ids = Array.from(
        new Set(
          perfisAtuais
            .map((p) => p.active_character_id)
            .filter((id): id is string => Boolean(id) && id !== characterId),
        ),
      );
      const registros = await Promise.all(ids.map((id) => getCharacter(id)));
      setAlliesAtivos(
        registros
          .filter((r): r is NonNullable<typeof r> => r != null)
          .map((r) => ({ id: r.id, nome: r.name, character: normalizeCharacter(r.payload) })),
      );
    } catch {
      setAlliesAtivos([]);
    }
  }

  /**
   * Botão "Carregar personagem ativo" (dev) / "Recarregar personagem"
   * (product). No modo product, refaz a validação de sessão inteira
   * (loadProductSession) — útil se o narrador trocou o personagem ativo
   * do perfil durante a sessão (sem realtime, ver v0.26 para expiração
   * automática). No modo dev, busca o personagem vinculado ao perfil
   * selecionado no dropdown, reusando handleLoad.
   */
  async function handleLoadPersonagemAtivo() {
    if (mode === "product") {
      await loadProductSession();
      return;
    }
    setProfileWarning(null);
    const perfil = perfis.find((p) => p.id === selectedProfileId);
    if (!perfil) return;
    if (!perfil.active_character_id) {
      setProfileWarning(`O perfil "${perfil.nickname}" ainda não tem personagem ativo vinculado. Peça ao narrador para vincular um personagem a este perfil.`);
      return;
    }
    await handleLoad(perfil.active_character_id);
  }

  function handleNew() {
    setCharacter(createInitialCharacter(regras));
    setCharacterId(null);
    setSaveState("idle");
    setErrorMessage(null);
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
        profileId: selectedProfileId,
        profileSessionId: profileSessionToken?.profileSessionId ?? null,
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
          pmTotal: charAfter.pm_total ?? 0,
          pmDisponivel: charAfter.pm_disponivel ?? 0,
          source: "character_sheet",
        },
      });
    } catch {
      avisarFalhaLogMesa();
      // Best-effort — mesma justificativa de handleAddCondition.
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
    const derivadosAntes = computeDerivedStats(character.atributos, regras, manaBonus);
    const derivadosDepois = computeDerivedStats(atributosNovos, regras, manaBonus);

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
    const max = def?.valor_maximo ?? 5;
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

  /** Botão "Adicionar PM recebido" (Modo Evolução, checkpoint v0.40). */
  function handleGainPm(quantidade: number, descricao: string) {
    const nowIso = new Date().toISOString();
    const result = gainPm(character, quantidade, descricao, nowIso);
    setCharacter(result.character);
    addLogEntry("recurso", `PM recebido: +${result.entry.quantidade} (${result.entry.descricao}).`);
    void persistEvolutionEvent(result.character, "ganho", result.entry.quantidade, result.entry.descricao, result.entry.antes, result.entry.depois);
  }

  /** Botão "Registrar gasto manual" de PM (Modo Evolução, checkpoint v0.40). */
  function handleSpendPm(quantidade: number, descricao: string) {
    const nowIso = new Date().toISOString();
    const result = spendPm(character, quantidade, descricao, nowIso);
    setCharacter(result.character);
    addLogEntry("recurso", `PM gasto: -${result.entry.quantidade} (${result.entry.descricao}).`);
    if (result.warnings.length > 0) addLogEntry("recurso", result.warnings[0]);
    void persistEvolutionEvent(result.character, "gasto", result.entry.quantidade, result.entry.descricao, result.entry.antes, result.entry.depois);
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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
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
            profileId: selectedProfileId,
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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "condition_auto_removal_undone",
          visibility: "public",
          payload: {
            conditionLocalIds: banner.ids,
            nomes: banner.nomes,
            pvAnterior: banner.pvAnterior,
            pvNovo: banner.pvNovo,
            characterId,
            characterNome: character.nome,
            profileId: selectedProfileId,
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
        profileId: selectedProfileId,
        profileSessionId: profileSessionToken?.profileSessionId ?? null,
        type: tipo,
        visibility: "public",
        payload: {
          characterId,
          characterNome: character.nome,
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
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
    const result = applyShortRest(character, derivados, nowIso);
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
  async function handleApplyLongRest() {
    const confirmado = window.confirm(
      "Aplicar descanso longo (8h)? PV recupera Corpo+2, PE recupera Mente+2, Mana volta ao máximo, PV/Mana temporários são removidos e Sobrecarga é resetada. Integridade NÃO é recuperada.",
    );
    if (!confirmado) return;

    const nowIso = new Date().toISOString();
    const result = applyLongRest(character, derivados, nowIso);
    const { condicoes: proximasCondicoes, removidas } = applyAutoHealRemoval(
      result.character.condicoes_ativas ?? [],
      result.before.pv,
      result.after.pv,
      nowIso,
    );

    // Talentos com cadência "dia" (checkpoint pós-v0.63) renovam no descanso longo — mesmo precedente de sobrecarga_usada_dia.
    // "descanso_longo" (checkpoint talentos, Fase 7) — cadência própria do payload (ex.: Pistoleiro › Gatilho Quente).
    const talentReset = resetTalentUses({ ...result.character, condicoes_ativas: proximasCondicoes }, ["dia", "descanso_longo"]);
    setCharacter(talentReset.character);
    addLogEntry(
      "descanso",
      `Descanso longo — PV ${result.before.pv} → ${result.after.pv}, PE ${result.before.pe} → ${result.after.pe}, Mana ${result.before.mana} → ${result.after.mana}.`,
    );
    await persistRest("rest_long", result);
    if (removidas.length > 0) void handleAutoHealRemovals(removidas, result.before.pv, result.after.pv);
  }

  /**
   * Reset manual de "novo dia" SÓ para talentos cadência "dia" (ex.: Toque de Midas)
   * — não aplica descanso longo, não mexe em PV/PE/Mana/Sobrecarga. Cobre o caso em
   * que o narrador declara um novo dia narrativo sem um descanso completo de 8h
   * (checkpoint talentos — "dia" não é forçosamente "descanso longo").
   */
  function handleMarkNewDayTalents() {
    const current = characterRef.current;
    const talentReset = resetTalentUses(current, ["dia"]);
    if (talentReset.resetCount === 0) {
      addLogEntry("condicao", "Novo dia (talentos): nenhum contador de cadência diária estava em uso.");
      return;
    }
    characterRef.current = talentReset.character;
    setCharacter(talentReset.character);
    addLogEntry("condicao", `Novo dia (talentos): ${talentReset.resetCount} contador(es) de cadência diária resetado(s) manualmente.`);
  }

  /**
   * Botão "Usar surto" (checkpoint v0.37; data-driven pela regra
   * canônica `regras_personagem.sobrecarga` no pós-v0.65) — dado do dano
   * psíquico, máximo de cargas/dia e teste do 3º surto vêm da regra
   * (fallbacks idênticos ao PRD). Sem sobrecarga suficiente, bloqueia
   * sem mudar nada. Loga `overload_surge_used` (canônico) na mesa.
   */
  async function handleUseOverloadSurge(tipo: string) {
    const nowIso = new Date().toISOString();
    const sobrecargaAntes = character.sobrecarga_usada_dia ?? 0;
    const overloadRules = regras?.sobrecarga;
    const talentLimitOverride = getTalentOverloadLimitOverride(character, talentsIniciais);
    const maxCanonico = getOverloadMaxPerDay(overloadRules);
    const maxSurtos = talentLimitOverride != null && talentLimitOverride > maxCanonico ? talentLimitOverride : maxCanonico;
    const result = useOverloadSurge(character, tipo, nowIso, undefined, overloadRules, talentLimitOverride);

    if (!result.surge) {
      addLogEntry("recurso", result.warnings[0] ?? "Limite de surtos de Sobrecarga atingido.");
      return;
    }

    characterRef.current = result.character;
    setCharacter(result.character);
    const dado = getOverloadSurgeDamageDie(overloadRules);
    addLogEntry(
      "recurso",
      `Surto de Sobrecarga (${tipo}) — ${result.surge.indice}/${maxSurtos}, dano psíquico ${result.surge.danoPsiquico} (${dado}, não aplicado automaticamente).`,
    );
    if (result.requiresWillRoll) {
      const willRule = getOverloadWillTestRule(overloadRules);
      addLogEntry("condicao", `Ruptura pendente (${result.surge.indice}º surto) — role ${willRule.pericia} CD ${willRule.cd}.`);
      setOverloadWillRollPending(true);
    }

    await persistAutomatedActionExecution(result.character);

    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "overload_surge_used",
          visibility: "public",
          payload: {
            characterId,
            characterNome: character.nome,
            profileId: selectedProfileId,
            profileSessionId: profileSessionToken?.profileSessionId ?? null,
            tipo,
            indice: result.surge.indice,
            maxSurtos,
            danoPsiquico: result.surge.danoPsiquico,
            danoDado: dado,
            sobrecargaAntes,
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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "overload_will_roll",
          visibility: "public",
          payload: {
            characterId,
            characterNome: character.nome,
            profileId: selectedProfileId,
            profileSessionId: profileSessionToken?.profileSessionId ?? null,
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
        profileId: selectedProfileId,
        profileSessionId: profileSessionToken?.profileSessionId ?? null,
        type: tipo,
        visibility: "public",
        payload: {
          characterId,
          characterNome: character.nome,
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
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
    const colapso = detectCollapseOnResourceChange(baseAposCura, beforePvPe, afterPvPe, nowIso);

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

    // Berserker › Sede de Sangue (checkpoint talentos, Fase 1) — encerra automaticamente
    // qualquer toggle PV-condicionado assim que o PV volta a ficar >= metade do máximo.
    const pvGated = enforcePvGatedToggleDeactivation(finalCharacter, talentsIniciais, afterPvPe.pv, derivados.pv_max, nowIso);
    finalCharacter = pvGated.character;

    return { character: finalCharacter, removidasPorCura: removidas, colapso, collapseAdvance, pvGatedDeactivated: pvGated.deactivated };
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
  function updateRecursoAtual(id: keyof CharacterResources, rawValue: number) {
    const anterior = character.recursos_atuais?.[id] ?? 0;
    const novo = parseRecursoAtual(rawValue);

    if (id === "pv" || id === "pe") {
      const nowIso = new Date().toISOString();
      const beforePvPe = { pv: character.recursos_atuais?.pv ?? 0, pe: character.recursos_atuais?.pe ?? 0 };
      const afterPvPe = { ...beforePvPe, [id]: novo };
      const { character: charComEfeitos, removidasPorCura, colapso, collapseAdvance, pvGatedDeactivated } = applyPvPeSideEffects(
        character,
        beforePvPe,
        afterPvPe,
        nowIso,
      );

      setCharacter({
        ...charComEfeitos,
        recursos_atuais: { ...charComEfeitos.recursos_atuais, [id]: novo },
      });
      if (novo !== anterior) {
        addLogEntry("recurso", `${RECURSO_LABELS[id]}: ${anterior} → ${novo}`);
      }
      if (removidasPorCura.length > 0) void handleAutoHealRemovals(removidasPorCura, beforePvPe.pv, afterPvPe.pv);
      for (const d of pvGatedDeactivated) {
        addLogEntry("recurso", `${d.talentNome} — ${d.nivelNome}: encerrado automaticamente (PV voltou a ficar acima da metade).`);
      }
      if (colapso.started) {
        addLogEntry("recurso", `Colapso iniciado (${colapso.tipo === "pv" ? "PV" : "PE"} a 0) — Inconsciente aplicado.`);
        void persistCollapseEvent("collapse_started", { tipo: colapso.tipo });
      }
      if (colapso.ended) {
        addLogEntry("recurso", `Colapso encerrado por cura — cicatriz pendente.`);
        void persistCollapseEvent("collapse_ended", { tipo: colapso.tipo, motivo: "cura" });
      }
      if (collapseAdvance && collapseAdvance.logs.length > 0) {
        for (const line of collapseAdvance.logs) addLogEntry("recurso", line);
        void persistCollapseEvent("collapse_advanced", { tipo: id, motivo: "dano_adicional", outcome: collapseAdvance.outcome });
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
    const { character: charComEfeitos, removidasPorCura: removidas, colapso, pvGatedDeactivated } = applyPvPeSideEffects(
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
    for (const d of pvGatedDeactivated) {
      addLogEntry("recurso", `${d.talentNome} — ${d.nivelNome}: encerrado automaticamente (PV voltou a ficar acima da metade).`);
    }
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
    // Talentos com cadência "rodada" (checkpoint pós-v0.63) renovam os usos aqui.
    const talentReset = resetTalentUses(paReduction.character, ["rodada"]);
    // Efeitos temporários com duração por rodadas (checkpoint pós-v0.71) — reduz 1 rodada e expira os que zeram.
    const tick = tickRoundTemporaryEffects(talentReset.character, nowIso);
    // Droneiro › Sinal Limpo (checkpoint talentos, Fase 14) — o +1 PA concedido a um drone vale só a rodada em que foi dado.
    const droneBonusExpiry = expireDroneRoundBonuses(tick.character);
    // Mecatrônico › Marcha Dupla (checkpoint talentos, Fase 15) — a ação dupla vale só a rodada em que foi ativada.
    const marchaDuplaExpiry = expireMarchaDuplaRoundState(droneBonusExpiry.character);
    nextCharacter = { ...marchaDuplaExpiry.character, current_round: round + 1 };

    characterRef.current = nextCharacter;
    setCharacter(nextCharacter);

    const tempLogs: string[] = [
      ...tick.ticked.map((e) => `Efeito temporário "${e.name}": ${e.remainingRounds} rodada(s) restante(s).`),
      ...tick.expired.map((e) => `Efeito temporário "${e.name}" expirou (duração por rodadas).`),
      ...droneBonusExpiry.expired.map((d) => `Sinal Limpo: +1 PA de ${d.nome} expirou no fim da rodada.`),
      ...marchaDuplaExpiry.expired.map((r) => `Marcha Dupla: ${r.nome} volta ao normal nesta rodada.`),
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
            profileId: selectedProfileId,
            profileSessionId: profileSessionToken?.profileSessionId ?? null,
            type: entry.type,
            visibility: "public",
            payload: { ...entry.payload, characterId, characterNome: current.nome, profileId: selectedProfileId },
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
            profileId: selectedProfileId,
            profileSessionId: profileSessionToken?.profileSessionId ?? null,
            type: entry.type,
            visibility: "public",
            payload: { ...entry.payload, characterId, characterNome: current.nome, profileId: selectedProfileId },
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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "rupture_choice_resolved",
          visibility: "public",
          payload: {
            characterId,
            characterNome: current.nome,
            profileId: selectedProfileId,
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
   * Adquirir/remover nível de talento (aba Talentos, checkpoint v0.48)
   * — atualiza o estado local (persiste só ao "Salvar personagem",
   * igual atributos/perícias/condições); efeitos ativos recalculam via
   * `activeEffects` (useMemo acima), sem passo extra aqui.
   */
  function handleAcquireTalent(talentoId: string, nivelId: string, nivel: number) {
    // Defesa em profundidade: o botão já some em Modo Jogo (PRD 4.1/4.2), mas o handler recusa por garantia.
    if (sheetMode === "jogo") return;
    const current = characterRef.current;
    const nowIso = new Date().toISOString();
    const acquired = acquireTalentLevel(current, { talentoId, nivelId, nivel, nowIso });
    if (acquired === current) return;
    // Ascensão: ao adquirir pela primeira vez, aplica a Ruptura especial (idempotente).
    const { character: next, applied: ascensaoApplied } = applyAscensaoSpecialRupture(
      acquired,
      talentsIniciais,
      () => crypto.randomUUID(),
      nowIso,
    );
    characterRef.current = next;
    setCharacter(next);
    const talent = talentsIniciais.find((t) => t.id === talentoId);
    const nivelNome = talent?.niveis.find((n) => n.id === nivelId)?.nome ?? nivelId;
    addLogEntry("condicao", `Talento adquirido: ${talent?.nome ?? talentoId} — ${nivelNome}.`);
    if (ascensaoApplied) {
      addLogEntry(
        "condicao",
        "Ascensão: Ruptura especial concedida — não reduz Integridade nem conta para cálculos futuros.",
      );
    }
  }

  function handleRemoveTalent(acquiredId: string) {
    if (sheetMode === "jogo") return;
    const current = characterRef.current;
    const next = removeTalentLevel(current, acquiredId);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Nível de talento removido.");
  }

  /** Grava `table_logs.type = "talent_used"` (checkpoint pós-v0.63) — best-effort, mesmo padrão de item_used. */
  async function persistTalentUsedLog(payload: Record<string, unknown>) {
    if (!selectedCampaignId) return;
    try {
      await addLog({
        campaignId: selectedCampaignId,
        characterId: characterId ?? undefined,
        profileId: selectedProfileId,
        profileSessionId: profileSessionToken?.profileSessionId ?? null,
        type: "talent_used",
        visibility: "public",
        payload: {
          characterId,
          characterNome: characterRef.current.nome,
          profileId: selectedProfileId,
          profileNickname: perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null,
          source: "character_sheet_talents",
          ...payload,
        },
      });
    } catch {
      avisarFalhaLogMesa();
      // Best-effort — o uso já foi aplicado no estado local/persistido.
    }
  }

  /**
   * Usar efeito de talento com usos limitados (checkpoint pós-v0.63) —
   * o contador/PA é automático; o EFEITO continua manual (lembretes).
   * Checa uso restante/PA antes de mudar estado (`useTalentEffect`).
   */
  async function handleUseTalentEffect(key: string) {
    const current = characterRef.current;
    const nowIso = new Date().toISOString();
    // round/scene do personagem alimentam createdRound/createdScene do efeito temporário (pós-v0.72).
    const result = useTalentEffect({
      character: current,
      talents: talentsIniciais,
      key,
      paMax: derivados.pa_max,
      nowIso,
      round: current.current_round,
      scene: current.current_scene,
    });
    if (!result.ok || !result.usable) {
      addLogEntry("recurso", result.reason ?? "Não foi possível usar o talento.");
      return;
    }
    characterRef.current = result.character;
    setCharacter(result.character);

    const partes: string[] = [];
    if (result.paCost != null) partes.push(`PA ${result.paBefore} → ${result.paAfter}`);
    partes.push(
      `usos ${result.usosGastosDepois}/${result.usable.usosMax}${result.usable.cadencia ? ` por ${result.usable.cadencia.replace(/_/g, " ")}` : ""}`,
    );
    for (const efeito of result.temporaryEffectsAdded) {
      partes.push(`efeito temporário: ${formatTemporaryEffectSummary(efeito)}`);
    }
    addLogEntry(
      "recurso",
      `Usou talento ${result.usable.talentNome} — ${result.usable.nivelNome} (${partes.join(" · ")}) — Lembrete: ${result.reminders.join(" ")}`,
    );

    await persistAutomatedActionExecution(result.character);
    await persistTalentUsedLog({
      talentSlug: result.usable.talentSlug,
      talentNome: result.usable.talentNome,
      nivelNome: result.usable.nivelNome,
      nivel: result.usable.nivel,
      effectKey: result.usable.key,
      effectType: result.usable.efeito.tipo,
      action: "use",
      usesSpent: result.usosGastosDepois,
      usesMax: result.usable.usosMax,
      cadencia: result.usable.cadencia,
      paCost: result.paCost,
      paBefore: result.paBefore,
      paAfter: result.paAfter,
      description: result.usable.description,
      temporaryEffectsAdded: result.temporaryEffectsAdded.map((e) => e.name),
      reminders: result.reminders,
    });
    for (const efeito of result.temporaryEffectsAdded) {
      await logTemporaryEffectAdded(efeito, characterId, current.nome);
    }
  }

  /**
   * Ativar/desativar um toggle de talento (ex.: Berserker "Sede de
   * Sangue") — checkpoint pós-v0.72: ativar CRIA um efeito temporário
   * (cujo modificador de rolagem vale enquanto ativo), desativar REMOVE.
   */
  async function handleToggleTalentEffect(key: string) {
    const current = characterRef.current;
    const nowIso = new Date().toISOString();
    // Berserker › Sede de Sangue (checkpoint talentos, Fase 1) — toggles com
    // `condicao_ativacao: pv_abaixo_metade` só podem LIGAR com PV real abaixo da
    // metade do máximo; desligar nunca é bloqueado.
    const usableAlvo = getUsableTalentEffects(current, talentsIniciais).find((u) => u.key === key);
    if (usableAlvo && usableAlvo.kind === "toggle" && !usableAlvo.toggledOn) {
      const pvAtual = current.recursos_atuais?.pv ?? 0;
      if (!isPvGatedToggleAllowedToActivate(usableAlvo.efeito, pvAtual, derivados.pv_max)) {
        addLogEntry(
          "recurso",
          `${usableAlvo.talentNome} — ${usableAlvo.nivelNome}: só pode ser ativado com PV abaixo da metade (atual ${pvAtual}/${derivados.pv_max}).`,
        );
        return;
      }
    }
    const result = toggleTalentEffect({
      character: current,
      talents: talentsIniciais,
      key,
      nowIso,
      round: current.current_round,
      scene: current.current_scene,
    });
    if (!result.ok || !result.usable) {
      addLogEntry("recurso", result.reason ?? "Não foi possível alternar o talento.");
      return;
    }
    characterRef.current = result.character;
    setCharacter(result.character);
    const efeitoTexto = result.temporaryEffect ? ` (${formatTemporaryEffectSummary(result.temporaryEffect)})` : "";
    addLogEntry(
      "recurso",
      `${result.active ? "Ativou" : "Desativou"} talento ${result.usable.talentNome} — ${result.usable.nivelNome}${efeitoTexto}.${result.reminders.length > 0 ? ` Lembrete: ${result.reminders.join(" ")}` : ""}`,
    );
    await persistAutomatedActionExecution(result.character);
    await persistTalentUsedLog({
      talentSlug: result.usable.talentSlug,
      talentNome: result.usable.talentNome,
      nivelNome: result.usable.nivelNome,
      nivel: result.usable.nivel,
      effectKey: result.usable.key,
      effectType: result.usable.efeito.tipo,
      action: result.active ? "toggle_on" : "toggle_off",
      description: result.usable.description,
      reminders: result.reminders,
    });
    // Toggle liga → efeito temporário criado; desliga → removido (logs canônicos, pós-v0.72).
    if (result.active && result.temporaryEffect) {
      await logTemporaryEffectAdded(result.temporaryEffect, characterId, current.nome);
    } else if (!result.active && result.removedEffect) {
      await logTemporaryEffectRemoved(result.removedEffect, "Toggle de talento desativado.");
    }
  }

  /** Reset manual de um contador de uso (cadências sem gatilho canônico — combate/sessão/missão). */
  function handleResetTalentUse(key: string) {
    const current = characterRef.current;
    const next = resetTalentUse(current, key);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", "Usos de talento resetados manualmente.");
  }

  /**
   * Comprar item na loja (aba Inventário, checkpoint v0.49) — desconta
   * a carteira escolhida e cria a instância no inventário
   * (`purchaseItem`, `lib/character/inventory.ts`). Sem fundos
   * suficientes, não muda nada e só avisa no log local.
   */
  function handleBuyItem(itemSlug: string, quantidade: number, walletId: WalletId, precoUnitario: number) {
    const current = characterRef.current;
    const item = itemsIniciais.find((i) => i.slug === itemSlug);
    if (!item) return;
    const result = purchaseItem({ character: current, item, quantidade, walletId, precoUnitario, nowIso: new Date().toISOString(), catalog: itemsIniciais });
    if (!result.ok) {
      addLogEntry("recurso", result.reason ?? "Compra não realizada.");
      return;
    }
    characterRef.current = result.character;
    setCharacter(result.character);
    addLogEntry("recurso", `Comprado: ${item.nome} x${quantidade} — ${result.totalCost} (${result.walletBefore} → ${result.walletAfter}).`);
  }

  /** Mercador › Garimpo de Rua — ativa o desconto de -20% para o resto do dia (1/dia). */
  function handleActivateGarimpoDeRua() {
    const current = characterRef.current;
    const status = getGarimpoDeRuaAvailability(current, talentsIniciais);
    if (!status.acquired || status.ativoHoje) return;
    const next = activateGarimpoDeRua(current, new Date().toISOString());
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Garimpo de Rua: desconto de -${status.percentual}% ativado para o resto do dia.`);
  }

  /**
   * Mercador › Caderneta de Dívida — compra fiada real (1x/sessão): usa
   * `purchaseItem` com `permitirSaldoInsuficiente`, registra a instância
   * normalmente e persiste o saldo devido em `dividas_mercador`. Nunca
   * permite item acima da raridade limite do payload.
   */
  function handleBuyItemFiado(itemSlug: string, quantidade: number, walletId: WalletId, precoUnitario: number, fornecedor: string) {
    const current = characterRef.current;
    const status = getCadernetaDeDividaAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisSession) {
      addLogEntry("recurso", "Caderneta de Dívida já foi usada nesta sessão.");
      return;
    }
    const item = itemsIniciais.find((i) => i.slug === itemSlug);
    if (!item) return;
    if (!isRaridadeDentroDoLimite(item.raridade, status.raridadeMaxima)) {
      addLogEntry("recurso", `Caderneta de Dívida não cobre itens acima da raridade "${status.raridadeMaxima}".`);
      return;
    }
    const nowIso = new Date().toISOString();
    const result = purchaseItem({
      character: current,
      item,
      quantidade,
      walletId,
      precoUnitario,
      nowIso,
      catalog: itemsIniciais,
      permitirSaldoInsuficiente: true,
    });
    if (!result.ok) {
      addLogEntry("recurso", result.reason ?? "Compra fiada não realizada.");
      return;
    }
    let next = markCadernetaDeDividaUsed(result.character, nowIso);
    const saldoDevido = result.saldoDevido ?? 0;
    if (saldoDevido > 0) {
      const divida = {
        id: crypto.randomUUID(),
        fornecedor,
        itemSlug: item.slug,
        itemNome: item.nome,
        precoTotal: result.totalCost ?? 0,
        valorPago: result.valorPago ?? 0,
        saldoDevido,
        // Sem numeração canônica de sessão de jogo em nenhum lugar do app (mesmo
        // motivo de "sessao"/"missao" não terem reset automático) — usa a data
        // como rótulo honesto em vez de inventar um contador de sessão.
        sessao: nowIso.slice(0, 10),
        criadaEm: nowIso,
        quitada: false,
      };
      next = { ...next, dividas_mercador: [...(next.dividas_mercador ?? []), divida] };
    }
    characterRef.current = next;
    setCharacter(next);
    addLogEntry(
      "recurso",
      saldoDevido > 0
        ? `Comprado fiado: ${item.nome} x${quantidade} — pago ${result.valorPago} de ${result.totalCost}, devendo ${saldoDevido} a ${fornecedor}.`
        : `Comprado fiado: ${item.nome} x${quantidade} — ${result.totalCost} (sem saldo devido).`,
    );
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

  /** Artífice › Toque de Midas — aplica efeito temporário (1h) na instância real; 1/dia. */
  function handleApplyToqueDeMidas(instanceId: string, pericia?: string) {
    const current = characterRef.current;
    const avail = getToqueDeMidasAvailability(current, talentsIniciais);
    if (!avail.available) {
      addLogEntry("condicao", avail.usedToday ? "Toque de Midas já foi usado hoje (renova no descanso longo, mesmo padrão de Sobrecarga)." : "Toque de Midas não adquirido.");
      return;
    }
    const instance = (current.inventario ?? []).find((i) => i.id === instanceId);
    if (!instance) return;
    const alvo: "arma" | "armadura" | "escudo" | "ferramenta_dispositivo" =
      instance.categoria === "arma" ? "arma"
      : instance.categoria === "armadura" ? "armadura"
      : instance.categoria === "escudo" ? "escudo"
      : "ferramenta_dispositivo";
    const mods = getToqueDeMidasModifiersForTarget(current, talentsIniciais, alvo);
    if (!mods) {
      addLogEntry("condicao", `Toque de Midas: payload não estrutura modificadores para "${alvo}" — não aplicado.`);
      return;
    }
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    let next = applyToqueDeMidas(current, instanceId, {
      id: crypto.randomUUID(),
      sourceTalentId: mods.nivelId,
      sourceCharacterId: characterId ?? null,
      itemCategory: alvo,
      modifiers: { ataque: mods.ataque, dano: mods.dano, mit: mods.mit, testeRelacionado: mods.testeRelacionado },
      temporaryPdGranted: mods.pd,
      relatedSkill: alvo === "ferramenta_dispositivo" ? pericia : undefined,
      nowIso,
      expiresAt,
    });
    next = markToqueDeMidasUsed(next, nowIso);
    characterRef.current = next;
    setCharacter(next);
    const efeito =
      alvo === "arma" ? `+${mods.ataque ?? 0} ataque e +${mods.dano ?? 0} dano`
      : alvo === "armadura" ? `+${mods.mit ?? 0} MIT`
      : alvo === "escudo" ? `+${mods.pd ?? 0} PD temporário`
      : `+${mods.testeRelacionado ?? 0} no teste${pericia ? ` (${pericia})` : ""}`;
    addLogEntry("condicao", `Toque de Midas aplicado em "${instance.itemNome}": ${efeito} por 1 hora (expira ${new Date(expiresAt).toLocaleTimeString()}).`);
    void persistTalentUsedLog({ talentNome: "Toque de Midas", nivelNome: "Nível 2", instanceId, alvo, efeito });
  }

  function handleEndToqueDeMidas(instanceId: string) {
    const current = characterRef.current;
    const instance = (current.inventario ?? []).find((i) => i.id === instanceId);
    const next = endToqueDeMidas(current, instanceId);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Toque de Midas encerrado em "${instance?.itemNome ?? "item"}" — bônus/PD temporário restante removido; PD-base preservado.`);
  }

  /** Artífice › Bricolagem — registra a vulnerabilidade identificada (sem teste) e cria o bônus consumível. */
  function handleRegisterBricolagem(params: { tipo: "mecanismo" | "estrutura" | "sistema_simples"; alvoDescricao: string; falhaPrincipal: string; periciaBeneficiada: "engenharia" | "robotica" }) {
    const current = characterRef.current;
    const mod = getBricolagemModifier(current, talentsIniciais);
    if (!mod) return;
    const nowIso = new Date().toISOString();
    const next = registerBricolagemVulnerabilidade(current, { nivelId: mod.nivelId, ...params }, crypto.randomUUID(), nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Bricolagem: falha identificada em ${params.tipo} ("${params.falhaPrincipal}") — +${mod.valor} no próximo teste de ${params.periciaBeneficiada} relacionado.`);
  }

  /** Prepara na aba Rolagens o teste que explora/conserta a falha — CONSOME o bônus neste exato ato (nunca em outra rolagem). */
  function handleRollBricolagemTest() {
    const current = characterRef.current;
    const v = current.bricolagem_vulnerabilidade;
    const tag = getBricolagemTag(current);
    if (!v || !tag) return;
    const confirmado = window.confirm(`Este teste de ${v.periciaBeneficiada} explora ou conserta a falha "${v.falhaPrincipal}"? Confirmar consome o bônus.`);
    if (!confirmado) return;
    const nowIso = new Date().toISOString();
    const next = consumeBricolagemUse(current, nowIso);
    characterRef.current = next;
    setCharacter(next);
    const periciaDef = regras?.pericias.find((p) => p.id === v.periciaBeneficiada);
    setPreparedRoll({
      atributoId: periciaDef?.atributo_primario ?? "mente",
      periciaId: v.periciaBeneficiada,
      origem: `Bricolagem: ${v.falhaPrincipal}`,
      extraTags: [tag],
    });
    setActiveTab("rolagens");
    addLogEntry("condicao", `Bricolagem: bônus consumido no teste de ${v.periciaBeneficiada} relacionado à falha "${v.falhaPrincipal}".`);
    void persistTalentUsedLog({ talentNome: "Bricolagem", nivelNome: "Nível 1", falha: v.falhaPrincipal, pericia: v.periciaBeneficiada });
  }

  function handleEndBricolagem() {
    const current = characterRef.current;
    const next = endBricolagemVulnerabilidade(current);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Bricolagem: vulnerabilidade encerrada manualmente.");
  }

  /** Artífice › Gambiarra Expressa — atividade narrativa 1/sessão (5 min, sem teste estendido). */
  function handleRegisterGambiarra(params: { alvo: "estrutura" | "equipamento" | "automato"; materialBase: string; criacaoOuModificacao: "criacao" | "modificacao"; efeitoObtido: string; duracao: string; observacoes?: string }) {
    const current = characterRef.current;
    const avail = getGambiarraAvailability(current, talentsIniciais);
    if (!avail.available) {
      addLogEntry("condicao", avail.usedThisSession ? "Gambiarra Expressa já foi usada nesta sessão." : "Gambiarra Expressa não adquirida.");
      return;
    }
    let nivelId: string | null = null;
    for (const a of current.talentos_adquiridos ?? []) {
      const talent = talentsIniciais.find((t) => t.niveis.some((n) => n.id === a.nivelId && n.slug === "artifice_gambiarra_expressa"));
      if (talent) nivelId = a.nivelId;
    }
    if (!nivelId) return;
    const nowIso = new Date().toISOString();
    const next = registerGambiarraExpressa(current, { nivelId, ...params }, crypto.randomUUID(), nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Gambiarra Expressa: ${params.criacaoOuModificacao === "criacao" ? "criou" : "modificou"} ${params.alvo} com ${params.materialBase} (5 min, sem teste estendido) — efeito: ${params.efeitoObtido}.`);
    void persistTalentUsedLog({ talentNome: "Gambiarra Expressa", nivelNome: "Nível 3", ...params });
  }

  function handleEndGambiarra() {
    const current = characterRef.current;
    const next = endGambiarraExpressa(current);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Gambiarra Expressa: efeito narrativo encerrado.");
  }

  /** Atirador de Elite › 1 Tiro, 1 Acerto — confirma o resultado do teste de Mirar e cria o estado real (bônus lido do payload). */
  function handleConfirmMirar(resultado: "sucesso" | "critico") {
    const current = characterRef.current;
    const mod = getMirarModifier(current, talentsIniciais);
    if (!mod) return;
    const nowIso = new Date().toISOString();
    const next = confirmMirarResult(current, talentsIniciais, resultado, current.current_round ?? null, crypto.randomUUID(), nowIso);
    characterRef.current = next;
    setCharacter(next);
    const bonus = resultado === "critico" ? mod.bonusCritico : mod.bonusPadrao;
    addLogEntry("condicao", `Mirar confirmado (${resultado}): +${bonus} no próximo disparo à distância, até o fim da rodada.`);
    void persistTalentUsedLog({ talentNome: "1 Tiro, 1 Acerto", nivelNome: "Nível 1", resultado, bonus });
  }

  function handleEndMirar() {
    const current = characterRef.current;
    const next = endMirar(current);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Mirar encerrado manualmente.");
  }

  /** Sorrateiro › entra em Furtividade manualmente (ação narrativa, sem teste estruturado próprio). */
  function handleStartFurtividade() {
    const current = characterRef.current;
    if (isFurtividadeActive(current)) return;
    const next = startFurtividade(current, "Sorrateiro", new Date().toISOString());
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Furtividade: iniciada.");
  }

  /** Sorrateiro › Camuflagem Óptica — confirma que o deslocamento exposto terminou num ponto plausível, mantendo Furtividade ativa. */
  function handleConfirmCamuflagemOptica() {
    const current = characterRef.current;
    const next = confirmCamuflagemOpticaMovement(current);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Camuflagem Óptica: deslocamento exposto confirmado como plausível — Furtividade mantida.");
  }

  function handleEndFurtividade() {
    const current = characterRef.current;
    const next = endFurtividade(current, "manual");
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Furtividade: encerrada manualmente.");
  }

  /**
   * Pistoleiro › Gatilho Quente — consome 1 dado de gatilho real (jogador informa o d8
   * físico rolado junto com o teste). Resultado 8 soma dano extra igual à Balística
   * atual; qualquer outro resultado só consome o dado (conta como um dado normal do
   * teste, sem bônus extra) — nunca inventa uma regra diferente da descrita no capítulo.
   */
  function handleUseGatilhoDado(resultadoD8: number) {
    const current = characterRef.current;
    const status = getGatilhoQuenteAvailability(current, talentsIniciais);
    if (!status.acquired || status.available <= 0) return;
    const nowIso = new Date().toISOString();
    const next = consumeGatilhoDado(current, nowIso);
    characterRef.current = next;
    setCharacter(next);
    if (resultadoD8 === 8) {
      const bonus = current.pericias.balistica ?? 0;
      addLogEntry(
        "condicao",
        `Gatilho Quente: dado de gatilho usado — resultado 8! +${bonus} de dano extra (Balística). Dados restantes: ${status.available - 1}/${status.max}.`,
      );
    } else {
      addLogEntry(
        "condicao",
        `Gatilho Quente: dado de gatilho usado — resultado ${resultadoD8} (conta como dado normal do teste, sem dano extra). Dados restantes: ${status.available - 1}/${status.max}.`,
      );
    }
  }

  /** Pistoleiro › Showdown (N3, checkpoint talentos Fase 11) — consome os dados de gatilho gastos de uma vez, 1/cena. */
  function handleShowdownUsado(dadosGastos: number, qualificados: number) {
    const current = characterRef.current;
    const status = getShowdownAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    const nowIso = new Date().toISOString();
    let next = consumeGatilhoDados(current, dadosGastos, nowIso);
    next = markShowdownUsed(next, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry(
      "condicao",
      `Showdown: ${dadosGastos} dado(s) de gatilho gastos de uma vez — ${qualificados} qualificaram (6-8). Efeitos por dado a aplicar manualmente no alvo.`,
    );
  }

  /** Pistoleiro › Bang Bang (N2, checkpoint talentos Fase 1) — gasta 1 PA para o segundo disparo (a rolagem em si é a próxima "Rolar" normal, com −1 já pré-preenchido pelo RollsTab). */
  function handleSpendPaBangBang() {
    adjustEstadoJogo("pa_gastos", 1);
    addLogEntry("condicao", "Bang Bang: +1 PA gasto para segundo disparo imediato (−1 no teste).");
  }

  /** Totem › Benção (N1, checkpoint talentos Fase 1) — consome o token recebido (o primeiro teste desde a concessão, com ou sem promoção real). */
  function handleConsumeBencaoToken() {
    const current = characterRef.current;
    if (!current.bencao_token_ativo) return;
    const { bencao_token_ativo: _drop, ...next } = current;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Token de Benção consumido neste teste.");
  }

  /** Totem › Benção — concede o token 1/cena a um aliado ativo da mesa (persiste o ALVO primeiro, mesmo padrão de useItemOnAlly). */
  async function handleGrantBencaoToken(targetCharacterId: string) {
    if (!selectedCampaignId) {
      addLogEntry("recurso", "Conceder token de Benção exige mesa conectada.");
      return;
    }
    const current = characterRef.current;
    const status = getTotemBencaoTokenAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    const ally = alliesAtivos.find((a) => a.id === targetCharacterId);
    if (!ally) {
      addLogEntry("recurso", "Aliado não encontrado entre os personagens ativos da mesa — atualize a lista de aliados.");
      return;
    }
    const nowIso = new Date().toISOString();
    const targetNext: Character = { ...ally.character, bencao_token_ativo: { origem: current.nome, concedidoEm: nowIso } };
    try {
      const targetRecord = await updateCharacter(ally.id, targetNext);
      setAlliesAtivos((prev) => prev.map((a) => (a.id === ally.id ? { ...a, character: normalizeCharacter(targetRecord.payload) } : a)));
    } catch (err) {
      addLogEntry(
        "recurso",
        err instanceof Error ? `Falha ao conceder token de Benção a ${ally.nome}: ${err.message}` : `Falha ao conceder token de Benção a ${ally.nome}.`,
      );
      return;
    }
    const sourceNext = markTotemBencaoTokenUsed(current, nowIso);
    characterRef.current = sourceNext;
    setCharacter(sourceNext);
    addLogEntry("condicao", `Benção: token concedido a ${ally.nome} (1/cena).`);
  }

  /** Estrategista › Falcão (N1, checkpoint talentos Fase 5) — consome o token +2 recebido no próximo teste confirmado. */
  function handleConsumeFalcaoToken() {
    const current = characterRef.current;
    if (!current.falcao_token_ativo) return;
    const { falcao_token_ativo: _drop, ...next } = current;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Token de Falcão consumido neste teste.");
  }

  /** Estrategista › Falcão — concede +2 real 1/cena a um aliado ativo da mesa (mesmo padrão de Benção). */
  async function handleGrantFalcaoToken(targetCharacterId: string, alvoDescricao: string) {
    if (!selectedCampaignId) {
      addLogEntry("recurso", "Conceder Falcão exige mesa conectada.");
      return;
    }
    const current = characterRef.current;
    const status = getFalcaoAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    const ally = alliesAtivos.find((a) => a.id === targetCharacterId);
    if (!ally) {
      addLogEntry("recurso", "Aliado não encontrado entre os personagens ativos da mesa — atualize a lista de aliados.");
      return;
    }
    const nowIso = new Date().toISOString();
    const targetNext: Character = {
      ...ally.character,
      falcao_token_ativo: { origem: current.nome, alvoDescricao: alvoDescricao || "(sem descrição)", valor: status.valor, concedidoEm: nowIso },
    };
    try {
      const targetRecord = await updateCharacter(ally.id, targetNext);
      setAlliesAtivos((prev) => prev.map((a) => (a.id === ally.id ? { ...a, character: normalizeCharacter(targetRecord.payload) } : a)));
    } catch (err) {
      addLogEntry("recurso", err instanceof Error ? `Falha ao conceder Falcão a ${ally.nome}: ${err.message}` : `Falha ao conceder Falcão a ${ally.nome}.`);
      return;
    }
    const sourceNext = markFalcaoUsed(current, nowIso);
    characterRef.current = sourceNext;
    setCharacter(sourceNext);
    addLogEntry("condicao", `Falcão: +${status.valor} concedido a ${ally.nome} (alvo: ${alvoDescricao || "—"}, 1/cena).`);
  }

  /**
   * Estrategista › Briefing de Campo (N2, checkpoint talentos Fase 5) — registra a perícia
   * designada em cada aliado escolhido (persistido em CADA aliado, sem gate de uso do
   * próprio talento — a única cadência real é "5 minutos antes de uma cena", puramente
   * narrativa, sem contador estruturado no payload).
   */
  async function handleRegisterBriefing(entries: { targetCharacterId: string; periciaId: string }[]) {
    if (!selectedCampaignId) {
      addLogEntry("recurso", "Registrar Briefing de Campo exige mesa conectada.");
      return;
    }
    const current = characterRef.current;
    const nowIso = new Date().toISOString();
    const bonusReroll = getBriefingDeCampoAvailability(current, talentsIniciais).bonusReroll;
    const nomes: string[] = [];
    for (const entry of entries) {
      const ally = alliesAtivos.find((a) => a.id === entry.targetCharacterId);
      if (!ally) continue;
      const targetNext: Character = {
        ...ally.character,
        briefing_campo_ativo: { periciaId: entry.periciaId, origem: current.nome, bonus: bonusReroll, concedidoEm: nowIso },
      };
      try {
        const targetRecord = await updateCharacter(ally.id, targetNext);
        setAlliesAtivos((prev) => prev.map((a) => (a.id === ally.id ? { ...a, character: normalizeCharacter(targetRecord.payload) } : a)));
        nomes.push(`${ally.nome} (${entry.periciaId})`);
      } catch (err) {
        addLogEntry("recurso", err instanceof Error ? `Falha ao registrar Briefing para ${ally.nome}: ${err.message}` : `Falha ao registrar Briefing para ${ally.nome}.`);
      }
    }
    if (nomes.length > 0) {
      addLogEntry("condicao", `Briefing de Campo: ${nomes.join(", ")} registrados (5 minutos de preparação).`);
    }
  }

  /** Estrategista › Imposição de Ritmo (N3, checkpoint talentos Fase 5) — gasta 1 Reação real do CASTER e concede +1 PA real ao aliado escolhido nesta rodada, 1/cena. Distância (10m) e alternância PJ/PN ficam como lembrete manual (sem modelo de posição/turno nesta base). */
  async function handleUseImposicaoDeRitmo(targetCharacterId: string) {
    if (!selectedCampaignId) {
      addLogEntry("recurso", "Imposição de Ritmo exige mesa conectada.");
      return;
    }
    const current = characterRef.current;
    const status = getImposicaoDeRitmoAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    if ((current.estado_jogo?.reacoes_usadas ?? 0) >= derivados.reacoes_por_rodada) {
      addLogEntry("recurso", "Imposição de Ritmo: sem Reação disponível.");
      return;
    }
    const ally = alliesAtivos.find((a) => a.id === targetCharacterId);
    if (!ally) {
      addLogEntry("recurso", "Aliado não encontrado entre os personagens ativos da mesa — atualize a lista de aliados.");
      return;
    }
    const nowIso = new Date().toISOString();
    const targetNext: Character = {
      ...ally.character,
      estado_jogo: { ...ally.character.estado_jogo, pa_gastos: Math.max(0, (ally.character.estado_jogo?.pa_gastos ?? 0) - status.paBonus) },
    };
    try {
      const targetRecord = await updateCharacter(ally.id, targetNext);
      setAlliesAtivos((prev) => prev.map((a) => (a.id === ally.id ? { ...a, character: normalizeCharacter(targetRecord.payload) } : a)));
    } catch (err) {
      addLogEntry("recurso", err instanceof Error ? `Falha ao aplicar Imposição de Ritmo em ${ally.nome}: ${err.message}` : `Falha ao aplicar Imposição de Ritmo em ${ally.nome}.`);
      return;
    }
    const sourceNext = markImposicaoDeRitmoUsed(
      { ...current, estado_jogo: { ...current.estado_jogo, reacoes_usadas: (current.estado_jogo?.reacoes_usadas ?? 0) + 1 } },
      nowIso,
    );
    characterRef.current = sourceNext;
    setCharacter(sourceNext);
    addLogEntry(
      "condicao",
      `Imposição de Ritmo: Reação gasta — ${ally.nome} recebe +${status.paBonus} PA imediato (confirme manualmente distância até ${status.alcanceM}m; alternância PJ/PN e janela rápida/lenta não são restrições existentes nesta base).`,
    );
  }

  /** Estrategista › Briefing de Campo (N2, checkpoint talentos Fase 5) — consome a designação de perícia no rerroll. */
  function handleConsumeBriefingCampo() {
    const current = characterRef.current;
    if (!current.briefing_campo_ativo) return;
    const { briefing_campo_ativo: _drop, ...next } = current;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Briefing de Campo: rerroll consumido nesta perícia.");
  }

  /** Manipulador › Entrelinhas (N2, checkpoint talentos Fase 6) — registra a vulnerabilidade descoberta contra uma criatura, 1/cena (sempre no próprio caster). */
  function handleRegisterEntrelinhas(params: { alvoNome: string; descoberta: string }) {
    const current = characterRef.current;
    const status = getEntrelinhasAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    const nowIso = new Date().toISOString();
    const next = markEntrelinhasUsed(
      { ...current, entrelinhas_ativo: { alvoNome: params.alvoNome, descoberta: params.descoberta, valor: status.valor, concedidoEm: nowIso } },
      nowIso,
    );
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Entrelinhas: vulnerabilidade descoberta em ${params.alvoNome} (${params.descoberta}) — +${status.valor} no próximo teste de Influência contra ela.`);
  }

  /** Manipulador › Entrelinhas — consome a vulnerabilidade (chamado pelo RollsTab após um teste de Influência confirmado contra o alvo). */
  function handleConsumeEntrelinhas() {
    const current = characterRef.current;
    if (!current.entrelinhas_ativo) return;
    const { entrelinhas_ativo: _drop, ...next } = current;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Entrelinhas: vulnerabilidade consumida neste teste de Influência.");
  }

  /** Malabarista › Espetáculo Mortal — consome a promoção ativa (chamado pelo RollsTab após o teste de Precisão da sequência). */
  function handleConsumeEspetaculoMortal() {
    const current = characterRef.current;
    if (!current.espetaculo_mortal_ativo) return;
    const { espetaculo_mortal_ativo: _drop, ...next } = current;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Espetáculo Mortal: promoção consumida neste teste de Precisão.");
  }

  /** Manipulador › Puxar os Fios (N3, checkpoint talentos Fase 6) — registra a abertura social forçada, 1/cena, exige Entrelinhas ativo. */
  function handleRegisterPuxarOsFios(abertura: string) {
    const current = characterRef.current;
    const status = getPuxarOsFiosAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene || !current.entrelinhas_ativo) return;
    const nowIso = new Date().toISOString();
    const next = markPuxarOsFiosUsed(current, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Puxar os Fios: abertura social contra ${current.entrelinhas_ativo.alvoNome} — ${abertura}.`);
  }

  /** Paramédico › Pronto-socorro (N1, checkpoint talentos Fase 7) — estabiliza aliado a 0 PV real, 1/cena, sem teste/custo. */
  async function handleProntoSocorro(targetCharacterId: string, aindaNaoAgiu: boolean) {
    if (!selectedCampaignId) {
      addLogEntry("recurso", "Pronto-socorro exige mesa conectada.");
      return;
    }
    const current = characterRef.current;
    const status = getProntoSocorroAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    const ally = alliesAtivos.find((a) => a.id === targetCharacterId);
    if (!ally) {
      addLogEntry("recurso", "Aliado não encontrado entre os personagens ativos da mesa — atualize a lista de aliados.");
      return;
    }
    const nowIso = new Date().toISOString();
    const targetNext = applyProntoSocorroToAlly(ally.character, talentsIniciais, nowIso, aindaNaoAgiu);
    try {
      const targetRecord = await updateCharacter(ally.id, targetNext);
      setAlliesAtivos((prev) => prev.map((a) => (a.id === ally.id ? { ...a, character: normalizeCharacter(targetRecord.payload) } : a)));
    } catch (err) {
      addLogEntry("recurso", err instanceof Error ? `Falha ao estabilizar ${ally.nome}: ${err.message}` : `Falha ao estabilizar ${ally.nome}.`);
      return;
    }
    const sourceNext = markProntoSocorroUsed(current, nowIso);
    characterRef.current = sourceNext;
    setCharacter(sourceNext);
    addLogEntry("recurso", `Pronto-socorro: ${ally.nome} estabilizado com 1 PV${aindaNaoAgiu ? " e +1 PA para agir nesta rodada" : ""} (1/cena).`);
  }

  /** Paramédico › Protocolo de Emergência (N3, checkpoint talentos Fase 7) — gasta 1 Reação real, 1/cena, aliado a até 5m permanece de pé. */
  async function handleProtocoloDeEmergencia(targetCharacterId: string) {
    if (!selectedCampaignId) {
      addLogEntry("recurso", "Protocolo de Emergência exige mesa conectada.");
      return;
    }
    const current = characterRef.current;
    const status = getProtocoloDeEmergenciaAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    if ((current.estado_jogo?.reacoes_usadas ?? 0) >= derivados.reacoes_por_rodada) {
      addLogEntry("recurso", "Protocolo de Emergência: sem Reação disponível.");
      return;
    }
    const ally = alliesAtivos.find((a) => a.id === targetCharacterId);
    if (!ally) {
      addLogEntry("recurso", "Aliado não encontrado entre os personagens ativos da mesa — atualize a lista de aliados.");
      return;
    }
    const nowIso = new Date().toISOString();
    const targetNext = applyProtocoloDeEmergenciaToAlly(ally.character, nowIso);
    try {
      const targetRecord = await updateCharacter(ally.id, targetNext);
      setAlliesAtivos((prev) => prev.map((a) => (a.id === ally.id ? { ...a, character: normalizeCharacter(targetRecord.payload) } : a)));
    } catch (err) {
      addLogEntry("recurso", err instanceof Error ? `Falha ao aplicar Protocolo de Emergência em ${ally.nome}: ${err.message}` : `Falha ao aplicar Protocolo de Emergência em ${ally.nome}.`);
      return;
    }
    const sourceNext = markProtocoloDeEmergenciaUsed(
      { ...current, estado_jogo: { ...current.estado_jogo, reacoes_usadas: (current.estado_jogo?.reacoes_usadas ?? 0) + 1 } },
      nowIso,
    );
    characterRef.current = sourceNext;
    setCharacter(sourceNext);
    addLogEntry(
      "recurso",
      `Protocolo de Emergência: Reação gasta — ${ally.nome} permanece de pé (confirme manualmente que está a até ${status.alcanceM}m; aplique Medkit/Injetor/magia de cura pelo fluxo normal).`,
    );
  }

  /**
   * Totem › Onda Solidária (N2, checkpoint talentos Fase 9) — copia o ÚLTIMO efeito positivo
   * real (deltas de PV/PE + efeitos temporários) para um SEGUNDO aliado adjacente, sem
   * cobrar/consumir o item de novo (nunca chama useItemOnAlly outra vez). Sem cadência no
   * payload — sempre disponível; "faz sentido na ficção" confirmado pelo próprio clique.
   */
  async function handleOndaSolidariaExtend(secondAllyId: string) {
    if (!selectedCampaignId || !ultimoEfeitoPositivoAliado) return;
    const current = characterRef.current;
    if (!hasOndaSolidaria(current, talentsIniciais)) return;
    const ally2 = alliesAtivos.find((a) => a.id === secondAllyId);
    if (!ally2) {
      addLogEntry("recurso", "Aliado não encontrado entre os personagens ativos da mesa — atualize a lista de aliados.");
      return;
    }
    const targetDerivados = computeDerivedStats(ally2.character.atributos, regras, ally2.character.mana_bonus_ruptura ?? 0);
    let ally2Next = applyResourceDeltas(ally2.character, ultimoEfeitoPositivoAliado.resourceDeltas, {
      pv: targetDerivados.pv_max,
      pe: targetDerivados.pe_max,
    });
    for (const efeito of ultimoEfeitoPositivoAliado.temporaryEffects) {
      ally2Next = addTemporaryEffect(ally2Next, copyTemporaryEffect(efeito, () => crypto.randomUUID()));
    }
    try {
      const saved = await updateCharacter(ally2.id, ally2Next);
      setAlliesAtivos((prev) => prev.map((a) => (a.id === ally2.id ? { ...a, character: normalizeCharacter(saved.payload) } : a)));
      addLogEntry("recurso", `Onda Solidária: efeito de ${ultimoEfeitoPositivoAliado.targetNome} estendido para ${ally2.nome} (mesmo efeito, sem custo extra).`);
    } catch (err) {
      addLogEntry("recurso", err instanceof Error ? `Falha ao estender Onda Solidária para ${ally2.nome}: ${err.message}` : `Falha ao estender Onda Solidária para ${ally2.nome}.`);
    }
  }

  /**
   * Totem › Chama Redobrada (N3, checkpoint talentos Fase 9) — dobra o ÚLTIMO efeito
   * positivo real aplicado (numérico: reaplica o MESMO delta de novo; duração: dobra
   * `remainingRounds` dos efeitos temporários round-based), 1/cena, no MESMO alvo original.
   */
  async function handleChamaRedobrada(opcao: "numerico" | "duracao") {
    if (!selectedCampaignId || !ultimoEfeitoPositivoAliado) return;
    const current = characterRef.current;
    const status = getChamaRedobradaAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    const alvo = alliesAtivos.find((a) => a.id === ultimoEfeitoPositivoAliado.targetCharacterId);
    if (!alvo) {
      addLogEntry("recurso", "Aliado original não encontrado entre os personagens ativos da mesa — atualize a lista de aliados.");
      return;
    }
    const targetDerivados = computeDerivedStats(alvo.character.atributos, regras, alvo.character.mana_bonus_ruptura ?? 0);
    let alvoNext = alvo.character;
    if (opcao === "numerico") {
      alvoNext = applyResourceDeltas(alvoNext, ultimoEfeitoPositivoAliado.resourceDeltas, { pv: targetDerivados.pv_max, pe: targetDerivados.pe_max });
      for (const efeito of ultimoEfeitoPositivoAliado.temporaryEffects) {
        const dobrado = doubleTemporaryEffectValue(efeito, () => crypto.randomUUID());
        alvoNext = addTemporaryEffect(alvoNext, dobrado);
      }
    } else {
      const ativos = getActiveTemporaryEffects(alvoNext);
      for (const efeito of ultimoEfeitoPositivoAliado.temporaryEffects) {
        const atual = ativos.find((e) => e.id === efeito.id) ?? efeito;
        alvoNext = removeTemporaryEffect(alvoNext, atual.id, new Date().toISOString());
        alvoNext = addTemporaryEffect(alvoNext, doubleTemporaryEffectDuration(atual, () => crypto.randomUUID()));
      }
    }
    try {
      const saved = await updateCharacter(alvo.id, alvoNext);
      setAlliesAtivos((prev) => prev.map((a) => (a.id === alvo.id ? { ...a, character: normalizeCharacter(saved.payload) } : a)));
      const sourceNext = markChamaRedobradaUsed(current, new Date().toISOString());
      characterRef.current = sourceNext;
      setCharacter(sourceNext);
      addLogEntry("recurso", `Chama Redobrada: efeito em ${alvo.nome} dobrado (${opcao === "numerico" ? "valor numérico" : "duração"}), 1/cena.`);
    } catch (err) {
      addLogEntry("recurso", err instanceof Error ? `Falha ao aplicar Chama Redobrada em ${alvo.nome}: ${err.message}` : `Falha ao aplicar Chama Redobrada em ${alvo.nome}.`);
    }
  }

  /**
   * Malabarista › Espetáculo Mortal (N3, checkpoint talentos Fase 10) — consome 3 armas
   * leves de Arremesso reais do inventário (1 unidade cada), 1/cena, e ativa a promoção
   * falha_limitada→sucesso_limitado no PRÓXIMO teste de Precisão (RollsTab). A resolução do
   * dano das 3 armas contra 1 ou até 3 alvos continua manual — este sistema resolve
   * `attack_resolved` para um alvo por vez; multi-alvo simultâneo exigiria reestruturar todo
   * o pipeline de resolução de ataque, fora do escopo desta fase.
   */
  function handleEspetaculoMortal(selectedInstanceIds: string[], opcao: "convergencia" | "dispersao") {
    const current = characterRef.current;
    const status = getEspetaculoMortalAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    if (selectedInstanceIds.length !== status.armasNecessarias) return;
    const nowIso = new Date().toISOString();
    let next = current;
    for (const instanceId of selectedInstanceIds) {
      const result = removeQuantityFromInventory(next, instanceId, 1, nowIso);
      if (!result.ok) {
        addLogEntry("recurso", `Espetáculo Mortal: falha ao consumir arma (${result.reason}) — nada foi aplicado.`);
        return;
      }
      next = result.character;
    }
    next = markEspetaculoMortalUsed(next, nowIso);
    next = { ...next, espetaculo_mortal_ativo: { opcao, concedidoEm: nowIso } };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry(
      "acao_combate",
      `Espetáculo Mortal: ${status.armasNecessarias} armas de Arremesso consumidas — ${opcao === "convergencia" ? "Convergência (1 alvo, dano das 3 armas)" : "Dispersão (até 3 alvos, 1 arremesso cada)"}. Resolva o(s) ataque(s) manualmente em /dev/table; falha limitada conta como sucesso limitado no teste de Precisão.`,
    );
  }

  /** Mercador › Rede de Favores — recruta um PN como aliado temporário (1x/sessão, uso não reembolsado ao encerrar). */
  function handleRegisterRedeDeFavores(params: { nomePn: string; papel: string; tipoPagamento: "favor" | "promessa" | "pagamento_simbolico"; duracao: string; notas: string }) {
    const current = characterRef.current;
    const status = getRedeDeFavoresAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisSession) return;
    const nowIso = new Date().toISOString();
    let next = markRedeDeFavoresUsed(current, nowIso);
    next = {
      ...next,
      rede_de_favores_ativa: {
        id: crypto.randomUUID(),
        nomePn: params.nomePn,
        papel: params.papel,
        tipoPagamento: params.tipoPagamento,
        duracao: params.duracao,
        notas: params.notas,
        sessao: nowIso.slice(0, 10),
        criadaEm: nowIso,
        ativo: true,
      },
    };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Rede de Favores: ${params.nomePn} (${params.papel}) recrutado como aliado temporário — pago com ${params.tipoPagamento}.`);
  }

  /** Mercador › Rede de Favores — encerra o vínculo manualmente (o uso já gasto não é reembolsado). */
  function handleEndRedeDeFavores() {
    const current = characterRef.current;
    if (!current.rede_de_favores_ativa?.ativo) return;
    const nowIso = new Date().toISOString();
    const next = { ...current, rede_de_favores_ativa: { ...current.rede_de_favores_ativa, ativo: false, encerradaEm: nowIso } };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Rede de Favores: vínculo com ${current.rede_de_favores_ativa.nomePn} encerrado.`);
  }

  /** Rato de Rua › Zé da Esquina — invoca contato real que resolve uma complicação menor (1x/missão). */
  function handleRegisterZeDaEsquina(params: { contato: string; tipo: "informacao" | "abrigo" | "recurso_imediato"; complicacaoResolvida: string; notas: string }) {
    const current = characterRef.current;
    const status = getZeDaEsquinaAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisMission) return;
    const nowIso = new Date().toISOString();
    let next = markZeDaEsquinaUsed(current, nowIso);
    const registro = { id: crypto.randomUUID(), contato: params.contato, tipo: params.tipo, complicacaoResolvida: params.complicacaoResolvida, notas: params.notas, criadoEm: nowIso };
    next = { ...next, ze_da_esquina_registros: [...(next.ze_da_esquina_registros ?? []), registro] };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Zé da Esquina: contato ${params.contato} resolveu — ${params.complicacaoResolvida}.`);
  }

  /** Rato de Rua › Gato de Telhado — conduz o grupo a um local seguro real, 1x/dia. */
  function handleRegisterGatoDeTelhado(params: { local: string; personagensProtegidos: string[] }) {
    const current = characterRef.current;
    const status = getGatoDeTelhadoAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedToday) return;
    const nowIso = new Date().toISOString();
    let next = markGatoDeTelhadoUsed(current, nowIso);
    next = {
      ...next,
      gato_de_telhado_ativo: { id: crypto.randomUUID(), local: params.local, personagensProtegidos: params.personagensProtegidos, criadoEm: nowIso, ativo: true },
    };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Gato de Telhado: grupo conduzido a local seguro — ${params.local}.`);
  }

  /** Rato de Rua › Gato de Telhado — encerra manualmente o local seguro (o grupo deixou o esconderijo). */
  function handleEndGatoDeTelhado() {
    const current = characterRef.current;
    if (!current.gato_de_telhado_ativo?.ativo) return;
    const nowIso = new Date().toISOString();
    const next = { ...current, gato_de_telhado_ativo: { ...current.gato_de_telhado_ativo, ativo: false, encerradoEm: nowIso } };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Gato de Telhado: grupo deixou o local seguro (${current.gato_de_telhado_ativo.local}).`);
  }

  /** Rato de Rua › Saída dos Fundos — escape narrativo instantâneo real, 1x/dia. */
  function handleRegisterSaidaDosFundos(params: { situacaoDeRisco: string; rotaOuMetodo: string; consequenciaMenor: string }) {
    const current = characterRef.current;
    const status = getSaidaDosFundosAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedToday) return;
    const nowIso = new Date().toISOString();
    let next = markSaidaDosFundosUsed(current, nowIso);
    next = {
      ...next,
      saida_dos_fundos_ativa: {
        id: crypto.randomUUID(),
        situacaoDeRisco: params.situacaoDeRisco,
        rotaOuMetodo: params.rotaOuMetodo,
        consequenciaMenor: params.consequenciaMenor,
        criadoEm: nowIso,
        ativo: true,
      },
    };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Saída dos Fundos: escapou de "${params.situacaoDeRisco}" via ${params.rotaOuMetodo} — não pode ser capturado, morto ou rendido nesta cena.`);
  }

  /** Rato de Rua › Saída dos Fundos — encerra manualmente a proteção da cena. */
  function handleEndSaidaDosFundos() {
    const current = characterRef.current;
    if (!current.saida_dos_fundos_ativa?.ativo) return;
    const nowIso = new Date().toISOString();
    const next = { ...current, saida_dos_fundos_ativa: { ...current.saida_dos_fundos_ativa, ativo: false, encerradoEm: nowIso } };
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Saída dos Fundos: proteção da cena encerrada.");
  }

  /** Droneiro › registra um drone real sob comando (sem catálogo estruturado de drones no conteúdo). */
  function handleRegisterDrone(params: { nome: string; modelo: string; paMaximo: number; acoes: string }) {
    const current = characterRef.current;
    const nowIso = new Date().toISOString();
    const next = registerDrone(current, params, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Drone registrado: ${params.nome} (${params.modelo}).`);
  }

  function handleRemoveDrone(droneId: string) {
    const current = characterRef.current;
    const drone = current.drones?.find((d) => d.id === droneId);
    if (!drone) return;
    const next = removeDrone(current, droneId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Drone removido: ${drone.nome}.`);
  }

  /** Droneiro › assume o controle do drone (teste de Robótica é manual — RollsTab, com a promoção de margem de Sinal Limpo já automática). */
  function handleActivateDrone(droneId: string) {
    const current = characterRef.current;
    const drone = current.drones?.find((d) => d.id === droneId);
    if (!drone) return;
    const next = activateDrone(current, droneId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Controle assumido: ${drone.nome}.`);
  }

  function handleDeactivateDrone(droneId: string) {
    const current = characterRef.current;
    const drone = current.drones?.find((d) => d.id === droneId);
    if (!drone) return;
    const next = deactivateDrone(current, droneId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Controle encerrado: ${drone.nome}.`);
  }

  /** Droneiro › Sinal Limpo — +1 PA real no drone escolhido, só nesta rodada (1x/cena; expira em Encerrar Rodada). */
  function handleApplySinalLimpoBonus(droneId: string) {
    const current = characterRef.current;
    const status = getSinalLimpoAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    const drone = current.drones?.find((d) => d.id === droneId);
    if (!drone) return;
    const nowIso = new Date().toISOString();
    const next = applySinalLimpoBonus(current, droneId, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Sinal Limpo: +1 PA em ${drone.nome} nesta rodada.`);
  }

  /** Droneiro › Script — define o gatilho simples do drone na 1ª ativação da cena. */
  function handleSetDroneGatilho(droneId: string, descricao: string, acaoAssociada: string) {
    const current = characterRef.current;
    if (!hasScript(current, talentsIniciais)) return;
    const drone = current.drones?.find((d) => d.id === droneId);
    if (!drone) return;
    const next = setDroneGatilho(current, droneId, descricao, acaoAssociada);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Script: gatilho definido em ${drone.nome} — "${descricao}" → ${acaoAssociada}.`);
  }

  /** Droneiro › Script — marca o gatilho como ocorrido: o drone executa a ação automaticamente, sem custo de PA. */
  function handleMarkDroneGatilhoOcorrido(droneId: string) {
    const current = characterRef.current;
    const drone = current.drones?.find((d) => d.id === droneId);
    if (!drone?.gatilho) return;
    const next = markDroneGatilhoOcorrido(current, droneId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Script: gatilho ocorreu em ${drone.nome} — executando "${drone.gatilho.acaoAssociada}" automaticamente (0 PA).`);
  }

  /** Droneiro › Enxame — pareia até 3 drones de mesmo modelo, 1x/dia. */
  function handlePairEnxame(droneIds: string[], modo: "pareada" | "independente") {
    const current = characterRef.current;
    const status = getEnxameAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedToday) return;
    if (droneIds.length < 2 || droneIds.length > status.maxUnidades) return;
    const nowIso = new Date().toISOString();
    const next = pairDronesEnxame(current, droneIds, modo, nowIso);
    if (next === current) {
      addLogEntry("condicao", "Enxame: os drones escolhidos não são do mesmo modelo — pareamento não aplicado.");
      return;
    }
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Enxame: ${droneIds.length} drones pareados (${modo}).`);
  }

  function handleUnpairEnxame(grupoId: string) {
    const current = characterRef.current;
    const next = unpairDrones(current, grupoId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Enxame: pareamento desfeito.");
  }

  /** Mecatrônico › registra um robô real sob programação (sem catálogo estruturado de robôs no conteúdo). */
  function handleRegisterRobo(params: { nome: string; modelo: string; paMaximo: number; acaoAutonoma: string }) {
    const current = characterRef.current;
    const next = registerRobo(current, params);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Robô registrado: ${params.nome} (${params.modelo}).`);
  }

  function handleRemoveRobo(roboId: string) {
    const current = characterRef.current;
    const robo = current.robos?.find((r) => r.id === roboId);
    if (!robo) return;
    const next = removeRobo(current, roboId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Robô removido: ${robo.nome}.`);
  }

  /** Mecatrônico › Chave de Arranque — programa o robô (teste de Robótica é manual, com a promoção de margem já automática). */
  function handleProgramRobo(roboId: string, acaoAutonoma: string) {
    const current = characterRef.current;
    const robo = current.robos?.find((r) => r.id === roboId);
    if (!robo) return;
    const temChaveDeArranque = hasChaveDeArranque(current, talentsIniciais);
    const next = programRobo(current, roboId, acaoAutonoma, temChaveDeArranque);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry(
      "condicao",
      `Robô programado: ${robo.nome} — autônomo: "${acaoAutonoma}".${temChaveDeArranque ? " Chave de Arranque: +1 no primeiro teste da cena disponível." : ""}`,
    );
  }

  function handleConsumeRoboPrimeiroTesteBonus(roboId: string) {
    const current = characterRef.current;
    const robo = current.robos?.find((r) => r.id === roboId);
    if (!robo?.primeiroTesteBonusDisponivel) return;
    const next = consumeRoboPrimeiroTesteBonus(current, roboId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Chave de Arranque: +1 consumido no primeiro teste de ${robo.nome} nesta cena.`);
  }

  /** Mecatrônico › Marcha Dupla — o robô mantém a ação autônoma E age duas vezes na rodada, 1x/cena. */
  function handleApplyMarchaDupla(roboId: string) {
    const current = characterRef.current;
    const status = getMarchaDuplaAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisScene) return;
    const robo = current.robos?.find((r) => r.id === roboId);
    if (!robo) return;
    const nowIso = new Date().toISOString();
    const next = applyMarchaDupla(current, roboId, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Marcha Dupla: ${robo.nome} mantém a ação autônoma e age duas vezes nesta rodada.`);
  }

  /** Mecatrônico › Overclock — +1 PA por rodada real no robô escolhido durante toda a cena, 1x/dia. */
  function handleApplyOverclock(roboId: string) {
    const current = characterRef.current;
    const status = getOverclockAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedToday) return;
    const robo = current.robos?.find((r) => r.id === roboId);
    if (!robo) return;
    const nowIso = new Date().toISOString();
    const next = activateOverclock(current, roboId, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Overclock: ${robo.nome} recebe +1 PA por rodada durante esta cena.`);
  }

  /** Tecelão › inicia uma Trama real — Olho de Botão revela automaticamente os níveis (payload) se adquirido. */
  function handleIniciarTrama(params: { nome: string; classificacao: string; ramMaximo: number }) {
    const current = characterRef.current;
    if (current.trama_ativa?.ativa) {
      addLogEntry("condicao", "Já há uma Trama ativa — desligue antes de conectar em outra.");
      return;
    }
    const nowIso = new Date().toISOString();
    const next = iniciarTrama(current, params, talentsIniciais, nowIso);
    characterRef.current = next;
    setCharacter(next);
    const temOlhoDeBotao = next.trama_ativa!.niveisRevelados > 0;
    addLogEntry(
      "condicao",
      `Trama conectada: ${params.nome} (${params.classificacao}).${temOlhoDeBotao ? ` Olho de Botão revelou ${next.trama_ativa!.niveisRevelados} nível(is) automaticamente.` : ""}`,
    );
  }

  function handleEncerrarTrama() {
    const current = characterRef.current;
    if (!current.trama_ativa?.ativa) return;
    const nowIso = new Date().toISOString();
    const next = encerrarTrama(current, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Trama desconectada: ${current.trama_ativa.nome}.`);
  }

  function handleAdicionarElementoTrama(campo: "bloqueios" | "nos" | "presencasHostis", nome: string) {
    const current = characterRef.current;
    const next = adicionarElementoTrama(current, campo, nome);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleRemoverElementoTrama(campo: "bloqueios" | "nos" | "presencasHostis", index: number) {
    const current = characterRef.current;
    const next = removerElementoTrama(current, campo, index);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleAjustarRamTrama(delta: number) {
    const current = characterRef.current;
    const next = ajustarRamTrama(current, delta);
    characterRef.current = next;
    setCharacter(next);
  }

  function handleAjustarDeteccaoTrama(delta: number) {
    const current = characterRef.current;
    const next = ajustarDeteccaoTrama(current, delta);
    characterRef.current = next;
    setCharacter(next);
    if (!current.trama_ativa?.detecaoAcionada && next.trama_ativa?.detecaoAcionada) {
      addLogEntry("condicao", `Detecção acionada na Trama "${next.trama_ativa.nome}"!`);
    }
  }

  /** Tecelão › Bypass — executa 1 Comando à escolha sem teste (ainda consome PA/RAM reais), 1x/sessão de Malha. */
  function handleExecutarBypass(comando: string, custoPa: number, custoRam: number) {
    const current = characterRef.current;
    const status = getBypassAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisSession || !current.trama_ativa?.ativa) return;
    const nowIso = new Date().toISOString();
    const next = executarBypass(current, comando, custoPa, custoRam, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Bypass: "${comando}" executado sem teste — ${custoPa} PA, ${custoRam} RAM.`);
  }

  /** Tecelão › Agulha Fina — Apagar Rastros/Modificar Assinatura como ação livre, sem PA/RAM, 1x/sessão de Malha. */
  function handleExecutarAgulhaFina(comando: "Apagar Rastros" | "Modificar Assinatura") {
    const current = characterRef.current;
    const status = getAgulhaFinaAvailability(current, talentsIniciais);
    if (!status.acquired || status.usedThisSession || status.bloqueadoPorDeteccao || !current.trama_ativa?.ativa) return;
    const nowIso = new Date().toISOString();
    const next = executarAgulhaFina(current, comando, nowIso);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", `Agulha Fina: "${comando}" executado como ação livre — 0 PA, 0 RAM.`);
  }

  /** Rúnico › Gatilho Rúnico — ativa/desativa runa instalada sem PA. */
  function handleToggleRuneActive(instanceId: string, runeInstallationId: string) {
    const current = characterRef.current;
    const result = toggleInstalledRune(current, instanceId, runeInstallationId);
    if (!result) return;
    characterRef.current = result.character;
    setCharacter(result.character);
    addLogEntry("condicao", `Gatilho Rúnico: runa ${result.ativa ? "ativada" : "desativada"} — 0 PA.`);
  }

  /** Rúnico › Entalhe Rápido — gasta 1 PA e prepara o teste real de Engenharia (CD do narrador). */
  function handleStartEntalheRapido(instanceId: string, mode: "instalar" | "remover", alvo: string, cd: number) {
    if (!alvo || !cd) return;
    const current = characterRef.current;
    // Preflight: se já há uma tentativa pendente nesta instância, não inicia outra (evitaria perder o
    // rastro do 1º PA já gasto). Para instalar, verifica o limite de slots ANTES de gastar o PA — sem
    // isso, um jogador podia passar no teste de Engenharia e só descobrir depois que o slot estava cheio.
    if (current.entalhe_rapido_tentativas?.[instanceId]) {
      addLogEntry("condicao", "Entalhe Rápido: já há uma tentativa pendente para este item — confirme ou aguarde antes de iniciar outra.");
      return;
    }
    if (mode === "instalar") {
      const instance = current.inventario?.find((i) => i.id === instanceId);
      const itemContent = instance ? itemsIniciais.find((i) => i.slug === instance.itemSlug) : undefined;
      if (instance) {
        const slotsMax = getSlotsRunaMaxEfetivo(instance, itemContent, characterId);
        if (slotsMax != null && countInstalledRunes(instance) >= slotsMax) {
          addLogEntry("condicao", `Entalhe Rápido: limite de slots de runa já atingido (máx. ${slotsMax}) — PA não gasto.`);
          return;
        }
      }
    }
    // PA + tentativa pendente aplicados NUM SÓ update — persistidos juntos (sobrevive a
    // reload/salvar; antes `entalheAttempts` era só estado local, perdido ao recarregar
    // no meio do fluxo, deixando o PA gasto sem tentativa correspondente para confirmar).
    const paGastosAntes = current.estado_jogo?.pa_gastos ?? 0;
    const next: Character = {
      ...current,
      estado_jogo: { ...current.estado_jogo, pa_gastos: paGastosAntes + 1 },
      entalhe_rapido_tentativas: { ...current.entalhe_rapido_tentativas, [instanceId]: { mode, alvo, cd } },
    };
    characterRef.current = next;
    setCharacter(next);
    const periciaDef = regras?.pericias.find((p) => p.id === "engenharia");
    setPreparedRoll({ atributoId: periciaDef?.atributo_primario ?? "mente", periciaId: "engenharia", origem: `Entalhe Rápido: ${mode}` });
    setActiveTab("rolagens");
    addLogEntry("condicao", `Entalhe Rápido: 1 PA gasto — teste de Engenharia CD ${cd} para ${mode === "instalar" ? "instalar" : "remover"} a runa.`);
  }

  /** Confirma o resultado do teste — só aplica a alteração (instalar/remover) em sucesso; falha preserva item/runa (PA já gasto). */
  function handleConfirmEntalheRapido(instanceId: string, resultado: number) {
    const current = characterRef.current;
    const attempt = current.entalhe_rapido_tentativas?.[instanceId];
    if (!attempt) return;
    const sucesso = resultado >= attempt.cd;
    const semTentativa: Character = {
      ...current,
      entalhe_rapido_tentativas: Object.fromEntries(Object.entries(current.entalhe_rapido_tentativas ?? {}).filter(([id]) => id !== instanceId)),
    };
    if (!sucesso) {
      characterRef.current = semTentativa;
      setCharacter(semTentativa);
      addLogEntry("condicao", `Entalhe Rápido: falha (${resultado} < CD ${attempt.cd}) — item e runa preservados, PA não é devolvido.`);
      return;
    }
    if (attempt.mode === "instalar") {
      const rune = runesIniciais.find((r) => r.slug === attempt.alvo);
      if (!rune) return;
      const instance = semTentativa.inventario?.find((i) => i.id === instanceId);
      const itemContent = instance ? itemsIniciais.find((i) => i.slug === instance.itemSlug) : undefined;
      const result = installRuneOnItem({
        character: semTentativa,
        instanceId,
        itemContent,
        rune,
        nowIso: new Date().toISOString(),
        currentCharacterId: characterId,
      });
      // Sucesso no teste, mas a instalação em si falhou (ex.: slot ocupado nesse meio-tempo) —
      // ainda assim limpa a tentativa pendente (não fica travada) e preserva o PA já gasto.
      characterRef.current = result.character;
      setCharacter(result.character);
      if (!result.ok) {
        addLogEntry("condicao", `Entalhe Rápido: sucesso no teste, mas ${result.reason ?? "não instalada"}.`);
        return;
      }
      addLogEntry("condicao", `Entalhe Rápido: sucesso (${resultado} ≥ CD ${attempt.cd}) — runa ${rune.nome} instalada.`);
    } else {
      const next = removeRuneFromItem(semTentativa, instanceId, attempt.alvo);
      characterRef.current = next;
      setCharacter(next);
      addLogEntry("condicao", `Entalhe Rápido: sucesso (${resultado} ≥ CD ${attempt.cd}) — runa removida.`);
    }
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

  /** Prepara na aba Rolagens um teste "relacionado" à ferramenta/dispositivo com Toque de Midas — o +1 entra via item:<instanceId>, escopado só a esta instância. */
  function handleRollToolTest(instanceId: string, relatedSkill: string) {
    const instance = (characterRef.current.inventario ?? []).find((i) => i.id === instanceId);
    if (!instance) return;
    const periciaDef = regras?.pericias.find((p) => p.id === relatedSkill);
    setPreparedRoll({
      atributoId: periciaDef?.atributo_primario ?? "mente",
      periciaId: periciaDef ? relatedSkill : null,
      origem: `Teste relacionado: ${instance.itemNome}`,
      extraTags: [`item:${instanceId}`],
    });
    setActiveTab("rolagens");
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
        profileId: selectedProfileId,
        profileSessionId: profileSessionToken?.profileSessionId ?? null,
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
        profileId: selectedProfileId,
        profileSessionId: profileSessionToken?.profileSessionId ?? null,
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
  async function handleUseItem(instanceId: string, options?: { selectedConditionInstanceId?: string }) {
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

    // Paramédico › Ritmo de Campo (checkpoint talentos, Fase 7) — "armado" pelo jogador
    // confirmando que este item é de cura; -1 PA real (mín. respeitado) no custo já pago.
    let characterAposItem = result.character;
    if (ritmoDeCampoAtivo && result.paCost != null) {
      const ritmoStatus = getRitmoDeCampoAvailability(current, talentsIniciais);
      if (ritmoStatus.acquired) {
        const reducaoReal = computeRitmoDeCampoReducao(result.paCost, ritmoStatus.reducao, ritmoStatus.minimo);
        if (reducaoReal > 0) {
          characterAposItem = {
            ...characterAposItem,
            estado_jogo: { ...characterAposItem.estado_jogo, pa_gastos: Math.max(0, (characterAposItem.estado_jogo?.pa_gastos ?? 0) - reducaoReal) },
          };
          addLogEntry("recurso", `Ritmo de Campo: custo de PA deste item de cura reduzido em ${reducaoReal}.`);
          setRitmoDeCampoAtivo(false);
        }
      }
    }

    // Berserker › Sede de Sangue — item de cura também pode levar o PV de volta
    // acima da metade; mesma checagem genérica da edição manual de recursos.
    const pvGatedPorItem = enforcePvGatedToggleDeactivation(
      characterAposItem,
      talentsIniciais,
      result.character.recursos_atuais?.pv ?? 0,
      derivados.pv_max,
      nowIso,
    );
    characterRef.current = pvGatedPorItem.character;
    setCharacter(pvGatedPorItem.character);
    for (const d of pvGatedPorItem.deactivated) {
      addLogEntry("recurso", `${d.talentNome} — ${d.nivelNome}: encerrado automaticamente (PV voltou a ficar acima da metade).`);
    }

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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "item_used",
          visibility: "public",
          payload: {
            characterId,
            characterNome: current.nome,
            profileId: selectedProfileId,
            profileNickname: perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null,
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
    const targetDerivados = computeDerivedStats(ally.character.atributos, regras, ally.character.mana_bonus_ruptura ?? 0);
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

    // Paramédico › Ritmo de Campo (checkpoint talentos, Fase 7) — "armado" pelo jogador
    // confirmando que este item usado no aliado é de cura; -1 PA real no CASTER (quem gasta o custo).
    let characterAposItemAliado = result.source;
    if (ritmoDeCampoAtivo && result.paCost != null) {
      const ritmoStatus = getRitmoDeCampoAvailability(current, talentsIniciais);
      if (ritmoStatus.acquired) {
        const reducaoReal = computeRitmoDeCampoReducao(result.paCost, ritmoStatus.reducao, ritmoStatus.minimo);
        if (reducaoReal > 0) {
          characterAposItemAliado = {
            ...characterAposItemAliado,
            estado_jogo: { ...characterAposItemAliado.estado_jogo, pa_gastos: Math.max(0, (characterAposItemAliado.estado_jogo?.pa_gastos ?? 0) - reducaoReal) },
          };
          addLogEntry("recurso", `Ritmo de Campo: custo de PA deste item de cura em ${ally.nome} reduzido em ${reducaoReal}.`);
          setRitmoDeCampoAtivo(false);
        }
      }
    }

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
    // Totem › Onda Solidária/Chama Redobrada (checkpoint talentos, Fase 9) — guarda o
    // snapshot deste efeito positivo (deltas reais + efeitos temporários) para copiar num
    // segundo aliado ou dobrar no mesmo alvo, via widgets dedicados na aba Talentos.
    if (result.targetResourceChanges.length > 0 || result.targetTemporaryEffectsAdded.length > 0) {
      setUltimoEfeitoPositivoAliado({
        targetCharacterId: ally.id,
        targetNome: ally.nome,
        resourceDeltas: result.targetResourceChanges.map((m) => ({ resource: m.resource, delta: m.after - m.before })),
        temporaryEffects: result.targetTemporaryEffectsAdded,
      });
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
        profileId: selectedProfileId,
        profileSessionId: profileSessionToken?.profileSessionId ?? null,
        type: "item_used",
        visibility: "public",
        payload: {
          characterId,
          characterNome: current.nome,
          profileId: selectedProfileId,
          profileNickname: perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null,
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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
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
   * Rúnico › Sobregravação (N3) — o DONO do talento aplica a autorização a
   * uma instância do próprio inventário (`equipamento_proprio`, payload).
   * Persiste na instância (sobrevive a transferência): dono + aliados
   * instruídos acessam o espaço extra automaticamente; qualquer outro
   * personagem que fique com o item depois precisa do teste CD 8
   * (`handleStartSobregravacaoTest`/`handleConfirmSobregravacaoTest`).
   */
  function handleApplySobregravacao(instanceId: string) {
    const current = characterRef.current;
    if (!hasSobregravacao(current, talentsIniciais)) return;
    if (!characterId) {
      addLogEntry("condicao", "Sobregravação: personagem sem id de sessão salvo — salve a ficha antes de aplicar.");
      return;
    }
    const multiplicador = getSobregravacaoMultiplier(current, talentsIniciais);
    const next = applySobregravacao({
      character: current,
      instanceId,
      ownerCharacterId: characterId,
      multiplicador,
      nowIso: new Date().toISOString(),
    });
    characterRef.current = next;
    setCharacter(next);
    addLogEntry(
      "condicao",
      `Sobregravação aplicada: espaços de runa deste item multiplicados por ${multiplicador} — só você e aliados instruídos se beneficiam do espaço extra; outros veem a inscrição, mas não acessam o efeito sem teste de Tecnomagia/Arcanismo CD 8.`,
    );
  }

  /** Rúnico › Sobregravação — dono edita a lista de aliados previamente instruídos (substitui a lista inteira). */
  function handleSetSobregravacaoAllies(instanceId: string, allyIds: string[]) {
    const current = characterRef.current;
    const next = setSobregravacaoInstructedAllies(current, instanceId, allyIds);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Sobregravação: aliados instruídos atualizados (${allyIds.length}).`);
  }

  /** Rúnico › Sobregravação — terceiro (não dono, não aliado instruído) inicia o teste real de Tecnomagia/Arcanismo CD 8 para acessar o espaço extra. */
  function handleStartSobregravacaoTest(instanceId: string) {
    const periciaDef =
      regras?.pericias.find((p) => p.id === "tecnomagia") ?? regras?.pericias.find((p) => p.id === "arcanismo");
    setSobregravacaoTestPending((prev) => ({ ...prev, [instanceId]: true }));
    setPreparedRoll({
      atributoId: periciaDef?.atributo_primario ?? "mente",
      periciaId: periciaDef?.id ?? "arcanismo",
      origem: "Sobregravação: acesso de terceiro ao espaço extra (CD 8)",
    });
    setActiveTab("rolagens");
    addLogEntry("condicao", "Sobregravação: teste de Tecnomagia ou Arcanismo CD 8 preparado para acessar o espaço extra deste item.");
  }

  /** Confirma o resultado do teste CD 8 — sucesso concede acesso permanente (persistido na instância); falha não bloqueia o item nem as runas já instaladas. */
  function handleConfirmSobregravacaoTest(instanceId: string, resultado: number) {
    if (!sobregravacaoTestPending[instanceId]) return;
    setSobregravacaoTestPending((prev) => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
    const sucesso = resultado >= 8;
    if (!sucesso) {
      addLogEntry("condicao", `Sobregravação: teste falhou (${resultado} < CD 8) — espaço extra continua inacessível para você.`);
      return;
    }
    if (!characterId) {
      addLogEntry("condicao", "Sobregravação: sucesso no teste, mas personagem sem id de sessão salvo — não foi possível persistir o acesso.");
      return;
    }
    const current = characterRef.current;
    const next = grantSobregravacaoAccess(current, instanceId, characterId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", `Sobregravação: teste bem-sucedido (${resultado} ≥ CD 8) — acesso ao espaço extra concedido e persistido.`);
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
    const next = equipDefensiveItem(current, instanceId, item);
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
  async function handleCastSpell(slug: string) {
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
    // Paramédico › Ritmo de Campo (checkpoint talentos, Fase 7) — "armado" pelo jogador
    // confirmando que esta magia é de cura; -1 PA real (mín. respeitado) no custo já pago.
    let characterAposMagia = result.character;
    const custoPaMagiaPago = result.paBefore - result.paAfter;
    if (ritmoDeCampoAtivo && custoPaMagiaPago > 0) {
      const ritmoStatus = getRitmoDeCampoAvailability(current, talentsIniciais);
      if (ritmoStatus.acquired) {
        const reducaoReal = computeRitmoDeCampoReducao(custoPaMagiaPago, ritmoStatus.reducao, ritmoStatus.minimo);
        if (reducaoReal > 0) {
          characterAposMagia = {
            ...characterAposMagia,
            estado_jogo: { ...characterAposMagia.estado_jogo, pa_gastos: Math.max(0, (characterAposMagia.estado_jogo?.pa_gastos ?? 0) - reducaoReal) },
          };
          addLogEntry("recurso", `Ritmo de Campo: custo de PA desta magia de cura reduzido em ${reducaoReal}.`);
          setRitmoDeCampoAtivo(false);
        }
      }
    }
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
    // Mago de Batalha › Domínio Territorial: alcance/área REAL ajustados entram no
    // log de conjuração de verdade (não só na aba Magias) — checkpoint talentos.
    const rangeAreaMult = getTalentSpellRangeAreaMultiplier(current, talentsIniciais, spell.estatisticas.tipo_magia);
    if (rangeAreaMult !== 1) {
      const alcanceAjustado = spell.estatisticas.alcanceTexto ? applyRangeAreaMultiplierToText(spell.estatisticas.alcanceTexto, rangeAreaMult) : null;
      const areaAjustada = spell.estatisticas.areaTexto ? applyRangeAreaMultiplierToText(spell.estatisticas.areaTexto, rangeAreaMult) : null;
      if (alcanceAjustado?.changed) partes.push(`alcance ${alcanceAjustado.text} (Domínio Territorial, base ${spell.estatisticas.alcanceTexto})`);
      if (areaAjustada?.changed) partes.push(`área ${areaAjustada.text} (Domínio Territorial, base ${spell.estatisticas.areaTexto})`);
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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "spell_cast",
          visibility: "public",
          payload: {
            characterId,
            characterNome: current.nome,
            profileId: selectedProfileId,
            profileNickname: perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null,
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
            profileId: selectedProfileId,
            profileSessionId: profileSessionToken?.profileSessionId ?? null,
            type: "spell_attack_used",
            visibility: "public",
            payload: {
              characterId,
              characterNome: current.nome,
              profileId: selectedProfileId,
              profileNickname: perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null,
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
    // Mago de Batalha › Domínio Territorial — mesmo ajuste real de handleCastSpell,
    // aplicado à magia PRINCIPAL da fusão (a fundida não carrega alcance/área próprios aqui).
    const rangeAreaMultFusao = getTalentSpellRangeAreaMultiplier(current, talentsIniciais, spell.estatisticas.tipo_magia);
    if (rangeAreaMultFusao !== 1) {
      const alcanceAjustado = spell.estatisticas.alcanceTexto ? applyRangeAreaMultiplierToText(spell.estatisticas.alcanceTexto, rangeAreaMultFusao) : null;
      const areaAjustada = spell.estatisticas.areaTexto ? applyRangeAreaMultiplierToText(spell.estatisticas.areaTexto, rangeAreaMultFusao) : null;
      if (alcanceAjustado?.changed) partes.push(`alcance ${alcanceAjustado.text} (Domínio Territorial, base ${spell.estatisticas.alcanceTexto})`);
      if (areaAjustada?.changed) partes.push(`área ${areaAjustada.text} (Domínio Territorial, base ${spell.estatisticas.areaTexto})`);
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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "spell_cast",
          visibility: "public",
          payload: {
            characterId,
            characterNome: current.nome,
            profileId: selectedProfileId,
            profileNickname: perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null,
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
            profileId: selectedProfileId,
            profileSessionId: profileSessionToken?.profileSessionId ?? null,
            type: "spell_attack_used",
            visibility: "public",
            payload: {
              characterId,
              characterNome: current.nome,
              profileId: selectedProfileId,
              profileNickname: perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null,
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
  function handleRollSpellDamage(slug: string, canalizarMana = 0) {
    const spell = spellsIniciais.find((s) => s.slug === slug);
    if (!spell) return;
    const dano = getSpellDamageEffect(spell);
    if (!dano) return;
    const resultado = rollSpellDamage(spell);
    if (resultado == null) return;

    // Canalizar Potencializar (Mago N2): só em magia de ataque, 1/rodada, gasta Mana real → +1 dano/Mana.
    const attack = getSpellAttackProfile(spell);
    const canalizarState = getCanalizarState(characterRef.current, talentsIniciais);
    const manaAtual = characterRef.current.recursos_atuais?.mana ?? 0;
    let mana = Math.max(0, Math.trunc(canalizarMana));
    if (mana > 0) {
      if (!attack.isAttack) { addLogEntry("recurso", "Canalizar Potencializar só se aplica a magias de ataque."); mana = 0; }
      else if (!canalizarState.acquired) { addLogEntry("recurso", "Canalizar não adquirido."); mana = 0; }
      else if (canalizarState.usedThisRound) { addLogEntry("recurso", "Canalizar já foi usado nesta rodada."); mana = 0; }
      else if (mana > manaAtual) { addLogEntry("recurso", `Mana insuficiente para Canalizar (atual ${manaAtual}, pedido ${mana}).`); mana = 0; }
    }

    if (mana > 0) {
      const nowIso = new Date().toISOString();
      let next: Character = { ...characterRef.current, recursos_atuais: { ...characterRef.current.recursos_atuais, mana: manaAtual - mana } };
      next = markCanalizarUsed(next, nowIso);
      characterRef.current = next;
      setCharacter(next);
      addLogEntry(
        "recurso",
        `${spell.nome}: ${resultado} + ${mana} (Canalizar Potencializar, ${mana} Mana gasta) = ${resultado + mana} de dano ${dano.tipo_dano}${dano.subtipo_dano ? ` (${dano.subtipo_dano})` : ""} (${dano.dado ?? `fixo ${dano.valor}`}). Mana ${manaAtual} → ${manaAtual - mana}.`,
      );
      return;
    }
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
    setCharacter((prev) => ({
      ...prev,
      condicoes_ativas: [...(prev.condicoes_ativas ?? []), novaCondicao],
    }));
    addLogEntry("condicao", `Condição aplicada: "${novaCondicao.nome}".`);
    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "condition_applied",
          visibility: "public",
          payload: {
            conditionLocalId: novaCondicao.id,
            conditionId: novaCondicao.conditionId,
            nome: novaCondicao.nome,
            descricao: novaCondicao.descricao,
            origem: novaCondicao.origem,
            duracao: novaCondicao.duracao,
            characterId,
            characterNome: character.nome,
            profileId: selectedProfileId,
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
    setCharacter((prev) => ({
      ...prev,
      condicoes_ativas: (prev.condicoes_ativas ?? []).map((c) =>
        c.id === id ? { ...c, ativa: false, removidaEm } : c,
      ),
    }));
    addLogEntry("condicao", `Condição removida: "${condicao.nome}".`);
    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "condition_removed",
          visibility: "public",
          payload: {
            conditionLocalId: condicao.id,
            conditionId: condicao.conditionId,
            nome: condicao.nome,
            characterId,
            characterNome: character.nome,
            profileId: selectedProfileId,
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
   * (`saveCharacterForProfileSession`/`updateCharacter`) — nenhum
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

  async function persistAutomatedActionExecution(nextCharacter: Character) {
    const isConnected =
      mode === "product"
        ? Boolean(characterId && selectedCampaignId && selectedProfileId && profileSessionToken)
        : Boolean(characterId && selectedCampaignId);
    if (!isConnected) return; // Modo local (sem mesa/personagem salvo) — nada a persistir, sem erro.
    try {
      const toSave = normalizeCharacter(nextCharacter, derivados);
      const record =
        mode === "product"
          ? await saveCharacterForProfileSession(
              selectedCampaignId as string,
              selectedProfileId as string,
              (profileSessionToken as StoredProfileSessionToken).profileSessionId,
              (profileSessionToken as StoredProfileSessionToken).rawSessionToken,
              characterId as string,
              toSave,
            )
          : await updateCharacter(characterId as string, toSave);
      lastSyncedCharacterRef.current = record.payload;
      characterRef.current = record.payload;
      setCharacter(record.payload);
      setSaveState("saved");
    } catch (err) {
      // Mantém a mudança local (já aplicada antes desta chamada) —
      // nunca reverte em silêncio. "Salvar personagem" continua
      // disponível para tentar de novo manualmente.
      setSaveState("error");
      setErrorMessage(
        err instanceof Error
          ? `Ação executada localmente, mas falhou ao salvar automaticamente: ${err.message}`
          : "Ação executada localmente, mas falhou ao salvar automaticamente.",
      );
    }
  }

  async function handleUseAction(actionId: string) {
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
      undefined,
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
    const attackWeaponInstanceId = temEfeitoAtaque ? effectiveSelectedAttackWeaponId : null;
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
      undefined,
      false,
      activeEffects,
    );
    // Espadachim › Estocar (checkpoint talentos, Fase 4) — reduz o custo REAL de PA deste
    // Atacar em 1 (respeitando o mínimo do payload), 1/combate. Exige arma corpo a corpo
    // empunhada (não desarmado) — "lâmina" fica confirmada pelo próprio checkbox marcado
    // pelo jogador, mesmo critério já usado para Aparar/Ripostar (sem dado estruturado de
    // lâmina no catálogo). Combinado num ÚNICO update atômico com o resultado da ação para
    // não arriscar characterRef.current desatualizado entre duas chamadas de setCharacter.
    const estocarStatus = temEfeitoAtaque ? getEstocarAvailability(currentCharacter, talentsIniciais) : { acquired: false, usedThisCombat: false, reducao: 1, minimo: 1 };
    const estocarElegivel =
      temEfeitoAtaque &&
      estocarAtivo &&
      estocarStatus.acquired &&
      !estocarStatus.usedThisCombat &&
      attackWeaponInstanceId != null &&
      attackWeaponModel?.subtipo === "corpo_a_corpo";
    const custoPaPago = result.paBefore - result.paAfter;
    const estocarReducaoReal = estocarElegivel ? Math.max(0, Math.min(estocarStatus.reducao, custoPaPago - estocarStatus.minimo)) : 0;
    // Paramédico › Ritmo de Campo (checkpoint talentos, Fase 7) — "armado" pelo jogador
    // confirmando que esta ação do Console é de cura; combinado no MESMO update atômico.
    const ritmoDeCampoStatus = getRitmoDeCampoAvailability(currentCharacter, talentsIniciais);
    const ritmoDeCampoReducaoReal =
      ritmoDeCampoAtivo && ritmoDeCampoStatus.acquired && custoPaPago > 0
        ? computeRitmoDeCampoReducao(custoPaPago, ritmoDeCampoStatus.reducao, ritmoDeCampoStatus.minimo)
        : 0;
    const reducaoTotal = estocarReducaoReal + ritmoDeCampoReducaoReal;
    let characterAposEstocar: Character =
      reducaoTotal > 0
        ? { ...result.character, estado_jogo: { ...result.character.estado_jogo, pa_gastos: Math.max(0, (result.character.estado_jogo?.pa_gastos ?? 0) - reducaoTotal) } }
        : result.character;
    if (estocarReducaoReal > 0) characterAposEstocar = markEstocarUsed(characterAposEstocar, nowIso);
    if (estocarReducaoReal > 0) {
      addLogEntry("acao_combate", `Estocar: custo de PA deste ataque reduzido em ${estocarReducaoReal} (lâmina confirmada).`);
      setEstocarAtivo(false);
    }
    if (ritmoDeCampoReducaoReal > 0) {
      addLogEntry("acao_combate", `Ritmo de Campo: custo de PA desta ação de cura reduzido em ${ritmoDeCampoReducaoReal}.`);
      setRitmoDeCampoAtivo(false);
    }
    characterRef.current = characterAposEstocar;
    setCharacter(characterAposEstocar);

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
    if (result.removedConditions.length > 0 || result.postureChange || attackLogFields.ammoConsumed) {
      await persistAutomatedActionExecution(characterRef.current);
    }

    const custoResumo = result.defenseWithoutReaction
      ? `defesa sem Reação ${result.defensesWithoutReactionBefore} → ${result.defensesWithoutReactionAfter}; penalidade ${result.reactionPenaltyApplied}`
      : result.paBefore !== result.paAfter
        ? `PA ${result.paBefore} → ${result.paAfter}`
        : result.reactionBefore !== result.reactionAfter
          ? `Reação ${result.reactionBefore} → ${result.reactionAfter}`
          : "sem custo";
    const removidasResumo = result.removedConditions.length > 0 ? ` — removeu ${result.removedConditions.join(", ")}` : "";
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
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "action_used",
          visibility: "public",
          payload: {
            characterId,
            characterNome: currentCharacter.nome,
            profileId: selectedProfileId,
            profileNickname: perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null,
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
      // Toque de Midas (arma) e Mirar (1 Tiro, 1 Acerto) escopam um bônus só a ESTE
      // ataque via tag sintética — vale nos dois ramos abaixo (com ou sem atributo
      // resolvido; armas à distância sem `atributoAtaque` estruturado no catálogo
      // caem no ramo sem atributo, mas o bônus de Mirar TEM que valer do mesmo jeito).
      const mirarMod = getMirarModifier(characterRef.current, talentsIniciais);
      const mirarAplicavel =
        !!mirarMod &&
        mirarMod.alvoTags.includes(attackPreview.skill) &&
        isMirarActive(characterRef.current, characterRef.current.current_round ?? null);
      const extraTags = [
        ...(effectiveSelectedAttackWeaponId ? [`item:${effectiveSelectedAttackWeaponId}`] : []),
        ...(mirarAplicavel ? [MIRAR_TAG] : []),
      ];
      const consumirMirarSeAplicavel = () => {
        if (!mirarAplicavel) return;
        const consumed = consumeMirar(characterRef.current, new Date().toISOString());
        characterRef.current = consumed;
        setCharacter(consumed);
      };

      if (attackPreview.attribute) {
        const weaponName = attackWeaponCandidates.find((c) => c.instanceId === effectiveSelectedAttackWeaponId)?.nome ?? "Ataque desarmado";
        setPreparedRoll({
          atributoId: attackPreview.attribute,
          periciaId: attackPreview.skill,
          origem: `Atacar: ${weaponName}`,
          extraTags,
        });
        consumirMirarSeAplicavel();
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
      consumirMirarSeAplicavel();
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

  const perfilEmFoco = perfis.find((p) => p.id === selectedProfileId) ?? null;
  const perfilStatus = perfilEmFoco ? computeProfileStatus(perfilEmFoco, sessionId, nowTick) : null;

  // Modo product (/ficha, checkpoint v0.24): antes de mostrar qualquer
  // ficha, exige uma sessão de perfil real e válida (ver
  // productSessionState/loadProductSession acima). Cada estado tem uma
  // mensagem de bloqueio própria — nenhum deles renderiza os dados do
  // personagem/mesa por baixo.
  if (mode === "product" && productSessionState !== "valid") {
    const bloqueio: Record<Exclude<ProductSessionState, "valid">, string> = {
      pending: "Carregando…",
      // v0.30: sem token real guardado (nunca entrou por convite nesta
      // aba, ou o token foi limpo) — mesma mensagem de "invalid" abaixo.
      no_params: "Sessão inválida ou expirada. Entre novamente pelo convite.",
      // v0.30: token guardado existe, mas o servidor rejeitou (hash não
      // bate, sessão não está mais 'active', ou perfil foi liberado).
      invalid: "Sessão inválida ou expirada. Entre novamente pelo convite.",
      no_character:
        "Este perfil ainda não tem personagem vinculado. Peça ao narrador para vincular um personagem a este perfil (dashboard da mesa → Personagens da mesa).",
      left: "Você saiu deste perfil. Sessão inválida ou expirada — entre novamente pelo convite.",
    };
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <p data-testid="ficha-bloqueio" style={{ fontSize: 14, opacity: 0.85 }}>
          {bloqueio[productSessionState]}
        </p>
      </main>
    );
  }

  const estocarStatusFicha = getEstocarAvailability(character, talentsIniciais);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
        {mode === "dev"
          ? '/dev/character-sheet — ficha mínima (dev). Edição é local até clicar em "Salvar personagem".'
          : 'Ficha. Edição é local até clicar em "Salvar personagem".'}
      </p>
      {characterId && (
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
      {saveState === "error" && errorMessage && (
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
      {usandoFallback && (
        <p style={{ color: "#f5a623", fontSize: 13, marginBottom: 16 }}>
          ⚠ regras_personagem não veio do banco — usando fórmulas de fallback temporárias.
        </p>
      )}
      {mode === "product" && sessionExpiredWarning && (
        <p data-testid="ficha-sessao-expirada-aviso" style={{ color: "#ffb84f", fontSize: 13, marginBottom: 16 }}>
          ⚠ Sua sessão deste perfil expirou (sem sinal por muito tempo) — outra pessoa pode ter
          assumido este perfil. Suas próximas ações podem não ser salvas como esperado; recarregue a
          página e entre novamente pelo convite se precisar.
        </p>
      )}
      {autoHealBanner && (
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
        hiddenTabs={mode === "product" ? (["personagens", "debug"] as const) : undefined}
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
          onModeChange={setSheetMode}
          onNomeChange={(value) => setCharacter((prev) => ({ ...prev, nome: value }))}
          onSave={handleSave}
          onNew={handleNew}
          mesas={mesas}
          selectedCampaignId={selectedCampaignId}
          onSelectCampaign={handleSelectCampaign}
          perfis={perfis}
          selectedProfileId={selectedProfileId}
          onSelectProfile={setSelectedProfileId}
          onLoadPersonagemAtivo={handleLoadPersonagemAtivo}
          profileWarning={profileWarning}
          personagens={personagens}
          perfilStatus={perfilStatus}
          enteredProfileId={enteredProfile?.id ?? null}
          onEnterProfile={handleEnterProfile}
          onLeaveProfile={handleLeaveProfile}
          pmTotal={character.pm_total ?? 0}
          pmDisponivel={character.pm_disponivel ?? 0}
          historicoEvolucao={character.historico_evolucao ?? []}
          onGainPm={handleGainPm}
          onSpendPm={handleSpendPm}
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
          onApplyLongRest={handleApplyLongRest}
          onMarkNewDayTalents={handleMarkNewDayTalents}
          sobrecargaUsadaDia={character.sobrecarga_usada_dia ?? 0}
          overloadMaxOverride={getTalentOverloadLimitOverride(character, talentsIniciais)}
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

      {activeTab === "talentos" && (
        <TalentsTab
          talents={talentsIniciais}
          catalogError={talentsError}
          sheetMode={sheetMode}
          acquired={character.talentos_adquiridos ?? []}
          usableEffects={getUsableTalentEffects(character, talentsIniciais)}
          contextualOpportunities={getTalentContextualOpportunities(character, talentsIniciais)}
          onAcquire={handleAcquireTalent}
          onRemove={handleRemoveTalent}
          onUseEffect={handleUseTalentEffect}
          onToggleEffect={handleToggleTalentEffect}
          onResetEffect={handleResetTalentUse}
          bricolagemVulnerabilidade={character.bricolagem_vulnerabilidade ?? null}
          onRegisterBricolagem={handleRegisterBricolagem}
          onRollBricolagemTest={handleRollBricolagemTest}
          onEndBricolagem={handleEndBricolagem}
          gambiarraAtiva={character.gambiarra_expressa_ativa ?? null}
          gambiarraAvailable={getGambiarraAvailability(character, talentsIniciais).available}
          onRegisterGambiarra={handleRegisterGambiarra}
          onEndGambiarra={handleEndGambiarra}
          mirarAtivo={character.mirar_ativo ? { resultado: character.mirar_ativo.resultado, bonus: character.mirar_ativo.bonus, consumido: character.mirar_ativo.consumido } : null}
          onConfirmMirar={handleConfirmMirar}
          onEndMirar={handleEndMirar}
          furtividadeAtiva={character.furtividade_ativa ?? null}
          camuflagemOpticaAvailable={hasCamuflagemOptica(character, talentsIniciais)}
          onStartFurtividade={handleStartFurtividade}
          onConfirmCamuflagemOptica={handleConfirmCamuflagemOptica}
          onEndFurtividade={handleEndFurtividade}
          gatilhoQuenteStatus={getGatilhoQuenteAvailability(character, talentsIniciais)}
          totemBencaoTokenStatus={getTotemBencaoTokenAvailability(character, talentsIniciais)}
          bencaoAllies={alliesAtivos.map((a) => ({ id: a.id, nome: a.nome }))}
          onGrantBencaoToken={handleGrantBencaoToken}
          falcaoStatus={getFalcaoAvailability(character, talentsIniciais)}
          onGrantFalcaoToken={handleGrantFalcaoToken}
          briefingDeCampoStatus={getBriefingDeCampoAvailability(character, talentsIniciais)}
          onRegisterBriefing={handleRegisterBriefing}
          imposicaoDeRitmoStatus={getImposicaoDeRitmoAvailability(character, talentsIniciais)}
          onUseImposicaoDeRitmo={handleUseImposicaoDeRitmo}
          entrelinhasStatus={getEntrelinhasAvailability(character, talentsIniciais)}
          onRegisterEntrelinhas={handleRegisterEntrelinhas}
          puxarOsFiosStatus={getPuxarOsFiosAvailability(character, talentsIniciais)}
          entrelinhasAtivo={character.entrelinhas_ativo ?? null}
          onRegisterPuxarOsFios={handleRegisterPuxarOsFios}
          prontoSocorroStatus={getProntoSocorroAvailability(character, talentsIniciais)}
          onProntoSocorro={handleProntoSocorro}
          ritmoDeCampoStatus={getRitmoDeCampoAvailability(character, talentsIniciais)}
          ritmoDeCampoAtivo={ritmoDeCampoAtivo}
          onToggleRitmoDeCampo={setRitmoDeCampoAtivo}
          protocoloDeEmergenciaStatus={getProtocoloDeEmergenciaAvailability(character, talentsIniciais)}
          onProtocoloDeEmergencia={handleProtocoloDeEmergencia}
          ondaSolidariaStatus={{ acquired: hasOndaSolidaria(character, talentsIniciais) }}
          chamaRedobradaStatus={getChamaRedobradaAvailability(character, talentsIniciais)}
          ultimoEfeitoPositivoAliado={ultimoEfeitoPositivoAliado ? { targetCharacterId: ultimoEfeitoPositivoAliado.targetCharacterId, targetNome: ultimoEfeitoPositivoAliado.targetNome } : null}
          onOndaSolidariaExtend={handleOndaSolidariaExtend}
          onChamaRedobrada={handleChamaRedobrada}
          espetaculoMortalStatus={getEspetaculoMortalAvailability(character, talentsIniciais)}
          espetaculoMortalArmasDisponiveis={(character.inventario ?? [])
            .filter((inst) => {
              const modelo = itemsIniciais.find((m) => m.slug === inst.itemSlug);
              return !!modelo?.propertySlugs.includes("arremesso");
            })
            .map((inst) => ({ id: inst.id, nome: inst.itemNome }))}
          onEspetaculoMortal={handleEspetaculoMortal}
          redeDeFavoresAtiva={character.rede_de_favores_ativa}
          redeDeFavoresStatus={getRedeDeFavoresAvailability(character, talentsIniciais)}
          onRegisterRedeDeFavores={handleRegisterRedeDeFavores}
          onEndRedeDeFavores={handleEndRedeDeFavores}
          zeDaEsquinaStatus={getZeDaEsquinaAvailability(character, talentsIniciais)}
          zeDaEsquinaRegistros={character.ze_da_esquina_registros}
          onRegisterZeDaEsquina={handleRegisterZeDaEsquina}
          gatoDeTelhadoAtiva={character.gato_de_telhado_ativo}
          gatoDeTelhadoStatus={getGatoDeTelhadoAvailability(character, talentsIniciais)}
          onRegisterGatoDeTelhado={handleRegisterGatoDeTelhado}
          onEndGatoDeTelhado={handleEndGatoDeTelhado}
          saidaDosFundosAtiva={character.saida_dos_fundos_ativa}
          saidaDosFundosStatus={getSaidaDosFundosAvailability(character, talentsIniciais)}
          onRegisterSaidaDosFundos={handleRegisterSaidaDosFundos}
          onEndSaidaDosFundos={handleEndSaidaDosFundos}
          drones={character.drones}
          sinalLimpoStatus={getSinalLimpoAvailability(character, talentsIniciais)}
          onRegisterDrone={handleRegisterDrone}
          onRemoveDrone={handleRemoveDrone}
          onActivateDrone={handleActivateDrone}
          onDeactivateDrone={handleDeactivateDrone}
          onApplySinalLimpoBonus={handleApplySinalLimpoBonus}
          onSetDroneGatilho={handleSetDroneGatilho}
          onMarkDroneGatilhoOcorrido={handleMarkDroneGatilhoOcorrido}
          enxameStatus={getEnxameAvailability(character, talentsIniciais)}
          onPairEnxame={handlePairEnxame}
          onUnpairEnxame={handleUnpairEnxame}
          robos={character.robos}
          chaveDeArranqueStatus={{ acquired: hasChaveDeArranque(character, talentsIniciais) }}
          onRegisterRobo={handleRegisterRobo}
          onRemoveRobo={handleRemoveRobo}
          onProgramRobo={handleProgramRobo}
          onConsumeRoboPrimeiroTesteBonus={handleConsumeRoboPrimeiroTesteBonus}
          marchaDuplaStatus={getMarchaDuplaAvailability(character, talentsIniciais)}
          onApplyMarchaDupla={handleApplyMarchaDupla}
          overclockStatus={getOverclockAvailability(character, talentsIniciais)}
          onApplyOverclock={handleApplyOverclock}
          trama={character.trama_ativa}
          onIniciarTrama={handleIniciarTrama}
          onEncerrarTrama={handleEncerrarTrama}
          onAdicionarElementoTrama={handleAdicionarElementoTrama}
          onRemoverElementoTrama={handleRemoverElementoTrama}
          onAjustarRamTrama={handleAjustarRamTrama}
          onAjustarDeteccaoTrama={handleAjustarDeteccaoTrama}
          bypassStatus={getBypassAvailability(character, talentsIniciais)}
          onExecutarBypass={handleExecutarBypass}
          agulhaFinaStatus={getAgulhaFinaAvailability(character, talentsIniciais)}
          onExecutarAgulhaFina={handleExecutarAgulhaFina}
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
          toqueDeMidasAvailable={getToqueDeMidasAvailability(character, talentsIniciais).available}
          onApplyToqueDeMidas={handleApplyToqueDeMidas}
          onEndToqueDeMidas={handleEndToqueDeMidas}
          onApplyShieldDamage={handleApplyShieldDamage}
          onRollToolTest={handleRollToolTest}
          runicoGatilhoAvailable={hasGatilhoRunico(character, talentsIniciais)}
          onToggleRuneActive={handleToggleRuneActive}
          entalheRapidoAvailable={hasEntalheRapido(character, talentsIniciais)}
          entalheAttempts={character.entalhe_rapido_tentativas ?? {}}
          onStartEntalheRapido={handleStartEntalheRapido}
          onConfirmEntalheRapido={handleConfirmEntalheRapido}
          sobregravacaoAvailable={hasSobregravacao(character, talentsIniciais)}
          currentCharacterId={characterId}
          onApplySobregravacao={handleApplySobregravacao}
          onSetSobregravacaoAllies={handleSetSobregravacaoAllies}
          sobregravacaoTestPending={sobregravacaoTestPending}
          onStartSobregravacaoTest={handleStartSobregravacaoTest}
          onConfirmSobregravacaoTest={handleConfirmSobregravacaoTest}
          garimpoDeRuaStatus={getGarimpoDeRuaAvailability(character, talentsIniciais)}
          onActivateGarimpoDeRua={handleActivateGarimpoDeRua}
          cadernetaDeDividaStatus={getCadernetaDeDividaAvailability(character, talentsIniciais)}
          onBuyFiado={handleBuyItemFiado}
          dividasMercador={character.dividas_mercador}
          onQuitarDivida={handleQuitarDivida}
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
          spellRangeAreaMultiplier={getTalentSpellRangeAreaMultiplier(character, talentsIniciais, "ataque")}
          canalizar={(() => {
            const st = getCanalizarState(character, talentsIniciais);
            return st.acquired ? { available: !st.usedThisRound, manaAtual: character.recursos_atuais?.mana ?? 0 } : null;
          })()}
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
          onExecute={handleUseAction}
          onRoll={handleRollAction}
          attackWeaponOptions={attackWeaponCandidates.map((c) => ({ instanceId: c.instanceId, nome: c.nome }))}
          selectedAttackWeaponId={effectiveSelectedAttackWeaponId}
          onSelectAttackWeapon={(id) => setSelectedAttackWeaponId(id ?? "__desarmado__")}
          attackPreview={attackPreview}
          estocarAvailable={estocarStatusFicha.acquired && !estocarStatusFicha.usedThisCombat}
          estocarUsedThisCombat={estocarStatusFicha.usedThisCombat}
          estocarAtivo={estocarAtivo}
          onToggleEstocar={setEstocarAtivo}
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
          profileId={selectedProfileId}
          profileNickname={perfis.find((p) => p.id === selectedProfileId)?.nickname ?? null}
          profileSessionId={profileSessionToken?.profileSessionId ?? null}
          activeEffects={activeEffects}
          marginPromotions={getMarginPromotions(character, talentsIniciais)}
          saqueFantasmaAvailable={hasSaqueFantasma(character, talentsIniciais)}
          gatilhoQuenteStatus={getGatilhoQuenteAvailability(character, talentsIniciais)}
          onGatilhoDadoResultado={handleUseGatilhoDado}
          bangBangAvailable={hasBangBangSegundoDisparo(character, talentsIniciais)}
          paDisponivel={Math.max(0, derivados.pa_max - (character.estado_jogo?.pa_gastos ?? 0))}
          onSpendPaBangBang={handleSpendPaBangBang}
          totemBencaoAvailable={hasTotemBencao(character, talentsIniciais)}
          bencaoTokenAtivo={character.bencao_token_ativo ?? null}
          onConsumeBencaoToken={handleConsumeBencaoToken}
          falcaoTokenAtivo={character.falcao_token_ativo ?? null}
          onConsumeFalcaoToken={handleConsumeFalcaoToken}
          briefingCampoAtivo={character.briefing_campo_ativo ?? null}
          onConsumeBriefingCampo={handleConsumeBriefingCampo}
          entrelinhasAtivo={character.entrelinhas_ativo ?? null}
          onConsumeEntrelinhas={handleConsumeEntrelinhas}
          espetaculoMortalAtivo={character.espetaculo_mortal_ativo ?? null}
          onConsumeEspetaculoMortal={handleConsumeEspetaculoMortal}
          showdownStatus={getShowdownAvailability(character, talentsIniciais)}
          onShowdownUsado={handleShowdownUsado}
        />
      )}

      {activeTab === "log" && <LogTab log={log} onClear={() => setLog([])} />}

      {activeTab === "mesa" && (
        <>
          {selectedCampaignId && mesas.find((m) => m.id === selectedCampaignId) && (
            <TurnTrackPanel
              campaign={mesas.find((m) => m.id === selectedCampaignId)!}
              onCampaignChange={(next) => setMesas((prev) => prev.map((m) => (m.id === next.id ? next : m)))}
              isNarrator={false}
              viewerCharacterId={characterId}
            />
          )}
          <MesaTab
            campaignId={selectedCampaignId}
            mesaNome={mesas.find((m) => m.id === selectedCampaignId)?.name ?? null}
            profileId={selectedProfileId}
            profileNickname={perfilEmFoco?.nickname ?? null}
            characterId={characterId}
            characterNome={character.nome}
            profileSessionId={profileSessionToken?.profileSessionId ?? null}
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
    </main>
  );
}
