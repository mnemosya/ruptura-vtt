"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftContentType } from "../../../../../lib/contentSchema/draftTypes";
import { slugDuplicadoSugerido, slugify } from "../../../../../lib/contentSchema/slug";
import { criarRascunhoDeEdicao, duplicarConteudo } from "../../../../../lib/contentSchema/draftServerActions";
import { buttonStyle, inputStyle, primaryButtonStyle } from "../../rascunhos/_shared/formStyles";

/** Ações de rascunho no detalhe de conteúdo publicado (Etapa 3) — só para os 3 content_types do MVP. */
export function DraftActionsBar({ contentType, slug, nomeAtual }: { contentType: DraftContentType; slug: string; nomeAtual: string }) {
  const router = useRouter();
  const [criandoEdicao, setCriandoEdicao] = useState(false);
  const [mostrarDuplicar, setMostrarDuplicar] = useState(false);
  const [novoNome, setNovoNome] = useState(`${nomeAtual} (cópia)`);
  const [novoSlug, setNovoSlug] = useState(slugDuplicadoSugerido(slug));
  const [duplicando, setDuplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criarEdicao() {
    setCriandoEdicao(true);
    setErro(null);
    const resultado = await criarRascunhoDeEdicao(contentType, slug);
    setCriandoEdicao(false);
    if (resultado.ok && resultado.draftId) router.push(`/admin/biblioteca/rascunhos/${resultado.draftId}`);
    else setErro(resultado.erro ?? "Erro ao criar rascunho de edição.");
  }

  async function duplicar() {
    setDuplicando(true);
    setErro(null);
    const resultado = await duplicarConteudo(contentType, { tipo: "publicado", slug }, novoNome, novoSlug);
    setDuplicando(false);
    if (resultado.ok && resultado.draftId) router.push(`/admin/biblioteca/rascunhos/${resultado.draftId}`);
    else setErro(resultado.erro ?? "Erro ao duplicar.");
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={criarEdicao} disabled={criandoEdicao} style={primaryButtonStyle}>
          {criandoEdicao ? "Abrindo..." : "Criar rascunho de edição"}
        </button>
        <button onClick={() => setMostrarDuplicar((v) => !v)} style={buttonStyle}>
          Duplicar
        </button>
      </div>

      {mostrarDuplicar && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#a8a8b3" }}>
            Nome da cópia
            <input
              value={novoNome}
              onChange={(e) => {
                setNovoNome(e.target.value);
                setNovoSlug(slugDuplicadoSugerido(slugify(e.target.value)));
              }}
              style={{ ...inputStyle, minWidth: 220 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#a8a8b3" }}>
            Novo slug (obrigatório, diferente do original)
            <input value={novoSlug} onChange={(e) => setNovoSlug(e.target.value.toLowerCase())} style={{ ...inputStyle, minWidth: 220 }} />
          </label>
          <button onClick={duplicar} disabled={duplicando} style={primaryButtonStyle}>
            {duplicando ? "Duplicando..." : "Confirmar duplicação"}
          </button>
        </div>
      )}

      {erro && <p style={{ color: "#e08a8a", fontSize: 13, marginTop: 8 }}>{erro}</p>}
    </div>
  );
}
