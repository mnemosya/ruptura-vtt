"use client";

import { useState } from "react";
import { exportarDocumentoUnico, exportarSelecao, type ItemSelecaoExportacao } from "../../../../lib/contentSchema/packageExport";
import type { ContentPackage } from "../../../../lib/contentSchema";

interface Props {
  tipos: { id: string; label: string }[];
  inicial?: { contentType: string; slug: string };
}

function baixarJson(pacote: ContentPackage, nomeArquivo: string) {
  const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportarClient({ tipos, inicial }: Props) {
  const [linhas, setLinhas] = useState<ItemSelecaoExportacao[]>([
    inicial ? { contentType: inicial.contentType as ItemSelecaoExportacao["contentType"], slug: inicial.slug } : { contentType: tipos[0]?.id as ItemSelecaoExportacao["contentType"], slug: "" },
  ]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ documentos: number; avisos: string[] } | null>(null);

  function atualizarLinha(indice: number, campo: "contentType" | "slug", valor: string) {
    setLinhas((atual) => atual.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  }

  function adicionarLinha() {
    setLinhas((atual) => [...atual, { contentType: tipos[0]?.id as ItemSelecaoExportacao["contentType"], slug: "" }]);
  }

  function removerLinha(indice: number) {
    setLinhas((atual) => atual.filter((_, i) => i !== indice));
  }

  async function gerar() {
    setErro(null);
    setResumo(null);
    const validas = linhas.filter((l) => l.slug.trim() !== "");
    if (validas.length === 0) {
      setErro("Informe ao menos um (tipo, slug) para exportar.");
      return;
    }
    setCarregando(true);
    try {
      const resultado = validas.length === 1 ? await exportarDocumentoUnico(validas[0].contentType, validas[0].slug.trim()) : await exportarSelecao(validas.map((l) => ({ contentType: l.contentType, slug: l.slug.trim() })));
      if (!resultado.ok || !resultado.pacote || !resultado.nomeArquivo) {
        setErro(resultado.erro ?? "Falha ao exportar.");
        return;
      }
      baixarJson(resultado.pacote, resultado.nomeArquivo);
      setResumo({ documentos: resultado.pacote.documentos.length, avisos: resultado.pacote.manifest.avisos });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div>
      <div style={{ border: "1px solid #26262e", borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginTop: 0 }}>Seleção (tipo + slug)</h3>
        {linhas.map((linha, indice) => (
          <div key={indice} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
            <select
              value={linha.contentType}
              onChange={(e) => atualizarLinha(indice, "contentType", e.target.value)}
              style={{ background: "#111116", color: "#e4e4ea", border: "1px solid #26262e", borderRadius: 6, padding: "6px 8px" }}
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              value={linha.slug}
              onChange={(e) => atualizarLinha(indice, "slug", e.target.value)}
              placeholder="slug"
              style={{ background: "#111116", color: "#e4e4ea", border: "1px solid #26262e", borderRadius: 6, padding: "6px 8px", flex: 1 }}
            />
            {linhas.length > 1 && (
              <button onClick={() => removerLinha(indice)} style={{ background: "none", border: "none", color: "#e08a8a", cursor: "pointer" }}>
                remover
              </button>
            )}
          </div>
        ))}
        <button onClick={adicionarLinha} style={{ fontSize: 13, color: "#8fd6a0", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}>
          + adicionar outro documento
        </button>
      </div>

      <button
        onClick={gerar}
        disabled={carregando}
        style={{ background: "#2a5a3a", color: "#e4e4ea", border: "1px solid #3d7a4f", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}
      >
        {carregando ? "Gerando..." : "Gerar JSON"}
      </button>

      {erro && (
        <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 8, background: "#2a1818", border: "1px solid #5c2626", fontSize: 13, color: "#e08a8a" }}>{erro}</div>
      )}
      {resumo && (
        <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 8, background: "#182a1e", border: "1px solid #26542f", fontSize: 13, color: "#8fd6a0" }}>
          Pacote gerado com {resumo.documentos} documento(s).
          {resumo.avisos.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {resumo.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
