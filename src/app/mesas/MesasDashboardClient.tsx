"use client";

/**
 * "Minhas Campanhas" (aditivo §4.2) — lista TODAS as campanhas da
 * conta autenticada, narradora em algumas e jogadora em outras, com a
 * ação principal certa para cada papel.
 *
 * "Criar campanha" continua vivendo nesta mesma página; no redesign ela
 * virou um modal HUD, aberto pelo botão da barra de ferramentas ou pelo
 * item do menu de perfil (que chega como `?novo=1`). O formulário tem
 * só o campo que a criação real aceita hoje (`createCampaign(name)`) —
 * o protótipo trazia ainda descrição, capa e cor de acento, que não
 * existem no banco e por isso não foram fingidos aqui.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createCampaign } from "../../lib/table/storage";
import type { Campaign } from "../../lib/table";
import { usePushToast } from "./_global/GlobalShell";
import {
  DecoBottom, DecoTop, PageHead, RoleBadge, SectionHead, campaignCoverStyle, relativeTime,
} from "./_global/parts";
import {
  Activity, AlertTriangle, ChevronRight, Clock, Plus, RotateCw, ScrollText, Search, Spinner, User, Users, X,
} from "../_design/icons";

export interface CampaignCardData {
  campaign: Campaign;
  role: "narrator" | "player";
  /** Só relevante para role="player" — quantos personagens a conta controla nesta campanha. null para narrador (não se aplica). */
  controlledCharacterCount: number | null;
  /** Participantes ativos. null quando a RLS não permite contar (conta só jogadora). */
  memberCount: number | null;
  /** Personagens visíveis para esta conta nesta campanha. */
  characterCount: number;
  /** Participantes com nome de exibição — só chega preenchido para o narrador. */
  people: { userId: string; name: string }[];
}

type Filter = "all" | "narrator" | "player";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "narrator", label: "Narrador" },
  { id: "player", label: "Jogador" },
];

export default function MesasDashboardClient({
  campanhasIniciais,
  errorInicial,
  currentUserName,
}: {
  campanhasIniciais: CampaignCardData[];
  errorInicial: string | null;
  currentUserName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pushToast = usePushToast();

  const [campanhas, setCampanhas] = useState<CampaignCardData[]>(campanhasIniciais);
  const [error, setError] = useState<string | null>(errorInicial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { setCampanhas(campanhasIniciais); }, [campanhasIniciais]);

  // O item "Criar campanha" do menu de perfil chega como ?novo=1.
  useEffect(() => {
    if (searchParams.get("novo") === "1") setCreateOpen(true);
  }, [searchParams]);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    if (searchParams.get("novo") === "1") router.replace("/mesas");
  }, [router, searchParams]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campanhas.filter(({ campaign, role }) => {
      const roleOk = filter === "all" || role === filter;
      return roleOk && (!q || campaign.name.toLowerCase().includes(q));
    });
  }, [campanhas, filter, search]);

  const [destaque, ...resto] = filtradas;

  function handleCreated(data: CampaignCardData) {
    setCampanhas((prev) => [data, ...prev]);
    setCreateOpen(false);
    if (searchParams.get("novo") === "1") router.replace("/mesas");
    pushToast("success", `Campanha "${data.campaign.name}" criada.`);
    router.refresh();
  }

  return (
    <div className="ra2-page-bg-wrap">
      <div className="ra2-page-bg" aria-hidden="true">
        <div className="ra2-page-bg-img" />
        <div className="ra2-page-bg-tint" />
        <div className="ra2-page-bg-grad" />
        <div className="ra2-page-bg-mask" />
      </div>
      <div className="ra2-page ra2-view-enter" style={{ position: "relative", zIndex: 1 }}>
        <PageHead eyebrow="SYS.RUPTURA // ÁREA DE OPERAÇÕES" title="Minhas Campanhas" />

      <div className="ra2-toolbar">
        <div className="ra2-toolbar-group">
          <div className="ra2-search">
            <span className="ra2-search-icon" aria-hidden="true"><Search size={13} strokeWidth={1.4} /></span>
            <label htmlFor="busca-campanhas" className="sr-only">Buscar campanhas</label>
            <input
              id="busca-campanhas"
              data-testid="dash-busca"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar campanhas por nome…"
            />
          </div>

          <div className="ra2-segmented" role="tablist" aria-label="Filtrar por papel">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                data-testid={`dash-filtro-${f.id}`}
                onClick={() => setFilter(f.id)}
                className={`ra2-seg${filter === f.id ? " ra2-seg--active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="ra2-secondary"
          data-testid="dash-abrir-criar-mesa"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={16} strokeWidth={1.4} /> Criar campanha
        </button>
      </div>

      {error && (
        <div className="ra-state-box ra-state-box--error" role="alert" data-testid="dash-erro">
          <div className="ra-state-icon"><AlertTriangle size={38} style={{ color: "#ff6a80" }} /></div>
          <h2 className="ra-h2" style={{ marginBottom: 8 }}>Falha ao carregar campanhas</h2>
          <p className="ra-muted" style={{ marginBottom: 22 }}>{error}</p>
          <button
            type="button"
            className="ra-btn"
            style={{ margin: "0 auto" }}
            onClick={() => { setError(null); router.refresh(); }}
          >
            <RotateCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {!error && campanhas.length === 0 && (
        <div className="ra-empty" data-testid="dash-vazio">
          <div className="ra-empty-glyph"><ScrollText size={40} /></div>
          <h2 className="ra-empty-title">Você ainda não participa de nenhuma campanha</h2>
          <p className="ra-empty-text">
            Crie uma campanha para começar a narrar seu próprio mundo, ou entre por um convite
            enviado pelo narrador de uma mesa.
          </p>
          <div className="ra-empty-actions">
            <button type="button" className="ra-btn ra-btn--amber" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> Criar campanha
            </button>
          </div>
        </div>
      )}

      {!error && campanhas.length > 0 && filtradas.length === 0 && (
        <div className="ra-state-box" data-testid="dash-sem-resultado">
          <div className="ra-state-icon"><Search size={36} style={{ color: "rgba(0,212,255,.5)" }} /></div>
          <h2 className="ra-h2" style={{ marginBottom: 8 }}>Nenhuma campanha encontrada</h2>
          <p className="ra-muted">
            Nada corresponde{search.trim() ? <> a <strong style={{ color: "#cfeaf6" }}>“{search.trim()}”</strong></> : null}
            {filter !== "all" ? " com esse filtro" : ""}.
          </p>
        </div>
      )}

      {!error && filtradas.length > 0 && (
        <div className="ra2-home-cols">
          <div className="ra2-col">
            {destaque && <FeaturedCampaign data={destaque} />}
            {resto.length > 0 && (
              <>
                <SectionHead title="Todas as campanhas" count={resto.length} />
                <div className="ra2-grid" data-testid="dash-mesas-lista">
                  {resto.map((item, i) => <CampaignCard key={item.campaign.id} data={item} index={i} />)}
                </div>
              </>
            )}
          </div>

          <aside className="ra2-side" aria-label="Painel lateral">
            <ActivityPanel campanhas={campanhas} />
            <NetworkPanel campanhas={campanhas} currentUserName={currentUserName} />
          </aside>
        </div>
      )}

      {createOpen && <CreateCampaignModal onClose={closeCreate} onCreated={handleCreated} />}
      </div>
    </div>
  );
}

// ── Destaque ────────────────────────────────────────────────────────
function FeaturedCampaign({ data }: { data: CampaignCardData }) {
  const { campaign, role, memberCount, characterCount } = data;
  return (
    <section className="ra2-featured" aria-label="Campanha em destaque" data-testid="dash-mesa-destaque">
      <DecoTop />
      <div className="ra2-cover" style={campaignCoverStyle(campaign.id)} aria-hidden="true" />
      <div className="ra2-featured-scrim" aria-hidden="true" />
      <div className="ra2-featured-edge ra2-featured-edge--l" aria-hidden="true" />
      <div className="ra2-featured-edge ra2-featured-edge--r" aria-hidden="true" />

      <div className="ra2-featured-body">
        <RoleBadge role={role} style={{ position: "absolute", right: 29, top: 40 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="ra-eyebrow">
              CENA {campaign.current_scene} // RODADA {campaign.current_round}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <h2 className="ra2-featured-title">{campaign.name}</h2>
              {memberCount !== null && (
                <span className="ra2-count-chip">
                  <User size={12} strokeWidth={1.5} />
                  {memberCount}<em>&nbsp;na mesa</em>
                </span>
              )}
            </div>
          </div>
          <p className="ra2-featured-desc">
            {characterCount > 0
              ? `${characterCount} personagem${characterCount === 1 ? "" : "s"} ${role === "narrator" ? "na campanha" : "sob seu controle"} · atividade ${relativeTime(campaign.updated_at)}.`
              : `Nenhum personagem ${role === "narrator" ? "criado" : "sob seu controle"} ainda · atividade ${relativeTime(campaign.updated_at)}.`}
          </p>
        </div>

        <div style={{ maxWidth: 280, marginTop: "auto" }}>
          <Link
            href={`/mesas/${campaign.id}`}
            data-testid={`dash-abrir-${campaign.id}`}
            className="ra2-primary ra2-btn-block"
            aria-label={`${role === "narrator" ? "Entrar na" : "Abrir"} campanha ${campaign.name}`}
          >
            <ChevronRight size={16} strokeWidth={1.4} />
            {role === "narrator" ? "Entrar na campanha" : "Abrir campanha"}
          </Link>
        </div>
      </div>

      <DecoBottom />
      <div className="ra2-featured-frame" aria-hidden="true" />
      <div className="ra2-featured-glow" aria-hidden="true" />
    </section>
  );
}

// ── Card ────────────────────────────────────────────────────────────
function CampaignCard({ data, index }: { data: CampaignCardData; index: number }) {
  const { campaign, role } = data;
  return (
    <div className="ra2-card" style={{ animationDelay: `${index * 60}ms` }} data-testid="dash-mesa-item">
      <div className="ra2-card-inner">
        <div className="ra2-cover" style={campaignCoverStyle(campaign.id)} aria-hidden="true" />
        <div className="ra2-card-scrim" aria-hidden="true" />
        <RoleBadge role={role} style={{ position: "absolute", left: 19, top: 19, zIndex: 2 }} />
        <div className="ra2-card-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h3 className="ra2-card-title" title={campaign.name}>{campaign.name}</h3>
            <span className="ra2-card-meta">
              <Clock size={10} strokeWidth={1.4} />
              {relativeTime(campaign.updated_at)}
            </span>
          </div>
          <Link
            href={`/mesas/${campaign.id}`}
            data-testid={`dash-abrir-${campaign.id}`}
            className="ra2-primary ra2-btn-block"
            aria-label={`${role === "narrator" ? "Entrar na" : "Abrir"} campanha ${campaign.name}`}
          >
            <ChevronRight size={16} strokeWidth={1.4} />
            {role === "narrator" ? "Entrar na campanha" : "Abrir campanha"}
          </Link>
        </div>
      </div>
      <DecoBottom />
    </div>
  );
}

// ── Painéis laterais ────────────────────────────────────────────────
function ActivityPanel({ campanhas }: { campanhas: CampaignCardData[] }) {
  const rows = useMemo(
    () => [...campanhas]
      .sort((a, b) => (b.campaign.updated_at ?? "").localeCompare(a.campaign.updated_at ?? ""))
      .slice(0, 4),
    [campanhas],
  );

  return (
    <div className="ra2-panel">
      <div className="ra2-panel-title">
        <Activity size={12} strokeWidth={1.4} /> Atividade recente
      </div>
      {rows.length === 0 ? (
        <p className="ra-muted" style={{ fontSize: 12.5 }}>Nenhuma atividade recente.</p>
      ) : (
        <div className="ra2-panel-list">
          {rows.map((row, i) => (
            <div key={row.campaign.id}>
              {i > 0 && <div className="ra2-panel-sep" aria-hidden="true" />}
              <div className="ra2-panel-row">
                <span style={{ paddingTop: 6 }}><span className="ra-diamond" aria-hidden="true" /></span>
                <div className="ra2-panel-row-main">
                  <strong title={row.campaign.name}>{row.campaign.name}</strong>
                  <span>{relativeTime(row.campaign.updated_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <DecoBottom />
    </div>
  );
}

function NetworkPanel({ campanhas, currentUserName }: { campanhas: CampaignCardData[]; currentUserName: string }) {
  const people = useMemo(() => {
    const map = new Map<string, string>();
    campanhas.forEach((c) => c.people.forEach((p) => map.set(p.userId, p.name)));
    return Array.from(map.entries()).map(([userId, name]) => ({ userId, name }));
  }, [campanhas]);

  const somenteJogador = campanhas.length > 0 && campanhas.every((c) => c.role === "player");

  return (
    <div className="ra2-panel">
      <div className="ra2-panel-title">
        <Users size={12} strokeWidth={1.4} /> Rede
      </div>
      <div className="ra2-people">
        <div className="ra2-person">
          <span className="ra2-person-avatar" aria-hidden="true"><User size={14} strokeWidth={1.3} /></span>
          <div className="ra2-person-main">
            <span className="ra2-person-name">{currentUserName}</span>
            <span className="ra-online">
              <span className="ra-online-dot" aria-hidden="true" />
              <span className="ra-online-txt">Você</span>
            </span>
          </div>
        </div>

        {people.map((p) => (
          <div key={p.userId} className="ra2-person ra2-person--off">
            <span className="ra2-person-avatar" aria-hidden="true"><User size={14} strokeWidth={1.3} /></span>
            <div className="ra2-person-main">
              <span className="ra2-person-name">{p.name}</span>
            </div>
          </div>
        ))}
      </div>

      {people.length === 0 && (
        <p className="ra-hint">
          {somenteJogador
            ? "A lista de participantes de uma mesa só é visível para quem a narra."
            : "Convide jogadores em Jogadores e convites, dentro de cada campanha."}
        </p>
      )}
      <DecoBottom />
    </div>
  );
}

// ── Modal de criação ────────────────────────────────────────────────
function CreateCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (data: CampaignCardData) => void;
}) {
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handleCreate() {
    const trimmed = nome.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setErro(null);
    try {
      const campaign = await createCampaign(trimmed);
      onCreated({
        campaign,
        role: "narrator",
        controlledCharacterCount: null,
        memberCount: 1,
        characterCount: 0,
        people: [],
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar campanha.");
      setBusy(false);
    }
  }

  return (
    <div className="ra-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="ra-modal" role="dialog" aria-modal="true" aria-labelledby="criar-campanha-titulo">
        <button type="button" className="ra-iconbtn ra-modal-close" onClick={onClose} disabled={busy} aria-label="Fechar">
          <X size={16} />
        </button>

        <div className="ra-eyebrow" style={{ marginBottom: 8 }}>SYS.FORGE // NOVA CAMPANHA</div>
        <h2 id="criar-campanha-titulo" className="ra-h2" style={{ fontSize: 20, marginBottom: 22 }}>
          Criar campanha
        </h2>

        <div className="ra-field" style={{ marginBottom: 14 }}>
          <label className="ra-flabel" htmlFor="nova-campanha-nome">Nome da campanha</label>
          <input
            id="nova-campanha-nome"
            data-testid="dash-nova-mesa"
            className="ra-input"
            value={nome}
            autoFocus
            maxLength={120}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="Ex.: Ecos de Vosek"
          />
          <span className="ra-hint">
            Você entra como narrador. Descrição, capa e demais metadados ainda não existem no banco — quando
            existirem, entram aqui.
          </span>
        </div>

        {erro && <p role="alert" style={{ color: "#ff8ea0", fontSize: 12, marginBottom: 14 }}>{erro}</p>}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" className="ra-btn ra-btn--ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button
            type="button"
            className="ra-btn ra-btn--amber"
            data-testid="dash-criar-mesa"
            onClick={handleCreate}
            disabled={busy || !nome.trim()}
          >
            {busy ? <><Spinner size={13} className="ra-spin" /> Forjando…</> : <><Plus size={14} /> Criar campanha</>}
          </button>
        </div>
      </div>
    </div>
  );
}
