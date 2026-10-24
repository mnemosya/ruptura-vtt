"use client";

import { useState } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import type { ConsoleApi } from "../../types";
import { classResource, readClassPlay, reached, FONTES_BRECHA, USOS_BRECHA, type ClassCommand, type RegistroBrecha } from "../../../../../lib/character/classManagement";
import { CabecalhoModulo } from "../CabecalhoModulo";
import { oxanium } from "../../../../_design/oxanium";
import infiltrador from "../../../../../../content/v12/db_classe_infiltrador_v1_2.json";
import { ListaHabilidades, Painel, type Caracteristica } from "./painelClasse";
import "./ancoraRede.css";
import "./combatenteAnel.css";
import "./infiltradorBrechas.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "glossario">>;
type Livro = { nome: string; caracteristicas: Record<string, Caracteristica[]> };

const classe = infiltrador.classes[0] as unknown as Livro;
const subclasses = infiltrador.subclasses as unknown as (Livro & { slug: string })[];

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
type PosDica = "cima" | "cima-esq" | "cima-dir" | "baixo-esq" | "baixo-dir";
const Dica = ({ texto, pos }: { texto: string; pos: PosDica }) => <span className="ca-dica" data-pos={pos} role="tooltip">{texto}</span>;

const ICONES: Record<string, string> = {
  classe: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v10M9 9.5l3-2.5 3 2.5",
  procurar: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  despercebido: "M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2",
  barreira: "M3 5h18v14H3ZM3 12h18M9 5v7M15 12v7",
  enganar: "M3 5h18v14H3ZM8 9.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4M13 10h5M13 14h4",
  acesso: "M5 11h14v10H5ZM8 11V7a4 4 0 0 1 7.5-2M12 15v2",
  info: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14",
  vantagem: "M7 15l5-5 5 5M7 10l5-5 5 5",
  margem: "M12 5v14M5 12h14",
  encobrir: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6ZM9 12h6",
  aliado: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8a4 4 0 0 1 0-8M22 21v-2a4 4 0 0 0-3-3.9",
  fantasma: "M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8Z",
  plano: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  inicio: "M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  passos: "M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0ZM20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0Z",
  reconhecer: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15.5 8.5l-2 5-5 2 2-5Z",
  todos: "M6 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4M18 9a2 2 0 1 0 0-4a2 2 0 1 0 0 4M6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8",
  sumir: "M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20",
  maos: "M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15",
  posicao: "M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M19 5l-2 2",
  piscar: "M13 2 4 14h7l-1 8 9-12h-7z",
};

/** Os gatilhos do livro para receber Brecha, com Procurar Brecha na frente. */
const GATILHOS = [
  { id: "procurar", curta: "1× POR CENA · 1 PA", regra: "Observe o ambiente, uma criatura ou um sistema e receba 1 Brecha. Uma vez por cena; custa 1 PA em rodadas. Precisa perceber algo ligado à infiltração. Não revela elementos ocultos nem substitui Investigar ou Vasculhar." },
  { id: "despercebido", curta: "TESTE PARA NÃO SER NOTADO", regra: "Você obtém sucesso em um teste para permanecer despercebido." },
  { id: "barreira", curta: "COM RISCO OU OPOSIÇÃO", regra: "Você supera uma barreira, área vigiada ou passagem perigosa em uma situação que envolva risco ou oposição." },
  { id: "enganar", curta: "LOCAL RESTRITO", regra: "Você engana alguém para entrar ou permanecer em um local restrito." },
  { id: "acesso", curta: "DESAFIO OU SEGURANÇA", regra: "Você supera um Desafio de Acesso ou compromete uma medida de segurança." },
  { id: "info", curta: "INVESTIGAR OU VASCULHAR", regra: "Investigar ou Vasculhar revela uma nova informação útil para a infiltração: rota, ponto cego, padrão de vigilância, acesso secundário ou vulnerabilidade de uma proteção." },
];
const ROTULO_USO: Record<string, string> = { vantagem: "+1 DE VANTAGEM", margem: "+2 DE MARGEM", encobrir: "ENCOBRIR FALHA", aliado: "ENCOBRIR ALIADO", posicao: "POSIÇÃO FALSA", piscar: "ENTRE UM PISCAR · 2" };
const PERGUNTAS = ["Qual é o caminho mais seguro até o destino que consigo perceber?", "Qual ameaça tem maior chance de detectar ou interceptar o grupo?", "Onde fica a saída ou posição segura mais próxima?", "Que parte do caminho exigirá maior cuidado?", "O que poderia tornar essa passagem insegura?"];
const DICAS = {
  fantasma: "Quando usar uma Brecha numa ação e obtiver sucesso, recupere a Brecha depois que a ação for resolvida e desloque-se 3 m sem gastar PA.",
  plano: "Quando falhar numa ação em que poderia usar uma Brecha, a falha vira sucesso limitado com margem 0. Numa Ação de Acessar, você supera a proteção, mas a Contramedida é resolvida na hora. Depois, perca todas as Brechas. Uma vez por cena. Toque para aplicar; DESFAZER volta.",
  passos: "Depois de gastar uma Brecha e obter sucesso numa ação para atravessar, evitar, acessar ou manipular um obstáculo, oriente os aliados a até 10 m que possam perceber suas instruções. Até o fim do seu próximo turno, cada um recebe +2 de vantagem no primeiro teste para superar o mesmo obstáculo ou seguir o caminho; numa Ação de Acessar, uma tentativa adicional. Uma vez por aliado por obstáculo.",
  passosC: " Caminho Seguro: quem concluir com sucesso se desloca 3 m sem gastar PA.",
  reconhecer: "Sempre que usar Procurar Brecha depois de observar o ambiente, escolha até duas perguntas sobre o caminho. O Narrador responde com o que você consegue perceber. Toque para ver as perguntas.",
  todos: "Uma vez por cena, ao usar Sigam Meus Passos, as orientações viram uma passagem preparada: até o fim da cena, cada aliado orientado pode segui-la uma vez sem os testes que sua preparação tornou desnecessários. Deixa de valer se as condições mudarem de forma significativa. Toque para marcar; DESFAZER volta.",
  sumir: "Uma vez por rodada, depois de terminar um movimento numa posição que permita se esconder, faça Esconder-se sem gastar PA. Também vale depois de uma ação bem-sucedida com Mãos Leves. Ter sido percebido antes na mesma rodada não impede. Pode usar uma Brecha no Esconder-se. Toque para marcar; toque de novo para desmarcar.",
  maos: "Uma vez por rodada: Interagir para apanhar, guardar, ocultar, retirar ou manipular discretamente um objeto pequeno custa −1 PA, ou uma Ação de Acessar contra fechadura mecânica custa −1 PA (mínimo 0). Ao passar ao alcance de uma criatura que não percebeu você, tente retirar um objeto pequeno que ela carregue: Precisão contra a Percepção dela. Toque para marcar; toque de novo para desmarcar.",
  posicaoAtiva: "A Brecha da Posição Falsa ainda pode dar um benefício ao primeiro teste de Furtividade ou Precisão contra uma criatura afetada, ou ativar Sem Alarde no primeiro ataque contra ela. Termina para quem perceber diretamente sua posição. Toque para encerrar.",
};

type Chip = { chave: string; icone: string; rotulo: string; valor: string; usado: boolean; ativo?: boolean; dica: string; clicar: () => void };

/** Nome, detalhe e ícone de cada linha de BRECHAS DA CENA. */
function linhaRegistro(r: RegistroBrecha) {
  const n = r.n ?? 1, brechas = `${n} ${n === 1 ? "Brecha" : "Brechas"}`;
  if (r.tipo === "recebeu") {
    if (r.id === "inicio") return { nome: "Ninguém Esteve Aqui", detalhe: "Recebeu 2 Brechas ao observar o ambiente." };
    if (r.id === "fantasma") return { nome: "Caminho Fantasma", detalhe: "Recuperou a Brecha gasta · 3 m sem gastar PA." };
    return { nome: FONTES_BRECHA[r.id] ?? "Gatilho", detalhe: "Recebeu 1 Brecha." };
  }
  if (r.tipo === "usou") return { nome: USOS_BRECHA[r.id]?.nome ?? "Brecha", detalhe: r.id === "posicao" ? "Usou 1 Brecha · −1 para localizar você · 3 m sem gastar PA." : r.id === "piscar" ? "Usou 2 Brechas · movimento e até duas ações sem gastar PA." : "Usou 1 Brecha." };
  if (r.tipo === "marcou") return r.id === "passos" ? { nome: "Sigam Meus Passos", detalhe: "Aliados orientados: +2 no primeiro teste até o fim do seu próximo turno." } : { nome: "Todos Pelo Mesmo Caminho", detalhe: "Passagem preparada até o fim da cena." };
  return r.id === "plano" ? { nome: "Plano de Contingência", detalhe: `Sucesso limitado, margem 0 · perdeu ${brechas}.` } : { nome: "Brechas perdidas", detalhe: `Perdeu ${brechas}.` };
}

export function InfiltradorBrechas({ api, rank, subclassId }: { api: Api; rank: string; subclassId?: string }) {
  const [painel, setPainel] = useState<null | "habilidades" | "cena" | "reconhecer">(null);
  const [usando, setUsando] = useState(false);

  const st = readClassPlay(api.character);
  const res = classResource(api.character);
  const send = api.classe?.executar;
  const locked = !!api.somenteLeitura || !send;
  const at = (r: string) => reached(rank, r);
  const sub = subclasses.find(item => item.slug === subclassId);
  const temSub = !!sub && at("E");
  const enviar = (cmd: ClassCommand) => { if (!locked) send?.(cmd); };
  const topoPilha = st.pilha?.[st.pilha.length - 1]?.nome;
  const desfazer = () => { setUsando(false); enviar({ type: "desfazerCombate" }); };
  const uso = (chave: string) => st.uses[chave] ?? 0;

  /* ── Brechas ── */
  const brechas = st.resource, max = res.max, cheia = brechas >= max;
  const receber = (fonte: string) => { setUsando(false); if (!cheia) enviar({ type: "brecha", op: "receber", fonte }); };
  const tocar = (j: number) => { if (j < brechas) setUsando(!usando); else receber("vaga"); };
  const usos = Object.keys(ROTULO_USO).filter(id => { const u = USOS_BRECHA[id]; return at(u.rank) && (!u.sub || (temSub && subclassId === u.sub)); });
  const usar = (id: string) => { setUsando(false); enviar({ type: "brecha", op: "usar", uso: id }); };
  const procurou = !!uso("scene:procurar"), gatilhoRodada = !!uso("round:gatilho");

  /* ── Chips: poderes da classe (B e S) e da subclasse ── */
  const marca = (chave: string, ligar: string, desligar: string) => () => enviar({ type: "marcarUso", chave, passo: uso(chave) ? desligar : ligar });
  const chips: Chip[] = [];
  if (at("B")) {
    const n = at("S") ? uso("round:fantasma") : uso("scene:fantasma");
    chips.push({ chave: "fantasma", icone: ICONES.fantasma, rotulo: "CAMINHO FANTASMA", usado: at("S") ? n >= 2 : n >= 1,
      valor: at("S") ? (n === 0 ? "2× POR RODADA" : n === 1 ? "1 DE 2 NA RODADA" : "USADO 2× NA RODADA") : (n ? "USADO NA CENA" : "1× POR CENA"),
      dica: `${DICAS.fantasma} ${at("S") ? "Até duas vezes por rodada, uma vez por ação." : "Uma vez por cena."} Toque para recuperar; DESFAZER volta.`, clicar: () => { setUsando(false); if (!cheia) enviar({ type: "brecha", op: "fantasma" }); } });
  }
  if (at("S")) chips.push({ chave: "plano", icone: ICONES.plano, rotulo: "PLANO DE CONTINGÊNCIA", usado: !!uso("scene:plano"), valor: uso("scene:plano") ? "USADO NA CENA" : "1× POR CENA", dica: DICAS.plano, clicar: () => { setUsando(false); enviar({ type: "brecha", op: "plano" }); } });
  const nPerguntas = PERGUNTAS.filter((_, i) => uso(`scene:pergunta:${i}`)).length;
  if (temSub && subclassId === "batedor") {
    const ativo = !!uso("ativo:passos");
    chips.push({ chave: "passos", icone: ICONES.passos, rotulo: "SIGAM MEUS PASSOS", usado: false, ativo, valor: ativo ? "ATIVO ATÉ SEU PRÓXIMO TURNO" : "+2 AOS ALIADOS",
      dica: DICAS.passos + (at("C") ? DICAS.passosC : "") + (ativo ? " Toque para encerrar." : " Toque para orientar."), clicar: marca("ativo:passos", "Sigam Meus Passos", "Orientação encerrada") });
    chips.push({ chave: "reconhecer", icone: ICONES.reconhecer, rotulo: "RECONHECER O CAMINHO", usado: false, valor: nPerguntas ? `${nPerguntas} DE 2 PERGUNTAS` : "2 PERGUNTAS", dica: DICAS.reconhecer, clicar: () => setPainel("reconhecer") });
    if (at("A")) chips.push({ chave: "todos", icone: ICONES.todos, rotulo: "TODOS PELO MESMO CAMINHO", usado: !!uso("scene:todos"), valor: uso("scene:todos") ? "PASSAGEM PREPARADA" : "1× POR CENA", dica: DICAS.todos, clicar: marca("scene:todos", "Todos Pelo Mesmo Caminho", "Passagem desmarcada") });
  } else if (temSub && subclassId === "sorrateiro") {
    chips.push({ chave: "sumir", icone: ICONES.sumir, rotulo: "SUMIR DE VISTA", usado: !!uso("round:sumir"), valor: uso("round:sumir") ? "USADO NA RODADA" : "1× POR RODADA", dica: DICAS.sumir, clicar: marca("round:sumir", "Sumir de Vista", "Sumir de Vista desmarcado") });
    chips.push({ chave: "maos", icone: ICONES.maos, rotulo: "MÃOS LEVES", usado: !!uso("round:maos"), valor: uso("round:maos") ? "USADO NA RODADA" : "1× POR RODADA", dica: DICAS.maos, clicar: marca("round:maos", "Mãos Leves", "Mãos Leves desmarcado") });
    if (uso("ativo:posicao")) chips.push({ chave: "posicao", icone: ICONES.posicao, rotulo: "POSIÇÃO FALSA", usado: false, ativo: true, valor: "ATIVA ATÉ SEU PRÓXIMO TURNO", dica: DICAS.posicaoAtiva, clicar: () => enviar({ type: "marcarUso", chave: "ativo:posicao", valor: false, passo: "Posição Falsa encerrada" }) });
  }
  const chipView = (c: Chip, k: number) =>
    <button key={c.chave} type="button" className="ca-chip ca-tem-dica" data-usado={c.usado || undefined} data-ativo={c.ativo || undefined} disabled={locked} onClick={c.clicar}>
      <Svg d={c.icone} tam={14} traco={2} />{c.rotulo}<b>· {c.valor}</b>
      <Dica texto={c.dica} pos={k % 2 ? "baixo-dir" : "baixo-esq"} />
    </button>;

  const rotulo = temSub ? `${sub!.nome.toUpperCase()} · ${rank}` : `RANKING ${rank}`;
  const vaoMarcadores = max >= 5 ? 16 : max === 4 || temSub ? 30 : 36;
  const registro = [...(st.registro ?? [])].reverse();

  return <section className={`rc-eq-outer ar-raiz ca-raiz in-raiz ${oxanium.variable} ${plex.variable}`} aria-label="Classe Infiltrador">
    <div className="rc-eq-card-outer rc-inv-moldura">
    <CabecalhoModulo id="ID://CLASSE" mod="MOD.CLASS // 10" />
    <div className="ar-tela">
    <div className="ar-rolagem">
      <header className="ar-cab">
        <h2>INFILTRADOR</h2>
        <span>{rotulo}</span>
        <span className="ca-legenda" aria-hidden="true"><span><i className="in-legenda-icone" />1 BRECHA POR AÇÃO</span></span>
      </header>
      {chips.length > 0 && <div className="ca-chips in-chips">{chips.map(chipView)}</div>}

      <div className="in-palco" data-chips={chips.length > 0 || undefined}>
        <section className="in-brechas" aria-label="Brechas">
          <div className="in-titulo">
            <span className="ca-tem-dica" tabIndex={0}>BRECHAS · {brechas} DE {max}<Dica pos="cima" texto={`Falhas de vigilância, oportunidades de passagem e vulnerabilidades. Até ${max}; as restantes são perdidas ao final da cena.${at("S") ? " No início de cada cena, depois de observar o ambiente, receba 2 (Ninguém Esteve Aqui)." : ""} Toque numa vazia para receber; numa acesa para usar.`} /></span>
            <small>{at("S") ? "ATÉ O FIM DA CENA · +2 NO INÍCIO" : "ATÉ O FIM DA CENA"}</small>
          </div>
          <div className="in-marcadores" style={{ gap: vaoMarcadores }}>{Array.from({ length: max }, (_, j) => {
            const acesa = j < brechas, proxima = j === brechas, ativa = acesa && usando && j === brechas - 1;
            return <button key={j} type="button" className="in-marcador" data-acesa={acesa || undefined} aria-pressed={ativa} disabled={locked}
              aria-label={acesa ? `Brecha ${j + 1}: tocar para usar` : `Vaga ${j + 1}: tocar para receber uma Brecha`} onClick={() => tocar(j)}>
              <svg width="100" height="100" viewBox="0 0 52 52" aria-hidden="true" style={{ filter: ativa ? "drop-shadow(0 0 16px var(--ca-halo))" : acesa ? "drop-shadow(0 0 9px var(--ca-halo))" : "none" }}>
                <path d="M4 14V4H14M38 4H48V14M48 38V48H38M14 48H4V38" fill="none" stroke={acesa ? "transparent" : proxima ? "#4b6a7d" : "#2c4556"} strokeWidth="1.4" />
                <rect x="10" y="10" width="32" height="32" fill={ativa ? "var(--ca-medio)" : acesa ? "var(--ca-fundo)" : "transparent"} />
                <path d="M10 19V10H19M33 10H42V19M42 33V42H33M19 42H10V33" fill="none" stroke={ativa ? "#ffffff" : acesa ? "var(--ca)" : "transparent"} strokeWidth="2.4" />
                <path d="M26 4V9M26 43V48M4 26H9M43 26H48" fill="none" stroke={acesa ? "var(--ca-claro)" : "transparent"} strokeWidth="1.4" />
                <path d="M26 19.5 32.5 26 26 32.5 19.5 26Z" fill={acesa ? "#e9fbfd" : "transparent"} />
              </svg>
              <small>0{j + 1}</small>
            </button>;
          })}</div>
          <div className="in-escolha">
            {usando && brechas > 0 ? <>
              <span>USAR EM</span>
              {usos.map(id => <button key={id} type="button" className="in-uso" disabled={locked || brechas < USOS_BRECHA[id].custo} onClick={() => usar(id)}>{ROTULO_USO[id]}</button>)}
              <button type="button" className="in-link" data-tom="neutro" onClick={() => setUsando(false)}>CANCELAR</button>
            </> : topoPilha && <button type="button" className="in-link" disabled={locked} onClick={desfazer}>DESFAZER · {topoPilha.toUpperCase()}</button>}
          </div>
        </section>

        <section className="in-receber" aria-label="Receber Brecha">
          <span>RECEBER BRECHA · <b data-usado={gatilhoRodada || undefined}>{gatilhoRodada ? "JÁ RECEBEU NESTA RODADA" : "1 POR RODADA"}</b></span>
          <div>{GATILHOS.map((g, k) => {
            const feito = g.id === "procurar" && procurou;
            return <button key={g.id} type="button" className="in-gatilho ca-tem-dica" data-feito={feito || undefined} disabled={locked} style={{ opacity: cheia ? .45 : 1 }} onClick={() => receber(g.id)}>
              <span>
                <svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" fill="var(--ca-fundo)" stroke="var(--ca)" strokeWidth="2.4" /></svg>
                <Svg d={ICONES[g.id]} tam={17} traco={2} />
              </span>
              <span>
                <strong>{FONTES_BRECHA[g.id]}</strong>
                <small>{feito ? "FEITO NA CENA" : g.curta}</small>
              </span>
              <Dica texto={g.regra} pos={k % 3 === 0 ? "cima-esq" : k % 3 === 2 ? "cima-dir" : "cima"} />
            </button>;
          })}</div>
        </section>
      </div>
    </div>

    <footer className="ar-rodape">
      <button type="button" disabled={locked || !brechas} onClick={() => { setUsando(false); enviar({ type: "brecha", op: "perder" }); }}>PERDER BRECHAS</button>
      <button type="button" onClick={() => setPainel("cena")}>BRECHAS DA CENA<span className="in-contador">{registro.length}</span></button>
      <button type="button" onClick={() => setPainel("habilidades")}>HABILIDADES ›</button>
    </footer>

    {painel === "habilidades" && <Painel titulo="HABILIDADES" fechar={() => setPainel(null)}>
      <ListaHabilidades classe={classe} sub={temSub ? sub : undefined} rank={rank} glossario={api.glossario} iconeClasse={<Svg d={ICONES.classe} tam={16} />} />
    </Painel>}

    {painel === "cena" && <Painel baixo titulo="BRECHAS DA CENA" fechar={() => setPainel(null)}>
      <div className="in-folha">
        <p className="in-intro">Do mais recente ao mais antigo. A mesma informação, obstáculo ou proteção concede só 1 Brecha; as restantes são perdidas ao final da cena.</p>
        <div>{registro.map((r, i) => { const l = linhaRegistro(r);
          return <div key={i} className="in-linha" data-tipo={r.tipo}>
            <span>
              <svg width="40" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" fill="#0b161c" stroke="currentColor" strokeWidth="2.4" /></svg>
              <Svg d={ICONES[r.id] ?? "M5 12h14"} tam={16} traco={2} />
            </span>
            <span><strong>{l.nome}</strong><span>{l.detalhe}</span></span>
            <small>{r.rodada ? `RODADA ${r.rodada}` : "INÍCIO DA CENA"}</small>
          </div>; })}</div>
        <div className="in-folha-fim">{topoPilha && <button type="button" className="in-link" disabled={locked} onClick={desfazer}>DESFAZER · {topoPilha.toUpperCase()}</button>}</div>
      </div>
    </Painel>}

    {painel === "reconhecer" && <Painel baixo titulo="RECONHECER O CAMINHO" fechar={() => setPainel(null)}>
      <div className="in-folha">
        <p className="in-intro">Ao usar Procurar Brecha depois de observar o ambiente, escolha até duas. O Narrador responde com o que você consegue perceber; não revela o que ainda não foi encontrado.</p>
        <span className="in-rotulo-sec">PERGUNTAS · <b>{nPerguntas} DE 2</b></span>
        {PERGUNTAS.map((q, i) => { const marcada = !!uso(`scene:pergunta:${i}`);
          return <button key={i} type="button" className="in-pergunta" aria-pressed={marcada} disabled={locked} onClick={() => enviar({ type: "marcarUso", chave: `scene:pergunta:${i}`, passo: marcada ? "Pergunta desmarcada" : "Pergunta marcada" })}>
            <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7" /></svg></span>
            <span>{q}</span>
          </button>; })}
      </div>
    </Painel>}
    </div>
    </div>
  </section>;
}
