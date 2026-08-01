"use client";

/**
 * Compêndio (somente leitura): abas por tipo de conteúdo, busca local e
 * detalhe expansível de cada verbete. A troca de tipo é NAVEGAÇÃO
 * (`?tipo=...`), não estado interno — assim o endereço da aba é
 * compartilhável e o servidor busca só a coleção pedida.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContentType } from "../../../lib/content/types";
import { PageHead, SectionHead } from "../_global/parts";
import { AlertTriangle, BookText, ChevronDown, RotateCw, Search } from "../../_design/icons";

export interface CompendioTipo { id: ContentType; label: string }

export interface CompendioEntry {
  id: string;
  slug: string;
  nome: string;
  categoria: string | null;
  subtipo: string | null;
  versao: string | null;
  resumo: string | null;
  tags: string[];
}

export default function CompendioClient({
  tipos,
  tipoAtual,
  entradas,
  errorInicial,
}: {
  tipos: CompendioTipo[];
  tipoAtual: ContentType;
  entradas: CompendioEntry[];
  errorInicial: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entradas;
    return entradas.filter(
      (e) =>
        e.nome.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q) ||
        (e.categoria ?? "").toLowerCase().includes(q) ||
        (e.subtipo ?? "").toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [entradas, search]);

  const tipoLabel = tipos.find((t) => t.id === tipoAtual)?.label ?? "Conteúdo";

  return (
    <div className="ra2-page ra2-view-enter">
      <PageHead eyebrow="SYS.RUPTURA // BIBLIOTECA DO SISTEMA" title="Compêndio" />

      <p className="ra-muted" style={{ maxWidth: 640, marginTop: -8 }}>
        Catálogo oficial publicado, somente leitura. O conteúdo próprio de cada mesa (homebrew e
        sobreposições) continua na Biblioteca dentro da campanha.
      </p>

      <nav className="ra-comp-typebar" aria-label="Tipos de conteúdo">
        {tipos.map((t) => (
          <Link
            key={t.id}
            href={`/mesas/compendio?tipo=${t.id}`}
            aria-current={t.id === tipoAtual ? "page" : undefined}
            className={`ra-comp-type${t.id === tipoAtual ? " ra-comp-type--active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="ra2-toolbar">
        <div className="ra2-toolbar-group">
          <div className="ra2-search">
            <span className="ra2-search-icon" aria-hidden="true"><Search size={13} strokeWidth={1.4} /></span>
            <label htmlFor="busca-compendio" className="sr-only">Buscar no compêndio</label>
            <input
              id="busca-compendio"
              data-testid="compendio-busca"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar em ${tipoLabel.toLowerCase()}…`}
            />
          </div>
        </div>
      </div>

      {errorInicial && (
        <div className="ra-state-box ra-state-box--error" role="alert">
          <div className="ra-state-icon"><AlertTriangle size={38} style={{ color: "#ff6a80" }} /></div>
          <h2 className="ra-h2" style={{ marginBottom: 8 }}>Falha ao carregar o compêndio</h2>
          <p className="ra-muted" style={{ marginBottom: 22 }}>{errorInicial}</p>
          <button type="button" className="ra-btn" style={{ margin: "0 auto" }} onClick={() => router.refresh()}>
            <RotateCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {!errorInicial && entradas.length === 0 && (
        <div className="ra-empty" data-testid="compendio-vazio">
          <div className="ra-empty-glyph"><BookText size={40} /></div>
          <h2 className="ra-empty-title">Nada publicado em {tipoLabel.toLowerCase()}</h2>
          <p className="ra-empty-text">
            Esta coleção ainda não tem documentos publicados na Biblioteca do Sistema.
          </p>
        </div>
      )}

      {!errorInicial && entradas.length > 0 && (
        <>
          <SectionHead title={tipoLabel} count={filtradas.length} unit="VERBETE" />
          {filtradas.length === 0 ? (
            <div className="ra-state-box">
              <div className="ra-state-icon"><Search size={36} style={{ color: "rgba(0,212,255,.5)" }} /></div>
              <h2 className="ra-h2" style={{ marginBottom: 8 }}>Nenhum verbete encontrado</h2>
              <p className="ra-muted">Nada corresponde a “{search.trim()}” nesta coleção.</p>
            </div>
          ) : (
            <div className="ra-comp-list" data-testid="compendio-lista" style={{ paddingTop: 16 }}>
              {filtradas.map((e) => {
                const isOpen = aberto === e.id;
                return (
                  <div key={e.id}>
                    <button
                      type="button"
                      className="ra-comp-row"
                      style={{ width: "100%", textAlign: "left" }}
                      aria-expanded={isOpen}
                      onClick={() => setAberto(isOpen ? null : e.id)}
                    >
                      <span className="ra-comp-name" title={e.nome}>{e.nome}</span>
                      {e.categoria && <span className="ra-tag ra-tag--cyan">{e.categoria}</span>}
                      {e.subtipo && <span className="ra-tag ra-tag--muted">{e.subtipo}</span>}
                      <span className="ra-comp-slug">{e.slug}</span>
                      <ChevronDown size={14} className={`ra2-chevron${isOpen ? " ra2-chevron--up" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="ra-module" style={{ margin: "6px 0 10px" }}>
                        <p className="ra-muted" style={{ margin: 0 }}>
                          {e.resumo ?? "Este verbete não traz um resumo textual no payload publicado."}
                        </p>
                        {e.tags.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                            {e.tags.map((t) => <span key={t} className="ra-tag ra-tag--muted">{t}</span>)}
                          </div>
                        )}
                        <div className="ra-hint" style={{ marginTop: 12 }}>
                          slug: {e.slug}{e.versao ? ` · versão ${e.versao}` : ""}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
