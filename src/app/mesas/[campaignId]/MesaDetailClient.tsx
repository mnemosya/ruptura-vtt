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
} from "../../../lib/table/storage";
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
  personagens: CharacterRecord[];
}

export default function MesaDetailClient({ campaign, perfisIniciais, convitesIniciais, sessoesIniciais, logsIniciais, personagens }: Props) {
  const [perfis, setPerfis] = useState(perfisIniciais);
  const [convites, setConvites] = useState(convitesIniciais);
  const [sessoes, setSessoes] = useState(sessoesIniciais);
  const [logs, setLogs] = useState(logsIniciais);
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

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 80px" }}>
      <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 12 }}>← Minhas mesas</Link>
      <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>{campaign.name}</h1>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 24, fontFamily: "monospace" }}>{campaign.id}</p>

      {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {error}</p>}

      {/* Perfis */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={h2}>Perfis ({perfis.length})</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input data-testid="det-novo-perfil" value={novoPerfil} onChange={(e) => setNovoPerfil(e.target.value)} placeholder="Apelido do perfil" style={{ ...input, flex: 1 }} />
          <button data-testid="det-criar-perfil" onClick={criarPerfil} style={btn}>Criar perfil</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {perfis.map((p) => {
            const ativo = personagens.find((c) => c.id === p.active_character_id);
            const sess = sessaoAtiva(p.id);
            return (
              <div key={p.id} data-testid="det-perfil" style={{ ...card, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <strong>{p.nickname}</strong>
                  <span style={{ fontSize: 11, color: sess ? "#5ec8ff" : "#888" }}>
                    {sess ? "sessão ativa" : "sem sessão"} · {p.is_locked ? "Bloqueado" : "Livre"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>Personagem: {ativo ? ativo.name : "nenhum"}</span>
                  <select data-testid={`det-personagem-${p.id}`} value={p.active_character_id ?? ""} onChange={(e) => vincular(p.id, e.target.value || null)} style={input}>
                    <option value="">— vincular —</option>
                    {personagens.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
