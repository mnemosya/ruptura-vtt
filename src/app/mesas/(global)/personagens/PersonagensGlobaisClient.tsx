"use client";

/**
 * Índice pessoal de personagens (área autenticada global): UMA lista de
 * linhas compactas, com busca e filtro por estado — em campanha, sem
 * campanha ou aguardando o narrador.
 *
 * A linha é a mesma para todos; só o ESTADO muda, e ele aparece em três
 * lugares coerentes: a barra lateral (ciano / cinza / âmbar), a linha de
 * metadados e a ação à direita (abrir · enviar para campanha · cancelar).
 *
 * "Criar personagem" abre a Forja sem campanha. "Enviar para campanha"
 * abre um diálogo com as campanhas da conta: o pedido fica pendente até
 * o narrador aceitar (quem narra o destino entra direto). Ao sair de uma
 * campanha, o personagem volta para cá como "sem campanha".
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead, SectionHead, relativeTime } from "../../_global/parts";
import { ArrowRight, Info } from "lucide-react";
import { AlertTriangle, ChevronRight, RotateCw, Search, Spinner, User, Users, X } from "../../../_design/icons";
import modal from "../../CreateCampaignModal.module.css";
import { JanelaNovoPersonagem } from "../../[campaignId]/vtt/_painel/janelas/JanelaNovoPersonagem";
import { cancelarPedidoAction, enviarParaCampanhaAction } from "./acoes";
import "./personagens.css";

export interface PersonagemLinha {
  id: string;
  name: string;
  classe: string | null;
  ranking: string | null;
  avatarUrl: string | null;
  /** Campanha onde o personagem está; nulo = sem campanha. */
  campanha: { id: string; nome: string; role: "narrator" | "player" } | null;
  /** Pedido de entrada aguardando o narrador (só personagem sem campanha). */
  pendente: { campaignId: string; campaignName: string } | null;
  updatedAt: string;
}

export interface CampanhaDestino {
  id: string;
  nome: string;
  /** Quem narra o destino não precisa pedir: o personagem entra direto. */
  narra: boolean;
}

type Estado = "campanha" | "solto" | "pendente";
type Filtro = "todos" | Estado;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "campanha", label: "Em campanha" },
  { id: "solto", label: "Sem campanha" },
  { id: "pendente", label: "Pendentes" },
];

const NOME_CLASSE: Record<string, string> = {
  ancora: "Âncora", cacador: "Caçador", combatente: "Combatente", face: "Face",
  infiltrador: "Infiltrador", tecnico: "Técnico", vanguarda: "Vanguarda",
};

const estadoDe = (p: PersonagemLinha): Estado => (p.campanha ? "campanha" : p.pendente ? "pendente" : "solto");

const hrefDaFicha = (p: PersonagemLinha) =>
  p.campanha ? `/ficha?campaignId=${p.campanha.id}&characterId=${p.id}` : `/ficha?characterId=${p.id}`;

/** O "+" do botão de criar — o mesmo de "Criar campanha". */
function IconeMais() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="2 2 12 12" aria-hidden="true">
    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="0.35" />
  </svg>;
}

export default function PersonagensGlobaisClient({
  personagens,
  destinos = [],
  errorInicial,
}: {
  personagens: PersonagemLinha[];
  destinos?: CampanhaDestino[];
  errorInicial: string | null;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [criando, setCriando] = useState(false);
  const [enviando, setEnviando] = useState<PersonagemLinha | null>(null);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return personagens.filter((p) => {
      if (filtro !== "todos" && estadoDe(p) !== filtro) return false;
      return !q || p.name.toLowerCase().includes(q) || (p.campanha?.nome ?? "").toLowerCase().includes(q);
    });
  }, [personagens, filtro, busca]);

  return (
    <div className="ra2-page ra2-view-enter">
      <PageHead eyebrow="SYS.RUPTURA // REGISTRO DE REFRATÁRIOS" title="Personagens" />

      {criando && (
        <JanelaNovoPersonagem campaignId={null} onFechar={() => setCriando(false)} onAbrirFicha={() => router.refresh()} />
      )}
      {enviando && <DialogoEnviar p={enviando} destinos={destinos} onFechar={() => setEnviando(null)} />}

      <div className="ra2-toolbar">
        <div className="ra2-toolbar-group">
          <div className="ra2-search">
            <span className="ra2-search-icon" aria-hidden="true"><Search size={13} strokeWidth={1.4} /></span>
            <label htmlFor="busca-personagens" className="sr-only">Buscar personagens</label>
            <input id="busca-personagens" data-testid="personagens-busca" type="search" value={busca}
              onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por personagem ou campanha…" />
          </div>
          <div className="ra2-segmented" role="tablist" aria-label="Filtrar por estado">
            {FILTROS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}
                className={`ra2-seg${filtro === f.id ? " ra2-seg--active" : ""}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="ra2-secondary" data-testid="personagens-criar" onClick={() => setCriando(true)}>
          <IconeMais />
          <span>Criar personagem</span>
        </button>
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
            Crie um personagem aqui e envie para uma campanha quando quiser, ou crie direto dentro de uma das suas campanhas.
          </p>
        </div>
      )}

      {!errorInicial && personagens.length > 0 && (
        <>
          <SectionHead title="Registro" count={filtrados.length} unit="FICHA" />
          {filtrados.length === 0 ? (
            <div className="ra-state-box">
              <div className="ra-state-icon"><Search size={36} style={{ color: "rgba(0,212,255,.5)" }} /></div>
              <h2 className="ra-h2" style={{ marginBottom: 8 }}>Nenhum personagem encontrado</h2>
              <p className="ra-muted">Ajuste a busca ou o filtro.</p>
            </div>
          ) : (
            <ul className="pg-lista" data-testid="personagens-lista">
              {filtrados.map((p) => <LinhaPersonagem key={p.id} p={p} onEnviar={() => setEnviando(p)} />)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function LinhaPersonagem({ p, onEnviar }: { p: PersonagemLinha; onEnviar: () => void }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const estado = estadoDe(p);
  const meta = [
    p.classe ? NOME_CLASSE[p.classe] ?? p.classe : null,
    p.ranking ? `Rank ${p.ranking}` : null,
    p.campanha ? p.campanha.nome : p.pendente ? `Aguardando ${p.pendente.campaignName}` : "Sem campanha",
  ].filter(Boolean).join(" · ");

  const cancelar = async () => {
    setOcupado(true); setErro(null);
    const r = await cancelarPedidoAction(p.id);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    router.refresh();
  };

  return (
    <li className="pg-linha ag-ch" data-estado={estado} data-testid="personagem-item">
      <Link href={hrefDaFicha(p)} className="pg-linha__abrir" aria-label={`Abrir a ficha de ${p.name}`}>
        <span className="pg-linha__retrato" aria-hidden="true">
          {p.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.avatarUrl} alt="" />
            : <User size={20} strokeWidth={1.4} />}
        </span>
        <span className="pg-linha__texto">
          <span className="pg-linha__nome" title={p.name}>{p.name}</span>
          <span className="ag-mono ag-mono--peq pg-linha__meta" title={meta}>{meta}</span>
        </span>
      </Link>

      <span className="pg-linha__lado">
        {erro && <span role="alert" className="pg-linha__erro">{erro}</span>}
        {estado === "campanha" && p.campanha && (
          <>
            <span className={`ag-etiqueta ag-etiqueta--${p.campanha.role === "narrator" ? "narrador" : "jogador"}`}>
              ◆ {p.campanha.role === "narrator" ? "Narrador" : "Jogador"}
            </span>
            <span className="ag-mono ag-mono--peq pg-linha__quando">{relativeTime(p.updatedAt)}</span>
            <ChevronRight size={16} strokeWidth={2} className="pg-linha__seta" aria-hidden="true" />
          </>
        )}
        {estado === "solto" && (
          <button type="button" className="pg-acao" onClick={onEnviar} data-testid="personagem-enviar">
            Enviar para campanha
          </button>
        )}
        {estado === "pendente" && (
          <>
            <span className="ag-etiqueta ag-etiqueta--narrador" data-testid="personagem-pendente">◆ Pendente</span>
            <button type="button" className="pg-acao pg-acao--neutra" onClick={() => void cancelar()} disabled={ocupado}>
              Cancelar
            </button>
          </>
        )}
      </span>
    </li>
  );
}

/**
 * Escolha da campanha de destino — o MESMO modal de "Criar campanha"
 * (`CreateCampaignModal.module.css`): faixa com o retrato e o nome do
 * personagem, campo de destino e rodapé com a nota e as duas ações.
 */
function DialogoEnviar({ p, destinos, onFechar }: { p: PersonagemLinha; destinos: CampanhaDestino[]; onFechar: () => void }) {
  const router = useRouter();
  const [destino, setDestino] = useState(destinos[0]?.id ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setAberto(true)); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !ocupado) onFechar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ocupado, onFechar]);

  const narra = destinos.find((d) => d.id === destino)?.narra ?? false;

  const enviar = async () => {
    if (!destino) { setErro("Escolha uma campanha."); return; }
    setOcupado(true); setErro(null);
    const r = await enviarParaCampanhaAction(p.id, destino);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    onFechar();
    router.refresh();
  };

  return (
    <div className="ra-overlay" data-open={aberto} onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) onFechar(); }}>
      <div className={`ra-modal ${modal.modal} pg-modal`} role="dialog" aria-modal="true" aria-labelledby="enviar-titulo">
        <header className={modal.banner}>
          <div className={`${modal.cover} pg-modal__capa`} style={p.avatarUrl ? { backgroundImage: `url('${p.avatarUrl}')` } : undefined} aria-hidden="true" />
          <div className={modal.veil} aria-hidden="true" />
          <button type="button" className={modal.close} onClick={onFechar} disabled={ocupado} aria-label="Fechar">
            <X size={15} />
          </button>
          <div className={modal.bannerCopy}>
            <span className={modal.eyebrow}>SYS.REGISTRO // ENVIAR PARA CAMPANHA</span>
            <span className={modal.role}>◆ Sem campanha</span>
            <h2 id="enviar-titulo" className={modal.previewName}>{p.name}</h2>
          </div>
        </header>

        <div className={modal.fields}>
          <div className={`${modal.field} ${modal.full}`}>
            {destinos.length === 0 ? (
              <p className="pg-modal__vazio">Você ainda não participa de nenhuma campanha. Entre por um convite do narrador para enviar este personagem.</p>
            ) : (
              <>
                <label className={modal.label} htmlFor="enviar-destino">Campanha de destino</label>
                <select id="enviar-destino" className={modal.input} value={destino} disabled={ocupado}
                  onChange={(e) => { setDestino(e.target.value); setErro(null); }}>
                  {destinos.map((d) => <option key={d.id} value={d.id}>{d.nome}{d.narra ? " — você narra" : ""}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        {erro && <p role="alert" className={modal.error}>{erro}</p>}

        <footer className={modal.footer}>
          {destinos.length > 0 && (
            <span className={modal.footerNote}>
              <Info size={14} aria-hidden="true" />
              {narra ? "Você narra: entra direto." : "O narrador precisa aceitar."}
            </span>
          )}
          <button type="button" className={modal.button} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          {destinos.length > 0 && (
            <button type="button" className={`${modal.button} ${modal.primary}`} onClick={() => void enviar()} disabled={ocupado} data-testid="personagem-enviar-confirmar">
              {ocupado
                ? <><Spinner size={13} className="ra-spin" /> Enviando…</>
                : <>{narra ? "Adicionar à campanha" : "Enviar pedido"} <ArrowRight size={14} aria-hidden="true" /></>}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
