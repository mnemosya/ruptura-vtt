"use client";

import { useState } from "react";
import { ArrowRight, MapPin, Link2, Check, Crosshair, HeartPulse, Minus, Plus, Radio, ScanEye, Shield, Users, Zap } from "lucide-react";
import type { ConsoleApi } from "../../types";
import { availableClassActions, classActionBlock, classResource, readClassPlay, reached } from "../../../../../lib/character/classManagement";
import combatente from "../../../../../../content/v12/db_classe_combatente_v1_2.json";
import "./classOperations.css";
import "./classSecondary.css";
import { GameRepertoire } from "./GameRepertoire";

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "derivados" | "atributoDaPericia" | "rolarTeste">>;
type Maneuver = { id: string; name: string; category: string; description: string };
const maneuverOptions: Maneuver[] = ([
  ["F", "Básica"], ["D", "Tática"], ["B", "Avançada"],
] as const).flatMap(([rank, category]) => {
  const description = combatente.classes[0].caracteristicas[rank][0].descricao;
  const headings = [...description.matchAll(/^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ -]+):\n/gm)];
  return headings.map((heading, index) => ({
    id: heading[1], name: heading[1], category,
    description: description.slice((heading.index ?? 0) + heading[0].length, headings[index + 1]?.index).trim(),
  }));
});

function PolyDie({ faces }: { faces: number }) {
  const shape = faces === 4
    ? <><path d="M24 4 45 42H3Z" /><path d="M24 4v25M3 42l21-13 21 13" /></>
    : faces === 6
      ? <><path d="M24 3 44 14v22L24 47 4 36V14Z" /><path d="m4 14 20 12 20-12M24 26v21" /></>
      : faces === 8
        ? <><path d="M24 3 45 24 24 45 3 24Z" /><path d="M3 24 24 11l21 13-21 13Z" /></>
        : <><path d="M24 2 44 16 41 37 24 47 7 37 4 16Z" /><path d="M4 16 24 24l20-8M7 37l17-13 17 13M24 24v23" /></>;
  return <svg className="hc-poly-die" viewBox="0 0 48 50" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" aria-hidden="true">{shape}</svg>;
}

function HexSlot({ ready }: { ready: boolean }) {
  return <svg viewBox="0 0 64 68" className="hc-breach-hex" data-ready={ready} aria-hidden="true">
    <polygon points="17,2 47,2 62,34 47,66 17,66 2,34" />
    {ready ? <><circle cx="32" cy="34" r="10" /><circle cx="32" cy="34" r="3" /><path d="M12 34h6m28 0h6M32 14v7m0 26v7" /></> : <path d="M25 34h14m-7-7v14" />}
  </svg>;
}

export function ClassOperations({ api, classId, rank, subclassId }: { api: Api; classId: string; rank: string; subclassId?: string }) {
  const [interactionSkill, setInteractionSkill] = useState("influencia");
  const [reserveIndex, setReserveIndex] = useState(0);
  const [dieEditor, setDieEditor] = useState<number | null>(null);
  const [dieValue, setDieValue] = useState("");
  const [choosingManeuvers, setChoosingManeuvers] = useState(false);
  const state = readClassPlay(api.character);
  const resource = classResource(api.character);
  const send = api.classe?.executar;
  const locked = !!api.somenteLeitura || !send;
  const allies = (api.classe?.alvos ?? []).filter(target => target.aliado);
  const paMax = api.derivados?.pa_max ?? 0;
  const paFree = paMax - (api.character.estado_jogo?.pa_gastos ?? 0);

  if (classId === "ancora") {
    const allFocus = reached(rank, "S");
    const limit = allFocus ? allies.length : (reached(rank, "B") ? 3 : reached(rank, "D") ? 2 : 1) + (subclassId === "coordenador" ? reached(rank, "A") ? 3 : reached(rank, "C") ? 2 : 1 : 0);
    const focusIds = allFocus ? allies.map(ally => ally.id) : state.focus;
    const currentTarget = focusIds.includes(state.target ?? "") ? state.target ?? "" : focusIds[0] ?? "";
    const interventions = availableClassActions(api.character).filter(action => ["ajustar", "conter"].includes(action.id));
    return <section className="hc-operation hc-anchor" aria-label="Gestão de Focos e Intervenções">
      <header className="hc-op-head"><div><span className="hc-kicker">01 / REDE DE APOIO</span><h3>Focos e intervenções</h3></div><span className="hc-op-meta">{allFocus ? "EQUIPE INTEIRA" : `${focusIds.length} / ${limit} FOCOS`}</span></header>
      <div className="hc-anchor-layout">
        <div className="hc-anchor-roster"><div className="hc-link-sigil" aria-hidden="true"><svg viewBox="0 0 240 100"><path d="M20 50h55l45-35 45 35h55M75 50l45 35 45-35M120 15v70"/><circle cx="120" cy="50" r="29"/><circle cx="120" cy="50" r="39" strokeDasharray="2 7"/><circle cx="20" cy="50" r="6"/><circle cx="220" cy="50" r="6"/></svg><HeartPulse size={24}/></div><div className="hc-panel-label"><Users size={15} /> Aliados na mesa</div>
          <div className="hc-focus-list">{allies.length ? allies.map(ally => {
            const selected = focusIds.includes(ally.id);
            return <button key={ally.id} type="button" className="hc-focus-card" aria-pressed={selected} disabled={locked} onClick={() => allFocus ? send?.({ type: "target", id: ally.id }) : send?.({ type: "focus", id: ally.id })}>
              <span className="hc-focus-avatar"><Users size={22}/></span><span className="hc-focus-text"><strong>{ally.nome}</strong><small>{selected ? "FOCO DESIGNADO" : "SELECIONAR COMO FOCO"}{ally.pv != null ? ` · ${ally.pv} PV` : ""}</small></span><span className="hc-focus-mark">{selected ? <Check size={16} /> : <Plus size={16} />}</span>
            </button>;
          }) : <div className="hc-focus-empty"><HeartPulse size={24} /><strong>Nenhum aliado disponível</strong><span>Os Focos usam os personagens da mesa.</span></div>}</div>
          <p className="hc-hint">Selecione seus Focos. Um novo vínculo substitui o mais antigo quando as vagas estão ocupadas.</p>
        </div>
        <div className="hc-anchor-interventions"><div className="hc-panel-label"><HeartPulse size={15} /> Intervenções</div><div className="hc-intervention-count"><strong>{state.resource}</strong><span>/ {resource.max}<small>DISPONÍVEIS</small></span></div><div className="hc-intervention-pips">{Array.from({ length: resource.max }, (_, index) => <i key={index} data-ready={index < state.resource} />)}</div>
          <label className="hc-target-select">INTERVIR POR<select value={currentTarget} onChange={event => send?.({ type: "target", id: event.target.value })} disabled={locked || !focusIds.length}>{focusIds.length ? focusIds.map(id => <option key={id} value={id}>{allies.find(ally => ally.id === id)?.nome ?? id}</option>) : <option value="">Escolha um Foco</option>}</select></label>
          <div className="hc-intervention-actions">{interventions.map(action => <button key={action.id} type="button" disabled={locked || !currentTarget || !!classActionBlock(api.character, action, paMax, currentTarget)} onClick={() => send?.({ type: "use", id: action.id, target: currentTarget })}><span>{action.name}</span><small>{action.id === "ajustar" ? "+1 vantagem" : "Reduz a consequência"}</small></button>)}</div>
        </div>
      </div>
    </section>;
  }

  if (classId === "cacador") {
    const pending = Number(state.selections.reservaPendente ?? 0);
    return <section className="hc-operation hc-hunter" aria-label="Reserva Tática">
      <header className="hc-op-head"><div><span className="hc-kicker">01 / PLANEJAMENTO TÁTICO</span><h3>Reserva Tática</h3></div><Crosshair size={28} aria-hidden="true" /></header>
      <div className="hc-hunter-console">
        <div className="hc-hunter-primary"><span className="hc-panel-label">PA PARA A PRÓXIMA RODADA</span><div className="hc-hunter-adjust"><button type="button" aria-label="Reduzir PA conservados" disabled={locked || pending <= 0} onClick={() => send?.({ type: "reserveSet", value: pending - 1 })}><Minus size={18} /></button><div className="hc-reserve-dial"><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="68"/><circle cx="80" cy="80" r="59" strokeDasharray="1 7"/><path d="M80 6v17m0 114v17M6 80h17m114 0h17"/>{Array.from({ length: resource.max }, (_, index) => <path key={index} data-ready={index < pending} d="M56 31a55 55 0 0 1 48 0" transform={`rotate(${index * 360 / resource.max} 80 80)`}/>)}</svg><strong>{pending}<small> / {resource.max}</small></strong></div><button type="button" aria-label="Aumentar PA conservados" disabled={locked || pending >= resource.max} onClick={() => send?.({ type: "reserveSet", value: pending + 1 })}><Plus size={18} /></button></div><p>Ajuste o valor ao encerrar a rodada. A mesa confirma quais PA podem ser conservados.</p></div>
        <div className="hc-hunter-hud"><div><span>PA AGORA</span><strong>{paFree}<small> / {paMax}</small></strong></div><div><span>VINDOS DA RODADA ANTERIOR</span><strong>+{state.resource}</strong></div><p>O saldo usa os PA da ficha. Alterar a reserva atual atualiza esse saldo.</p></div>
      </div>
    </section>;
  }

  if (classId === "combatente") {
    const learned = reached(rank, "S") ? 6 : reached(rank, "B") ? 5 : reached(rank, "D") ? 4 : 3;
    const selected = (state.selections.manobras ?? "").split("|").filter(Boolean);
    const available = maneuverOptions.filter(option => reached(rank, option.category === "Básica" ? "F" : option.category === "Tática" ? "D" : "B"));
    const spentDice = state.spentDice ?? [];
    const toggleManeuver = (id: string) => send?.({ type: "select", key: "manobras", value: (selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]).join("|") });
    return <section className="hc-operation hc-fighter" aria-label="Dados de Manobra">
      <header className="hc-op-head"><div><span className="hc-kicker">01 / DOUTRINA DE COMBATE</span><h3>Dados de Manobra</h3></div><span className="hc-op-meta">{state.resource} / 4 PRONTOS</span></header>
      <div className="hc-die-bank">{Array.from({ length: 4 }, (_, index) => { const ready = !spentDice.includes(index); return <button key={index} type="button" className="hc-manouver-die" data-ready={ready} aria-pressed={!ready} disabled={locked} onClick={() => send?.({ type: "toggleDie", index })} aria-label={`Dado de manobra ${index + 1}: d${resource.die} ${ready ? "disponível; clicar para gastar" : "gasto; clicar para restaurar"}`}><span className="hc-die-number">0{index + 1}</span><PolyDie faces={resource.die ?? 4} /><strong>d{resource.die}</strong><small>{ready ? "PRONTO" : "GASTO"}</small></button>; })}</div>
      <p className="hc-hint">Clique no dado para gastar ou devolver · Recuperação no descanso longo</p>
      <div className="hc-maneuvers"><div className="hc-maneuvers-top"><div><span>MANOBRAS APRENDIDAS</span><strong>{selected.length ? `${selected.length} ${selected.length === 1 ? "técnica" : "técnicas"} no seu repertório` : "Escolha seu repertório"}</strong></div><button type="button" disabled={locked} aria-expanded={choosingManeuvers} onClick={() => setChoosingManeuvers(open => !open)}>{choosingManeuvers ? "Fechar" : `Selecionar · ${selected.length}/${learned}`}<ArrowRight size={14} /></button></div>{!choosingManeuvers && selected.length > 0 && <GameRepertoire compact entries={maneuverOptions.filter(option => selected.includes(option.id))}/>} {choosingManeuvers && <GameRepertoire entries={available} selected={selected} readOnly={locked} max={learned} onToggle={toggleManeuver}/>}</div>
    </section>;
  }

  if (classId === "face") {
    const test = state.test;
    const roll = () => { const attribute = api.atributoDaPericia?.(interactionSkill) ?? "animo"; const value = api.character.atributos[attribute]; const count = value > 0 ? value : 2 + Math.abs(value); const random = new Uint32Array(count); crypto.getRandomValues(random); send?.({ type: "interactionStart", faces: Array.from(random, value => value % 8 + 1), skill: interactionSkill, attribute }); };
    const openEditor = (index: number) => { setDieEditor(index); setDieValue(state.dice[index]?.toString() ?? ""); setReserveIndex(index); };
    const saveDie = () => { if (dieEditor !== null && /^[1-8]$/.test(dieValue)) { send?.({ type: "setDie", index: dieEditor, value: Number(dieValue) }); setDieEditor(null); } };
    return <section className="hc-operation hc-face" aria-label="Reserva de Confiança">
      <header className="hc-op-head"><div><span className="hc-kicker">01 / INFLUÊNCIA</span><h3>Reserva de Confiança</h3></div><span className="hc-op-meta">{state.dice.length} / {resource.max} D8 GUARDADOS</span></header>
      <div className="hc-face-layout"><div className="hc-face-reserve"><div className="hc-panel-label">RESULTADOS PRESERVADOS</div><div className="hc-face-slots">{Array.from({ length: resource.max }, (_, index) => <button key={index} type="button" aria-label={`Editar dado guardado ${index + 1}: ${state.dice[index] ?? "vazio"}`} disabled={locked || index > state.dice.length} onClick={() => openEditor(index)} data-filled={state.dice[index] != null}><small>0{index + 1}</small><svg className="hc-confidence-gem" viewBox="0 0 100 110" aria-hidden="true"><path d="M50 4 94 55 50 106 6 55Z"/><path d="M6 55 50 25 94 55 50 85Z"/></svg><strong>{state.dice[index] ?? "+"}</strong><span>{state.dice[index] == null ? "INSERIR VALOR" : "EDITAR D8"}</span></button>)}</div>
        {dieEditor !== null && <div className="hc-die-editor"><label>RESULTADO DO D8<input autoFocus type="number" inputMode="numeric" min="1" max="8" value={dieValue} onChange={event => setDieValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") saveDie(); if (event.key === "Escape") setDieEditor(null); }} /></label><button type="button" disabled={!/^[1-8]$/.test(dieValue)} onClick={saveDie}>Salvar</button>{state.dice[dieEditor] != null && <button type="button" onClick={() => { send?.({ type: "setDie", index: dieEditor, value: null }); setDieEditor(null); }}>Remover</button>}</div>}
        <p>{reached(rank, "B") ? "Resultados permanecem até o fim da operação." : "Resultados permanecem até o fim da cena."} Clique num dado para registrar o valor obtido na mesa.</p></div>
        <div className="hc-face-test"><div className="hc-panel-label">TESTE DE INTERAÇÃO</div>{!test ? <><p>Role aqui ou registre um resultado manualmente na reserva. Guarde ou troque dados antes da resolução.</p><div className="hc-face-start"><select aria-label="Perícia de Interação" value={interactionSkill} onChange={event => setInteractionSkill(event.target.value)}>{["artes", "carisma", "influencia", "intimidacao", "psicologia", "sociedade"].map(skill => <option key={skill} value={skill}>{skill}</option>)}</select><button type="button" disabled={locked || !api.atributoDaPericia || !api.rolarTeste} onClick={roll}>Rolar d8 <ArrowRight size={15} /></button></div></> : <><div className="hc-face-rolled">{test.dice.map((die, index) => <div key={index} className="hc-rolled-die"><strong>{die}</strong><span>d8</span><div><button type="button" disabled={locked || test.dice.length <= 1 || state.dice.length >= resource.max} onClick={() => send?.({ type: "storeDie", index })}>Guardar</button><button type="button" disabled={locked || state.dice[reserveIndex] == null} onClick={() => send?.({ type: "swapDie", index, reserveIndex })}>Trocar</button></div></div>)}</div><button type="button" className="hc-face-resolve" disabled={locked || !api.rolarTeste} onClick={() => { api.rolarTeste?.({ atributoId: test.attribute as "corpo" | "mente" | "animo", periciaId: test.skill, modificador: 0, cd: null, dados: test.dice, visibilidade: "public" }); send?.({ type: "interactionDone" }); }}>Resolver teste <ArrowRight size={15} /></button></>}</div></div>
    </section>;
  }

  if (classId === "infiltrador") return <section className="hc-operation hc-infiltrator" aria-label="Brechas">
    <header className="hc-op-head"><div><span className="hc-kicker">01 / OPORTUNIDADES</span><h3>Brechas</h3></div><span className="hc-op-meta">VÁLIDAS NESTA CENA</span></header>
    <div className="hc-infiltrator-layout"><div className="hc-breach-bank"><div className="hc-panel-label"><ScanEye size={15} /> Brechas prontas</div><div className="hc-breach-circuit" aria-hidden="true"><svg viewBox="0 0 300 50"><path d="M0 8h45l30 30h45l15-15h30l15 15h45l30-30h45M0 25h30l20 20M300 25h-30l-20 20"/><circle cx="150" cy="23" r="7"/></svg></div><div className="hc-breach-slots">{Array.from({ length: resource.max }, (_, index) => <HexSlot key={index} ready={index < state.resource} />)}</div><strong>{state.resource}<small> / {resource.max}</small></strong></div><div className="hc-breach-play"><p>Registre uma Brecha quando superar vigilância, acesso ou outro obstáculo. Gaste quando ela fizer diferença na ação.</p><div><button type="button" disabled={locked || state.resource >= resource.max} onClick={() => send?.({ type: "gain" })}><Plus size={15} /> Ganhar Brecha</button><button type="button" disabled={locked || state.resource < 1} onClick={() => send?.({ type: "spend" })}><Minus size={15} /> Gastar Brecha</button></div><small>Os gatilhos e limites de uso são resolvidos pela mesa.</small></div></div>
  </section>;

  if (classId === "tecnico") {
    const installed = state.entities.filter(entity => entity.kind === "unidade").length;
    return <section className="hc-operation hc-technician" aria-label="Unidades de Campo">
      <header className="hc-op-head"><div><span className="hc-kicker">01 / REDE DE CAMPO</span><h3>Unidades de Campo</h3></div><span className="hc-op-meta">{installed} / {resource.max} INSTALADAS</span></header>
      <div className="hc-unit-grid">{Array.from({ length: resource.max }, (_, index) => { const unit = state.entities.find(entity => entity.id === `unit-${index}`); const pd = unit?.value ?? 0; const mode = state.selections[`unit-${index}-mode`] === "attached" ? "attached" : "positioned"; return <article key={index} data-installed={!!unit}><div className="hc-unit-top"><span>UNIDADE / 0{index + 1}</span><Radio size={20} /></div><div className="hc-unit-schematic" aria-hidden="true"><svg viewBox="0 0 260 160"><ellipse cx="130" cy="131" rx="75" ry="15"/><path d="M35 131h190M130 15v12M30 80h33m134 0h33M85 118l-18 22m108-22 18 22"/><path className="hc-unit-shell" d="m130 24 52 30v60l-52 28-52-28V54Z"/><path d="m78 54 52 30 52-30M130 84v58M92 47l38 22 38-22M93 101l22 13m30 0 22-13"/><path className="hc-unit-core" d="m130 40 19 11-19 11-19-11Z"/><circle cx="130" cy="94" r="12"/><path d="M124 94h12m-6-6v12"/></svg></div><div className="hc-unit-center"><div className="hc-unit-ring" style={{ "--unit-fill": `${pd * 10}%` } as React.CSSProperties}><strong>{unit ? pd : "—"}</strong><small>/ 10 PD</small></div><div><strong>{unit ? pd > 0 ? "EM CAMPO" : "SEM PD" : "RECOLHIDA"}</strong><p>{unit ? "Integridade da unidade" : "Pronta para instalar"}</p></div></div>{!unit ? <div className="hc-unit-deploy"><span className="hc-panel-label">FORMA DE INSTALAÇÃO</span><div className="hc-deploy-options">{(["positioned", "attached"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} disabled={locked} onClick={() => send?.({ type: "select", key: `unit-${index}-mode`, value })}>{value === "positioned" ? <MapPin size={22}/> : <Link2 size={22}/>}<strong>{value === "positioned" ? "Posicionada" : "Acoplada"}</strong><small>{value === "positioned" ? "Ocupa um espaço · raio de 4 m" : "Acompanha o sistema conectado"}</small></button>)}</div>{mode === "attached" && <label className="hc-attachment-field">SISTEMA CONECTADO<input list={`unit-${index}-equipment`} placeholder="Equipamento, escalpo, Nó ou outro sistema" disabled={locked} value={state.selections[`unit-${index}-attachment`] ?? ""} onChange={event => send?.({ type: "select", key: `unit-${index}-attachment`, value: event.target.value })}/><datalist id={`unit-${index}-equipment`}>{(api.character.inventario ?? []).map(item => <option key={item.id} value={item.itemNome}/>)}</datalist></label>}</div> : <div className="hc-unit-mount">{unit.installation === "attached" ? <Link2 size={20}/> : <MapPin size={20}/>}<div><strong>{unit.installation === "attached" ? "Acoplada" : unit.installation === "positioned" ? "Posicionada" : "Instalação não registrada"}</strong><small>{unit.installation === "attached" ? unit.attachment || "Sistema não informado" : unit.installation === "positioned" ? "Área de atuação · 4 m de raio" : "Recolha e instale para definir a forma."}</small></div></div>}{unit && <div className="hc-unit-pd"><span>AJUSTAR PD</span><div><button type="button" aria-label={`Reduzir PD da Unidade ${index + 1}`} disabled={locked || pd <= 0} onClick={() => send?.({ type: "unitPd", index, value: pd - 1 })}><Minus size={15} /></button><strong>{pd} / 10</strong><button type="button" aria-label={`Aumentar PD da Unidade ${index + 1}`} disabled={locked || pd >= 10} onClick={() => send?.({ type: "unitPd", index, value: pd + 1 })}><Plus size={15} /></button></div></div>}<button type="button" className="hc-unit-install" disabled={locked || paFree < 1} onClick={() => send?.({ type: "unit", index, operation: unit ? "retrieve" : "install", installation: mode, attachment: state.selections[`unit-${index}-attachment`] })}>{unit ? "Recolher" : "Instalar"} · 1 PA <ArrowRight size={14} /></button></article>; })}</div><p className="hc-technician-note">Registre perda e reparo de PD na unidade. Funções e protocolos disponíveis aparecem no módulo abaixo.</p>
    </section>;
  }

  const furyAction = subclassId === "berserker" ? availableClassActions(api.character).find(action => action.id === "furia") : undefined;
  return <section className="hc-operation hc-vanguard" aria-label="Ímpeto">
    <header className="hc-op-head"><div><span className="hc-kicker">01 / LINHA DE FRENTE</span><h3>Ímpeto</h3></div><Shield size={27} aria-hidden="true" /></header>
    <div className="hc-vanguard-layout"><div className="hc-momentum"><svg className="hc-momentum-crest" viewBox="0 0 180 160" aria-hidden="true"><path d="M90 8 156 32v66l-66 52-66-52V32Z"/><path d="m90 20 54 22v50l-54 44-54-44V42Z"/><path d="M90 37 61 84h24l-6 38 40-55H95l10-30Z"/><path d="M7 55h9m148 0h9M7 80h9m148 0h9M7 105h9m148 0h9"/></svg><div className="hc-panel-label"><Zap size={15} /> Ímpeto disponível</div><div className="hc-momentum-track">{Array.from({ length: resource.max }, (_, index) => <span key={index} data-ready={index < state.resource}><Zap size={25} /></span>)}</div><div className="hc-momentum-count"><strong>{state.resource}</strong><span>/ {resource.max}</span></div></div><div className="hc-vanguard-play"><p>Ganhe Ímpeto ao entrar ou começar o turno junto a uma ameaça.</p><strong>2 m <small>de avanço por Ímpeto gasto após uma ação</small></strong><div><button type="button" disabled={locked || state.resource >= resource.max} onClick={() => send?.({ type: "gain" })}>Ganhar Ímpeto</button><button type="button" disabled={locked || state.resource < 1} onClick={() => send?.({ type: "spend" })}>Gastar 1</button></div></div></div>
    {furyAction && <div className="hc-fury-module"><div><span className="hc-panel-label"><Zap size={15} /> Fúria</span><p>{state.active.furia ? "Ativa nesta cena" : "Acompanhe a ativação durante o confronto."}</p></div><button type="button" aria-pressed={!!state.active.furia} disabled={locked || (!state.active.furia && !!classActionBlock(api.character, furyAction, paMax))} onClick={() => send?.(state.active.furia ? { type: "clearActive", id: "furia" } : { type: "use", id: "furia" })}>{state.active.furia ? "Encerrar Fúria" : "Ativar Fúria"}</button></div>}
  </section>;
}
