/** Normaliza a lista canônica de cada Vertente para revisão editorial. Não publica nem automatiza efeitos. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { slugify } from "../../../src/lib/contentSchema/slug";

type Bloco = { id: string; tipo: string; texto?: string; trechos?: unknown[]; celulas?: { texto: string }[][]; filhos?: Bloco[] };
type MagiaFonte = { id: string; titulo: string; blocos: Bloco[] };
type Nivel = { nivel: number; magias: MagiaFonte[]; outros: Bloco[] };
type Vertente = { id: string; titulo: string; editadoEm: string; niveis: Nivel[] };
type Fonte = { extraidoEm: string; capitulo: { id: string; editadoEm: string }; vertentes: Vertente[] };
type CustoMana = { tipo: "fixo"; valor: number; texto: string } | { tipo: "intervalo"; min: number; max: number; texto: string } | { tipo: "variavel"; texto: string };
type Conjuracao = { tipo: "pa"; pa: number; texto: string } | { tipo: "reacao"; texto: string } | { tipo: "tempo"; minutos: number; texto: string } | { tipo: "variavel"; texto: string };

const raiz = resolve("content/v12");
const fonte = JSON.parse(await readFile(resolve(raiz, "fontes_notion/magias.json"), "utf8")) as Fonte;
const excecoes: string[] = [];
const usados = new Set<string>();

function cabecalho(titulo: string): { nome: string; custo_mana: CustoMana; conjuracao: Conjuracao } {
  const match = titulo.trim().match(/^(.*?)\s+(?:(\d+(?:\s*[–-]\s*\d+)?)\s+MANA|MANA\s+VARI[AÁ]VEL)\s+(.+)$/i);
  if (!match) throw new Error(`Título de magia não reconhecido: ${titulo}`);
  const [, nome, mana, tempo] = match;
  const custoMana: CustoMana = mana
    ? mana.includes("–") || mana.includes("-")
      ? (() => { const [min, max] = mana.split(/[–-]/).map(Number); return { tipo: "intervalo", min, max, texto: mana }; })()
      : { tipo: "fixo", valor: Number(mana), texto: mana }
    : { tipo: "variavel", texto: "Mana variável" };
  const t = tempo.trim();
  const pa = t.match(/^(\d+)\s+PA$/i);
  const duracao = t.match(/^(\d+)\s+(MINUTOS?|HORAS?)$/i);
  const conjuracao: Conjuracao = pa ? { tipo: "pa", pa: Number(pa[1]), texto: t }
    : /^REA[CÇ][AÃ]O$/i.test(t) ? { tipo: "reacao", texto: t }
    : duracao ? { tipo: "tempo", minutos: Number(duracao[1]) * (/HORA/i.test(duracao[2]) ? 60 : 1), texto: t }
    : { tipo: "variavel", texto: t };
  return { nome: nome.trim(), custo_mana: custoMana, conjuracao };
}

function campos(blocos: Bloco[], referencia: string) {
  const esperados = ["Nível", "Tipo", "Alcance", "Duração", "Pré-requisito"];
  const encontrados: Record<string, string> = {};
  const corpo: Bloco[] = [];
  for (const bloco of blocos) {
    const match = bloco.tipo === "paragraph" ? bloco.texto?.match(/^([^:]+):\s*(.*)$/s) : null;
    if (match && esperados.includes(match[1])) {
      if (encontrados[match[1]] !== undefined) excecoes.push(`${referencia}: campo ${match[1]} duplicado`);
      encontrados[match[1]] = match[2].trim();
    } else corpo.push(bloco);
  }
  for (const campo of esperados) if (!encontrados[campo]) excecoes.push(`${referencia}: campo ${campo} ausente`);
  return { encontrados, corpo };
}

function linhasTabela(blocos: Bloco[]): string[][] {
  return blocos.filter((b) => b.tipo === "table").flatMap((t) => (t.filhos ?? []).map((r) => (r.celulas ?? []).map((c) => c.map((v) => v.texto).join("").trim())));
}

function escolhasEspeciais(slug: string, custoMana: CustoMana, conjuracao: Conjuracao, corpo: Bloco[]) {
  let escolhaMana: Record<string, unknown> | null = null;
  let escolhaTempo: Record<string, unknown> | null = null;
  if (custoMana.tipo === "intervalo") escolhaMana = { tipo: "valor_no_intervalo", min: custoMana.min, max: custoMana.max };
  if (custoMana.tipo === "variavel" && slug === "energetica_modulacao") {
    const [cab, ...linhas] = linhasTabela(corpo);
    if (cab?.join("|") !== "Nível|Escala|Área afetada|Alcance|Mana" || linhas.length !== 5) throw new Error("Tabela de Mana de Modulação mudou; revisar transcrição.");
    escolhaMana = { tipo: "nivel_com_tabela", limite: "nivel_atual_energetica", opcoes: linhas.map((l) => ({ nivel: Number(l[0]), escala: l[1], area: l[2], alcance: l[3], mana: Number(l[4]) })) };
  }
  if (custoMana.tipo === "variavel" && slug === "sinaptica_mergulho") escolhaMana = { tipo: "investimento_livre", recurso_gerado: "RAM", nota: "A fonte não declara um mínimo; a escolha deve ser explícita ao conjurar." };
  if (conjuracao.tipo === "variavel" && slug === "material_linha_de_demolicao") {
    const [cab, ...linhas] = linhasTabela(corpo);
    if (cab?.join("|") !== "Escala|Exemplos|Tempo" || linhas.length !== 3) throw new Error("Tabela de tempo de Linha de Demolição mudou; revisar transcrição.");
    const minutos = (s: string) => {
      const m = s.match(/^(\d+)\s+(minuto|hora)s?$/i);
      if (!m) throw new Error(`Tempo variável não reconhecido: ${s}`);
      return Number(m[1]) * (/hora/i.test(m[2]) ? 60 : 1);
    };
    escolhaTempo = { tipo: "escala_com_tabela", opcoes: linhas.map((l) => ({ escala: l[0], exemplos: l[1], tempo: l[2], minutos: minutos(l[2]) })) };
  }
  if (custoMana.tipo !== "fixo" && !escolhaMana) excecoes.push(`${slug}: custo de Mana exige escolha sem contrato`);
  if (conjuracao.tipo === "variavel" && !escolhaTempo) excecoes.push(`${slug}: tempo de conjuração variável sem contrato`);
  return { escolha_mana: escolhaMana, escolha_tempo: escolhaTempo };
}

const magias = fonte.vertentes.flatMap((vertente) => vertente.niveis.flatMap((nivel) => nivel.magias.map((original) => {
  const vertenteId = slugify(vertente.titulo);
  const cab = cabecalho(original.titulo);
  const slug = `${vertenteId}_${slugify(cab.nome)}`;
  if (usados.has(slug)) throw new Error(`Slug duplicado: ${slug}`);
  usados.add(slug);
  const { encontrados, corpo } = campos(original.blocos, slug);
  const nivelDeclarado = Number(encontrados["Nível"]);
  if (nivelDeclarado !== nivel.nivel) excecoes.push(`${slug}: nível ${nivel.nivel} na seção, ${encontrados["Nível"]} no corpo`);
  if (!corpo.some((b) => b.texto?.trim())) excecoes.push(`${slug}: corpo vazio`);
  const escolhas = escolhasEspeciais(slug, cab.custo_mana, cab.conjuracao, corpo);
  return {
    slug, nome: cab.nome, vertente: vertenteId, nivel: nivel.nivel, nivel_declarado_no_corpo: nivelDeclarado,
    tipo: encontrados.Tipo, alcance: encontrados.Alcance, duracao: encontrados["Duração"],
    prerequisito: encontrados["Pré-requisito"],
    custo_mana: cab.custo_mana, conjuracao: cab.conjuracao, ...escolhas,
    corpo, status: "draft",
    fonte: { paginaNotionId: vertente.id, blocoNotionId: original.id, paginaEditadaEm: vertente.editadoEm, tituloOriginal: original.titulo },
  };
})));
magias.sort((a, b) => a.vertente.localeCompare(b.vertente) || a.nivel - b.nivel || a.nome.localeCompare(b.nome, "pt-BR"));

const resultado = {
  _meta: {
    ruleset_version: "1.2",
    origem: "Notion: capítulo MAGIA E VERTENTES, bloco LISTA DE MAGIAS de cada Vertente",
    extraido_em: fonte.extraidoEm,
    capitulo_notion_id: fonte.capitulo.id,
    capitulo_editado_em: fonte.capitulo.editadoEm,
    total: magias.length,
    aviso: "Rascunho de transcrição. Texto preservado; efeitos, custos variáveis e equivalências legadas exigem revisão antes da publicação.",
  },
  magias,
  excecoes,
};
await writeFile(resolve(raiz, "db_magias_v1_2_vertentes_rascunho.json"), `${JSON.stringify(resultado, null, 2)}\n`);
console.log(`${magias.length} magias transcritas; ${excecoes.length} exceções estruturais.`);
for (const e of excecoes) console.log(`  ${e}`);
