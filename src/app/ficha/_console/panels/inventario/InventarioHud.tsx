"use client";

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
 * A cor de cada item é a VERTENTE da categoria (`data-vertente`), a
 * mesma paleta canônica do VTT — nenhum hexadecimal de tipo aqui.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { oxanium } from "../../../../_design/oxanium";
import "./inventario-hud.css";

export type LocalHud = "mochila" | "equipado" | "abrigo";
type VistaHud = LocalHud | "todos";

export interface ItemHud {
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
  /** Abre o Mercado (botão ao lado da carteira e tecla M). Ausente = sem botão. */
  onAbrirMercado?: () => void;
  /** Slot no rodapé da lista — o mercado provisório entra aqui. */
  rodape?: ReactNode;
}

/* ── glifos por categoria (traços do protótipo) ── */
const GLIFO: Record<string, string> = {
  arma: "M3 21 14 10m0 0 3-7 4 4-7 3Zm-9 7 3 3M6 15l3 3",
  armadura: "M12 2 4 5v7c0 5 3.5 8 8 10 4.5-2 8-5 8-10V5l-8-3Zm0 0v20M4 10h16",
  escudo: "M4 3h16v9c0 5-4 8-8 10-4-2-8-5-8-10V3Zm8 4v10m-4-5h8",
  ferramenta: "M14 5a5 5 0 0 0 5 6l-9 10-4-4 10-9a5 5 0 0 1-2-3Z",
  farmacia: "M9 2h6v7h7v6h-7v7H9v-7H2V9h7V2Z",
  dispositivo: "M5 3h14v18H5V3Zm3 3h8v6H8V6Zm1 10h2m2 0h2",
  veiculo: "M3 15l2-6h14l2 6v4H3v-4Zm3 4v2m12-2v2M6 15h2m8 0h2",
  vertina: "M12 1 19 12 12 23 5 12 12 1Zm0 6-3 5 3 5 3-5-3-5Z",
  municao: "M6 22V9l2-6 2 6v13m4 0V9l2-6 2 6v13",
  explosivo: "M12 8a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm3-1 3-4m0 0 2 1m-2-1-1-2",
};
const GLIFO_PADRAO = "M4 4h16v16H4V4Zm4 4h8v8H8V8Z";
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

export function InventarioHud(props: PropsInventarioHud) {
  const { itens, capacidade } = props;
  const [vista, setVista] = useState<VistaHud>("mochila");
  const [busca, setBusca] = useState("");
  const [quente, setQuente] = useState<string | null>(null);
  const [ancora, setAncora] = useState<Ancora | null>(null);
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
  const irPara = (v: VistaHud) => { setVista(v); setAncora(null); };

  /* Atalhos só com o foco DENTRO do inventário: no VTT, 1–4 e `/`
     são de outras ferramentas, e um ouvinte global roubaria as teclas. */
  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (ancora) setAncora(null);
      else { setBusca(""); buscaRef.current?.blur(); }
      return;
    }
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "/") { e.preventDefault(); buscaRef.current?.focus(); return; }
    if ((e.key === "m" || e.key === "M") && props.onAbrirMercado) { setAncora(null); props.onAbrirMercado(); return; }
    const v = VISTAS[Number(e.key) - 1];
    if (v) irPara(v.id);
  }

  const livre = capacidade - ocupados;

  return (
    <div className={`ih ${oxanium.variable}`} onKeyDown={aoTeclar}>
      <div className="ih-topo">
        {/* Faixa 1: onde o item está + saldo. Faixa 2: ferramentas. */}
        <div className="ih-topo-linha">
        <nav className="ih-abas" role="tablist" aria-label="Onde o item está">
          {VISTAS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={vista === v.id}
              className="ih-aba" data-ativo={vista === v.id || undefined} onClick={() => irPara(v.id)}>
              <span className="ih-aba-rot">{v.rotulo}</span>
              <span className="ih-aba-qtd">{contagem[v.id]}</span>
            </button>
          ))}
        </nav>
          <Carteira valor={props.aretz} onDefinir={props.somenteLeitura ? undefined : props.onDefinirAretz} />
        </div>
        <div className="ih-ferramentas">
          <label className="ih-busca">
            <Glifo d={IC.busca} tam={15} />
            <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Rastrear item…" aria-label="Buscar item no inventário" />
            {busca
              ? <button type="button" className="ih-busca-tecla" onClick={() => setBusca("")}>esc</button>
              : <span className="ih-busca-tecla">/</span>}
          </label>
          {props.onAbrirMercado && !props.somenteLeitura && (
            <button type="button" className="ih-mercado" onClick={() => { setAncora(null); props.onAbrirMercado!(); }}>
              <Glifo d="M3 4h2l2 11h11l2-8H6m3 13a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01" tam={18} />
              <span className="ih-mercado-rot">Mercado</span>
              <span className="ih-mercado-tecla">M</span>
            </button>
          )}
        </div>
      </div>

      <div ref={palco} className="ih-palco" onClick={(e) => { if (e.target === e.currentTarget) setAncora(null); }}>
        <div key={vista} className="ih-boot">
          <Lista
            itens={vista === "todos" ? itens : itens.filter((i) => i.local === vista)}
            vista={vista} capacidade={capacidade} casa={casa} termo={busca} inicio={inicio}
            livre={vista === "mochila" && !termo ? livre : 0}
            quente={quente} setQuente={setQuente} sel={ancora?.id} abrir={abrir}
          />
        </div>

        {selecionado && ancora && (
          <CartaoItem key={selecionado.id} item={selecionado} ancora={ancora} palco={palco}
            podeCrescer={selecionado.local !== "mochila" || ocupados + selecionado.espacosPorItem <= capacidade}
            somenteLeitura={!!props.somenteLeitura}
            destinos={props.destinosDe(selecionado)}
            onFechar={() => setAncora(null)}
            onUsar={() => props.onUsar(selecionado.id)}
            onAjustar={(d) => props.onAjustar(selecionado.id, d)}
            onMover={(d) => { props.onMover(selecionado.id, d); setAncora(null); }}
            onDescartar={() => { props.onDescartar(selecionado.id); setAncora(null); }} />
        )}
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
              style={{ flexGrow: t.n }} title={`${t.it.nome} · ${t.n} esp.`}
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
function Lista({ itens, vista, capacidade, casa, termo, livre, inicio, quente, setQuente, sel, abrir }: {
  itens: ItemHud[]; vista: VistaHud; capacidade: number; casa: (i: ItemHud) => boolean; termo: string; livre: number;
  inicio: Map<string, number>;
  quente: string | null; setQuente: (s: string | null) => void; sel?: string;
  abrir: (id: string, el: HTMLElement) => void;
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
          <button key={it.id} type="button" className="ih-lin" data-vertente={it.vertente}
            data-quente={quente === it.id || undefined} data-sel={sel === it.id || undefined}
            style={{ animationDelay: `${ix * 25}ms` }}
            onMouseEnter={() => setQuente(it.id)} onMouseLeave={() => setQuente(null)}
            onClick={(e) => abrir(it.id, e.currentTarget)}>
            <span className="ih-lin-icone"><Glifo d={GLIFO[it.categoria] ?? GLIFO_PADRAO} tam={20} /></span>
            <span className="ih-lin-nome">
              <span className="ih-nome">{it.nome}</span>
              {it.quantidade > 1 && <span className="ih-mono ih-fraco">×{it.quantidade}</span>}
              {(it.cargas || it.municao) && (
                <span className="ih-tag ih-fraco">{it.cargas ? "cargas" : "mun."} {(it.cargas ?? it.municao)!.join("/")}</span>
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
function CartaoItem({ item: it, ancora, palco, podeCrescer, somenteLeitura, destinos, onFechar, onUsar, onAjustar, onMover, onDescartar }: {
  item: ItemHud; ancora: Ancora; palco: React.RefObject<HTMLDivElement | null>;
  podeCrescer: boolean; somenteLeitura: boolean; destinos: DestinoHud[];
  onFechar: () => void; onUsar: () => void; onAjustar: (d: number) => void;
  onMover: (destino: string) => void; onDescartar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; lado: "e" | "d" } | null>(null);
  const [movendo, setMovendo] = useState(false);
  const L = 360;

  useEffect(() => {
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

  return (
    <div ref={ref} className="ih-cartao" data-vertente={it.vertente} data-lado={pos?.lado}
      data-pronto={pos ? true : undefined} role="dialog" aria-label={it.nome}
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0, width: L }}>
      <div className="ih-cartao-caixa">
        <div className="ih-cartao-arte">
          <span className="ih-cartao-arte-glifo"><Glifo d={GLIFO[it.categoria] ?? GLIFO_PADRAO} tam={150} traco={0.9} /></span>
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

        {!somenteLeitura && (
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
        )}
      </div>
    </div>
  );
}

/** Segurar para descartar — o gesto do protótipo. Soltar antes cancela. */
function Descartar({ onFeito }: { onFeito: () => void }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const comecar = () => {
    const t0 = performance.now();
    const passo = () => {
      const n = Math.min(1, (performance.now() - t0) / 900);
      setP(n);
      if (n >= 1) onFeito(); else raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
  };
  const parar = () => { cancelAnimationFrame(raf.current); setP(0); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button type="button" className="ih-quad ih-descartar" onPointerDown={comecar} onPointerUp={parar} onPointerLeave={parar}
      title="Segure para descartar" aria-label="Segure para descartar">
      <span className="ih-descartar-enche" style={{ height: `${p * 100}%` }} />
      <Glifo d={IC.lixo} tam={16} />
    </button>
  );
}
