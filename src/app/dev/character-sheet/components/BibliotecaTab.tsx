"use client";

import { useMemo, useState } from "react";
import { Section } from "./Section";
import {
  searchTechnicalContent,
  groupTechnicalContentByCategory,
  listTechnicalContentCategories,
  describeTechnicalContentEffects,
  type TechnicalContentItem,
} from "../../../../lib/content";

/**
 * Aba "Biblioteca" (checkpoint v0.53, PRD §0/2.1/4/8/11 — achado
 * "conteúdo pronto mas não exposto" da auditoria v0.50): consulta de
 * LEITURA para Propriedades, Runas e Escalpos — os três catálogos já
 * publicados na Biblioteca do Sistema (`content_documents`) mas sem
 * nenhuma UI até este checkpoint.
 *
 * Deliberadamente só CONSULTA: lista/busca/filtra/expande. NÃO cria
 * estado de personagem (nenhuma "runa instalada"/"escalpo equipado"),
 * NÃO implementa compra/instalação/ativação/remoção, NÃO automatiza
 * `payload_automacao` (mostrado só como resumo legível de leitura). O
 * modelo (Biblioteca) e a instância em jogo continuam completamente
 * separados — isso é escopo de checkpoint futuro.
 */

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
};

interface CatalogGroupProps {
  titulo: string;
  testIdPrefix: string;
  items: TechnicalContentItem[];
  catalogError: string | null;
}

function CatalogGroup({ titulo, testIdPrefix, items, catalogError }: CatalogGroupProps) {
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  const publicados = useMemo(() => items.filter((i) => i.status === "published"), [items]);
  const categorias = useMemo(() => listTechnicalContentCategories(publicados), [publicados]);
  const buscados = useMemo(() => searchTechnicalContent(publicados, busca), [publicados, busca]);
  const filtrados = useMemo(() => {
    if (!categoriaFiltro) return buscados;
    return buscados.filter((i) => (i.categoriaLabel ?? i.categoria ?? "Sem categoria") === categoriaFiltro);
  }, [buscados, categoriaFiltro]);
  const grupos = useMemo(() => groupTechnicalContentByCategory(filtrados), [filtrados]);

  function toggleExpandido(id: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (catalogError) {
    return (
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{titulo}</h3>
        <p style={{ fontSize: 13, color: "#ff6b6b", background: "#2a1717", borderRadius: 8, padding: "10px 12px" }}>
          Catálogo indisponível. Nenhuma lista local foi usada.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
          {titulo} ({publicados.length})
        </h3>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          data-testid={`${testIdPrefix}-busca`}
          type="text"
          placeholder="Buscar por nome, descrição ou tag…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        {categorias.length > 1 && (
          <select
            data-testid={`${testIdPrefix}-filtro-categoria`}
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            style={inputStyle}
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtrados.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum item encontrado{busca ? ` para "${busca}"` : ""}.</p>
      )}

      <div data-testid={`${testIdPrefix}-lista`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...grupos.entries()].map(([categoria, itensDoGrupo]) => (
          <div key={categoria}>
            {grupos.size > 1 && (
              <p style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.5, margin: "6px 0" }}>
                {categoria}
              </p>
            )}
            {itensDoGrupo.map((item) => {
              const aberto = expandido.has(item.id);
              const efeitos = describeTechnicalContentEffects(item);
              return (
                <div
                  key={item.id}
                  data-testid={`${testIdPrefix}-item-${item.slug}`}
                  style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}
                >
                  <button
                    data-testid={`${testIdPrefix}-expandir-${item.slug}`}
                    onClick={() => toggleExpandido(item.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "inherit",
                      cursor: "pointer",
                      padding: 0,
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{item.nome}</span>
                    {(item.raridadeLabel ?? item.raridade) && (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>{item.raridadeLabel ?? item.raridade}</span>
                    )}
                    {item.preco != null && <span style={{ fontSize: 11, opacity: 0.6 }}>{item.preco} Aretz</span>}
                    <span style={{ fontSize: 11, opacity: 0.4, marginLeft: "auto" }}>{aberto ? "▲ recolher" : "▼ detalhes"}</span>
                  </button>
                  {item.descricaoCurta ? (
                    <p style={{ fontSize: 12, opacity: 0.7, margin: "6px 0 0" }}>{item.descricaoCurta}</p>
                  ) : (
                    <p style={{ fontSize: 12, opacity: 0.4, margin: "6px 0 0", fontStyle: "italic" }}>Sem descrição cadastrada.</p>
                  )}

                  {aberto && (
                    <div style={{ marginTop: 10, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      {item.descricaoLonga && item.descricaoLonga !== item.descricaoCurta && (
                        <p style={{ opacity: 0.8, margin: 0 }}>{item.descricaoLonga}</p>
                      )}
                      {item.tags.length > 0 && (
                        <p style={{ opacity: 0.6, margin: 0 }}>Tags: {item.tags.join(", ")}</p>
                      )}
                      {item.requisitos != null &&
                        (Array.isArray(item.requisitos) ? item.requisitos.length > 0 : true) && (
                          <p style={{ opacity: 0.6, margin: 0 }}>
                            Requisitos: {Array.isArray(item.requisitos) ? item.requisitos.join(", ") || "—" : String(item.requisitos)}
                          </p>
                        )}
                      {efeitos.length > 0 && (
                        <div>
                          <p style={{ opacity: 0.6, margin: "0 0 2px" }}>Efeitos (payload_automacao, leitura):</p>
                          <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.75 }}>
                            {efeitos.map((linha, idx) => (
                              <li key={idx}>{linha}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <details style={{ opacity: 0.5 }}>
                        <summary style={{ cursor: "pointer", fontSize: 11 }}>Payload bruto (debug)</summary>
                        <pre style={{ fontSize: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {JSON.stringify(item.raw, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BibliotecaTab({
  properties,
  propertiesError,
  runes,
  runesError,
  escalpos,
  escalposError,
}: {
  properties: TechnicalContentItem[];
  propertiesError: string | null;
  runes: TechnicalContentItem[];
  runesError: string | null;
  escalpos: TechnicalContentItem[];
  escalposError: string | null;
}) {
  return (
    <Section title="Biblioteca (consulta técnica)">
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 20 }}>
        Catálogo de leitura da Biblioteca do Sistema — Propriedades, Runas e Escalpos. Estes são
        MODELOS de conteúdo administrável, não itens equipados/instalados no personagem: esta aba
        não altera a ficha, não permite comprar/instalar/ativar/remover nada, e não automatiza
        nenhum efeito. Serve só para consulta rápida durante a mesa.
      </p>

      <CatalogGroup titulo="Propriedades" testIdPrefix="biblioteca-propriedades" items={properties} catalogError={propertiesError} />
      <CatalogGroup titulo="Runas" testIdPrefix="biblioteca-runas" items={runes} catalogError={runesError} />
      <CatalogGroup titulo="Escalpos" testIdPrefix="biblioteca-escalpos" items={escalpos} catalogError={escalposError} />
    </Section>
  );
}
