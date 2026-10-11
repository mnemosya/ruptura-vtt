"use client";

import { useState } from "react";
import { Search, X, Check } from "lucide-react";
import { oxanium } from "../../../../_design/oxanium";
import { Faixa, Glifo, Leitura, Titulo, VERTENTES_HUD, type MagiaHud } from "./MagiasHud";
import "./catalogo-magias.css";

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Props = {
  magias: MagiaHud[];
  aprendidas: Set<string>;
  niveis: Record<string, number | null | undefined>;
  mana: { atual: number; max: number };
  somenteLeitura?: boolean;
  onAprender: (slug: string) => void;
  onFechar: () => void;
};

export function CatalogoMagiasHud({ magias, aprendidas, niveis, mana, somenteLeitura, onAprender, onFechar }: Props) {
  const primeira = [...VERTENTES_HUD].filter(v => magias.some(m => m.vertente === v.id))
    .sort((a, b) => (niveis[b.id] ?? -1) - (niveis[a.id] ?? -1)
      || magias.filter(m => m.vertente === b.id && aprendidas.has(m.slug)).length
        - magias.filter(m => m.vertente === a.id && aprendidas.has(m.slug)).length)[0] ?? VERTENTES_HUD[0];
  const [vertente, setVertente] = useState<string>(primeira.id);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [detalheAberto, setDetalheAberto] = useState(false);
  const definicao = VERTENTES_HUD.find(v => v.id === vertente) ?? primeira;
  const visiveis = magias.filter(m => m.vertente === vertente && normalizar(m.nome).includes(normalizar(busca)))
    .sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
  const alvo = visiveis.find(m => m.slug === selecionada) ?? visiveis[0] ?? null;
  const aprendida = !!alvo && aprendidas.has(alvo.slug);
  const escolher = (slug: string) => { setSelecionada(slug); setDetalheAberto(true); };

  return <div className={`hx cm-janela ${oxanium.variable}`} data-detalhe={detalheAberto || undefined} style={{ ["--cm-cor" as string]: definicao.c }}>
    <header className="cm-cabecalho">
      <div><span className="hx-mono cm-sobretitulo">// Arquivo de magias</span><h2 className="hx-display">Catálogo de magias<span>.</span></h2></div>
      <button type="button" className="hx-fechar-quad cm-fechar" onClick={onFechar} aria-label="Fechar catálogo de magias"><X size={16} aria-hidden="true" /></button>
    </header>
    <div className="cm-corpo">
      <nav className="cm-vertentes" aria-label="Vertentes de magia">
        <div className="cm-nav-titulo hx-mono">Vertentes</div>
        {VERTENTES_HUD.map(v => <button key={v.id} type="button" className="cm-vertente" style={{ ["--cm-item-cor" as string]: v.c }} aria-pressed={vertente === v.id} onClick={() => { setVertente(v.id); setSelecionada(null); setDetalheAberto(false); }}>
          <span className="cm-fio" /><Glifo v={v} tam={18} /><span>{v.nome}</span><small>{magias.filter(m => m.vertente === v.id).length}</small>
        </button>)}
      </nav>
      <div className="cm-catalogo">
        <label className="cm-busca"><Search size={16} aria-hidden="true" /><input type="search" value={busca} onChange={e => { setBusca(e.target.value); setDetalheAberto(false); }} placeholder="Buscar magia…" aria-label="Buscar magia" /></label>
        <div className="cm-lista">
          {[...new Set(visiveis.map(m => m.nivel))].map(nivel => <section key={nivel}>
            <div className="cm-secao"><Glifo v={definicao} tam={16} /><span className="hx-display">{definicao.nome} · Nível {nivel}</span><small>{visiveis.filter(m => m.nivel === nivel).length}</small><span className="cm-traco" /></div>
            <div className="cm-grade">{visiveis.filter(m => m.nivel === nivel).map(m => <button key={m.slug} type="button" className="cm-carta" aria-pressed={alvo?.slug === m.slug} onClick={() => escolher(m.slug)}>
              <span className="cm-carta-arte"><Glifo v={definicao} tam={30} /></span>
              <span className="cm-carta-info"><strong className="hx-display">{m.nome}</strong><span className="cm-carta-meta">{m.tipo || definicao.nome} <span>{aprendidas.has(m.slug) ? <><Check size={12} aria-hidden="true" /> Aprendida</> : `${m.mana ?? "—"} mana · ${m.pa} PA`}</span></span></span>
            </button>)}</div>
          </section>)}
          {!visiveis.length && <p className="cm-vazio">{magias.length ? "Nenhuma magia corresponde à busca nesta vertente." : "Catálogo sem magias publicadas."}</p>}
        </div>
      </div>
      <aside className="cm-detalhe" aria-label="Detalhes da magia">
        {alvo ? <>
          <div className="cm-detalhe-voltar"><button type="button" onClick={() => setDetalheAberto(false)}>← Voltar ao catálogo</button></div>
          <div className="cm-detalhe-conteudo" key={alvo.slug}>
            <Faixa m={alvo} nivel={niveis[alvo.vertente]} />
            <Titulo m={alvo} />
            <div className="cm-leitura"><Leitura m={alvo} mana={mana} /></div>
          </div>
          <div className="cm-rodape">
            {somenteLeitura ? <p className="cm-estado">Somente leitura</p> : <button type="button" className="cm-aprender" disabled={aprendida} onClick={() => onAprender(alvo.slug)}>{aprendida ? "Aprendida" : "Aprender magia"}</button>}
            {alvo.bloqueada && !aprendida && <p className="cm-aviso">Nível da vertente insuficiente para conjurar esta magia.</p>}
          </div>
        </> : <p className="cm-vazio">Selecione uma magia para ver seus detalhes.</p>}
      </aside>
    </div>
  </div>;
}
