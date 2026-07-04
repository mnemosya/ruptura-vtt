"use client";

import { useMemo, useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import {
  searchTechnicalContent,
  groupTechnicalContentByCategory,
  listTechnicalContentCategories,
  describeTechnicalContentEffects,
  type TechnicalContentItem,
} from "../../../../lib/content";
import type { InstalledEscalpo } from "../../../../lib/character";

/**
 * Aba "Biblioteca" (checkpoint v0.53, PRD §0/2.1/4/8/11 — achado
 * "conteúdo pronto mas não exposto" da auditoria v0.50; instalação
 * passiva de Escalpos no v0.54, fase 1 do checkpoint seguinte):
 * consulta de LEITURA para Propriedades, Runas e Escalpos, mais a
 * instância passiva de Escalpos instalados no personagem.
 *
 * Propriedades/Runas continuam só CONSULTA (lista/busca/filtra/
 * expande, sem instância). Escalpos ganham "Instalar"/"Remover" —
 * ainda assim só uma REFERÊNCIA ao modelo por slug em
 * `character.escalpos_instalados`, sem nenhum efeito mecânico (isso
 * fica para a Fase 2 deste checkpoint, se o payload permitir com
 * segurança). Runas em item ficaram de fora deste checkpoint (Caso B
 * — `InventoryItemInstance` ainda não tem um conceito de "slot"
 * validável, ver relatório).
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
  /** Só passado para Escalpos (checkpoint v0.54) — instalar é uma referência passiva, sem efeito mecânico. */
  onInstall?: (contentId: string) => void;
}

function CatalogGroup({ titulo, testIdPrefix, items, catalogError, onInstall }: CatalogGroupProps) {
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
                      {onInstall && (
                        <button
                          data-testid={`${testIdPrefix}-instalar-${item.slug}`}
                          onClick={() => onInstall(item.slug)}
                          style={{ ...buttonStyle, fontSize: 11, padding: "4px 10px", alignSelf: "flex-start" }}
                        >
                          Instalar
                        </button>
                      )}
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

function InstalledEscalpos({
  installed,
  escalpos,
  onRemove,
  hasAutomatedEffect,
}: {
  installed: InstalledEscalpo[];
  escalpos: TechnicalContentItem[];
  onRemove: (instanceId: string) => void;
  /** true se essa instância gerou pelo menos 1 ActiveEffect (checkpoint v0.55, fase 2) — ver `deriveInstalledTechnicalEffects`. */
  hasAutomatedEffect: (instanceId: string) => boolean;
}) {
  const bySlug = useMemo(() => new Map(escalpos.map((e) => [e.slug, e])), [escalpos]);

  if (installed.length === 0) {
    return <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>Nenhum escalpo instalado ainda.</p>;
  }

  return (
    <div data-testid="escalpos-instalados-lista" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
      {installed.map((instancia) => {
        const modelo = bySlug.get(instancia.contentId);
        return (
          <div
            key={instancia.id}
            data-testid={`escalpo-instalado-${instancia.id}`}
            style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px", borderLeft: "3px solid #4caf50" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                {instancia.nomeCustomizado || modelo?.nome || instancia.contentId}
              </span>
              {(modelo?.categoriaLabel ?? modelo?.categoria) && (
                <span style={{ fontSize: 11, opacity: 0.6 }}>{modelo?.categoriaLabel ?? modelo?.categoria}</span>
              )}
              <button
                data-testid={`escalpo-instalado-remover-${instancia.id}`}
                onClick={() => onRemove(instancia.id)}
                style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px", marginLeft: "auto" }}
              >
                Remover
              </button>
            </div>
            {modelo ? (
              <p style={{ fontSize: 12, opacity: 0.7, margin: "6px 0 0" }}>{modelo.descricaoCurta ?? "Sem descrição cadastrada."}</p>
            ) : (
              <p style={{ fontSize: 12, opacity: 0.5, margin: "6px 0 0", fontStyle: "italic" }}>
                Modelo "{instancia.contentId}" não encontrado na Biblioteca (removido/despublicado?).
              </p>
            )}
            {instancia.notas && <p style={{ fontSize: 12, opacity: 0.6, margin: "4px 0 0" }}>Notas: {instancia.notas}</p>}
            <p style={{ fontSize: 11, opacity: 0.4, margin: "6px 0 0" }}>
              {hasAutomatedEffect(instancia.id)
                ? "Modificador passivo aplicado automaticamente — ver chip na ficha/Rolagens."
                : "Sem modificador passivo automatizável neste registro (efeitos, se houver, são só leitura)."}
            </p>
          </div>
        );
      })}
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
  escalposInstalados,
  onInstallEscalpo,
  onRemoveEscalpo,
  installedEscalpoIdsWithEffect,
}: {
  properties: TechnicalContentItem[];
  propertiesError: string | null;
  runes: TechnicalContentItem[];
  runesError: string | null;
  escalpos: TechnicalContentItem[];
  escalposError: string | null;
  escalposInstalados: InstalledEscalpo[];
  onInstallEscalpo: (contentId: string) => void;
  onRemoveEscalpo: (instanceId: string) => void;
  /** instanceIds com pelo menos 1 ActiveEffect derivado (checkpoint v0.55, fase 2) — ver `deriveInstalledTechnicalEffects`. */
  installedEscalpoIdsWithEffect: Set<string>;
}) {
  return (
    <Section title="Biblioteca (consulta técnica)">
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 20 }}>
        Catálogo de leitura da Biblioteca do Sistema — Propriedades, Runas e Escalpos. Estes são
        MODELOS de conteúdo administrável. Escalpos podem ser instalados no personagem (referência
        ao modelo); modificadores passivos claramente estruturados no payload são aplicados
        automaticamente (chip na ficha/Rolagens) — o restante do payload continua só leitura, nunca
        ativação/dano/cadência. Propriedades e Runas continuam só consulta — instalar Runas em item
        ficou pendente (ver relatório do checkpoint). Esta aba nunca compra nada sozinha.
      </p>

      <CatalogGroup titulo="Propriedades" testIdPrefix="biblioteca-propriedades" items={properties} catalogError={propertiesError} />
      <CatalogGroup titulo="Runas" testIdPrefix="biblioteca-runas" items={runes} catalogError={runesError} />

      <div style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          Escalpos instalados ({escalposInstalados.length})
        </h3>
        <InstalledEscalpos
          installed={escalposInstalados}
          escalpos={escalpos}
          onRemove={onRemoveEscalpo}
          hasAutomatedEffect={(instanceId) => installedEscalpoIdsWithEffect.has(instanceId)}
        />
      </div>

      <CatalogGroup
        titulo="Escalpos (catálogo)"
        testIdPrefix="biblioteca-escalpos"
        items={escalpos}
        catalogError={escalposError}
        onInstall={onInstallEscalpo}
      />
    </Section>
  );
}
