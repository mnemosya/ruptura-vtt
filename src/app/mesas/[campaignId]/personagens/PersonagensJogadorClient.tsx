"use client";

/**
 * Personagens — visão do jogador (aditivo §9.3/§10.3). Só os
 * personagens que a conta controla nesta campanha; nenhuma ação
 * administrativa (nem no cliente, nem — mais importante — no
 * servidor: arquivar/duplicar/atribuir continuam exigindo
 * `is_campaign_owner` na RLS, ver migration 0052).
 */
import Link from "next/link";
import { AbrirFicha } from "../_shell/AbrirFicha";
import type { CharacterRecord } from "../../../../lib/character";

export default function PersonagensJogadorClient({
  campaignId,
  personagens,
}: {
  campaignId: string;
  personagens: CharacterRecord[];
}) {
  return (
    <main className="rm-page">
      <h1 className="rm-page-title">Personagens</h1>

      {personagens.length === 0 ? (
        <div className="rm-empty" data-testid="personagens-vazio-jogador">
          <p style={{ margin: 0 }}>Você ainda não controla um personagem nesta campanha.</p>
          <Link
            href={`/mesas/${campaignId}/personagens/novo`}
            data-testid="personagens-criar-jogador"
            className="rm-btn rm-btn-primary rv-focusable"
            style={{ marginTop: 12 }}
          >
            Criar personagem
          </Link>
        </div>
      ) : (
        <div className="rm-card-grid" data-testid="personagens-lista-jogador">
          {personagens.map((c) => (
            <div key={c.id} data-testid="personagens-item-jogador" className="rm-card rm-card-row">
              <strong style={{ fontSize: 14 }}>{c.name}</strong>
              <AbrirFicha
                campaignId={campaignId}
                characterId={c.id}
                testId={`personagens-abrir-ficha-${c.id}`}
                className="rm-btn rm-btn-primary rv-focusable"
              >
                Abrir ficha
              </AbrirFicha>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
