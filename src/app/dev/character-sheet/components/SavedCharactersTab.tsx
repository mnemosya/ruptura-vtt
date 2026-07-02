import { Section } from "./Section";
import { buttonStyle } from "./styles";
import type { CharacterRecord } from "../../../../lib/character";

export function SavedCharactersTab({
  personagens,
  characterId,
  onLoad,
  onDelete,
}: {
  personagens: CharacterRecord[];
  characterId: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Section title={`Personagens salvos (${personagens.length})`}>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
        Lista global de diagnóstico (checkpoint v0.29) — mostra TODOS os personagens de TODAS as
        mesas/narradores, incluindo legados sem mesa. Carregar/Apagar aqui usa o caminho dev/anon
        (não passa pela sessão de perfil validada de /ficha). Nunca use esta aba como referência de
        produto — o jogador só vê o personagem ativo da própria sessão.
      </p>
      {personagens.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum personagem salvo ainda.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {personagens.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background: p.id === characterId ? "#26283280" : "#1d1e24",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>
                {p.id} · atualizado em {new Date(p.updated_at).toLocaleString("pt-BR")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onLoad(p.id)} style={buttonStyle}>
                Carregar
              </button>
              <button onClick={() => onDelete(p.id)} style={{ ...buttonStyle, color: "#ff6b6b" }}>
                Apagar
              </button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
