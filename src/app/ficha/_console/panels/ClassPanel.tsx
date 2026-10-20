"use client";

import { BookOpen, ChevronRight, Cpu, Crosshair, Handshake, HatGlasses, HeartPulse, Shield, Swords } from "lucide-react";
import { ICONES_CLASSE } from "../tabs";
import type { ConsoleApi } from "../types";
import type { ClassContentV12, SubclassContentV12 } from "../../../../lib/rulesetV12/contracts";
import { progression, readClassPlay, reached } from "../../../../lib/character/classManagement";
import { TextoComRegras } from "../TextoComRegras";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { ClassOperations } from "./classe/ClassOperations";
import { SubclassCodex } from "./classe/SubclassCodex";
import { ClassModules } from "./classe/ClassModules";
import ancora from "../../../../../content/v12/db_classe_ancora_v1_2.json";
import cacador from "../../../../../content/v12/db_classe_cacador_v1_2.json";
import combatente from "../../../../../content/v12/db_classe_combatente_v1_2.json";
import face from "../../../../../content/v12/db_classe_face_v1_2.json";
import infiltrador from "../../../../../content/v12/db_classe_infiltrador_v1_2.json";
import tecnico from "../../../../../content/v12/db_classe_tecnico_v1_2.json";
import vanguarda from "../../../../../content/v12/db_classe_vanguarda_v1_2.json";
import "./hud/hud-base.css";
import "./classe/classe.css";
import "./classe/classGame.css";
import "./classe/classPolish.css";

const livros = [ancora, cacador, combatente, face, infiltrador, tecnico, vanguarda] as unknown as { classes: ClassContentV12[]; subclasses: SubclassContentV12[] }[];
const classes = livros.flatMap(l => l.classes);
const subclasses = livros.flatMap(l => l.subclasses);
const colors = { ancora: "#32c978", cacador: "#dfbd6f", combatente: "#f16d79", face: "#c578d9", infiltrador: "#42b9c7", tecnico: "#f3a342", vanguarda: "#6ba9e7" };
const ranks = ["F", "E", "D", "C", "B", "A", "S", "S+"];
type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "oficina" | "catalogo" | "classe" | "derivados" | "atributoDaPericia" | "rolarTeste">>;

export function ClassPanel({ api }: { api: Api }) {
  const p = progression(api.character);
  const current = classes.find(item => item.slug === p?.classe_id);
  if (!p?.classe_id || !current) return null;
  const sub = reached(p.ranking, "E") ? subclasses.find(item => item.slug === p.subclasse_id && item.classe_slug === current.slug) : undefined;
  const state = readClassPlay(api.character);
  const Icon = ICONES_CLASSE[current.slug] ?? BookOpen;
  const color = colors[current.slug as keyof typeof colors] ?? "#00d4ff";
  const featureRows = [
    ...Object.entries(current.caracteristicas).flatMap(([rank, items]) => reached(p.ranking, rank) ? items.map(item => ({ ...item, rank, source: "Classe" })) : []),
  ].sort((a, b) => ranks.indexOf(a.rank) - ranks.indexOf(b.rank));
  return <section className="hc-panel" data-game={current.slug} style={{ "--hc-accent": color } as React.CSSProperties} aria-label={`Classe ${current.nome}`}>
    <CabecalhoModulo id="ID://CLASSE" mod="MOD.CLASS // 10" />
    <div className="hc-body">
      <header className="hc-hero">
        <div className="hc-game-art" style={{ backgroundImage: `url(/forja/classes/${current.slug}.webp)` }} aria-hidden="true" />
        <div className="hc-emblem"><Icon size={37} strokeWidth={1.4} aria-hidden="true" /></div>
        <div className="hc-heading"><span className="hc-kicker">ARQUIVO DE CLASSE / RUPTURA V1.2</span><h2>{current.nome}</h2>{sub && <p>{sub.nome}</p>}</div>
        <div className="hc-rank"><strong>{p.ranking}</strong><span>RANKING</span></div>
      </header>

      <ClassOperations api={api} classId={p.classe_id} rank={p.ranking} subclassId={sub?.slug} />

      {sub && <SubclassCodex key={sub.slug} sub={sub} rank={p.ranking} color={color} />}

      <ClassModules api={api} current={current} sub={sub} rank={p.ranking} />

      <section className="hc-section hc-features"><div className="hc-section-head"><h3>Características adquiridas</h3><span>{featureRows.length} disponíveis</span></div><div>{featureRows.map(feature => <details key={`${feature.source}-${feature.slug}`}><summary><span className="hc-feature-heading"><strong>{feature.nome}</strong></span><span className="hc-feature-rank">Ranking {feature.rank}</span><ChevronRight size={16} /></summary><div className="hc-feature-description"><TextoComRegras glossario={[]} texto={feature.descricao}/></div></details>)}</div></section>
      {state.last && <p className="hc-status" role="status">{state.last}</p>}
    </div>
  </section>;
}
