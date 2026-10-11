/** Inventário tabular do Mercado Noturno v1.2 para revisão; não publica itens. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { slugify } from "../../../src/lib/contentSchema/slug";

type Trecho = { texto: string };
type Bloco = { id: string; tipo: string; texto?: string; celulas?: Trecho[][]; filhos?: Bloco[] };
type Categoria = { id: string; titulo: string; editadoEm: string; blocos: Bloco[] };
type Fonte = { extraidoEm: string; capitulo: { id: string; editadoEm: string }; categorias: Categoria[] };

const raiz = resolve("content/v12");
const fonte = JSON.parse(await readFile(resolve(raiz, "fontes_notion/mercadorias.json"), "utf8")) as Fonte;
const normalizar = (s: string) => slugify(s).replaceAll("_", " ");
const celula = (trechos: Trecho[] | undefined) => (trechos ?? []).map((t) => t.texto).join("").trim();
function lerPreco(texto: string) {
  const match = texto.trim().match(/^(?:Ⱥ\s*)?(\d[\d.]*)(?:\s*Ⱥ)?(?:\s+(por unidade|pelo conjunto|por região))?$/i);
  return { preco_numerico: match ? Number(match[1].replaceAll(".", "")) : null, preco_qualificador: match?.[2] ?? null };
}
const faltas: string[] = [];
const duplicados: string[] = [];
const contagem: Record<string, number> = {};

const mercadorias = fonte.categorias.flatMap((categoria) => {
  const detalhes: { bloco: Bloco; caminho: string[] }[] = [];
  const tabelas: { bloco: Bloco; caminho: string[] }[] = [];
  function visitar(blocos: Bloco[], caminho: string[]) {
    for (const bloco of blocos) {
      if (bloco.tipo === "table") tabelas.push({ bloco, caminho });
      if ((bloco.tipo === "toggle" || bloco.tipo === "heading_3") && bloco.texto) detalhes.push({ bloco, caminho });
      visitar(bloco.filhos ?? [], bloco.texto && /^heading_|^toggle$/.test(bloco.tipo) ? [...caminho, bloco.texto] : caminho);
    }
  }
  visitar(categoria.blocos, []);

  const itens = [];
  for (const { bloco: tabela, caminho } of tabelas) {
    const [cabecalho, ...linhas] = tabela.filhos ?? [];
    const colunas = cabecalho?.celulas?.map(celula) ?? [];
    if (!colunas.some((c) => normalizar(c) === "raridade") || !colunas.some((c) => normalizar(c).startsWith("preco"))) continue;
    for (const linha of linhas) {
      const valores = linha.celulas?.map(celula) ?? [];
      const nome = valores[0]?.trim();
      if (!nome) { faltas.push(`${categoria.titulo}: linha ${linha.id} sem nome`); continue; }
      const campos = Object.fromEntries(colunas.map((chave, i) => [chave, valores[i] ?? ""]));
      const slug = `${slugify(categoria.titulo)}_${slugify(nome)}`;
      const nomeNorm = normalizar(nome);
      const equivalentes = detalhes.filter(({ bloco: d }) => {
        const titulo = normalizar(d.texto ?? "");
        return titulo === nomeNorm || [
          "drone", "drone de", "robo", "robo de", "runa", "runa de", "runa do", "runa da",
          "flecha", "flecha de", "celula", "celula de",
        ].some((prefixo) => titulo === `${prefixo} ${nomeNorm}`);
      });
      const mesmaSecao = equivalentes.filter((d) => JSON.stringify(d.caminho) === JSON.stringify(caminho));
      const detalhe = (mesmaSecao.length === 1 ? mesmaSecao : equivalentes).length === 1
        ? (mesmaSecao.length === 1 ? mesmaSecao : equivalentes)[0].bloco : null;
      const campoPreco = colunas.find((c) => normalizar(c).startsWith("preco"))!;
      const preco = campos[campoPreco] ?? "";
      itens.push({
        id: linha.id, slug_sugerido: slug, nome, categoria: categoria.titulo,
        tipo_tabela: colunas[0], secao: caminho, campos,
        raridade: campos[colunas.find((c) => normalizar(c) === "raridade")!] ?? "",
        preco_texto: preco, ...lerPreco(preco),
        detalhe_bloco_id: detalhe?.id ?? null,
        detalhe_blocos: detalhe?.filhos ?? null,
        fonte: { paginaNotionId: categoria.id, paginaEditadaEm: categoria.editadoEm, tabelaBlocoId: tabela.id, linhaBlocoId: linha.id },
      });
    }
  }
  const jaVinculados = new Set(itens.map((item) => item.detalhe_bloco_id).filter(Boolean));
  for (const { bloco, caminho } of detalhes) {
    if (bloco.tipo !== "toggle" || jaVinculados.has(bloco.id)) continue;
    const precoLinha = bloco.filhos?.find((filho) => /^Pre[cç]o:\s*/i.test(filho.texto ?? ""))?.texto;
    if (!precoLinha) continue;
    const preco = precoLinha.replace(/^Pre[cç]o:\s*/i, "").trim();
    const descriptor = bloco.filhos?.[0]?.texto ?? "";
    const raridade = descriptor.match(/\b(Muito Comum|Comum|Incomum|Muito Raro|Raro)\b/i)?.[0] ?? "";
    const nome = bloco.texto ?? "";
    itens.push({
      id: bloco.id, slug_sugerido: `${slugify(categoria.titulo)}_${slugify(nome)}`, nome,
      categoria: categoria.titulo, tipo_tabela: "Verbete sem tabela", secao: caminho,
      campos: { Raridade: raridade, "Preço": preco }, raridade, preco_texto: preco,
      ...lerPreco(preco),
      detalhe_bloco_id: bloco.id, detalhe_blocos: bloco.filhos ?? null,
      fonte: { paginaNotionId: categoria.id, paginaEditadaEm: categoria.editadoEm, tabelaBlocoId: null, linhaBlocoId: bloco.id },
    });
  }
  // A tabela técnica do verbete DECK SINÁPTICO repete as três versões já
  // oferecidas na tabela comercial. Vincula os dados, sem criar novos produtos.
  if (categoria.titulo === "ESCALPOS") {
    for (const versao of ["Civil", "Corporativo", "Imperial"]) {
      const comercial = itens.find((i) => i.nome === `Deck Sináptico ${versao}`);
      const tecnico = itens.find((i) => i.nome === versao && i.tipo_tabela === "Versão" && i.secao.at(-1) === "DECK SINÁPTICO");
      if (!comercial || !tecnico || comercial.preco_numerico !== tecnico.preco_numerico || comercial.raridade !== tecnico.raridade) {
        throw new Error(`Tabelas de Deck Sináptico divergiram para a versão ${versao}; revisar fonte.`);
      }
      Object.assign(comercial, {
        tabela_tecnica: tecnico.campos,
        tabela_tecnica_fonte: tecnico.fonte,
      });
      itens.splice(itens.indexOf(tecnico), 1);
    }
  }
  contagem[categoria.titulo] = itens.length;
  return itens;
});

// Nomes como Faca e runas de mesmo nome existem em mais de uma seção.
// O ID do bloco é a identidade de origem; o slug sugerido inclui a seção nesses casos.
const porSlug = new Map<string, typeof mercadorias>();
for (const item of mercadorias) porSlug.set(item.slug_sugerido, [...(porSlug.get(item.slug_sugerido) ?? []), item]);
for (const [slug, grupo] of porSlug) {
  if (grupo.length < 2) continue;
  for (const item of grupo) {
    const secao = item.secao[0] ? slugify(item.secao[0]) : "geral";
    item.slug_sugerido = `${slugify(item.categoria)}_${secao}_${slugify(item.nome)}`;
  }
  if (new Set(grupo.map((i) => i.slug_sugerido)).size !== grupo.length) {
    duplicados.push(`${slug}: ${grupo.map((i) => i.id).join(", ")}`);
    for (const item of grupo) item.slug_sugerido = `${item.slug_sugerido}_${item.id.slice(0, 6)}`;
  }
}

const resultado = {
  _meta: {
    ruleset_version: "1.2",
    origem: "Notion: capítulo MERCADO NOTURNO, bloco LISTA DE MERCADORIAS e suas páginas",
    extraido_em: fonte.extraidoEm,
    capitulo_notion_id: fonte.capitulo.id,
    capitulo_editado_em: fonte.capitulo.editadoEm,
    total_mercadorias: mercadorias.length,
    aviso: "Inventário de tabelas com Raridade e Preço, mais verbetes avulsos com Preço. As três linhas da tabela técnica de Deck Sináptico foram vinculadas às mesmas versões na tabela comercial. Requer classificação editorial e modelagem antes da publicação.",
  },
  por_categoria: contagem,
  mercadorias,
  excecoes: { linhas_sem_nome: faltas, slugs_duplicados: duplicados },
};
await writeFile(resolve(raiz, "db_mercadorias_v1_2_rascunho.json"), `${JSON.stringify(resultado, null, 2)}\n`);
console.log(`${mercadorias.length} mercadorias:`, contagem);
console.log(`${mercadorias.filter((m) => m.detalhe_bloco_id).length} com verbete vinculado; ${duplicados.length} colisões de slug resolvidas com ID; ${faltas.length} linhas sem nome.`);
