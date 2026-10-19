"use client";

import { useRef, useState } from "react";
import { ArrowRight, BookOpen, ChevronRight, ClipboardList, Crosshair, Radio, Users, Wrench, X, PawPrint } from "lucide-react";
import type { ConsoleApi } from "../../types";
import type { ClassContentV12, SubclassContentV12 } from "../../../../../lib/rulesetV12/contracts";
import { readClassPlay, reached } from "../../../../../lib/character/classManagement";
import { JanelaMercado } from "../hud/JanelaMercado";
import "./classModules.css";
import "./classSecondary.css";
import { WorkshopPanel } from "./WorkshopPanel";
import { HuntingCompanionCard, HuntingCompanionPanel } from "./HuntingCompanionPanel";
import { MachineRoster } from "./MachineRoster";
import { TreatmentRoster } from "./TreatmentRoster";
import skillRules from "../../../../../../content/db_regras_personagem_normalizado_v1_4.json";
import { ModulePlaybook } from "./ModulePlaybook";
import { oxanium } from "../../../../_design/oxanium";
import "./classPolish.css";
import { GameRepertoire } from "./GameRepertoire";
import { TextoComRegras } from "../../TextoComRegras";

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "oficina" | "catalogo" | "derivados">>;
type Module = { key: string; title: string; subtitle: string; feature: string; icon: typeof BookOpen };
const subclassModules: Record<string, Module> = {
  "mago_de_batalha": { key: "modulations", title: "Modulações de Combate", subtitle: "Molde o dano, a área e o alcance", feature: "Modulação de Combate", icon: BookOpen },
  coordenador: { key: "briefing", title: "Briefing Operacional", subtitle: "Focos, perícias e orientação", feature: "Briefing Operacional", icon: Users },
  terapeuta: { key: "therapy", title: "Tratamentos", subtitle: "Acompanhamento e recuperação", feature: "Acompanhamento Terapêutico", icon: ClipboardList },
  vitalista: { key: "triage", title: "Triagem de Combate", subtitle: "PV dos aliados da mesa", feature: "Triagem de Combate", icon: Users },
  domador: { key: "companion", title: "Companheiro de Caça", subtitle: "Ficha, turno e comando", feature: "Companheiro de Caça", icon: PawPrint },
  perito: { key: "dossier", title: "Dossiê", subtitle: "Alvo e até três deduções", feature: "Dossiê", icon: ClipboardList },
  mercador: { key: "trade", title: "Negociações", subtitle: "Intermediação e reserva própria", feature: "Intermediação", icon: ClipboardList },
  artifice: { key: "workshop", title: "Oficina", subtitle: "Modificações e projetos", feature: "Oficina", icon: Wrench },
  maquinista: { key: "machines", title: "Máquinas vinculadas", subtitle: "Modos e comando das unidades", feature: "Modos de Operação", icon: Radio },
  tecelao: { key: "weave", title: "Unidades na Trama", subtitle: "Posição digital e processamento", feature: "Unidades na Trama", icon: Radio },
  biomecanico: { key: "bio", title: "Procedimento Biomecânico", subtitle: "Equipamentos e limites", feature: "Procedimento Biomecânico", icon: Wrench },
  icone: { key: "persona", title: "Persona Pública", subtitle: "Identidade e mobilização", feature: "Persona Pública", icon: Users },
};
const ranks = ["F", "E", "D", "C", "B", "A", "S", "S+"];
function featureText(model: ClassContentV12 | SubclassContentV12 | undefined, name: string): string {
  if (!model) return "";
  const features = model.caracteristicas as Record<string, { nome: string; descricao: string }[] | undefined>;
  for (const rank of ranks) {
    const match = features[rank]?.find(item => item.nome === name);
    if (match) return match.descricao;
  }
  return "";
}
function ruleSections(text: string) {
  return <TextoComRegras texto={text} glossario={[]} />;
}
const prepNames = ["AÇÃO CALCULADA", "EQUIPAMENTO SEPARADO", "PLANO ALTERNATIVO", "REPOSICIONAMENTO PREVISTO", "SAÍDA PLANEJADA", "SINAL COMBINADO"];
const socialNames = ["Arrancar", "Comprometer", "Desviar", "Expor", "Hesitar", "Isolar", "Provocar", "Viabilizar"];
function prepSummary(text: string, name: string) {
  const start = text.indexOf(`${name}:\n`);
  if (start < 0) return "Consulte a característica.";
  const next = prepNames.map(other => text.indexOf(`${other}:\n`, start + name.length + 2)).filter(index => index > start).sort((a, b) => a - b)[0] ?? text.length;
  return text.slice(start + name.length + 2, next).trim();
}
function socialSummary(text: string, name: string) {
  return text.match(new RegExp(`^- ${name}: (.+)$`, "m"))?.[1] ?? "Consulte a característica.";
}
function technicalFunctions(model: ClassContentV12, rank: string) {
  return (["F", "D", "B"] as const).filter(required => reached(rank, required)).flatMap(required => {
    const text = featureText(model, `Funções do Ranking ${required}`);
    const headings = [...text.matchAll(/^([A-ZÁÉÍÓÚÇÃÕÊÔÜ ]+):\n/gm)];
    return headings.map((heading, index) => ({ name: heading[1], description: text.slice((heading.index ?? 0) + heading[0].length, headings[index + 1]?.index).trim(), rank: required }));
  });
}

export function ClassModules({ api, current, sub, rank }: { api: Api; current: ClassContentV12; sub?: SubclassContentV12; rank: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const state = readClassPlay(api.character);
  const send = api.classe?.executar;
  const readOnly = !!api.somenteLeitura || !send;
  const core: Module[] = current.slug === "cacador" && reached(rank, "D")
    ? [{ key: "preps", title: "Preparos", subtitle: "Escolhas após descanso longo", feature: "Preparado para Tudo", icon: Crosshair }]
    : current.slug === "tecnico"
      ? [{ key: "functions", title: "Funções e protocolos", subtitle: "Regras por ranking e por unidade", feature: "Funções do Ranking F", icon: Radio }]
      : current.slug === "face"
        ? [{ key: "social", title: "Manobras Sociais", subtitle: "Oito opções para seus testes", feature: "Manobras Sociais", icon: Users }]
        : [];
  const specialized = sub && subclassModules[sub.slug] && (sub.slug !== "vitalista" || reached(rank, "C")) ? subclassModules[sub.slug] : undefined;
  const modules = [...core, ...(specialized ? [specialized] : [])];
  if (!modules.length) return null;
  const active = modules.find(module => module.key === open);
  const source = active && active === specialized ? sub : current;
  const rule = active ? featureText(source, active.feature) : "";
  const selectedPreps = (state.selections.preparos ?? "").split("|").filter(Boolean);
  const functions = current.slug === "tecnico" ? technicalFunctions(current, rank) : [];
  const prepRule = featureText(current, "Preparado para Tudo");
  const maxPreps = reached(rank, "S") ? 3 : 2;
  const togglePrep = (name: string) => send?.({ type: "select", key: "preparos", value: (selectedPreps.includes(name) ? selectedPreps.filter(value => value !== name) : [...selectedPreps, name]).join("|") });
  const allies = (api.classe?.alvos ?? []).filter(target => target.aliado);
  const deductions = [0, 1, 2].map(index => state.selections[`dossier-deduction-${index}`] ?? "");
  const relatedNames: Record<string, string[]> = { modulations: ["Modulação Composta", "Bombardeio Perfeito"], workshop: ["Modificações", "Projetos"], persona: ["Cativar", "Mobilizar"], bio: ["Forçar Limites"], companion: [] };
  const related = active && sub ? Object.entries(sub.caracteristicas).flatMap(([required, items]) => reached(rank, required) ? items.filter(item => relatedNames[active.key]?.includes(item.nome)).map(item => ({ id: item.slug, name: item.nome, description: item.descricao, category: `Ranking ${required}` })) : []) : [];

  return <section className="hc-section hc-modules"><div className="hc-section-head"><h3>Ferramentas de classe</h3><span>ABRIR QUANDO PRECISAR</span></div>
    {current.slug === "cacador" && reached(rank, "D") && <div className="hc-loadout"><div className="hc-loadout-label"><Crosshair size={17}/><span>PREPAROS EQUIPADOS</span><strong>{selectedPreps.length} / {maxPreps}</strong></div>{selectedPreps.length ? <GameRepertoire compact entries={selectedPreps.map(name => ({ id: name, name, description: prepSummary(prepRule, name), category: "PREPARO EQUIPADO" }))}/> : <p>Escolha seus Preparos no catálogo abaixo.</p>}</div>}
    <div className="hc-module-grid">{modules.map(module => { if(module.key === "companion") return <HuntingCompanionCard key={module.key} api={api} rank={rank} open={event => {opener.current = event.currentTarget;setOpen(module.key);}}/>; const Icon = module.icon; return <button type="button" key={module.key} onClick={event => { opener.current = event.currentTarget; setOpen(module.key); }} className="hc-module-card" data-core={true} data-tool={module.key}><span className="hc-module-icon"><Icon size={22} /></span><span><strong>{module.title}</strong><small>{module.subtitle}</small></span><ChevronRight size={17} /></button>; })}</div>
    {active && <JanelaMercado titulo={active.title} onFechar={() => { setOpen(null); requestAnimationFrame(() => opener.current?.focus()); }}>{close => <div className={`hc-module-dialog ${oxanium.variable}`} data-core={current.slug} data-tool={active.key} style={{ "--hc-module-art": `url(/forja/classes/${current.slug}.webp)`, "--hc-accent": ({ancora:"#32c978",cacador:"#dfbd6f",combatente:"#f16d79",face:"#c578d9",infiltrador:"#42b9c7",tecnico:"#f3a342",vanguarda:"#6ba9e7"} as Record<string,string>)[current.slug] } as React.CSSProperties}>
      <header><span className="hc-module-header-icon"><active.icon size={28}/></span><div><span> {source?.nome ?? current.nome}</span><h2>{active.title}</h2></div><button type="button" onClick={close} aria-label="Fechar módulo"><X size={19} /></button></header>
      <div className="hc-module-content">
        {active.key === "companion" ? <HuntingCompanionPanel api={api} rank={rank}/> : active.key === "workshop" ? <WorkshopPanel api={api}/> : active.key === "therapy" ? <TreatmentRoster state={state} readOnly={readOnly} allies={allies} save={(key,value)=>send?.({type:"select",key,value})}/> : <ModulePlaybook key={active.key} kind={active.key} state={state} readOnly={readOnly} save={(key, value) => send?.({ type: "select", key, value })}/>}
        {active.key === "preps" && <section className="hc-module-manager"><div className="hc-module-label">ESCOLHAS ATIVAS · {selectedPreps.length}/{maxPreps}</div><p>Escolha os Preparos após o descanso longo. Marque os que compõem seu repertório; a mesa acompanha os usos por cena.</p><GameRepertoire entries={prepNames.map(name => ({id: name, name, category: "PREPARO", description: prepSummary(rule, name)}))} selected={selectedPreps} max={maxPreps} readOnly={readOnly} onToggle={togglePrep}/></section>}
        {active.key === "functions" && <section className="hc-module-manager"><div className="hc-module-label">REDE DE UNIDADES</div><div className="hc-protocol-list">{state.entities.filter(entity => entity.kind === "unidade").map(unit => <div key={unit.id}><strong>{unit.name} <small>{unit.value ?? 0}/10 PD</small></strong>{reached(rank, "D") && <div className="hc-protocol-fields"><label>QUANDO<input type="text" placeholder="Gatilho percebido pela unidade" disabled={readOnly} value={state.selections[`${unit.id}-trigger`] ?? ""} onChange={event => send?.({ type: "select", key: `${unit.id}-trigger`, value: event.target.value })} /></label><label>EXECUTE<input type="text" placeholder="Função e alvo definidos" disabled={readOnly} value={state.selections[`${unit.id}-response`] ?? ""} onChange={event => send?.({ type: "select", key: `${unit.id}-response`, value: event.target.value })} /></label></div>}</div>)}</div><p>{state.entities.some(entity => entity.kind === "unidade") ? reached(rank, "D") ? "Protocolos registram o plano. A mesa decide quando o gatilho ocorre e resolve a Função." : "Consulte as Funções disponíveis para suas unidades. Protocolos são adquiridos no ranking D." : reached(rank, "D") ? "Instale uma Unidade de Campo para programar seu Protocolo." : "Consulte as Funções disponíveis antes de instalar sua unidade."}</p><div className="hc-module-label">FUNÇÕES DISPONÍVEIS NO RANKING {rank}</div><GameRepertoire entries={functions.map(fn => ({id: fn.name, name: fn.name, category: `FUNÇÃO · RANKING ${fn.rank}`, description: fn.description}))}/>{reached(rank, "D") && <details className="hc-module-rules"><summary><BookOpen size={15} /> Protocolo Reativo <ChevronRight size={15} /></summary><div>{ruleSections(featureText(current, "Protocolo Reativo"))}</div></details>}</section>}
        {active.key === "briefing" && <section className="hc-module-manager"><div className="hc-module-label">PARTICIPANTES E PERÍCIAS</div><div className="hc-briefing-roster">{allies.map(ally => <label key={ally.id}><span><Users size={18}/><strong>{ally.nome}</strong></span><select disabled={readOnly} aria-label={`Perícia de ${ally.nome} no briefing`} value={state.selections[`briefing-${ally.id}`] ?? ""} onChange={event => send?.({type: "select", key: `briefing-${ally.id}`, value: event.target.value})}><option value="">Não participa</option>{skillRules.pericias.map(skill=><option key={skill.id} value={skill.id}>{skill.nome}</option>)}</select></label>)}</div>{!allies.length && <p className="hc-module-empty">Os aliados da mesa aparecem aqui para preparar o briefing.</p>}</section>}
        {active.key === "machines" && <MachineRoster api={api}/>}
        {active.key === "weave" && <section className="hc-module-manager"><div className="hc-module-label">UNIDADES DISPONÍVEIS</div><div className="hc-triage-list">{state.entities.filter(entity => entity.kind === "unidade").map(unit => <div key={unit.id}><Radio size={20}/><strong>{unit.name}</strong><span>{unit.value ?? 0} PD · {unit.installation === "attached" ? unit.attachment || "Acoplada" : unit.installation === "positioned" ? "Posicionada" : "Forma não registrada"}</span></div>)}</div>{!state.entities.some(entity => entity.kind === "unidade") && <p className="hc-module-empty">Nenhuma Unidade de Campo instalada. Suas unidades aparecem aqui após a instalação na aba Classe.</p>}</section>}
        {active.key === "dossier" && <section className="hc-module-manager"><div className="hc-module-label">INVESTIGAÇÃO ATUAL · {deductions.filter(Boolean).length}/3 DEDUÇÕES</div><label className="hc-module-field">OBJETO DO DOSSIÊ<input type="text" placeholder="Criatura, grupo, local, evento ou fenômeno" disabled={readOnly} value={state.selections.dossierTarget ?? ""} onChange={event => send?.({ type: "select", key: "dossierTarget", value: event.target.value })} /></label>{deductions.map((value, index) => <label key={index} className="hc-module-field">DEDUÇÃO 0{index + 1}<textarea rows={2} placeholder="Conclusão sustentada por evidências" disabled={readOnly} value={value} onChange={event => send?.({ type: "select", key: `dossier-deduction-${index}`, value: event.target.value })} /></label>)}</section>}
        {active.key === "triage" && <section className="hc-module-manager"><div className="hc-module-label">ALIADOS DA MESA</div><div className="hc-triage-list">{allies.map(ally => <div key={ally.id}><strong>{ally.nome}</strong><span>{ally.pv == null ? "PV não visíveis" : `${ally.pv} PV`}{ally.condicoes?.length ? ` · ${ally.condicoes.join(", ")}` : ""}</span></div>)}</div></section>}
        {active.key === "social" && <section className="hc-module-manager"><div className="hc-module-label">REPERTÓRIO FIXO</div><GameRepertoire entries={socialNames.map(name => ({id: name, name, category: "MANOBRA SOCIAL", description: socialSummary(rule, name)}))}/></section>}



        {!!related.length && <section className="hc-module-related"><div className="hc-module-label">REPERTÓRIO DA ESPECIALIZAÇÃO</div><GameRepertoire entries={related}/></section>}
        {!["preps", "functions", "social"].includes(active.key) && <details className="hc-module-rules"><summary><BookOpen size={15} /> Consultar regra completa <ChevronRight size={15} /></summary><div>{<TextoComRegras glossario={[]} texto={rule}/>}</div></details>}
      </div>
      <footer><span>RUPTURA V1.2 · {current.nome.toUpperCase()}</span><button type="button" onClick={close}>Voltar à classe <ArrowRight size={14} /></button></footer>
    </div>}</JanelaMercado>}
  </section>;
}
