"use client";

import { useState } from "react";
import { listCrewInventory, removeCrewInventoryItem, type CrewInventoryItem } from "../../../../lib/table/crewInventory";
import { btnDanger, btnGhost, card, emptyState, pageContainer, text } from "../_shell/theme";

export default function BandoClient({
  campaignId,
  isNarrator,
  itensIniciais,
}: {
  campaignId: string;
  isNarrator: boolean;
  itensIniciais: CrewInventoryItem[];
}) {
  const [itens, setItens] = useState(itensIniciais);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    try {
      setItens(await listCrewInventory(campaignId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao recarregar o bando.");
    }
  }

  async function remover(rowId: string) {
    if (!window.confirm("Remover este item do bando?")) return;
    setError(null);
    setBusyId(rowId);
    try {
      await removeCrewInventoryItem(campaignId, rowId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover item do bando.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={pageContainer()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={text.h1}>Bando</h1>
        <button onClick={reload} className="rv-btn rv-focusable" style={btnGhost}>Atualizar</button>
      </div>
      <p style={{ ...text.faint, marginBottom: 16 }}>
        Inventário compartilhado do grupo. Enviar ou retirar um item específico é feito pela ficha do
        personagem (aba Mesa/Inventário) — aqui você vê o que já está guardado{isNarrator ? " e pode remover itens" : ""}.
      </p>

      {error && <p role="alert" style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {error}</p>}

      {itens.length === 0 ? (
        <div style={emptyState}>O bando ainda não tem nenhum item.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {itens.map((item) => (
            <div key={item.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span>
                {item.itemName ?? "(item sem nome)"}
                {item.quantity != null && item.quantity > 1 ? ` ×${item.quantity}` : ""}
              </span>
              {isNarrator && (
                <button
                  onClick={() => remover(item.id)}
                  disabled={busyId === item.id}
                  className="rv-btn rv-focusable"
                  style={{ ...btnDanger, opacity: busyId === item.id ? 0.6 : 1 }}
                >
                  {busyId === item.id ? "Removendo…" : "Remover"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
