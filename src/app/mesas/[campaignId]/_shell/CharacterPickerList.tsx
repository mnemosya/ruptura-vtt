import Link from "next/link";
import type { CharacterRecord } from "../../../../lib/character";
import { card } from "./theme";

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
        <div key={c.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>{c.name}</strong>
          <Link
            href={`/ficha?campaignId=${campaignId}&characterId=${c.id}${tab ? `&tab=${tab}` : ""}`}
            className="rv-focusable"
            style={{ background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", fontSize: 13, textDecoration: "none" }}
          >
            {actionLabel}
          </Link>
        </div>
      ))}
    </div>
  );
}
