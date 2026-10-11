"use client";

import { estiloCategoria } from "../../../../_design/itemCategoryColors";
import { FichaItemModal, type PecaHud } from "../hud/EquipamentoHud";
import { ResourceValueCard } from "../ResourceValueCard";
import { ArrowRight, ArrowRightLeft, Backpack, Check, ChevronUp, Eye, Hand, ListChecks, Package, Shirt, Trash2, Users, Warehouse, X, Zap } from "lucide-react";
import { createPortal } from "react-dom";
import { ItemCategoryIcon } from "../../../../_design/itemIcons";

/**
 * INVENTÁRIO — a versão HUD, adaptada do protótipo do Figma Make
 * (`inventario/src/Inventory.tsx`, na raiz do repo).
 *
 * Só apresentação. Tudo que é regra chega pronto em `ItemHud` e
 * `capacidade`/`ocupados`; tudo que muda o personagem sai por callback.
 * É isso que deixa este componente viver na galeria (`/dev/estilos`,
 * aba "Inventário (HUD)") com dados de exemplo e, depois de aprovado,
 * entrar no lugar do `InventarioPanel` com um adaptador por cima do
 * `ConsoleApi` — sem reescrever nada daqui.
 *
 * Do protótipo ficou: a régua de espaços da mochila em segmentos
 * inclinados (a cor do item só acende no hover), a lista em colunas,
 * as abas numeradas, a busca com `/`, a carteira hexagonal e o cartão
 * flutuante preso à linha. Ficaram de fora o boneco de papel e as
 * prateleiras do abrigo: Equipado e Abrigo usam a mesma lista, e o
 * corpo continua sendo da aba de Equipamentos.
 *
 * A cor de cada item segue a paleta compartilhada das categorias do mercado.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { oxanium } from "../../../../_design/oxanium";
import "./inventario-hud.css";

export type LocalHud = "mochila" | "equipado" | "abrigo";
type VistaHud = LocalHud | "todos";

export interface ItemHud {
  /** Nome do modelo preservado mesmo quando a instância é renomeada. */
  weaponName?: string;
  temaCategoria?: string;
  id: string;
  nome: string;
  /** Slug da categoria (`arma`, `farmacia`…) — escolhe o glifo. */
  categoria: string;
  categoriaRotulo: string;
  /** Vertente da categoria — escolhe a cor. */
  vertente: string;
  raridade?: string | null;
  quantidade: number;
  local: LocalHud;
  /** Rótulo fino do local (“Empunhado”, “Acesso rápido”) quando difere do local. */
  localRotulo?: string;
  /**
   * Tipo do item, mostrado como etiqueta ao lado do nome ("Flecha" numa
   * munição chamada "Explosiva"). Ausente = o que estiver entre parênteses
   * no nome ("AS-10 Overdrive (Pistola pesada)").
   */
  tipo?: string | null;
  espacosPorItem: number;
  /** Espaços que o item ocupa NA MOCHILA (já com a regra de pilha aplicada). */
  ocupa: number;
  preco: number | null;
  /** Texto ou nó (o painel real passa o texto com glossário). */
  descricao?: ReactNode;
  destaque?: { rotulo: string; valor: string; sufixo?: string | null } | null;
  pa?: number | null;
  cargas?: [number, number] | null;
  municao?: [number, number] | null;
  linhas?: { rotulo: string; valor: string }[];
  propriedades?: string[];
  usavel: boolean;
}

export interface DestinoHud { id: string; rotulo: string; motivo: string | null }

export interface PropsInventarioHud {
  itens: ItemHud[];
  capacidade: number;
  nomeMochilaEquipada?: string;
  aretz: number | null;
  /**
   * Edita o saldo a partir do que foi digitado (valor, `+250`, `3000-555`).
   * Devolve a mensagem de erro, ou `null` se aceitou. Ausente = só leitura.
   */
  onDefinirAretz?: (texto: string) => string | null;
  somenteLeitura?: boolean;
  destinosDe: (item: ItemHud) => DestinoHud[];
  onUsar: (id: string) => void;
  onAjustar: (id: string, delta: number) => void;
  onMover: (id: string, destinoId: string) => void;
  onDescartar: (id: string) => void;
  /** Ficha completa do item para o modal (o mesmo da aba Equipamentos). Ausente = cartão antigo. */
  fichaDe?: (id: string) => PecaHud | null;
  /** Abre o Mercado (botão ao lado da carteira e tecla M). Ausente = sem botão. */
  onAbrirMercado?: () => void;
  /** Slot no rodapé da lista — o mercado provisório entra aqui. */
  rodape?: ReactNode;
}


const IC = {
  fechar: "M6 6l12 12M18 6 6 18",
  busca: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4",
  mover: "M5 12h14m-4-4 4 4-4 4",
  lixo: "M5 7h14M9 7V4h6v3m-8 0 1 14h8l1-14",
};

function Glifo({ d, tam = 16, traco = 1.6 }: { d: string; tam?: number; traco?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth={traco}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const VISTAS: { id: VistaHud; rotulo: string }[] = [
  { id: "mochila", rotulo: "Mochila" },
  { id: "equipado", rotulo: "Equipado" },
  { id: "abrigo", rotulo: "Abrigo" },
  { id: "todos", rotulo: "Todos" },
];

interface Ancora { id: string; x: number; y: number; w: number; h: number }

/** "AS-10 Overdrive (Pistola pesada)" → título e tipo. Sem parênteses, o tipo é null. */
function separarTipo(nome: string): { titulo: string; tipo: string | null } {
  const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(nome);
  return m ? { titulo: m[1], tipo: m[2] } : { titulo: nome, tipo: null };
}

export function InventarioHud(props: PropsInventarioHud) {
  const { itens, capacidade } = props;
  const [vista, setVista] = useState<VistaHud>("mochila");
  const [busca, setBusca] = useState("");
  const [emSelecao, setEmSelecao] = useState(false);
  const [menuLote, setMenuLote] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const visiveis = itens.filter(i => (vista === "todos" || i.local === vista) && (!busca.trim() || `${i.nome} ${i.categoriaRotulo}`.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR"))));
  const escolhidos = visiveis.filter(i => marcados.has(i.id));
  const alternar = (id: string) => setMarcados(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const moverSelecionados = (destino: "mochila" | "abrigo") => {
    escolhidos.filter(i => i.local !== destino).forEach(i => props.onMover(i.id, destino));
    setMarcados(new Set()); setEmSelecao(false); setMenuLote(false);
  };
  const [quente, setQuente] = useState<string | null>(null);
  const [ancora, setAncora] = useState<Ancora | null>(null);
  const [menuDe, setMenuDe] = useState<{ id: string; x: number; y: number } | null>(null);
  const palco = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const mochila = itens.filter((i) => i.local === "mochila");
  /* A régua mede a MOCHILA: só o que está nela ocupa espaço
     (`ESTADOS_QUE_OCUPAM`, lib/character/carga.ts). Equipado e abrigo
     não entram. */
  const carregados = mochila;
  const ocupados = carregados.reduce((a, i) => a + i.ocupa, 0);
  let cursor = 0;
  const inicio = new Map(carregados.map((it) => { const s = cursor; cursor += it.ocupa; return [it.id, s] as const; }));
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const casa = (i: ItemHud) => !termo
    || i.nome.toLocaleLowerCase("pt-BR").includes(termo)
    || i.categoriaRotulo.toLocaleLowerCase("pt-BR").includes(termo);
  const contagem: Record<VistaHud, number> = {
    mochila: mochila.length,
    equipado: itens.filter((i) => i.local === "equipado").length,
    abrigo: itens.filter((i) => i.local === "abrigo").length,
    todos: itens.length,
  };
  const selecionado = itens.find((i) => i.id === ancora?.id) ?? null;

  const abrir = (id: string, el: HTMLElement) => {
    if (ancora?.id === id) { setAncora(null); return; }
    const s = palco.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setAncora({ id, x: r.left - s.left, y: r.top - s.top + palco.current!.scrollTop, w: r.width, h: r.height });
  };
  const irPara = (v: VistaHud) => { setVista(v); setAncora(null); setMarcados(new Set()); };

  /* Atalhos das vistas só com o foco dentro do inventário. */
  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (menuLote) { setMenuLote(false); e.stopPropagation(); return; }
      if (emSelecao) { setEmSelecao(false); setMarcados(new Set()); e.stopPropagation(); return; }
      if (ancora) setAncora(null);
      else { setBusca(""); buscaRef.current?.blur(); }
      return;
    }
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const v = VISTAS[Number(e.key) - 1];
    if (v) irPara(v.id);
  }

  const livre = capacidade - ocupados;

  return (
    <div className={`ih ${oxanium.variable}`} data-selecao={emSelecao || undefined} onKeyDown={aoTeclar}>
      <div className="ih-topo">
        {/* Faixa 1: onde o item está + saldo. Faixa 2: ferramentas. */}
        <div className="ih-topo-linha">
        <nav className="ih-abas" role="tablist" aria-label="Onde o item está">
          {VISTAS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={vista === v.id}
              className="ih-aba" data-ativo={vista === v.id || undefined} onClick={() => irPara(v.id)}>
              <span className="ih-aba-rot">{v.id === "mochila" ? props.nomeMochilaEquipada ?? v.rotulo : v.rotulo}</span>
              <span className="ih-aba-qtd">{contagem[v.id]}</span>
            </button>
          ))}
        </nav>
          <Carteira valor={props.aretz} onDefinir={props.somenteLeitura ? undefined : props.onDefinirAretz} />
        </div>
        <div className="ih-ferramentas">
          <label className="ih-busca">
            <Glifo d={IC.busca} tam={15} />
            <input ref={buscaRef} value={busca} onChange={(e) => { setBusca(e.target.value); setMarcados(new Set()); }}
              placeholder="Rastrear item…" aria-label="Buscar item no inventário" />
            {busca
              ? <button type="button" className="ih-busca-tecla" onClick={() => setBusca("")}>esc</button>
              : null}
          </label>
          {!props.somenteLeitura && <button type="button" className="ih-selecao-botao" aria-pressed={emSelecao}
            aria-label={emSelecao ? "Encerrar seleção" : "Selecionar vários itens"}
            title={emSelecao ? "Encerrar seleção" : "Selecionar vários itens"}
            onClick={() => {
              setAncora(null); setMenuDe(null); setMenuLote(false);
              setEmSelecao(!emSelecao); setMarcados(new Set());
            }}><ListChecks size={18} strokeWidth={1.6} aria-hidden="true" /></button>}
          {props.onAbrirMercado && !props.somenteLeitura && (
            <button type="button" className="ih-mercado" onClick={() => { setAncora(null); props.onAbrirMercado!(); }}>
              <Glifo d="M3 4h2l2 11h11l2-8H6m3 13a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01" tam={18} />
              <span className="ih-mercado-rot">Mercado</span>
            </button>
          )}
        </div>
      </div>

      <div className="ih-lista-area">
      <div ref={palco} className="ih-palco" onClick={(e) => { if (e.target === e.currentTarget) setAncora(null); }}>
        <div key={vista} className="ih-boot">
          <Lista
            itens={vista === "todos" ? itens : itens.filter((i) => i.local === vista)}
            vista={vista} capacidade={capacidade} casa={casa} termo={busca} inicio={inicio}
            livre={vista === "mochila" && !termo ? livre : 0}
            quente={quente} setQuente={setQuente} sel={ancora?.id} abrir={abrir}
            marcados={emSelecao && !props.somenteLeitura ? marcados : undefined} onMarcar={alternar}
            onMenu={emSelecao || props.somenteLeitura ? undefined : (id, x, y) => setMenuDe({ id, x, y })}
          />
        </div>

        {menuDe && (() => {
          const it = itens.find((i) => i.id === menuDe.id);
          if (!it) return null;
          return (
            <MenuDoItemInventario item={it} x={menuDe.x} y={menuDe.y} destinos={props.destinosDe(it)}
              onFechar={() => setMenuDe(null)}
              onVer={(el) => abrir(it.id, el)}
              onUsar={() => props.onUsar(it.id)}
              onMover={(d) => props.onMover(it.id, d)}
              onDescartar={() => props.onDescartar(it.id)} />
          );
        })()}
        {selecionado && ancora && (
          <CartaoItem key={selecionado.id} item={selecionado} ancora={ancora} palco={palco}
            podeCrescer={selecionado.local !== "mochila" || ocupados + selecionado.espacosPorItem <= capacidade}
            somenteLeitura={!!props.somenteLeitura}
            ficha={props.fichaDe?.(selecionado.id) ?? null}
            destinos={props.destinosDe(selecionado)}
            onFechar={() => setAncora(null)}
            onUsar={() => props.onUsar(selecionado.id)}
            onAjustar={(d) => props.onAjustar(selecionado.id, d)}
            onMover={(d) => { props.onMover(selecionado.id, d); setAncora(null); }}
            onDescartar={() => { props.onDescartar(selecionado.id); setAncora(null); }} />
        )}
      </div>

      {emSelecao && !props.somenteLeitura && <div className="ih-lote-ancora">
        <div className="ih-lote" role="toolbar" aria-label="Mover itens selecionados"
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setMenuLote(false); }}>
          <span className="ih-lote-contagem" aria-live="polite"><strong>{escolhidos.length}</strong><span>{escolhidos.length === 1 ? "selecionado" : "selecionados"}</span></span>
          <button type="button" className="ih-lote-todos" disabled={!visiveis.length}
            aria-pressed={visiveis.length > 0 && escolhidos.length === visiveis.length}
            title={escolhidos.length === visiveis.length ? "Limpar seleção" : "Selecionar todos os itens visíveis"}
            onClick={() => { setMenuLote(false); setMarcados(escolhidos.length === visiveis.length ? new Set() : new Set(visiveis.map(i => i.id))); }}>
            <span>{visiveis.length > 0 && escolhidos.length === visiveis.length ? "Limpar" : "Selecionar todos"}</span>
          </button>
          <span className="ih-lote-separador" aria-hidden="true" />
          <div className="ih-lote-destinos">
            <button type="button" className="ih-lote-mover" aria-expanded={menuLote} aria-controls="ih-lote-destinos"
              disabled={!escolhidos.length} onClick={() => setMenuLote(!menuLote)}>
              <ArrowRightLeft size={16} strokeWidth={1.7} /><span>Mover itens</span><ChevronUp size={14} data-aberto={menuLote || undefined} />
            </button>
            {menuLote && <div id="ih-lote-destinos" className="ih-lote-menu" aria-label="Destino dos itens">
              <span className="ih-tag">Mover para</span>
              <button type="button" disabled={!escolhidos.some(i => i.local !== "mochila")} onClick={() => moverSelecionados("mochila")}><Backpack size={17} strokeWidth={1.6} />Mochila<ArrowRight size={14} /></button>
              <button type="button" disabled={!escolhidos.some(i => i.local !== "abrigo")} onClick={() => moverSelecionados("abrigo")}><Warehouse size={17} strokeWidth={1.6} />Abrigo<ArrowRight size={14} /></button>
            </div>}
          </div>
          <button type="button" className="ih-lote-fechar" title="Encerrar seleção" aria-label="Encerrar seleção" onClick={() => { setEmSelecao(false); setMarcados(new Set()); setMenuLote(false); }}><X size={16} strokeWidth={1.7} /></button>
        </div>
      </div>}
      </div>
      {/* A régua fica fora do palco rolável, ancorada embaixo. */}
      {vista === "mochila" && (
        <div className="ih-regua-base">
          <Regua itens={carregados} capacidade={capacidade} ocupados={ocupados} livre={livre}
            casa={casa} filtrando={!!termo} quente={quente} setQuente={setQuente} sel={ancora?.id} abrir={abrir} />
        </div>
      )}

      {props.rodape && <div className="ih-rodape">{props.rodape}</div>}
    </div>
  );
}

function Carteira({ valor, onDefinir }: { valor: number | null; onDefinir?: (texto: string) => string | null }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const confirmar = () => {
    if (texto == null || !onDefinir) return;
    const erro = onDefinir(texto);
    setAviso(erro);
    if (!erro) setTexto(null);
  };
  const editavel = !!onDefinir && valor != null;
  const abrir = () => { if (editavel && texto == null) setTexto(String(valor)); };
  return (
    /* O bloco INTEIRO abre o editor — o hexágono e o rótulo também, não
       só o número. O botão do valor continua lá para teclado e leitor
       de tela; o clique dele sobe até aqui e abre o mesmo editor. */
    <div className="ih-carteira" data-testid="console-carteira" data-editavel={editavel || undefined}
      onClick={abrir} title={editavel && texto == null ? "Editar saldo — aceita contas: +250, -150, 3000-555" : undefined}>
      <span className="ih-carteira-hex" aria-hidden="true">₳</span>
      <span className="ih-carteira-txt">
        <span className="ih-tag">Aretz</span>
        {texto != null ? (
          <input className="ih-carteira-val ih-carteira-campo" autoFocus value={texto}
            style={{ width: `${Math.max(texto.length, 5) + 1}ch` }}
            aria-label="Saldo em aretz — um número, ou uma conta como +250, -150 ou 3000-555"
            onFocus={(e) => { const n = e.currentTarget.value.length; e.currentTarget.setSelectionRange(n, n); }}
            onChange={(e) => { setTexto(e.target.value); setAviso(null); }}
            onBlur={confirmar}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); confirmar(); }
              if (e.key === "Escape") { e.preventDefault(); setTexto(null); setAviso(null); }
            }} />
        ) : onDefinir && valor != null ? (
          <button type="button" className="ih-carteira-val" data-testid="console-carteira-aretz">{fmt(valor)}</button>
        ) : (
          <span className="ih-carteira-val" data-testid="console-carteira-aretz">{valor == null ? "—" : fmt(valor)}</span>
        )}
      </span>
      {aviso && <span className="ih-carteira-aviso" role="alert">{aviso}</span>}
    </div>
  );
}

/* ── régua de espaços da mochila ── */
function Regua({ itens, capacidade, ocupados, livre, casa, filtrando, quente, setQuente, sel, abrir }: {
  itens: ItemHud[]; capacidade: number; ocupados: number; livre: number;
  casa: (i: ItemHud) => boolean; filtrando: boolean;
  quente: string | null; setQuente: (s: string | null) => void; sel?: string;
  abrir: (id: string, el: HTMLElement) => void;
}) {
  let cursor = 0;
  const trechos = itens.map((it) => { const s = cursor; cursor += it.ocupa; return { it, s, n: it.ocupa }; });
  const estado = livre < 0 ? `${-livre} excedente${-livre > 1 ? "s" : ""}` : livre === 0 ? "mochila cheia" : `${livre} ${livre > 1 ? "livres" : "livre"}`;
  return (
    <div className="ih-regua">
      <div className="ih-regua-cab">
        <span className="ih-regua-num" data-excedido={livre < 0 || undefined}>
          {ocupados}<span className="ih-regua-cap">/{capacidade}</span>
        </span>
        <span className="ih-tag">espaços</span>
        <span className="ih-tag ih-regua-estado" data-alerta={livre <= 1 || undefined}>{estado}</span>
      </div>
      <div className="ih-regua-trilho" role="meter" aria-valuenow={ocupados} aria-valuemin={0} aria-valuemax={capacidade}
        aria-label={`${ocupados} de ${capacidade} espaços ocupados`}>
        {trechos.map((t) => {
          const aceso = quente === t.it.id || sel === t.it.id;
          return (
            <button key={t.it.id} type="button" className="ih-trecho" data-vertente={t.it.vertente}
              data-aceso={aceso || undefined} data-apagado={(filtrando && !casa(t.it)) || undefined}
              // Da metade da régua em diante o nome abre para a ESQUERDA — à direita ele saía da janela.
              data-lado={t.s + t.n / 2 > Math.max(ocupados, capacidade) / 2 ? "fim" : undefined}
              style={{ ...estiloCategoria(t.it.temaCategoria ?? t.it.categoria, t.it.vertente), flexGrow: t.n }} title={`${t.it.nome} · ${t.n} esp.`}
              onMouseEnter={() => setQuente(t.it.id)} onMouseLeave={() => setQuente(null)}
              onClick={(e) => abrir(t.it.id, e.currentTarget)}>
              {Array.from({ length: t.n }, (_, i) => (
                <span key={i} className="ih-seg" data-excedente={t.s + i >= capacidade || undefined} />
              ))}
              <span className="ih-trecho-nome">{t.it.nome}</span>
            </button>
          );
        })}
        {livre > 0 && (
          <span className="ih-trecho ih-trecho--livre" style={{ flexGrow: livre }}>
            {Array.from({ length: livre }, (_, i) => <span key={i} className="ih-seg" data-vazio />)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── lista ── */
function Lista({ itens, vista, capacidade, casa, termo, livre, inicio, quente, setQuente, sel, abrir, onMenu, marcados, onMarcar }: {
  itens: ItemHud[]; vista: VistaHud; capacidade: number; casa: (i: ItemHud) => boolean; termo: string; livre: number;
  inicio: Map<string, number>;
  quente: string | null; setQuente: (s: string | null) => void; sel?: string;
  abrir: (id: string, el: HTMLElement) => void;
  onMenu?: (id: string, x: number, y: number) => void;
  marcados?: Set<string>; onMarcar?: (id: string) => void;
}) {
  const naMochila = vista === "mochila";
  const linhas = itens.filter(casa);
  const total = itens.reduce((a, i) => a + (i.preco ?? 0) * i.quantidade, 0);

  return (
    <div className="ih-lista" data-vista={vista}>
      <div className="ih-lin ih-lin--cab">
        <span />
        <span className="ih-tag">item</span>
        <span className="ih-tag">categoria</span>
        <span className="ih-tag">{naMochila ? "ocupa" : vista === "todos" ? "local" : "espaço"}</span>
        <span className="ih-tag ih-dir">valor</span>
      </div>
      {linhas.map((it, ix) => {
        const s = inicio.get(it.id) ?? 0;
        return (
          <button key={it.id} type="button" className="ih-lin" data-id={it.id} data-vertente={it.vertente}
            data-quente={quente === it.id || undefined} data-sel={(marcados?.has(it.id) || sel === it.id) || undefined}
            aria-pressed={marcados ? marcados.has(it.id) : undefined}
            style={{ ...estiloCategoria(it.temaCategoria ?? it.categoria, it.vertente), animationDelay: `${ix * 25}ms` }}
            onMouseEnter={() => setQuente(it.id)} onMouseLeave={() => setQuente(null)}
            onClick={(e) => marcados ? onMarcar?.(it.id) : abrir(it.id, e.currentTarget)}
            onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(it.id, e.clientX, e.clientY); } : undefined}>
            <span className="ih-lin-icone" data-selecao={marcados ? true : undefined}>{marcados ? <span className="ih-marca" data-marcado={marcados.has(it.id) || undefined}><Check size={18} strokeWidth={1.8} /></span> : <ItemCategoryIcon category={it.categoria} weaponName={it.weaponName ?? it.nome} size={20} strokeWidth={1.6} />}</span>
            <span className="ih-lin-nome">
              <span className="ih-nome">{separarTipo(it.nome).titulo}</span>
              {/* Arma de família ("SW-80 Parallax (Rifle de precisão)") não repete o tipo
                  aqui; célula de energia já diz o que é no rótulo das cargas. */}
              {it.categoria !== "arma" && it.tipo !== "Célula" && (it.tipo ?? separarTipo(it.nome).tipo) && <span className="ih-tag ih-fraco">{it.tipo ?? separarTipo(it.nome).tipo}</span>}
              {it.quantidade > 1 && <span className="ih-mono ih-fraco">×{it.quantidade}</span>}
              {(it.cargas || it.municao) && (
                <span className="ih-tag ih-fraco">{it.cargas ? (it.tipo === "Célula" ? "células" : "cargas") : "munição"} {(it.cargas ?? it.municao)!.join("/")}</span>
              )}
            </span>
            <span className="ih-tag ih-cor">{it.categoriaRotulo}</span>
            {naMochila ? (
              <span className="ih-ocupa">
                <span className="ih-blocos">
                  {Array.from({ length: it.ocupa }, (_, i) => (
                    <span key={i} className="ih-bloco" data-excedente={s + i >= capacidade || undefined} />
                  ))}
                </span>
                <span className="ih-mono ih-fraco ih-pequeno">{it.ocupa} {it.ocupa === 1 ? "espaço" : "espaços"}</span>
              </span>
            ) : vista === "todos" ? (
              <span className="ih-tag ih-local" data-local={it.local}>{it.localRotulo ?? it.local}</span>
            ) : (
              <span className="ih-blocos">
                {Array.from({ length: Math.max(it.espacosPorItem, 1) }, (_, i) => <span key={i} className="ih-bloco" />)}
              </span>
            )}
            <span className="ih-valor ih-dir">
              {it.preco == null ? "—" : <><span className="ih-aretz">₳</span> {fmt(it.preco * it.quantidade)}</>}
            </span>
          </button>
        );
      })}
      {linhas.length === 0 && (
        <div className="ih-quieto">
          <span className="ih-quieto-tit">{termo ? `Nada com “${termo}”` : vista === "abrigo" ? "Abrigo vazio" : "Nada aqui"}</span>
          <span className="ih-tag">{termo ? "tente a aba todos" : vista === "abrigo" ? "o que você guardar aqui não ocupa a mochila" : "nenhum item neste lugar"}</span>
        </div>
      )}
      {livre > 0 && (
        <div className="ih-lin ih-lin--livre">
          <span className="ih-lin-icone ih-lin-icone--vazio" />
          <span className="ih-tag ih-fraco">espaço disponível</span>
          <span />
          <span className="ih-blocos">{Array.from({ length: livre }, (_, i) => <span key={i} className="ih-bloco" data-vazio />)}</span>
          <span />
        </div>
      )}
      {vista === "todos" && itens.length > 0 && (
        <div className="ih-lista-pe">
          <span className="ih-tag ih-fraco">{linhas.length} de {itens.length}</span>
          <span className="ih-tag ih-fraco">patrimônio em itens · <span className="ih-aretz">₳ {fmt(total)}</span></span>
        </div>
      )}
    </div>
  );
}

/* ── cartão flutuante ── */
function CartaoItem({ item: it, ancora, palco, podeCrescer, somenteLeitura, destinos, onFechar, onUsar, onAjustar, onMover, onDescartar, ficha }: {
  item: ItemHud; ancora: Ancora; palco: React.RefObject<HTMLDivElement | null>; ficha?: PecaHud | null;
  podeCrescer: boolean; somenteLeitura: boolean; destinos: DestinoHud[];
  onFechar: () => void; onUsar: () => void; onAjustar: (d: number) => void;
  onMover: (destino: string) => void; onDescartar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; lado: "e" | "d" } | null>(null);
  const [movendo, setMovendo] = useState(false);
  const L = 360;

  useEffect(() => {
    if (ficha) return;
    const p = palco.current!;
    const largura = p.clientWidth;
    const altura = p.scrollHeight;
    const h = ref.current!.offsetHeight;
    const direita = ancora.x + ancora.w + 16 + L < largura;
    /* Linha de lista ocupa a largura toda: aí o cartão encosta na
       direita do palco em vez de cair para fora. */
    const x = direita ? ancora.x + ancora.w + 16 : Math.max(0, Math.min(largura - L, ancora.x + ancora.w - L - 8));
    const y = Math.max(0, Math.min(altura - h, ancora.y + ancora.h / 2 - h / 2));
    setPos({ x, y, lado: direita ? "e" : "d" });
  }, [ancora, it, palco, movendo]);

  useEffect(() => {
    if (ficha) return;
    const h = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(alvo) && !alvo.closest(".ih-lin, .ih-trecho")) onFechar();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onFechar]);

  const stats: { rotulo: string; valor: ReactNode }[] = useMemo(() => [
    { rotulo: "Espaços / item", valor: it.espacosPorItem },
    ...(it.preco != null ? [{ rotulo: "Preço base", valor: <><span className="ih-aretz">₳</span> {fmt(it.preco)}</> }] : []),
    ...(it.linhas ?? []).map((l) => ({ rotulo: l.rotulo, valor: l.valor })),
  ], [it]);

  const acoes = (
    <div className="ih-cartao-acoes">
              {movendo && (
                <div className="ih-mover ih-boot">
                  {destinos.map((d) => (
                    <button key={d.id} type="button" className="ih-mover-op" disabled={d.motivo != null}
                      title={d.motivo ?? undefined} onClick={() => onMover(d.id)}>
                      <span className="ih-tag">{d.rotulo}</span>
                      <span className="ih-mono ih-fraco ih-pequeno">{d.motivo ? "indisponível" : "→"}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="ih-acoes-linha">
                <div className="ih-passo">
                  <button type="button" disabled={it.quantidade <= 1} onClick={() => onAjustar(-1)} aria-label="Diminuir quantidade">−</button>
                  <span aria-live="polite">{it.quantidade}</span>
                  <button type="button" disabled={!podeCrescer} onClick={() => onAjustar(+1)} aria-label="Aumentar quantidade">+</button>
                </div>
                <button type="button" className="ih-usar" disabled={!it.usavel} onClick={onUsar}
                  title={it.usavel ? undefined : "Este item não declara uso automatizável."}>
                  {it.usavel ? "Usar" : "Passivo"}
                </button>
                <button type="button" className="ih-quad" data-ativo={movendo || undefined} aria-expanded={movendo}
                  onClick={() => setMovendo((m) => !m)} title="Mover"><Glifo d={IC.mover} tam={16} /></button>
                <Descartar onFeito={onDescartar} />
              </div>
            </div>
  );

  if (ficha) {
    return <FichaItemModal p={ficha} fixo onFechar={onFechar} rodape={somenteLeitura ? undefined : (
      <RodapeItem item={it} podeCrescer={podeCrescer} destinos={destinos} onUsar={onUsar} onAjustar={onAjustar} onMover={onMover} onDescartar={onDescartar} />
    )} />;
  }

  return (
    <div ref={ref} className="ih-cartao" data-vertente={it.vertente} data-lado={pos?.lado}
      data-pronto={pos ? true : undefined} role="dialog" aria-label={it.nome}
      style={{ ...estiloCategoria(it.temaCategoria ?? it.categoria, it.vertente), left: pos?.x ?? -9999, top: pos?.y ?? 0, width: L }}>
      <div className="ih-cartao-caixa">
        <div className="ih-cartao-arte">
          <span className="ih-cartao-arte-glifo"><ItemCategoryIcon category={it.categoria} weaponName={it.weaponName ?? it.nome} size={150} strokeWidth={0.9} /></span>
          <div className="ih-cartao-sobre">
            <span className="ih-tag ih-cor">{it.categoriaRotulo}</span>
            {it.raridade && <><span className="ih-losango" /><span className="ih-tag ih-fraco">{it.raridade}</span></>}
          </div>
          <button type="button" className="ih-cartao-fechar" onClick={onFechar} aria-label="Fechar"><Glifo d={IC.fechar} tam={14} /></button>
          <h2 className="ih-cartao-nome">{it.nome}</h2>
        </div>

        <div className="ih-cartao-corpo">
          {it.descricao && <p className="ih-cartao-desc">{it.descricao}</p>}
          {it.destaque && (
            <div className="ih-destaque">
              <span className="ih-destaque-val">{it.destaque.valor}</span>
              <span className="ih-destaque-txt">
                <span className="ih-tag ih-fraco">{it.destaque.rotulo}</span>
                {it.destaque.sufixo && <span>{it.destaque.sufixo}</span>}
              </span>
            </div>
          )}
          {(it.pa != null || it.municao || it.cargas) && (
            <div className="ih-chips">
              {it.pa != null && (
                <div className="ih-chip"><span className="ih-tag ih-fraco">PA</span>
                  <span className="ih-chip-v">{Array.from({ length: it.pa }, (_, i) => <span key={i} className="ih-pa" />)}</span></div>
              )}
              {it.municao && (
                <div className="ih-chip"><span className="ih-tag ih-fraco">Munição</span>
                  <span className="ih-chip-v ih-chip-num">{it.municao[0]}<span className="ih-fraco">/{it.municao[1]}</span></span></div>
              )}
              {it.cargas && (
                <div className="ih-chip"><span className="ih-tag ih-fraco">Cargas</span>
                  <span className="ih-chip-v">{Array.from({ length: it.cargas[1] }, (_, i) => <span key={i} className="ih-carga" data-cheia={i < it.cargas![0] || undefined} />)}</span></div>
              )}
            </div>
          )}
          <dl className="ih-stats">
            {stats.map((s) => <div key={s.rotulo}><dt className="ih-tag ih-fraco">{s.rotulo}</dt><dd>{s.valor}</dd></div>)}
          </dl>
          {it.propriedades && it.propriedades.length > 0 && (
            <div className="ih-props">{it.propriedades.map((p) => <span key={p} className="ih-prop">{p}</span>)}</div>
          )}
        </div>

        {!somenteLeitura && acoes}
      </div>
    </div>
  );
}

/** Confirmação explícita para excluir a instância inteira do inventário. */
function Descartar({ onFeito }: { onFeito: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) return (
    <div className="ih-descartar-confirmacao" role="group" aria-label="Excluir item?"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setConfirmando(false); } }}>
      <span className="ih-tag">Excluir item?</span>
      <button type="button" className="ih-descartar-confirmar" autoFocus onClick={onFeito}>Excluir</button>
      <button type="button" onClick={() => setConfirmando(false)}>Cancelar</button>
    </div>
  );
  return (
    <button type="button" className="ih-quad ih-descartar" onClick={() => setConfirmando(true)}
      title="Excluir item" aria-label="Excluir item">
      <Glifo d={IC.lixo} tam={16} />
    </button>
  );
}

/**
 * Rodapé do modal de item: quantidade (− valor +, o valor editável como
 * nos recursos: "5", "+1", "-2"), a ação principal (Usar, ou "Passivo")
 * e "⋯" com o resto — cada destino com nome e, isolado, Descartar com
 * confirmação.
 */
function RodapeItem({ item: it, podeCrescer, destinos, onUsar, onAjustar, onMover, onDescartar }: {
  item: ItemHud; podeCrescer: boolean; destinos: DestinoHud[];
  onUsar: () => void; onAjustar: (d: number) => void; onMover: (destino: string) => void; onDescartar: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) { setConfirmando(false); return; }
    const fora = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(false); } };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [menu]);
  return (
    <div className="ih-modal-acoes" ref={ref}>
      <span className="ih-modal-acoes-qtd">
        <button type="button" disabled={it.quantidade <= 1} onClick={() => onAjustar(-1)} aria-label="Diminuir quantidade">−</button>
        <ResourceValueCard atual={it.quantidade} max={podeCrescer ? 9999 : it.quantidade} min={1} rotulo="Quantidade" mostrarMax={false}
          className="ih-modal-acoes-valor" inputClassName="ih-modal-acoes-input" testIdPrefix="console-inv"
          onGravar={(v) => { if (v !== it.quantidade) onAjustar(v - it.quantidade); }} />
        <button type="button" disabled={!podeCrescer} onClick={() => onAjustar(+1)} aria-label="Aumentar quantidade">+</button>
        <small>unid.</small>
      </span>
      <span style={{ flex: 1 }} />
      {it.usavel && <button type="button" className="ih-modal-acoes-usar" onClick={onUsar}>Usar</button>}
      <button type="button" className="ih-modal-acoes-mais" data-on={menu || undefined} aria-expanded={menu} aria-haspopup="menu"
        aria-label="Mais ações" onClick={() => setMenu((m) => !m)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
      </button>
      {menu && (
        <div className="ih-modal-acoes-menu" role="menu">
          {/* Só os destinos possíveis — os indisponíveis só poluíam a lista. */}
          {destinos.filter((d) => d.motivo == null).map((d) => (
            <button key={d.id} type="button" role="menuitem" className="ih-modal-acoes-item" onClick={() => { setMenu(false); onMover(d.id); }}>
              {iconeDestino(d)}{rotuloDestino(d)}
            </button>
          ))}
          {destinos.some((d) => d.motivo == null) && <span className="ih-modal-acoes-sep" />}
          <button type="button" role="menuitem" className="ih-modal-acoes-item" data-perigo data-confirmando={confirmando || undefined}
            onClick={() => { if (confirmando) { setMenu(false); onDescartar(); } else setConfirmando(true); }}>
            <Trash2 aria-hidden="true" />{confirmando ? "Clique de novo para descartar" : "Descartar"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Texto da ação de cada destino: guardar, mover ou equipar — com o lugar por extenso. */
function rotuloDestino(d: DestinoHud): string {
  const lugar = d.rotulo.toLowerCase();
  if (d.id === "abrigo") return "Guardar no abrigo";
  if (d.id === "mochila") return "Guardar na mochila";
  if (d.id === "bando") return "Mandar para o bando";
  if (d.id.startsWith("acesso_rapido")) return `Mover para ${lugar}`;
  if (d.id.startsWith("arma_") || d.id === "escudo") return `Equipar: ${lugar}`;
  if (d.id === "equipado") return "Equipar";
  if (d.id === "suporte_municao") return `Equipar: ${lugar}`;
  return `Equipar: ${lugar}`;
}

/** Ícone de cada destino no menu "⋯". */
function iconeDestino(d: DestinoHud) {
  if (d.id === "abrigo") return <Warehouse aria-hidden="true" />;
  if (d.id === "mochila") return <Package aria-hidden="true" />;
  if (d.id === "bando") return <Users aria-hidden="true" />;
  if (d.id.startsWith("acesso_rapido")) return <Zap aria-hidden="true" />;
  if (d.id.startsWith("arma_") || d.id === "escudo") return <Hand aria-hidden="true" />;
  return <Shirt aria-hidden="true" />;
}

/**
 * Menu do botão direito numa linha do inventário — o mesmo desenho do
 * menu da aba Equipamentos (`.hx-menu`): cabeçalho com o item, a ação
 * principal em barra (Usar, quando o item tem uso; senão Ver item), o
 * resto em lista com ícones e Descartar isolado, com confirmação.
 */
function MenuDoItemInventario({ item: it, x, y, destinos, onFechar, onVer, onUsar, onMover, onDescartar }: {
  item: ItemHud; x: number; y: number; destinos: DestinoHud[];
  onFechar: () => void; onVer: (el: HTMLElement) => void; onUsar: () => void; onMover: (d: string) => void; onDescartar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setPos({ left: Math.min(x, window.innerWidth - el.offsetWidth - 8), top: Math.min(y, window.innerHeight - el.offsetHeight - 8) });
    el?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const fora = (ev: PointerEvent) => { if (!ref.current?.contains(ev.target as Node)) onFechar(); };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); onFechar(); } };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [x, y, onFechar]);
  const fazer = (f: () => void) => () => { f(); onFechar(); };
  const verItem = () => { const linha = document.querySelector<HTMLElement>(`.ih-lin[data-id="${it.id}"]`); if (linha) onVer(linha); };
  const possiveis = destinos.filter((d) => d.motivo == null);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="hx-menu" role="menu" aria-label={`Ações de ${it.nome}`}
      style={{ ...estiloCategoria(it.temaCategoria ?? it.categoria, it.vertente), left: pos.left, top: pos.top }}
      onContextMenu={(ev) => ev.preventDefault()}>
      <div className="hx-menu-cab">
        <span className="hx-menu-icone" aria-hidden="true"><ItemCategoryIcon category={it.categoria} weaponName={it.weaponName ?? it.nome} size={18} strokeWidth={1.6} /></span>
        <span className="hx-menu-id">
          <span className="hx-menu-nome">{separarTipo(it.nome).titulo}</span>
          <span className="hx-menu-meta"><span>{it.categoriaRotulo}</span>{it.quantidade > 1 && <span>×{it.quantidade}</span>}</span>
        </span>
      </div>
      {it.usavel
        ? <button type="button" role="menuitem" className="hx-menu-acao" onClick={fazer(onUsar)}>Usar<ArrowRight aria-hidden="true" /></button>
        : <button type="button" role="menuitem" className="hx-menu-acao" onClick={fazer(verItem)}>Ver item<ArrowRight aria-hidden="true" /></button>}
      <div className="hx-menu-secao">
        {it.usavel && <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(verItem)}><Eye aria-hidden="true" />Ver item</button>}
        {possiveis.map((d) => (
          <button key={d.id} type="button" role="menuitem" className="hx-menu-item" onClick={fazer(() => onMover(d.id))}>{iconeDestino(d)}{rotuloDestino(d)}</button>
        ))}
      </div>
      <div className="hx-menu-secao">
        <button type="button" role="menuitem" className="hx-menu-item" data-perigo data-confirmando={confirmando || undefined}
          onClick={() => { if (confirmando) { onDescartar(); onFechar(); } else setConfirmando(true); }}>
          <Trash2 aria-hidden="true" />{confirmando ? "Clique de novo para descartar" : "Descartar"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
