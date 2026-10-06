/** Calendário Imperial: 12 meses de 30 dias, semanas D1–D6, sem timezone real. */
export const MESES_IMPERIAIS = ["Primen", "Dicen", "Tricen", "Caten", "Quinten", "Hexan", "Heptan", "Octan", "Noven", "Decan", "Undecan", "Dodecan"] as const;
export const REGIOES = ["Vastra", "Beldran", "Talesh", "Kravus", "Torvash"] as const;
export const VENTOS = ["calmo", "fraco", "moderado", "forte", "violento"] as const;
export const ESTACOES = ["inverno", "primavera", "verao", "outono"] as const;
export const CONDICOES_CLIMATICAS = [
  { id: "ceu_limpo", nome: "Céu limpo" }, { id: "parcialmente_nublado", nome: "Parcialmente nublado" },
  { id: "nublado", nome: "Nublado" }, { id: "neblina", nome: "Neblina" },
  { id: "chuva_leve", nome: "Chuva leve" }, { id: "chuva", nome: "Chuva" },
  { id: "chuva_forte", nome: "Chuva forte" }, { id: "tempestade", nome: "Tempestade" },
  { id: "neve_leve", nome: "Neve leve" }, { id: "neve", nome: "Neve" },
  { id: "nevasca", nome: "Nevasca" }, { id: "chuva_iridescente", nome: "Chuva iridescente" },
  { id: "nevoeiro_cristalino", nome: "Nevoeiro cristalino" }, { id: "tempestade_arcana", nome: "Tempestade arcana" },
] as const;
export type Regiao = typeof REGIOES[number];
export type Vento = typeof VENTOS[number];
export type Estacao = typeof ESTACOES[number];
export type Condicao = typeof CONDICOES_CLIMATICAS[number]["id"];
export const NOMES_VENTO: Record<Vento, string> = { calmo: "Calmo", fraco: "Fraco", moderado: "Moderado", forte: "Forte", violento: "Violento" };

export interface TempoCampanha {
  ano: number | null; mes: number | null; dia: number | null; hora: string | null;
  regiao: Regiao; condicao: Condicao; temperaturaC: number | null; temperaturaAlvoC: number | null;
  vento: Vento; aurora: boolean; descricao: string;
  climaDesdeMinuto: number | null; climaAteMinuto: number | null; weatherSeed: number;
  revision: number;
}
export const TEMPO_VAZIO: TempoCampanha = {
  ano: null, mes: null, dia: null, hora: null, regiao: "Vastra", condicao: "ceu_limpo",
  temperaturaC: null, temperaturaAlvoC: null, vento: "calmo", aurora: false, descricao: "",
  climaDesdeMinuto: null, climaAteMinuto: null, weatherSeed: 1, revision: 0,
};
export function estacaoDoMes(mes: number): Estacao {
  if (mes === 12 || mes <= 2) return "inverno";
  if (mes <= 5) return "primavera";
  if (mes <= 8) return "verao";
  return "outono";
}
export function minutoImperial(tempo: Pick<TempoCampanha, "ano" | "mes" | "dia" | "hora">): number | null {
  if (tempo.ano === null || tempo.mes === null || tempo.dia === null || tempo.hora === null) return null;
  if (!Number.isInteger(tempo.ano) || tempo.ano < 0 || tempo.ano > 9999 || !Number.isInteger(tempo.mes) || tempo.mes < 1 || tempo.mes > 12 || !Number.isInteger(tempo.dia) || tempo.dia < 1 || tempo.dia > 30 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(tempo.hora)) return null;
  const [h, m] = tempo.hora.split(":").map(Number);
  return (((tempo.ano * 12 + tempo.mes - 1) * 30 + tempo.dia - 1) * 24 + h) * 60 + m;
}
export function dataDeMinutoImperial(minuto: number): Pick<TempoCampanha, "ano" | "mes" | "dia" | "hora"> | null {
  if (!Number.isInteger(minuto) || minuto < 0 || minuto >= 10000 * 360 * 1440) return null;
  const indiceDia = Math.floor(minuto / 1440), minutoDia = minuto % 1440;
  return { ano: Math.floor(indiceDia / 360), mes: Math.floor((indiceDia % 360) / 30) + 1,
    dia: indiceDia % 30 + 1, hora: `${String(Math.floor(minutoDia / 60)).padStart(2, "0")}:${String(minutoDia % 60).padStart(2, "0")}` };
}
export function mudarMesImperial(ano: number, mes: number, deslocamento: number) {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(deslocamento) || mes < 1 || mes > 12) return null;
  const indice = ano * 12 + mes - 1 + deslocamento;
  return indice < 0 || indice >= 10000 * 12 ? null : { ano: Math.floor(indice / 12), mes: indice % 12 + 1 };
}
export function diaDaSemanaImperial(mes: number, dia: number): number { return ((mes - 1) * 30 + dia - 1) % 6 + 1; }
export function nomeCondicao(condicao: Condicao): string { return CONDICOES_CLIMATICAS.find((c) => c.id === condicao)?.nome ?? condicao; }
export function condicaoEspecial(condicao: Condicao): boolean { return ["chuva_iridescente", "nevoeiro_cristalino", "tempestade_arcana"].includes(condicao); }

export function validarTempo(t: TempoCampanha): string | null {
  if (!t || typeof t !== "object") return "Tempo inválido.";
  const partes = [t.ano, t.mes, t.dia, t.hora];
  if (partes.some((p) => p === null) && partes.some((p) => p !== null)) return "Informe ano, mês, dia e hora juntos.";
  if (t.ano !== null && (!Number.isInteger(t.ano) || t.ano < 0 || t.ano > 9999)) return "Ano inválido.";
  if (t.mes !== null && (!Number.isInteger(t.mes) || t.mes < 1 || t.mes > 12)) return "Mês inválido.";
  if (t.dia !== null && (!Number.isInteger(t.dia) || t.dia < 1 || t.dia > 30)) return "Dia inválido.";
  if (t.hora !== null && (typeof t.hora !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.hora))) return "Hora inválida.";
  if (!REGIOES.includes(t.regiao) || !CONDICOES_CLIMATICAS.some((c) => c.id === t.condicao) || !VENTOS.includes(t.vento)) return "Condição climática inválida.";
  for (const temp of [t.temperaturaC, t.temperaturaAlvoC]) if (temp !== null && (!Number.isFinite(temp) || temp < -100 || temp > 100)) return "Temperatura inválida.";
  if (typeof t.aurora !== "boolean" || typeof t.descricao !== "string" || t.descricao.length > 300) return "Detalhes do clima inválidos.";
  if (!Number.isInteger(t.weatherSeed) || t.weatherSeed < 0 || t.weatherSeed > 4294967295) return "Seed inválida.";
  for (const minuto of [t.climaDesdeMinuto, t.climaAteMinuto]) if (minuto !== null && (!Number.isInteger(minuto) || minuto < 0 || minuto >= 10000 * 360 * 1440)) return "Duração do clima inválida.";
  if (t.climaDesdeMinuto !== null && t.climaAteMinuto !== null && t.climaAteMinuto <= t.climaDesdeMinuto) return "Duração do clima inválida.";
  return null;
}

/** Pesos editoriais; as descrições regionais e estações vêm das decisões da campanha. */
const BASE: Record<Regiao, Partial<Record<Condicao, number>>> = {
  Vastra: { ceu_limpo: 10, parcialmente_nublado: 15, nublado: 22, neblina: 13, chuva_leve: 10, chuva: 12, chuva_forte: 3, tempestade: 2, neve_leve: 8, neve: 6, nevasca: 2 },
  Beldran: { ceu_limpo: 37, parcialmente_nublado: 28, nublado: 12, neblina: 6, chuva_leve: 9, chuva: 6, chuva_forte: 2, tempestade: 1 },
  Talesh: { ceu_limpo: 9, parcialmente_nublado: 13, nublado: 16, neblina: 10, chuva_leve: 12, chuva: 18, chuva_forte: 14, tempestade: 8 },
  Kravus: { ceu_limpo: 5, parcialmente_nublado: 7, nublado: 19, neblina: 12, neve_leve: 18, neve: 23, nevasca: 16 },
  Torvash: { ceu_limpo: 21, parcialmente_nublado: 10, nublado: 10, neblina: 6, chuva_leve: 7, chuva: 8, chuva_forte: 6, tempestade: 8, chuva_iridescente: 9, nevoeiro_cristalino: 7, tempestade_arcana: 8 },
};
const INSTABILIDADE: Record<Regiao, number> = { Beldran: 0.6, Vastra: 1, Kravus: 1, Talesh: 1.4, Torvash: 2.8 };
const TEMPERATURA_BASE: Record<Regiao, Record<Estacao, number>> = {
  Vastra: { inverno: -9, primavera: 5, verao: 13, outono: 4 },
  Beldran: { inverno: 13, primavera: 20, verao: 29, outono: 20 },
  Talesh: { inverno: 26, primavera: 28, verao: 30, outono: 28 },
  Kravus: { inverno: -32, primavera: -17, verao: -4, outono: -18 },
  Torvash: { inverno: 10, primavera: 20, verao: 29, outono: 19 },
};
const VENTO_POR_CONDICAO: Record<Condicao, readonly [Vento, number][]> = {
  ceu_limpo: [["calmo", 35], ["fraco", 45], ["moderado", 20]],
  parcialmente_nublado: [["calmo", 20], ["fraco", 45], ["moderado", 35]],
  nublado: [["fraco", 50], ["moderado", 50]], neblina: [["calmo", 55], ["fraco", 35], ["moderado", 10]],
  chuva_leve: [["fraco", 45], ["moderado", 45], ["forte", 10]],
  chuva: [["fraco", 20], ["moderado", 55], ["forte", 25]],
  chuva_forte: [["moderado", 45], ["forte", 55]],
  tempestade: [["forte", 60], ["violento", 40]],
  neve_leve: [["fraco", 50], ["moderado", 40], ["forte", 10]],
  neve: [["fraco", 20], ["moderado", 55], ["forte", 25]],
  nevasca: [["forte", 50], ["violento", 50]],
  chuva_iridescente: [["fraco", 20], ["moderado", 50], ["forte", 30]],
  nevoeiro_cristalino: [["calmo", 60], ["fraco", 40]],
  tempestade_arcana: [["moderado", 20], ["forte", 45], ["violento", 35]],
};
const FRIO = new Set<Condicao>(["neve_leve", "neve", "nevasca"]);
const CHUVA = new Set<Condicao>(["chuva_leve", "chuva", "chuva_forte", "tempestade", "chuva_iridescente", "tempestade_arcana"]);
const ADJACENTES: Partial<Record<Condicao, Condicao[]>> = {
  ceu_limpo: ["parcialmente_nublado", "nublado"], parcialmente_nublado: ["ceu_limpo", "nublado", "neblina"],
  nublado: ["parcialmente_nublado", "neblina", "chuva_leve", "neve_leve"],
  neblina: ["nublado", "parcialmente_nublado", "nevoeiro_cristalino"],
  chuva_leve: ["nublado", "chuva", "chuva_forte"], chuva: ["chuva_leve", "chuva_forte", "tempestade", "nublado"],
  chuva_forte: ["chuva", "tempestade", "chuva_leve"], tempestade: ["chuva_forte", "chuva", "tempestade_arcana"],
  neve_leve: ["nublado", "neve"], neve: ["neve_leve", "nevasca", "nublado"], nevasca: ["neve", "nublado"],
  chuva_iridescente: ["chuva", "chuva_forte", "tempestade_arcana"],
  nevoeiro_cristalino: ["neblina", "nublado", "tempestade_arcana"],
  tempestade_arcana: ["tempestade", "chuva_iridescente", "nevoeiro_cristalino"],
};
function proximaSeed(seed: number): number { return (Math.imul(1664525, seed) + 1013904223) >>> 0; }
export function geradorSeed(seed: number): () => number {
  let estado = seed >>> 0;
  estado = Math.imul(estado ^ (estado >>> 16), 0x7feb352d) >>> 0;
  estado = Math.imul(estado ^ (estado >>> 15), 0x846ca68b) >>> 0;
  estado = (estado ^ (estado >>> 16)) >>> 0;
  return () => { estado = proximaSeed(estado); return estado / 4294967296; };
}
function escolher<T>(itens: readonly [T, number][], random: () => number): T {
  const total = itens.reduce((n, [, peso]) => n + Math.max(0, peso), 0);
  let alvo = random() * total;
  for (const [valor, peso] of itens) { alvo -= Math.max(0, peso); if (alvo < 0) return valor; }
  return itens[itens.length - 1][0];
}
function pesoCondicao(regiao: Regiao, estacao: Estacao, hora: number, condicao: Condicao, anterior: Condicao): number {
  let peso = BASE[regiao][condicao] ?? 0;
  if (FRIO.has(condicao)) peso *= estacao === "inverno" ? 2.8 : estacao === "verao" ? (regiao === "Kravus" ? 0.75 : 0.12) : 1.1;
  if (regiao === "Beldran" && CHUVA.has(condicao)) peso *= estacao === "inverno" ? 2 : estacao === "verao" ? 0.2 : 0.8;
  if (regiao === "Vastra" && CHUVA.has(condicao)) peso *= estacao === "inverno" ? 0.55 : 1.2;
  if (regiao === "Talesh" && CHUVA.has(condicao)) peso *= estacao === "verao" || estacao === "primavera" ? 1.4 : 0.9;
  if (regiao === "Kravus" && CHUVA.has(condicao)) peso *= 0.05;
  if (condicao === "neblina" || condicao === "nevoeiro_cristalino") peso *= hora >= 4 && hora <= 9 ? 1.7 : 0.8;
  if (condicao === "ceu_limpo") peso *= hora >= 10 && hora <= 17 ? 1.2 : 0.9;
  if (condicao === anterior) peso *= regiao === "Torvash" ? 0.65 : 1.7;
  else if (ADJACENTES[anterior]?.includes(condicao)) peso *= regiao === "Torvash" ? 1.1 : 2.3;
  return peso;
}
export function temperaturaAlvo(t: Pick<TempoCampanha, "regiao" | "mes" | "hora" | "condicao">): number {
  const estacao = estacaoDoMes(t.mes ?? 1);
  const hora = Number((t.hora ?? "12:00").slice(0, 2));
  const diurno = Math.cos((hora - 15) * Math.PI / 12) * (t.regiao === "Talesh" ? 2 : 4);
  const ajuste = FRIO.has(t.condicao) ? (t.condicao === "nevasca" ? -7 : -4) :
    CHUVA.has(t.condicao) ? (t.condicao === "tempestade" || t.condicao === "tempestade_arcana" ? -3 : -2) :
    t.condicao === "ceu_limpo" && estacao === "verao" ? 3 : t.condicao === "nublado" ? -1 : 0;
  return Math.round(TEMPERATURA_BASE[t.regiao][estacao] + diurno + ajuste);
}
/** Sorteio coeso e reproduzível; preserva a data e a hora da campanha. */
export function sortearClima(seed: number, tempo: TempoCampanha): TempoCampanha {
  const agora = minutoImperial(tempo);
  if (agora === null || !REGIOES.includes(tempo.regiao)) throw new Error("Defina uma data imperial válida antes de sortear.");
  const random = geradorSeed(seed);
  const estacao = estacaoDoMes(tempo.mes!);
  const condicao = escolher(CONDICOES_CLIMATICAS.map(({ id }) => [id, pesoCondicao(tempo.regiao, estacao, Number(tempo.hora!.slice(0, 2)), id, tempo.condicao)] as [Condicao, number]), random);
  const baseHoras = condicao === "nevasca" && tempo.regiao === "Kravus" ? 48 : condicao === "tempestade" || condicao === "tempestade_arcana" ? 6 : 18;
  const duracao = Math.max(60, Math.round((baseHoras * (0.65 + random() * 0.85) / INSTABILIDADE[tempo.regiao]) * 60));
  const vento = escolher(VENTO_POR_CONDICAO[condicao], random);
  const alvo = temperaturaAlvo({ ...tempo, condicao });
  return { ...tempo, condicao, vento, temperaturaC: tempo.temperaturaC ?? alvo,
    temperaturaAlvoC: alvo, climaDesdeMinuto: agora,
    climaAteMinuto: agora >= 10000 * 360 * 1440 - 1 ? null : Math.min(agora + duracao, 10000 * 360 * 1440 - 1), weatherSeed: proximaSeed(seed),
    aurora: false };
}
export function definirClimaManual(tempo: TempoCampanha, condicao: Condicao): TempoCampanha {
  const agora = minutoImperial(tempo);
  const alvo = temperaturaAlvo({ ...tempo, condicao });
  return { ...tempo, condicao, vento: VENTO_POR_CONDICAO[condicao][0][0], temperaturaC: alvo, temperaturaAlvoC: alvo,
    climaDesdeMinuto: agora, climaAteMinuto: agora === null || agora >= 10000 * 360 * 1440 - 1 ? null : Math.min(agora + Math.round(18 * 60 / INSTABILIDADE[tempo.regiao]), 10000 * 360 * 1440 - 1) };
}
/** Edições diretas estabelecem um novo contexto; avanço do relógio usa a evolução gradual. */
export function ajustarContextoManual(tempo: TempoCampanha, campos: Partial<Pick<TempoCampanha, "ano" | "mes" | "dia" | "hora" | "regiao">>): TempoCampanha {
  const novo = { ...tempo, ...campos };
  const agora = minutoImperial(novo);
  if (agora === null) return novo;
  const duracao = tempo.climaDesdeMinuto !== null && tempo.climaAteMinuto !== null
    ? tempo.climaAteMinuto - tempo.climaDesdeMinuto : 1080;
  const alvo = temperaturaAlvo(novo);
  return { ...novo, temperaturaC: alvo, temperaturaAlvoC: alvo, climaDesdeMinuto: agora,
    climaAteMinuto: agora >= 10000 * 360 * 1440 - 1 ? null : Math.min(agora + Math.max(60, duracao), 10000 * 360 * 1440 - 1) };
}
/** Avanço gradual: condições mudam apenas quando sua duração termina. */
export function avancarTempoImperial(tempo: TempoCampanha, minutos: number): TempoCampanha | null {
  const inicio = minutoImperial(tempo);
  if (inicio === null || !Number.isInteger(minutos) || minutos < 0 || validarTempo(tempo)) return null;
  const fim = inicio + minutos;
  const dataFinal = dataDeMinutoImperial(fim);
  if (!dataFinal) return null;
  let estado = { ...tempo }, cursor = inicio;
  while (cursor < fim) {
    const proximaTransicao = estado.climaAteMinuto !== null && estado.climaAteMinuto > cursor ? estado.climaAteMinuto : fim;
    const proximo = Math.min(fim, proximaTransicao, Math.floor(cursor / 60) * 60 + 60);
    const data = dataDeMinutoImperial(proximo)!;
    const alvoBaseAnterior = temperaturaAlvo(estado);
    const alvoBaseNovo = temperaturaAlvo({ ...estado, ...data });
    const alvoAnterior = estado.temperaturaAlvoC ?? alvoBaseAnterior;
    const alvo = Math.max(-100, Math.min(100, alvoAnterior + alvoBaseNovo - alvoBaseAnterior));
    const anterior = estado.temperaturaC ?? alvoAnterior;
    const deltaMaximo = (proximo - cursor) / 60;
    const temperaturaC = Math.round((anterior + Math.sign(alvoAnterior - anterior) * Math.min(Math.abs(alvoAnterior - anterior), deltaMaximo)) * 100) / 100;
    estado = { ...estado, ...data, temperaturaC, temperaturaAlvoC: alvo };
    cursor = proximo;
    if (cursor < fim && estado.climaAteMinuto !== null && cursor >= estado.climaAteMinuto) {
      estado = sortearClima(estado.weatherSeed, estado);
    }
  }
  if (estado.climaAteMinuto !== null && fim >= estado.climaAteMinuto) estado = sortearClima(estado.weatherSeed, estado);
  return { ...estado, ...dataFinal };
}
