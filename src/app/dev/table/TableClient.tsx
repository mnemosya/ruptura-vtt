"use client";

/**
 * Página de DEBUG da base mínima de Mesa/Log persistente — não é a
 * interface final do VTT (sem chat real, sem realtime, sem
 * autenticação). Server Actions chamadas diretamente daqui, mesmo
 * padrão de CharacterSheetClient.
 */

import { useEffect, useState } from "react";
import {
  createCampaign,
  listCampaigns,
  addLog,
  listLogs,
  createCampaignProfile,
  listCampaignProfiles,
  setCampaignProfileLocked,
  setCampaignProfileActiveCharacter,
  forceReleaseCampaignProfile,
  createCampaignInvite,
  listCampaignInvites,
  revokeCampaignInvite,
  listProfileSessions,
} from "../../../lib/table/storage";
import {
  TABLE_LOG_VISIBILITIES,
  PROFILE_HEARTBEAT_TIMEOUT_MS,
  type Campaign,
  type CampaignInvite,
  type CampaignProfile,
  type ProfileSession,
  type TableLogEntry,
  type TableLogVisibility,
} from "../../../lib/table";
import { getCharacter, updateCharacter } from "../../../lib/character/storage";
import {
  computeDerivedStats,
  normalizeCharacter,
  applyGmDamage,
  applyGmHealing,
  setGmResourceValue,
  applyGmCondition,
  removeGmCondition,
  type GmResource,
  type CharacterRecord,
  type Character,
  type CharacterRulesPayload,
  type DerivedStats,
} from "../../../lib/character";
import type { NarratorConditionOption } from "./page";

const buttonStyle: React.CSSProperties = {
  background: "#1d1e24",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
};

const VISIBILITY_LABELS: Record<TableLogVisibility, string> = {
  public: "Pública",
  private: "Privada",
  gm: "Mestre (GM)",
};

function formatRolagem(payload: Record<string, unknown>): string {
  if (typeof payload.characterNome === "string") {
    if (payload.atributo) {
      const pericia = payload.pericia ? ` + ${payload.pericia}` : " (sem perícia)";
      return `${payload.characterNome}: ${payload.atributo}${pericia} = ${payload.total}`;
    }
    if (payload.expressao) {
      return `${payload.characterNome}: ${payload.expressao} = ${payload.total}`;
    }
  }
  return JSON.stringify(payload);
}

function formatProfileEvent(payload: Record<string, unknown>): string {
  const nickname = typeof payload.profileNickname === "string" ? payload.profileNickname : "perfil desconhecido";
  if (payload.evento === "enter") return `${nickname}: entrou no perfil`;
  if (payload.evento === "leave") return `${nickname}: saiu do perfil`;
  if (payload.evento === "heartbeat_expirado") return `${nickname}: heartbeat expirado (perfil perdido)`;
  return JSON.stringify(payload);
}

const ENTRY_KIND_LABELS: Record<string, string> = {
  chat: "Mensagem",
  rolagem_pericia: "Rolagem de Perícia",
  rolagem_expressao: "Rolagem de Expressão",
  profile_event: "Evento de Perfil",
};

function entryKindLabel(type: string): string {
  return ENTRY_KIND_LABELS[type] ?? type;
}

function entryIcon(type: string): string {
  if (type === "chat") return "💬";
  if (type === "rolagem_pericia" || type === "rolagem_expressao") return "🎲";
  if (type === "profile_event") return "🔑";
  return "•";
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "nunca";
  return new Date(lastSeenAt).toLocaleString("pt-BR");
}

function isPerfilExpirado(perfil: CampaignProfile, now: number): boolean {
  if (!perfil.is_locked) return false;
  const lastSeenMs = perfil.last_seen_at ? new Date(perfil.last_seen_at).getTime() : 0;
  return now - lastSeenMs > PROFILE_HEARTBEAT_TIMEOUT_MS;
}

const AUTO_REFRESH_INTERVAL_MS = 5000;

const VISIBILITY_FILTERS = ["todos", ...TABLE_LOG_VISIBILITIES] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

const VISIBILITY_FILTER_LABELS: Record<VisibilityFilter, string> = {
  todos: "Todos",
  public: "Pública",
  private: "Privada",
  gm: "Narrador",
};

const MESA_OWNER_FILTERS = ["todas", "minhas", "sem_dono"] as const;
type MesaOwnerFilter = (typeof MESA_OWNER_FILTERS)[number];

const MESA_OWNER_FILTER_LABELS: Record<MesaOwnerFilter, string> = {
  todas: "Todas as mesas dev",
  minhas: "Minhas mesas",
  sem_dono: "Mesas sem dono",
};

interface Props {
  mesasIniciais: Campaign[];
  personagensIniciais: CharacterRecord[];
  /** Email do narrador logado (auth dev, checkpoint v0.13) — null se não logado. Só informativo. */
  currentUserEmail: string | null;
  /** Id do narrador logado (checkpoint v0.16) — usado para comparar com campaigns.owner_id. */
  currentUserId: string | null;
  /** regras_personagem (checkpoint v0.63) — só para computar PV/PE/Mana/Integridade MÁXIMOS na ferramenta de narrador, igual à ficha. */
  regras: CharacterRulesPayload | null;
  /** Condições publicadas na Biblioteca (checkpoint v0.63) — fonte única do select "Aplicar condição"; nunca lista hardcoded aqui. */
  condicoesDisponiveis: NarratorConditionOption[];
}

const GM_RESOURCE_LABELS: Record<GmResource, string> = { pv: "PV", pe: "PE", mana: "Mana", integridade: "Integridade" };
const GM_RESOURCE_MAX_KEY: Record<GmResource, keyof DerivedStats> = {
  pv: "pv_max",
  pe: "pe_max",
  mana: "mana_max",
  integridade: "integridade_max",
};

/** PV/PE/Mana/Integridade MÁXIMOS do personagem — mesma fórmula da ficha (computeDerivedStats), nunca reinventada aqui. */
function gmDerivedMax(payload: Character, regras: CharacterRulesPayload | null, resource: GmResource): number {
  const derivados = computeDerivedStats(payload.atributos, regras, payload.mana_bonus_ruptura ?? 0);
  return derivados[GM_RESOURCE_MAX_KEY[resource]];
}

export default function TableClient({ mesasIniciais, personagensIniciais, currentUserEmail, currentUserId, regras, condicoesDisponiveis }: Props) {
  const [mesas, setMesas] = useState<Campaign[]>(mesasIniciais);
  const [personagens] = useState<CharacterRecord[]>(personagensIniciais);
  const [novaMesaNome, setNovaMesaNome] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [logs, setLogs] = useState<TableLogEntry[]>([]);
  const [mensagemInput, setMensagemInput] = useState("");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [visibilidadeFiltro, setVisibilidadeFiltro] = useState<VisibilityFilter>("todos");
  const [autoAtualizar, setAutoAtualizar] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [perfis, setPerfis] = useState<CampaignProfile[]>([]);
  const [novoPerfilApelido, setNovoPerfilApelido] = useState("");
  const [loadingPerfis, setLoadingPerfis] = useState(false);
  const [mesaOwnerFiltro, setMesaOwnerFiltro] = useState<MesaOwnerFilter>("todas");
  const [sessoes, setSessoes] = useState<ProfileSession[]>([]);
  const [convites, setConvites] = useState<CampaignInvite[]>([]);
  const [novoConviteLabel, setNovoConviteLabel] = useState("");
  const [conviteLinkNovo, setConviteLinkNovo] = useState<string | null>(null);
  const [conviteCopiado, setConviteCopiado] = useState(false);
  // Tick local (5s) só para recalcular "parece expirado" comparando
  // last_seen_at já carregado com Date.now() — não busca nada novo do
  // servidor (ver mesmo padrão em CharacterSheetClient).
  const [nowTick, setNowTick] = useState(() => Date.now());

  // ---------------------------------------------------------------
  // "Estado dos personagens" — ferramenta de narrador (checkpoint
  // v0.63). `personagens` (acima) é a lista global carregada uma vez
  // no mount da página e nunca é uma fonte confiável do estado ATUAL
  // de um personagem específico; por isso os personagens ativos dos
  // perfis são buscados à parte (getCharacter) e mantidos aqui,
  // atualizados após cada ação de narrador com o registro que
  // `updateCharacter` devolve (sem precisar recarregar a lista toda).
  // ---------------------------------------------------------------
  const [personagensAtivos, setPersonagensAtivos] = useState<Record<string, CharacterRecord>>({});
  const [gmErro, setGmErro] = useState<string | null>(null);
  const [gmDanoForm, setGmDanoForm] = useState<Record<string, { recurso: "pv" | "pe"; valor: number; nota: string }>>({});
  const [gmCuraForm, setGmCuraForm] = useState<Record<string, { recurso: "pv" | "pe" | "mana"; valor: number; nota: string }>>({});
  const [gmSetForm, setGmSetForm] = useState<Record<string, { recurso: GmResource; valor: number; nota: string }>>({});
  const [gmCondicaoForm, setGmCondicaoForm] = useState<Record<string, string>>({});

  async function refreshPersonagensAtivos(perfisAtuais: CampaignProfile[]) {
    const ids = Array.from(new Set(perfisAtuais.map((p) => p.active_character_id).filter((id): id is string => !!id)));
    if (ids.length === 0) {
      setPersonagensAtivos({});
      return;
    }
    try {
      const results = await Promise.all(ids.map((id) => getCharacter(id)));
      const proximo: Record<string, CharacterRecord> = {};
      results.forEach((rec) => {
        if (rec) proximo[rec.id] = rec;
      });
      setPersonagensAtivos(proximo);
    } catch {
      // Best-effort — a seção mostra "carregando…" enquanto isso; sem mesa quebrar a página toda.
    }
  }

  useEffect(() => {
    refreshPersonagensAtivos(perfis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfis]);

  /**
   * Salva o personagem mutado (`updateCharacter`, já normalizado) e
   * registra a entrada em `table_logs` — mesmo par save+log usado por
   * qualquer ação de mesa. A ficha do jogador aberta neste personagem
   * recebe a mudança pelo Realtime já existente (checkpoint v0.62);
   * se houver edição local pendente lá, o aviso de "versão mais
   * recente no servidor" aparece exatamente como antes — esta
   * ferramenta não sabe nada sobre isso, só salva o registro canônico.
   */
  async function persistGmMutation(params: { characterId: string; nextCharacter: Character; logPayload: Record<string, unknown> }) {
    if (!selectedCampaignId) return;
    setGmErro(null);
    try {
      const derivados = computeDerivedStats(params.nextCharacter.atributos, regras, params.nextCharacter.mana_bonus_ruptura ?? 0);
      const toSave = normalizeCharacter(params.nextCharacter, derivados);
      const record = await updateCharacter(params.characterId, toSave);
      setPersonagensAtivos((prev) => ({ ...prev, [record.id]: record }));
      await addLog({
        campaignId: selectedCampaignId,
        characterId: params.characterId,
        type: "character_state_change",
        visibility: "public",
        payload: params.logPayload,
      });
    } catch (err) {
      setGmErro(err instanceof Error ? err.message : "Erro desconhecido ao aplicar ação de narrador.");
    }
  }

  async function handleGmDamage(characterId: string) {
    const record = personagensAtivos[characterId];
    const form = gmDanoForm[characterId];
    if (!record || !form || !form.valor) return;
    const nowIso = new Date().toISOString();
    const result = applyGmDamage(record.payload, form.recurso, form.valor, nowIso);
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "damage",
        characterId,
        characterNome: record.name,
        resource: form.recurso,
        amount: form.valor,
        before: result.before,
        after: result.after,
        note: form.nota || undefined,
        source: "dev_table_narrator_tool",
      },
    });
    setGmDanoForm((prev) => ({ ...prev, [characterId]: { ...prev[characterId], valor: 0, nota: "" } }));
  }

  async function handleGmCura(characterId: string) {
    const record = personagensAtivos[characterId];
    const form = gmCuraForm[characterId];
    if (!record || !form || !form.valor) return;
    const nowIso = new Date().toISOString();
    const max = gmDerivedMax(record.payload, regras, form.recurso);
    const result = applyGmHealing(record.payload, form.recurso, form.valor, max, nowIso);
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "healing",
        characterId,
        characterNome: record.name,
        resource: form.recurso,
        amount: form.valor,
        before: result.before,
        after: result.after,
        note: form.nota || undefined,
        source: "dev_table_narrator_tool",
        removidasPorCura: result.removidasPorCura.map((c) => c.nome),
      },
    });
    setGmCuraForm((prev) => ({ ...prev, [characterId]: { ...prev[characterId], valor: 0, nota: "" } }));
  }

  async function handleGmSetResource(characterId: string) {
    const record = personagensAtivos[characterId];
    const form = gmSetForm[characterId];
    if (!record || !form) return;
    const max = gmDerivedMax(record.payload, regras, form.recurso);
    const result = setGmResourceValue(record.payload, form.recurso, form.valor, max);
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "set_resource",
        characterId,
        characterNome: record.name,
        resource: form.recurso,
        before: result.before,
        after: result.after,
        note: form.nota || undefined,
        source: "dev_table_narrator_tool",
      },
    });
  }

  async function handleGmApplyCondition(characterId: string) {
    const record = personagensAtivos[characterId];
    const slug = gmCondicaoForm[characterId];
    const condicao = condicoesDisponiveis.find((c) => c.slug === slug);
    if (!record || !condicao) return;
    const nowIso = new Date().toISOString();
    const result = applyGmCondition(record.payload, condicao, nowIso);
    if (result.jaAtiva) {
      setGmErro(`"${condicao.nome}" já está ativa em ${record.name}.`);
      return;
    }
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "apply_condition",
        characterId,
        characterNome: record.name,
        conditionId: condicao.slug,
        conditionName: condicao.nome,
        source: "dev_table_narrator_tool",
      },
    });
  }

  async function handleGmRemoveCondition(characterId: string, conditionInstanceId: string) {
    const record = personagensAtivos[characterId];
    if (!record) return;
    const nowIso = new Date().toISOString();
    const result = removeGmCondition(record.payload, conditionInstanceId, nowIso);
    if (!result.condicao) return;
    await persistGmMutation({
      characterId,
      nextCharacter: result.character,
      logPayload: {
        action: "remove_condition",
        characterId,
        characterNome: record.name,
        conditionId: result.condicao.conditionId,
        conditionName: result.condicao.nome,
        source: "dev_table_narrator_tool",
      },
    });
  }

  async function refreshMesas() {
    try {
      setMesas(await listCampaigns());
    } catch {
      // Falha ao atualizar a lista não deve esconder o resultado da ação atual.
    }
  }

  async function handleCreateMesa() {
    setErrorMessage(null);
    try {
      const mesa = await createCampaign(novaMesaNome);
      setNovaMesaNome("");
      await refreshMesas();
      await handleSelectMesa(mesa.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar mesa.");
    }
  }

  async function handleSelectMesa(id: string) {
    setSelectedCampaignId(id);
    setErrorMessage(null);
    setLoadingLogs(true);
    try {
      setLogs(await listLogs(id));
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar logs.");
    } finally {
      setLoadingLogs(false);
    }
    await handleRefreshPerfis(id);
    await handleRefreshConvites(id);
    setConviteLinkNovo(null);
  }

  async function handleRefreshConvites(campaignId: string) {
    try {
      setConvites(await listCampaignInvites(campaignId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar convites.");
    }
  }

  async function handleCreateConvite() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    setConviteCopiado(false);
    try {
      const { rawToken } = await createCampaignInvite(selectedCampaignId, novoConviteLabel);
      setNovoConviteLabel("");
      const link = `${window.location.origin}/join/${rawToken}`;
      setConviteLinkNovo(link);
      await handleRefreshConvites(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar convite.");
    }
  }

  async function handleRevokeConvite(inviteId: string) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await revokeCampaignInvite(inviteId);
      await handleRefreshConvites(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao revogar convite.");
    }
  }

  async function handleCopyConviteLink() {
    if (!conviteLinkNovo) return;
    try {
      await navigator.clipboard.writeText(conviteLinkNovo);
      setConviteCopiado(true);
    } catch {
      // Clipboard pode falhar sem gesto do usuário; o link fica visível para cópia manual.
    }
  }

  async function handleRefreshPerfis(campaignId: string) {
    setLoadingPerfis(true);
    try {
      setPerfis(await listCampaignProfiles(campaignId));
      setSessoes(await listProfileSessions(campaignId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar perfis.");
    } finally {
      setLoadingPerfis(false);
    }
  }

  /** Sessão ativa de um perfil (ou null) — derivada da lista carregada. */
  function activeSessionOf(profileId: string): ProfileSession | null {
    return sessoes.find((s) => s.profile_id === profileId && s.status === "active") ?? null;
  }

  async function handleCreatePerfil() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await createCampaignProfile(selectedCampaignId, novoPerfilApelido);
      setNovoPerfilApelido("");
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar perfil.");
    }
  }

  async function handleToggleLockPerfil(profile: CampaignProfile) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await setCampaignProfileLocked(profile.id, !profile.is_locked);
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao bloquear/desbloquear perfil.");
    }
  }

  async function handleSetPersonagemAtivo(profileId: string, characterId: string | null) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await setCampaignProfileActiveCharacter(profileId, characterId);
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao vincular personagem ativo.");
    }
  }

  /** Botão "Liberar perfil" — ação de "narrador", libera incondicionalmente (ver forceReleaseCampaignProfile). */
  async function handleForceReleasePerfil(profileId: string) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await forceReleaseCampaignProfile(profileId);
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao liberar perfil.");
    }
  }

  async function handleAddLog() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await addLog({
        campaignId: selectedCampaignId,
        type: "chat",
        visibility: visibilidade,
        payload: { mensagem: mensagemInput.trim() || "(mensagem vazia)" },
      });
      setMensagemInput("");
      setLogs(await listLogs(selectedCampaignId));
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao registrar log.");
    }
  }

  async function handleRefreshLogs() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    setLoadingLogs(true);
    try {
      setLogs(await listLogs(selectedCampaignId));
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao atualizar logs.");
    } finally {
      setLoadingLogs(false);
    }
  }

  // Autoatualização: re-busca os logs da mesa selecionada a cada
  // AUTO_REFRESH_INTERVAL_MS, sem mexer no filtro de visibilidade (estado
  // separado, não tocado aqui) e sem indicador de "Carregando…" (evita
  // piscar a lista a cada 5s). setLogs substitui a lista inteira a partir
  // do servidor — não há append, então não há risco de duplicar entradas.
  useEffect(() => {
    if (!autoAtualizar || !selectedCampaignId) return;

    const intervalId = setInterval(async () => {
      try {
        const proximosLogs = await listLogs(selectedCampaignId);
        setLogs(proximosLogs);
        setUltimaAtualizacao(new Date());
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido na autoatualização.");
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [autoAtualizar, selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, [selectedCampaignId]);

  const mesaAtual = mesas.find((m) => m.id === selectedCampaignId);
  const logsFiltrados =
    visibilidadeFiltro === "todos" ? logs : logs.filter((entry) => entry.visibility === visibilidadeFiltro);
  const mesasFiltradas = mesas.filter((mesa) => {
    if (mesaOwnerFiltro === "minhas") return currentUserId != null && mesa.owner_id === currentUserId;
    if (mesaOwnerFiltro === "sem_dono") return mesa.owner_id == null;
    return true;
  });

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 12 }}>
        /dev/table — base mínima de Mesa/Log persistente. Sem chat real, sem realtime, sem
        autenticação. Visibilidade ("Pública"/"Privada"/"Mestre") é só um campo de dados nesta
        etapa — não há filtro de RLS por enquanto (ver migration 0003).
      </p>

      {currentUserEmail ? (
        <p
          data-testid="auth-banner-logado"
          style={{ fontSize: 12, marginBottom: 16, padding: "8px 12px", background: "#15301a", border: "1px solid #2a5a35", borderRadius: 6 }}
        >
          Narrador logado: <strong>{currentUserEmail}</strong> ·{" "}
          <a href="/dev/auth/status" style={{ color: "#5ec8ff" }}>status</a>. RLS ainda em modo de
          transição — as policies dev-anon continuam abertas, então isto não é segurança real
          ainda (ver checkpoint v0.14/v0.16).
        </p>
      ) : (
        <p
          data-testid="auth-banner-deslogado"
          style={{ fontSize: 12, marginBottom: 16, padding: "8px 12px", background: "#2a2a15", border: "1px solid #5a5a2a", borderRadius: 6 }}
        >
          Nenhum narrador logado (modo dev anon). A RLS ainda é aberta — login não é obrigatório
          nesta etapa. <a href="/dev/login" style={{ color: "#5ec8ff" }}>Entrar</a>
        </p>
      )}

      {errorMessage && (
        <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {errorMessage}</p>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
          Criar mesa
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            data-testid="nova-mesa-nome"
            type="text"
            value={novaMesaNome}
            onChange={(e) => setNovaMesaNome(e.target.value)}
            placeholder="Nome da mesa"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button data-testid="criar-mesa-button" onClick={handleCreateMesa} style={buttonStyle}>
            Criar mesa
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6 }}>
            Mesas ({mesasFiltradas.length}/{mesas.length})
          </h2>
          <select
            data-testid="mesa-owner-filtro-select"
            value={mesaOwnerFiltro}
            onChange={(e) => setMesaOwnerFiltro(e.target.value as MesaOwnerFilter)}
            style={inputStyle}
          >
            {MESA_OWNER_FILTERS.map((f) => (
              <option key={f} value={f}>
                {MESA_OWNER_FILTER_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        {!currentUserId && mesaOwnerFiltro === "minhas" && (
          <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
            Sem login, "Minhas mesas" não tem como identificar você — a lista fica vazia. Entre em{" "}
            <a href="/dev/login" style={{ color: "#5ec8ff" }}>/dev/login</a>.
          </p>
        )}
        {mesas.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhuma mesa criada ainda.</p>}
        {mesas.length > 0 && mesasFiltradas.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhuma mesa com esse filtro.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mesasFiltradas.map((mesa) => {
            const isMinha = currentUserId != null && mesa.owner_id === currentUserId;
            const semDono = mesa.owner_id == null;
            const ownerLabel = isMinha ? "Sua mesa" : semDono ? "Sem dono (mesa dev legada)" : "De outro narrador";
            const ownerColor = isMinha ? "#7fd99a" : semDono ? "#ffb84f" : "#888";

            return (
              <div
                key={mesa.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: mesa.id === selectedCampaignId ? "#26283280" : "#1d1e24",
                  borderRadius: 8,
                  padding: "10px 14px",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {mesa.name}{" "}
                    <span data-testid={`mesa-owner-badge-${mesa.id}`} style={{ fontSize: 11, fontWeight: 400, color: ownerColor }}>
                      · {ownerLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>{mesa.id}</div>
                </div>
                <button data-testid={`selecionar-mesa-${mesa.id}`} onClick={() => handleSelectMesa(mesa.id)} style={buttonStyle}>
                  {mesa.id === selectedCampaignId ? "Selecionada" : "Selecionar"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {selectedCampaignId && (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Perfis da mesa ({perfis.length}) — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Perfil DEV: apelido + bloqueio manual ou via heartbeat (polling client-side, sem
              Supabase Realtime). Sem login, sem link de convite real — "sessão" é só um id no
              localStorage de quem entrou pela ficha, sem prova de identidade (ver migrations 0004
              e 0005).
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                data-testid="novo-perfil-apelido"
                type="text"
                value={novoPerfilApelido}
                onChange={(e) => setNovoPerfilApelido(e.target.value)}
                placeholder="Apelido do perfil"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button data-testid="criar-perfil-button" onClick={handleCreatePerfil} style={buttonStyle}>
                Criar perfil
              </button>
            </div>
            {loadingPerfis && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
            {!loadingPerfis && perfis.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum perfil criado ainda nesta mesa.</p>
            )}
            <div data-testid="perfis-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {perfis.map((perfil) => {
                const personagemAtivo = personagens.find((p) => p.id === perfil.active_character_id);
                const expirado = isPerfilExpirado(perfil, nowTick);

                return (
                  <div
                    key={perfil.id}
                    data-testid="perfil-entry"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      background: "#1d1e24",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <span data-testid="perfil-apelido" style={{ fontWeight: 600 }}>
                          {perfil.nickname}
                        </span>
                        <span
                          data-testid="perfil-status"
                          style={{ marginLeft: 10, fontSize: 11, opacity: 0.7, color: perfil.is_locked ? "#ffb84f" : "#7fd99a" }}
                        >
                          {perfil.is_locked ? "Bloqueado" : "Livre"}
                        </span>
                      </div>
                      <button data-testid={`bloquear-perfil-${perfil.id}`} onClick={() => handleToggleLockPerfil(perfil)} style={buttonStyle}>
                        {perfil.is_locked ? "Desbloquear" : "Bloquear"}
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span data-testid="perfil-personagem-ativo" style={{ fontSize: 11, opacity: 0.7 }}>
                        Personagem ativo: {personagemAtivo ? personagemAtivo.name : "nenhum"}
                      </span>
                      <select
                        data-testid={`perfil-personagem-select-${perfil.id}`}
                        value={perfil.active_character_id ?? ""}
                        onChange={(e) => handleSetPersonagemAtivo(perfil.id, e.target.value || null)}
                        style={inputStyle}
                      >
                        <option value="">— selecionar personagem —</option>
                        {personagens.map((personagem) => (
                          <option key={personagem.id} value={personagem.id}>
                            {personagem.name}
                            {personagem.campaign_id == null ? " (sem mesa — legado/dev)" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        data-testid={`limpar-personagem-ativo-${perfil.id}`}
                        onClick={() => handleSetPersonagemAtivo(perfil.id, null)}
                        style={buttonStyle}
                        disabled={!perfil.active_character_id}
                      >
                        Limpar personagem
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span data-testid={`perfil-last-seen-${perfil.id}`} style={{ fontSize: 11, opacity: 0.7 }}>
                        Último sinal: {formatLastSeen(perfil.last_seen_at)}
                      </span>
                      {expirado && (
                        <span
                          data-testid={`perfil-expirado-${perfil.id}`}
                          style={{ fontSize: 11, color: "#ff6b6b", fontWeight: 700 }}
                        >
                          Parece expirado
                        </span>
                      )}
                      <button
                        data-testid={`liberar-perfil-${perfil.id}`}
                        onClick={() => handleForceReleasePerfil(perfil.id)}
                        style={buttonStyle}
                        disabled={!perfil.is_locked}
                      >
                        Liberar perfil
                      </button>
                    </div>
                    {(() => {
                      const sess = activeSessionOf(perfil.id);
                      return (
                        <div data-testid={`perfil-sessao-${perfil.id}`} style={{ fontSize: 11, opacity: 0.7 }}>
                          Sessão: {sess
                            ? `ativa · último sinal ${formatLastSeen(sess.last_seen_at)}${sess.invite_id ? " · via convite" : ""}`
                            : "nenhuma sessão ativa"}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ marginBottom: 32 }} data-testid="estado-personagens-secao">
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Estado dos personagens — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Dano/cura/ajuste de recurso e condições aplicados aqui salvam direto em <code>characters</code> e
              registram em <code>table_logs</code> (<code>type: "character_state_change"</code>). A ficha do
              jogador aberta neste personagem recebe a mudança pelo Realtime já existente — sem reload manual.
              Sem cálculo de MIT/PD/região corporal ainda: dano é redução direta do recurso escolhido.
            </p>
            {gmErro && <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 12 }}>{gmErro}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {perfis.map((perfil) => {
                if (!perfil.active_character_id) {
                  return (
                    <div
                      key={perfil.id}
                      data-testid={`estado-personagem-sem-ativo-${perfil.id}`}
                      style={{ background: "#1d1e24", borderRadius: 8, padding: "8px 14px", fontSize: 12, opacity: 0.55 }}
                    >
                      {perfil.nickname}: sem personagem ativo vinculado.
                    </div>
                  );
                }
                const characterId = perfil.active_character_id;
                const record = personagensAtivos[characterId];
                if (!record) {
                  return (
                    <div key={perfil.id} style={{ background: "#1d1e24", borderRadius: 8, padding: "8px 14px", fontSize: 12, opacity: 0.6 }}>
                      {perfil.nickname}: carregando personagem…
                    </div>
                  );
                }
                const payload = record.payload;
                const recursos = payload.recursos_atuais ?? {};
                const condicoesAtivas = (payload.condicoes_ativas ?? []).filter((c) => c.ativa);
                const danoForm = gmDanoForm[characterId] ?? { recurso: "pv" as const, valor: 0, nota: "" };
                const curaForm = gmCuraForm[characterId] ?? { recurso: "pv" as const, valor: 0, nota: "" };
                const setForm = gmSetForm[characterId] ?? { recurso: "pv" as GmResource, valor: recursos.pv ?? 0, nota: "" };
                const condicaoSelecionada = gmCondicaoForm[characterId] ?? "";

                return (
                  <div
                    key={perfil.id}
                    data-testid={`estado-personagem-${characterId}`}
                    style={{ background: "#1d1e24", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <strong>{perfil.nickname}</strong>
                      <span style={{ opacity: 0.7 }}>→ {record.name}</span>
                    </div>

                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                      {(["pv", "pe", "mana", "integridade"] as const).map((r) => (
                        <span key={r} data-testid={`estado-recurso-${characterId}-${r}`}>
                          {GM_RESOURCE_LABELS[r]}: {recursos[r] ?? 0} / {gmDerivedMax(payload, regras, r)}
                        </span>
                      ))}
                    </div>

                    <div style={{ fontSize: 12 }}>
                      <span style={{ opacity: 0.6 }}>Condições ativas: </span>
                      {condicoesAtivas.length === 0 ? (
                        <span style={{ opacity: 0.5 }}>nenhuma</span>
                      ) : (
                        <div data-testid={`estado-condicoes-${characterId}`} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                          {condicoesAtivas.map((c) => (
                            <span
                              key={c.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0f1014", borderRadius: 4, padding: "2px 8px" }}
                            >
                              {c.nome}
                              <button
                                data-testid={`estado-remover-condicao-${characterId}-${c.id}`}
                                onClick={() => handleGmRemoveCondition(characterId, c.id)}
                                style={{ ...buttonStyle, padding: "1px 6px", fontSize: 11 }}
                              >
                                Remover
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Aplicar dano */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`estado-dano-recurso-${characterId}`}
                        value={danoForm.recurso}
                        onChange={(e) => setGmDanoForm((prev) => ({ ...prev, [characterId]: { ...danoForm, recurso: e.target.value as "pv" | "pe" } }))}
                        style={inputStyle}
                      >
                        <option value="pv">PV</option>
                        <option value="pe">PE</option>
                      </select>
                      <input
                        data-testid={`estado-dano-valor-${characterId}`}
                        type="number"
                        min={0}
                        value={danoForm.valor}
                        onChange={(e) => setGmDanoForm((prev) => ({ ...prev, [characterId]: { ...danoForm, valor: Math.max(0, Number(e.target.value)) } }))}
                        style={{ ...inputStyle, width: 70 }}
                      />
                      <input
                        data-testid={`estado-dano-nota-${characterId}`}
                        type="text"
                        placeholder="Nota (opcional)"
                        value={danoForm.nota}
                        onChange={(e) => setGmDanoForm((prev) => ({ ...prev, [characterId]: { ...danoForm, nota: e.target.value } }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <button data-testid={`estado-aplicar-dano-${characterId}`} onClick={() => handleGmDamage(characterId)} style={buttonStyle}>
                        Aplicar dano
                      </button>
                    </div>

                    {/* Aplicar cura */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`estado-cura-recurso-${characterId}`}
                        value={curaForm.recurso}
                        onChange={(e) => setGmCuraForm((prev) => ({ ...prev, [characterId]: { ...curaForm, recurso: e.target.value as "pv" | "pe" | "mana" } }))}
                        style={inputStyle}
                      >
                        <option value="pv">PV</option>
                        <option value="pe">PE</option>
                        <option value="mana">Mana</option>
                      </select>
                      <input
                        data-testid={`estado-cura-valor-${characterId}`}
                        type="number"
                        min={0}
                        value={curaForm.valor}
                        onChange={(e) => setGmCuraForm((prev) => ({ ...prev, [characterId]: { ...curaForm, valor: Math.max(0, Number(e.target.value)) } }))}
                        style={{ ...inputStyle, width: 70 }}
                      />
                      <input
                        data-testid={`estado-cura-nota-${characterId}`}
                        type="text"
                        placeholder="Nota (opcional)"
                        value={curaForm.nota}
                        onChange={(e) => setGmCuraForm((prev) => ({ ...prev, [characterId]: { ...curaForm, nota: e.target.value } }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <button data-testid={`estado-aplicar-cura-${characterId}`} onClick={() => handleGmCura(characterId)} style={buttonStyle}>
                        Aplicar cura
                      </button>
                    </div>

                    {/* Ajuste direto de recurso (override manual) */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`estado-set-recurso-${characterId}`}
                        value={setForm.recurso}
                        onChange={(e) => setGmSetForm((prev) => ({ ...prev, [characterId]: { ...setForm, recurso: e.target.value as GmResource } }))}
                        style={inputStyle}
                      >
                        <option value="pv">PV</option>
                        <option value="pe">PE</option>
                        <option value="mana">Mana</option>
                        <option value="integridade">Integridade</option>
                      </select>
                      <input
                        data-testid={`estado-set-valor-${characterId}`}
                        type="number"
                        min={0}
                        value={setForm.valor}
                        onChange={(e) => setGmSetForm((prev) => ({ ...prev, [characterId]: { ...setForm, valor: Number(e.target.value) } }))}
                        style={{ ...inputStyle, width: 70 }}
                      />
                      <input
                        data-testid={`estado-set-nota-${characterId}`}
                        type="text"
                        placeholder="Nota (opcional)"
                        value={setForm.nota}
                        onChange={(e) => setGmSetForm((prev) => ({ ...prev, [characterId]: { ...setForm, nota: e.target.value } }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <button data-testid={`estado-definir-valor-${characterId}`} onClick={() => handleGmSetResource(characterId)} style={buttonStyle}>
                        Definir valor
                      </button>
                      <span style={{ fontSize: 10, opacity: 0.5 }}>override manual — ignora regra de dano/cura</span>
                    </div>

                    {/* Aplicar condição */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`estado-condicao-select-${characterId}`}
                        value={condicaoSelecionada}
                        onChange={(e) => setGmCondicaoForm((prev) => ({ ...prev, [characterId]: e.target.value }))}
                        style={inputStyle}
                        disabled={condicoesDisponiveis.length === 0}
                      >
                        <option value="">— escolher condição —</option>
                        {condicoesDisponiveis.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                      <button
                        data-testid={`estado-aplicar-condicao-${characterId}`}
                        onClick={() => handleGmApplyCondition(characterId)}
                        disabled={!condicaoSelecionada}
                        style={{ ...buttonStyle, opacity: condicaoSelecionada ? 1 : 0.5 }}
                      >
                        Aplicar condição
                      </button>
                      {condicoesDisponiveis.length === 0 && (
                        <span style={{ fontSize: 11, opacity: 0.5 }}>Biblioteca de condições indisponível.</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {perfis.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhum perfil nesta mesa ainda.</p>}
            </div>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Convites ({convites.length}) — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Convite real com token revogável → gera <code>/join/&lt;token&gt;</code>. O banco guarda só
              o hash do token; o link bruto aparece uma única vez, ao criar.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <input
                data-testid="novo-convite-label"
                type="text"
                value={novoConviteLabel}
                onChange={(e) => setNovoConviteLabel(e.target.value)}
                placeholder="Rótulo do convite (opcional)"
                style={{ ...inputStyle, flex: 1, minWidth: 180 }}
              />
              <button data-testid="criar-convite-button" onClick={handleCreateConvite} style={buttonStyle}>
                Criar convite
              </button>
            </div>

            {conviteLinkNovo && (
              <div
                data-testid="convite-link-novo"
                style={{ background: "#15301a", border: "1px solid #2a5a35", borderRadius: 8, padding: 12, marginBottom: 12 }}
              >
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
                  Link do convite (mostrado só agora — copie antes de sair):
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <code style={{ fontSize: 12, wordBreak: "break-all", flex: 1 }}>{conviteLinkNovo}</code>
                  <button data-testid="copiar-convite-button" onClick={handleCopyConviteLink} style={buttonStyle}>
                    {conviteCopiado ? "Copiado ✓" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            {convites.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum convite criado ainda.</p>}
            <div data-testid="convites-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {convites.map((convite) => {
                const expirado = convite.expires_at != null && new Date(convite.expires_at).getTime() < nowTick;
                const revogado = convite.revoked_at != null || !convite.is_active;
                const estado = revogado ? "Revogado" : expirado ? "Expirado" : "Ativo";
                const estadoCor = revogado ? "#ff6b6b" : expirado ? "#ffb84f" : "#7fd99a";

                return (
                  <div
                    key={convite.id}
                    data-testid="convite-entry"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      background: "#1d1e24",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{convite.label ?? "(sem rótulo)"}</span>
                      <span data-testid="convite-estado" style={{ marginLeft: 10, fontSize: 11, color: estadoCor }}>
                        {estado}
                      </span>
                      <div style={{ fontSize: 11, opacity: 0.5 }}>
                        criado {new Date(convite.created_at).toLocaleString("pt-BR")}
                        {convite.expires_at ? ` · expira ${new Date(convite.expires_at).toLocaleString("pt-BR")}` : ""}
                      </div>
                    </div>
                    <button
                      data-testid={`revogar-convite-${convite.id}`}
                      onClick={() => handleRevokeConvite(convite.id)}
                      disabled={revogado}
                      style={{ ...buttonStyle, opacity: revogado ? 0.5 : 1 }}
                    >
                      Revogar
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Enviar mensagem — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                data-testid="mensagem-teste-input"
                type="text"
                value={mensagemInput}
                onChange={(e) => setMensagemInput(e.target.value)}
                placeholder="Mensagem"
                style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              />
              <select
                data-testid="mensagem-visibilidade-select"
                value={visibilidade}
                onChange={(e) => setVisibilidade(e.target.value as TableLogVisibility)}
                style={inputStyle}
              >
                {TABLE_LOG_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </select>
              <button data-testid="adicionar-log-button" onClick={handleAddLog} style={buttonStyle}>
                Enviar
              </button>
            </div>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6 }}>
                Log da mesa ({logsFiltrados.length}/{logs.length})
              </h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  data-testid="filtro-visibilidade-select"
                  value={visibilidadeFiltro}
                  onChange={(e) => setVisibilidadeFiltro(e.target.value as VisibilityFilter)}
                  style={inputStyle}
                >
                  {VISIBILITY_FILTERS.map((v) => (
                    <option key={v} value={v}>
                      {VISIBILITY_FILTER_LABELS[v]}
                    </option>
                  ))}
                </select>
                <button data-testid="atualizar-logs-button" onClick={handleRefreshLogs} style={buttonStyle}>
                  Atualizar logs
                </button>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    data-testid="auto-atualizar-toggle"
                    type="checkbox"
                    checked={autoAtualizar}
                    onChange={(e) => setAutoAtualizar(e.target.checked)}
                  />
                  Autoatualizar
                </label>
              </div>
            </div>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
              Console dev/diagnóstico: mostra TODOS os logs (public/private/gm), sem filtro real de
              visibilidade — o filtro abaixo é só visual. A visibilidade real (v0.20) é aplicada nas
              rotas de jogador (aba Mesa da ficha via listLogsForViewer), não aqui.
            </p>
            <p data-testid="auto-atualizar-status" style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              {autoAtualizar ? "Autoatualização ligada" : "Autoatualização desligada"}
              {ultimaAtualizacao && ` — Última atualização: ${ultimaAtualizacao.toLocaleTimeString("pt-BR")}`}
            </p>
            {loadingLogs && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
            {!loadingLogs && logs.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log ainda nesta mesa.</p>
            )}
            {!loadingLogs && logs.length > 0 && logsFiltrados.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log com essa visibilidade.</p>
            )}
            <div data-testid="logs-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logsFiltrados.map((entry) => {
                const isChat = entry.type === "chat";
                const isRolagem = entry.type === "rolagem_pericia" || entry.type === "rolagem_expressao";
                const isProfileEvent = entry.type === "profile_event";
                // Chat aceita `text` (ficha, checkpoint v0.12) ou `mensagem` (formato antigo desta tela).
                const chatTexto =
                  typeof entry.payload.text === "string"
                    ? entry.payload.text
                    : typeof entry.payload.mensagem === "string"
                      ? entry.payload.mensagem
                      : null;
                const conteudo = isChat && chatTexto != null
                  ? chatTexto
                  : isRolagem
                    ? formatRolagem(entry.payload)
                    : isProfileEvent
                      ? formatProfileEvent(entry.payload)
                      : JSON.stringify(entry.payload);
                const corBorda = isChat ? "#4f8cff" : isProfileEvent ? "#ff6b9f" : "#ffb84f";

                return (
                  <div
                    key={entry.id}
                    data-testid="log-entry"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      background: "#1d1e24",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      borderLeft: `3px solid ${corBorda}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.6 }}>
                      <span aria-hidden="true">{entryIcon(entry.type)}</span>
                      <span data-testid="log-entry-type">{entryKindLabel(entry.type)}</span>
                      <span data-testid="log-entry-visibility">[{VISIBILITY_LABELS[entry.visibility]}]</span>
                      <span style={{ marginLeft: "auto", fontFamily: "monospace" }}>
                        {new Date(entry.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <span data-testid="log-entry-mensagem">{conteudo}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
