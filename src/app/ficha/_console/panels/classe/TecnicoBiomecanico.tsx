"use client";

import { useState } from "react";
import type { ConsoleApi } from "../../types";
import type { ClassPlayState } from "../../../../../lib/character/classManagement";
import { estadoEscalpo, funcaoDaRodada, type Melhoria, type TecnicoAcao } from "../../../../../lib/character/tecnicoTela";
import { ItemCategoryIcon } from "../../../../_design/itemIcons";
import { Painel } from "./painelClasse";
import type { ModSub } from "./tecnicoSub";
import "./tecnicoBiomecanico.css";

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

const MELHORIAS: { id: Melhoria; nome: string; curta: string; zona: string; d: string }[] = [
  { id: "bonus", nome: "Bônus", curta: "+1 NUM BÔNUS FIXO", zona: "+1D4 NUM BÔNUS FIXO", d: "M12 5v14M5 12h14" },
  { id: "desempenho", nome: "Desempenho", curta: "+2 M OU +2 DE DANO", zona: "+6 M OU +1D8 DE DANO", d: "M13 2 4 14h7l-1 8 9-12h-7Z" },
  { id: "protecao", nome: "Proteção", curta: "+2 MIT OU PD TEMPORÁRIOS", zona: "+1D8 MIT OU PD TEMPORÁRIOS", d: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" },
  { id: "ativacao", nome: "Ativação", curta: "ATIVA SEM GASTAR PA", zona: "SEM PA + UMA MELHORIA", d: "M6 4l13 8-13 8Z" },
  { id: "uso", nome: "Uso adicional", curta: "+1 USO JÁ ESGOTADO", zona: "+2 USOS JÁ ESGOTADOS", d: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" },
];
const ICONES = {
  mit: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6ZM9 12l2 2 4-4",
  desgaste: "M12 3v4M12 17v4M5 12H3M21 12h-2M7 7 5.5 5.5M18.5 18.5 17 17M7 17l-1.5 1.5M18.5 5.5 17 7M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  estab: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z",
  zona: "M12 3 2 20h20ZM12 10v4M12 17h.01",
};
const DICA_FORCAR = "Uma vez por cena, potencialize um escalpo em você, numa criatura ao seu alcance ou numa criatura com uma Unidade sua acoplada. Declare antes da ativação ou de resolver o efeito; não custa PA e pode ser fora do seu turno. Toque num escalpo para escolher a melhoria.";
const DICA_ZONA = "Uma vez por cena, ao usar Forçar Limites, leve o escalpo à Zona Vermelha: a melhoria fica mais forte e o escalpo ignora impedimentos técnicos temporários até o fim da cena. Ao fim da cena ele fica inativo até 10 minutos de procedimento técnico. Toque para ligar ou desligar antes de forçar.";
const rolarD6 = () => 1 + Math.floor(Math.random() * 6);

type Escalpo = { id: string; nome: string; cat: string; desc: string; categoria: string };

function escalposDoPersonagem(api: Pick<ConsoleApi, "character"> & Partial<Pick<ConsoleApi, "escalpos">>): Escalpo[] {
  return (api.character.escalpos_instalados ?? []).map(e => {
    const m = api.escalpos?.catalogo.find(x => x.id === e.contentId || x.slug === e.contentId);
    return { id: e.id, nome: e.nomeCustomizado || (m?.nome ?? e.contentId).replace(/\s*\(.*\)$/, ""), cat: (m?.categoriaLabel ?? m?.categoria ?? "escalpo").toUpperCase(), desc: m?.descricaoCurta ?? "", categoria: m?.categoria ?? "escalpo" };
  });
}

/** Biomecânico (BM2): escalpos no rodapé; cada escalpo abre Forçar Limites, Manutenção e Segunda Calibração. */
export function useBiomecanico({ api, st, rank, j, acao, locked }: {
  api: Pick<ConsoleApi, "character"> & Partial<Pick<ConsoleApi, "escalpos">>; st: ClassPlayState; rank: (r: string) => boolean; j: number;
  acao: (a: TecnicoAcao, passo: string, pa?: number) => void; locked: boolean;
}): ModSub {
  const [painel, setPainel] = useState<null | "escalpos" | "escalpo">(null);
  const [sel, setSel] = useState<string | null>(null);
  const [melRasc, setMelRasc] = useState<Melhoria | null>(null);
  const [zonaRasc, setZonaRasc] = useState(false);

  const escs = escalposDoPersonagem(api);
  const calib = !!st.uses["scene:calibracao"], zonaUsada = !!st.uses["scene:zona"];
  const totalF = 1 + (calib ? 1 : 0), usadosF = escs.filter(e => estadoEscalpo(st, e.id).forcado).length;
  const forcarTexto = usadosF >= totalF ? "USADO NA CENA" : calib ? "1 USO RECUPERADO" : "1× POR CENA";
  const fn = funcaoDaRodada(st, j);

  const abrir = (id: string) => { setSel(id); setMelRasc(null); setZonaRasc(false); setPainel("escalpo"); };
  const lista = <div className="bm-escalpos">{escs.map(x => { const e = estadoEscalpo(st, x.id), mel = MELHORIAS.find(m => m.id === e.forcado);
    const marcas = [e.mit ? `+${e.mit} MIT` : "", e.desgaste ? "DESGASTE SUPRIMIDO" : ""].filter(Boolean).join(" · ");
    return <button key={x.id} type="button" className="bm-cartao" data-forcado={mel ? (e.zona ? "zona" : "sim") : undefined} onClick={() => abrir(x.id)}>
      <span className="bm-arte"><i /><ItemCategoryIcon category={x.categoria} group="Escalpos" itemType={x.cat} size={30} color="currentColor" strokeWidth={1.1} /></span>
      <span className="bm-info">
        <strong>{x.nome}</strong>
        <small>{x.cat}</small>
        <small data-tom={mel ? (e.zona ? "zona" : "forcado") : marcas ? "marca" : undefined}>{mel ? `${e.zona ? "ZONA VERMELHA" : "FORÇADO"} · ${mel.nome.toUpperCase()}` : (marcas || "INSTALADO")}</small>
      </span>
    </button>; })}</div>;

  const x = escs.find(e => e.id === sel), e = x ? estadoEscalpo(st, x.id) : null, melAtual = e && MELHORIAS.find(m => m.id === e.forcado);
  const zonaOn = e?.forcado ? !!e.zona : zonaRasc;
  const passo = (t: string) => `${x?.nome}: ${t}`;

  const painelView = painel === "escalpos" ? <Painel baixo titulo="SEUS ESCALPOS" fechar={() => setPainel(null)}>
    <div className="te-folha">
      <div className="bm-cab"><span /><span>FORÇAR LIMITES · <b data-usado={usadosF >= totalF || undefined}>{forcarTexto}</b></span></div>
      <p className="te-intro">{DICA_FORCAR.replace(" Toque num escalpo para escolher a melhoria.", "")}</p>
      {escs.length ? lista : <p className="te-intro">Nenhum escalpo instalado.</p>}
    </div>
  </Painel> : painel === "escalpo" && x && e ? <Painel baixo titulo={`ESCALPO · ${x.nome.toUpperCase()}`} fechar={() => setPainel("escalpos")}>
    <div className="te-folha">
      {x.desc && <p className="te-intro">{x.desc}</p>}
      <div className="bm-linha">
        <span className="te-rotulo">FORÇAR LIMITES · <b data-usado={usadosF >= totalF || undefined}>{forcarTexto}</b></span>
        {rank("A") && <button type="button" className="ca-chip ca-tem-dica bm-zona" aria-pressed={zonaOn} onClick={() => { if (!e.forcado) setZonaRasc(!zonaRasc); }}>
          <Svg d={ICONES.zona} tam={14} traco={2} />ZONA VERMELHA<b>· {zonaUsada && !e.zona ? "USADA NA CENA" : zonaOn ? "LIGADA" : "1× POR CENA"}</b>
          <span className="ca-dica" data-pos="baixo-dir" role="tooltip">{DICA_ZONA}</span>
        </button>}
      </div>
      <div className="tc-opcoes" data-col="3" data-zona={zonaOn || undefined}>{MELHORIAS.map(m => { const at = e.forcado ? e.forcado === m.id : melRasc === m.id;
        return <button key={m.id} type="button" className="te-resposta" aria-pressed={at} data-apagada={!!e.forcado && !at || undefined} onClick={() => !e.forcado && setMelRasc(m.id)}>
          <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={m.d} tam={17} traco={2} /></span>
          <span><strong>{m.nome}</strong><small>{zonaOn ? m.zona : m.curta}</small></span>
        </button>; })}</div>
      <div className="te-folha-fim bm-fim">
        {melAtual ? <button type="button" className="te-link" disabled={locked} onClick={() => acao({ op: "escalpo", id: x.id, forcar: null }, passo(`${melAtual.nome} desmarcado`))}>DESMARCAR · {melAtual.nome.toUpperCase()}</button>
          : <button type="button" className="te-primario" disabled={locked || !melRasc} onClick={() => { if (!melRasc) return; const mel = MELHORIAS.find(m => m.id === melRasc)!; acao({ op: "escalpo", id: x.id, forcar: melRasc, zona: rank("A") && zonaRasc }, passo(`${mel.nome}${zonaRasc && rank("A") ? " · Zona Vermelha" : ""}`)); setMelRasc(null); setZonaRasc(false); }}>FORÇAR LIMITES</button>}
      </div>
      {rank("C") && <>
        <span className="te-rotulo">MANUTENÇÃO · FUNÇÃO DA UNIDADE</span>
        <div className="tc-opcoes" data-col="2">
          <button type="button" className="te-resposta" aria-pressed={!!e.mit} disabled={locked} onClick={() => {
            if (e.mit) acao({ op: "escalpo", id: x.id, mit: null, funcao: fn === "manutencao" ? { unidade: j, funcao: null } : undefined }, passo("MIT desmarcado"), fn === "manutencao" ? -1 : 0);
            else { const v = rolarD6(); acao({ op: "escalpo", id: x.id, mit: v, funcao: { unidade: j, funcao: "manutencao" } }, passo(`+${v} MIT`), fn === "manutencao" ? 0 : 1); } }}>
            <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={ICONES.mit} tam={17} traco={2} /></span>
            <span><strong>{e.mit ? `+${e.mit} MIT` : "Recuperar 1d6 MIT"}</strong><small>{e.mit ? "RECUPERADA NA CENA" : "1× POR CENA NESTE ESCALPO"}</small></span>
          </button>
          <button type="button" className="te-resposta" aria-pressed={!!e.desgaste} disabled={locked} onClick={() => {
            if (e.desgaste) acao({ op: "escalpo", id: x.id, desgaste: false, funcao: fn === "manutencao" ? { unidade: j, funcao: null } : undefined }, passo("Desgaste desmarcado"), fn === "manutencao" ? -1 : 0);
            else acao({ op: "escalpo", id: x.id, desgaste: true, funcao: { unidade: j, funcao: "manutencao" } }, passo("Desgaste suprimido"), fn === "manutencao" ? 0 : 1); }}>
            <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={ICONES.desgaste} tam={17} traco={2} /></span>
            <span><strong>{e.desgaste ? "Desgaste suprimido" : "Suprimir 1 Desgaste"}</strong><small>{e.desgaste ? "ATÉ O FIM DA CENA" : "1× POR CENA NESTE ESCALPO"}</small></span>
          </button>
        </div>
      </>}
      {rank("C") && e.forcado && <>
        <span className="te-rotulo bm-sec">SEGUNDA CALIBRAÇÃO · <b data-usado={calib || undefined}>{calib ? "USADA NA CENA" : "1× POR CENA"}</b></span>
        <div className="tc-opcoes" data-col="2">
          <button type="button" className="te-resposta" aria-pressed={calib} disabled={locked} onClick={() => acao({ op: "escalpo", id: x.id, calibracao: !calib, funcao: !calib ? { unidade: j, funcao: "estabilizacao" } : fn === "estabilizacao" ? { unidade: j, funcao: null } : undefined }, !calib ? `Segunda Calibração · ${x.nome}` : "Segunda Calibração desmarcada", !calib ? (fn === "estabilizacao" ? 0 : 1) : (fn === "estabilizacao" ? -1 : 0))}>
            <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={ICONES.estab} tam={17} traco={2} /></span>
            <span><strong>Estabilização</strong><small>{calib ? "FORÇAR LIMITES RECUPERADO" : "RECUPERA UM FORÇAR LIMITES"}</small></span>
          </button>
        </div>
      </>}
    </div>
  </Painel> : null;

  return { rodape: <button type="button" onClick={() => setPainel("escalpos")}>ESCALPOS</button>, painel: painelView };
}
