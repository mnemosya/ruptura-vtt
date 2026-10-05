"use client";

/**
 * Índice pessoal de personagens (área autenticada global): busca, filtro
 * por papel na campanha de origem e atalho direto para a ficha real
 * (/ficha?campaignId&characterId).
 *
 * Também é onde nasce o personagem SEM CAMPANHA: "Criar personagem" abre
 * a Forja sem mesa, e cada personagem solto pode ser enviado para uma
 * campanha — fica pendente até o narrador aceitar (quem narra o destino
 * entra direto). Ao sair de uma campanha, o personagem volta para cá.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead, RoleBadge, SectionHead, relativeTime } from "../../_global/parts";
import { AlertTriangle, Plus, RotateCw, Search, User, Users } from "../../../_design/icons";
import { JanelaNovoPersonagem } from "../../[campaignId]/vtt/_painel/janelas/JanelaNovoPersonagem";
import { cancelarPedidoAction, enviarParaCampanhaAction } from "./acoes";

export interface PersonagemGlobal {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  role: "narrator" | "player";
  ownerLabel: string | null;
  updatedAt: string;
}

export interface PersonagemSolto {
  id: string;
  name: string;
  updatedAt: string;
  /** Pedido de entrada aguardando o narrador. */
  pendente: { campaignId: string; campaignName: string } | null;
}

export interface CampanhaDestino {
  id: string;
  nome: string;
  /** Quem narra o destino não precisa pedir: o personagem entra direto. */
  narra: boolean;
}

type Filter = "all" | "narrator" | "player";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "narrator", label: "Narro" },
  { id: "player", label: "Jogo" },
];

export default function PersonagensGlobaisClient({
  personagens,
  soltos = [],
  destinos = [],
  errorInicial,
}: {
  personagens: PersonagemGlobal[];
  soltos?: PersonagemSolto[];
  destinos?: CampanhaDestino[];
  errorInicial: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [criando, setCriando] = useState(false);

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

      {criando && (
        <JanelaNovoPersonagem
          campaignId={null}
          onFechar={() => setCriando(false)}
          onAbrirFicha={() => router.refresh()}
        />
      )}

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
        <button type="button" className="ra-btn ra-btn--amber" data-testid="personagens-criar" onClick={() => setCriando(true)}>
          <Plus size={13} /> Criar personagem
        </button>
      </div>

      {!errorInicial && soltos.length > 0 && (
        <>
          <SectionHead title="Sem campanha" count={soltos.length} unit="FICHA" />
          <div className="ra-char-grid" data-testid="personagens-soltos" style={{ paddingTop: 16, paddingBottom: 24 }}>
            {soltos.map((p) => <CartaoSolto key={p.id} p={p} destinos={destinos} />)}
          </div>
        </>
      )}

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

      {!errorInicial && personagens.length === 0 && soltos.length === 0 && (
        <div className="ra-empty" data-testid="personagens-vazio">
          <div className="ra-empty-glyph"><Users size={40} /></div>
          <h2 className="ra-empty-title">Nenhum personagem ainda</h2>
          <p className="ra-empty-text">
            Crie um personagem aqui e envie para uma campanha quando quiser, ou crie direto dentro
            de uma das suas campanhas.
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

/** Personagem sem campanha: abre a ficha e envia para uma campanha (ou mostra o pedido pendente). */
function CartaoSolto({ p, destinos }: { p: PersonagemSolto; destinos: CampanhaDestino[] }) {
  const router = useRouter();
  const [destino, setDestino] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const executar = async (acao: () => Promise<{ ok: true; entrouDireto?: boolean } | { ok: false; erro: string }>, ok?: (r: { entrouDireto?: boolean }) => string | null) => {
    setOcupado(true); setErro(null); setAviso(null);
    const r = await acao();
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setAviso(ok?.(r) ?? null);
    router.refresh();
  };

  return (
    <div className="ra-charcard" data-testid="personagem-solto">
      <span className="ra-char-portrait" aria-hidden="true"><User size={26} strokeWidth={1.2} /></span>
      <span className="ra-char-body">
        <Link href={`/ficha?characterId=${p.id}`} className="ra-char-name" title={p.name}>{p.name}</Link>
        <span className="ra-char-sub" style={{ fontSize: 11 }}>atualizado {relativeTime(p.updatedAt)}</span>
        {p.pendente ? (
          <span className="ra-char-tags">
            <span className="ra-tag" data-testid="personagem-pendente">Aguardando {p.pendente.campaignName}</span>
            <button type="button" className="ra-tag ra-tag--muted" disabled={ocupado}
              onClick={() => void executar(() => cancelarPedidoAction(p.id))}>
              Cancelar pedido
            </button>
          </span>
        ) : destinos.length === 0 ? (
          <span className="ra-char-sub" style={{ fontSize: 11 }}>Entre numa campanha para enviar este personagem.</span>
        ) : (
          <span className="ra-char-tags">
            <label htmlFor={`destino-${p.id}`} className="sr-only">Campanha de destino</label>
            <select id={`destino-${p.id}`} value={destino} onChange={(e) => setDestino(e.target.value)} disabled={ocupado} className="ra-tag ra-tag--muted">
              <option value="">Enviar para…</option>
              {destinos.map((d) => <option key={d.id} value={d.id}>{d.nome}{d.narra ? " (você narra)" : ""}</option>)}
            </select>
            <button type="button" className="ra-tag" disabled={!destino || ocupado} data-testid="personagem-enviar"
              onClick={() => void executar(() => enviarParaCampanhaAction(p.id, destino), (r) => (r.entrouDireto ? null : "Pedido enviado ao narrador."))}>
              Enviar
            </button>
          </span>
        )}
        {erro && <span role="alert" className="ra-char-sub" style={{ color: "#ff6a80", fontSize: 11 }}>{erro}</span>}
        {aviso && <span role="status" className="ra-char-sub" style={{ fontSize: 11 }}>{aviso}</span>}
      </span>
    </div>
  );
}
