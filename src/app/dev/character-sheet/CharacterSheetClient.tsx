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
import { createInitialCharacter, computeDerivedStats, normalizeCharacter } from "../../../lib/character";
import { createCharacter, updateCharacter, getCharacter, listCharacters, deleteCharacter } from "../../../lib/character/storage";
import type {
  Character,
  CharacterAttributes,
  CharacterGameState,
  CharacterRecord,
  CharacterResources,
  CharacterRulesPayload,
} from "../../../lib/character";
import type { PreparedRoll } from "../../../lib/dice";
import {
  listCampaignProfiles,
  enterCampaignProfile,
  heartbeatCampaignProfile,
  leaveCampaignProfile,
  addLog,
} from "../../../lib/table/storage";
import { PROFILE_HEARTBEAT_INTERVAL_MS } from "../../../lib/table";
import type { Campaign, CampaignProfile } from "../../../lib/table";
import { getOrCreateBrowserSessionId } from "../../../lib/table/browserSession";
import { computeProfileStatus } from "../../../lib/table/profileStatus";
import { CharacterSheetTabs, type TabId } from "./components/CharacterSheetTabs";
import { GeneralTab } from "./components/GeneralTab";
import { AttributesTab } from "./components/AttributesTab";
import { SkillsTab } from "./components/SkillsTab";
import { ResourcesTab } from "./components/ResourcesTab";
import { RollsTab } from "./components/RollsTab";
import { LogTab, type LogEntry, type LogTipo } from "./components/LogTab";
import { MesaTab } from "./components/MesaTab";
import { SavedCharactersTab } from "./components/SavedCharactersTab";
import { DebugTab } from "./components/DebugTab";
import type { SheetMode } from "./components/ModeToggle";

const LOG_MAX = 50;

const RECURSO_LABELS: Record<keyof CharacterResources, string> = {
  pv: "PV",
  pe: "PE",
  mana: "Mana",
  integridade: "Integridade",
};

interface Props {
  regras: CharacterRulesPayload | null;
  usandoFallback: boolean;
  personagensIniciais: CharacterRecord[];
  mesasIniciais: Campaign[];
  /**
   * Mesa/perfil pré-selecionados via query string (`?campaignId=...&
   * profileId=...`) — vindos de `/dev/join/[campaignId]` (checkpoint
   * v0.10). `null` quando a ficha é aberta diretamente, sem link.
   */
  initialCampaignId: string | null;
  initialProfileId: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

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
  initialCampaignId,
  initialProfileId,
}: Props) {
  const [character, setCharacter] = useState<Character>(() => createInitialCharacter(regras));
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
  const [mesas] = useState<Campaign[]>(mesasIniciais);
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
  // Tick local (atualizado a cada 5s) só para forçar recalcular o
  // status "Expirado" exibido na UI, comparando last_seen_at com o
  // relógio do navegador — não busca nada novo do servidor.
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Log local mínimo (não persiste no Supabase) — alimentado por rolagens
  // (via callback passado a RollsTab) e pelos handlers de recurso/PA/
  // reação abaixo. Limitado às últimas 50 entradas.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logCounterRef = useRef(0);

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
  // sessionId (handleSelectCampaign não precisa dele).
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (didPrefillRef.current || !initialCampaignId) return;
    didPrefillRef.current = true;
    handleSelectCampaign(initialCampaignId).then(() => {
      if (initialProfileId) setSelectedProfileId(initialProfileId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCampaignId, initialProfileId]);

  // Retomar heartbeat após vir de /dev/join: se o perfil pré-selecionado
  // já está bloqueado por ESTA MESMA sessão (porque a entrada já
  // aconteceu na tela de join, via enterCampaignProfile), assume
  // enteredProfile aqui para o useEffect de heartbeat (mais abaixo)
  // retomar o envio de last_seen_at — sem chamar enterCampaignProfile
  // de novo. resumedHeartbeatRef garante que isso só roda uma vez,
  // mesmo que `perfis` mude depois por outros motivos.
  const resumedHeartbeatRef = useRef(false);
  useEffect(() => {
    if (resumedHeartbeatRef.current || !sessionId || !initialProfileId) return;
    const perfil = perfis.find((p) => p.id === initialProfileId);
    if (!perfil) return; // perfis desta mesa ainda não carregou
    resumedHeartbeatRef.current = true;
    if (perfil.lock_session_id === sessionId) {
      setEnteredProfile({ id: perfil.id, nickname: perfil.nickname });
    }
  }, [perfis, sessionId, initialProfileId]);

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
        type: "profile_event",
        visibility: "gm",
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
      const updated = await enterCampaignProfile(selectedProfileId, sessionId);
      setPerfis((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEnteredProfile({ id: updated.id, nickname: updated.nickname });
      addLogEntry("perfil", `Entrou no perfil "${updated.nickname}".`);
      await persistProfileEvent(selectedCampaignId, { id: updated.id, nickname: updated.nickname }, "enter");
    } catch (err) {
      setProfileWarning(err instanceof Error ? err.message : "Erro desconhecido ao entrar no perfil.");
    }
  }

  /** Botão "Sair do perfil" — só libera se esta sessão ainda for a dona (ver leaveCampaignProfile). */
  async function handleLeaveProfile() {
    if (!enteredProfile || !sessionId) return;
    setProfileWarning(null);
    const profileSaindo = enteredProfile;
    try {
      const updated = await leaveCampaignProfile(profileSaindo.id, sessionId);
      setPerfis((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      addLogEntry("perfil", `Saiu do perfil "${updated.nickname}".`);
      await persistProfileEvent(selectedCampaignId, profileSaindo, "leave");
    } catch (err) {
      setProfileWarning(err instanceof Error ? err.message : "Erro desconhecido ao sair do perfil.");
    } finally {
      setEnteredProfile(null);
    }
  }

  // Heartbeat: enquanto esta sessão estiver "dentro" de um perfil,
  // renova last_seen_at a cada PROFILE_HEARTBEAT_INTERVAL_MS. Se o
  // heartbeat for rejeitado (outra sessão assumiu o perfil após
  // expirar, ou o perfil foi liberado manualmente em /dev/table), a
  // sessão perde o perfil automaticamente e registra o evento.
  useEffect(() => {
    if (!enteredProfile || !sessionId) return;
    const profileAtual = enteredProfile;

    const intervalId = setInterval(async () => {
      try {
        const updated = await heartbeatCampaignProfile(profileAtual.id, sessionId);
        setPerfis((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } catch {
        addLogEntry("perfil", `Heartbeat expirado — perfil "${profileAtual.nickname}" foi perdido por esta aba.`);
        setEnteredProfile(null);
        await persistProfileEvent(selectedCampaignId, profileAtual, "heartbeat_expirado");
      }
    }, PROFILE_HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enteredProfile, sessionId]);

  const derivados = useMemo(
    () => computeDerivedStats(character.atributos, regras),
    [character.atributos, regras],
  );

  async function refreshList() {
    try {
      setPersonagens(await listCharacters());
    } catch {
      // Falha ao atualizar a lista não deve esconder o resultado do save/load.
    }
  }

  async function handleSave() {
    setSaveState("saving");
    setErrorMessage(null);
    try {
      // normalizeCharacter garante metadados.schema_version e preenche
      // recursos_atuais ausentes com os _max calculados aqui na UI
      // (derivados) — storage.ts só carimba atualizado_em por cima.
      const toSave = normalizeCharacter(character, derivados);
      const record = characterId
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
   * Botão "Carregar personagem ativo" — busca o personagem vinculado
   * (active_character_id) ao perfil selecionado e carrega na ficha,
   * reusando handleLoad (mesmo fluxo de "Personagens salvos"). Se o
   * perfil não tiver personagem ativo, mostra aviso discreto em vez de
   * tentar carregar.
   */
  async function handleLoadPersonagemAtivo() {
    setProfileWarning(null);
    const perfil = perfis.find((p) => p.id === selectedProfileId);
    if (!perfil) return;
    if (!perfil.active_character_id) {
      setProfileWarning(`O perfil "${perfil.nickname}" ainda não tem personagem ativo vinculado (ver /dev/table).`);
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

  function updateAtributo(id: keyof CharacterAttributes, rawValue: number) {
    // Defesa em profundidade: o input já vem `disabled` em Modo Jogo
    // (não dispara onChange), mas o handler também recusa por garantia.
    if (sheetMode === "jogo") return;
    const def = regras?.atributos.find((a) => a.id === id);
    const min = def?.valor_minimo ?? 1;
    const max = def?.valor_maximo ?? 5;
    setCharacter((prev) => ({
      ...prev,
      atributos: { ...prev.atributos, [id]: clamp(rawValue, min, max) },
    }));
  }

  function updatePericia(id: string, rawValue: number) {
    if (sheetMode === "jogo") return;
    const def = regras?.pericias.find((p) => p.id === id);
    const min = def?.valor_minimo ?? 0;
    const max = def?.valor_maximo ?? 5;
    setCharacter((prev) => ({
      ...prev,
      pericias: { ...prev.pericias, [id]: clamp(rawValue, min, max) },
    }));
  }

  /**
   * Edição manual de recursos atuais (PV/PE/Mana/Integridade). Aceita
   * só inteiro >= 0; não trava no máximo de propósito — combate/dano
   * fica para depois, aqui é só edição livre com aviso visual.
   */
  function updateRecursoAtual(id: keyof CharacterResources, rawValue: number) {
    const anterior = character.recursos_atuais?.[id] ?? 0;
    const novo = parseRecursoAtual(rawValue);
    setCharacter((prev) => ({
      ...prev,
      recursos_atuais: { ...prev.recursos_atuais, [id]: novo },
    }));
    if (novo !== anterior) {
      addLogEntry("recurso", `${RECURSO_LABELS[id]}: ${anterior} → ${novo}`);
    }
  }

  function handleRestoreRecursosMax() {
    setCharacter((prev) => ({
      ...prev,
      recursos_atuais: {
        pv: derivados.pv_max,
        pe: derivados.pe_max,
        mana: derivados.mana_max,
        integridade: derivados.integridade_max,
      },
    }));
    addLogEntry(
      "recurso",
      `Restaurados ao máximo — PV ${derivados.pv_max}, PE ${derivados.pe_max}, Mana ${derivados.mana_max}, Integridade ${derivados.integridade_max}`,
    );
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

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
        /dev/character-sheet — ficha mínima. Edição é local até clicar em "Salvar personagem".
      </p>
      {usandoFallback && (
        <p style={{ color: "#f5a623", fontSize: 13, marginBottom: 16 }}>
          ⚠ regras_personagem não veio do banco — usando fórmulas de fallback temporárias.
        </p>
      )}

      <CharacterSheetTabs activeTab={activeTab} personagensCount={personagens.length} onChange={setActiveTab} />

      {activeTab === "geral" && (
        <GeneralTab
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
          onGastarPA={() => adjustEstadoJogo("pa_gastos", 1)}
          onDesfazerPA={() => adjustEstadoJogo("pa_gastos", -1)}
          onResetarPA={() => resetEstadoJogo("pa_gastos")}
          onUsarReacao={() => adjustEstadoJogo("reacoes_usadas", 1)}
          onDesfazerReacao={() => adjustEstadoJogo("reacoes_usadas", -1)}
          onResetarReacoes={() => resetEstadoJogo("reacoes_usadas")}
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
        />
      )}

      {activeTab === "personagens" && (
        <SavedCharactersTab
          personagens={personagens}
          characterId={characterId}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      )}

      {activeTab === "debug" && (
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
