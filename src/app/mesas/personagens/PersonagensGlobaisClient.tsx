"use client";

/**
 * Índice pessoal de personagens (área autenticada global): busca, filtro
 * por papel na campanha de origem e atalho direto para a ficha real
 * (/ficha?campaignId&characterId).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead, RoleBadge, SectionHead, relativeTime } from "../_global/parts";
import { AlertTriangle, RotateCw, Search, User, Users } from "../../_design/icons";

export interface PersonagemGlobal {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  role: "narrator" | "player";
  ownerLabel: string | null;
  updatedAt: string;
}

type Filter = "all" | "narrator" | "player";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "narrator", label: "Narro" },
  { id: "player", label: "Jogo" },
];

export default function PersonagensGlobaisClient({
  personagens,
  errorInicial,
}: {
  personagens: PersonagemGlobal[];
  errorInicial: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return personagens.filter((p) => {
      const roleOk = filter === "all" || p.role === filter;
      return roleOk && (!q || p.name.toLowerCase().includes(q) || p.campaignName.toLowerCase().includes(q));
    });
  }, [personagens, filter, search]);

  return (
    <div className="ra2-page ra2-view-enter">
      <PageHead eyebrow="SYS.RUPTURA // REGISTRO DE REFRATÁRIOS" title="Personagens" />

      <div className="ra2-toolbar">
        <div className="ra2-toolbar-group">
          <div className="ra2-search">
            <span className="ra2-search-icon" aria-hidden="true"><Search size={13} strokeWidth={1.4} /></span>
            <label htmlFor="busca-personagens" className="sr-only">Buscar personagens</label>
            <input
              id="busca-personagens"
              data-testid="personagens-busca"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por personagem ou campanha…"
            />
          </div>

          <div className="ra2-segmented" role="tablist" aria-label="Filtrar por papel na campanha">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`ra2-seg${filter === f.id ? " ra2-seg--active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {errorInicial && (
        <div className="ra-state-box ra-state-box--error" role="alert">
          <div className="ra-state-icon"><AlertTriangle size={38} style={{ color: "#ff6a80" }} /></div>
          <h2 className="ra-h2" style={{ marginBottom: 8 }}>Falha ao carregar personagens</h2>
          <p className="ra-muted" style={{ marginBottom: 22 }}>{errorInicial}</p>
          <button type="button" className="ra-btn" style={{ margin: "0 auto" }} onClick={() => router.refresh()}>
            <RotateCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {!errorInicial && personagens.length === 0 && (
        <div className="ra-empty" data-testid="personagens-vazio">
          <div className="ra-empty-glyph"><Users size={40} /></div>
          <h2 className="ra-empty-title">Nenhum personagem ainda</h2>
          <p className="ra-empty-text">
            Personagens são criados dentro de uma campanha. Entre em uma das suas campanhas e use
            Personagens → Criar personagem.
          </p>
          <div className="ra-empty-actions">
            <Link href="/mesas" className="ra-btn">Ir para Minhas Campanhas</Link>
          </div>
        </div>
      )}

      {!errorInicial && personagens.length > 0 && (
        <>
          <SectionHead title="Fichas ao seu alcance" count={filtrados.length} unit="FICHA" />
          {filtrados.length === 0 ? (
            <div className="ra-state-box">
              <div className="ra-state-icon"><Search size={36} style={{ color: "rgba(0,212,255,.5)" }} /></div>
              <h2 className="ra-h2" style={{ marginBottom: 8 }}>Nenhum personagem encontrado</h2>
              <p className="ra-muted">Ajuste a busca ou o filtro de papel.</p>
            </div>
          ) : (
            <div className="ra-char-grid" data-testid="personagens-lista" style={{ paddingTop: 16 }}>
              {filtrados.map((p, i) => (
                <Link
                  key={`${p.campaignId}:${p.id}`}
                  href={`/ficha?campaignId=${p.campaignId}&characterId=${p.id}`}
                  className="ra-charcard"
                  data-testid="personagem-item"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className="ra-char-portrait" aria-hidden="true"><User size={26} strokeWidth={1.2} /></span>
                  <span className="ra-char-body">
                    <span className="ra-char-name" title={p.name}>{p.name}</span>
                    <span className="ra-char-sub" title={p.campaignName}>{p.campaignName}</span>
                    <span className="ra-char-tags">
                      <RoleBadge role={p.role} />
                      {p.ownerLabel && <span className="ra-tag ra-tag--muted">{p.ownerLabel}</span>}
                    </span>
                    <span className="ra-char-sub" style={{ fontSize: 11 }}>
                      atualizado {relativeTime(p.updatedAt)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
