"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import type { ConsoleApi } from "../../types";
import { availableClassActions, classActionBlock, classResource, focusLimit, readClassPlay, reached, CLASS_RANKS } from "../../../../../lib/character/classManagement";
import { COR_RECURSO } from "../../coresRecurso";
import { CabecalhoModulo } from "../CabecalhoModulo";
import { oxanium } from "../../../../_design/oxanium";
import ancora from "../../../../../../content/v12/db_classe_ancora_v1_2.json";
import regrasPersonagem from "../../../../../../content/db_regras_personagem_normalizado_v1_4.json";
import "./ancoraRede.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "derivados">>;
type Aliado = NonNullable<ConsoleApi["classe"]>["alvos"][number];
type Caracteristica = { nome: string; descricao: string };
type Tratamento = { id: string; patient: string; origin: string; successes: number; archived?: boolean };

const classe = ancora.classes[0];
const subclasses = ancora.subclasses as unknown as { slug: string; nome: string; caracteristicas: Record<string, Caracteristica[]> }[];
const R = 170;
const iniciais = (nome: string) => nome.trim().slice(0, 2).toUpperCase();

/** Texto de regra em blocos: título em caixa alta, item com marcador, parágrafo. */
function blocos(texto: string) {
  return texto.split("\n\n").flatMap(trecho => {
    let linhas = trecho.split("\n");
    const saida: { tipo: "titulo" | "item" | "paragrafo"; destaque: string; texto: string }[] = [];
    if (linhas.length > 1 && linhas[0] === linhas[0].toUpperCase()) { saida.push({ tipo: "titulo", destaque: "", texto: linhas[0] }); linhas = linhas.slice(1); }
    const corrido = linhas.join(" ");
    if (corrido.startsWith("• ")) {
      const corpo = corrido.slice(2), i = corpo.indexOf(":");
      saida.push({ tipo: "item", destaque: i > 0 ? corpo.slice(0, i + 1) + " " : "", texto: i > 0 ? corpo.slice(i + 1).trim() : corpo });
    } else {
      const m = corrido.match(/^(Intervenção\.) /);
      saida.push({ tipo: "paragrafo", destaque: m ? m[1] + " " : "", texto: m ? corrido.slice(m[0].length) : corrido });
    }
    return saida;
  });
}

/**
 * Tela de classe da Âncora: o anel da rede. Segue o desenho aprovado no
 * canvas (D, T, V, CO). Só lê o que a ficha sabe: Focos, cargas, PV/PE e
 * condições dos aliados. Distância, ordem de turno e resultado de teste
 * ainda não chegam ao Console, então os estados que dependem deles
 * (Foco falhou, Primeira Resposta, Janela de Reanimação, "já agiu") não aparecem.
 */
export function AncoraRede({ api, rank, subclassId }: { api: Api; rank: string; subclassId?: string }) {
  const [fase, setFase] = useState<"anel" | "entra" | "sai">("anel");
  // Painel de baixo é sobreposição: abrir não pode desmontar a tela embaixo
  // (ela encolhia, a rolagem era forçada para cima e tudo pulava).
  const [painel, setPainel] = useState<null | "habilidades" | "pacientes" | "briefing">(null);
  const [entra, setEntra] = useState<string | null>(null);
  const [sai, setSai] = useState<string | null>(null);
  const [orientar, setOrientar] = useState<{ origem: string; destino: string | null } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const arrasto = useRef<{ x: number; left: number; moveu: boolean } | null>(null);
  const arrastou = useRef(false);

  const state = readClassPlay(api.character);
  const resource = classResource(api.character);
  const send = api.classe?.executar;
  const locked = !!api.somenteLeitura || !send;
  const paMax = api.derivados?.pa_max ?? 0;
  const sub = subclasses.find(item => item.slug === subclassId);
  const allies = (api.classe?.alvos ?? []).filter(target => target.aliado);
  const todos = reached(rank, "S");
  const limite = todos ? allies.length : focusLimit({ ranking: rank, subclasse_id: subclassId });
  const focos = (todos ? allies.map(ally => ally.id) : state.focus.slice(-limite)).map(id => allies.find(ally => ally.id === id)).filter((ally): ally is Aliado => !!ally);
  const alvo = focos.find(ally => ally.id === state.target) ?? focos[0];
  const foraDaRede = allies.filter(ally => !focos.some(foco => foco.id === ally.id));
  const trocaGratis = reached(rank, "D") && !state.uses["scene:atencao"];
  const acoes = availableClassActions(api.character).filter(action => reached(rank, action.rank));
  const acao = (id: string) => acoes.find(action => action.id === id);
  // Última intervenção desta rodada que ainda dá para devolver (o desfazer do motor).
  // Última ação desfazível (intervenção ou ação da subclasse): é ela que ganha o retorno na tela.
  const ultimaId = state.undo ? acoes.find(action => state.last?.startsWith(action.name))?.id : undefined;
  const ultimaFoiIntervencao = !!state.undo && state.undo.state.resource > state.resource;
  const MARCA: Record<string, { texto: string; tom: string }> = { ajustar: { texto: "+1", tom: "verde" }, conter: { texto: "−1", tom: "verde" }, aterramento: { texto: "+PE", tom: "pe" }, socorros: { texto: "+PV", tom: "pv" }, ritmo: { texto: "AGE", tom: "verde" }, resposta: { texto: "→", tom: "pv" } };
  const resultado = (id: string, nome: string) => ({
    ajustar: `Ajustar em ${nome}: +1 no teste`,
    conter: `Conter em ${nome}: a falha cai uma categoria`,
    aterramento: `Aterrar ${nome}: 2 PA gastos · recupera 1d6+2 PE`,
    socorros: `Primeiros Socorros em ${nome}: 2 PA gastos · recupera 1d4 PV`,
    ritmo: `${nome} age agora · Imposição de Ritmo`,
    resposta: `Primeira Resposta: você vai até ${nome}`,
  } as Record<string, string>)[id];

  const usar = (id: string, target?: string) => {
    const action = acao(id);
    if (!action || locked) return;
    send?.({ type: "use", id, target });
    if ((id === "ajustar" || id === "conter") && acao("orientar") && focos.length > 1 && target) setOrientar({ origem: target, destino: null });
  };
  const escolherEntrada = (id: string) => {
    if (arrastou.current || locked) return;
    if (focos.length < limite) {
      send?.({ type: "focus", id });
      const sobra = limite - focos.length - 1, restantes = foraDaRede.length - 1;
      setFase(sobra > 0 && restantes > 0 ? "entra" : "anel");
      return;
    }
    setEntra(id); setSai(current => current ?? alvo?.id ?? null); setFase("sai");
  };
  const confirmarTroca = (free: boolean) => {
    if (!entra || !sai) return;
    send?.({ type: "swapFocus", out: sai, in: entra, free });
    setFase("anel"); setEntra(null); setSai(null);
  };
  const fechar = () => { setFase("anel"); setEntra(null); setSai(null); };
  const fecharPainel = () => { setPainel(null); setAberta(null); };
  const clicarFoco = (id: string) => {
    if (locked) return;
    if (fase === "sai" || (fase === "entra" && !designando)) setSai(id);
    else if (orientar) { if (id !== orientar.origem) setOrientar({ ...orientar, destino: id }); }
    else if (fase === "anel") send?.({ type: "target", id });
  };

  const n = focos.length;
  const tam = n <= 3 ? 72 : n <= 6 ? 60 : 52;
  // O palco vai até o rótulo do Foco mais baixo (nome + duas linhas), ou até o fim do anel.
  const fundoFocos = Math.max(0, ...focos.map((_, index) => R + R * Math.sin((-90 + 360 * index / Math.max(1, n)) * Math.PI / 180) + tam / 2 + 7 + 64));
  const alturaPalco = Math.round(Math.max(2 * R + 16, fundoFocos));
  const trocando = fase === "entra" || fase === "sai";
  // Com vaga livre a escolha é designação (sem quem sai), e pode ser de vários.
  const designando = fase === "entra" && focos.length < limite;
  // Leitura de recurso dos aliados SÓ POR FAIXA, e só quando uma característica dá esse
  // conhecimento: Triagem de Combate (Vitalista C, PV) e a leitura de PE do Terapeuta (C).
  // Nunca o número; o arco também anda por faixa, senão revelaria a proporção exata.
  const recursoLido = reached(rank, "C") ? subclassId === "vitalista" ? "pv" as const : subclassId === "terapeuta" ? "pe" as const : null : null;
  const FAIXAS = [{ texto: "Cheio", fracao: 100 }, { texto: "Acima da metade", fracao: 75 }, { texto: "Metade ou menos", fracao: 33 }, { texto: "Zerado", fracao: 0 }, { texto: "Colapso mental", fracao: 0 }];
  // PE desce até −⌈máx/2⌉; nesse piso é Colapso mental. PV para em 0.
  const faixaDe = (atual?: number, max?: number) => atual == null || !max ? null : atual >= max ? FAIXAS[0] : atual > max / 2 ? FAIXAS[1] : atual > 0 ? FAIXAS[2] : recursoLido === "pe" && atual <= -Math.ceil(max / 2) ? FAIXAS[4] : FAIXAS[3];
  const leitura = (ally: Aliado) => {
    if (!recursoLido) return null;
    const faixa = recursoLido === "pv" ? faixaDe(ally.pv, ally.pvMax) : faixaDe(ally.pe, ally.peMax);
    if (!faixa) return null;
    const sigla = recursoLido === "pv" ? "PV" : "PE";
    return { faixa, sigla, cor: COR_RECURSO[recursoLido], texto: faixa.fracao === 100 ? `${sigla} cheio` : faixa === FAIXAS[3] ? (recursoLido === "pv" ? "0 PV · Colapso" : "0 PE ou menos") : faixa.texto, critico: faixa.fracao <= 33 };
  };
  const triagem = subclassId === "vitalista" && reached(rank, "C");
  const alerta = triagem ? foraDaRede.find(ally => ally.pvMax && ally.pv != null && ally.pv <= ally.pvMax / 2) : undefined;
  const indiceAlvo = alvo ? focos.indexOf(orientar ? focos.find(f => f.id === orientar.origem) ?? alvo : alvo) : -1;
  const angulo = (index: number) => (-90 + 360 * index / Math.max(1, n)) * Math.PI / 180;
  const meuRotulo = sub ? `${sub.nome.toUpperCase()} · ${rank}` : `RANKING ${rank}`;
  const tratamentos: Tratamento[] = (() => { try { const raw = JSON.parse(state.selections.therapyRecords ?? "null"); return Array.isArray(raw) ? raw : []; } catch { return []; } })();
  const salvarTratamentos = (lista: Tratamento[]) => send?.({ type: "select", key: "therapyRecords", value: JSON.stringify(lista) });
  const participantes = allies.filter(ally => state.selections[`briefing-${ally.id}`]);

  const linha = (index: number, cor: string, tracejada = false) => {
    const a = angulo(index), cima = Math.sin(a) < -0.3;
    const fim = R - tam / 2 - (cima ? 64 : 10);
    return <div className="ar-linha" aria-hidden="true" data-tracejada={tracejada} style={{ transform: `rotate(${a * 180 / Math.PI}deg)`, "--ar-cor": cor, "--ar-fim": `${fim}px` } as React.CSSProperties} />;
  };

  return <section className={`rc-eq-outer ar-raiz ${oxanium.variable} ${plex.variable}`} aria-label="Classe Âncora">
    <div className="rc-eq-card-outer rc-inv-moldura">
    <CabecalhoModulo id="ID://CLASSE" mod="MOD.CLASS // 10" />
    <div className="ar-tela" data-fase={fase}>
    <div className="ar-rolagem">
    <header className="ar-cab">
      <h2>ÂNCORA</h2>
      <span>{trocando ? (designando ? "ESCOLHER FOCOS" : "TROCAR FOCO") : meuRotulo}</span>
      {fase === "anel" && recursoLido && <span className="ar-legenda"><i style={{ background: COR_RECURSO[recursoLido] }} />{recursoLido === "pv" ? "PV" : "PE"} POR FAIXA</span>}
    </header>

    {!allies.length ? <div className="ar-vazio"><strong>{api.classe?.carregandoAlvos ? "Carregando aliados…" : api.classe?.erroAlvos ? "Não foi possível carregar os aliados" : "Nenhum aliado disponível"}</strong><p>{api.classe?.erroAlvos ?? "Os outros personagens de jogador vinculados à campanha aparecem aqui. Personagens arquivados não entram na lista."}</p>{api.classe?.atualizarAlvos && <button type="button" className="ar-link" disabled={api.classe.carregandoAlvos} onClick={api.classe.atualizarAlvos}>Atualizar aliados</button>}</div> : <>
    <div className="ar-palco" style={{ "--ar-raio": `${R}px`, "--ar-tam": `${tam}px`, height: alturaPalco } as React.CSSProperties}>
      <div className="ar-esmaece" data-esmaecido={fase === "entra"}>
        <div className="ar-anel" data-todos={todos} aria-hidden="true" />
        {fase === "anel" && !orientar && alvo && <Fragment key={`linha-${alvo.id}`}>{linha(indiceAlvo, "var(--ar-verde)")}</Fragment>}
        {orientar && indiceAlvo >= 0 && linha(indiceAlvo, "var(--ar-verde)")}
        {orientar?.destino && <Fragment key={`orienta-${orientar.destino}`}>{linha(focos.findIndex(f => f.id === orientar.destino), "rgba(61,220,132,.8)", true)}</Fragment>}
        <div className="ar-centro">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></svg>
          {!trocando && <span key={`cargas-${state.resource}`} className="ar-cargas" data-gastou={state.resource < resource.max} role="img" aria-label={`${state.resource} de ${resource.max} intervenções nesta rodada`}>
            {Array.from({ length: resource.max }, (_, index) => <i key={index} data-pronta={index < state.resource} />)}
            {subclassId === "coordenador" && reached(rank, "C") && <b title="Coordenação Paralela" />}
          </span>}
        </div>
        {focos.map((ally, index) => {
          const a = angulo(index);
          const selecionado = !trocando && !orientar && ally.id === alvo?.id;
          const origem = orientar?.origem === ally.id;
          const destino = orientar?.destino === ally.id;
          const candidato = !!orientar && !origem;
          const saindo = trocando && ally.id === sai;
          const dado = leitura(ally);
          const usada = ultimaId && state.target === ally.id ? MARCA[ultimaId] ?? null : null;
          const condicao = ally.condicoes?.[0];
          const meta = saindo ? { texto: "SAI", cor: "#ff8a7a" } : origem ? { texto: ultimaId === "conter" ? "CONTIDO" : "AJUSTADO", cor: "#8fa6b4" } : destino ? { texto: "ORIENTADO", cor: "var(--ar-verde)" }  : dado ? { texto: dado.texto.toUpperCase(), cor: dado.critico ? (dado.sigla === "PV" ? "#ff8a9a" : "#c9a3ff") : (dado.sigla === "PV" ? "#c9a3ab" : "#c3b0ff") } : null;
          const fracao = dado ? dado.faixa.fracao : null;
          return <button key={ally.id} type="button" className="ar-foco" disabled={locked || (!!orientar && origem)} aria-pressed={selecionado || saindo || destino}
            data-selecionado={selecionado || origem} data-saindo={saindo} data-candidato={candidato} data-destino={destino}
            style={{ left: `calc(50% + ${Math.round(R * Math.cos(a))}px)`, top: `${Math.round(R + R * Math.sin(a))}px`, "--ar-i": index } as React.CSSProperties}
            onClick={() => clicarFoco(ally.id)}>
            <span className="ar-avatar" data-arco={fracao != null} style={fracao != null ? { "--ar-arco": dado!.cor, "--ar-fracao": `${fracao}%` } as React.CSSProperties : undefined}>
              <span><Rosto aliado={ally} /></span>
              {usada && <em key={usada.texto} data-tom={usada.tom}>{usada.texto}</em>}
            </span>
            <span className="ar-nome">{ally.nome}</span>
            {meta && <span className="ar-meta" style={{ color: meta.cor }}>{meta.texto}</span>}
            {!saindo && !orientar && condicao && <span className="ar-meta" data-tom="condicao">{condicao}{ally.condicoes!.length > 1 ? ` +${ally.condicoes!.length - 1}` : ""}</span>}
          </button>;
        })}
      </div>
    </div>

    {alerta && fase === "anel" && <div className="ar-alerta"><i /><span><b>{alerta.nome}</b> está com metade dos PV ou menos</span><button type="button" disabled={locked} onClick={() => focos.length < limite ? send?.({ type: "focus", id: alerta.id }) : (setEntra(alerta.id), setSai(alvo?.id ?? null), setFase("sai"))}>TORNAR FOCO</button></div>}

    {fase === "anel" && !n && !todos && <div className="ar-acoes">
      <span className="ar-rotulo">QUEM ENTRA NA REDE?</span>
      <Carrossel aliados={foraDaRede} escolher={escolherEntrada} arrasto={arrasto} arrastou={arrastou} locked={locked} />
    </div>}

    {fase === "anel" && alvo && (orientar ? <div key="orientar" className="ar-acoes">
      <span className="ar-rotulo">ORIENTAÇÕES COORDENADAS · {orientar.destino ? <><b>{allies.find(a => a.id === orientar.destino)?.nome.toUpperCase()}</b> PODE</> : "CLIQUE NO FOCO QUE RECEBE"}</span>
      <div className="ar-botoes ar-tres">
        {["DESLOCAR ATÉ 2 M", "SACAR OU GUARDAR", "INTERAÇÃO SIMPLES"].map(opcao => <button key={opcao} type="button" disabled={locked || !orientar.destino} onClick={() => { send?.({ type: "use", id: "orientar", target: orientar.destino! }); setOrientar(null); }}>{opcao}</button>)}
      </div>
      {orientar.destino && <p className="ar-texto">Se a ação de {allies.find(a => a.id === orientar.origem)?.nome} der certo, {allies.find(a => a.id === orientar.destino)?.nome} ganha +1 no próximo teste até o fim do próximo turno dele.</p>}
      <button type="button" className="ar-link ar-link-neutro" onClick={() => setOrientar(null)}>SEM ORIENTAÇÃO</button>
    </div> : <div key="intervir" className="ar-acoes">
      {ultimaId && resultado(ultimaId, alvo.nome) ? <span key={`${ultimaId}-${alvo.id}-${state.last}`} className="ar-resultado" data-tom={MARCA[ultimaId]?.tom}>{resultado(ultimaId, alvo.nome)}</span> : <span className="ar-rotulo">INTERVIR EM <b>{alvo.nome.toUpperCase()}</b></span>}
      <div className="ar-botoes">
        {(["ajustar", "conter"] as const).map((id, index) => {
          const action = acao(id); const block = action ? classActionBlock(api.character, action, paMax, alvo.id) : "Indisponível";
          return <button key={id} type="button" data-primaria={index === 0} disabled={locked || !!block} title={block ?? action?.description} onClick={() => usar(id, alvo.id)}>{id === "ajustar" ? "AJUSTAR +1" : "CONTER"}</button>;
        })}
      </div>
      {subclassId === "terapeuta" && acao("aterramento") && <button type="button" className="ar-extra" data-tom="pe" disabled={locked || !!classActionBlock(api.character, acao("aterramento")!, paMax, alvo.id)} onClick={() => usar("aterramento", alvo.id)}>ATERRAR {alvo.nome.toUpperCase()} <small>2 PA · +1d6+2 PE</small></button>}
      {subclassId === "vitalista" && acao("socorros") && <button type="button" className="ar-extra" data-tom="pv" disabled={locked || !!classActionBlock(api.character, acao("socorros")!, paMax, alvo.id)} onClick={() => usar("socorros", alvo.id)}>PRIMEIROS SOCORROS <small>2 PA · 1d4 PV</small></button>}
      {subclassId === "coordenador" && acao("ritmo") && <button type="button" className="ar-extra" disabled={locked || !!classActionBlock(api.character, acao("ritmo")!, paMax, alvo.id)} onClick={() => usar("ritmo", alvo.id)}>IMPOR RITMO <small>{alvo.nome.toUpperCase()} AGE AGORA</small></button>}
      {(!state.resource || ultimaId) && <div className="ar-linha-info">
        {!state.resource && <span className="ar-rotulo">SEM INTERVENÇÕES NESTA RODADA</span>}
        {ultimaId ? <button type="button" className="ar-link" disabled={locked} onClick={() => send?.({ type: "undo" })}>{ultimaFoiIntervencao ? "RECUPERAR INTERVENÇÃO" : "DESFAZER"}</button>
          : !state.resource && <button type="button" className="ar-link" disabled={locked} onClick={() => send?.({ type: "refill" })}>RESTAURAR INTERVENÇÕES</button>}
      </div>}
    </div>)}

    {fase === "entra" && <div key="entra" className="ar-acoes">
      <span className="ar-rotulo">{designando ? `QUEM ENTRA NA REDE? · ${focos.length} DE ${limite} FOCOS` : !sai ? "QUEM ENTRA NA REDE?" : `QUEM ENTRA NO LUGAR DE ${allies.find(a => a.id === sai)?.nome.toUpperCase()}?`}</span>
      <Carrossel aliados={foraDaRede} escolher={escolherEntrada} arrasto={arrasto} arrastou={arrastou} locked={locked} />
    </div>}

    {fase === "sai" && <div key="sai" className="ar-acoes">
      <div className="ar-troca"><span className="ar-avatar-mini"><Rosto aliado={allies.find(a => a.id === entra)} /></span><strong>{sai ? `${allies.find(a => a.id === entra)?.nome} entra no lugar de ${allies.find(a => a.id === sai)?.nome}` : `Clique no Foco que sai para ${allies.find(a => a.id === entra)?.nome} entrar`}</strong></div>
      <div className="ar-botoes">
        <button type="button" data-primaria="true" disabled={locked || !sai} onClick={() => confirmarTroca(false)}>TROCAR · 1 PA</button>
        {trocaGratis && <button type="button" data-gratis="true" disabled={locked || !sai} onClick={() => confirmarTroca(true)}>TROCA GRÁTIS</button>}
      </div>
      {trocaGratis && <span className="ar-rotulo">TROCA GRÁTIS: 1 POR CENA</span>}
    </div>}
    </>}
    </div>

    <footer className="ar-rodape">
      {trocando ? <>
        <button type="button" className="ar-rodape-forte" onClick={fechar}>{designando ? "PRONTO" : "CANCELAR"}</button>
        <span>{designando ? `${limite - focos.length} ${limite - focos.length === 1 ? "VAGA" : "VAGAS"}` : sai ? "CLIQUE EM OUTRO FOCO PARA MUDAR QUEM SAI" : "CLIQUE EM QUEM SAI"}</span>
      </> : <>
        {todos ? <span>TODOS A 10 M SÃO FOCOS</span> : <button type="button" disabled={locked || !foraDaRede.length || !n} onClick={() => { setOrientar(null); setSai(focos.length < limite ? null : alvo?.id ?? null); setFase("entra"); }}>{focos.length < limite ? "ADICIONAR FOCO" : "TROCAR FOCO"}</button>}
        {subclassId === "terapeuta" && <button type="button" onClick={() => setPainel("pacientes")}>PACIENTES</button>}
        {subclassId === "coordenador" && <button type="button" onClick={() => setPainel("briefing")}>BRIEFING</button>}
        <button type="button" onClick={() => setPainel("habilidades")}>HABILIDADES ›</button>
      </>}
    </footer>

    {painel === "habilidades" && <Painel titulo="HABILIDADES" fechar={fecharPainel}>
      {[{ secao: "CLASSE", tipo: "classe", nome: classe.nome, itens: classe.caracteristicas as Record<string, Caracteristica[]> }, ...(sub ? [{ secao: sub.nome.toUpperCase(), tipo: "subclasse", nome: sub.nome, itens: sub.caracteristicas }] : [])].map(({ secao, tipo, nome, itens }) => {
        const todas = CLASS_RANKS.flatMap(r => itens[r] ?? []).length;
        const liberadas = CLASS_RANKS.filter(r => reached(rank, r)).flatMap(r => itens[r] ?? []).length;
        return <div key={secao} className="ar-hab-secao" data-tipo={tipo}>
        <div className="ar-hab-cab">
          <span className="ar-hab-selo" aria-hidden="true">{tipo === "classe"
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 8 9-8 9-8-9z" /></svg>}</span>
          <span className="ar-hab-cab-texto"><small>{tipo === "classe" ? "CLASSE" : "SUBCLASSE"}</small><strong>{nome}</strong></span>
          <span className="ar-hab-conta">{liberadas} de {todas} liberadas</span>
        </div>
        {CLASS_RANKS.flatMap(r => (itens[r] ?? []).map(item => ({ ...item, r }))).map(item => {
          const id = `${secao}-${item.r}-${item.nome}`, aberto = aberta === id, travada = !reached(rank, item.r);
          return <div key={id} className="ar-hab">
            <button type="button" aria-expanded={aberto} data-aberto={aberto} data-travada={travada} onClick={() => setAberta(aberto ? null : id)}>
              <span className="ar-hab-rank">{item.r}</span><span className="ar-hab-nome">{item.nome}</span>
              {travada && <><span className="ar-hab-nota">Ranking {item.r}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></>}
              {!travada && item.nome === "Atenção Dividida" && <span className="ar-hab-nota" data-tom="ouro">{state.uses["scene:atencao"] ? "Troca grátis usada" : "Troca grátis pronta"}</span>}
              <svg className="ar-hab-seta" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {aberto && <div className="ar-hab-texto">{blocos(item.descricao).map((b, index) => b.tipo === "titulo" ? <span key={index} className="ar-hab-sub">{b.texto}</span> : b.tipo === "item" ? <p key={index} className="ar-hab-item"><b>{b.destaque}</b>{b.texto}</p> : <p key={index}><b>{b.destaque}</b>{b.texto}</p>)}</div>}
          </div>;
        })}
      </div>;
      })}
    </Painel>}

    {painel === "pacientes" && <Painel titulo="PACIENTES" fechar={fecharPainel} intro="Sessão de 1 h · Vontade CD 7 com +2 · 3 sucessos devolvem 1 de Integridade">
      {tratamentos.filter(t => !t.archived).map(t => <div key={t.id} className="ar-paciente">
        <span className="ar-avatar-lista" data-vazio={!t.patient}>{t.patient ? <Rosto aliado={allies.find(a => a.nome === t.patient) ?? { nome: t.patient }} /> : null}</span>
        <div className="ar-paciente-info">
          <Seletor leve titulo="Paciente" desabilitado={locked} valor={t.patient} opcoes={[{ id: "", nome: "Escolher paciente" }, ...(t.patient && !allies.some(a => a.nome === t.patient) ? [{ id: t.patient, nome: t.patient }] : []), ...allies.map(a => ({ id: a.nome, nome: a.nome, rosto: a }))]} onEscolher={valor => salvarTratamentos(tratamentos.map(x => x.id === t.id ? { ...x, patient: valor } : x))} />
          <input aria-label="Origem" disabled={locked} value={t.origin} placeholder="Origem da perda" onChange={e => salvarTratamentos(tratamentos.map(x => x.id === t.id ? { ...x, origin: e.target.value } : x))} />
        </div>
        <span className="ar-pips" role="img" aria-label={`${t.successes} de 3 sucessos`}>{[0, 1, 2].map(i => <i key={i} data-cheio={i < t.successes} />)}</span>
        {t.successes >= 3 ? <span className="ar-paciente-fim"><b>+1 INTEGRIDADE</b>CICLO CONCLUÍDO</span>
          : <button type="button" className="ar-registrar" disabled={locked || !t.patient} title={t.patient ? "Registrar um sucesso terapêutico" : "Escolha o paciente primeiro"} onClick={() => salvarTratamentos(tratamentos.map(x => x.id === t.id ? { ...x, successes: x.successes + 1 } : x))}>+ SUCESSO</button>}
      </div>)}
      <button type="button" className="ar-novo" disabled={locked} onClick={() => salvarTratamentos([...tratamentos, { id: crypto.randomUUID(), patient: "", origin: "", successes: 0 }])}>+ NOVO TRATAMENTO</button>
    </Painel>}

    {painel === "briefing" && <Painel titulo="BRIEFING OPERACIONAL" fechar={fecharPainel} intro={`Antes da cena, pelo menos 5 minutos. Até ${focusLimit({ ranking: rank, subclasse_id: subclassId })} participantes, o seu limite de Focos. Cada um escolhe uma perícia do papel que vai cumprir no plano.`}>{sair => <>
      {allies.filter(a => participantes.includes(a) || participantes.length < focusLimit({ ranking: rank, subclasse_id: subclassId })).map(a => <div key={a.id} className="ar-participante">
        <span className="ar-avatar-lista" data-ativo={participantes.includes(a)}><Rosto aliado={a} /></span>
        <span className="ar-participante-nome">{a.nome}</span>
        <Seletor opcoes={OPCOES_PERICIA} titulo={`Perícia de ${a.nome} no briefing`} desabilitado={locked} valor={state.selections[`briefing-${a.id}`] ?? ""} onEscolher={valor => send?.({ type: "select", key: `briefing-${a.id}`, value: valor })} />
      </div>)}
      <p className="ar-texto ar-texto-esq">Na cena, cada participante pode rerrolar uma vez com +1 uma falha na perícia escolhida, se o teste fizer parte do plano.</p>
      <div className="ar-painel-fim"><span>UM NOVO BRIEFING SUBSTITUI O ANTERIOR</span><button type="button" onClick={sair}>FECHAR O PLANO</button></div>
    </>}</Painel>}
    </div>
    </div>
  </section>;
}

const OPCOES_PERICIA = [{ id: "", nome: "Não participa" }, ...regrasPersonagem.pericias.map(p => ({ id: p.id, nome: p.nome }))];

/**
 * Seletor genérico (perícia do Briefing, paciente do Terapeuta).
 * Lista própria no lugar do `<select>` do navegador, no mesmo molde do
 * `SeletorToken` do Rolador: a lista mora dentro do componente (acompanha
 * a rolagem do painel), abre para cima quando não cabe embaixo, fecha com
 * clique fora, Esc ou escolha. ↑/↓ andam, Home/End vão às pontas e uma
 * letra pula para a próxima perícia que começa com ela.
 */
type OpcaoSeletor = { id: string; nome: string; rosto?: { nome: string; avatarUrl?: string | null } };

function Seletor({ titulo, valor, opcoes, onEscolher, desabilitado, leve }: { titulo: string; valor: string; opcoes: OpcaoSeletor[]; onEscolher: (valor: string) => void; desabilitado?: boolean; /** Sem caixa: o nome como título clicável. */ leve?: boolean }) {
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [aberta, setAberta] = useState<null | { cima: boolean }>(null);
  const atual = opcoes.find(o => o.id === valor) ?? opcoes[0];
  const fechar = useCallback((devolverFoco = false) => { setAberta(null); if (devolverFoco) gatilho.current?.focus(); }, []);
  const alternar = () => {
    if (aberta) { fechar(); return; }
    const r = gatilho.current?.getBoundingClientRect();
    const caixa = gatilho.current?.closest(".ar-painel-corpo")?.getBoundingClientRect();
    const altura = 280;
    const cabeBaixo = !r || (caixa?.bottom ?? window.innerHeight) - r.bottom >= altura + 8;
    const cabeCima = !!r && r.top - (caixa?.top ?? 0) >= altura + 8;
    setAberta({ cima: !cabeBaixo && cabeCima });
  };
  useEffect(() => {
    if (!aberta) return;
    // Rola só a lista até a opção marcada; o foco não pode rolar o console.
    requestAnimationFrame(() => {
      const marcada = lista.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (!marcada || !lista.current) return;
      lista.current.scrollTop = marcada.offsetTop - lista.current.clientHeight / 2 + marcada.offsetHeight / 2;
      marcada.focus({ preventScroll: true });
    });
    const fora = (e: PointerEvent) => { const alvo = e.target as Node; if (!lista.current?.contains(alvo) && !gatilho.current?.contains(alvo)) fechar(); };
    const tecla = (e: KeyboardEvent) => {
      const itens = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const i = itens.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(true); return; }
      if (e.key === "Tab") { fechar(); return; }
      let proximo = -1;
      if (e.key === "ArrowDown") proximo = Math.min(itens.length - 1, i + 1);
      else if (e.key === "ArrowUp") proximo = Math.max(0, i - 1);
      else if (e.key === "Home") proximo = 0;
      else if (e.key === "End") proximo = itens.length - 1;
      else if (e.key.length === 1 && /\p{L}/u.test(e.key)) {
        const letra = e.key.toLocaleLowerCase("pt-BR");
        const ordem = [...itens.slice(i + 1), ...itens.slice(0, i + 1)];
        const achado = ordem.find(b => b.textContent?.trim().toLocaleLowerCase("pt-BR").normalize("NFD").startsWith(letra.normalize("NFD")));
        proximo = achado ? itens.indexOf(achado) : -1;
      } else return;
      e.preventDefault();
      const el = itens[proximo], l = lista.current;
      if (!el || !l) return;
      el.focus({ preventScroll: true });
      if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop;
      else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight;
    };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [aberta, fechar]);
  return <span className="ar-sel" data-leve={leve}>
    <button ref={gatilho} type="button" className="ar-sel-gatilho" aria-haspopup="listbox" aria-expanded={aberta !== null} aria-label={`${titulo}: ${atual.nome}`} data-vazio={!atual.id} disabled={desabilitado} onClick={alternar}>
      <span className="ar-sel-opcao">{!leve && atual.rosto && <i className="ar-sel-rosto"><Rosto aliado={atual.rosto} /></i>}{atual.nome}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {aberta && <div ref={lista} role="listbox" aria-label={titulo} className="ar-sel-lista" data-cima={aberta.cima}>
      {opcoes.map(o => <button key={o.id || "nenhuma"} type="button" role="option" aria-selected={o.id === atual.id} data-vazio={!o.id} onClick={() => { onEscolher(o.id); fechar(true); }}>
        <span className="ar-sel-opcao">{o.rosto && <i className="ar-sel-rosto"><Rosto aliado={o.rosto} /></i>}{o.nome}</span>
        {o.id === atual.id && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
      </button>)}
    </div>}
  </span>;
}

/** Rosto do aliado: o avatar da ficha; sem ele (ou se a imagem falhar), a sigla. */
function Rosto({ aliado }: { aliado?: { nome: string; avatarUrl?: string | null } }) {
  const [falhou, setFalhou] = useState(false);
  const url = aliado?.avatarUrl;
  useEffect(() => { setFalhou(false); }, [url]);
  if (url && !falhou) return <img className="ar-rosto" src={url} alt="" draggable={false} onError={() => setFalhou(true)} />;
  return <>{iniciais(aliado?.nome ?? "")}</>;
}

function Carrossel({ aliados, escolher, arrasto, arrastou, locked }: { aliados: Aliado[]; escolher: (id: string) => void; arrasto: React.MutableRefObject<{ x: number; left: number; moveu: boolean } | null>; arrastou: React.MutableRefObject<boolean>; locked: boolean }) {
  return <div className="ar-carrossel"
    onPointerDown={e => { arrasto.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moveu: false }; }}
    onPointerMove={e => { const a = arrasto.current; if (!a) return; const dx = e.clientX - a.x; if (Math.abs(dx) > 4) a.moveu = true; e.currentTarget.scrollLeft = a.left - dx; }}
    onPointerUp={() => { const a = arrasto.current; arrasto.current = null; if (a?.moveu) { arrastou.current = true; setTimeout(() => { arrastou.current = false; }, 0); } }}
    onPointerLeave={() => { arrasto.current = null; }}>
    {aliados.map((a, index) => <button key={a.id} type="button" className="ar-candidato" style={{ "--ar-i": index } as React.CSSProperties} disabled={locked} onClick={() => escolher(a.id)}>
      <span className="ar-avatar-cand"><Rosto aliado={a} /></span><span className="ar-cand-nome">{a.nome}</span>
    </button>)}
  </div>;
}

function Painel({ titulo, intro, fechar, children }: { titulo: string; intro?: string; fechar: () => void; children: React.ReactNode | ((sair: () => void) => React.ReactNode) }) {
  // Sai animado: marca a saída e só desmonta quando a animação do painel termina.
  const [saindo, setSaindo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const fecharBotao = useRef<HTMLButtonElement>(null);
  const sair = () => setSaindo(true);
  // Foco no fechar sem rolar nada por baixo.
  useEffect(() => { fecharBotao.current?.focus({ preventScroll: true }); }, []);
  // A roda só rola o corpo do painel (e a lista de perícias), nunca a tela embaixo.
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      const dentro = (e.target as HTMLElement).closest<HTMLElement>(".ar-painel-corpo, .ar-sel-lista");
      if (!dentro) { e.preventDefault(); return; }
      const noTopo = dentro.scrollTop <= 0 && e.deltaY < 0;
      const noFim = dentro.scrollTop + dentro.clientHeight >= dentro.scrollHeight - 1 && e.deltaY > 0;
      if (noTopo || noFim) e.preventDefault();
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, []);
  return <div ref={raiz} className="ar-sheet">
    <div className="ar-veu" aria-hidden="true" data-saindo={saindo} onClick={sair} />
    <div className="ar-painel" role="dialog" aria-label={titulo} data-saindo={saindo}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); sair(); } }}
      onAnimationEnd={event => { if (saindo && event.target === event.currentTarget) fechar(); }}>
      <div className="ar-painel-cab"><h3>{titulo}</h3><button ref={fecharBotao} type="button" aria-label={`Fechar ${titulo.toLowerCase()}`} onClick={sair}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
      {intro && <p className="ar-painel-intro">{intro}</p>}
      <div className="ar-painel-corpo">{typeof children === "function" ? children(sair) : children}</div>
    </div>
  </div>;
}
