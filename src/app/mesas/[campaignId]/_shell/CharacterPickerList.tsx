import { AbrirFicha } from "./AbrirFicha";
import type { CharacterRecord } from "../../../../lib/character";

/** Lista simples de personagens com uma ação de abrir a ficha (numa aba específica, opcional) — usado por entradas de menu que precisam escolher um personagem antes de continuar (ex.: Mercado). */
export function CharacterPickerList({
  campaignId,
  personagens,
  tab,
  actionLabel = "Abrir ficha",
}: {
  campaignId: string;
  personagens: CharacterRecord[];
  tab?: string;
  actionLabel?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {personagens.map((c) => (
        <div key={c.id} className="rm-card rm-card-row">
          <strong style={{ fontSize: 14 }}>{c.name}</strong>
          <AbrirFicha
            campaignId={campaignId}
            characterId={c.id}
            tab={tab}
            className="rm-btn rm-btn-primary rv-focusable"
          >
            {actionLabel}
          </AbrirFicha>
        </div>
      ))}
    </div>
  );
}
