"use client";

import { useState, type ReactNode } from "react";
import type { ConsoleApi } from "../../types";
import type { ClassPlayState } from "../../../../../lib/character/classManagement";
import type { ItemContent } from "../../../../../lib/character";
import type { ModInstalada, Projeto, TecnicoAcao } from "../../../../../lib/character/tecnicoTela";
import { ItemCategoryIcon } from "../../../../_design/itemIcons";
import { corCategoria } from "../../../../_design/itemCategoryColors";
import { JanelaMercado } from "../hud/JanelaMercado";
import { MercadoHud } from "../hud/MercadoHud";
import { produtoDoModelo } from "../InventarioPanel";
import { Painel } from "./painelClasse";
import type { ChipSub, ModSub } from "./tecnicoSub";
import "./tecnicoArtifice.css";

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/** Modificações do livro, com o resumo das pranchetas e as categorias compatíveis. */
const MODS = [
  { id: "balanceamento", nome: "Balanceamento", curta: "ALCANCE, ARREMESSO OU SILENCIOSO", alvos: ["arma"], d: "M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0ZM17 7l-3 6a3 3 0 0 0 6 0Z", regra: "Uma arma recebe uma propriedade: Alcance, Arremesso (6 m/12 m) ou Silencioso." },
  { id: "blindagem", nome: "Blindagem Adicional", curta: "+3 MIT", alvos: ["armadura"], d: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6ZM12 9v6M9 12h6", regra: "Uma armadura: MIT máxima e atual +3. Ao remover, −3, até o mínimo de 0." },
  { id: "calibracao", nome: "Calibração", curta: "+2 NOS TESTES", alvos: ["ferramenta", "dispositivo", "escalpo"], d: "M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0", regra: "Uma função técnica de ferramenta, dispositivo, escalpo ou sistema usado em testes: esses testes recebem +2. Não vale para ataque nem ação defensiva." },
  { id: "potencializacao", nome: "Potencialização", curta: "+1D4 DE DANO", alvos: ["arma"], d: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 2 3 4", regra: "Uma arma causa +1d4 de dano." },
  { id: "reforco", nome: "Reforço Estrutural", curta: "+5 PD", alvos: ["escudo", "ferramenta", "dispositivo", "escalpo"], d: "M4 7h16v10H4ZM9 7v10M15 7v10", regra: "Escudo, ferramenta, dispositivo, escalpo ou sistema com PD: PD máximos e atuais +5." },
  { id: "sobregravacao", nome: "Sobregravação", curta: "+1 ESPAÇO DE RUNA", alvos: ["arma", "armadura", "escudo", "ferramenta", "dispositivo", "escalpo"], d: "M12 3 20 12 12 21 4 12ZM12 8v8M9 11l3-3 3 3", regra: "Um equipamento que comporte runas recebe 1 espaço adicional de runa." },
];
const RITMOS = [
  { id: "cauteloso", nome: "Cauteloso", curta: "4 H · +1 DE VANTAGEM" },
  { id: "regular", nome: "Regular", curta: "2 H · TESTE NORMAL" },
  { id: "acelerado", nome: "Acelerado", curta: "1 H · −1 · +1D100 NO SUCESSO" },
];
const RESULTADOS = [["limitado", "SUCESSO LIMITADO"], ["padrao", "SUCESSO PADRÃO"], ["critico", "SUCESSO CRÍTICO"], ["flimitada", "FALHA LIMITADA"], ["fpadrao", "FALHA PADRÃO"], ["fcritica", "FALHA CRÍTICA"]] as const;
const ICONES = { troca: "M4 7h13l-3-3M20 17H7l3 3", runa: "M12 3 20 12 12 21 4 12ZM12 8v8M9 11l3-3 3 3", check: "M5 12.5 9.5 17 19 7" };
const CATS_PROJETO = ["arma", "armadura", "escudo", "ferramenta", "dispositivo"];
/** CD e Progresso pela raridade (tabela de Projetos). */
const TABELA: Record<string, [number, number]> = { muito_comum: [5, 100], comum: [5, 100], incomum: [7, 300], raro: [9, 600] };
const chaveRar = (r?: string | null) => (r ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "_");
const d100 = (n: number) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 100));

type Equip = { nome: string; categoria: string; tipo: string; cor: string; modelo?: ItemContent };

function equipamentos(api: Pick<ConsoleApi, "character"> & Partial<Pick<ConsoleApi, "catalogo" | "escalpos">>): Equip[] {
  const c = api.character, lista: Equip[] = [], vistos = new Set<string>();
  for (const i of c.inventario ?? []) {
    if (i.estado === "abrigo" || !CATS_PROJETO.includes(i.categoria) || vistos.has(i.itemNome)) continue;
    vistos.add(i.itemNome);
    lista.push({ nome: i.itemNome, categoria: i.categoria, tipo: i.categoria.toUpperCase(), cor: corCategoria(i.categoria) ?? "#35c7d8", modelo: api.catalogo?.get(i.itemSlug) });
  }
  for (const e of c.escalpos_instalados ?? []) {
    const m = api.escalpos?.catalogo.find(x => x.id === e.contentId || x.slug === e.contentId), nome = e.nomeCustomizado || (m?.nome ?? e.contentId).replace(/\s*\(.*\)$/, "");
    if (!vistos.has(nome)) { vistos.add(nome); lista.push({ nome, categoria: "escalpo", tipo: "ESCALPO", cor: corCategoria("escalpo") ?? "#c578d9" }); }
  }
  return lista;
}
const iconeEquip = (e: { categoria: string; nome: string; modelo?: ItemContent }, tam: number) =>
  <ItemCategoryIcon category={e.categoria} weaponName={e.nome} armorRegions={e.modelo?.regioes} group={e.categoria === "escalpo" ? "Escalpos" : undefined} size={tam} color="currentColor" strokeWidth={1.5} />;

/** Cartão no desenho do Mercado (arte, ícone, nome, tipo, fio), com marca de seleção. */
function Cartao({ cor, ativa, titulo, sub, curta, icone, tag, off, clicar }: { cor: string; ativa: boolean; titulo: string; sub: string; curta?: string; icone: ReactNode; tag?: string; off?: boolean; clicar: () => void }) {
  return <button type="button" className="te-cartao af-cartao" aria-pressed={ativa} disabled={off} style={{ ["--k" as string]: cor }} onClick={clicar}>
    <span className="te-cartao-arte"><i />{icone}{tag && <em>{tag}</em>}<span className="te-cartao-check"><Svg d={ICONES.check} tam={13} traco={3} /></span></span>
    <span className="te-cartao-info"><strong>{titulo}</strong><small>{sub}</small>{curta !== undefined && <b>{curta}</b>}</span>
    <span className="te-cartao-fio" />
  </button>;
}

/** Artífice (AR1): Oficina no rodapé com Modificações e Projetos; Troca Rápida e Gatilho Rúnico no C. */
export function useArtifice({ api, st, rank, acao, marcar, locked }: {
  api: Pick<ConsoleApi, "character"> & Partial<Pick<ConsoleApi, "catalogo" | "escalpos">>; st: ClassPlayState; rank: (r: string) => boolean;
  acao: (a: TecnicoAcao, passo: string, pa?: number) => void; marcar: (chave: string, passo: string, pa?: number) => void; locked: boolean;
}): ModSub {
  const [painel, setPainel] = useState<null | "oficina" | "instalar" | "desmontar" | "trabalho">(null);
  const [mercado, setMercado] = useState(false);
  const [selMod, setSelMod] = useState<number | null>(null);
  const [inst, setInst] = useState<{ slot: number; equip: string | null; mod: string | null }>({ slot: 0, equip: null, mod: null });
  const [escolha, setEscolha] = useState<string | null>(null);
  const [trab, setTrab] = useState<{ p: number; ritmo: string; res: string | null; cons: string | null }>({ p: 0, ritmo: "regular", res: null, cons: null });

  const maxMods = rank("A") ? 4 : rank("C") ? 3 : 2;
  const mods: (ModInstalada | null)[] = Array.from({ length: maxMods }, (_, k) => st.tecnico?.mods?.[k] ?? null);
  const projetos = st.tecnico?.projetos ?? [];
  const equips = equipamentos(api);
  const uso = (k: string) => !!st.uses[k];
  const nIniciais = projetos.filter(p => p.inicial).length;
  const modeloDe = (slug: string) => api.catalogo?.get(slug);

  const chips: ChipSub[] = rank("C") ? [
    { chave: "troca", icone: ICONES.troca, rotulo: "TROCA RÁPIDA", valor: uso("scene:troca") ? "USADA NA CENA" : "1× POR CENA · 1 PA", usado: uso("scene:troca"),
      dica: "Oficina Aprimorada: uma vez por cena, por 1 PA, instale, remova ou substitua uma Modificação ou runa num equipamento ao seu alcance ou na área de uma Unidade. Toque para marcar; toque de novo para desmarcar.",
      clicar: () => marcar("scene:troca", uso("scene:troca") ? "Troca rápida desmarcada" : "Troca rápida", uso("scene:troca") ? -1 : 1) },
    { chave: "gatilho", icone: ICONES.runa, rotulo: "GATILHO RÚNICO", valor: uso("round:gatilho") ? "USADO NA RODADA" : "1× POR RODADA", usado: uso("round:gatilho"),
      dica: "Uma vez por rodada, ative ou desative sem PA uma runa num equipamento Integrado adjacente a você ou a até 20 m de uma Unidade. Ativar, desativar ou consumir essa runa pode ser Gatilho de Protocolo; Ativar e Desativar Runa também podem ser Respostas. Toque para marcar; toque de novo para desmarcar.",
      clicar: () => marcar("round:gatilho", uso("round:gatilho") ? "Gatilho Rúnico desmarcado" : "Gatilho Rúnico") },
  ] : [];

  /* ── Modificações ── */
  const abrirInstalar = (slot: number) => { const atual = mods[slot]; setInst({ slot, equip: atual?.equip ?? null, mod: atual?.mod ?? null }); setPainel("instalar"); };
  const confirmarInstalar = () => {
    if (!inst.equip || !inst.mod) return;
    const lista = mods.slice(); lista[inst.slot] = { equip: inst.equip, mod: inst.mod };
    acao({ op: "mods", lista }, `${MODS.find(m => m.id === inst.mod)!.nome} instalada`);
    setSelMod(null); setPainel("oficina");
  };
  const removerMod = (j: number) => { const m = mods[j]; if (!m) return; const lista = mods.slice(); lista[j] = null; acao({ op: "mods", lista }, `${MODS.find(x => x.id === m.mod)?.nome ?? "Modificação"} removida`); setSelMod(null); };
  const equipSel = equips.find(e => e.nome === inst.equip);
  const sm = selMod !== null ? mods[selMod] : null, smMod = sm ? MODS.find(x => x.id === sm.mod) : null;

  /* ── Projetos ── */
  const novoProjeto = (m: ItemContent, extra: Partial<Projeto>): Projeto | null => {
    const t = TABELA[chaveRar(m.raridade)]; if (!t) return null;
    return { slug: m.slug, nome: m.nome, raridade: (m.raridade ?? "").replace(/_/g, " "), preco: m.preco ?? 0, cd: t[0], alvo: t[1], inicial: false, coberto: false, iniciado: false, prog: 0, ...extra };
  };
  const salvarProjetos = (lista: Projeto[], passo: string) => acao({ op: "projetos", lista }, passo);
  const ehProjeto = (slug: string) => projetos.some(p => p.slug === slug);
  const elegivelMercado = (m: ItemContent) => CATS_PROJETO.includes(m.categoria) && ["muito_comum", "comum", "incomum"].includes(chaveRar(m.raridade)) && (m.preco ?? 0) > 0;
  const desmontaveis = (api.character.inventario ?? []).filter(i => i.estado !== "abrigo" && CATS_PROJETO.includes(i.categoria)).map(i => ({ i, m: modeloDe(i.itemSlug) }))
    .filter((x): x is { i: typeof x.i; m: ItemContent } => !!x.m && !!TABELA[chaveRar(x.m.raridade)]).filter((x, k, l) => l.findIndex(y => y.m.slug === x.m.slug) === k);

  const t = trab, prj = painel === "trabalho" ? projetos[t.p] : undefined;
  const ordF = ["flimitada", "fpadrao", "fcritica"];
  let gF = t.res ? ordF.indexOf(t.res) : -1; if (gF >= 0) gF = Math.min(2, gF + (t.ritmo === "acelerado" ? 1 : t.ritmo === "cauteloso" ? -1 : 0));
  const nSuc = t.res ? ({ limitado: 1, padrao: 2, critico: 3 } as Record<string, number>)[t.res] : undefined;
  const consOpcoes = t.res && !nSuc && gF >= 0 ? [{ id: "horas", nome: `+${[1, 2, 4][gF]} H DE TRABALHO` }, { id: "perder", nome: `PERDER ${gF + 1}D100` }, ...(gF > 0 ? [{ id: "materiais", nome: `PERDER ${[0, 10, 20][gF]}% DOS MATERIAIS` }] : [])] : [];
  const trabTexto = !t.res ? "" : nSuc ? `Rola ${nSuc + (t.ritmo === "acelerado" ? 1 : 0)}d100 de Progresso.` : gF < 0 ? "Cauteloso: a falha limitada não tem consequência." : (t.ritmo === "acelerado" ? "Acelerado: a falha conta um grau mais grave. " : t.ritmo === "cauteloso" ? "Cauteloso: a falha conta um grau menos grave. " : "") + "Escolha a consequência.";
  const registrarTrabalho = () => {
    if (!prj || !t.res) return;
    let delta = 0, ultimo: string;
    if (nSuc) { const dados = d100(nSuc + (t.ritmo === "acelerado" ? 1 : 0)), soma = dados.reduce((a, b) => a + b, 0); delta = soma; ultimo = `ÚLTIMO PERÍODO · +${soma} (${dados.join(" + ")})`; }
    else if (gF < 0) ultimo = "ÚLTIMO PERÍODO · FALHA SEM CONSEQUÊNCIA";
    else if (t.cons === "perder") { const dados = d100(gF + 1), soma = dados.reduce((a, b) => a + b, 0); delta = -soma; ultimo = `ÚLTIMO PERÍODO · −${soma} (${dados.join(" + ")})`; }
    else ultimo = t.cons === "horas" ? `ÚLTIMO PERÍODO · +${[1, 2, 4][gF]} H DE TRABALHO` : `ÚLTIMO PERÍODO · −${[0, 10, 20][gF]}% DOS MATERIAIS`;
    salvarProjetos(projetos.map((p, k) => k === t.p ? { ...p, prog: Math.max(0, Math.min(p.alvo, p.prog + delta)), ultimo } : p), `${prj.nome}: ${delta >= 0 ? "+" : ""}${delta}`);
    setPainel("oficina");
  };

  const oficina = <div className="te-folha af-oficina">
    <span className="te-rotulo">MODIFICAÇÕES · <b>{mods.filter(Boolean).length} DE {maxMods}</b></span>
    <div className="af-slots" style={{ gridTemplateColumns: `repeat(${maxMods}, minmax(0, 1fr))` }}>{mods.map((m, k) => {
      if (!m) return <button key={k} type="button" className="af-vaga" disabled={locked} onClick={() => abrirInstalar(k)}><span>+</span><small>INSTALAR · 10 MIN</small></button>;
      const mm = MODS.find(x => x.id === m.mod), eq = equips.find(e => e.nome === m.equip);
      return <Cartao key={k} cor={eq?.cor ?? "#35c7d8"} ativa={selMod === k} titulo={mm?.nome ?? m.mod} sub={m.equip.toUpperCase()} curta={mm?.curta} tag={m.perm ? "PERMANENTE" : undefined}
        icone={eq ? iconeEquip(eq, 40) : <Svg d={mm?.d ?? ICONES.runa} tam={28} traco={1.5} />} clicar={() => setSelMod(selMod === k ? null : k)} />;
    })}</div>
    {sm && smMod && <div className="af-sel">
      <span>{smMod.nome} · {sm.equip}: {smMod.regra}{sm.perm ? " Permanente: não pode ser removida ou substituída." : ""}</span>
      <button type="button" className="te-link" data-tom="claro" disabled={locked} onClick={() => abrirInstalar(selMod!)}>TROCAR · 10 MIN</button>
      <button type="button" className="te-link" disabled={locked} onClick={() => removerMod(selMod!)}>REMOVER · 10 MIN</button>
    </div>}
    <div className="af-projetos-cab">
      <span className="te-rotulo">PROJETOS</span>
      <button type="button" className="te-link ca-tem-dica" data-tom="claro" disabled={locked} onClick={() => { setEscolha(null); setPainel("desmontar"); }}>+ DESMONTAR ITEM · 8 H<span className="ca-dica" data-pos="cima-dir" role="tooltip">Com ferramentas apropriadas e 8 horas, desmonte um item para produzir seu Projeto. O item é destruído; os materiais recuperados cobrem a primeira fabricação com esse Projeto.</span></button>
    </div>
    {projetos.map((p, k) => { const m = modeloDe(p.slug), cor = corCategoria(m?.categoria ?? "") ?? "#35c7d8";
      return <div key={p.slug} className="af-projeto" style={{ ["--k" as string]: cor }}>
        <span className="af-projeto-arte">{m ? iconeEquip({ categoria: m.categoria, nome: m.nome, modelo: m }, 28) : null}</span>
        <span className="af-projeto-texto">
          <strong>{p.nome}</strong>
          <small>{p.raridade.toUpperCase()} · CD {p.cd} · {p.inicial ? "INICIAL" : "DESMONTADO"}</small>
          <em>{p.ultimo || (!p.iniciado ? "FABRICAÇÃO NÃO INICIADA" : p.prog ? "EM ANDAMENTO" : "INICIADO")}</em>
        </span>
        {p.iniciado ? <span className="af-progresso"><b>{p.prog} / {p.alvo}</b><span><i style={{ width: `${Math.round(100 * p.prog / p.alvo)}%` }} /></span></span>
          : <span className="af-materiais" data-coberto={p.coberto || undefined}>{p.coberto ? "MATERIAIS · COBERTOS" : `MATERIAIS · Ⱥ ${Math.round(p.preco / 2).toLocaleString("pt-BR")} (50%)`}</span>}
        <button type="button" className="te-uso af-botao" disabled={locked || (p.iniciado && p.prog >= p.alvo)} onClick={() => {
          if (!p.iniciado) salvarProjetos(projetos.map((x, i) => i === k ? { ...x, iniciado: true } : x), `${p.nome}: fabricação iniciada`);
          else { setTrab({ p: k, ritmo: "regular", res: null, cons: null }); setPainel("trabalho"); } }}>{!p.iniciado ? "INICIAR" : p.prog >= p.alvo ? "PRONTO" : "TRABALHAR"}</button>
      </div>; })}
    {Array.from({ length: Math.max(0, 2 - nIniciais) }, (_, k) => <button key={k} type="button" className="af-vaga af-vaga-projeto" disabled={locked} onClick={() => { setPainel(null); setMercado(true); }}>
      <span>+</span><span><b>ESCOLHER NO MERCADO</b><small>PROJETO INICIAL · {nIniciais + k + 1} DE 2</small></span>
    </button>)}
  </div>;

  const painelView = <>
    {painel === "oficina" && <Painel baixo titulo="OFICINA" fechar={() => setPainel(null)}>{oficina}</Painel>}
    {painel === "instalar" && <Painel baixo titulo="INSTALAR MODIFICAÇÃO" fechar={() => setPainel("oficina")}>
      <div className="te-folha">
        <p className="te-intro">Instalar, remover ou substituir exige ferramentas apropriadas e 10 minutos. Cada equipamento recebe só uma Modificação sua.</p>
        <span className="te-rotulo">EQUIPAMENTO</span>
        <div className="af-equips">{equips.map(e => { const usado = mods.some((m, k) => m && m.equip === e.nome && k !== inst.slot);
          return <Cartao key={e.nome} cor={e.cor} ativa={inst.equip === e.nome} titulo={e.nome} sub={e.tipo} curta={usado ? "JÁ MODIFICADO" : ""} off={usado} icone={iconeEquip(e, 40)} clicar={() => setInst({ ...inst, equip: e.nome, mod: null })} />; })}</div>
        <span className="te-rotulo">MODIFICAÇÃO</span>
        <div className="tc-opcoes" data-col="3">{MODS.map(m => { const ok = !!equipSel && m.alvos.includes(equipSel.categoria);
          return <button key={m.id} type="button" className="te-resposta" aria-pressed={inst.mod === m.id} disabled={!ok} onClick={() => setInst({ ...inst, mod: m.id })}>
            <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={m.d} tam={17} traco={2} /></span>
            <span><strong>{m.nome}</strong><small>{m.curta}</small></span>
          </button>; })}</div>
        <button type="button" className="te-primario" disabled={locked || !inst.equip || !inst.mod} onClick={confirmarInstalar}>INSTALAR · 10 MIN</button>
      </div>
    </Painel>}
    {painel === "desmontar" && <Painel baixo titulo="DESMONTAR ITEM" fechar={() => setPainel("oficina")}>
      <div className="te-folha">
        <p className="te-intro">O item é destruído e vira Projeto. Os materiais recuperados cobrem o custo da primeira fabricação com ele.</p>
        <span className="te-rotulo">DO SEU INVENTÁRIO</span>
        <div className="af-equips" data-col="3">{desmontaveis.map(({ i, m }) => { const ja = ehProjeto(m.slug);
          return <Cartao key={m.slug} cor={corCategoria(i.categoria) ?? "#35c7d8"} ativa={escolha === m.slug} titulo={i.itemNome} sub={i.categoria.toUpperCase()} curta={ja ? "JÁ É PROJETO" : ""} off={ja} icone={iconeEquip({ categoria: i.categoria, nome: i.itemNome, modelo: m }, 40)} clicar={() => setEscolha(m.slug)} />; })}</div>
        <button type="button" className="te-primario" disabled={locked || !escolha} onClick={() => { const m = escolha ? modeloDe(escolha) : undefined; const p = m && novoProjeto(m, { coberto: true }); if (!p) return; salvarProjetos([...projetos, p], `${p.nome} desmontado`); setPainel("oficina"); }}>DESMONTAR · 8 H</button>
      </div>
    </Painel>}
    {painel === "trabalho" && prj && <Painel baixo titulo={`PERÍODO DE TRABALHO · ${prj.nome.toUpperCase()}`} fechar={() => setPainel("oficina")}>
      <div className="te-folha">
        <p className="te-intro">Escolha o ritmo antes do teste de Engenharia contra CD {prj.cd}. Depois marque o resultado: o Progresso é rolado aqui.</p>
        <span className="te-rotulo">RITMO</span>
        <div className="af-grade3">{RITMOS.map(r => <button key={r.id} type="button" className="af-opcao" aria-pressed={t.ritmo === r.id} onClick={() => setTrab({ ...t, ritmo: r.id, cons: null })}><strong>{r.nome}</strong><small>{r.curta}</small></button>)}</div>
        <span className="te-rotulo">RESULTADO DO TESTE</span>
        <div className="af-grade3">{RESULTADOS.map(([id, nome]) => <button key={id} type="button" className="af-opcao af-resultado" aria-pressed={t.res === id} onClick={() => setTrab({ ...t, res: id, cons: null })}>{nome}</button>)}</div>
        {consOpcoes.length > 0 && <>
          <span className="te-rotulo">CONSEQUÊNCIA</span>
          <div className="af-linha">{consOpcoes.map(o => <button key={o.id} type="button" className="af-opcao af-resultado" aria-pressed={t.cons === o.id} onClick={() => setTrab({ ...t, cons: o.id })}>{o.nome}</button>)}</div>
        </>}
        <p className="af-trab-texto">{trabTexto}</p>
        <button type="button" className="te-primario" disabled={locked || !t.res || (consOpcoes.length > 0 && !t.cons)} onClick={registrarTrabalho}>REGISTRAR PERÍODO</button>
      </div>
    </Painel>}
    {mercado && <JanelaMercado onFechar={() => { setMercado(false); setPainel("oficina"); }}>
      {(fechar) => <MercadoHud
        produtos={[...(api.catalogo?.values() ?? [])].filter(elegivelMercado).map(m => produtoDoModelo(api as ConsoleApi, m))}
        saldo={0} usados={0} capacidade={0} onComprar={() => {}} onFechar={fechar}
        projeto={{
          tag: nIniciais < 2 ? `projeto inicial · ${nIniciais + 1} de 2` : "lista de mercadorias",
          contagem: { rotulo: "projetos iniciais", valor: `${nIniciais}/2` },
          ja: ehProjeto,
          linhas: p => { const t2 = TABELA[chaveRar(p.raridade)]; return t2 ? [{ rotulo: "CD de fabricação", valor: String(t2[0]) }, { rotulo: "Progresso necessário", valor: String(t2[1]) }] : []; },
          materiais: p => Math.round(p.preco / 2),
          apos: p => `${Math.min(2, nIniciais + (ehProjeto(p.slug) ? 0 : 1))}/2`,
          onAdicionar: slug => { const m = modeloDe(slug); const p = m && novoProjeto(m, { inicial: true }); if (!p || ehProjeto(slug)) return; salvarProjetos([...projetos, p], `Projeto: ${p.nome}`); fechar(); },
        }}
      />}
    </JanelaMercado>}
  </>;

  return { chips, rodape: <button type="button" onClick={() => { setSelMod(null); setPainel("oficina"); }}>OFICINA</button>, painel: painelView };
}
