"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftContentType } from "../../../../../lib/contentSchema/draftTypes";
import { slugify } from "../../../../../lib/contentSchema/slug";
import { criarRascunhoNovo } from "../../../../../lib/contentSchema/draftServerActions";
import { fieldGridStyle, inputStyle, labelStyle, primaryButtonStyle } from "../_shared/formStyles";

const TIPOS: { value: DraftContentType; label: string }[] = [
  { value: "spell", label: "Magia" },
  { value: "talent", label: "Talento" },
  { value: "item", label: "Item / Equipamento" },
];

export function NovoConteudoForm() {
  const router = useRouter();
  const [contentType, setContentType] = useState<DraftContentType>("spell");
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    setCriando(true);
    setErro(null);
    const resultado = await criarRascunhoNovo(contentType, nome, slug || undefined);
    setCriando(false);
    if (resultado.ok && resultado.draftId) {
      router.push(`/admin/biblioteca/rascunhos/${resultado.draftId}`);
    } else {
      setErro(resultado.erro ?? "Erro desconhecido ao criar rascunho.");
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Tipo de conteúdo
          <select data-testid="novo-conteudo-tipo" value={contentType} onChange={(e) => setContentType(e.target.value as DraftContentType)} style={inputStyle}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Nome
          <input
            data-testid="novo-conteudo-nome"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!slugEditadoManualmente) setSlug(slugify(e.target.value));
            }}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Slug
          <input
            data-testid="novo-conteudo-slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugEditadoManualmente(true);
            }}
            style={inputStyle}
          />
        </label>
      </div>

      {erro && <p style={{ color: "#e08a8a", fontSize: 13 }}>{erro}</p>}

      <button data-testid="novo-conteudo-criar" onClick={criar} disabled={criando || !nome.trim()} style={primaryButtonStyle}>
        {criando ? "Criando..." : "Criar rascunho"}
      </button>
    </div>
  );
}
