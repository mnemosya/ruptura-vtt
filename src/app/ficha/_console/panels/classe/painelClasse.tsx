"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { reached, CLASS_RANKS } from "../../../../../lib/character/classManagement";

/** Peças comuns às telas de classe redesenhadas (Âncora, Caçador). */

export type Caracteristica = { nome: string; descricao: string };
export type Bloco =
  | { tipo: "titulo"; texto: string; custo?: string }
  | { tipo: "item" | "paragrafo"; destaque: string; texto: string }
  | { tipo: "ficha"; chave: string; texto: string }
  | { tipo: "acao"; custo: string; nome: string; marca?: string; texto: string };

const MAIUSC = "A-ZÁÉÍÓÚÂÊÔÃÕÇÜ";
const TITULO_SOLTO = new RegExp(`^[${MAIUSC} ]+:$`);
const CAIXA_ALTA = new RegExp(`^[${MAIUSC}][${MAIUSC} ,()/-]*[${MAIUSC})]$`);
const ACAO = /^(\d+ PA) ([^.]+?)\.\s*(.*)$/;
const CHAVE_VALOR = new RegExp(`^([${MAIUSC}][^:.]{0,24}):\\s*(.+)$`);
// Nome em destaque no começo do parágrafo: "Passos Silenciosos. O companheiro…", "Instinto. Utilizar…".
const PALAVRA = `[${MAIUSC}][\\wÀ-ÿ-]*`;
const NOME_NA_FRENTE = new RegExp(`^(${PALAVRA}(?:\\s+(?:de|da|do|das|dos|e|em|${PALAVRA})){0,4}\\.)\\s+(.+)$`);
const semEnfase = (texto: string) => texto.replace(/\*([^*]+)\*/g, "$1");

function paragrafo(corrido: string): Bloco {
  const acao = corrido.match(ACAO);
  if (acao) {
    const ataque = /\s*\(Ataque natural\)$/.test(acao[2]);
    return { tipo: "acao", custo: acao[1], nome: acao[2].replace(/\s*\(Ataque natural\)$/, ""), marca: ataque ? "ATAQUE NATURAL" : undefined, texto: acao[3] };
  }
  if (corrido.startsWith("• ")) {
    const corpo = corrido.slice(2), i = corpo.indexOf(":");
    return { tipo: "item", destaque: i > 0 ? corpo.slice(0, i + 1) + " " : "", texto: i > 0 ? corpo.slice(i + 1).trim() : corpo };
  }
  const exemplos = corrido.match(/^(Exemplos:)\s+(.+)$/);
  if (exemplos) return { tipo: "paragrafo", destaque: exemplos[1] + " ", texto: exemplos[2] };
  const nome = corrido.match(NOME_NA_FRENTE);
  return nome ? { tipo: "paragrafo", destaque: nome[1] + " ", texto: nome[2] } : { tipo: "paragrafo", destaque: "", texto: corrido };
}

function itemDeLista(linha: string): Bloco {
  if (CAIXA_ALTA.test(linha.replace(/\s+\d+ PA$/, ""))) {
    const custo = linha.match(/\s+(\d+ PA)$/);
    return { tipo: "titulo", texto: custo ? linha.slice(0, custo.index) : linha, custo: custo?.[1] };
  }
  const kv = linha.match(CHAVE_VALOR);
  if (kv) return { tipo: "ficha", chave: kv[1], texto: kv[2] };
  return { tipo: "item", destaque: "", texto: linha };
}

/**
 * Texto de regra em blocos. Entende os formatos dos livros:
 * - títulos em caixa alta (soltos, com ":" ou com custo: "COMANDAR COMPANHEIRO 1 PA");
 * - "• Nome: texto" em linha corrida e "- item" / "| a | b |" linha a linha;
 * - fichas "Chave: valor" (Tamanho, PV, Perícias…), que viram uma tabela;
 * - ações "1 PA Andar. texto", com a marca de ataque natural;
 * - o nome em destaque no começo do parágrafo ("Faro Apurado.", "Instinto.").
 */
export function blocos(texto: string): Bloco[] {
  return semEnfase(texto).split("\n\n").flatMap(trecho => {
    let linhas = trecho.split("\n").map(l => l.trim()).filter(Boolean);
    const saida: Bloco[] = [];
    if (linhas.length === 1 && (TITULO_SOLTO.test(linhas[0]) || CAIXA_ALTA.test(linhas[0]))) return [{ tipo: "titulo", texto: linhas[0].replace(/:$/, "") }];
    if (linhas.length > 1 && !/^[-|]/.test(linhas[0]) && linhas[0] === linhas[0].toUpperCase()) { saida.push({ tipo: "titulo", texto: linhas[0].replace(/:$/, "") }); linhas = linhas.slice(1); }
    if (linhas.length && linhas.every(l => /^(- |\|)/.test(l))) {
      const tabela = linhas.filter(l => l.startsWith("|") && !/^\|\s*-/.test(l));
      // Tabela: a primeira linha é o cabeçalho; cada linha seguinte vira um item "a · b".
      tabela.slice(1).forEach(l => saida.push({ tipo: "item", destaque: "", texto: l.replace(/^\||\|$/g, "").split("|").map(c => c.trim()).join(" · ") }));
      linhas.filter(l => l.startsWith("- ")).forEach(l => saida.push(itemDeLista(l.slice(2))));
      return saida;
    }
    if (linhas.length) saida.push(paragrafo(linhas.join(" ")));
    return saida;
  });
}

/** Junta itens e fichas vizinhos num só bloco, para a lista e a tabela não virarem caixas soltas. */
function agrupar(lista: Bloco[]) {
  const grupos: (Bloco | { tipo: "lista"; itens: Bloco[] } | { tipo: "fichas"; itens: Extract<Bloco, { tipo: "ficha" }>[] })[] = [];
  for (const b of lista) {
    const ultimo = grupos[grupos.length - 1];
    if (b.tipo === "item") { if (ultimo?.tipo === "lista") ultimo.itens.push(b); else grupos.push({ tipo: "lista", itens: [b] }); }
    else if (b.tipo === "ficha") { if (ultimo?.tipo === "fichas") ultimo.itens.push(b); else grupos.push({ tipo: "fichas", itens: [b] }); }
    else grupos.push(b);
  }
  return grupos;
}

export function TextoRegra({ texto, className = "ar-hab-texto" }: { texto: string; className?: string }) {
  return <div className={className}>{agrupar(blocos(texto)).map((b, index) => {
    if (b.tipo === "titulo") return <span key={index} className="ar-hab-sub">{b.texto}{b.custo && <em>{b.custo}</em>}</span>;
    if (b.tipo === "lista") return <div key={index} className="ar-hab-lista">{b.itens.map((item, i) => item.tipo === "item" && <p key={i} className="ar-hab-item"><b>{item.destaque}</b>{item.texto}</p>)}</div>;
    if (b.tipo === "fichas") return <dl key={index} className="ar-hab-ficha">{b.itens.map((f, i) => <div key={i}><dt>{f.chave}</dt><dd>{f.texto}</dd></div>)}</dl>;
    if (b.tipo === "acao") return <p key={index} className="ar-hab-acao"><span className="ar-hab-custo">{b.custo}</span><b>{b.nome}</b>{b.marca && <i>{b.marca}</i>}{b.texto && <> {b.texto}</>}</p>;
    if (b.tipo === "paragrafo" || b.tipo === "item") return <p key={index}><b>{b.destaque}</b>{b.texto}</p>;
    return null;
  })}</div>;
}

/** Habilidades da classe e da subclasse, em blocos, com as do ranking ainda não alcançado travadas. */
export function ListaHabilidades({ classe, sub, rank, iconeClasse, nota }: {
  classe: { nome: string; caracteristicas: Record<string, Caracteristica[]> };
  sub?: { nome: string; caracteristicas: Record<string, Caracteristica[]> };
  rank: string;
  iconeClasse: ReactNode;
  /** Estado de uso ao lado do nome (ex.: "Troca grátis pronta"). */
  nota?: (nome: string) => { texto: string; tom?: string } | null;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  return <>{[{ secao: "CLASSE", tipo: "classe", nome: classe.nome, itens: classe.caracteristicas }, ...(sub ? [{ secao: sub.nome.toUpperCase(), tipo: "subclasse", nome: sub.nome, itens: sub.caracteristicas }] : [])].map(({ secao, tipo, nome, itens }) => {
    const todas = CLASS_RANKS.flatMap(r => itens[r] ?? []).length;
    const liberadas = CLASS_RANKS.filter(r => reached(rank, r)).flatMap(r => itens[r] ?? []).length;
    return <div key={secao} className="ar-hab-secao" data-tipo={tipo}>
      <div className="ar-hab-cab">
        <span className="ar-hab-selo" aria-hidden="true">{tipo === "classe" ? iconeClasse
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 8 9-8 9-8-9z" /></svg>}</span>
        <span className="ar-hab-cab-texto"><small>{tipo === "classe" ? "CLASSE" : "SUBCLASSE"}</small><strong>{nome}</strong></span>
        <span className="ar-hab-conta">{liberadas} de {todas} liberadas</span>
      </div>
      {CLASS_RANKS.flatMap(r => (itens[r] ?? []).map(item => ({ ...item, r }))).map(item => {
        const id = `${secao}-${item.r}-${item.nome}`, aberto = aberta === id, travada = !reached(rank, item.r);
        const estado = !travada ? nota?.(item.nome) : null;
        return <div key={id} className="ar-hab">
          <button type="button" aria-expanded={aberto} data-aberto={aberto} data-travada={travada} onClick={() => setAberta(aberto ? null : id)}>
            <span className="ar-hab-rank">{item.r}</span><span className="ar-hab-nome">{item.nome}</span>
            {travada && <><span className="ar-hab-nota">Ranking {item.r}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></>}
            {estado && <span className="ar-hab-nota" data-tom={estado.tom}>{estado.texto}</span>}
            <svg className="ar-hab-seta" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {aberto && <TextoRegra texto={item.descricao} />}
        </div>;
      })}
    </div>;
  })}</>;
}

export function Painel({ titulo, intro, fechar, children }: { titulo: string; intro?: string; fechar: () => void; children: ReactNode | ((sair: () => void) => ReactNode) }) {
  // Sai animado: marca a saída e só desmonta quando a animação do painel termina.
  const [saindo, setSaindo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const fecharBotao = useRef<HTMLButtonElement>(null);
  const sair = () => setSaindo(true);
  // Foco no fechar sem rolar nada por baixo.
  useEffect(() => { fecharBotao.current?.focus({ preventScroll: true }); }, []);
  // A roda só rola o corpo do painel (e as listas dentro dele), nunca a tela embaixo.
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      const dentro = (e.target as HTMLElement).closest<HTMLElement>(".ar-painel-corpo, .ar-sel-lista, .cr-rola");
      if (!dentro) { e.preventDefault(); return; }
      const noTopo = dentro.scrollTop <= 0 && e.deltaY < 0;
      const noFim = dentro.scrollTop + dentro.clientHeight >= dentro.scrollHeight - 1 && e.deltaY > 0;
      if (noTopo || noFim) e.preventDefault();
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, []);
  return <div ref={raiz} className="ar-sheet">
    <div className="ar-veu" aria-hidden="true" data-saindo={saindo} onClick={sair} />
    <div className="ar-painel" role="dialog" aria-label={titulo} data-saindo={saindo}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); sair(); } }}
      onAnimationEnd={event => { if (saindo && event.target === event.currentTarget) fechar(); }}>
      <div className="ar-painel-cab"><h3>{titulo}</h3><button ref={fecharBotao} type="button" aria-label={`Fechar ${titulo.toLowerCase()}`} onClick={sair}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
      {intro && <p className="ar-painel-intro">{intro}</p>}
      <div className="ar-painel-corpo">{typeof children === "function" ? children(sair) : children}</div>
    </div>
  </div>;
}

const iniciais = (nome: string) => nome.trim().slice(0, 2).toUpperCase();

/**
 * Seletor genérico (perícia do Briefing, paciente do Terapeuta).
 * Lista própria no lugar do `<select>` do navegador, no mesmo molde do
 * `SeletorToken` do Rolador: a lista mora dentro do componente (acompanha
 * a rolagem do painel), abre para cima quando não cabe embaixo, fecha com
 * clique fora, Esc ou escolha. ↑/↓ andam, Home/End vão às pontas e uma
 * letra pula para a próxima perícia que começa com ela.
 */
export type OpcaoSeletor = { id: string; nome: string; rosto?: { nome: string; avatarUrl?: string | null } };

export function Seletor({ titulo, valor, opcoes, onEscolher, desabilitado, leve }: { titulo: string; valor: string; opcoes: OpcaoSeletor[]; onEscolher: (valor: string) => void; desabilitado?: boolean; /** Sem caixa: o nome como título clicável. */ leve?: boolean }) {
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [aberta, setAberta] = useState<null | { cima: boolean }>(null);
  const atual = opcoes.find(o => o.id === valor) ?? opcoes[0];
  const fechar = useCallback((devolverFoco = false) => { setAberta(null); if (devolverFoco) gatilho.current?.focus(); }, []);
  const alternar = () => {
    if (aberta) { fechar(); return; }
    const r = gatilho.current?.getBoundingClientRect();
    const caixa = gatilho.current?.closest(".ar-painel-corpo")?.getBoundingClientRect();
    const altura = 280;
    const cabeBaixo = !r || (caixa?.bottom ?? window.innerHeight) - r.bottom >= altura + 8;
    const cabeCima = !!r && r.top - (caixa?.top ?? 0) >= altura + 8;
    setAberta({ cima: !cabeBaixo && cabeCima });
  };
  useEffect(() => {
    if (!aberta) return;
    // Rola só a lista até a opção marcada; o foco não pode rolar o console.
    requestAnimationFrame(() => {
      const marcada = lista.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (!marcada || !lista.current) return;
      lista.current.scrollTop = marcada.offsetTop - lista.current.clientHeight / 2 + marcada.offsetHeight / 2;
      marcada.focus({ preventScroll: true });
    });
    const fora = (e: PointerEvent) => { const alvo = e.target as Node; if (!lista.current?.contains(alvo) && !gatilho.current?.contains(alvo)) fechar(); };
    const tecla = (e: KeyboardEvent) => {
      const itens = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const i = itens.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(true); return; }
      if (e.key === "Tab") { fechar(); return; }
      let proximo = -1;
      if (e.key === "ArrowDown") proximo = Math.min(itens.length - 1, i + 1);
      else if (e.key === "ArrowUp") proximo = Math.max(0, i - 1);
      else if (e.key === "Home") proximo = 0;
      else if (e.key === "End") proximo = itens.length - 1;
      else if (e.key.length === 1 && /\p{L}/u.test(e.key)) {
        const letra = e.key.toLocaleLowerCase("pt-BR");
        const ordem = [...itens.slice(i + 1), ...itens.slice(0, i + 1)];
        const achado = ordem.find(b => b.textContent?.trim().toLocaleLowerCase("pt-BR").normalize("NFD").startsWith(letra.normalize("NFD")));
        proximo = achado ? itens.indexOf(achado) : -1;
      } else return;
      e.preventDefault();
      const el = itens[proximo], l = lista.current;
      if (!el || !l) return;
      el.focus({ preventScroll: true });
      if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop;
      else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight;
    };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [aberta, fechar]);
  return <span className="ar-sel" data-leve={leve}>
    <button ref={gatilho} type="button" className="ar-sel-gatilho" aria-haspopup="listbox" aria-expanded={aberta !== null} aria-label={`${titulo}: ${atual.nome}`} data-vazio={!atual.id} disabled={desabilitado} onClick={alternar}>
      <span className="ar-sel-opcao">{!leve && atual.rosto && <i className="ar-sel-rosto"><Rosto aliado={atual.rosto} /></i>}{atual.nome}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {aberta && <div ref={lista} role="listbox" aria-label={titulo} className="ar-sel-lista" data-cima={aberta.cima}>
      {opcoes.map(o => <button key={o.id || "nenhuma"} type="button" role="option" aria-selected={o.id === atual.id} data-vazio={!o.id} onClick={() => { onEscolher(o.id); fechar(true); }}>
        <span className="ar-sel-opcao">{o.rosto && <i className="ar-sel-rosto"><Rosto aliado={o.rosto} /></i>}{o.nome}</span>
        {o.id === atual.id && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
      </button>)}
    </div>}
  </span>;
}

/** Rosto do aliado: o avatar da ficha; sem ele (ou se a imagem falhar), a sigla. */
export function Rosto({ aliado }: { aliado?: { nome: string; avatarUrl?: string | null } }) {
  const [falhou, setFalhou] = useState(false);
  const url = aliado?.avatarUrl;
  useEffect(() => { setFalhou(false); }, [url]);
  if (url && !falhou) return <img className="ar-rosto" src={url} alt="" draggable={false} onError={() => setFalhou(true)} />;
  return <>{iniciais(aliado?.nome ?? "")}</>;
}
