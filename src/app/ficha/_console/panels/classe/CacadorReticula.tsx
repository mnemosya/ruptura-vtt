"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import type { ConsoleApi } from "../../types";
import { availableClassActions, classActionBlock, classResource, readClassPlay, reached, HUNTER_PREPS, type ClassCommand } from "../../../../../lib/character/classManagement";
import { companionActionCost, huntingModels, type HuntingModel } from "../../../../../lib/character/huntingCompanion";
import { CabecalhoModulo } from "../CabecalhoModulo";
import { oxanium } from "../../../../_design/oxanium";
import cacador from "../../../../../../content/v12/db_classe_cacador_v1_2.json";
import condicoes from "../../../../../../content/db_condicoes_normalizado_v1_5.json";
import { ListaHabilidades, Painel, Seletor, TextoRegra, type Caracteristica } from "./painelClasse";
import { useImagemCompanheiro } from "./ImagemCompanheiro";
import { EnvioImagem, HEXAGONO } from "../../EnvioImagem";
import "./ancoraRede.css";
import "./cacadorReticula.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "derivados" | "mesa">>;
type Livro = { nome: string; caracteristicas: Record<string, Caracteristica[]> };
type Estado = "pronto" | "agora" | "usado" | "indisponivel" | "travado";
type Pos = "esq" | "dir" | "base3" | "topo" | "base" | "te" | "td";
type No = { chave: string; forma: "circulo" | "losango" | "quadro"; estado: Estado; nome: string; status: string; icone: string; dica: string; clicar?: () => void; extra?: ReactNode; prioridade?: number; imagem?: string | null };

const classe = cacador.classes[0] as unknown as Livro & { caracteristicas: Record<string, Caracteristica[]> };
const subclasses = cacador.subclasses as unknown as (Livro & { slug: string })[];

/* Ícones de traço (24×24), os mesmos das telas do canvas. */
const ICONE = {
  mira: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 1v4M12 19v4M1 12h4M19 12h4",
  mao: "M7 11V6a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v6M15 10V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L3 13a2 2 0 0 1 3.4-2L7 12",
  olho: "M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5",
  raio: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
  mochila: "M5 8h14v12H5zM9 8V5h6v3M5 13h14M10 13v2h4v-2",
  plano: "M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5",
  seta: "M4 20 19 5M19 5h-7M19 5v7M4 14v6h6",
  escudo: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4",
  punhal: "M14.5 4H20v5.5L9 20.5 3.5 15zM7 13l4 4M3 21l3-3",
  rota: "M4 20c4 0 4-6 8-6s4-6 8-6M16 4h4v4",
  pata: "M12 13c-3 0-5 3-5 5 0 1.5 1.2 2.5 2.5 2.5 1 0 1.8-.6 2.5-.6s1.5.6 2.5.6c1.3 0 2.5-1 2.5-2.5 0-2-2-5-5-5zM5 9.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M15.4 9.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M8 5.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M12.4 5.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0",
  elo: "M4 12h6M14 12h6M8 8l-4 4 4 4M16 8l4 4-4 4",
  pasta: "M4 4h10l6 6v10H4zM14 4v6h6M8 14h8M8 17h5",
  perfil: "M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4 21c1-4 4-6 8-6s7 2 8 6",
  cadeado: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  mais: "M12 5v14M5 12h14",
};
const Icone = ({ d, tamanho = 24, traco = 1.8 }: { d: string; tamanho?: number; traco?: number }) => <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/* Preparos: o que dispara cada um (etiqueta) e se depende da Reserva. */
const PREPARO: Record<string, { nome: string; gatilho: string; reserva: boolean; icone: string; dica: string }> = {
  "AÇÃO CALCULADA": { nome: "Ação Calculada", gatilho: "TESTE PAGO COM RESERVA", reserva: true, icone: ICONE.mira, dica: "Antes de um teste de ação paga ao menos em parte com a Reserva, receba +1 de vantagem." },
  "EQUIPAMENTO SEPARADO": { nome: "Equipamento Separado", gatilho: "SACAR UM ITEM", reserva: false, icone: ICONE.mochila, dica: "Saque um item do Acesso Rápido ou da Mochila sem gastar PA. Usado com Interagir, a ação custa 1 PA a menos." },
  "PLANO ALTERNATIVO": { nome: "Plano Alternativo", gatilho: "FALHA PAGA COM RESERVA", reserva: true, icone: ICONE.plano, dica: "Falhou numa ação paga com a Reserva: 1 dos PA de Reserva gastos nela volta, para usar até o fim da rodada." },
  "REPOSICIONAMENTO PREVISTO": { nome: "Reposicionamento Previsto", gatilho: "APÓS AÇÃO COM RESERVA", reserva: true, icone: ICONE.seta, dica: "Depois de uma ação paga ao menos em parte com a Reserva, desloque-se até 3 m sem gastar PA." },
  "SAÍDA PLANEJADA": { nome: "Saída Planejada", gatilho: "DEFESA CONTRA DANO", reserva: false, icone: ICONE.escudo, dica: "Antes de evitar dano de área, armadilha ou efeito semelhante: na falha, metade do dano; no sucesso, nenhum." },
  "SINAL COMBINADO": { nome: "Sinal Combinado", gatilho: "AO GASTAR RESERVA", reserva: true, icone: ICONE.mao, dica: "Ao gastar a Reserva numa ação, um aliado a até 10 m se desloca 2 m ou recebe +1 de vantagem contra o mesmo alvo." },
};
const NOMES_PREPARO = Object.keys(PREPARO);
const idPreparo = (nome: string) => HUNTER_PREPS.find(p => p.nome === nome)!.id;
/** Regra completa do Preparo, cortada de "Preparado para Tudo". */
function regraPreparo(nome: string) {
  const texto = classe.caracteristicas.D?.find(c => c.nome === "Preparado para Tudo")?.descricao ?? "";
  const inicio = texto.indexOf(`${nome}:`);
  if (inicio < 0) return "";
  const corpo = inicio + nome.length + 1;
  const fim = NOMES_PREPARO.map(outro => texto.indexOf(`${outro}:`, corpo)).filter(i => i > 0).sort((a, b) => a - b)[0] ?? texto.length;
  return texto.slice(corpo, fim).trim();
}

/* Retorno de cada ação na faixa, com o Desfazer do motor. */
const RETORNO: Record<string, string> = {
  prep_acao: "AÇÃO CALCULADA · +1 DE VANTAGEM NESTE TESTE",
  prep_equipamento: "EQUIPAMENTO SEPARADO · ITEM SACADO SEM PA",
  prep_plano: "PLANO ALTERNATIVO · 1 PA VOLTOU À RESERVA",
  prep_reposicionamento: "REPOSICIONAMENTO PREVISTO · ATÉ 3 M SEM PA",
  prep_saida: "SAÍDA PLANEJADA · FALHA: METADE DO DANO · SUCESSO: NENHUM",
  prep_sinal: "SINAL COMBINADO · ALIADO: 2 M OU +1 CONTRA O ALVO",
  reacaoPlanejada: "REAÇÃO PLANEJADA · AJA AGORA PAGANDO COM A RESERVA",
  janela: "JANELA DE ABATE · ATAQUE À DISTÂNCIA POR 1 PA",
  preciso: "ATAQUE FURTIVO · DANO EXTRA NO ACERTO",
  evasao: "ROTA DE FUGA · ATÉ METADE DO ANDAR SEM PA",
  executar: "EXECUÇÃO DECLARADA · O ACERTO VIRA CRÍTICO",
  cacada: "CAÇADA COORDENADA · +1 NA PRIMEIRA AÇÃO DO OUTRO",
  conjunto: "ATAQUE CONJUNTO · O OUTRO ATACA COM A REAÇÃO",
  perfil: "PERFIL MONTADO · SE ELA REPETIR A AÇÃO, ESCOLHA O EFEITO",
  caso: "CASO ENCERRADO · +2 NA PRIMEIRA AÇÃO CONTRA O ALVO",
  dezFora: "PREPARO FORA DA LISTA USADO",
  dezRepete: "PREPARO REPETIDO NESTA CENA",
};

/* Dossiê do Perito: um registro só, com leitura das chaves antigas. */
type Dossie = { objeto: string; deducoes: { categoria: string; texto: string }[] };
const CATEGORIAS = ["Método", "Motivação", "Origem", "Destino", "Padrão", "Inconsistência"];
function lerDossie(selections: Record<string, string>): Dossie {
  try { const d = JSON.parse(selections.dossie ?? "null"); if (d && Array.isArray(d.deducoes)) return d; } catch { /* registro antigo */ }
  const deducoes = [0, 1, 2].map(i => selections[`dossier-deduction-${i}`] ?? "").filter(Boolean).map(texto => ({ categoria: "", texto }));
  return { objeto: selections.dossierTarget ?? "", deducoes };
}

/* Companheiro: famílias do livro e o desenho de cada uma. */
const ARTE: Record<string, { corpo: string; linhas: string; olho: string; focinho?: string }> = {
  canideo: { corpo: "m45 38 38 23 17-7 17 7 38-23-8 62 13 21-34 29-26 27-26-27-34-29 13-21Z", linhas: "m45 38 21 44 17-21m72-23-21 44-17-21M66 82l22 22-12 32m58-54-22 22 12 32m-36-32 12 38 12-38m-28 41 16 10 16-10", olho: "m67 99 17 6-8 3Zm66 0-17 6 8 3Z", focinho: "m88 139 12-4 12 4-12 10Z" },
  felino: { corpo: "m47 41 36 24h34l36-24-9 63 6 25-28 25-22 15-22-15-28-25 6-25Z", linhas: "m47 41 22 45 14-21m70-24-22 45-14-21M70 86l18 19-10 29m52-48-18 19 10 29m-22-29v32m-14 10 14-10 14 10M43 117l31 6m-34 9 34-2m83-13-31 6m34 9-34-2", olho: "m65 102 20 6-11 5Zm70 0-20 6 11 5Z" },
  ave: { corpo: "M88 103C67 93 48 77 39 61L12 47C17 66 30 77 49 83L20 77C29 92 44 97 60 98L30 99C42 111 56 113 71 109L47 119C60 125 74 121 83 116L89 123 69 142 87 142 91 153 100 165 109 153 113 142 131 142 111 123 117 116C126 121 140 125 153 119L129 109C144 113 158 111 170 99L140 98C156 97 171 92 180 77L151 83C170 77 183 66 188 47L162 61C157 77 139 92 118 102L118 92 114 78 108 67 100 63 88 66 81 72 80 82 85 77 91 78 85 90Z", linhas: "M39 61C49 80 67 96 88 103M162 61C152 80 135 96 117 102M49 83 77 103M60 98l22 11M151 83l-27 20M140 98l-22 11M91 78l11 4-6 15 4 24M108 67l-6 15 12-4M88 103l12 18 17-19M89 123l11-2 11 2M91 153l9-32 9 32M69 142l21-11M131 142l-21-11", olho: "m89 72 9-1-4 4Z" },
  serpente: { corpo: "M65 148c-35-13-23-39 10-40l49-1c33-1 42 26 10 40-22 10-66 7-65-8 1-15 37-8 46-20 18-24-39-25-35-49l8-21 19-6 24 16-14 20-23-1c-9 16 48 21 40 49", linhas: "m88 49 9 20 20 10m-37-9 17-1 34-10M63 119l8 10m65-10-10 10m-20 19v-10M117 79l9 11m0 0 7-2m-7 2 1 7", olho: "m106 56 13 3-10 5Z" },
};
const arteDe = (modelo: string) => ARTE[modelo === "constritor" || modelo === "peconhento" ? "serpente" : modelo] ?? ARTE.canideo;
const textoFamilia = (heading: string) => {
  const fonte = subclasses.find(s => s.slug === "domador")?.caracteristicas.E?.find(c => c.nome === "Companheiros de Caça")?.descricao ?? "";
  const i = fonte.indexOf(`${heading}\n\n`);
  if (i < 0) return { texto: "", exemplos: "" };
  const [, texto = "", exemplos = ""] = fonte.slice(i).split("\n\n");
  return { texto, exemplos: exemplos.startsWith("Exemplos") ? exemplos : "" };
};
const FAMILIAS = [
  { id: "canideos", nome: "Canídeos", papel: "Rastrear e perseguir", arte: "canideo", perfis: ["canideo"], heading: "CANÍDEOS" },
  { id: "felinos", nome: "Felinos", papel: "Emboscar e recuar", arte: "felino", perfis: ["felino"], heading: "FELINOS" },
  { id: "aves", nome: "Aves de rapina", papel: "Observar e assinalar", arte: "ave", perfis: ["ave"], heading: "AVES DE RAPINA" },
  { id: "serpentes", nome: "Serpentes", papel: "Conter ou envenenar", arte: "serpente", perfis: ["constritor", "peconhento"], heading: "SERPENTES" },
];
const HEADING_SERPENTE: Record<string, string> = { constritor: "CONSTRITORAS", peconhento: "PEÇONHENTAS" };
const OPCOES_CONDICAO = condicoes.condicoes.flatMap(v => "nivel_maximo" in v && typeof v.nivel_maximo === "number" ? Array.from({ length: v.nivel_maximo }, (_, i) => `${v.nome} ${i + 1}`) : [v.nome]);

function Bicho({ modelo, tamanho, colapso }: { modelo: string; tamanho: number; colapso?: boolean }) {
  const a = arteDe(modelo);
  return <svg className="cr-bicho" data-colapso={colapso} width={tamanho} height={tamanho} viewBox="0 0 200 200" strokeWidth="2" aria-hidden="true">
    <path d={a.corpo} /><path d={a.linhas} /><path className="cr-olho" d={a.olho} />{a.focinho && <path className="cr-focinho" d={a.focinho} />}
  </svg>;
}
function Retrato({ modelo, rotulo, colapso, imagem }: { modelo: string; rotulo?: string; colapso?: boolean; imagem?: string | null }) {
  return <div className="cr-retrato" data-colapso={colapso}>
    <svg viewBox="0 0 200 200" strokeWidth="1.2" aria-hidden="true"><circle cx="100" cy="100" r="81" /><path d="M100 5v20m0 150v20M5 100h20m150 0h20M42 42l14 14m88 88 14 14M42 158l14-14m88-88 14-14" /><path d="m100 26 64 37v74l-64 37-64-37V63Z" /></svg>
    {imagem ? <span className="cr-retrato-img" style={{ clipPath: HEXAGONO }}><img src={imagem} alt="" draggable={false} /></span> : <Bicho modelo={modelo} tamanho={rotulo ? 150 : 108} colapso={colapso} />}
    {rotulo && <small>{rotulo}</small>}
  </div>;
}

/**
 * Tela de classe do Caçador: a retícula. Segue o desenho aprovado no canvas
 * (B3, E1–E5, S1–S5, D1–D2). No centro, os PA guardados para a próxima
 * rodada; nos lados, os Preparos (1× por cena); em cima e embaixo, o que é
 * por rodada e o que a subclasse mantém (companheiro, Dossiê).
 */
export function CacadorReticula({ api, rank, subclassId }: { api: Api; rank: string; subclassId?: string }) {
  const [painel, setPainel] = useState<null | "preparos" | "habilidades" | "dossie" | "companheiro">(null);
  const [modoPreparo, setModoPreparo] = useState<"equipar" | "fora">("equipar");
  const [repetindo, setRepetindo] = useState(false);
  const [mirando, setMirando] = useState(false);
  const [modalImagem, setModalImagem] = useState(false);
  const imagem = useImagemCompanheiro(api.mesa, subclassId === "domador");

  const state = readClassPlay(api.character);
  const resource = classResource(api.character);
  const send = api.classe?.executar;
  const locked = !!api.somenteLeitura || !send;
  const paMax = api.derivados?.pa_max ?? 0;
  const paGastos = api.character.estado_jogo?.pa_gastos ?? 0;
  const paLivres = Math.max(0, paMax - paGastos);
  const sub = subclasses.find(item => item.slug === subclassId);
  const acoes = availableClassActions(api.character).filter(action => reached(rank, action.rank));
  const acao = (id: string) => acoes.find(action => action.id === id);
  const usos = (id: string, cadencia = "scene") => state.uses[`${cadencia}:${id}`] ?? 0;
  const bloqueio = (id: string) => { const a = acao(id); return a ? classActionBlock(api.character, a, paMax) : "Indisponível"; };
  const usar = (id: string) => { if (!locked && acao(id)) send?.({ type: "use", id }); };

  // Último comando que ainda dá para desfazer (o motor guarda o estado anterior e os PA de antes e depois).
  const recente = !!state.undo && state.undo.paAfter === paGastos;
  const ultimaId = recente ? (state.last === "Reserva gasta" ? "reserva" : state.last === "Comando" ? "comando" : acoes.find(action => state.last?.startsWith(action.name))?.id) : undefined;
  const pagouReserva = ultimaId === "reserva";
  const preparoNaAcao = ultimaId?.startsWith("prep_");
  useEffect(() => { if (!recente) setRepetindo(false); }, [recente]);

  const cap = resource.max;
  const pendente = Math.max(0, Math.min(cap, Number(state.selections.reservaPendente ?? 0)));
  const cheia = pendente >= cap;
  const S = reached(rank, "S");
  const maxPreparos = S ? 3 : 2;
  const equipados = (state.selections.preparos ?? "").split("|").filter(nome => PREPARO[nome]).slice(0, maxPreparos);
  const bonus = S && state.selections.dezPassosRodada === String(state.round) && state.resource > 0;
  const companheiro = state.companion;
  const modelos = huntingModels(rank);
  const modelo = companheiro ? modelos.find(m => m.id === companheiro.model) : undefined;
  const dossie = lerDossie(state.selections);
  const deducoes = dossie.deducoes.filter(d => d.categoria || d.texto.trim()).length;
  const mira = Number(state.selections.mira ?? 0);
  const repeteLivre = S && !usos("dezRepete");
  const foraLivre = S && !usos("dezFora");

  /* ── Nós da retícula ── */
  const preparoNo = (nome: string, indice: number): No => {
    const info = PREPARO[nome], id = idPreparo(nome), usado = usos(id) > 0;
    const repetivel = usado && repetindo && repeteLivre && usos(id) < 2;
    const agora = !usado && pagouReserva && info.reserva;
    const estado: Estado = repetivel ? "agora" : usado ? "usado" : preparoNaAcao ? "indisponivel" : agora ? "agora" : "pronto";
    const status = repetivel ? "USE DE NOVO" : usado ? (usos(id) > 1 ? "USADO 2× NA CENA" : "USADO NA CENA") : preparoNaAcao ? "UM PREPARO POR AÇÃO" : agora ? (id === "prep_acao" ? "USE AGORA · +1" : "USE AGORA") : "PRONTO";
    const clicar = repetivel ? () => { send?.({ type: "use", id: "dezRepete" }); send?.({ type: "use", id }); setRepetindo(false); } : estado === "pronto" || estado === "agora" ? () => usar(id) : undefined;
    return { chave: `p${indice}`, forma: "circulo", estado, nome: info.nome, status, icone: info.icone, dica: info.dica, clicar };
  };
  const preparos: No[] = !reached(rank, "D")
    ? [0, 1].map(i => ({ chave: `p${i}`, forma: "circulo", estado: "travado", nome: "Preparo", status: "RANKING D", icone: ICONE.cadeado, dica: "Preparado para Tudo chega no Ranking D: 2 Preparos escolhidos ao concluir um descanso longo, cada um 1× por cena." }))
    : Array.from({ length: maxPreparos }, (_, i) => equipados[i] ? preparoNo(equipados[i], i) : { chave: `p${i}`, forma: "circulo" as const, estado: "indisponivel" as const, nome: "Espaço livre", status: "ESCOLHER PREPARO", icone: ICONE.mais, dica: "Escolha seus Preparos ao concluir um descanso longo.", clicar: () => { setModoPreparo("equipar"); setPainel("preparos"); } });

  const losango = (id: string, nome: string, icone: string, dica: string, prontoTexto: string, cadencia = "round"): No => {
    const a = acao(id), usado = usos(id, cadencia) > 0, bloq = a ? classActionBlock(api.character, a, paMax) : null;
    if (!a) return { chave: id, forma: "losango", estado: "travado", nome, status: `RANKING ${availableClassActions(api.character).find(x => x.id === id)?.rank ?? ""}`.trim(), icone, dica };
    const estado: Estado = usado ? "usado" : bloq ? "indisponivel" : "pronto";
    const status = usado ? (cadencia === "round" ? "USADA NA RODADA" : "USADA NA CENA") : bloq ? (bloq.startsWith("Requer") ? "SEM RESERVA" : bloq.toUpperCase()) : prontoTexto;
    return { chave: id, forma: "losango", estado, nome, status, icone, dica, clicar: estado === "pronto" ? () => usar(id) : undefined };
  };
  const reacao: No | null = reached(rank, "B")
    ? { ...losango("reacaoPlanejada", "Reação Planejada", ICONE.raio, "Depois que outra criatura terminar uma ação, use sua Reação para agir na hora, pagando tudo com a Reserva.", "DISPONÍVEL"), prioridade: 1 }
    : rank === "F" || !reached(rank, "C") ? { chave: "reacaoPlanejada", forma: "losango", estado: "travado", nome: "Reação Planejada", status: "RANKING B", icone: ICONE.raio, dica: "No Ranking B a Reserva passa a comportar 2 PA, e você pode agir depois da ação de outra criatura pagando tudo com a Reserva.", prioridade: 1 } : null;

  let quadro: No | null = null;
  const losangos: No[] = [];
  if (!sub || !reached(rank, "E")) losangos.push({ chave: "sub", forma: "losango", estado: "travado", nome: "Subclasse", status: "RANKING E", icone: ICONE.cadeado, dica: "No Ranking E você escolhe Assassino, Atirador de Elite, Domador ou Perito." });
  else if (subclassId === "atirador_de_elite") {
    if (reached(rank, "C")) {
      const janela = losango("janela", "Janela de Abate", ICONE.olho, "Um alvo na mira que se desloca, ataca outro ou fica sem cobertura abre a janela: Reação e 1 PA da Reserva para atacar por 1 PA. Errou, o alvo continua na mira.", `VIGIANDO · +${mira}`);
      losangos.push(!mira && janela.estado !== "usado" ? { ...janela, estado: "indisponivel", status: "SEM ALVO NA MIRA", clicar: undefined } : janela);
    } else quadro = { chave: "mira", forma: "quadro", estado: mira ? "pronto" : "indisponivel", nome: "Alvo na Mira", status: mira ? `+${mira} NO PRÓXIMO ATAQUE` : "SEM ALVO", icone: ICONE.mira, dica: "O benefício de Mirar fica até você atacar, mirar outra criatura, perder o alvo de vista, se deslocar mais de 2 m ou a cena acabar.", clicar: () => setMirando(m => !m) };
  } else if (subclassId === "assassino") {
    const dano = reached(rank, "A") ? "3d4" : reached(rank, "C") ? "2d4" : "1d4";
    losangos.push(losango("preciso", "Ataque Furtivo", ICONE.punhal, `Contra quem não percebeu você: +2 de vantagem no total. Uma vez por rodada, o acerto causa +${dano} de dano do mesmo tipo do ataque.`, `PRONTO · +${dano}`));
    losangos.push({ ...losango("evasao", "Rota de Fuga", ICONE.rota, "Depois de um sucesso padrão ou crítico contra quem não percebeu você, está Isolado ou Sangrando por você: mova até metade do Andar sem PA. Uma vez por rodada, terminando onde dá para se esconder, Esconder-se sem PA.", "PRONTA"), prioridade: 2 });
  } else if (subclassId === "domador") {
    quadro = companheiro && modelo
      ? { chave: "companheiro", forma: "quadro", estado: companheiro.hp === 0 ? "indisponivel" : companheiro.commanded ? "agora" : "pronto", nome: companheiro.name, status: companheiro.hp === 0 ? "EM COLAPSO" : companheiro.commanded ? `COMANDADO · ${companheiro.pa} PA` : `SEM COMANDO · ${companheiro.pa} PA`, icone: ICONE.pata, dica: "Age logo depois de você. Comandado, recebe 2 PA no turno dele. Sem comando, 1 PA para vir até você, se abrigar ou seguir o Instinto.", clicar: () => setPainel("companheiro"), imagem: imagem.url, extra: <span className="cr-pv" style={{ "--cr-pv": `${Math.round(companheiro.hp / modelo.hp * 100)}%` } as React.CSSProperties}><i /><b>{companheiro.hp}/{modelo.hp} PV</b></span> }
      : { chave: "companheiro", forma: "quadro", estado: "indisponivel", nome: "Companheiro", status: "ESCOLHER", icone: ICONE.pata, dica: "Escolha a ficha do seu companheiro de caça e estabeleça o vínculo.", clicar: () => setPainel("companheiro") };
    if (reached(rank, "C")) losangos.push(losango("cacada", "Caçada Coordenada", ICONE.elo, "Uma vez por rodada, quando você ou o companheiro tiver sucesso padrão ou crítico contra uma criatura, o outro recebe +1 de vantagem na primeira ação contra ela até o fim da rodada.", "PRONTA"));
  } else if (subclassId === "perito") {
    const status = ["SEM DEDUÇÕES", "1 DEDUÇÃO · +1 EM INFORMAÇÃO", "2 DEDUÇÕES · SEM SURPRESA", "3 DEDUÇÕES · +1 PA NA CENA"][Math.min(3, deducoes)];
    quadro = { chave: "dossie", forma: "quadro", estado: deducoes ? "pronto" : "indisponivel", nome: "Dossiê", status, icone: ICONE.pasta, dica: "1 Dedução: +1 para obter, analisar, localizar ou rastrear informação do objeto. 2: você não pode ser surpreendido pelo que elas indicam. 3: 1 PA de Reserva ao começar uma cena ligada ao objeto.", clicar: () => setPainel("dossie"), extra: <span className="cr-pips">{[0, 1, 2].map(i => <i key={i} data-cheia={i < deducoes} />)}</span> };
    if (reached(rank, "C")) losangos.push(losango("perfil", "Montar o Perfil", ICONE.perfil, "Depois que uma criatura terminar uma ação: 1 PA da Reserva. Se ela repetir a ação até o fim do seu próximo turno, imponha −1 a ela, dê +1 à defesa contra ela ou mova um aliado 2 m.", "PRONTO · 1 PA DA RESERVA"));
  }
  if (reacao) losangos.push(reacao);

  // Posições: Preparos nos lados (o 3º embaixo); o persistente em cima; o resto embaixo e nas diagonais de cima.
  const posicoes: { no: No; pos: Pos }[] = preparos.map((no, i) => ({ no, pos: (["esq", "dir", "base3"] as const)[i] }));
  const fila = [...losangos];
  const tresPreparos = preparos.length > 2;
  const topo = quadro ?? (!tresPreparos || fila.length > 2 ? fila.shift() : undefined);
  if (topo) posicoes.push({ no: topo, pos: "topo" });
  if (!tresPreparos && fila.length) posicoes.push({ no: fila.shift()!, pos: "base" });
  fila.sort((a, b) => (b.prioridade ?? 0) - (a.prioridade ?? 0)).forEach((no, i) => posicoes.push({ no, pos: i === 0 ? "te" : "td" }));
  const COORD: Record<Pos, { x: string; y: number; lado?: "esq" | "dir" }> = {
    esq: { x: "0px", y: 244 }, dir: { x: "0px", y: 244 }, base3: { x: "0px", y: 464 },
    topo: { x: "0px", y: 32, lado: "dir" }, base: { x: "0px", y: 452, lado: "dir" }, te: { x: "-137px", y: 48, lado: "esq" }, td: { x: "137px", y: 48, lado: "dir" },
  };
  // Com algo no topo, as diagonais abrem para fora do rótulo dele.
  if (topo && posicoes.some(p => p.pos === "te" || p.pos === "td")) { COORD.te = { x: "-210px", y: 72, lado: "esq" }; COORD.td = { x: "210px", y: 72, lado: "dir" }; }
  const alturaPalco = posicoes.some(p => p.pos === "base3") ? 588 : posicoes.some(p => p.pos === "base") ? 496 : 432;

  /* Retícula: marcações, um arco por PA guardado; cheia, o círculo fecha. */
  const reticula = useMemo(() => {
    const pt = (ang: number, r: number) => { const t = ang * Math.PI / 180; return [(180 + r * Math.cos(t)).toFixed(1), (180 + r * Math.sin(t)).toFixed(1)]; };
    let menores = "", maiores = "";
    for (let g = 0; g < 360; g += 6) {
      const maior = g % 30 === 0, [x1, y1] = pt(g, maior ? 160 : 162), [x2, y2] = pt(g, maior ? 172 : 167);
      if (maior) maiores += `M${x1} ${y1}L${x2} ${y2}`; else menores += `M${x1} ${y1}L${x2} ${y2}`;
    }
    const arcos = Array.from({ length: cap }, (_, i) => {
      const centro = -90 + i * 360 / cap, meio = 360 / cap / 2 - 22;
      const [x1, y1] = pt(centro - meio, 150), [x2, y2] = pt(centro + meio, 150);
      return `M${x1} ${y1}A150 150 0 ${meio * 2 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
    });
    return { menores, maiores, arcos };
  }, [cap]);

  /* Faixa de retorno + extras da subclasse. */
  const faixa = ultimaId === "reserva" ? (equipados.some(n => PREPARO[n].reserva && !usos(idPreparo(n))) ? "RESERVA GASTA NESTA AÇÃO · ESCOLHA UM PREPARO" : "1 PA DA RESERVA GASTO NESTA AÇÃO")
    : ultimaId === "comando" && companheiro ? `${companheiro.name.toUpperCase()} COMANDADO · AGE DEPOIS DE VOCÊ COM 2 PA`
    : ultimaId ? RETORNO[ultimaId] : undefined;
  const extras: ReactNode[] = [];
  if (subclassId === "atirador_de_elite" && reached(rank, "E")) {
    if (mira) {
      if (reached(rank, "C")) extras.push(<button key="janela" type="button" className="cr-extra" data-cheio="true" disabled={locked || !!bloqueio("janela") || usos("janela", "round") > 0} onClick={() => usar("janela")}>ATIRAR PELA JANELA <small>REAÇÃO · 1 PA DA RESERVA</small></button>);
      extras.push(<button key="soltar" type="button" className="cr-extra" disabled={locked} onClick={() => send?.({ type: "select", key: "mira", value: "" })}>SOLTAR A MIRA <small>+{mira}</small></button>);
    } else if (mirando || !reached(rank, "C")) {
      ([[1, "FALHA"], [2, "SUCESSO"], [3, "CRÍTICO"]] as const).forEach(([valor, rotulo]) => extras.push(<button key={valor} type="button" className="cr-extra" disabled={locked} onClick={() => { send?.({ type: "select", key: "mira", value: String(valor) }); setMirando(false); }}>{rotulo} <small>+{valor} NA MIRA</small></button>));
    } else extras.push(<button key="mirar" type="button" className="cr-extra" disabled={locked} onClick={() => setMirando(true)}>REGISTRAR MIRA <small>RESULTADO DO TESTE</small></button>);
  }
  if (subclassId === "assassino" && acao("executar")) extras.push(<button key="executar" type="button" className="cr-extra" disabled={locked || usos("executar") > 0} onClick={() => usar("executar")}>{usos("executar") ? "EXECUÇÃO USADA" : "EXECUTAR"} <small>1× CENA</small></button>);
  if (subclassId === "domador" && companheiro) {
    if (companheiro.commanded) extras.push(<button key="comandado" type="button" className="cr-extra" disabled>COMANDADO NESTA RODADA</button>);
    else {
      extras.push(<button key="comandar" type="button" className="cr-extra" disabled={locked || companheiro.hp === 0} onClick={() => send?.({ type: "companion", operation: "command", reserve: false })}>COMANDAR {companheiro.name.toUpperCase()} <small>1 PA</small></button>);
      if (state.resource > 0) extras.push(<button key="comandarR" type="button" className="cr-extra" disabled={locked || companheiro.hp === 0} onClick={() => send?.({ type: "companion", operation: "command", reserve: true })}>COMANDAR <small>1 PA DA RESERVA</small></button>);
    }
    if (acao("conjunto")) extras.push(<button key="conjunto" type="button" className="cr-extra" disabled={locked || usos("conjunto") > 0} onClick={() => usar("conjunto")}>ATAQUE CONJUNTO <small>1× CENA</small></button>);
  }
  if (subclassId === "perito" && acao("caso")) extras.push(<button key="caso" type="button" className="cr-extra" disabled={locked || deducoes < 3 || usos("caso") > 0} title={deducoes < 3 ? "Exige 3 Deduções" : undefined} onClick={() => usar("caso")}>CASO ENCERRADO <small>{deducoes < 3 ? "EXIGE 3 DEDUÇÕES" : "1× CENA"}</small></button>);
  if (S && reached(rank, "D")) {
    extras.push(<button key="fora" type="button" className="cr-extra" disabled={locked || !foraLivre} onClick={() => { setModoPreparo("fora"); setPainel("preparos"); }}>PREPARO FORA DA LISTA <small>1× CENA</small></button>);
    extras.push(<button key="repete" type="button" className="cr-extra" aria-pressed={repetindo} data-cheio={repetindo} disabled={locked || !repeteLivre || !equipados.some(n => usos(idPreparo(n)) === 1)} onClick={() => setRepetindo(r => !r)}>{repetindo ? "CLIQUE NO PREPARO" : "REPETIR UM PREPARO"} <small>1× CENA</small></button>);
  }

  const meuRotulo = sub && reached(rank, "E") ? `${sub.nome.toUpperCase()} · ${rank}` : `RANKING ${rank}`;
  const fecharPainel = () => { setPainel(null); setModoPreparo("equipar"); };

  return <section className={`rc-eq-outer ar-raiz cr-raiz ${oxanium.variable} ${plex.variable}`} aria-label="Classe Caçador">
    <div className="rc-eq-card-outer rc-inv-moldura">
    <CabecalhoModulo id="ID://CLASSE" mod="MOD.CLASS // 10" />
    <div className="ar-tela">
    <div className="ar-rolagem">
    <header className="ar-cab">
      <h2>CAÇADOR</h2>
      <span>{meuRotulo}</span>
      <span className="cr-legenda" aria-hidden="true"><span><i data-forma="circulo" />POR CENA</span><span><i data-forma="losango" />POR RODADA</span></span>
    </header>

    <div className="cr-palco" style={{ height: alturaPalco }}>
      <svg className="cr-mira" data-cheia={cheia} viewBox="0 0 360 360" fill="none" aria-hidden="true">
        <path d={reticula.menores} stroke="#1f3a4b" strokeWidth="1.5" />
        <path d={reticula.maiores} stroke="#3a5566" strokeWidth="2" />
        <circle cx="180" cy="180" r="150" stroke="#13283a" strokeWidth="10" />
        {cheia ? <><circle cx="180" cy="180" r="150" stroke="var(--cr-brilho)" strokeWidth="22" /><circle className="cr-arco" cx="180" cy="180" r="150" stroke="var(--cr)" strokeWidth="10" /></>
          : reticula.arcos.map((d, i) => <path key={i} className="cr-arco" d={d} stroke={i < pendente ? "var(--cr)" : "#1d3242"} strokeWidth="10" />)}
        {bonus && <circle cx="180" cy="180" r="134" stroke="var(--cr)" strokeWidth="3" strokeDasharray="5 7" />}
        <circle cx="180" cy="180" r="122" stroke="#15293a" strokeWidth="1" />
        <path d="M180 58v16M180 286v16M58 180h16M286 180h16" stroke="var(--cr)" strokeWidth="2" />
      </svg>
      <span className="cr-guia" data-lado="esq" aria-hidden="true" />
      <span className="cr-guia" data-lado="dir" aria-hidden="true" />
      <div className="cr-centro">
        <small>RESERVA TÁTICA</small>
        <strong role="img" aria-label={`${pendente} de ${cap} PA guardados para a próxima rodada`}>{pendente}<span> / {cap}</span></strong>
        <span>{cheia ? "reserva cheia para a próxima rodada" : "guardado para a próxima rodada"}</span>
        {bonus && <button type="button" className="cr-bonus">+1 PA · ATÉ O FIM DA 1ª RODADA<span className="cr-dica" role="tooltip">Dez Passos à Frente: no início de cada cena você recebe 1 PA de Reserva Tática. Ele se perde no fim da primeira rodada se não for usado.</span></button>}
      </div>

      {posicoes.map(({ no, pos }) => {
        const c = COORD[pos];
        const travado = locked || !no.clicar;
        // Nos lados, o deslocamento vem do CSS (encolhe com o console); nos demais, da posição fixa.
        const estilo = { ...(pos === "esq" || pos === "dir" ? {} : { "--cr-x": c.x }), "--cr-y": `${c.y}px` } as React.CSSProperties;
        const formaPath = no.imagem ? <img className="cr-no-img" src={no.imagem} alt="" draggable={false} /> : no.forma === "losango" ? <span><Icone d={no.icone} tamanho={18} traco={2} /></span> : <Icone d={no.icone} tamanho={no.forma === "circulo" ? 30 : 26} />;
        return <button key={no.chave} type="button" className="cr-no" data-forma={no.forma} data-estado={no.estado} data-pos={pos === "esq" || pos === "dir" ? pos : undefined} data-lado={c.lado}
          style={estilo} aria-disabled={travado} aria-label={`${no.nome}: ${no.status}`} onClick={travado ? undefined : no.clicar}>
          <span className="cr-forma">{formaPath}</span>
          <span className="cr-no-texto">
            <span className="cr-no-nome">{no.nome}</span>
            {no.extra}
            <span className="cr-no-estado">{no.status}</span>
          </span>
          <span className="cr-dica" role="tooltip">{no.dica}</span>
        </button>;
      })}
    </div>

    <div className="cr-acoes">
      {faixa && <span key={`${ultimaId}-${state.last}`} className="cr-faixa"><i /><span>{faixa}</span><button type="button" className="ar-link" disabled={locked} onClick={() => send?.({ type: "undo" })}>DESFAZER</button></span>}
      <span className="cr-info">
        <span>{paLivres} PA LIVRES</span><span>·</span>
        {state.resource > 0 ? <><b>{state.resource} NA RESERVA</b>{!pagouReserva && <button type="button" className="ar-link" disabled={locked} onClick={() => send?.({ type: "spend" })}>USAR NESTA AÇÃO</button>}</> : <b>RESERVA VAZIA</b>}
      </span>
      {extras.length > 0 && <div className="cr-extras">{extras}</div>}
      <div className="cr-passo">
        <button type="button" aria-label="Guardar menos 1 PA" disabled={locked || pendente <= 0} onClick={() => send?.({ type: "reserveSet", value: pendente - 1 })}>−</button>
        <span>GUARDAR {pendente} DE {cap} PA</span>
        <button type="button" aria-label="Guardar mais 1 PA" disabled={locked || cheia} onClick={() => send?.({ type: "reserveSet", value: pendente + 1 })}>+</button>
      </div>
    </div>
    </div>

    <footer className="ar-rodape">
      {reached(rank, "D") ? <button type="button" onClick={() => { setModoPreparo("equipar"); setPainel("preparos"); }}>TROCAR PREPAROS</button> : <span>RANKING {rank}</span>}
      <button type="button" onClick={() => setPainel("habilidades")}>HABILIDADES ›</button>
    </footer>

    {painel === "habilidades" && <Painel titulo="HABILIDADES" fechar={fecharPainel}>
      <ListaHabilidades classe={classe} sub={sub} rank={rank} iconeClasse={<Icone d={ICONE.mira} tamanho={16} />}
        nota={nome => nome === "Reação Planejada" ? { texto: usos("reacaoPlanejada", "round") ? "Usada nesta rodada" : "Pronta", tom: "laranja" } : null} />
    </Painel>}
    {painel === "preparos" && <Painel titulo={modoPreparo === "fora" ? "PREPARO FORA DA LISTA" : "TROCAR PREPAROS"} fechar={fecharPainel}>{sair =>
      <TrocarPreparos max={maxPreparos} equipados={equipados} usos={nome => usos(idPreparo(nome))} fora={modoPreparo === "fora"} locked={locked}
        salvar={lista => send?.({ type: "select", key: "preparos", value: lista.join("|") })}
        usarFora={nome => { send?.({ type: "use", id: "dezFora" }); send?.({ type: "use", id: idPreparo(nome) }); sair(); }} sair={sair} />}
    </Painel>}
    {painel === "dossie" && <Painel titulo="DOSSIÊ" intro="Cada Dedução é uma conclusão sustentada pelas Evidências. Uma mesma fonte gera só 1 Dedução." fechar={fecharPainel}>{sair =>
      <PainelDossie dossie={dossie} locked={locked} salvar={d => send?.({ type: "select", key: "dossie", value: JSON.stringify(d) })} sair={sair} />}
    </Painel>}
    {painel === "companheiro" && <Painel titulo={companheiro ? "COMPANHEIRO" : "COMPANHEIRO DE CAÇA"} intro={companheiro ? undefined : "A ficha define o treinamento, não a espécie. Espécie, aparência e origem você combina com o Narrador."} fechar={fecharPainel}>
      {companheiro && modelo ? <FichaCompanheiro companheiro={companheiro} modelo={modelo} rank={rank} locked={locked} send={cmd => send?.(cmd)} recente={recente} ultima={state.last} reserva={state.resource}
          imagem={imagem.url} abrirImagem={() => setModalImagem(true)} aoEncerrar={() => { if (imagem.url) void imagem.remover(); }} />
        : <EscolherCompanheiro modelos={modelos} rank={rank} locked={locked} criar={(model, name) => send?.({ type: "companion", operation: "create", model, name })} />}
    </Painel>}
    {modalImagem && companheiro && <EnvioImagem titulo="IMAGEM DO COMPANHEIRO" contexto={`COMPANHEIRO · ${companheiro.name.toUpperCase()}`} canal="UPLOAD://RETRATO" forma="hexagono" cor="#ff6a3d" centralizarNoConsole
      atual={imagem.url} erro={imagem.erro} enviando={imagem.enviando} aviso={imagem.naMesa ? null : "Esta ficha não está numa mesa: a imagem vale só nesta sessão."}
      onUsar={(arquivo, recorte) => recorte ? imagem.enviar(arquivo, recorte) : false} onRemover={imagem.remover} fechar={() => { imagem.limparErro(); setModalImagem(false); }} />}
    </div>
    </div>
  </section>;
}

/* ── Trocar Preparos: encaixes em cima, arsenal embaixo, regra do que está em foco. ── */
function TrocarPreparos({ max, equipados, usos, fora, locked, salvar, usarFora, sair }: { max: number; equipados: string[]; usos: (nome: string) => number; fora: boolean; locked: boolean; salvar: (lista: string[]) => void; usarFora: (nome: string) => void; sair: () => void }) {
  const [foco, setFoco] = useState(equipados[0] ?? NOMES_PREPARO[0]);
  const cheio = equipados.length >= max;
  const estado = (nome: string) => usos(nome) ? { texto: "USADO NA CENA", cor: "#6f8799" } : { texto: "PRONTO", cor: "var(--cr)" };
  const info = PREPARO[foco];
  const equipadoFoco = equipados.includes(foco);
  const rotuloFoco = fora ? (equipadoFoco ? "JÁ EQUIPADO" : "CLIQUE PARA USAR AGORA") : equipadoFoco ? estado(foco).texto : cheio ? "LIBERE UM ESPAÇO PARA EQUIPAR" : "CLIQUE PARA EQUIPAR";
  return <div className="cr-folha"><div className="cr-rola">
    <div className="cr-prep-topo"><span>{fora ? "USE UM PREPARO QUE NÃO ESTÁ EQUIPADO" : <>EQUIPADOS · <b>{equipados.length} DE {max}</b></>}</span><small>DESCANSO LONGO · 1× POR CENA · UM POR AÇÃO</small></div>
    {!fora && <div className="cr-encaixes" style={{ "--cr-encaixes": max } as React.CSSProperties}>{Array.from({ length: max }, (_, i) => {
      const nome = equipados[i];
      if (!nome) return <div key={i} className="cr-encaixe-vazio"><b>+</b>ESPAÇO LIVRE · ESCOLHA ABAIXO</div>;
      const p = PREPARO[nome], e = estado(nome);
      return <button key={i} type="button" className="cr-encaixe" disabled={locked} aria-label={`Tirar ${p.nome}`} onMouseEnter={() => setFoco(nome)} onFocus={() => setFoco(nome)} onClick={() => salvar(equipados.filter(n => n !== nome))}>
        <small>0{i + 1}</small>
        <span className="cr-encaixe-icone"><Icone d={p.icone} tamanho={28} traco={1.9} /></span>
        <span className="cr-encaixe-texto"><strong>{p.nome}</strong><span className="cr-chip" data-reserva={p.reserva}>{p.gatilho}</span></span>
        <span className="cr-encaixe-estado"><span style={{ color: e.cor }}>{e.texto}</span><em>TIRAR ×</em></span>
      </button>;
    })}</div>}
    <div className="cr-arsenal-rotulo">ARSENAL</div>
    <div className="cr-arsenal">{NOMES_PREPARO.map(nome => {
      const p = PREPARO[nome], equipado = equipados.includes(nome);
      const travada = fora ? equipado : !equipado && cheio;
      return <button key={nome} type="button" className="cr-carta" aria-pressed={!fora && equipado} aria-disabled={locked || travada} data-foco={foco === nome}
        onMouseEnter={() => setFoco(nome)} onFocus={() => setFoco(nome)}
        onClick={() => { setFoco(nome); if (locked || travada) return; if (fora) usarFora(nome); else salvar(equipado ? equipados.filter(n => n !== nome) : [...equipados, nome]); }}>
        <span className="cr-carta-icone"><Icone d={p.icone} tamanho={22} traco={1.9} /></span>
        <span className="cr-carta-texto"><strong>{p.nome}</strong><span className="cr-chip" data-reserva={p.reserva}>{p.gatilho}</span></span>
        {!fora && equipado && <em><Icone d="m5 12 5 5 9-10" tamanho={11} traco={3.2} /></em>}
      </button>;
    })}</div>
    <div className="cr-detalhe">
      <header><Icone d={info.icone} tamanho={20} traco={1.9} /><strong>{info.nome}</strong><span>{rotuloFoco}</span></header>
      <TextoRegra texto={regraPreparo(foco)} />
    </div>
    </div>
    {!fora && <div className="cr-fim"><span>{cheio ? "PRONTO PARA A PRÓXIMA CENA" : `FALTA ESCOLHER ${max - equipados.length}`}</span><button type="button" className="cr-primario" onClick={sair}>CONFIRMAR</button></div>}
  </div>;
}

/* ── Dossiê do Perito: objeto, até 3 Deduções com categoria, e o que cada degrau dá. ── */
function PainelDossie({ dossie, locked, salvar, sair }: { dossie: Dossie; locked: boolean; salvar: (d: Dossie) => void; sair: () => void }) {
  const [objeto, setObjeto] = useState(dossie.objeto);
  const [textos, setTextos] = useState(dossie.deducoes.map(d => d.texto));
  const [vagas, setVagas] = useState(Math.max(1, dossie.deducoes.length));
  const [confirmarNovo, setConfirmarNovo] = useState(false);
  const deducoes = Array.from({ length: Math.min(3, vagas) }, (_, i) => ({ categoria: dossie.deducoes[i]?.categoria ?? "", texto: textos[i] ?? dossie.deducoes[i]?.texto ?? "" }));
  const gravar = (mudar: Partial<Dossie>) => salvar({ objeto, deducoes, ...mudar });
  const total = deducoes.filter(d => d.categoria || d.texto.trim()).length;
  const DEGRAUS = ["+1 em testes para obter, analisar, localizar ou rastrear informação do objeto.", "Ninguém surpreende você com o que suas Deduções já indicam. Aliados orientados também.", "Cena ligada ao objeto começa com 1 PA de Reserva. Uma vez por cena."];
  return <div className="cr-folha"><div className="cr-rola">
    <div className="cr-dossie">
      <div className="cr-dossie-col">
        <label className="cr-campo">OBJETO DO DOSSIÊ<input type="text" disabled={locked} placeholder="Criatura, grupo, local, acontecimento ou fenômeno" value={objeto} onChange={e => setObjeto(e.target.value)} onBlur={() => objeto !== dossie.objeto && gravar({ objeto })} /></label>
        {deducoes.map((d, i) => <div key={i} className="cr-deducao">
          <small>DEDUÇÃO 0{i + 1}</small>
          <div className="cr-pilulas" role="radiogroup" aria-label={`Categoria da dedução ${i + 1}`}>{CATEGORIAS.map(cat => <button key={cat} type="button" role="radio" aria-checked={d.categoria === cat} disabled={locked} onClick={() => gravar({ deducoes: deducoes.map((x, j) => j === i ? { ...x, categoria: x.categoria === cat ? "" : cat } : x) })}>{cat}</button>)}</div>
          <textarea rows={2} aria-label={`Conclusão da dedução ${i + 1}`} disabled={locked} placeholder="Conclusão sustentada pelas Evidências" value={d.texto} onChange={e => setTextos(t => { const n = [...t]; n[i] = e.target.value; return n; })} onBlur={() => d.texto !== (dossie.deducoes[i]?.texto ?? "") && gravar({})} />
        </div>)}
        {vagas < 3 && <button type="button" className="cr-novo" disabled={locked} onClick={() => setVagas(v => v + 1)}><b>+</b>REGISTRAR DEDUÇÃO 0{vagas + 1}</button>}
      </div>
      <div className="cr-degraus"><small>O QUE O DOSSIÊ DÁ</small>{DEGRAUS.map((texto, i) => <div key={i} className="cr-degrau" data-ativo={total > i}><b>{i + 1}</b><span>{texto}</span></div>)}</div>
    </div>
    </div>
    <div className="cr-fim">
      <button type="button" className="cr-perigo" disabled={locked} onClick={() => { if (!confirmarNovo) { setConfirmarNovo(true); return; } salvar({ objeto: "", deducoes: [] }); setObjeto(""); setTextos([]); setVagas(1); setConfirmarNovo(false); }}>{confirmarNovo ? "CONFIRMAR · APAGA AS DEDUÇÕES" : "ABRIR NOVO DOSSIÊ · APAGA AS DEDUÇÕES"}</button>
      <span>{total} DE 3 DEDUÇÕES</span>
      <button type="button" className="cr-primario" onClick={() => { if (objeto !== dossie.objeto || deducoes.some((d, i) => d.texto !== (dossie.deducoes[i]?.texto ?? ""))) gravar({}); sair(); }}>SALVAR</button>
    </div>
  </div>;
}

/* ── Companheiro: escolher a ficha e criar o vínculo. ── */
function EscolherCompanheiro({ modelos, rank, locked, criar }: { modelos: HuntingModel[]; rank: string; locked: boolean; criar: (model: string, name: string) => void }) {
  const [familia, setFamilia] = useState(FAMILIAS[0].id);
  const [perfil, setPerfil] = useState(FAMILIAS[0].perfis[0]);
  const [nome, setNome] = useState("");
  const fam = FAMILIAS.find(f => f.id === familia)!;
  const m = modelos.find(x => x.id === perfil) ?? modelos[0];
  const txt = textoFamilia(fam.heading);
  const exemplos = fam.perfis.length > 1 ? textoFamilia(HEADING_SERPENTE[perfil]).exemplos : txt.exemplos;
  return <div className="cr-folha"><div className="cr-rola">
    <div className="cr-familias">{FAMILIAS.map(f => <button key={f.id} type="button" className="cr-familia" aria-pressed={f.id === familia} onClick={() => { setFamilia(f.id); setPerfil(f.perfis[0]); }}>
      <svg width="44" height="44" viewBox="0 0 200 200" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ARTE[f.arte].corpo} /><path d={ARTE[f.arte].linhas} /></svg>
      <span><strong>{f.nome}</strong><small>{f.papel}</small></span>
    </button>)}</div>
    <div className="cr-ficha">
      <div className="cr-ficha-lado">
        <Retrato modelo={m.id} rotulo={`FICHA · RANKING ${rank}`} />
        {fam.perfis.length > 1 && <div className="cr-variantes" role="radiogroup" aria-label="Ficha de serpente">{fam.perfis.map(id => <button key={id} type="button" role="radio" aria-checked={id === perfil} onClick={() => setPerfil(id)}>{modelos.find(x => x.id === id)?.name}</button>)}</div>}
        <p>{txt.texto}</p>
        {exemplos && <p>{exemplos}</p>}
      </div>
      <div className="cr-ficha-dados">
        <div className="cr-ficha-titulo"><small>{m.role.toUpperCase()}</small><strong>{m.name}</strong></div>
        <DadosModelo modelo={m} />
        <div className="cr-lista-acoes"><span className="cr-rotulo">AÇÕES</span>{m.actions.map(a => <div key={a.name}><span><b>{a.cost}</b><small>PA</small></span><span><strong>{a.name}{a.attack && <span className="cr-ataque">ATAQUE NATURAL</span>}</strong><p>{a.description}</p></span></div>)}</div>
        <div className="cr-instinto"><Icone d={ICONE.pata} tamanho={22} /><span><small>INSTINTO · SEM COMANDO</small><p>{m.instinct}</p></span></div>
      </div>
    </div>
    </div>
    <div className="cr-fim">
      <label className="cr-nome">NOME<input type="text" maxLength={60} disabled={locked} placeholder="Como você chama seu companheiro?" value={nome} onChange={e => setNome(e.target.value)} /></label>
      <button type="button" className="cr-primario" disabled={locked || !nome.trim()} onClick={() => criar(perfil, nome.trim())}>ESTABELECER VÍNCULO</button>
    </div>
  </div>;
}

function DadosModelo({ modelo }: { modelo: HuntingModel }) {
  const [nomeTraco, ...resto] = modelo.trait.split(". ");
  return <>
    <div className="cr-numeros">{[[modelo.hp, "PV", true], [modelo.attributes[0], "CORPO"], [modelo.attributes[1], "MENTE"], [modelo.attributes[2], "ÂNIMO"]].map(([valor, rotulo, pv]) => <span key={String(rotulo)}><b data-pv={!!pv}>{valor}</b><small>{rotulo}</small></span>)}</div>
    <span className="cr-medidas"><span>Tamanho {modelo.size}</span><span>Deslocamento {modelo.movement}</span></span>
    <div className="cr-pericias">{modelo.skills.map(s => <span key={s.name}>{s.name}<b>{s.level}</b></span>)}</div>
    <div className="cr-traco"><strong>{nomeTraco}</strong><span>{resto.join(". ")}</span></div>
  </>;
}

/* ── Ficha do companheiro: vida, turno dele (PA, Reação, ataque), ações, instinto e condições. ── */
function FichaCompanheiro({ companheiro: c, modelo, rank, locked, send, recente, ultima, reserva, imagem, abrirImagem, aoEncerrar }: { companheiro: NonNullable<ReturnType<typeof readClassPlay>["companion"]>; modelo: HuntingModel; rank: string; locked: boolean; send: (cmd: ClassCommand) => void; recente: boolean; ultima?: string; reserva: number; imagem: string | null; abrirImagem: () => void; aoEncerrar: () => void }) {
  const [aba, setAba] = useState<"acoes" | "instinto" | "ficha">("acoes");
  const [acaoNome, setAcaoNome] = useState(modelo.actions.find(a => a.attack)?.name ?? modelo.actions[0].name);
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(c.name);
  const [aparencia, setAparencia] = useState(c.appearance);
  const colapso = c.hp === 0;
  const maxPa = c.commanded ? 2 : 1;
  const motivo = (a: typeof modelo.actions[number]) => colapso ? "EM COLAPSO" : companionActionCost(a, c, rank) > c.pa ? "SEM PA SUFICIENTE" : a.attack && c.attacked ? "UM ATAQUE POR TURNO" : "";
  const sel = modelo.actions.find(a => a.name === acaoNome) ?? modelo.actions[0];
  const custoSel = companionActionCost(sel, c, rank);
  const desfazivel = recente && !!ultima?.endsWith("resolva a ação na mesa") ? ultima.split(":")[0] : null;
  return <>
    <div className="cr-heroi">
      <button type="button" className="cr-retrato-botao" disabled={locked} aria-label={imagem ? "Trocar imagem do companheiro" : "Enviar imagem do companheiro"} onClick={abrirImagem}>
        <Retrato modelo={modelo.id} colapso={colapso} imagem={imagem} />
        <span className="cr-retrato-acao"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>{imagem ? "TROCAR IMAGEM" : "ENVIAR IMAGEM"}</span>
      </button>
      <div className="cr-heroi-dados">
        <span className="cr-rotulo" style={{ color: "var(--cr-suave)", letterSpacing: ".16em" }}>{modelo.name.toUpperCase()} · {modelo.role.toUpperCase()}</span>
        <div className="cr-heroi-nome"><strong>{c.name}</strong><button type="button" className="ar-link ar-link-neutro" disabled={locked} onClick={() => { setEditando(e => !e); setNome(c.name); setAparencia(c.appearance); }}>EDITAR IDENTIDADE</button></div>
        {c.appearance && <p>{c.appearance}</p>}
        <div className="cr-vida">
          <span><span><small>VITALIDADE</small><strong>{c.hp}<span> / {modelo.hp} PV</span></strong></span><i style={{ "--cr-pv": `${Math.round(c.hp / modelo.hp * 100)}%` } as React.CSSProperties} /></span>
          <span className="cr-vida-passos">
            <button type="button" aria-label="Remover 1 PV do companheiro" disabled={locked || c.hp <= 0} onClick={() => send({ type: "companion", operation: "hp", value: c.hp - 1 })}>−</button>
            <button type="button" aria-label="Recuperar 1 PV do companheiro" disabled={locked || c.hp >= modelo.hp} onClick={() => send({ type: "companion", operation: "hp", value: c.hp + 1 })}>+</button>
          </span>
        </div>
        {colapso && <span className="cr-colapso"><i />Em Colapso. Resolva pelas regras de Colapso.</span>}
      </div>
    </div>
    {editando && <div className="cr-identidade">
      <label className="cr-nome">NOME<input type="text" maxLength={60} value={nome} onChange={e => setNome(e.target.value)} /></label>
      <label className="cr-nome">ESPÉCIE, APARÊNCIA E ORIGEM<textarea rows={2} value={aparencia} onChange={e => setAparencia(e.target.value)} /></label>
      <button type="button" className="cr-primario" disabled={locked || !nome.trim()} onClick={() => { send({ type: "companion", operation: "identity", name: nome, appearance: aparencia }); setEditando(false); }}>SALVAR IDENTIDADE</button>
    </div>}
    <div className="cr-turno">
      <span className="cr-turno-pa"><small>TURNO DELE</small><span className="cr-turno-pips">{[0, 1].map(i => {
        const alvo = c.pa === i + 1 ? i : i + 1;
        return <button key={i} type="button" data-cheio={i < c.pa} data-fora={i >= maxPa} disabled={locked || i >= maxPa} aria-label={i >= maxPa ? "Só com comando" : `Deixar ${alvo} PA`} title={i >= maxPa ? "Só com comando" : `Deixar ${alvo} PA`} onClick={() => send({ type: "companion", operation: "pa", value: alvo })}><i /></button>;
      })}</span></span>
      <button type="button" className="ar-link ar-link-neutro cr-turno-fim" disabled={locked} onClick={() => send({ type: "companion", operation: "turn" })}>ENCERRAR TURNO</button>
      <span className="cr-turno-botoes">
        {!c.commanded && <button type="button" className="cr-comandar" disabled={locked || colapso} onClick={() => send({ type: "companion", operation: "command", reserve: false })}>COMANDAR · 1 PA SEU</button>}
        {!c.commanded && reserva > 0 && <button type="button" className="cr-marca" disabled={locked || colapso} onClick={() => send({ type: "companion", operation: "command", reserve: true })}><i />COMANDAR · 1 PA DA RESERVA</button>}
        <button type="button" className="cr-marca" aria-pressed={!c.reaction} disabled={locked} onClick={() => send({ type: "companion", operation: "reaction" })}><i />{c.reaction ? "REAÇÃO" : "REAÇÃO USADA"}</button>
        <button type="button" className="cr-marca" aria-pressed={c.attacked} disabled={locked} onClick={() => send({ type: "companion", operation: "attack" })}><i />{c.attacked ? "ATAQUE NATURAL FEITO" : "ATAQUE NATURAL"}</button>
      </span>
    </div>
    <div className="cr-abas" role="tablist" aria-label="Ficha do companheiro">{([["acoes", "AÇÕES"], ["instinto", "INSTINTO"], ["ficha", "FICHA E CONDIÇÕES"]] as const).map(([id, rotulo]) => <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>{rotulo}</button>)}</div>
    {aba === "acoes" && <div className="cr-aba">
      <div className="cr-acoes-bicho">{modelo.actions.map(a => <button key={a.name} type="button" className="cr-acao-bicho" aria-pressed={a.name === sel.name} data-travada={!!motivo(a)} onClick={() => setAcaoNome(a.name)}>
        <span><b>{companionActionCost(a, c, rank)}<small> PA</small></b>{a.attack && <span className="cr-ataque">ATAQUE</span>}</span>
        <strong>{a.name}</strong>
      </button>)}</div>
      <div className="cr-acao-detalhe">
        <header><strong>{sel.name}</strong><span>{custoSel} PA{sel.attack ? " · ATAQUE NATURAL" : ""}</span></header>
        <p>{sel.description}</p>
        <div>
          <button type="button" className="cr-primario" disabled={locked || !!motivo(sel)} onClick={() => send({ type: "companion", operation: "action", name: sel.name })}>{motivo(sel) || `USAR ${sel.name.toUpperCase()} · ${custoSel} PA`}</button>
          {desfazivel && <span className="cr-desfeito">{desfazivel.toUpperCase()} · −{modelo.actions.find(a => a.name === desfazivel)?.cost ?? 0} PA<button type="button" className="ar-link" disabled={locked} onClick={() => send({ type: "undo" })}>DESFAZER</button></span>}
        </div>
      </div>
      <p className="cr-nota">Age logo depois de você, na mesma ativação. Comandado: 2 PA. Sem comando: 1 PA para o Instinto, vir até você, buscar abrigo ou se afastar de uma ameaça. Um ataque natural por turno; os PA não se fragmentam.</p>
    </div>}
    {aba === "instinto" && <div className="cr-aba"><div className="cr-instinto"><Icone d={ICONE.pata} tamanho={30} /><span><small>QUANDO AGE POR CONTA PRÓPRIA</small><p style={{ font: "700 18px/1.3 var(--ar-oxa)", color: "#f4f8fa" }}>{modelo.instinct}</p><p>Sem comando, ele tem 1 PA: para o Instinto, para vir até você, buscar abrigo ou se afastar de uma ameaça.</p></span></div></div>}
    {aba === "ficha" && <div className="cr-aba">
      <DadosModelo modelo={modelo} />
      <span className="cr-rotulo">CONDIÇÕES</span>
      <div className="cr-condicoes">
        {c.conditions.map(valor => <button key={valor} type="button" disabled={locked} aria-label={`Remover condição ${valor}`} onClick={() => send({ type: "companion", operation: "condition", condition: valor })}>{valor}<span aria-hidden="true">×</span></button>)}
        <Seletor titulo="Adicionar condição" desabilitado={locked} valor="" opcoes={[{ id: "", nome: "+ Adicionar condição" }, ...OPCOES_CONDICAO.filter(v => !c.conditions.includes(v)).map(v => ({ id: v, nome: v }))]} onEscolher={v => { if (v) send({ type: "companion", operation: "condition", condition: v }); }} />
      </div>
      <div className="cr-encerrar">
        <span>Encerrar o vínculo arquiva esta ficha e libera um novo companheiro.</span>
        <button type="button" className="cr-perigo" disabled={locked} onClick={() => { send({ type: "companion", operation: "retire", reason: "Dispensado" }); aoEncerrar(); }}>DISPENSAR</button>
        <button type="button" className="cr-perigo" disabled={locked} onClick={() => { send({ type: "companion", operation: "retire", reason: "Morto" }); aoEncerrar(); }}>REGISTRAR MORTE</button>
      </div>
    </div>}
  </>;
}
