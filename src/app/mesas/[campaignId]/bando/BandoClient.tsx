"use client";

import { useState } from "react";
import { listCrewInventory, removeCrewInventoryItem, type CrewInventoryItem } from "../../../../lib/table/crewInventory";

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
    <main className="rm-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 className="rm-page-title" style={{ marginBottom: 0 }}>Bando</h1>
        <button onClick={reload} className="rm-btn rm-btn-ghost rv-focusable">Atualizar</button>
      </div>
      <p className="rm-faint" style={{ marginBottom: 16 }}>
        Inventário compartilhado do grupo. Enviar ou retirar um item específico é feito pela ficha do
        personagem (aba Mesa/Inventário) — aqui você vê o que já está guardado{isNarrator ? " e pode remover itens" : ""}.
      </p>

      {error && <p role="alert" className="rm-erro" style={{ marginBottom: 16 }}>Erro: {error}</p>}

      {itens.length === 0 ? (
        <div className="rm-empty">O bando ainda não tem nenhum item.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {itens.map((item) => (
            <div key={item.id} className="rm-card rm-card-row">
              <span>
                {item.itemName ?? "(item sem nome)"}
                {item.quantity != null && item.quantity > 1 ? ` ×${item.quantity}` : ""}
              </span>
              {isNarrator && (
                <button
                  onClick={() => remover(item.id)}
                  disabled={busyId === item.id}
                  className="rm-btn rm-btn-danger rv-focusable"
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
