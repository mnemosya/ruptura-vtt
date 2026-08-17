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
        aria-label="Buscar capítulo"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, descrição ou tag…"
        className="rm-input rv-focusable"
        style={{ width: "100%", marginBottom: 16 }}
      />
      {filtrados.length === 0 ? (
        <p className="rm-empty" data-testid="livro-busca-vazia">Nenhum capítulo encontrado para “{busca}”.</p>
      ) : (
        // Superfície PLANA, não card: numa lista de leitura o destaque é
        // o texto do capítulo, não a moldura de cada entidade (hierarquia
        // visual não-uniforme da Fase 4/5).
        <div className="rm-doclist">
          {filtrados.map((c) => (
            <Link
              key={c.slug}
              href={`/mesas/${campaignId}/livro/${c.slug}`}
              data-testid={`livro-capitulo-${c.slug}`}
              className="rm-doclist-item rv-focusable"
            >
              <span className="rm-doclist-nome">{c.nome}</span>
              {c.descricaoCurta && <p className="rm-doclist-desc">{c.descricaoCurta}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
