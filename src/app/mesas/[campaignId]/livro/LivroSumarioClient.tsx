"use client";

import { useState } from "react";
import Link from "next/link";

export interface CapituloResumo {
  slug: string;
  nome: string;
  descricaoCurta?: string;
  categoria?: string;
  tags: string[];
}

export function LivroSumarioClient({ campaignId, capitulos }: { campaignId: string; capitulos: CapituloResumo[] }) {
  const [busca, setBusca] = useState("");

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? capitulos.filter(
        (c) =>
          c.nome.toLowerCase().includes(termo) ||
          (c.descricaoCurta ?? "").toLowerCase().includes(termo) ||
          c.tags.some((t) => t.toLowerCase().includes(termo)),
      )
    : capitulos;

  return (
    <div>
      <input
        data-testid="livro-busca"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, descrição ou tag…"
        style={{
          width: "100%",
          background: "#0f1014",
          color: "inherit",
          border: "1px solid #333",
          borderRadius: 6,
          padding: "8px 12px",
          fontSize: 13,
          marginBottom: 16,
        }}
      />
      {filtrados.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum capítulo encontrado para "{busca}".</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrados.map((c) => (
            <Link
              key={c.slug}
              href={`/mesas/${campaignId}/livro/${c.slug}`}
              data-testid={`livro-capitulo-${c.slug}`}
              style={{
                display: "block",
                background: "#1d1e24",
                borderRadius: 8,
                padding: "12px 16px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <strong style={{ fontSize: 15 }}>{c.nome}</strong>
              {c.descricaoCurta && <p style={{ fontSize: 12, opacity: 0.7, margin: "4px 0 0" }}>{c.descricaoCurta}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
