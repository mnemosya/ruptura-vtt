"use client";

/**
 * Reivindicação de perfil (Etapa 12, correção 3, revisado na correção
 * 6) — passo exigido antes de liberar o `JoinClient` existente.
 * Estabelece o vínculo REAL usuário↔perfil
 * (`campaign_profiles.user_id`), nunca inferido por nome ou pelo
 * primeiro perfil livre — a pessoa escolhe explicitamente.
 *
 * Correção 6 (migration 0031): antes, este componente recebia TODOS os
 * perfis da campanha (inclusive os já reivindicados por outros
 * jogadores), o que exigia uma policy de SELECT ampla em
 * `campaign_profiles`. Agora recebe só o que precisa, já resolvido
 * pelo servidor: `perfilProprio` (o próprio perfil, se já reivindicado
 * — permitido pela nova policy "owner ou próprio user_id") e
 * `perfisReivindicaveis` (id+nickname dos perfis NÃO reivindicados,
 * via RPC `list_claimable_campaign_profiles`/
 * `listClaimableCampaignProfiles`, nunca um SELECT direto). O contador
 * de "perfis de outros jogadores" foi removido — exigiria expor
 * contagem/identidade de terceiros, o que o contrato mínimo da RPC não
 * permite.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignProfile } from "../../../lib/table";
import {
  claimCampaignProfile,
  createAndClaimCampaignProfile,
  type PerfilReivindicavel,
} from "../../../lib/campaignContent/campaignProfileServerActions";

interface Props {
  campaignId: string;
  perfilProprio: CampaignProfile | null;
  perfisReivindicaveis: PerfilReivindicavel[];
}

export function ClaimProfileClient({ campaignId, perfilProprio, perfisReivindicaveis }: Props) {
  const router = useRouter();
  const [novoNome, setNovoNome] = useState("");
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const jaReivindicado = perfilProprio;
  const disponiveis = perfisReivindicaveis;

  async function reivindicar(profileId: string) {
    setErro(null);
    setCarregando(profileId);
    const resultado = await claimCampaignProfile(profileId);
    setCarregando(null);
    if (!resultado.ok) setErro(resultado.erro ?? "Falha ao reivindicar perfil.");
    else router.refresh();
  }

  async function criar() {
    if (!novoNome.trim()) return;
    setErro(null);
    setCarregando("novo");
    const resultado = await createAndClaimCampaignProfile(campaignId, novoNome);
    setCarregando(null);
    if (!resultado.ok) setErro(resultado.erro ?? "Falha ao criar perfil.");
    else router.refresh();
  }

  if (jaReivindicado) {
    return (
      <div style={{ marginBottom: 20, padding: "10px 14px", borderRadius: 8, background: "#182a1e", border: "1px solid #26542f", fontSize: 13, color: "#8fd6a0" }}>
        Perfil reivindicado: <strong>{jaReivindicado.nickname}</strong>.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24, border: "1px solid #26262e", borderRadius: 10, padding: 16 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Escolha seu perfil nesta mesa</h2>
      <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: -6, marginBottom: 12 }}>
        Reivindique um perfil já existente ou crie o seu. Isso vincula sua conta a este perfil — nunca inferido automaticamente.
      </p>

      {erro && <p style={{ color: "#e08a8a", fontSize: 13 }}>{erro}</p>}

      {disponiveis.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
          {disponiveis.map((p) => (
            <li key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1c1c22" }}>
              <span style={{ fontSize: 13 }}>{p.nickname}</span>
              <button disabled={carregando !== null} onClick={() => reivindicar(p.id)} style={btn}>
                {carregando === p.id ? "Reivindicando..." : "Reivindicar"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p style={{ fontSize: 12, color: "#7d7d8a", marginBottom: 12 }}>
        Perfis já reivindicados por outros jogadores não aparecem aqui.
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="Nome do novo perfil"
          style={{ flex: 1, background: "#111116", color: "#e4e4ea", border: "1px solid #26262e", borderRadius: 6, padding: "6px 8px" }}
        />
        <button disabled={carregando !== null || !novoNome.trim()} onClick={criar} style={btn}>
          {carregando === "novo" ? "Criando..." : "Criar e reivindicar"}
        </button>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { background: "#2a5a3a", color: "#e4e4ea", border: "1px solid #3d7a4f", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 };
