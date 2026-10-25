"use client";

import { useState } from "react";
import type { ConsoleApi } from "../../types";
import type { ClassPlayState } from "../../../../../lib/character/classManagement";
import { paDaMaquina, unidade, INTRUSAO, type TecnicoAcao } from "../../../../../lib/character/tecnicoTela";
import { ItemCategoryIcon } from "../../../../_design/itemIcons";
import companheiros from "../../../../../../content/v12/db_mercado_companheiros_v1_2.json";
import { Painel } from "./painelClasse";
import type { ChipSub, ModSub } from "./tecnicoSub";
import "./tecnicoRoboticista.css";

type Modelo = { slug: string; id: string; nome: string; categoria: string; preco: number; pa_maximo: number | null; pd_maximo: number | null; sistemas_texto: string | null; acoes: { nome: string; custoPA: number; descricao: string }[] };
const MODELOS = (companheiros as unknown as { modelos_companheiros: Modelo[] }).modelos_companheiros;

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const ICONES = {
  com: "M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v8",
  intrusao: "M4 4h16v12H4ZM8 20h8M12 16v4M9 9l2 2-2 2M13 13h3",
  acionar: "M7 11V7a5 5 0 0 1 9.9-1M5 11h14v10H5Z",
  interromper: "M18.4 5.6 5.6 18.4M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18",
};

/** "câmera com zoom, câmera térmica e gravador" → ["Câmera com zoom", ...]. */
const sistemasDe = (t?: string | null) => (t ?? "").replace(/ e /g, ", ").split(",").map(p => p.trim()).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1));
const primeiraFrase = (t: string) => t.split(".")[0].replace(/\*\*|`/g, "") + ".";

type Maquina = { id: string; nome: string; tipo: "DRONE" | "ROBÔ"; categoria: "drone" | "robo"; pdMax: number; paMax: number; preco: number; sistemas: string[]; acoes: { nome: string; pa: number; texto: string }[] };

function maquinasDoPersonagem(api: Pick<ConsoleApi, "character">): Maquina[] {
  const c = api.character;
  const achar = (slug?: string, nome?: string) => MODELOS.find(m => (slug && (m.slug === slug || m.id === slug)) || (nome && m.nome.toLowerCase() === nome.toLowerCase()));
  const nova = (id: string, nome: string, categoria: "drone" | "robo", m?: Modelo, paFicha?: number): Maquina => ({
    id, nome, categoria, tipo: categoria === "drone" ? "DRONE" : "ROBÔ", pdMax: m?.pd_maximo ?? 10, paMax: paFicha ?? m?.pa_maximo ?? 3, preco: m?.preco ?? 0,
    sistemas: sistemasDe(m?.sistemas_texto), acoes: (m?.acoes ?? []).map(a => ({ nome: a.nome.charAt(0) + a.nome.slice(1).toLowerCase(), pa: a.custoPA, texto: primeiraFrase(a.descricao) })) });
  return [
    ...(c.drones ?? []).map(d => nova(d.id, d.nome, "drone", achar(d.modeloSlug, d.modelo))),
    ...(c.robos ?? []).map(r => nova(r.id, r.nome, "robo", achar(r.modeloSlug, r.modelo), r.paMaximo)),
  ];
}

/** Roboticista (RB2): máquinas com IA no rodapé, Comunicação e Intrusão Mecânica nos chips. */
export function useRoboticista({ api, st, rank, max, acao, locked }: {
  api: Pick<ConsoleApi, "character">; st: ClassPlayState; rank: (r: string) => boolean; max: number;
  acao: (a: TecnicoAcao, passo: string, pa?: number) => void; locked: boolean;
}): ModSub {
  const [painel, setPainel] = useState<null | "maquinas" | "maquina" | "intrusao">(null);
  const [sel, setSel] = useState<string | null>(null);
  const [transf, setTransf] = useState(false);
  const [transfRasc, setTransfRasc] = useState<{ de: string; sistema: string } | null>(null);
  const [intrRasc, setIntrRasc] = useState<(typeof INTRUSAO)[number] | null>(null);
  const [prep, setPrep] = useState<{ aberto: boolean; ativo: string | null; reserva: string | null }>({ aberto: false, ativo: null, reserva: null });

  const maqs = maquinasDoPersonagem(api);
  const AUT = rank("A") ? 3 : rank("C") ? 2 : 1;
  const com = !st.tecnico?.semCom;
  const intr = st.uses["round:intrusao"] ? INTRUSAO[st.uses["round:intrusao"] - 1] : null;
  const unidadeDe = (m: Maquina) => { for (let j = 0; j < max; j++) { const u = unidade(st, j); if (u && (u.value ?? 0) > 0 && u.installation === "attached" && u.attachment === m.nome) return j; } return -1; };
  const info = (m: Maquina) => {
    const e = st.tecnico?.maqs?.[m.id], pd = e?.pd ?? m.pdMax, p = paDaMaquina(st, m.id), uj = unidadeDe(m), ia = uj >= 0 && pd > 0;
    const aut = ia ? AUT : 0, lim = com ? m.paMax : Math.min(m.paMax, aut);
    return { e, pd, p, uj, ia, aut, lim, usAut: Math.min(p.n, aut), usSeu: Math.max(0, p.n - aut) };
  };
  const textoPa = (i: ReturnType<typeof info>) => !i.ia ? (i.p.n ? `${i.p.n} PA SEU${i.p.n === 1 ? "" : "S"}` : "PA SEUS") : `${i.usAut}/${i.aut} AUTÔNOMOS` + (i.usSeu ? ` · +${i.usSeu} SEU${i.usSeu === 1 ? "" : "S"}` : "");
  /** PA do personagem quando a máquina passa de `de` para `para` PA gastos (o que excede os autônomos sai dos seus). */
  const seus = (i: ReturnType<typeof info>, de: number, para: number) => Math.max(0, para - i.aut) - Math.max(0, de - i.aut);
  const corPip = (i: ReturnType<typeof info>, k: number) => k < i.p.n ? (k < i.aut ? "aut" : "seu") : k < i.aut ? "livre" : "vazio";

  const chips: ChipSub[] = [
    { chave: "com", icone: ICONES.com, rotulo: "COMUNICAÇÃO", valor: com ? "ATIVA" : "INTERROMPIDA", usado: false, tom: com ? undefined : "alerta",
      dica: "Com a comunicação interrompida, a IA segue o último objetivo só com os PA autônomos: não recebe ordens novas nem usa PA seus até a conexão voltar. Toque para alternar.",
      clicar: () => acao({ op: "comunicacao", interrompida: com }, com ? "Comunicação interrompida" : "Comunicação restabelecida") },
  ];
  if (rank("C")) chips.push({ chave: "intrusao", icone: ICONES.intrusao, rotulo: "INTRUSÃO MECÂNICA", usado: !!intr,
    valor: intr ? (intr === "acionar" ? "ACIONAR NA RODADA" : "INTERROMPER NA RODADA") : "2 PA · 1× POR RODADA",
    dica: "Interferir em Sistema · 2 PA · 1× por rodada: por uma interface física de manutenção ou operação de uma Máquina Autônoma fora do seu controle, teste de Robótica contra a CD de segurança do Nó dela. No sucesso, Acionar ou Interromper um Sistema acessível. Cada Sistema, uma vez por cena. Toque para escolher.",
    clicar: () => { setIntrRasc(null); setPainel("intrusao"); } });

  const abrir = (m: Maquina) => { setSel(m.id); setTransf(false); setTransfRasc(null); setPrep({ aberto: false, ativo: null, reserva: null }); setPainel("maquina"); };
  const cartoes = <div className="rb-maquinas">{maqs.map(m => { const i = info(m), destr = i.pd <= 0;
    return <button key={m.id} type="button" className="rb-cartao" data-ia={i.ia || undefined} data-destruida={destr || undefined} onClick={() => abrir(m)}>
      <span className="rb-arte"><i /><ItemCategoryIcon category={m.categoria} group="Drones e robôs" size={28} color="currentColor" strokeWidth={1.1} /></span>
      <span className="rb-info">
        <span><strong>{m.nome}</strong><b data-tom={destr ? "vermelho" : i.pd <= m.pdMax / 3 ? "baixo" : undefined}>{i.pd} / {m.pdMax} PD</b></span>
        <small data-tom={destr ? "vermelho" : i.ia ? (com ? "ia" : "vermelho") : undefined}>{destr ? `${m.tipo} · DESTRUÍDA` : i.ia ? `${m.tipo} · IA` + (com ? "" : " · SEM SINAL") : `${m.tipo} · SEM IA`}</small>
        <span className="rb-pa"><span>{Array.from({ length: m.paMax }, (_, k) => <i key={k} data-cor={corPip(i, k)} />)}</span><small>{textoPa(i)}</small></span>
      </span>
    </button>; })}</div>;

  const m = maqs.find(x => x.id === sel), I = m ? info(m) : null;
  const passo = (t: string) => `${m?.nome}: ${t}`;
  const outros = m ? maqs.filter(o => o.id !== m.id) : [];
  const transferido = (o: Maquina, t: string) => maqs.some(y => st.tecnico?.maqs?.[y.id]?.extra?.de === o.nome && st.tecnico?.maqs?.[y.id]?.extra?.sistema === t);

  const painelView = painel === "maquinas" ? <Painel baixo titulo="MÁQUINAS VINCULADAS" fechar={() => setPainel(null)}>
    <div className="te-folha">
      <div className="rb-cab"><span /><span>IA · <b>{AUT} PA AUTÔNOMO{AUT === 1 ? "" : "S"} POR RODADA</b></span></div>
      <p className="te-intro">A máquina com uma Unidade sua acoplada recebe PA autônomos por rodada. As ações gastam primeiro os autônomos e depois os seus, até o limite de PA da ficha dela. Ordens não custam PA.</p>
      {maqs.length ? cartoes : <p className="te-intro">Nenhuma máquina vinculada.</p>}
    </div>
  </Painel> : painel === "maquina" && m && I ? <Painel baixo titulo={`${m.nome.toUpperCase()} · ${m.tipo}`} fechar={() => setPainel("maquinas")}>
    <div className="te-folha">
      <p className="te-intro">{I.pd <= 0 ? "Máquina destruída: reconstrua para voltar a operar." : I.ia ? `Máquina com IA pela Unidade 0${I.uj + 1}: ${I.aut} PA autônomos por rodada, depois os seus. Ordens não custam PA.` : "Máquina vinculada, sem IA: as ações saem dos seus PA. Acople uma Unidade para instalar a IA."}</p>
      <div className="rb-pd">
        <span>PD</span>
        <div role="group" aria-label="PD da máquina">{Array.from({ length: m.pdMax }, (_, k) =>
          <button key={k} type="button" className="te-seg" style={{ width: Math.max(12, Math.min(26, Math.floor(300 / m.pdMax))) }} aria-label={`PD ${k + 1}`} disabled={locked}
            data-cheio={k < I.pd || undefined} data-baixo={k < I.pd && I.pd <= m.pdMax / 3 || undefined} onClick={() => { const n = k + 1 === I.pd ? k : k + 1; acao({ op: "maquina", id: m.id, pd: n }, passo(`PD ${I.pd} → ${n}`)); }}><i /></button>)}</div>
        <b data-tom={I.pd > 0 ? "claro" : "vermelho"}>{I.pd} / {m.pdMax}</b>
        {I.pd <= 0 && <button type="button" className="te-uso ca-tem-dica rb-reconstruir" disabled={locked} onClick={() => acao({ op: "maquina", id: m.id, pd: m.pdMax }, `${m.nome} reconstruída`)}>RECONSTRUIR · 8 H · Ⱥ {Math.round(m.preco / 4).toLocaleString("pt-BR")}<span className="ca-dica" data-pos="cima-dir" role="tooltip">Com ferramentas apropriadas, 8 horas e materiais de 25% do preço original, a máquina volta com os PD máximos e as características originais. Munição, runas e componentes perdidos são repostos à parte.</span></button>}
      </div>
      <span className="te-rotulo">PA DA RODADA · LIMITE {m.paMax} PA</span>
      <div className="rb-pa-grande">
        <div role="group" aria-label="PA da rodada">{Array.from({ length: m.paMax }, (_, k) =>
          <button key={k} type="button" className="rb-pip" aria-label={`PA ${k + 1}`} disabled={locked} data-cor={corPip(I, k)}
            onClick={() => { const n = k + 1 === I.p.n ? k : k + 1; acao({ op: "maquina", id: m.id, pa: n }, passo(`PA ${I.p.n} → ${n}`), seus(I, I.p.n, n)); }}><i /></button>)}</div>
        <span data-ia={I.ia || undefined}>{textoPa(I)}</span>
        <button type="button" className="te-link" disabled={locked} onClick={() => acao({ op: "novaRodada" }, "Nova rodada")}>NOVA RODADA</button>
      </div>
      <span className="te-rotulo rb-sec">AÇÕES</span>
      <div className="rb-acoes">{m.acoes.map(x => { const n = I.p.feitas.filter(f => f === x.nome).length, cabe = I.pd > 0 && I.p.n + x.pa <= I.lim;
        return <button key={x.nome} type="button" className="rb-acao ca-tem-dica" disabled={locked || !cabe} onClick={() => acao({ op: "maquina", id: m.id, acao: x.nome, custo: x.pa }, passo(x.nome), seus(I, I.p.n, I.p.n + x.pa))}>
          <span><strong>{x.nome}</strong><small>{I.pd <= 0 ? "DESTRUÍDA" : n ? `${n}× NESTA RODADA` : cabe ? (I.ia && I.p.n + x.pa <= I.aut ? "COM PA AUTÔNOMO" : "COM PA SEU") : "ACIMA DO LIMITE"}</small></span>
          <b>{x.pa} PA</b>
          <span className="ca-dica" data-pos="cima" role="tooltip">{x.texto}</span>
        </button>; })}</div>
      <span className="te-rotulo rb-sec">SISTEMAS</span>
      <p className="rb-sistemas">{m.sistemas.map(t => outros.some(o => st.tecnico?.maqs?.[o.id]?.extra?.de === m.nome && st.tecnico?.maqs?.[o.id]?.extra?.sistema === t) ? `${t} (transferido)` : t).join(" · ")}</p>
      {I.e?.extra && <div className="rb-extra"><span>+ {I.e.extra.sistema} · de {I.e.extra.de}</span><button type="button" className="te-link" disabled={locked} onClick={() => acao({ op: "maquina", id: m.id, extra: null }, passo("Sistema removido"))}>REMOVER</button></div>}
      {rank("C") && !I.e?.extra && outros.length > 0 && <>
        <button type="button" className="rb-receber ca-tem-dica" onClick={() => { setTransf(!transf); setTransfRasc(null); }}>{transf ? "FECHAR" : "+ RECEBER SISTEMA · 10 MIN"}<span className="ca-dica" data-pos="cima-esq" role="tooltip">Reconfiguração Modular: com 10 minutos, ferramentas e acesso físico às duas máquinas, transfira um Sistema compatível. Ele para na origem e passa a integrar esta máquina, com ações e consumíveis. Cada máquina recebe 1 Sistema adicional.</span></button>
        {transf && <div className="rb-grupos">{outros.map(o => <div key={o.id} className="rb-grupo">
          <div className="rb-grupo-cab"><span><ItemCategoryIcon category={o.categoria} group="Drones e robôs" size={18} color="currentColor" strokeWidth={1.1} /></span><strong>{o.nome}</strong><small>{o.tipo}</small><i /></div>
          <div className="rb-opcoes">{o.sistemas.filter(t => !transferido(o, t)).map(t => { const at = transfRasc?.de === o.nome && transfRasc.sistema === t;
            return <button key={t} type="button" className="rb-opcao" aria-pressed={at} onClick={() => setTransfRasc({ de: o.nome, sistema: t })}><i />{t}</button>; })}</div>
        </div>)}
          <button type="button" className="te-primario" disabled={locked || !transfRasc} onClick={() => { if (!transfRasc) return; acao({ op: "maquina", id: m.id, extra: transfRasc }, `${m.nome} recebe ${transfRasc.sistema}`); setTransf(false); setTransfRasc(null); }}>RECEBER · 10 MIN</button>
        </div>}
      </>}
      {rank("A") && <>
        <span className="te-rotulo rb-sec">RECONFIGURAÇÃO DE EMERGÊNCIA · <b data-usado={!!st.uses["round:alternar"] || undefined}>{st.uses["round:alternar"] ? "USADA NA RODADA" : "1 PA · 1× POR RODADA"}</b></span>
        {I.e?.troca ? <div className="rb-troca"><span>Ativo: <b>{I.e.troca[0]}</b> · reserva: {I.e.troca[1]}</span>
          <button type="button" className="te-link" disabled={locked} onClick={() => acao({ op: "maquina", id: m.id, troca: null }, passo("Alternância desmontada"))}>DESMONTAR</button>
          <button type="button" className="te-uso" disabled={locked} onClick={() => acao({ op: "maquina", id: m.id, troca: [I.e!.troca![1], I.e!.troca![0]], alternar: true }, passo(`${I.e!.troca![1]} ativo`), 1)}>ALTERNAR · 1 PA</button>
        </div> : <>
          <button type="button" className="rb-receber ca-tem-dica" onClick={() => setPrep({ aberto: !prep.aberto, ativo: null, reserva: null })}>{prep.aberto ? "FECHAR" : "+ PREPARAR ALTERNÂNCIA · 10 MIN"}<span className="ca-dica" data-pos="cima-esq" role="tooltip">Com 10 minutos, ferramentas e os dois Sistemas em suportes compatíveis, um fica ativo e o outro em reserva. Só o ativo pode ser usado e conta para a Reconfiguração Modular. Com comunicação, Alternar Sistemas troca qual está ativo.</span></button>
          {prep.aberto && <div className="rb-grupos">
            <div className="rb-grupo"><div className="rb-grupo-cab"><span><ItemCategoryIcon category={m.categoria} group="Drones e robôs" size={18} color="currentColor" strokeWidth={1.1} /></span><strong>ATIVO</strong><small>{m.nome.toUpperCase()}</small><i /></div>
              <div className="rb-opcoes">{[...m.sistemas, ...(I.e?.extra ? [I.e.extra.sistema] : [])].map(t => <button key={t} type="button" className="rb-opcao" aria-pressed={prep.ativo === t} onClick={() => setPrep({ ...prep, ativo: t })}><i />{t}</button>)}</div></div>
            {outros.map(o => <div key={o.id} className="rb-grupo"><div className="rb-grupo-cab"><span><ItemCategoryIcon category={o.categoria} group="Drones e robôs" size={18} color="currentColor" strokeWidth={1.1} /></span><strong>RESERVA</strong><small>DE {o.nome.toUpperCase()}</small><i /></div>
              <div className="rb-opcoes">{o.sistemas.map(t => <button key={t} type="button" className="rb-opcao" aria-pressed={prep.reserva === t} onClick={() => setPrep({ ...prep, reserva: t })}><i />{t}</button>)}</div></div>)}
            <button type="button" className="te-primario" disabled={locked || !prep.ativo || !prep.reserva} onClick={() => { if (prep.ativo && prep.reserva) acao({ op: "maquina", id: m.id, troca: [prep.ativo, prep.reserva] }, passo("Alternância preparada")); setPrep({ aberto: false, ativo: null, reserva: null }); }}>PREPARAR · 10 MIN</button>
          </div>}
        </>}
      </>}
    </div>
  </Painel> : painel === "intrusao" ? <Painel baixo titulo="INTRUSÃO MECÂNICA · INTERFERIR EM SISTEMA" fechar={() => setPainel(null)}>
    <div className="te-folha">
      <p className="te-intro">Pela interface física de uma Máquina Autônoma fora do seu controle, teste de Robótica contra a CD de segurança do Nó dela. No sucesso, aplique um efeito a um Sistema acessível.</p>
      <span className="te-rotulo">EFEITO</span>
      <div className="rb-efeitos">{([["acionar", "Acionar", "OPERAÇÃO SIMPLES · SEM ATAQUE"], ["interromper", "Interromper", "DESATIVA ATÉ A PRÓXIMA ATIVAÇÃO"]] as const).map(([id, nome, curta]) => { const at = intr ? intr === id : intrRasc === id;
        return <button key={id} type="button" className="te-resposta" aria-pressed={at} disabled={!!intr && !at} onClick={() => !intr && setIntrRasc(id)}>
          <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={ICONES[id]} tam={17} traco={2} /></span>
          <span><strong>{nome}</strong><small>{curta}</small></span>
        </button>; })}</div>
      <div className="te-folha-fim">
        {intr ? <button type="button" className="te-link" disabled={locked} onClick={() => acao({ op: "intrusao", efeito: null }, "Intrusão Mecânica desmarcada", -2)}>DESMARCAR</button>
          : <button type="button" className="te-primario" disabled={locked || !intrRasc} onClick={() => { if (intrRasc) acao({ op: "intrusao", efeito: intrRasc }, intrRasc === "acionar" ? "Intrusão Mecânica: Acionar" : "Intrusão Mecânica: Interromper", 2); }}>INTERFERIR · 2 PA</button>}
      </div>
    </div>
  </Painel> : null;

  return { chips, rodape: <button type="button" onClick={() => setPainel("maquinas")}>MÁQUINAS</button>, painel: painelView };
}
