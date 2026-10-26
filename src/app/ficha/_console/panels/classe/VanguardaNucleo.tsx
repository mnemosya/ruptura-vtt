"use client";

import { useId, useState } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import type { ConsoleApi } from "../../types";
import { classResource, readClassPlay, reached, type ClassCommand } from "../../../../../lib/character/classManagement";
import { ativoNaRodada, estadoVanguarda, limiteAtivo, type VanguardaAcao } from "../../../../../lib/character/vanguardaTela";
import { getItemPdAtual } from "../../../../../lib/character/inventory";
import { CabecalhoModulo } from "../CabecalhoModulo";
import { oxanium } from "../../../../_design/oxanium";
import vanguarda from "../../../../../../content/v12/db_classe_vanguarda_v1_2.json";
import { ListaHabilidades, Painel, type Caracteristica } from "./painelClasse";
import "./ancoraRede.css";
import "./combatenteAnel.css";
import "./infiltradorBrechas.css";
import "./vanguardaNucleo.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "glossario" | "catalogo">>;
type Livro = { nome: string; caracteristicas: Record<string, Caracteristica[]> };

const classe = vanguarda.classes[0] as unknown as Livro;
const subclasses = vanguarda.subclasses as unknown as (Livro & { slug: string })[];

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
type PosDica = "cima" | "cima-esq" | "cima-dir" | "baixo-esq" | "baixo-dir";
const Dica = ({ texto, pos }: { texto: string; pos: PosDica }) => <span className="ca-dica" data-pos={pos} role="tooltip">{texto}</span>;

const ICONES: Record<string, string> = {
  classe: "M12 2 18 9 12 14 6 9ZM12 14v8M8.5 19h7",
  adjacente: "M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2",
  avancar: "M5 17l5-5-5-5M12 17l5-5-5-5",
  presenca: "M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8",
  irrefreavel: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  dor: "M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 4 0-3 0-5 0-8Z",
  furia: "M13 2 4 14h7l-1 8 9-12h-7Z",
  limite: "M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6",
  semsaida: "M4 4h16v16H4ZM9 4v16M15 4v16",
  cela: "M5 3v18M10 3v18M14 3v18M19 3v18M3 3h18M3 21h18",
  sentenca: "M14 4l6 6M9 9l6 6M12 6l-8 8 4 4 8-8M3 21h10",
  colossal: "M4 20V9l8-6 8 6v11ZM9 20v-6h6v6",
  absorver: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6ZM12 8v5M9.5 10.5 12 13l2.5-2.5",
  passo: "M6 20h12M9 20V10l3-6 3 6v10",
  centro: "M12 2v4M12 18v4M2 12h4M18 12h4M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10",
  interceptar: "M3 12h7M7 8l4 4-4 4M14 4l6 2v6c0 4-3 6.5-6 8",
  guarda: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6ZM9 12l2 2 4-4",
  arsenal: "M8 3 2 5v5c0 4 2.5 6.5 6 7.5M16 3l6 2v5c0 4-2.5 6.5-6 7.5M8 3l4 2 4-2",
  escudo: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z",
  ninguem: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8a4 4 0 0 1 0-8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
};
/** Ícone de cada linha do ÍMPETO DA CENA, pelo começo do nome. */
const ICONE_REGISTRO: [string, string][] = [["Ponta de Lança", ICONES.adjacente], ["Avançar", ICONES.avancar], ["Deslocamento", ICONES.avancar], ["Pressionar", "M12 5v14M5 12h14"],
  ["Avanço", ICONES.irrefreavel], ["Dor", ICONES.dor], ["Fúria", ICONES.furia], ["Contra", "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"], ["Negar", ICONES.escudo], ["Limite", ICONES.limite],
  ["Sem Saída", ICONES.semsaida], ["Cela", ICONES.cela], ["Sentença", ICONES.sentenca], ["Absorver", ICONES.absorver], ["Abrir", "M4 12h10M10 6l6 6-6 6M20 4v16"], ["Centro", ICONES.centro],
  ["Interceptar", ICONES.interceptar], ["Bloquear", ICONES.escudo], ["Abrigo", "M3 11 12 4l9 7M5 10v10h14V10M9 20v-5h6v5"], ["Posição", ICONES.guarda], ["Ninguém", ICONES.ninguem], ["Ímpetos perdidos", "M18 6 6 18M6 6l12 12"]];

const REGRAS = {
  impeto: (max: number) => `O ritmo adquirido ao avançar e permanecer no confronto. Até ${max}; todos são perdidos quando a cena termina ou ao encerrar o turno fora do confronto.`,
  adjacente: "Uma vez por rodada, quando entrar ou começar seu turno adjacente a uma criatura hostil, receba 1 Ímpeto.",
  avancar: "Depois de realizar uma ação, desloque-se 2 m sem gastar PA. Cada Ímpeto gasto concede uma aplicação.",
  pressionar: "Depois de acertar um ataque ou vencer uma manobra de combate, aumente em 1 a margem de sucesso. Cada Ímpeto gasto concede uma aplicação.",
  presenca: "Enquanto possuir 3 Ímpetos, criaturas hostis adjacentes a você sofrem –2 de desvantagem em ataques e manobras de combate que não tenham você entre os alvos.",
  irrefreavel: "Uma vez por rodada, depois de gastar um ou mais Ímpetos e ainda possuir pelo menos 1, recupere 1 Ímpeto. Toque para recuperar; DESFAZER volta.",
  dor: "Uma vez por rodada, quando sofrer uma perda de PV causada por uma criatura hostil, receba 1 Ímpeto, mesmo que já tenha recebido por outras formas. Depois, pode se deslocar 2 m em direção à criatura.",
  furia: "Com PV atuais à metade dos máximos ou menos, você entra em Fúria até o final da cena: ataques corpo a corpo causam o dobro do bônus de dano de Corpo e você recebe +1 de vantagem em testes de Vigor. Depois de Dor é Combustível, pode gastar 2 Ímpetos para entrar antes.",
  furiaGasto: "Depois de receber Ímpeto por Dor é Combustível, gaste 2 Ímpetos para entrar em Fúria antes de chegar à metade dos PV.",
  contra: "Uma vez por rodada, depois que uma criatura ao seu alcance fizer você perder PV, gaste 2 Ímpetos e uma Reação para um ataque corpo a corpo imediato contra ela. Em Fúria, +1 de vantagem.",
  negar: "Uma vez por cena, em Fúria, quando um ataque fosse fazer você perder PV, gaste 2 Ímpetos para sofrer apenas metade, arredondada para cima.",
  limite: "Uma vez por cena, em Fúria, até o final do seu próximo turno: receba Ímpeto até o limite; ataques corpo a corpo e manobras custam –1 PA (mínimo 1); ataques corpo a corpo causam o triplo do bônus de dano de Corpo; você permanece consciente a 0 PV; condições físicas recebidas ficam suspensas.",
  semsaida: "Uma vez por rodada, quando uma criatura hostil adjacente tentar se deslocar voluntariamente para mais longe de você, gaste uma Reação e 1 Ímpeto para Agarrar, Derrubar ou Empurrar, antes do deslocamento e sem PA. Vencendo, o deslocamento é interrompido.",
  cela: "Quando acertar um ataque ou vencer Sem Saída contra uma criatura hostil adjacente, gaste 2 Ímpetos. Até o início do seu próximo turno, ela gasta 2 m de deslocamento por 1 m e sofre –1 de desvantagem na próxima ação defensiva.",
  sentenca: (k: number) => `Uma vez por cena, gaste 1 PA e 2 Ímpetos e escolha até ${k} ${k === 1 ? "criatura hostil" : "criaturas hostis"} a até 2 m (seu Corpo). Faça uma ação de Sem Saída contra cada uma, sem PA nem Reação; cada uma contra a qual vencer sofre Cela Móvel até o início do seu próximo turno.`,
  colossal: "Você é considerado uma criatura Grande. Seus ataques e efeitos medem alcance a partir de qualquer célula que você ocupe.",
  absorver: "Uma vez por rodada, quando sofrer uma perda de PV, gaste 1 Ímpeto para reduzi-la em uma quantidade igual ao seu Corpo, até o mínimo de 0.",
  passo: "Enquanto possuir ao menos 1 Ímpeto, reduza em 2 m qualquer movimento forçado aplicado a você.",
  abrir: "Uma vez por rodada, antes de entrar no espaço de uma criatura hostil do seu tamanho ou menor, realize Empurrar ou Derrubar contra ela sem gastar PA. Vencendo, atravesse e continue; perdendo, pare no último espaço livre antes dela.",
  centro: "Uma vez por cena, no início do seu turno, até o início do próximo: Absorver Impacto vale para cada perda de PV, sem gastar Ímpeto; você não pode ser movido contra sua vontade nem ficar Caído; uma vez por turno, estenda um ataque corpo a corpo a uma segunda criatura ao seu alcance.",
  interceptar: "Uma vez por rodada, quando um aliado a até 2 m for alvo de um ataque, gaste 1 Ímpeto para se deslocar até 2 m antes da resolução, terminando adjacente a ele, e poder Bloquear o ataque.",
  guarda: "Uma vez por cena, durante seu turno, assuma Postura Defensiva sem gastar PA.",
  arsenal: "Empunhando dois escudos com ao menos 1 PD cada, receba +1 de vantagem em testes de Reflexos para Bloquear. Cada escudo mantém seus próprios PD; ataques corpo a corpo com escudo causam 1d6 + Corpo.",
  abrigo: "Até o início do seu próximo turno, aliados adjacentes recebem a cobertura deste escudo e, quando você gastar Ímpeto para se deslocar, um deles pode se deslocar até 2 m sem gastar PA.",
  ninguem: "Uma vez por cena, no início do seu turno, até o início do próximo: Interceptar alcança 4 m, não tem limite por rodada e não exige Ímpeto. Cada bloqueio é uma ação defensiva separada.",
  bloquear: "Escolha o escudo que interpõe o ataque e marque o resultado do teste de Reflexos. Cada escudo mantém seus próprios PD.",
};

type Chip = { chave: string; icone: string; rotulo: string; valor: string; usado?: boolean; ativo?: boolean; brasa?: boolean; dica: string; clicar?: () => void };
type Gasto = { chave: string; rotulo: string; regra: string; custo: number; clicar: () => void };
type Gatilho = { chave: string; icone: string; nome: string; curta: string; feito?: boolean; esmaecido?: boolean; regra: string; clicar: () => void };

/** Segmento j do arco de 240° do Núcleo, com o rótulo e o filete. */
function arco(j: number, max: number) {
  const gap = 7, span = (240 - gap * (max - 1)) / max, a0 = 150 + j * (span + gap), a1 = a0 + span, R = 132, r = 104, rad = (x: number) => x * Math.PI / 180;
  const p = (ang: number, raio: number) => `${(150 + raio * Math.cos(rad(ang))).toFixed(2)} ${(150 + raio * Math.sin(rad(ang))).toFixed(2)}`;
  const g = span > 180 ? 1 : 0, [lx, ly] = p((a0 + a1) / 2, 154).split(" ");
  return { corpo: `M${p(a0, R)}A${R} ${R} 0 ${g} 1 ${p(a1, R)}L${p(a1, r)}A${r} ${r} 0 ${g} 0 ${p(a0, r)}Z`, filete: `M${p(a0 + 3, 118)}A118 118 0 ${g} 1 ${p(a1 - 3, 118)}`, lx, ly };
}

export function VanguardaNucleo({ api, rank, subclassId }: { api: Api; rank: string; subclassId?: string }) {
  const [painel, setPainel] = useState<null | "habilidades" | "cena">(null);
  const [modo, setModo] = useState<null | "gastar" | "semsaida" | "abrir">(null);
  const [bloqueando, setBloqueando] = useState<string | null>(null);
  const [pendAbrigo, setPendAbrigo] = useState<string | null>(null);
  const idGrad = useId().replace(/:/g, "");

  const st = readClassPlay(api.character);
  const res = classResource(api.character);
  const send = api.classe?.executar;
  const locked = !!api.somenteLeitura || !send;
  const at = (r: string) => reached(rank, r);
  const sub = subclasses.find(item => item.slug === subclassId);
  const temSub = !!sub && at("E");
  const ss = temSub ? subclassId : undefined;
  const enviar = (cmd: ClassCommand) => { if (!locked) send?.(cmd); };
  const topoPilha = st.pilha?.[st.pilha.length - 1]?.nome;
  const uso = (chave: string) => st.uses[chave] ?? 0;
  const v = estadoVanguarda(st);
  const n = st.resource, max = res.max, cheia = n >= max;
  const corpo = api.character.atributos?.corpo ?? 0;
  const acao = (a: VanguardaAcao, passo: string, pa = 0) => { setModo(null); setPendAbrigo(null); enviar({ type: "vanguarda", acao: a, passo, pa }); };
  const desfazer = () => { setModo(null); setBloqueando(null); setPendAbrigo(null); enviar({ type: "desfazerCombate" }); };
  const furia = ss === "berserker" && !!v.furia, centro = ativoNaRodada(v.centro, st.round), ninguem = ativoNaRodada(v.ninguem, st.round), limite = limiteAtivo(v, st.round);

  /* ── Gastos ao tocar num segmento aceso ── */
  const avancar = (k: number) => {
    acao({ op: "gastar", uso: "avancar", n: k }, at("D") ? "Avançar" : `Deslocou ${k * 2} m`);
    if (ss === "colosso" && at("C") && !uso("round:abrir")) setModo("abrir");
  };
  const gastos: Gasto[] = at("D")
    ? [{ chave: "avancar", rotulo: "AVANÇAR · 2 M", regra: REGRAS.avancar, custo: 1, clicar: () => avancar(1) },
       { chave: "pressionar", rotulo: "PRESSIONAR · +1 MARGEM", regra: REGRAS.pressionar, custo: 1, clicar: () => acao({ op: "gastar", uso: "pressionar", n: 1 }, "Pressionar") }]
    : Array.from({ length: n }, (_, k) => ({ chave: `deslocar${k}`, rotulo: `DESLOCAR · ${(k + 1) * 2} M`, custo: k + 1, clicar: () => avancar(k + 1),
        regra: `Gaste ${k + 1} ${k ? "Ímpetos" : "Ímpeto"} para se deslocar ${(k + 1) * 2} m sem gastar PA, uma vez depois de cada ação. Todo o Ímpeto do deslocamento é gasto ao iniciá-lo.` }));
  if (ss === "berserker") {
    if (uso("round:dor") && !furia) gastos.push({ chave: "furia", rotulo: "FÚRIA · 2", regra: REGRAS.furiaGasto, custo: 2, clicar: () => acao({ op: "furia", via: "impeto" }, "Fúria") });
    if (at("C")) gastos.push({ chave: "contra", rotulo: "CONTRA-ATAQUE · 2", regra: REGRAS.contra, custo: 2, clicar: () => acao({ op: "contra" }, "Contra-Ataque") });
    if (at("C") && furia) gastos.push({ chave: "negar", rotulo: "NEGAR A DOR · 2", regra: REGRAS.negar, custo: 2, clicar: () => acao({ op: "negar" }, "Negar a Dor") });
  }
  const gastosVisiveis = gastos.filter(g => g.custo <= n);
  const tocar = (j: number) => { setBloqueando(null); setPendAbrigo(null); if (j < n) setModo(modo === "gastar" ? null : "gastar"); else if (!cheia) acao({ op: "receber", fonte: "adjacente" }, "Ímpeto recebido"); };

  /* ── Escudos empunhados (Guardião) ── */
  const escudos = (api.character.inventario ?? []).filter(i => i.estado === "empunhado" && (i.equipamentoSlot === "escudo" || i.categoria === "escudo")).map(i => {
    const m = api.catalogo?.get(i.itemSlug), pd = getItemPdAtual(i, m ?? undefined), pdMax = m?.pdMax ?? Math.max(pd, 1);
    return { id: i.id, nome: i.itemNome, pd, pdMax, mao: i.encaixeEscolhido === "arma_secundaria" ? "SECUNDÁRIA" : "PRIMÁRIA" };
  });
  const arsenal = escudos.filter(e => e.pd > 0).length >= 2;
  const escudoBloqueando = escudos.find(e => e.id === bloqueando);
  const resultadoBloqueio = (ok: boolean) => {
    if (!escudoBloqueando) return;
    acao({ op: "bloqueio", escudo: escudoBloqueando.nome, ok }, ok ? "Bloqueou" : "Bloqueio falhou");
    setBloqueando(null);
    if (ok && at("C")) setPendAbrigo(escudoBloqueando.nome);
  };

  /* ── Chips: subclasse primeiro, depois Presença Dominante (B) e Avanço Irrefreável (S) ── */
  const presenca: Chip = { chave: "presenca", icone: ICONES.presenca, rotulo: "PRESENÇA DOMINANTE", valor: n >= 3 ? "ATIVA" : "COM 3 ÍMPETOS", usado: n < 3, ativo: n >= 3, dica: REGRAS.presenca };
  const irrefreavel: Chip = { chave: "irrefreavel", icone: ICONES.irrefreavel, rotulo: "AVANÇO IRREFREÁVEL", valor: uso("round:irrefreavel") ? "USADO NA RODADA" : "1× POR RODADA", usado: !!uso("round:irrefreavel"), dica: REGRAS.irrefreavel,
    clicar: () => { if (n >= 1 && !cheia) acao({ op: "irrefreavel" }, "Avanço Irrefreável"); } };
  const chipsSub: Chip[] = [];
  if (ss === "berserker") {
    chipsSub.push({ chave: "furia", icone: ICONES.furia, rotulo: "FÚRIA", valor: furia ? "ATÉ O FIM DA CENA" : "PV À METADE", ativo: furia, brasa: furia, dica: REGRAS.furia + (furia ? " Toque para sair." : " Toque para entrar."),
      clicar: () => acao({ op: "furia", via: furia ? "sair" : "pv" }, furia ? "Fúria encerrada" : "Fúria") });
    if (at("A") && furia) chipsSub.push({ chave: "limite", icone: ICONES.limite, rotulo: "LIMITE ROMPIDO", valor: limite ? "ATÉ O FIM DO PRÓXIMO TURNO" : uso("scene:limite") ? "USADO NA CENA" : "1× POR CENA", ativo: limite, brasa: limite, usado: !limite && !!uso("scene:limite"), dica: REGRAS.limite,
      clicar: () => acao({ op: "limite" }, "Limite Rompido") });
  } else if (ss === "carcereiro") {
    chipsSub.push({ chave: "semsaida", icone: ICONES.semsaida, rotulo: "SEM SAÍDA", valor: uso("round:semsaida") ? "USADO NA RODADA" : "1× POR RODADA", usado: !!uso("round:semsaida"), ativo: modo === "semsaida", dica: REGRAS.semsaida,
      clicar: () => setModo(modo === "semsaida" ? null : "semsaida") });
    if (at("A")) chipsSub.push({ chave: "sentenca", icone: ICONES.sentenca, rotulo: "SENTENÇA", valor: uso("scene:sentenca") ? "USADO NA CENA" : "1× POR CENA · 1 PA", usado: !!uso("scene:sentenca"), dica: REGRAS.sentenca(Math.max(1, corpo)),
      clicar: () => { if (n >= 2) acao({ op: "sentenca" }, "Sentença", 1); } });
    if (at("C")) chipsSub.push({ chave: "cela", icone: ICONES.cela, rotulo: "CELA MÓVEL", valor: "2 ÍMPETOS", dica: REGRAS.cela, clicar: () => { if (n >= 2) acao({ op: "cela" }, "Cela Móvel"); } });
  } else if (ss === "colosso") {
    if (at("A")) chipsSub.push({ chave: "centro", icone: ICONES.centro, rotulo: "CENTRO DA BATALHA", valor: centro ? "ATÉ SEU PRÓXIMO TURNO" : uso("scene:centro") ? "USADO NA CENA" : "1× POR CENA", ativo: centro, usado: !centro && !!uso("scene:centro"), dica: REGRAS.centro,
      clicar: () => acao({ op: "centro", valor: !centro }, centro ? "Centro da Batalha encerrado" : "Centro da Batalha") });
    chipsSub.push({ chave: "colossal", icone: ICONES.colossal, rotulo: "CORPO COLOSSAL", valor: "GRANDE", dica: REGRAS.colossal });
    if (at("C")) { const ativo = centro || n >= 1; chipsSub.push({ chave: "passo", icone: ICONES.passo, rotulo: "PASSO FIRME", valor: centro ? "NÃO PODE SER MOVIDO" : ativo ? "ATIVO · –2 M" : "COM 1 ÍMPETO", ativo, usado: !ativo, dica: REGRAS.passo }); }
  } else if (ss === "guardiao") {
    if (at("A")) chipsSub.push({ chave: "ninguem", icone: ICONES.ninguem, rotulo: "NINGUÉM FICA PARA TRÁS", valor: ninguem ? "ATÉ SEU PRÓXIMO TURNO" : uso("scene:ninguem") ? "USADO NA CENA" : "1× POR CENA", ativo: ninguem, usado: !ninguem && !!uso("scene:ninguem"), dica: REGRAS.ninguem,
      clicar: () => acao({ op: "ninguem", valor: !ninguem }, ninguem ? "Formação encerrada" : "Ninguém Fica Para Trás") });
    chipsSub.push({ chave: "guarda", icone: ICONES.guarda, rotulo: "POSIÇÃO DE GUARDA", valor: uso("scene:guarda") ? "USADO NA CENA" : "1× POR CENA", usado: !!uso("scene:guarda"), dica: REGRAS.guarda, clicar: () => acao({ op: "guarda" }, "Posição de Guarda") });
    chipsSub.push({ chave: "arsenal", icone: ICONES.arsenal, rotulo: "ARSENAL DEFENSIVO", valor: arsenal ? "+1 PARA BLOQUEAR" : "UM ESCUDO", ativo: arsenal, usado: !arsenal, dica: REGRAS.arsenal });
  }
  const chips = [...chipsSub, ...(at("B") ? [presenca] : []), ...(at("S") ? [irrefreavel] : [])];
  const grade = chips.length === 4;
  const chipView = (c: Chip, k: number) => {
    const pos: PosDica = grade ? (k % 2 ? "baixo-dir" : "baixo-esq") : chips.length === 1 || k < chips.length / 2 ? "baixo-esq" : "baixo-dir";
    return c.clicar
      ? <button key={c.chave} type="button" className="ca-chip ca-tem-dica" data-usado={c.usado || undefined} data-ativo={c.ativo || undefined} data-brasa={c.brasa || undefined} aria-pressed={c.ativo || false} disabled={locked} onClick={c.clicar}>
          <Svg d={c.icone} tam={14} traco={2} />{c.rotulo}<b>· {c.valor}</b><Dica texto={c.dica} pos={pos} />
        </button>
      : <span key={c.chave} className="ca-chip ca-tem-dica" tabIndex={0} data-usado={c.usado || undefined} data-ativo={c.ativo || undefined}>
          <Svg d={c.icone} tam={14} traco={2} />{c.rotulo}<b>· {c.valor}</b><Dica texto={c.dica} pos={pos} />
        </span>;
  };

  /* ── Gatilhos embaixo do Núcleo ── */
  const adjacente: Gatilho = { chave: "adjacente", icone: ICONES.adjacente, nome: "Adjacente a hostil", curta: uso("round:adjacente") ? "JÁ RECEBEU NESTA RODADA" : "AO ENTRAR OU COMEÇAR O TURNO", feito: !!uso("round:adjacente"), esmaecido: cheia, regra: REGRAS.adjacente,
    clicar: () => { if (!cheia) acao({ op: "receber", fonte: "adjacente" }, "Ímpeto recebido"); } };
  const gatilhoView = (g: Gatilho, pos: PosDica) =>
    <button key={g.chave} type="button" className="in-gatilho ca-tem-dica" data-feito={g.feito || undefined} data-esmaecido={g.esmaecido || undefined} disabled={locked} onClick={g.clicar}>
      <span>
        <svg width="38" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" fill="var(--ca-fundo)" stroke="var(--ca)" strokeWidth="2.4" /></svg>
        <Svg d={g.icone} tam={17} traco={2} />
      </span>
      <span><strong>{g.nome}</strong><small>{g.curta}</small></span>
      <Dica texto={g.regra} pos={pos} />
    </button>;

  const estado = centro ? "CENTRO DA BATALHA" : furia ? "EM FÚRIA" : ss === "colosso" && at("C") && n >= 1 ? "PASSO FIRME" : "";
  const rotulo = temSub ? `${sub!.nome.toUpperCase()} · ${rank}` : `RANKING ${rank}`;
  const registro = [...v.registro].reverse();
  const iconeRegistro = (nome: string) => ICONE_REGISTRO.find(([k]) => nome.startsWith(k))?.[1] ?? "M5 12h14";

  return <section className={`rc-eq-outer ar-raiz ca-raiz in-raiz va-raiz ${oxanium.variable} ${plex.variable}`} aria-label="Classe Vanguarda" data-furia={furia || undefined}>
    <div className="rc-eq-card-outer rc-inv-moldura">
    <CabecalhoModulo id="ID://CLASSE" mod="MOD.CLASS // 10" />
    <div className="ar-tela">
    <div className="ar-rolagem">
      <header className="ar-cab">
        <h2>VANGUARDA</h2>
        <span>{rotulo}</span>
        <span className="ca-legenda" aria-hidden="true"><span><Svg d={ICONES.avancar} tam={14} traco={2} />GASTE DEPOIS DE CADA AÇÃO</span></span>
      </header>
      {chips.length > 0 && <div className="ca-chips va-chips" data-grade={grade || undefined}>{chips.map(chipView)}</div>}

      <div className="in-palco va-palco" data-chips={chips.length > 0 || undefined} data-vao={ss === "guardiao" || ss === "colosso" ? ss : undefined}>
        <section className="va-impeto" aria-label="Ímpeto">
          <div className="va-nucleo">
            <svg className="va-deco" width="300" height="300" viewBox="0 0 300 300" aria-hidden="true">
              <circle cx="150" cy="150" r="143" fill="none" stroke="#24394a" strokeWidth="6" strokeDasharray="1.2 6.3" />
              <circle cx="150" cy="150" r="96" fill="none" stroke="var(--ca-borda)" strokeWidth="1" strokeDasharray="26 8 3 8" />
              <path d="M150 62 226 106v88l-76 44-76-44v-88Z" fill="#081621" stroke="#1c3445" strokeWidth="1.4" transform="translate(150 150) scale(.62) translate(-150 -150)" />
              <path d="M150 62 226 106v88l-76 44-76-44v-88Z" fill="none" stroke={furia ? "var(--va-brasa)" : "var(--ca)"} strokeWidth={furia ? 1.6 : 1.2} opacity={furia ? .7 : .5} transform="translate(150 150) scale(.7) translate(-150 -150)" />
              <path d="M104 262h92M120 270h60" stroke="#24394a" strokeWidth="1.4" />
            </svg>
            {Array.from({ length: max }, (_, j) => {
              const acesa = j < n, proxima = j === n, ativa = acesa && modo === "gastar", a = arco(j, max), id = `${idGrad}-${j}`;
              return <button key={j} type="button" className="va-arco" aria-pressed={ativa} disabled={locked}
                aria-label={acesa ? `Ímpeto ${j + 1}: tocar para gastar` : `Vaga ${j + 1}: tocar para receber um Ímpeto`} onClick={() => tocar(j)}>
                <svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true" style={{ filter: ativa ? "drop-shadow(0 0 16px var(--ca-halo))" : acesa ? "drop-shadow(0 0 9px var(--ca-halo))" : "none" }}>
                  <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor={acesa ? "var(--ca-fundo)" : "#06121c"} /><stop offset=".55" stopColor={acesa ? "var(--ca)" : "#06121c"} /><stop offset="1" stopColor={acesa ? (ativa ? "#ffffff" : "var(--ca-claro)") : "#06121c"} />
                  </linearGradient></defs>
                  <path className="va-corpo" d={a.corpo} fill={`url(#${id})`} stroke={ativa ? "#ffffff" : acesa ? "var(--ca)" : proxima ? "#4b6a7d" : "#2c4556"} strokeWidth={acesa ? 2.4 : 1.4} strokeLinejoin="round" />
                  <path d={a.filete} fill="none" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="2 4" opacity={acesa ? 1 : 0} />
                  <text x={a.lx} y={a.ly} textAnchor="middle" dominantBaseline="middle" fill={ativa ? "var(--ca-claro)" : acesa ? "var(--ca-suave)" : "#7f97a6"}>0{j + 1}</text>
                </svg>
              </button>;
            })}
            <span className="va-centro ca-tem-dica" tabIndex={0}>
              <strong>{n}</strong>
              <span>DE {max}</span>
              {estado && <em data-brasa={furia && !centro || undefined}>{estado}</em>}
              <Dica pos="cima" texto={REGRAS.impeto(max)} />
            </span>
          </div>
          <div className="in-escolha">
            {modo === "gastar" && n > 0 ? <>
              <span>GASTAR EM</span>
              {gastosVisiveis.map(g => <button key={g.chave} type="button" className="in-uso ca-tem-dica" disabled={locked} onClick={g.clicar}>{g.rotulo}<Dica pos="cima" texto={g.regra} /></button>)}
              <button type="button" className="in-link" data-tom="neutro" disabled={locked} onClick={() => acao({ op: "perder" }, "Ímpeto perdido")}>PERDER TODOS</button>
              <button type="button" className="in-link" data-tom="neutro" onClick={() => setModo(null)}>CANCELAR</button>
            </> : modo === "semsaida" ? <>
              <span>SEM SAÍDA</span>
              {(["Agarrar", "Derrubar", "Empurrar"] as const).map(m => <button key={m} type="button" className="in-uso ca-tem-dica" disabled={locked || n < 1} onClick={() => acao({ op: "semSaida", manobra: m }, `Sem Saída · ${m}`)}>{m.toUpperCase()}<Dica pos="cima" texto={`Sem Saída: gaste uma Reação e 1 Ímpeto para ${m} a criatura antes do deslocamento, sem PA.`} /></button>)}
              <button type="button" className="in-link" data-tom="neutro" onClick={() => setModo(null)}>CANCELAR</button>
            </> : modo === "abrir" ? <>
              <span className="ca-tem-dica" tabIndex={0}>ABRIR CAMINHO<Dica pos="cima-esq" texto={REGRAS.abrir} /></span>
              {(["Empurrar", "Derrubar"] as const).map(m => <button key={m} type="button" className="in-uso" disabled={locked} onClick={() => acao({ op: "abrirCaminho", manobra: m }, `Abrir Caminho · ${m}`)}>{m.toUpperCase()}</button>)}
              <button type="button" className="in-link" data-tom="neutro" onClick={() => setModo(null)}>SEM MANOBRA</button>
            </> : topoPilha && <button type="button" className="in-link" disabled={locked} onClick={desfazer}>DESFAZER · {topoPilha.toUpperCase()}</button>}
          </div>
        </section>

        {ss === "colosso" && <section className="in-receber va-secao" aria-label="Absorver Impacto">
          <span>AO SOFRER PERDA DE PV</span>
          <div className="va-unico">{gatilhoView({ chave: "absorver", icone: ICONES.absorver, nome: "Absorver Impacto", regra: REGRAS.absorver,
            curta: centro ? "SEM GASTAR ÍMPETO" : uso("round:absorver") ? "JÁ USADO NESTA RODADA" : `1 ÍMPETO · –${corpo} PV`, feito: !centro && !!uso("round:absorver"), esmaecido: !centro && n < 1,
            clicar: () => { if (centro || n >= 1) acao({ op: "absorver" }, "Absorver Impacto"); } }, "cima")}</div>
        </section>}

        {ss === "guardiao" && <section className="va-bloquear" aria-label="Bloquear">
          <span className="ca-tem-dica" tabIndex={0}>BLOQUEAR COM<Dica pos="cima" texto={REGRAS.bloquear} /></span>
          {escudos.length ? <div className="va-escudos">{escudos.map(e => {
            const abrigo = v.abrigo && v.abrigo.escudo === e.nome && ativoNaRodada(v.abrigo.rodada, st.round);
            return <button key={e.id} type="button" className="va-escudo" aria-pressed={bloqueando === e.id} disabled={locked} onClick={() => { setPendAbrigo(null); setModo(null); setBloqueando(bloqueando === e.id ? null : e.id); }}>
              <span className="va-escudo-arte"><Svg d={ICONES.escudo} tam={24} traco={1.6} /></span>
              <span className="va-escudo-info">
                <span><strong>{e.nome}</strong><b>{e.pd}/{e.pdMax} PD</b></span>
                <span className="va-escudo-pd"><i style={{ width: `${Math.min(100, e.pd / e.pdMax * 100)}%` }} /></span>
                <small data-tom={abrigo ? "abrigo" : undefined}>{abrigo ? "ABRIGO MÓVEL · ATÉ SEU PRÓXIMO TURNO" : e.mao}</small>
              </span>
            </button>;
          })}</div> : <p className="va-vazio">Nenhum escudo empunhado.</p>}
          <div className="in-escolha va-escolha-bloqueio">
            {escudoBloqueando ? <>
              <span>BLOQUEAR · {escudoBloqueando.nome.toUpperCase()}</span>
              <button type="button" className="va-opcao" disabled={locked} onClick={() => resultadoBloqueio(true)}>BLOQUEOU</button>
              <button type="button" className="va-opcao" disabled={locked} onClick={() => resultadoBloqueio(false)}>FALHOU</button>
              <button type="button" className="in-link" data-tom="neutro" onClick={() => setBloqueando(null)}>CANCELAR</button>
            </> : pendAbrigo && n >= 1 ? <>
              <button type="button" className="va-opcao ca-tem-dica" disabled={locked} onClick={() => acao({ op: "abrigo", escudo: pendAbrigo }, "Abrigo Móvel")}>ABRIGO MÓVEL · 1 ÍMPETO<Dica pos="cima" texto={REGRAS.abrigo} /></button>
              <button type="button" className="in-link" data-tom="neutro" onClick={() => setPendAbrigo(null)}>AGORA NÃO</button>
            </> : <small data-usado={!!uso("round:protetor") || undefined}>{uso("round:protetor") ? "ÍMPETO PROTETOR · JÁ RECEBEU NESTA RODADA" : "ÍMPETO PROTETOR · +1 NO PRIMEIRO BLOQUEIO DA RODADA"}</small>}
          </div>
        </section>}

        <section className="in-receber va-secao" aria-label="Receber Ímpeto">
          {ss === "guardiao" ? <div className="va-par">
            {gatilhoView(adjacente, "cima-esq")}
            {gatilhoView({ chave: "interceptar", icone: ICONES.interceptar, nome: "Interceptar", regra: REGRAS.interceptar,
              curta: ninguem ? "ATÉ 4 M · SEM GASTAR ÍMPETO" : uso("round:interceptar") ? "JÁ USADO NESTA RODADA" : "1 ÍMPETO · ALIADO A ATÉ 2 M", feito: !ninguem && !!uso("round:interceptar"), esmaecido: !ninguem && n < 1,
              clicar: () => { if (ninguem || n >= 1) acao({ op: "interceptar" }, "Interceptar"); } }, "cima-dir")}
          </div> : ss === "berserker" ? <>
            <span>RECEBER ÍMPETO</span>
            <div className="va-par">
              {gatilhoView(adjacente, "cima-esq")}
              {gatilhoView({ chave: "dor", icone: ICONES.dor, nome: "Dor é Combustível", regra: REGRAS.dor, curta: uso("round:dor") ? "JÁ RECEBEU NESTA RODADA" : "PERDA DE PV POR HOSTIL", feito: !!uso("round:dor"),
                clicar: () => acao({ op: "receber", fonte: "dor" }, "Dor é Combustível") }, "cima-dir")}
            </div>
          </> : <>
            <span>RECEBER ÍMPETO · <b data-usado={!!uso("round:adjacente") || undefined}>{uso("round:adjacente") ? "JÁ RECEBEU NESTA RODADA" : "1 POR RODADA"}</b></span>
            <div className="va-unico">{gatilhoView({ ...adjacente, curta: "AO ENTRAR OU COMEÇAR O TURNO", feito: false }, "cima")}</div>
          </>}
        </section>
      </div>
    </div>

    <footer className="ar-rodape">
      <span aria-hidden="true" />
      <button type="button" onClick={() => setPainel("cena")}>ÍMPETO DA CENA<span className="in-contador">{registro.length}</span></button>
      <button type="button" onClick={() => setPainel("habilidades")}>HABILIDADES ›</button>
    </footer>

    {painel === "habilidades" && <Painel titulo="HABILIDADES" fechar={() => setPainel(null)}>
      <ListaHabilidades classe={classe} sub={temSub ? sub : undefined} rank={rank} glossario={api.glossario} iconeClasse={<Svg d={ICONES.classe} tam={16} />} />
    </Painel>}

    {painel === "cena" && <Painel baixo titulo="ÍMPETO DA CENA" fechar={() => setPainel(null)}>
      <div className="in-folha">
        <p className="in-intro">Do mais recente ao mais antigo. Todos os Ímpetos são perdidos quando a cena termina.</p>
        <div>{registro.map((r, i) =>
          <div key={i} className="in-linha" data-tipo={r.tipo}>
            <span>
              <svg width="40" height="42" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" fill="#0b161c" stroke="currentColor" strokeWidth="2.4" /></svg>
              <Svg d={iconeRegistro(r.nome)} tam={16} traco={2} />
            </span>
            <span><strong>{r.nome}</strong><span>{r.det}</span></span>
            <small>RODADA {r.rodada}</small>
          </div>)}</div>
        <div className="in-folha-fim">{topoPilha && <button type="button" className="in-link" disabled={locked} onClick={desfazer}>DESFAZER · {topoPilha.toUpperCase()}</button>}</div>
      </div>
    </Painel>}
    </div>
    </div>
  </section>;
}
