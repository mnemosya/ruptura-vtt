"use client";
import { useState } from "react";
import { Plus, Check, Archive } from "lucide-react";
import type { ClassPlayState } from "../../../../../lib/character/classManagement";
type Treatment = { id:string; patient:string; origin:string; successes:number; archived?:boolean };
export function TreatmentRoster({state,save,readOnly,allies}:{state:ClassPlayState;save:(key:string,value:string)=>void;readOnly:boolean;allies:{id:string;nome:string}[]}) {
 const [selected,setSelected]=useState("");
 let records:Treatment[]=[];
 try { const raw=JSON.parse(state.selections.therapyRecords??"null"); if(Array.isArray(raw))records=raw; }catch{}
 if(!state.selections.therapyRecords && state.selections.therapyPatient) records=[{id:"legacy",patient:state.selections.therapyPatient,origin:state.selections.therapyOrigin??"",successes:Number(state.selections.therapySuccesses)||0}];
 const active=records.find(r=>r.id===selected)??records.find(r=>!r.archived);
 const update=(patch:Partial<Treatment>)=>save("therapyRecords",JSON.stringify(records.map(r=>r.id===active?.id?{...r,...patch}:r)));
 return <section className="hc-treatment"><div className="hc-reserve-caption"><span>Pacientes em acompanhamento</span><button disabled={readOnly} onClick={()=>{const id=crypto.randomUUID();save("therapyRecords",JSON.stringify([...records,{id,patient:"",origin:"",successes:0}]));setSelected(id);}}><Plus size={16}/> Novo tratamento</button></div>
 <div className="hc-treatment-tabs">{records.map(r=><button key={r.id} aria-pressed={active?.id===r.id} onClick={()=>setSelected(r.id)}>{r.patient||"Novo paciente"}<small>{r.archived?"Arquivado":`${r.successes}/3 sucessos`}</small></button>)}</div>
 {active ? <div className="hc-playbook"><div className="hc-playbook-fields"><label>Paciente<input list="therapy-allies" disabled={readOnly} value={active.patient} placeholder="Selecione ou escreva o nome" onChange={e=>update({patient:e.target.value})}/><datalist id="therapy-allies">{allies.map(a=><option key={a.id} value={a.nome}/>)}</datalist></label><label>Origem tratada<input disabled={readOnly} value={active.origin} placeholder="Acontecimento responsável pela perda" onChange={e=>update({origin:e.target.value})}/></label></div><div className="hc-therapy-progress"><div><span>Sucessos deste tratamento</span><div className="hc-therapy-pips">{[1,2,3].map(n=><button key={n} disabled={readOnly} aria-label={`Registrar ${n} sucessos`} aria-pressed={n<=active.successes} onClick={()=>update({successes:n===active.successes?n-1:n})}>{n<=active.successes?<Check size={22}/>:n}</button>)}</div></div><strong>{active.successes}/3</strong></div><p>3 sucessos recuperam 1 Integridade. Sessão: 1 hora · Vontade CD 7, +2 vantagem. Intervalo: 6 dias por paciente.</p><button disabled={readOnly} onClick={()=>update({archived:!active.archived})}><Archive size={16}/> {active.archived?"Reabrir tratamento":"Arquivar tratamento"}</button></div>:<p>Adicione um paciente para registrar sua origem e acompanhar as sessões.</p>}
 </section>;
}
