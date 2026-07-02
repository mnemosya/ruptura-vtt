import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import type { PendingRuptureChoice } from "../../../../lib/character";

/**
 * Pendências de Marca/Traço narrativo de uma Ruptura resolvida
 * (checkpoint v0.45) — texto livre, nunca obrigatório, nunca valida
 * contra lista oficial (que ainda não existe como conteúdo da
 * Biblioteca). A resolução chama `resolvePendingRuptureChoice`
 * (função pura, `lib/character/rupture.ts`) — este componente só
 * coleta o texto e delega ao handler do CharacterSheetClient.
 */
export function PendingRuptureChoices({
  choices,
  onResolve,
}: {
  choices: PendingRuptureChoice[];
  onResolve: (choiceId: string, marca: string, traco: string) => void;
}) {
  const pendentes = choices.filter((c) => c.status === "pending");
  const resolvidas = choices.filter((c) => c.status === "resolved");
  const [rascunhos, setRascunhos] = useState<Record<string, { marca: string; traco: string }>>({});

  function rascunho(id: string) {
    return rascunhos[id] ?? { marca: "", traco: "" };
  }

  function atualizarRascunho(id: string, campo: "marca" | "traco", valor: string) {
    setRascunhos((prev) => ({ ...prev, [id]: { ...rascunho(id), [campo]: valor } }));
  }

  function salvar(id: string) {
    const { marca, traco } = rascunho(id);
    onResolve(id, marca, traco);
    setRascunhos((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  if (pendentes.length === 0 && resolvidas.length === 0) return null;

  return (
    <Section title={`Marca e Traço (${pendentes.length} pendente${pendentes.length === 1 ? "" : "s"})`}>
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
        Criadas ao resolver uma Ruptura no fim de cena (checkpoint v0.45, PRD 10.6) — texto livre,
        nunca obrigatório na hora. Pode ser preenchido depois, sem bloquear o encerramento da cena.
      </p>
      {pendentes.length > 0 && (
        <div data-testid="pending-rupture-choices-lista" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: resolvidas.length > 0 ? 16 : 0 }}>
          {pendentes.map((choice) => {
            const r = rascunho(choice.id);
            return (
              <div
                key={choice.id}
                data-testid={`pending-rupture-choice-${choice.id}`}
                style={{
                  background: "#1d1e24",
                  borderLeft: "3px solid #c0392b",
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <span style={{ opacity: 0.7 }}>
                  Ruptura nível {choice.ruptureLevel} — cena {choice.scene}
                </span>
                <input
                  data-testid={`pending-rupture-choice-marca-${choice.id}`}
                  type="text"
                  placeholder="Marca (texto livre)"
                  value={r.marca}
                  onChange={(e) => atualizarRascunho(choice.id, "marca", e.target.value)}
                  style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "6px 8px", fontSize: 13 }}
                />
                <input
                  data-testid={`pending-rupture-choice-traco-${choice.id}`}
                  type="text"
                  placeholder="Traço (texto livre)"
                  value={r.traco}
                  onChange={(e) => atualizarRascunho(choice.id, "traco", e.target.value)}
                  style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "6px 8px", fontSize: 13 }}
                />
                <button
                  data-testid={`pending-rupture-choice-salvar-${choice.id}`}
                  onClick={() => salvar(choice.id)}
                  style={{ ...buttonStyle, alignSelf: "flex-start" }}
                >
                  Salvar Marca e Traço
                </button>
              </div>
            );
          })}
        </div>
      )}
      {resolvidas.length > 0 && (
        <div data-testid="resolved-rupture-choices-lista" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {resolvidas.map((choice) => (
            <div
              key={choice.id}
              data-testid={`resolved-rupture-choice-${choice.id}`}
              style={{ fontSize: 12, opacity: 0.6, background: "#1d1e24", borderRadius: 8, padding: "8px 12px" }}
            >
              Cena {choice.scene} — {choice.marca || "(sem marca)"} / {choice.traco || "(sem traço)"}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
