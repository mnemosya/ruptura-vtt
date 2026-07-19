"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { arquivarConteudo } from "../../../../../lib/contentSchema/publishServerActions";
import { buttonStyle, dangerTextStyle, inputStyle } from "../../rascunhos/_shared/formStyles";

/** Ação de arquivar conteúdo publicado (Etapa 5). Motivo obrigatório; confirmação explícita. */
export function ArchiveBar({ documentId, nome }: { documentId: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [arquivando, setArquivando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!window.confirm(`Arquivar "${nome}"? Deixa de aparecer no jogo e em novas aquisições. Instâncias existentes não são afetadas. Nada é apagado.`)) return;
    setArquivando(true);
    setErro(null);
    const r = await arquivarConteudo(documentId, motivo);
    setArquivando(false);
    if (r.ok) {
      router.refresh();
      setAberto(false);
      return;
    }
    setErro(r.erro ?? "Falha ao arquivar.");
  }

  return (
    <div style={{ marginTop: 8 }}>
      {!aberto ? (
        <button data-testid="arquivar-abrir" onClick={() => setAberto(true)} style={{ ...buttonStyle, color: "#e0a06b" }}>
          Arquivar
        </button>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#a8a8b3" }}>
            Motivo do arquivamento (obrigatório)
            <input data-testid="arquivar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, minWidth: 280 }} />
          </label>
          <button
            data-testid="arquivar-confirmar"
            onClick={confirmar}
            disabled={arquivando || motivo.trim() === ""}
            style={{ ...buttonStyle, color: "#e0a06b", opacity: motivo.trim() === "" ? 0.5 : 1 }}
          >
            {arquivando ? "Arquivando..." : "Confirmar arquivamento"}
          </button>
          <button onClick={() => setAberto(false)} style={buttonStyle}>
            Cancelar
          </button>
        </div>
      )}
      {erro && <p style={dangerTextStyle}>{erro}</p>}
    </div>
  );
}
