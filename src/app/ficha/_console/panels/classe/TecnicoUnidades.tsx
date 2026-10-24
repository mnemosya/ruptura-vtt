"use client";

import { useState } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import type { ConsoleApi } from "../../types";
import { classResource, readClassPlay, reached, type ClassCommand } from "../../../../../lib/character/classManagement";
import { funcaoDaRodada, unidade, PD_UNIDADE, type TecnicoAcao } from "../../../../../lib/character/tecnicoTela";
import { CabecalhoModulo } from "../CabecalhoModulo";
import { oxanium } from "../../../../_design/oxanium";
import { ItemCategoryIcon } from "../../../../_design/itemIcons";
import { corCategoria } from "../../../../_design/itemCategoryColors";
import tecnico from "../../../../../../content/v12/db_classe_tecnico_v1_2.json";
import { ListaHabilidades, Painel, type Caracteristica } from "./painelClasse";
import { useRoboticista } from "./TecnicoRoboticista";
import "./ancoraRede.css";
import "./combatenteAnel.css";
import "./tecnicoUnidades.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "glossario" | "catalogo" | "escalpos">>;
type Livro = { nome: string; caracteristicas: Record<string, Caracteristica[]> };

const classe = tecnico.classes[0] as unknown as Livro;
const subclasses = tecnico.subclasses as unknown as (Livro & { slug: string })[];

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
type PosDica = "cima" | "cima-esq" | "cima-dir" | "baixo-esq" | "baixo-dir";
const Dica = ({ texto, pos }: { texto: string; pos: PosDica }) => <span className="ca-dica" data-pos={pos} role="tooltip">{texto}</span>;

const ICONES = {
  classe: "M12 2 21 7v10l-9 5-9-5V7ZM12 7v5l4 2",
  protocolo: "M4 12h4l2-5 4 10 2-5h4",
  registro: "M4 4h16v16H4ZM8 4v6h8V4M8 20v-6h8v6",
  sync: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  check: "M5 12.5 9.5 17 19 7",
};

/** Funções do livro, com o resumo e a regra das pranchetas aprovadas. */
const FUNCOES = [
  { id: "amplificacao", rank: "F", nome: "Amplificação", curta: "+1 NO TESTE OU +2", d: "M13 2 4 14h7l-1 8 9-12h-7z", regra: "Escolha uma função do sistema (atacar, detectar, mover, proteger, transmitir, executar um comando). Até o início do seu próximo turno: se exigir teste, o próximo recebe +1 de vantagem; se não, +2 em alcance, deslocamento, PD concedidos ou cura de PV." },
  { id: "diagnostico", rank: "F", nome: "Diagnóstico", curta: "PD, FALHAS E +1", d: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M21 21l-4.35-4.35M8 11h6", regra: "Descubra os PD atuais, partes quebradas ou desligadas, efeitos temporários e uma alteração detectável de um equipamento na área ou conectado. A próxima ação para operar, reparar, modificar, sabotar ou acessar o alvo recebe +1 de vantagem (Acessar: uma tentativa adicional). Não revela senhas nem supera proteções." },
  { id: "estabilizacao", rank: "F", nome: "Estabilização", curta: "IGNORA UM EFEITO", d: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6ZM9 12l2 2 4-4", regra: "Escolha um efeito técnico temporário que prejudique uma função do sistema. Até o início do seu próximo turno, ele ignora esse efeito. Não recupera PD nem repara o que foi destruído." },
  { id: "interface", rank: "F", nome: "Interface", curta: "AGIR À DISTÂNCIA", d: "M4 5h16v11H4ZM8 20h8M12 16v4", regra: "Execute Interagir ou Acessar sobre o sistema como se estivesse ao alcance dele, sem outro custo em PA. Use sua perícia normalmente. Não dá tentativas extras nem substitui kits." },
  { id: "manutencao", rank: "F", nome: "Manutenção", curta: "+1D6 PD · 1× POR SISTEMA", d: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4Z", regra: "O sistema recupera 1d6 PD. Um mesmo sistema só recupera PD por Manutenção uma vez por cena." },
  { id: "monitoramento", rank: "F", nome: "Monitoramento", curta: "AVISA QUANDO MUDA", d: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l7-7", regra: "Escolha uma criatura, objeto, dispositivo ou região que a Unidade perceba. Até o início do seu próximo turno, você sabe na hora quando ele se move, é usado, sofre dano ou perde PD, transmite um sinal ou muda de estado." },
  { id: "derivacao", rank: "D", nome: "Derivação", curta: "−3 DE DANO · PD DA UNIDADE", d: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6ZM9 12h6", regra: "Proteja um equipamento ou quem o usa: até o início do seu próximo turno, o próximo dano é reduzido em até 3, e a Unidade perde a mesma quantidade de PD. Aplica antes das demais proteções." },
  { id: "desregulacao", rank: "D", nome: "Desregulação", curta: "−1 NO TESTE OU −2", d: "M3 12h4l3-8 4 16 3-8h4", regra: "Escolha uma atividade de um equipamento (disparar, detectar movimento, deslocar-se, proteger). Até o início do seu próximo turno: se exigir teste, o próximo sofre −1 de desvantagem; se não, −2 em alcance, deslocamento, PD concedidos ou cura de PV." },
  { id: "travamento", rank: "D", nome: "Travamento", curta: "PARTE MÓVEL PRESA", d: "M5 11h14v10H5ZM8 11V7a4 4 0 0 1 8 0v4", regra: "Escolha uma parte móvel de uma porta, máquina ou dispositivo. Até o início do seu próximo turno, ela fica na posição atual; os controles não a movem, mas alguém pode forçá-la com um teste. Não afeta corpos, implantes nem escalpos." },
  { id: "rele", rank: "B", nome: "Relé", curta: "ALCANCE +100 M", d: "M12 20v-6M8.5 16.5a5 5 0 0 1 7 0M5.5 13.5a9 9 0 0 1 13 0M2.5 10.5a13 13 0 0 1 19 0", regra: "Posicionada: a até 100 m dela, você opera suas outras Unidades e sistemas remotos que também estejam a até 100 m. Acoplada: +100 m no alcance de controle remoto do sistema. Fica ativo sem novo PA até a Unidade executar outra Função, ser recolhida, ficar Inativa ou a cena terminar." },
];
const nomeFuncao = (id?: string | null) => FUNCOES.find(f => f.id === id)?.nome ?? "";
const pos3 = (k: number): PosDica => k % 3 === 0 ? "cima-esq" : k % 3 === 2 ? "cima-dir" : "cima";

type Sistema = { nome: string; tipo: string; cor: string; icone: React.ReactNode };

/** O que dá para acoplar: itens que estão com você, escalpos instalados, drones e robôs. */
function sistemasDoPersonagem(api: Api): Sistema[] {
  const c = api.character, vistos = new Set<string>(), lista: Sistema[] = [];
  const add = (s: Sistema) => { if (!vistos.has(s.nome)) { vistos.add(s.nome); lista.push(s); } };
  for (const d of c.drones ?? []) add({ nome: d.nome, tipo: "DRONE", cor: corCategoria("drone") ?? "#b2ce62", icone: <ItemCategoryIcon category="drone" size={28} color="currentColor" strokeWidth={1.5} /> });
  for (const r of c.robos ?? []) add({ nome: r.nome, tipo: "ROBÔ", cor: corCategoria("robo") ?? "#b2ce62", icone: <ItemCategoryIcon category="robo" group="Drones e robôs" size={28} color="currentColor" strokeWidth={1.5} /> });
  for (const e of c.escalpos_instalados ?? []) {
    const m = api.escalpos?.catalogo.find(x => x.id === e.contentId || x.slug === e.contentId);
    add({ nome: e.nomeCustomizado || m?.nome || e.contentId, tipo: "ESCALPO", cor: corCategoria("escalpo") ?? "#c578d9", icone: <ItemCategoryIcon category="escalpo" size={28} color="currentColor" strokeWidth={1.5} /> });
  }
  for (const i of c.inventario ?? []) {
    if (i.estado === "abrigo") continue;
    const m = api.catalogo?.get(i.itemSlug);
    add({ nome: i.itemNome, tipo: (m?.categoria ?? i.categoria).replaceAll("_", " ").toUpperCase(), cor: corCategoria(i.categoria) ?? "#35c7d8",
      icone: <ItemCategoryIcon category={i.categoria} weaponName={i.itemNome} armorRegions={m?.regioes} size={28} color="currentColor" strokeWidth={1.5} /> });
  }
  return lista;
}

type Chip = { chave: string; icone: string; rotulo: string; valor: string; usado: boolean; dica: string; clicar: () => void };

export function TecnicoUnidades({ api, rank, subclassId }: { api: Api; rank: string; subclassId?: string }) {
  const [painel, setPainel] = useState<null | "habilidades" | "acoplar" | "protocolo">(null);
  const [sel, setSel] = useState(0);
  const [rascAlvo, setRascAlvo] = useState("");
  const [instalando, setInstalando] = useState(false);
  const [rascProt, setRascProt] = useState<{ gatilho: string; resposta: string | null }>({ gatilho: "", resposta: null });

  const st = readClassPlay(api.character);
  const max = classResource(api.character).max;
  const send = api.classe?.executar;
  const locked = !!api.somenteLeitura || !send;
  const at = (r: string) => reached(rank, r);
  const sub = subclasses.find(item => item.slug === subclassId);
  const temSub = !!sub && at("E");
  const enviar = (cmd: ClassCommand) => { if (!locked) send?.(cmd); };
  const acao = (a: TecnicoAcao, passo: string) => enviar({ type: "tecnico", acao: a, passo });
  const topoPilha = st.pilha?.[st.pilha.length - 1]?.nome;
  const uso = (chave: string) => st.uses[chave] ?? 0;

  /* ── Unidade selecionada ── */
  const j = Math.min(sel, max - 1), rotuloU = `UNIDADE 0${j + 1}`, passoU = max > 1 ? `${rotuloU}: ` : "";
  const u = unidade(st, j), pd = u?.value ?? st.tecnico?.pdGuardado?.[j] ?? PD_UNIDADE;
  const instalada = !!u, inativa = instalada && pd <= 0, ativa = instalada && !inativa, acoplada = u?.installation === "attached";
  const fn = funcaoDaRodada(st, j), prot = st.tecnico?.prot?.[j], reg = !!st.tecnico?.reg?.[j];
  const funcoes = FUNCOES.filter(f => at(f.rank));
  const formaTexto = !instalada ? "PRONTA PARA INSTALAR" : acoplada ? `ACOPLADA · ${(u?.attachment ?? "").toUpperCase()}` : "POSICIONADA · 4 M DE RAIO";

  /* ── Chips: Protocolo (D), Registro (B) e Operação Sincronizada (S) ── */
  const chipProt: Chip | null = at("D") ? { chave: "protocolo", icone: ICONES.protocolo, rotulo: "PROTOCOLO", usado: !prot,
    valor: prot ? `QUANDO ${prot.gatilho.toUpperCase()} → ${nomeFuncao(prot.resposta).toUpperCase()}` : "SEM PROTOCOLO",
    dica: "Quando o gatilho acontecer, a Unidade executa a Função sozinha, sem gastar PA ou Reação. Divide o limite de 1 Função por rodada com a ativação manual. Reprogramar a até 20 m custa 1 PA. Toque para programar.",
    clicar: () => { setRascProt({ gatilho: prot?.gatilho ?? "", resposta: prot?.resposta ?? null }); setPainel("protocolo"); } } : null;
  const chipReg: Chip | null = at("B") ? { chave: "registro", icone: ICONES.registro, rotulo: "REGISTRO", usado: false,
    valor: reg ? "SALVO · RESTAURAR 2 PA" : "1× POR CENA · 1 PA",
    dica: "Registro: uma vez por cena, por 1 PA, preserve o estado técnico do sistema. Restaurar: por 2 PA, o sistema volta a esse estado e o Registro é apagado. Some se a Unidade for recolhida, ficar Inativa ou a cena acabar.",
    clicar: () => acao({ op: "registro", unidade: j }, reg ? `${passoU}Registro restaurado` : `${passoU}Registro criado`) } : null;
  const sync = !!uso("round:sync");
  const chipSync: Chip | null = at("S") ? { chave: "sync", icone: ICONES.sync, rotulo: "OPERAÇÃO SINCRONIZADA", usado: sync, valor: sync ? "USADA NA RODADA" : "1× POR RODADA",
    dica: "Uma vez por rodada, ao gastar 1 PA para executar manualmente a Função de uma Unidade, escolha outra Unidade ativa: ela também executa uma Função, sem PA adicional. Cada uma precisa de alvo válido e usa sua operação da rodada. Toque para marcar; toque de novo para desmarcar.",
    clicar: () => enviar({ type: "marcarUso", chave: "round:sync", passo: sync ? "Sincronizada desmarcada" : "Operação Sincronizada" }) } : null;
  const chipView = (c: Chip & { tom?: string }, pos: PosDica) =>
    <button key={c.chave} type="button" className="ca-chip ca-tem-dica te-chip" data-usado={c.usado || undefined} data-tom={c.tom} disabled={locked} onClick={c.clicar}>
      <Svg d={c.icone} tam={14} traco={2} />{c.rotulo}<b>· {c.valor}</b>
      <Dica texto={c.dica} pos={pos} />
    </button>;

  /* ── Ações ── */
  const executar = (id: string, nome: string) => {
    if (!ativa) return;
    if (fn === id) acao({ op: "funcao", unidade: j, funcao: null }, `${passoU}${nome} desmarcada`);
    else acao({ op: "funcao", unidade: j, funcao: id }, `${passoU}${nome}`);
  };
  const definirPd = (k: number) => { if (!instalada) return; const n = k === pd ? k - 1 : k; acao({ op: "pd", unidade: j, valor: n }, `${passoU}PD ${pd} → ${n}`); };
  const abrirAcoplar = (novo: boolean) => { setInstalando(novo); setRascAlvo(novo ? "" : u?.attachment ?? ""); setPainel("acoplar"); };
  const confirmarAlvo = () => {
    const nome = rascAlvo.trim(); if (!nome) return;
    if (instalando) acao({ op: "instalar", unidade: j, forma: "acoplada", alvo: nome }, `${passoU}Instalada acoplada`);
    else acao({ op: "alvo", unidade: j, alvo: nome }, `${passoU}Sistema renomeado`);
    setPainel(null);
  };
  const salvarProtocolo = () => {
    if (!rascProt.gatilho.trim() || !rascProt.resposta) return;
    acao({ op: "protocolo", unidade: j, protocolo: { gatilho: rascProt.gatilho, resposta: rascProt.resposta } }, `${passoU}Protocolo programado`);
    setPainel(null);
  };
  /* ── Subclasse: chips no topo, ação no rodapé e folhas próprias ── */
  const rob = useRoboticista({ api, st, rank: at, max, acao, locked });
  const subMod = temSub && subclassId === "roboticista" ? rob : null;
  const sistemas = painel === "acoplar" ? sistemasDoPersonagem(api) : [];
  const rotulo = temSub ? `${sub!.nome.toUpperCase()} · ${rank}` : `RANKING ${rank}`;

  return <section className={`rc-eq-outer ar-raiz ca-raiz te-raiz ${oxanium.variable} ${plex.variable}`} aria-label="Classe Técnico">
    <div className="rc-eq-card-outer rc-inv-moldura">
    <CabecalhoModulo id="ID://CLASSE" mod="MOD.CLASS // 10" />
    <div className="ar-tela">
    <div className="ar-rolagem">
      <header className="ar-cab">
        <h2>TÉCNICO</h2>
        <span>{rotulo}</span>
        <span className="ca-legenda" aria-hidden="true"><span><svg width="11" height="12" viewBox="0 0 22 24" fill="none" stroke="#8fa6b4" strokeWidth="2.4"><path d="M11 1.5 20.5 7v10L11 22.5 1.5 17V7Z" /></svg>1 FUNÇÃO POR UNIDADE · 1 PA</span></span>
      </header>
      {(chipSync || subMod?.chips.length) && <div className="ca-chips te-chips-topo" data-sub={!!subMod || undefined}>
        {subMod?.chips.map((c, k, l) => chipView(c, k === l.length - 1 && k > 0 ? "baixo-dir" : "baixo-esq"))}
        {chipSync && chipView(chipSync, subMod ? "baixo-dir" : "baixo-esq")}
      </div>}

      <div className="te-palco" data-varias={max > 1 || undefined}>
        {max > 1 && <div className="te-abas" role="tablist" aria-label="Unidades">{Array.from({ length: max }, (_, k) =>
          <button key={k} type="button" role="tab" aria-selected={k === j} className="te-aba" onClick={() => setSel(k)}>UNIDADE 0{k + 1}</button>)}</div>}

        <section className="te-unidade" aria-label="Unidade de Campo">
          <div className="te-titulo">
            <span className="ca-tem-dica" tabIndex={0}>{rotuloU} · {!instalada ? "GUARDADA" : inativa ? "INATIVA" : "ATIVA"}<Dica pos="cima" texto="10 PD. Com 0 PD fica Inativa e seus efeitos são suspensos; recupera todos os PD com 10 minutos de reparo. Instalar ou recolher ao seu alcance custa 1 PA. Opera a até 20 m." /></span>
            <button type="button" className="te-forma" data-acoplada={acoplada || undefined} disabled={locked || !acoplada} onClick={() => abrirAcoplar(false)}>{formaTexto}</button>
          </div>
          <div className="te-hexa" data-estado={!instalada ? "guardada" : inativa ? "inativa" : "ativa"}>
            <svg width="120" height="132" viewBox="0 0 104 114" aria-hidden="true">
              <path d="M52 3 99 30v54L52 111 5 84V30Z" strokeWidth="1.8" />
              <path d="M52 18 86 37v40L52 96 18 77V37Z" fill="none" strokeWidth=".8" opacity=".5" />
            </svg>
            <b>{instalada ? pd : "—"}</b>
            <small>{instalada ? `/ ${PD_UNIDADE} PD` : "GUARDADA"}</small>
          </div>
          <div className="te-pd">
            <span>PD</span>
            <div role="group" aria-label="PD da Unidade">{Array.from({ length: PD_UNIDADE }, (_, k) =>
              <button key={k} type="button" className="te-seg" aria-label={`PD ${k + 1}`} disabled={locked || !instalada} onClick={() => definirPd(k + 1)}
                data-cheio={instalada && k < pd || undefined} data-baixo={instalada && k < pd && pd <= 3 || undefined}><i /></button>)}</div>
            <b data-ativa={ativa || undefined}>{pd} / {PD_UNIDADE}</b>
          </div>
          {(chipProt || chipReg) && <div className="te-chips">{chipProt && chipView(chipProt, "cima")}{chipReg && chipView(chipReg, "cima")}</div>}
          <div className="te-acoes">
            {instalada && <>
              {inativa && <button type="button" className="te-link" data-tom="claro" disabled={locked} onClick={() => acao({ op: "reparar", unidade: j }, `${passoU}Unidade reparada`)}>REPARAR · 10 MIN</button>}
              <button type="button" className="te-link" disabled={locked} onClick={() => acao({ op: "recolher", unidade: j }, `${passoU}Unidade recolhida`)}>RECOLHER · 1 PA</button>
            </>}
            {!instalada && <>
              <button type="button" className="te-uso" disabled={locked} onClick={() => acao({ op: "instalar", unidade: j, forma: "posicionada" }, `${passoU}Instalada posicionada`)}>INSTALAR POSICIONADA · 1 PA</button>
              <button type="button" className="te-uso" disabled={locked} onClick={() => abrirAcoplar(true)}>INSTALAR ACOPLADA · 1 PA</button>
            </>}
            {topoPilha && <button type="button" className="te-link" data-tom="claro" disabled={locked} onClick={() => enviar({ type: "desfazerCombate" })}>DESFAZER · {topoPilha.toUpperCase()}</button>}
          </div>
        </section>

        <section className="te-funcoes" aria-label="Funções">
          <span>FUNÇÕES · <b data-usada={!!fn || undefined}>{max > 1 ? `${rotuloU} · ` : ""}{fn ? `${nomeFuncao(fn).toUpperCase()} NESTA RODADA` : "1 POR RODADA · 1 PA"}</b></span>
          <div>{funcoes.map((f, k) => {
            const marcada = fn === f.id;
            return <button key={f.id} type="button" className="te-funcao ca-tem-dica" aria-pressed={marcada} disabled={locked} data-off={!ativa || undefined} onClick={() => executar(f.id, f.nome)}>
              <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={f.d} tam={17} traco={2} /></span>
              <span><strong>{f.nome}</strong><small>{marcada ? "NESTA RODADA" : f.curta}</small></span>
              <Dica texto={f.regra} pos={pos3(k)} />
            </button>;
          })}</div>
        </section>
      </div>
    </div>

    <footer className="ar-rodape te-rodape">
      {subMod?.rodape ?? <span />}
      <button type="button" onClick={() => setPainel("habilidades")}>HABILIDADES ›</button>
    </footer>

    {subMod?.painel}
    {painel === "habilidades" && <Painel titulo="HABILIDADES" fechar={() => setPainel(null)}>
      <ListaHabilidades classe={classe} sub={temSub ? sub : undefined} rank={rank} glossario={api.glossario} iconeClasse={<Svg d={ICONES.classe} tam={16} />} />
    </Painel>}

    {painel === "acoplar" && <Painel baixo titulo={`ACOPLAR A · ${rotuloU}`} fechar={() => setPainel(null)}>
      <div className="te-folha">
        <p className="te-intro">{instalando ? "Escolha o equipamento, máquina, dispositivo, implante, escalpo ou Nó em que a Unidade vai se acoplar. Ela acompanha os movimentos dele." : "Corrija o nome do sistema acoplado. Acoplar a outro sistema é recolher e instalar de novo (1 PA cada)."}</p>
        {sistemas.length > 0 && <>
          <span className="te-rotulo">DO SEU INVENTÁRIO</span>
          <div className="te-inventario">{sistemas.map(s => { const marcado = rascAlvo === s.nome;
            return <button key={s.nome} type="button" className="te-cartao" aria-pressed={marcado} style={{ ["--k" as string]: s.cor }} onClick={() => setRascAlvo(s.nome)}>
              <span className="te-cartao-arte"><i />{s.icone}<span className="te-cartao-check"><Svg d={ICONES.check} tam={13} traco={3} /></span></span>
              <span className="te-cartao-info"><strong>{s.nome}</strong><small>{s.tipo}</small></span>
              <span className="te-cartao-fio" />
            </button>; })}</div>
        </>}
        <label className="te-campo">OUTRO SISTEMA<input type="text" maxLength={60} placeholder="Ex.: porta do cofre, torre automatizada" value={sistemas.some(s => s.nome === rascAlvo) ? "" : rascAlvo} onChange={e => setRascAlvo(e.target.value)} /></label>
        <button type="button" className="te-primario" disabled={locked || !rascAlvo.trim()} onClick={confirmarAlvo}>{instalando ? "ACOPLAR · 1 PA" : "SALVAR"}</button>
      </div>
    </Painel>}

    {painel === "protocolo" && <Painel baixo titulo={`PROTOCOLO · ${rotuloU}`} fechar={() => setPainel(null)}>
      <div className="te-folha">
        <p className="te-intro">Quando o gatilho acontecer, a Unidade executa a Função sozinha, sem gastar PA ou Reação. Divide o limite de 1 Função por rodada com a ativação manual. Reprogramar a até 20 m custa 1 PA.</p>
        <label className="te-campo">QUANDO<input type="text" maxLength={80} placeholder="Ex.: o drone perder PD, uma criatura entrar na área" value={rascProt.gatilho} onChange={e => setRascProt({ ...rascProt, gatilho: e.target.value })} /></label>
        <span className="te-rotulo">EXECUTAR</span>
        <div className="te-respostas">{funcoes.map(f => { const marcada = rascProt.resposta === f.id;
          return <button key={f.id} type="button" className="te-resposta" aria-pressed={marcada} onClick={() => setRascProt({ ...rascProt, resposta: f.id })}>
            <span><svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" strokeWidth="2.4" /></svg><Svg d={f.d} tam={17} traco={2} /></span>
            <span><strong>{f.nome}</strong><small>{f.curta}</small></span>
          </button>; })}</div>
        <div className="te-folha-fim">
          <button type="button" className="te-link" disabled={locked || !prot} onClick={() => { acao({ op: "protocolo", unidade: j, protocolo: null }, `${passoU}Protocolo removido`); setPainel(null); }}>SEM PROTOCOLO</button>
          <button type="button" className="te-primario" disabled={locked || !rascProt.gatilho.trim() || !rascProt.resposta} onClick={salvarProtocolo}>SALVAR PROTOCOLO</button>
        </div>
      </div>
    </Painel>}
    </div>
    </div>
  </section>;
}
