"use client";

import { useRef, useState } from "react";
import { ChevronRight, X, BookOpen, Crosshair, HeartPulse, Swords, Handshake, HatGlasses, Cpu, Shield } from "lucide-react";
import { ICONES_CLASSE } from "../../tabs";
import type { SubclassContentV12 } from "../../../../../lib/rulesetV12/contracts";
import { reached } from "../../../../../lib/character/classManagement";
import { JanelaMercado } from "../hud/JanelaMercado";
import { TextoComRegras } from "../../TextoComRegras";
import "./subclassCodex.css";

export function SubclassCodex({ sub, rank, color }: { sub: SubclassContentV12; rank: string; color: string }) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const features = Object.entries(sub.caracteristicas).filter(([required]) => reached(rank, required)).flatMap(([required, items]) => items.map((item, index) => ({...item, rank: required, key: `${required}-${index}`})));
  const active = features.find(item => item.key === selection) ?? features[0];
  const Icon = ICONES_CLASSE[sub.classe_slug] ?? BookOpen;
  return <section className="hc-subclass-hub" aria-label={`Especialização ${sub.nome}`}>
    <button ref={opener} type="button" className="hc-subclass-entry" onClick={() => setOpen(true)}>
      <span className="hc-subclass-sigil"><Icon size={29}/></span><span><small>ESPECIALIZAÇÃO</small><strong>{sub.nome}</strong><em>{features.length} características adquiridas · consultar técnicas</em></span><ChevronRight size={21}/>
    </button>
    {open && active && <JanelaMercado titulo={`Técnicas · ${sub.nome}`} onFechar={() => { setOpen(false); requestAnimationFrame(() => opener.current?.focus()); }}>{close => <div className="hc-subclass-codex" style={{"--hc-accent": color} as React.CSSProperties}>
      <div className="hc-subclass-codex-body">
        <header className="hc-subclass-header"><span className="hc-subclass-header-sigil"><Icon size={24}/></span><div><small>COMPÊNDIO · ESPECIALIZAÇÃO / RANKING {rank}</small><h2>{sub.nome}</h2></div><button type="button" onClick={close} aria-label="Fechar técnicas"><X size={20}/></button></header>
        <div className="hc-subclass-reader"><nav aria-label="Características da subclasse">{["E", "C", "A"].filter(required => features.some(item => item.rank === required)).map(required => <div key={required}><span className="hc-subclass-tier">RANKING {required}</span>{features.filter(item => item.rank === required).map(item => <button key={item.key} type="button" aria-current={active.key === item.key ? "true" : undefined} onClick={() => setSelection(item.key)}><span className="hc-subclass-index-rank">{item.rank}</span><span>{item.nome}</span></button>)}</div>)}</nav>
          <article key={active.key}><div className="hc-subclass-hero"><div><small>ESPECIALIZAÇÃO · RANKING {active.rank}</small><h3>{active.nome}</h3><span>CARACTERÍSTICA ADQUIRIDA</span></div><Icon size={122} strokeWidth={1} aria-hidden="true"/></div><div className="hc-subclass-prose"><TextoComRegras glossario={[]} texto={active.descricao}/></div></article>
        </div>
      </div>
    </div>}</JanelaMercado>}
  </section>;
}
