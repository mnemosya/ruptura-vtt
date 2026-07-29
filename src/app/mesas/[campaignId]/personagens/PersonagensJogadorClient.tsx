"use client";

/**
 * Personagens — visão do jogador (aditivo §9.3/§10.3). Só os
 * personagens que a conta controla nesta campanha; nenhuma ação
 * administrativa (nem no cliente, nem — mais importante — no
 * servidor: arquivar/duplicar/atribuir continuam exigindo
 * `is_campaign_owner` na RLS, ver migration 0052).
 */
import Link from "next/link";
import type { CharacterRecord } from "../../../../lib/character";
import { btnPrimary, card, emptyState, pageContainer, text } from "../_shell/theme";

export default function PersonagensJogadorClient({
  campaignId,
  personagens,
}: {
  campaignId: string;
  personagens: CharacterRecord[];
}) {
  return (
    <main style={pageContainer()}>
      <h1 style={{ ...text.h1, marginBottom: 20 }}>Personagens</h1>

      {personagens.length === 0 ? (
        <div style={emptyState} data-testid="personagens-vazio-jogador">
          <p style={{ margin: 0 }}>Você ainda não controla um personagem nesta campanha.</p>
          <Link
            href={`/mesas/${campaignId}/personagens/novo`}
            data-testid="personagens-criar-jogador"
            className="rv-btn rv-focusable"
            style={{ ...btnPrimary, display: "inline-block", textDecoration: "none", marginTop: 12 }}
          >
            Criar personagem
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="personagens-lista-jogador">
          {personagens.map((c) => (
            <div key={c.id} data-testid="personagens-item-jogador" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>{c.name}</strong>
              <Link
                href={`/ficha?campaignId=${campaignId}&characterId=${c.id}`}
                data-testid={`personagens-abrir-ficha-${c.id}`}
                className="rv-focusable"
                style={{ background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "7px 14px", fontSize: 13, textDecoration: "none" }}
              >
                Abrir ficha
              </Link>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
