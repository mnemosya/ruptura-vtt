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
  applyStunFromFailedWillTest,
  OVERLOAD_WILL_TEST_CD,
  MAX_OVERLOAD_SURGES_PER_DAY,
  detectCollapseOnResourceChange,
  advanceCollapseSegment,
  stabilizeCollapse,
  MAX_COLLAPSE_SEGMENTS,
  gainPm,
  spendPm,
  logPermanentAdjustment,
  buildActionConsoleItems,
  executeActionOnCharacter,
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
  acquireTalentLevel,
  removeTalentLevel,
  purchaseItem,
  setItemLoadoutState,
  removeItemFromInventory,
  castSpell,
  rollSpellDamage,
  getSpellDamageEffect,
  learnSpell,
  forgetSpell,
  isSpellLearned,
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
} from "../../../lib/character";
import { rollPericia, type PreparedRoll } from "../../../lib/dice";
import {
  listCampaignProfiles,
  enterCampaignProfile,
  heartbeatCampaignProfile,
  leaveCampaignProfile,
  addLog,
} from "../../../lib/table/storage";
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
import { ActionsTab } from "./components/ActionsTab";
import { ActiveStateStrip } from "./components/ActiveStateStrip";
import { MesaTab } from "./components/MesaTab";
import { SavedCharactersTab } from "./components/SavedCharactersTab";
import { DebugTab } from "./components/DebugTab";
import type { SheetMode } from "./components/ModeToggle";
import { buttonStyle } from "./components/styles";

const LOG_MAX = 50;
const ACTION_DOUBLE_CLICK_GUARD_MS = 500;

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
  initialCampaignId,
  initialProfileId,
  mode,
}: Props) {
  const [character, setCharacter] = useState<Character>(() => createInitialCharacter(regras));
  const characterRef = useRef(character);
  characterRef.current = character;
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
      setCharacter(normalizeCharacter(result.character.payload));
      setCharacterId(result.character.id);
      setProductSessionState("valid");
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

  // Efeitos ativos derivados das condições (checkpoint v0.33, agora
  // data-driven via payload_automacao — checkpoint v0.51) — função
  // pura, recalculada só quando condicoes_ativas ou o catálogo mudam.
  // Fonte única compartilhada entre ConditionsTab (lista) e RollsTab (chips).
  const activeEffects = useMemo(
    () => {
      const conditionEffects = deriveActiveEffectsFromConditions(character, conditionContents);
      const talentEffects = deriveActiveEffectsFromTalents(character, talentsIniciais);
      const reactionEffect = deriveReactionDefenseEffect(character, reactionRules);
      const base = [...conditionEffects, ...talentEffects];
      return reactionEffect ? [...base, reactionEffect] : base;
    },
    [character, conditionContents, reactionRules, talentsIniciais],
  );

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
      ),
    [
      character,
      combatActionsIniciais,
      condicoesParaAcoes,
      derivados.pa_max,
      derivados.reacoes_por_rodada,
      regras,
      reactionRules,
    ],
  );

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
      setCharacter(normalizeCharacter(record.payload));
      setCharacterId(record.id);
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
   */
  async function refetchCharacterFromRealtime() {
    if (!characterId) return;
    try {
      const record = await getCharacter(characterId);
      if (!record) return;
      const next = normalizeCharacter(record.payload);
      characterRef.current = next;
      setCharacter(next);
    } catch {
      // Best-effort — Realtime é só conveniência; reload manual continua funcionando.
    }
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
      return;
    }
    try {
      setPerfis(await listCampaignProfiles(id));
    } catch (err) {
      setPerfis([]);
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar perfis da mesa.");
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

    setCharacter({ ...result.character, condicoes_ativas: proximasCondicoes });
    addLogEntry(
      "descanso",
      `Descanso longo — PV ${result.before.pv} → ${result.after.pv}, PE ${result.before.pe} → ${result.after.pe}, Mana ${result.before.mana} → ${result.after.mana}.`,
    );
    await persistRest("rest_long", result);
    if (removidas.length > 0) void handleAutoHealRemovals(removidas, result.before.pv, result.after.pv);
  }

  /** Botão "Usar surto" (checkpoint v0.37, PRD 10.5) — 1d4 de dano psíquico, 3º surto marca Ruptura pendente + exige Vontade CD 7. */
  async function handleUseOverloadSurge(tipo: string) {
    const nowIso = new Date().toISOString();
    const sobrecargaAntes = character.sobrecarga_usada_dia ?? 0;
    const result = useOverloadSurge(character, tipo, nowIso);

    if (!result.surge) {
      addLogEntry("recurso", result.warnings[0] ?? "Limite de surtos de Sobrecarga atingido.");
      return;
    }

    setCharacter(result.character);
    addLogEntry(
      "recurso",
      `Surto de Sobrecarga (${tipo}) — ${result.surge.indice}/${MAX_OVERLOAD_SURGES_PER_DAY}, dano psíquico ${result.surge.danoPsiquico} (1d4, não aplicado automaticamente).`,
    );
    if (result.requiresWillRoll) {
      addLogEntry("condicao", "Ruptura pendente (3º surto) — role Vontade CD 7.");
      setOverloadWillRollPending(true);
    }

    if (selectedCampaignId) {
      try {
        await addLog({
          campaignId: selectedCampaignId,
          characterId: characterId ?? undefined,
          profileId: selectedProfileId,
          profileSessionId: profileSessionToken?.profileSessionId ?? null,
          type: "overload_surge",
          visibility: "public",
          payload: {
            characterId,
            characterNome: character.nome,
            profileId: selectedProfileId,
            profileSessionId: profileSessionToken?.profileSessionId ?? null,
            tipo,
            indice: result.surge.indice,
            danoPsiquico: result.surge.danoPsiquico,
            sobrecargaAntes,
            sobrecargaDepois: result.surge.indice,
            rupturaPendente: result.rupturePending,
            requiresWillRoll: result.requiresWillRoll,
            source: "character_sheet",
          },
        });
      } catch {
        // Best-effort — mesma justificativa de handleAddCondition.
      }
    }
  }

  /** Rolagem de Vontade CD 7 exigida pelo 3º surto do dia — falha aplica Atordoado via sistema de condições. */
  async function handleRollOverloadWillTest() {
    const periciaDef = regras?.pericias.find((p) => p.id === "vontade");
    const atributoId = (periciaDef?.atributo_primario as "corpo" | "mente" | "animo" | undefined) ?? "animo";
    const atributoDef = regras?.atributos.find((a) => a.id === atributoId);

    const resultado = rollPericia({
      atributoId,
      atributoNome: atributoDef?.nome ?? atributoId,
      atributoValor: character.atributos[atributoId],
      periciaId: "vontade",
      periciaNome: periciaDef?.nome ?? "Vontade",
      periciaValor: character.pericias["vontade"] ?? 0,
      modificador: 0,
      cd: OVERLOAD_WILL_TEST_CD,
    });
    const sucesso = resultado.sucesso ?? false;

    addLogEntry(
      "recurso",
      `Teste de Vontade CD ${OVERLOAD_WILL_TEST_CD} (Sobrecarga): total ${resultado.total} — ${sucesso ? "Sucesso" : "Falha"}.`,
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
            cd: OVERLOAD_WILL_TEST_CD,
            sucesso,
            source: "character_sheet",
          },
        });
      } catch {
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
      // Best-effort — mesma justificativa de handleAddCondition.
    }
  }

  /**
   * Aplica os efeitos colaterais de uma mudança de PV/PE em conjunto —
   * remoção automática por cura (v0.34, só PV) e detecção de Colapso
   * (v0.38, PV e PE) — sobre um `Character` base, devolvendo o
   * `Character` final e o que aconteceu, para o chamador decidir
   * log/persistência. Não faz nenhum `setCharacter` sozinho.
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
    return { character: colapso.character, removidasPorCura: removidas, colapso };
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
      const { character: charComEfeitos, removidasPorCura, colapso } = applyPvPeSideEffects(
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
      if (colapso.started) {
        addLogEntry("recurso", `Colapso iniciado (${colapso.tipo === "pv" ? "PV" : "PE"} a 0) — Inconsciente aplicado.`);
        void persistCollapseEvent("collapse_started", { tipo: colapso.tipo });
      }
      if (colapso.ended) {
        addLogEntry("recurso", `Colapso encerrado por cura — cicatriz pendente.`);
        void persistCollapseEvent("collapse_ended", { tipo: colapso.tipo, motivo: "cura" });
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

    const resolved = resolveEndRoundConditionsForCharacter({
      character: current,
      conditions: conditionContents,
      round,
      scene,
      nowIso,
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
    nextCharacter = { ...paReduction.character, current_round: round + 1 };

    characterRef.current = nextCharacter;
    setCharacter(nextCharacter);

    const allLogs = [...resolved.logs, ...paReduction.logs];
    setEndRoundSummary({ logs: allLogs, warnings: resolved.warnings });
    addLogEntry(
      "rodada",
      `Rodada ${round} encerrada → rodada ${round + 1} iniciada.${allLogs.length > 0 ? " " + allLogs.join(" ") : ""}`,
    );

    const allTableLogs = [...resolved.tableLogs, ...paReduction.tableLogs];
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
    const current = characterRef.current;
    const next = acquireTalentLevel(current, { talentoId, nivelId, nivel, nowIso: new Date().toISOString() });
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    const talent = talentsIniciais.find((t) => t.id === talentoId);
    const nivelNome = talent?.niveis.find((n) => n.id === nivelId)?.nome ?? nivelId;
    addLogEntry("condicao", `Talento adquirido: ${talent?.nome ?? talentoId} — ${nivelNome}.`);
  }

  function handleRemoveTalent(acquiredId: string) {
    const current = characterRef.current;
    const next = removeTalentLevel(current, acquiredId);
    if (next === current) return;
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("condicao", "Nível de talento removido.");
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
    const result = purchaseItem({ character: current, item, quantidade, walletId, precoUnitario, nowIso: new Date().toISOString() });
    if (!result.ok) {
      addLogEntry("recurso", result.reason ?? "Compra não realizada.");
      return;
    }
    characterRef.current = result.character;
    setCharacter(result.character);
    addLogEntry("recurso", `Comprado: ${item.nome} x${quantidade} — ${result.totalCost} (${result.walletBefore} → ${result.walletAfter}).`);
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

  function handleRemoveItem(instanceId: string) {
    const current = characterRef.current;
    const next = removeItemFromInventory(current, instanceId);
    characterRef.current = next;
    setCharacter(next);
    addLogEntry("recurso", "Item removido do inventário.");
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
    addLogEntry("condicao", `Magia aprendida: ${spell?.nome ?? slug}.`);
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
   * Conjurar magia (aba Magias, checkpoint v0.50) — desconta PA/Mana
   * (`castSpell`, `lib/character/spells.ts`); registra o resumo no log
   * local (PRD 11.4 "resumo delas aparece no log/chat"). Sem PA/Mana
   * suficiente, não muda nada e só avisa. Exige que a magia já tenha
   * sido aprendida (checkpoint v0.50.1) — nunca conjura o que o
   * personagem não aprendeu, mesmo que a vertente seja conhecida.
   */
  function handleCastSpell(slug: string) {
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
    characterRef.current = result.character;
    setCharacter(result.character);
    const manaTexto = result.manaCostUnknown
      ? "custo de Mana ainda não definido (placeholder)"
      : `Mana ${result.manaBefore} → ${result.manaAfter}`;
    addLogEntry("recurso", `Conjurado: ${spell.nome} — PA ${result.paBefore} → ${result.paAfter}; ${manaTexto}.`);
  }

  /** "Rolar dano" (aba Magias, checkpoint v0.50) — atalho de rolagem para magias com efeito de dano. */
  function handleRollSpellDamage(slug: string) {
    const spell = spellsIniciais.find((s) => s.slug === slug);
    if (!spell) return;
    const dano = getSpellDamageEffect(spell);
    if (!dano) return;
    const resultado = rollSpellDamage(spell);
    if (resultado == null) return;
    addLogEntry("recurso", `${spell.nome}: ${resultado} de dano ${dano.tipo_dano}${dano.subtipo_dano ? ` (${dano.subtipo_dano})` : ""} (${dano.dado}).`);
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
    );
    const item = currentItems.find((candidate) => candidate.id === actionId);
    if (!actionContent || !item || !item.enabled) {
      actionExecutionLockRef.current = false;
      setExecutingActionId(null);
      return;
    }

    const nowIso = new Date().toISOString();
    const result = executeActionOnCharacter(
      currentCharacter,
      actionContent,
      derivados.pa_max,
      derivados.reacoes_por_rodada,
      nowIso,
      reactionRules,
    );
    characterRef.current = result.character;
    setCharacter(result.character);

    const custoResumo = result.defenseWithoutReaction
      ? `defesa sem Reação ${result.defensesWithoutReactionBefore} → ${result.defensesWithoutReactionAfter}; penalidade ${result.reactionPenaltyApplied}`
      : result.paBefore !== result.paAfter
        ? `PA ${result.paBefore} → ${result.paAfter}`
        : result.reactionBefore !== result.reactionAfter
          ? `Reação ${result.reactionBefore} → ${result.reactionAfter}`
          : "sem custo";
    const removidasResumo = result.removedConditions.length > 0 ? ` — removeu ${result.removedConditions.join(", ")}` : "";
    const pendenciasResumo =
      result.pendingEffects.length > 0 ? " Uso registrado; efeitos pendentes exigem resolução manual." : "";
    addLogEntry("acao_combate", `${item.nome}: ${custoResumo}${removidasResumo}.${pendenciasResumo}`);

    try {
      if (selectedCampaignId) {
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
            actionId: actionContent.id,
            actionName: actionContent.nome,
            category: actionContent.categoria,
            actionType: actionContent.tipo,
            cost: { label: item.custoLabel, pa: item.custoPA, reacao: item.custoReacao },
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
    if (!item?.rollSkillId) return;
    handleRollPericia(item.rollSkillId);
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

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
        {mode === "dev"
          ? '/dev/character-sheet — ficha mínima (dev). Edição é local até clicar em "Salvar personagem".'
          : 'Ficha. Edição é local até clicar em "Salvar personagem".'}
      </p>
      {characterId && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span data-testid="ficha-sync-status" style={{ fontSize: 11, color: describeRealtimeStatus(characterSyncStatus, "ficha").cor }}>
            ● {describeRealtimeStatus(characterSyncStatus, "ficha").texto}
          </span>
          <button data-testid="ficha-recarregar" onClick={refetchCharacterFromRealtime} style={{ ...buttonStyle, padding: "3px 10px", fontSize: 11 }}>
            Recarregar ficha
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
        condicoesDisponiveis={condicoesDisponiveis}
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
          sobrecargaUsadaDia={character.sobrecarga_usada_dia ?? 0}
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
          onResolveCheck={handleResolveConditionCheck}
          onAdd={handleAddCondition}
          onRemove={handleRemoveCondition}
        />
      )}

      {activeTab === "talentos" && (
        <TalentsTab
          talents={talentsIniciais}
          catalogError={talentsError}
          acquired={character.talentos_adquiridos ?? []}
          onAcquire={handleAcquireTalent}
          onRemove={handleRemoveTalent}
        />
      )}

      {activeTab === "inventario" && (
        <InventoryTab
          items={itemsIniciais}
          catalogError={itemsError}
          carteira={character.carteira ?? { aretz_informal: 0, cdi: 0, cdi_craqueada: 0 }}
          inventario={character.inventario ?? []}
          onBuy={handleBuyItem}
          onChangeCarteira={handleChangeCarteira}
          onSetEstado={handleSetItemEstado}
          onRemoveItem={handleRemoveItem}
        />
      )}

      {activeTab === "magias" && (
        <SpellsTab
          spells={spellsIniciais}
          catalogError={spellsError}
          magiasAprendidas={character.magias_aprendidas ?? []}
          sheetMode={sheetMode}
          onLearn={handleLearnSpell}
          onForget={handleForgetSpell}
          onCast={handleCastSpell}
          onRollDamage={handleRollSpellDamage}
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
        />
      )}

      {activeTab === "log" && <LogTab log={log} onClear={() => setLog([])} />}

      {activeTab === "mesa" && (
        <MesaTab
          campaignId={selectedCampaignId}
          mesaNome={mesas.find((m) => m.id === selectedCampaignId)?.name ?? null}
          profileId={selectedProfileId}
          profileNickname={perfilEmFoco?.nickname ?? null}
          characterId={characterId}
          characterNome={character.nome}
          profileSessionId={profileSessionToken?.profileSessionId ?? null}
        />
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
