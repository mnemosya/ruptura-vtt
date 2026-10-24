import combatente from "../../../../../../content/v12/db_classe_combatente_v1_2.json";

/* Dados da tela do Combatente. Nomes, gatilhos e efeitos saem das
   características do livro (Doutrina de Combate, Técnica Aprimorada,
   Manobra Composta e as subclasses); a regra completa de cada manobra é
   lida do próprio texto, para o hover nunca divergir do livro. */

export type Lado = "ataque" | "defesa";
export type Manobra = {
  id: string; nome: string; categoria: "Básica" | "Tática" | "Avançada"; rank: "F" | "D" | "B";
  lado: Lado; acao: string; gatilho: string; icone: string; limite?: boolean; reacao?: boolean;
  efeito: (n: number) => string; regra: string;
};

const CATEGORIAS = [["F", "Básica"], ["D", "Tática"], ["B", "Avançada"]] as const;
const regras: Record<string, string> = Object.fromEntries(CATEGORIAS.flatMap(([rank]) => {
  const texto = (combatente.classes[0].caracteristicas as Record<string, { descricao: string }[]>)[rank][0].descricao;
  const titulos = [...texto.matchAll(/^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ -]+):\n/gm)];
  return titulos.map((t, i) => [t[1], texto.slice((t.index ?? 0) + t[0].length, titulos[i + 1]?.index).trim().replace(/\n{2,}[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ ]+\n?$/, "")]);
}));

const m = (id: string, nome: string, categoria: Manobra["categoria"], lado: Lado, acao: string, gatilho: string, icone: string, efeito: (n: number) => string, extra: Partial<Manobra> = {}): Manobra =>
  ({ id, nome, categoria, rank: categoria === "Básica" ? "F" : categoria === "Tática" ? "D" : "B", lado, acao, gatilho, icone, efeito, regra: regras[id] ?? "", ...extra });

/** As 16 manobras, pelo título do livro (é o id gravado em `selections.manobras`). */
export const MANOBRAS: Manobra[] = [
  m("CORTAR A RESPOSTA", "Cortar a Resposta", "Básica", "ataque", "acerto", "DEPOIS DE ACERTAR", "M5 19 19 5M13 5h6v6", n => `+${n} de dano · padrão ou crítico: o alvo perde 1 Reação`),
  m("DEMOLIÇÃO", "Demolição", "Básica", "ataque", "estrutura", "ESCUDO, OBJETO OU COBERTURA", "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6", n => `+${n * 2} de dano ao PD`),
  m("EXPLORAR A GUARDA", "Explorar a Guarda", "Básica", "ataque", "acerto", "DEPOIS DE ACERTAR", "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v4M12 18v4M2 12h4M18 12h4", n => `+${n} de dano · +1 de vantagem no próximo ataque contra ela`),
  m("FINTA TREINADA", "Finta Treinada", "Básica", "ataque", "finta", "AO FINTAR", "M4 12h10M10 6l6 6-6 6M20 4v16", n => `+${n} no teste de Fintar · deu certo: +${n} no dano do primeiro ataque beneficiado`),
  m("INVESTIDA IRREFREÁVEL", "Investida Irrefreável", "Básica", "ataque", "investida", "DEPOIS DE 4 M ATÉ O ALVO", "M3 12h13M12 6l6 6-6 6M21 5v14", n => `acertou: +${n} de dano · desloca o alvo ${Math.floor(n / 2)} m`),
  m("DEFESA CALCULADA", "Defesa Calculada", "Básica", "defesa", "defesa", "NA AÇÃO DEFENSIVA", "M12 3 5 6v6c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6Z", n => `+${n} no teste da ação defensiva`),
  m("ATAQUE ENCADEADO", "Ataque Encadeado", "Tática", "ataque", "secundario", "ATAQUE SECUNDÁRIO", "M7 12h10M13 8l4 4-4 4M3 8v8", n => `não paga 1 PA · acertou: +${n} de dano`, { limite: true }),
  m("DESARME", "Desarme", "Tática", "ataque", "desarme", "ALVO EMPUNHANDO OBJETO", "M6 18 18 6M8 6h10v10", n => `acertou: +${n} de dano · o alvo Resiste contra o seu acerto ou solta o objeto`),
  m("GOLPE AMPLO", "Golpe Amplo", "Tática", "ataque", "acerto", "ACERTOU CORPO A CORPO", "M4 16c4-8 12-8 16 0M4 16l-1 4M20 16l1 4", n => `outra criatura ao alcance sofre ${n} se o acerto superar a defesa dela`),
  m("QUEBRA DE BASE", "Quebra de Base", "Tática", "ataque", "acerto", "DEPOIS DE ACERTAR", "M4 20h16M8 20l4-12 4 12", n => `+${n} de dano · padrão ou crítico: Caído; limitado: Resistir ou Caído`),
  m("ATAQUE PREPARADO", "Ataque Preparado", "Tática", "defesa", "entrou", "ENTROU NO SEU ALCANCE", "M12 3v18M3 12h18", n => `ataque agora · acertou: +${n} de dano`, { reacao: true }),
  m("CONTRA-ATAQUE", "Contra-Ataque", "Tática", "defesa", "errou", "ERROU VOCÊ", "M7 7h12l-3-3M17 17H5l3 3", n => `ataque agora · acertou: +${n} de dano`, { reacao: true }),
  m("CORREÇÃO DO GOLPE", "Correção do Golpe", "Avançada", "ataque", "acerto", "DEPOIS DE ERRAR", "M4 12a8 8 0 1 0 2.6-5.9M4 3v5h5", n => `+${n} no teste de acerto`),
  m("MANTER A OFENSIVA", "Manter a Ofensiva", "Avançada", "ataque", "derrubou", "LEVOU A 0 PV", "M5 12h14M13 6l6 6-6 6", n => `outro ataque sem PA · acertou: +${n} de dano`, { limite: true }),
  m("AMORTECER", "Amortecer", "Avançada", "defesa", "dano", "AO SOFRER DANO", "M4 14h16M7 10h10M10 6h4M12 14v6", n => `−${n} no dano sofrido`, { limite: true }),
  m("ATAQUE DE OPORTUNIDADE", "Ataque de Oportunidade", "Avançada", "defesa", "saiu", "SAIU DO SEU ALCANCE", "M3 12h12M11 8l4 4-4 4M21 4v16", n => `ataque agora · acertou: +${n} de dano`, { reacao: true }),
];
export const manobraPorId = (id: string) => MANOBRAS.find(x => x.id === id);

/** Manobras conhecidas por ranking: 3 Básicas em F, +1 em D, B e S. */
export const manobrasConhecidas = (reached: (r: string) => boolean) => reached("S") ? 6 : reached("B") ? 5 : reached("D") ? 4 : 3;

export const REGIOES = [
  { id: "cabeca", nome: "CABEÇA", comp: "Cabeça comprometida", efeito: "–1 de desvantagem em ações ofensivas e sem Reações ofensivas" },
  { id: "tronco", nome: "TRONCO", comp: "Tronco comprometido", efeito: "não pode recuperar PV nem reduzir o dano sofrido" },
  { id: "bracos", nome: "BRAÇOS", comp: "Braços comprometidos", efeito: "–1 de desvantagem em ataques e manobras de combate com esses membros" },
  { id: "pernas", nome: "PERNAS", comp: "Pernas comprometidas", efeito: "deslocamento pela metade e nenhum deslocamento sem gastar PA" },
] as const;

export const MODULACOES = [
  { id: "concentrar", nome: "Concentrar", icone: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v4M12 18v4M2 12h4M18 12h4", regra: "Escolha uma criatura afetada pela magia e some o resultado ao dano causado a ela.", composta: "Composta: numa magia que causa dano a uma só criatura, role duas vezes e use o maior.", efeito: (n: number) => `+${n} de dano numa criatura` },
  { id: "expandir", nome: "Expandir", icone: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7", regra: "Aumente uma das dimensões da área da magia em metros iguais à metade do resultado.", composta: "Composta: pode dividir os metros entre duas dimensões diferentes.", efeito: (n: number) => `+${Math.floor(n / 2)} m na área` },
  { id: "projetar", nome: "Projetar", icone: "M7 17 17 7M9 7h8v8", regra: "Aumente o alcance da magia em metros iguais ao resultado.", composta: "", efeito: (n: number) => `+${n} m de alcance` },
  { id: "conter", nome: "Conter", icone: "M12 3 5 6v6c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6Z", regra: "Escolha criaturas dentro da área, em número igual à metade do resultado, para que não sejam afetadas.", composta: "Composta: pode escolher as criaturas protegidas depois das ações defensivas delas.", efeito: (n: number) => `${Math.floor(n / 2)} ${Math.floor(n / 2) === 1 ? "criatura poupada" : "criaturas poupadas"}` },
] as const;

export const REGRAS = {
  composta: "Uma vez por rodada, aplique duas manobras diferentes à mesma ação, gastando um Dado de Manobra para cada. As duas precisam servir para a ação; você escolhe a ordem dos efeitos.",
  tecnica: "Nos testes de Atacar, você pode usar Mente no lugar de Corpo. Vale só para o acerto: Corpo continua somando ao dano corpo a corpo.",
  ponto: "Uma vez por rodada, ao acertar uma criatura, marque a região atingida até o fim da cena. Uma marca por criatura; marcar outra região substitui a anterior. Contra o Ponto Fraco: +1 de vantagem no acerto, você pode escolhê-lo como região atingida e o sucesso limitado não impõe –1 no dano.",
  comprometer: "Uma vez por rodada, ao acertar o Ponto Fraco, gaste um Dado de Manobra e some ao dano. A região fica Comprometida até o fim do próximo turno da criatura. Não conta como manobra.",
  belica: "Você pode aplicar manobras do Combatente às suas magias de Ataque, quando a manobra combina com o jeito como a magia é resolvida. Manobra que exige acerto vale depois que a magia causar dano a pelo menos uma criatura; o dano ou efeito extra afeta só uma das criaturas atingidas, à sua escolha.",
  modulacao: "Uma vez por rodada, ao conjurar uma magia de Ataque, gaste um Dado de Manobra e escolha uma Modulação. Com Modulação Composta (Ranking C), escolha duas diferentes: o mesmo dado e o mesmo resultado valem para as duas. Metades arredondam para baixo. Não conta como manobra.",
  originais: "Dados originais de dano: os que o próprio ataque fornece, antes de modificadores de margem, manobras ou outros efeitos. São eles que o Brutalista manipula.",
  postura: "Mão Pesada: uma vez por cena, durante seu turno, assuma a Postura Ofensiva sem gastar PA.",
  mao: "Uma vez por rodada, depois de rolar os dados originais de dano, escolha um deles e role de novo. Fica o maior dos dois resultados. Um máximo obtido assim pode ativar Dano Explosivo.",
  forcar: "Uma vez por rodada, depois de rolar os dados originais, gaste e role um Dado de Manobra: some o resultado a um dado original, até o máximo dele. Se chegar ao máximo, ativa Dano Explosivo; se a explosão já aconteceu neste ataque, gera uma segunda. Não conta como manobra.",
  explosivo: "Uma vez por rodada, quando um dado original sai no máximo, role outro dado do mesmo tipo e some ao dano. Com mais de um no máximo, escolha só um. O dado extra não explode de novo neste ranking.",
  percurso: "Percurso Livre: seu Manobrar desloca +5 m e não pede teste de Mobilidade. No percurso você pode atravessar espaços ocupados (sem terminar neles), correr por paredes e saltar sobre criaturas e obstáculos sem gastar deslocamento a mais.",
  aterrissagem: "Reduza qualquer queda em metros iguais ao seu Andar. Se isso evitar todo o dano, você aterrissa em pé e pode escolher um espaço livre a até 2 m de onde cairia.",
  vantagem: "Uma vez por rodada, a ação ofensiva feita de uma posição transitória recebe +1 de vantagem.",
  impulso: "Uma vez por rodada, na ação ofensiva feita de uma posição transitória: gaste e role um Dado de Manobra para reduzir o custo da ação em 1 PA (mínimo 1). Depois da ação, some o resultado em metros ao Manobrar que resta, mesmo se a ação falhar. Uma vez por cena, pode usar sem gastar o dado, rolando um dado do mesmo tipo para o deslocamento. Não conta como manobra.",
};

/** Rolagem de um dado de N faces (o valor vai para o motor, que só registra). */
export function rolarDado(faces: number) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 1 + (buf[0] % faces);
}
