"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createCampaignProfile,
  listCampaignProfiles,
  setCampaignProfileActiveCharacter,
  forceReleaseCampaignProfile,
  createCampaignInvite,
  listCampaignInvites,
  revokeCampaignInvite,
  listProfileSessions,
  listLogsForViewer,
  addLog,
  expireStaleProfileSessions,
} from "../../../lib/table/storage";
import { computeProfileStatus } from "../../../lib/table/profileStatus";
import {
  listCharacters,
  listCharactersForCampaign,
  assignCharacterToCampaign,
  assignCharacterToProfile,
  createCharacter,
  renameCharacter,
  archiveCharacter,
  restoreCharacter,
  duplicateCharacter,
} from "../../../lib/character/storage";
import { createInitialCharacter } from "../../../lib/character";
import type { Campaign, CampaignProfile, CampaignInvite, ProfileSession, TableLogEntry } from "../../../lib/table";
import type { CharacterRecord } from "../../../lib/character";

const btn: React.CSSProperties = { background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" };
const input: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "6px 8px", fontSize: 13 };
const h2: React.CSSProperties = { fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 };
const card: React.CSSProperties = { background: "#1d1e24", borderRadius: 8, padding: "10px 14px", fontSize: 13 };

interface Props {
  campaign: Campaign;
  perfisIniciais: CampaignProfile[];
  convitesIniciais: CampaignInvite[];
  sessoesIniciais: ProfileSession[];
  logsIniciais: TableLogEntry[];
  /** Personagens já ligados a esta mesa (campaign_id === campaign.id, checkpoint v0.23). */
  personagensDaMesaIniciais: CharacterRecord[];
  /** Personagens "legados" (sem mesa) disponíveis para vincular a esta mesa. */
  personagensDisponiveisIniciais: CharacterRecord[];
}

export default function MesaDetailClient({
  campaign,
  perfisIniciais,
  convitesIniciais,
  sessoesIniciais,
  logsIniciais,
  personagensDaMesaIniciais,
  personagensDisponiveisIniciais,
}: Props) {
  const [perfis, setPerfis] = useState(perfisIniciais);
  const [convites, setConvites] = useState(convitesIniciais);
  const [sessoes, setSessoes] = useState(sessoesIniciais);
  const [logs, setLogs] = useState(logsIniciais);
  const [personagensDaMesa, setPersonagensDaMesa] = useState(personagensDaMesaIniciais);
  const [personagensDisponiveis, setPersonagensDisponiveis] = useState(personagensDisponiveisIniciais);
  const [personagemParaVincular, setPersonagemParaVincular] = useState("");
  const [novoPersonagemNome, setNovoPersonagemNome] = useState("");
  const [novoPerfil, setNovoPerfil] = useState("");
  const [conviteLabel, setConviteLabel] = useState("");
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function fail(err: unknown, msg: string) {
    setError(err instanceof Error ? err.message : msg);
  }

  async function reloadPerfis() {
    try {
      setPerfis(await listCampaignProfiles(campaign.id));
      setSessoes(await listProfileSessions(campaign.id));
    } catch (e) { fail(e, "Erro ao recarregar perfis."); }
  }
  async function reloadConvites() {
    try { setConvites(await listCampaignInvites(campaign.id)); } catch (e) { fail(e, "Erro ao recarregar convites."); }
  }
  async function reloadLogs() {
    try { setLogs(await listLogsForViewer(campaign.id, {})); } catch (e) { fail(e, "Erro ao recarregar log."); }
  }
  async function reloadPersonagens() {
    try {
      setPersonagensDaMesa(await listCharactersForCampaign(campaign.id));
      const todos = await listCharacters();
      setPersonagensDisponiveis(todos.filter((c) => c.campaign_id == null));
    } catch (e) { fail(e, "Erro ao recarregar personagens."); }
  }

  /**
   * Log de ciclo de vida de personagem (checkpoint v0.25) — melhor
   * esforço, nunca bloqueia a ação principal. Visibilidade "gm": são
   * eventos operacionais de mesa/narrador, não mensagens de jogador.
   */
  async function logCharacterEvent(
    type: "character_created" | "character_assigned" | "character_archived" | "character_restored",
    characterId: string,
    characterNome: string,
    extra: Record<string, unknown> = {},
  ) {
    try {
      await addLog({
        campaignId: campaign.id,
        characterId,
        type,
        visibility: "gm",
        payload: { characterId, characterNome, ...extra },
      });
    } catch {
      // best-effort — não bloqueia a ação já concluída no banco.
    }
  }

  async function vincularPersonagemAMesa() {
    if (!personagemParaVincular) return;
    setError(null);
    try {
      const record = await assignCharacterToCampaign(personagemParaVincular, campaign.id);
      setPersonagemParaVincular("");
      await logCharacterEvent("character_assigned", record.id, record.name, { destino: "mesa" });
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao vincular personagem à mesa."); }
  }
  async function desvincularPersonagemDaMesa(characterId: string) {
    setError(null);
    try {
      await assignCharacterToCampaign(characterId, null);
      await reloadPersonagens();
      await reloadPerfis(); // um perfil pode ter esse personagem como ativo
    } catch (e) { fail(e, "Erro ao desvincular personagem da mesa."); }
  }
  async function vincularPersonagemAPerfil(characterId: string, profileId: string | null) {
    setError(null);
    try {
      const record = await assignCharacterToProfile(characterId, profileId);
      if (profileId) await logCharacterEvent("character_assigned", record.id, record.name, { destino: "perfil", profileId });
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao vincular personagem ao perfil."); }
  }

  /** Cria um personagem mínimo já nascendo vinculado a esta mesa (checkpoint v0.25). */
  async function criarPersonagemNaMesa() {
    if (!novoPersonagemNome.trim()) return;
    setError(null);
    try {
      const record = await createCharacter(createInitialCharacter(null, novoPersonagemNome.trim()), {
        campaignId: campaign.id,
      });
      setNovoPersonagemNome("");
      await logCharacterEvent("character_created", record.id, record.name);
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao criar personagem."); }
  }

  async function renomearPersonagem(characterId: string, nomeAtual: string) {
    const novoNome = window.prompt("Novo nome do personagem:", nomeAtual);
    if (novoNome == null || !novoNome.trim() || novoNome.trim() === nomeAtual) return;
    setError(null);
    try {
      await renameCharacter(characterId, novoNome.trim());
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao renomear personagem."); }
  }

  async function arquivarPersonagem(characterId: string, characterNome: string) {
    setError(null);
    try {
      await archiveCharacter(characterId);
      await logCharacterEvent("character_archived", characterId, characterNome);
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao arquivar personagem."); }
  }

  async function restaurarPersonagem(characterId: string, characterNome: string) {
    setError(null);
    try {
      await restoreCharacter(characterId);
      await logCharacterEvent("character_restored", characterId, characterNome);
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao restaurar personagem."); }
  }

  async function duplicarPersonagem(characterId: string) {
    setError(null);
    try {
      const record = await duplicateCharacter(characterId);
      await logCharacterEvent("character_created", record.id, record.name, { duplicadoDe: characterId });
      await reloadPersonagens();
    } catch (e) { fail(e, "Erro ao duplicar personagem."); }
  }

  async function criarPerfil() {
    if (!novoPerfil.trim()) return;
    setError(null);
    try { await createCampaignProfile(campaign.id, novoPerfil); setNovoPerfil(""); await reloadPerfis(); }
    catch (e) { fail(e, "Erro ao criar perfil."); }
  }
  async function vincular(profileId: string, characterId: string | null) {
    setError(null);
    try { await setCampaignProfileActiveCharacter(profileId, characterId); await reloadPerfis(); }
    catch (e) { fail(e, "Erro ao vincular personagem."); }
  }
  async function liberar(profileId: string) {
    setError(null);
    try { await forceReleaseCampaignProfile(profileId); await reloadPerfis(); }
    catch (e) { fail(e, "Erro ao liberar perfil."); }
  }
  /** Botão "Limpar expiradas" (checkpoint v0.26) — marca sessões velhas como expiradas e libera o bloqueio. */
  async function limparExpiradas() {
    setError(null);
    try { await expireStaleProfileSessions(campaign.id); await reloadPerfis(); }
    catch (e) { fail(e, "Erro ao limpar sessões expiradas."); }
  }
  async function criarConvite() {
    setError(null);
    try {
      const { rawToken } = await createCampaignInvite(campaign.id, conviteLabel);
      setConviteLabel("");
      setLinkNovo(`${window.location.origin}/join/${rawToken}`);
      await reloadConvites();
    } catch (e) { fail(e, "Erro ao criar convite."); }
  }
  async function revogar(inviteId: string) {
    setError(null);
    try { await revokeCampaignInvite(inviteId); await reloadConvites(); }
    catch (e) { fail(e, "Erro ao revogar convite."); }
  }

  function sessaoAtiva(profileId: string): ProfileSession | null {
    return sessoes.find((s) => s.profile_id === profileId && s.status === "active") ?? null;
  }

  // Ciclo de vida (checkpoint v0.25): personagensDaMesa vem sem filtro
  // de archived_at (listCharactersForCampaign) — separado aqui em duas
  // listas de exibição. Só os ativos aparecem como opção de "personagem
  // ativo" de um perfil (abaixo); os arquivados ganham uma seção própria
  // com "Restaurar".
  const personagensAtivosDaMesa = personagensDaMesa.filter((c) => !c.archived_at);
  const personagensArquivadosDaMesa = personagensDaMesa.filter((c) => c.archived_at);

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 80px" }}>
      <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 12 }}>← Minhas mesas</Link>
      <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>{campaign.name}</h1>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 24, fontFamily: "monospace" }}>{campaign.id}</p>

      {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {error}</p>}

      {/* Personagens da mesa (checkpoint v0.23; ciclo de vida v0.25) */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={h2}>Personagens da mesa ({personagensAtivosDaMesa.length})</h2>
        <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
          Só personagens vinculados a esta mesa aparecem para escolha como "personagem ativo" de
          um perfil (abaixo). Personagens sem mesa são legados/globais — ver /dev/character-sheet.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select data-testid="det-personagem-disponivel-select" value={personagemParaVincular} onChange={(e) => setPersonagemParaVincular(e.target.value)} style={{ ...input, flex: 1 }}>
            <option value="">— selecionar personagem existente (sem mesa) —</option>
            {personagensDisponiveis.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button data-testid="det-vincular-personagem-mesa" onClick={vincularPersonagemAMesa} disabled={!personagemParaVincular} style={{ ...btn, opacity: personagemParaVincular ? 1 : 0.5 }}>
            Vincular à mesa
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            data-testid="det-novo-personagem-nome"
            value={novoPersonagemNome}
            onChange={(e) => setNovoPersonagemNome(e.target.value)}
            placeholder="Nome do novo personagem"
            style={{ ...input, flex: 1 }}
          />
          <button data-testid="det-criar-personagem" onClick={criarPersonagemNaMesa} disabled={!novoPersonagemNome.trim()} style={{ ...btn, opacity: novoPersonagemNome.trim() ? 1 : 0.5 }}>
            Criar personagem novo
          </button>
        </div>
        {personagensAtivosDaMesa.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum personagem vinculado a esta mesa ainda.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {personagensAtivosDaMesa.map((c) => (
            <div key={c.id} data-testid="det-personagem-mesa" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <strong>{c.name}</strong>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, opacity: 0.6 }}>Perfil:</span>
                <select
                  data-testid={`det-personagem-perfil-select-${c.id}`}
                  value={c.profile_id ?? ""}
                  onChange={(e) => vincularPersonagemAPerfil(c.id, e.target.value || null)}
                  style={input}
                >
                  <option value="">— nenhum —</option>
                  {perfis.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                </select>
                <button data-testid={`det-renomear-personagem-${c.id}`} onClick={() => renomearPersonagem(c.id, c.name)} style={btn}>
                  Renomear
                </button>
                <button data-testid={`det-duplicar-personagem-${c.id}`} onClick={() => duplicarPersonagem(c.id)} style={btn}>
                  Duplicar
                </button>
                <button data-testid={`det-arquivar-personagem-${c.id}`} onClick={() => arquivarPersonagem(c.id, c.name)} style={btn}>
                  Arquivar
                </button>
                <button data-testid={`det-desvincular-personagem-${c.id}`} onClick={() => desvincularPersonagemDaMesa(c.id)} style={btn}>
                  Desvincular da mesa
                </button>
              </div>
            </div>
          ))}
        </div>

        {personagensArquivadosDaMesa.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 8 }}>
              Personagens arquivados ({personagensArquivadosDaMesa.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {personagensArquivadosDaMesa.map((c) => (
                <div key={c.id} data-testid="det-personagem-arquivado" style={{ ...card, opacity: 0.7, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span>{c.name}</span>
                  <button data-testid={`det-restaurar-personagem-${c.id}`} onClick={() => restaurarPersonagem(c.id, c.name)} style={btn}>
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Perfis */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ ...h2, marginBottom: 0 }}>Perfis ({perfis.length})</h2>
          <button data-testid="det-limpar-expiradas" onClick={limparExpiradas} style={btn}>
            Limpar expiradas
          </button>
        </div>
        <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
          Sessões sem heartbeat há mais de 30s (checkpoint v0.26) já são detectadas automaticamente ao
          abrir esta página/o convite/a ficha; este botão só força a limpeza na hora, sem esperar.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input data-testid="det-novo-perfil" value={novoPerfil} onChange={(e) => setNovoPerfil(e.target.value)} placeholder="Apelido do perfil" style={{ ...input, flex: 1 }} />
          <button data-testid="det-criar-perfil" onClick={criarPerfil} style={btn}>Criar perfil</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {perfis.map((p) => {
            // Busca em ambas as listas (da mesa + disponíveis) só para exibir o
            // nome — cobre o caso legado de um active_character_id apontar
            // para um personagem ainda não vinculado formalmente à mesa.
            const ativo = [...personagensDaMesa, ...personagensDisponiveis].find((c) => c.id === p.active_character_id);
            const sess = sessaoAtiva(p.id);
            // Status calculado sem sessionId de navegador (visão do narrador,
            // nunca "é esta aba") — reusa a mesma lógica de /ficha e /join.
            const status = computeProfileStatus(p, null, Date.now());
            const ultimoSinal = p.last_seen_at ? new Date(p.last_seen_at).toLocaleString("pt-BR") : "nunca";
            return (
              <div key={p.id} data-testid="det-perfil" style={{ ...card, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <strong>{p.nickname}</strong>
                  <span data-testid={`det-perfil-status-${p.id}`} style={{ fontSize: 11, color: sess ? "#5ec8ff" : "#888" }}>
                    {sess ? "sessão ativa" : "sem sessão"} · {status}
                  </span>
                </div>
                <span style={{ fontSize: 10, opacity: 0.5 }}>
                  Último sinal: {ultimoSinal}
                  {status === "Expirado" ? ` (expirado há ${Math.round((Date.now() - new Date(p.last_seen_at ?? 0).getTime()) / 1000)}s)` : ""}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                    Personagem: {ativo ? `${ativo.name}${ativo.archived_at ? " (arquivado)" : ""}` : "nenhum"}
                  </span>
                  <select data-testid={`det-personagem-${p.id}`} value={p.active_character_id ?? ""} onChange={(e) => vincular(p.id, e.target.value || null)} style={input}>
                    <option value="">— vincular —</option>
                    {personagensAtivosDaMesa.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button data-testid={`det-liberar-${p.id}`} onClick={() => liberar(p.id)} disabled={!p.is_locked} style={{ ...btn, opacity: p.is_locked ? 1 : 0.5 }}>Liberar</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Convites */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={h2}>Convites ({convites.length})</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input data-testid="det-convite-label" value={conviteLabel} onChange={(e) => setConviteLabel(e.target.value)} placeholder="Rótulo (opcional)" style={{ ...input, flex: 1 }} />
          <button data-testid="det-criar-convite" onClick={criarConvite} style={btn}>Criar convite</button>
        </div>
        {linkNovo && (
          <div data-testid="det-link-novo" style={{ background: "#15301a", border: "1px solid #2a5a35", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
            <div style={{ opacity: 0.7, marginBottom: 4 }}>Link (mostrado só agora):</div>
            <code style={{ wordBreak: "break-all" }}>{linkNovo}</code>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {convites.map((c) => {
            const revogado = c.revoked_at != null || !c.is_active;
            return (
              <div key={c.id} data-testid="det-convite" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span>{c.label ?? "(sem rótulo)"} · <span style={{ color: revogado ? "#ff6b6b" : "#7fd99a", fontSize: 11 }}>{revogado ? "Revogado" : "Ativo"}</span></span>
                <button data-testid={`det-revogar-${c.id}`} onClick={() => revogar(c.id)} disabled={revogado} style={{ ...btn, opacity: revogado ? 0.5 : 1 }}>Revogar</button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Log (narrador vê tudo) */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ ...h2, marginBottom: 0 }}>Log da mesa ({logs.length})</h2>
          <button data-testid="det-atualizar-log" onClick={reloadLogs} style={btn}>Atualizar</button>
        </div>
        <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>Como narrador dono, você vê tudo (public/private/gm).</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {logs.map((e) => (
            <div key={e.id} data-testid="det-log" style={{ ...card, fontSize: 12 }}>
              <span style={{ opacity: 0.5, fontSize: 11 }}>[{e.visibility}] {e.type}</span>{" "}
              {typeof e.payload.text === "string" ? e.payload.text : typeof e.payload.mensagem === "string" ? e.payload.mensagem : typeof e.payload.total !== "undefined" ? `rolagem = ${String(e.payload.total)}` : typeof e.payload.evento === "string" ? `evento: ${e.payload.evento}` : ""}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
