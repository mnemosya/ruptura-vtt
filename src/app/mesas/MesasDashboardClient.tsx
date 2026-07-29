"use client";

/**
 * "Minhas Campanhas" (aditivo §4.2) — lista TODAS as campanhas da
 * conta autenticada, narradora em algumas e jogadora em outras, com a
 * ação principal certa para cada papel. "Criar Campanha" continua
 * nesta mesma página (âncora `#criar-campanha`, alvo do item de mesmo
 * nome no menu geral da conta) — não há necessidade de uma rota
 * própria só para o formulário.
 */

import { useState } from "react";
import Link from "next/link";
import { createCampaign } from "../../lib/table/storage";
import type { Campaign } from "../../lib/table";
import { AccountNav } from "./_account/AccountNav";
import { badge, btnPrimary, card, color, emptyState, input, pageContainer, text } from "./[campaignId]/_shell/theme";

export interface CampaignCardData {
  campaign: Campaign;
  role: "narrator" | "player";
  /** Só relevante para role="player" — quantos personagens a conta controla nesta campanha. null para narrador (não se aplica). */
  controlledCharacterCount: number | null;
}

interface Props {
  userEmail: string;
  campanhasIniciais: CampaignCardData[];
  errorInicial: string | null;
}

export default function MesasDashboardClient({ userEmail, campanhasIniciais, errorInicial }: Props) {
  const [campanhas, setCampanhas] = useState<CampaignCardData[]>(campanhasIniciais);
  const [novoNome, setNovoNome] = useState("");
  const [error, setError] = useState<string | null>(errorInicial);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!novoNome.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const mesa = await createCampaign(novoNome);
      setNovoNome("");
      setCampanhas((prev) => [{ campaign: mesa, role: "narrator", controlledCharacterCount: null }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar campanha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AccountNav userEmail={userEmail} />
      <main style={pageContainer(760)}>
        <h1 style={{ ...text.h1, marginBottom: 20 }}>Minhas Campanhas</h1>

        {error && (
          <p role="alert" style={{ color: color.danger, fontSize: 13, marginBottom: 16 }}>
            Erro: {error}
          </p>
        )}

        <section id="criar-campanha" style={{ marginBottom: 32, scrollMarginTop: 24 }}>
          <h2 style={{ ...text.h2, marginBottom: 10 }}>Criar Campanha</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <label htmlFor="nova-campanha-nome" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
              Nome da nova campanha
            </label>
            <input
              id="nova-campanha-nome"
              data-testid="dash-nova-mesa"
              type="text"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && novoNome.trim() && !busy) handleCreate(); }}
              placeholder="Nome da nova campanha"
              className="rv-focusable"
              style={{ ...input, flex: 1 }}
            />
            <button
              data-testid="dash-criar-mesa"
              onClick={handleCreate}
              disabled={busy || !novoNome.trim()}
              className="rv-btn rv-focusable"
              style={{ ...btnPrimary, opacity: busy || !novoNome.trim() ? 0.6 : 1 }}
            >
              {busy ? "Criando…" : "Criar campanha"}
            </button>
          </div>
        </section>

        <section>
          <h2 style={{ ...text.h2, marginBottom: 10 }}>Suas campanhas</h2>
          {campanhas.length === 0 ? (
            <div style={emptyState} data-testid="dash-vazio">
              <p style={{ margin: 0 }}>Você ainda não tem campanhas.</p>
              <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.7 }}>
                Crie a primeira acima, ou peça um convite a quem já narra uma campanha.
              </p>
            </div>
          ) : (
            <div data-testid="dash-mesas-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {campanhas.map(({ campaign, role, controlledCharacterCount }) => (
                <div
                  key={campaign.id}
                  data-testid="dash-mesa-item"
                  style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{campaign.name}</strong>
                      <span style={badge(role)}>{role === "narrator" ? "Narradora" : "Jogadora"}</span>
                    </div>
                    {role === "player" && (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
                        {controlledCharacterCount === 0
                          ? "Sem personagem controlado ainda"
                          : `${controlledCharacterCount} personagem${controlledCharacterCount === 1 ? "" : "ns"} controlado${controlledCharacterCount === 1 ? "" : "s"}`}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/mesas/${campaign.id}`}
                    data-testid={`dash-abrir-${campaign.id}`}
                    className="rv-btn rv-focusable"
                    style={{ background: color.surface, color: "inherit", border: `1px solid ${color.border}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, textDecoration: "none" }}
                  >
                    {role === "narrator" ? "Entrar na campanha" : "Abrir campanha"}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <p style={{ marginTop: 32, fontSize: 12, opacity: 0.5 }}>
          Console de diagnóstico dev: <Link href="/dev/table" style={{ color: "#5ec8ff" }}>/dev/table</Link>
        </p>
      </main>
    </div>
  );
}
