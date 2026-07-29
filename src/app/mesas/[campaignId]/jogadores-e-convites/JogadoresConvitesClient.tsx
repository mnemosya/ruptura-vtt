"use client";

/**
 * Jogadores e convites (aditivo §8) — consolida participantes,
 * convite por e-mail e convite limpo numa única área do narrador.
 * Reaproveita as mesmas Server Actions já testadas na Fase 1/2
 * (src/lib/table/storage.ts) — nenhuma regra de convite/participação
 * foi reimplementada aqui, só a apresentação.
 */
import { useState } from "react";
import {
  createCampaignInvite,
  createCampaignEmailInvite,
  listCampaignInvites,
  revokeCampaignInvite,
  listCampaignMembers,
  removeCampaignMember,
  getCampaignParticipantInfo,
  type CampaignParticipantInfo,
} from "../../../../lib/table/storage";
import { listCharacterControllers, type CharacterController } from "../../../../lib/character/storage";
import type { CampaignMember, CampaignInvite } from "../../../../lib/table";
import { btnDanger, btnGhost, btnPrimary, card, color, emptyState, input, pageContainer, text } from "../_shell/theme";

interface Props {
  campaignId: string;
  membrosIniciais: CampaignMember[];
  convitesIniciais: CampaignInvite[];
  controlesIniciais: CharacterController[];
  /** Nome de exibição + e-mail por user_id (RPC get_campaign_participant_info, migration 0060) — nunca UUID cru na UI. */
  participantInfoIniciais: Record<string, CampaignParticipantInfo>;
}

export default function JogadoresConvitesClient({ campaignId, membrosIniciais, convitesIniciais, controlesIniciais, participantInfoIniciais }: Props) {
  const [membros, setMembros] = useState(membrosIniciais);
  const [convites, setConvites] = useState(convitesIniciais);
  const [controles, setControles] = useState(controlesIniciais);
  const [participantInfo, setParticipantInfo] = useState<Record<string, CampaignParticipantInfo>>(participantInfoIniciais);
  const [conviteLabel, setConviteLabel] = useState("");
  const [conviteEmail, setConviteEmail] = useState("");
  const [conviteEmailLabel, setConviteEmailLabel] = useState("");
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);

  function fail(err: unknown, msg: string) {
    setError(err instanceof Error ? err.message : msg);
  }

  async function reloadMembros() {
    try { setMembros(await listCampaignMembers(campaignId)); } catch (e) { fail(e, "Erro ao recarregar participantes."); }
  }
  async function reloadConvites() {
    try { setConvites(await listCampaignInvites(campaignId)); } catch (e) { fail(e, "Erro ao recarregar convites."); }
  }
  async function reloadControles() {
    try { setControles(await listCharacterControllers(campaignId)); } catch (e) { fail(e, "Erro ao recarregar controles de personagem."); }
  }
  async function reloadParticipantInfo() {
    try { setParticipantInfo(Object.fromEntries(await getCampaignParticipantInfo(campaignId))); } catch { /* nome/e-mail são só apresentação — falha não bloqueia a tela */ }
  }

  function nomeDe(userId: string): string {
    return participantInfo[userId]?.display_name ?? "Conta sem nome";
  }
  function emailDe(userId: string): string | null {
    return participantInfo[userId]?.email ?? null;
  }

  async function removerParticipante(userId: string) {
    if (!window.confirm("Remover este participante da campanha? Isso revoga o acesso dele aos personagens que controla aqui.")) return;
    setError(null);
    try {
      await removeCampaignMember(campaignId, userId);
      await Promise.all([reloadMembros(), reloadControles(), reloadParticipantInfo()]);
    } catch (e) { fail(e, "Erro ao remover participante."); }
  }

  async function criarConvite() {
    setError(null);
    setBusyInvite(true);
    try {
      const { rawToken } = await createCampaignInvite(campaignId, conviteLabel);
      setConviteLabel("");
      setLinkNovo(`${window.location.origin}/join/${rawToken}`);
      await reloadConvites();
    } catch (e) { fail(e, "Erro ao criar convite."); } finally { setBusyInvite(false); }
  }

  async function criarConviteEmail() {
    if (!conviteEmail.trim()) return;
    setError(null);
    setBusyInvite(true);
    try {
      const { rawToken } = await createCampaignEmailInvite(campaignId, conviteEmail, conviteEmailLabel);
      setConviteEmail("");
      setConviteEmailLabel("");
      setLinkNovo(`${window.location.origin}/join/${rawToken}`);
      await reloadConvites();
    } catch (e) { fail(e, "Erro ao criar convite por e-mail."); } finally { setBusyInvite(false); }
  }

  async function revogar(inviteId: string) {
    setError(null);
    try { await revokeCampaignInvite(inviteId); await reloadConvites(); }
    catch (e) { fail(e, "Erro ao revogar convite."); }
  }

  const jogadores = membros.filter((m) => m.role !== "owner");
  const convitesEmail = convites.filter((c) => c.kind === "email");
  const convitesLimpos = convites.filter((c) => c.kind === "clean");

  function controlesDe(userId: string): number {
    return controles.filter((c) => c.user_id === userId).length;
  }

  return (
    <main style={pageContainer()}>
      <h1 style={{ ...text.h1, marginBottom: 20 }}>Jogadores e convites</h1>

      {error && <p role="alert" style={{ color: color.danger, fontSize: 13, marginBottom: 16 }}>Erro: {error}</p>}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ ...text.h2, marginBottom: 10 }}>Jogadores ({jogadores.length})</h2>
        {jogadores.length === 0 ? (
          <div style={emptyState}>Nenhum jogador entrou nesta campanha ainda. Convide alguém abaixo.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {jogadores.map((m) => (
              <div key={m.id} data-testid="det-membro" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{nomeDe(m.user_id)}</span>
                  {emailDe(m.user_id) && <span style={{ ...text.faint, fontSize: 11 }}>{emailDe(m.user_id)}</span>}
                  <span style={{ ...text.faint }}>
                    {m.status === "active" ? "Ativo" : "Removido"} · {controlesDe(m.user_id)} personagem{controlesDe(m.user_id) === 1 ? "" : "ns"} controlado{controlesDe(m.user_id) === 1 ? "" : "s"}
                  </span>
                </div>
                {m.status === "active" && (
                  <button data-testid={`det-remover-participante-${m.user_id}`} onClick={() => removerParticipante(m.user_id)} className="rv-btn rv-focusable" style={btnDanger}>
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p style={{ ...text.faint, marginTop: 10 }}>
          Atribuir ou remover controle de personagem é feito em <strong>Personagens</strong>.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ ...text.h2, marginBottom: 10 }}>Convite por e-mail</h2>
        <p style={{ ...text.faint, marginBottom: 10 }}>
          Ao autenticar com este e-mail, a pessoa entra automaticamente na campanha — sem etapa extra de aceitar convite.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            data-testid="det-convite-email"
            type="email"
            value={conviteEmail}
            onChange={(e) => setConviteEmail(e.target.value)}
            placeholder="e-mail@exemplo.com"
            className="rv-focusable"
            style={{ ...input, flex: 1, minWidth: 200 }}
          />
          <input
            data-testid="det-convite-email-label"
            value={conviteEmailLabel}
            onChange={(e) => setConviteEmailLabel(e.target.value)}
            placeholder="Rótulo (opcional)"
            className="rv-focusable"
            style={{ ...input, flex: 1, minWidth: 140 }}
          />
          <button data-testid="det-criar-convite-email" onClick={criarConviteEmail} disabled={!conviteEmail.trim() || busyInvite} className="rv-btn rv-focusable" style={{ ...btnPrimary, opacity: !conviteEmail.trim() || busyInvite ? 0.6 : 1 }}>
            Convidar por e-mail
          </button>
        </div>
        {convitesEmail.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {convitesEmail.map((c) => (
              <InviteRow key={c.id} invite={c} onRevoke={revogar} />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ ...text.h2, marginBottom: 10 }}>Convite limpo</h2>
        <p style={{ ...text.faint, marginBottom: 10 }}>
          Qualquer pessoa com o link entra automaticamente como Jogador — nunca concede Narrador.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            data-testid="det-convite-label"
            value={conviteLabel}
            onChange={(e) => setConviteLabel(e.target.value)}
            placeholder="Rótulo (opcional)"
            className="rv-focusable"
            style={{ ...input, flex: 1 }}
          />
          <button data-testid="det-criar-convite" onClick={criarConvite} disabled={busyInvite} className="rv-btn rv-focusable" style={{ ...btnPrimary, opacity: busyInvite ? 0.6 : 1 }}>
            Gerar convite limpo
          </button>
        </div>
        {convitesLimpos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {convitesLimpos.map((c) => (
              <InviteRow key={c.id} invite={c} onRevoke={revogar} />
            ))}
          </div>
        )}
      </section>

      {linkNovo && (
        <div data-testid="det-link-novo" style={{ background: color.successBg, border: `1px solid ${color.successBorder}`, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
          <div style={{ opacity: 0.7, marginBottom: 4 }}>Link (mostrado só agora — copie antes de sair desta tela):</div>
          <code style={{ wordBreak: "break-all" }}>{linkNovo}</code>
        </div>
      )}
    </main>
  );
}

function InviteRow({ invite, onRevoke }: { invite: CampaignInvite; onRevoke: (id: string) => void }) {
  const revogado = invite.revoked_at != null || !invite.is_active;
  const status = revogado ? "Revogado" : invite.kind === "email" ? (invite.activated_at ? "Ativado" : "Pendente") : "Ativo";
  const statusColor = revogado ? color.danger : invite.kind === "email" && !invite.activated_at ? color.warning : color.success;
  return (
    <div data-testid="det-convite" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span>
        {invite.kind === "email" ? invite.email : invite.label ?? "(sem rótulo)"} ·{" "}
        <span style={{ color: statusColor, fontSize: 11 }}>{status}</span>
      </span>
      <button data-testid={`det-revogar-${invite.id}`} onClick={() => onRevoke(invite.id)} disabled={revogado} className="rv-btn rv-focusable" style={{ ...btnGhost, opacity: revogado ? 0.5 : 1 }}>
        Revogar
      </button>
    </div>
  );
}
