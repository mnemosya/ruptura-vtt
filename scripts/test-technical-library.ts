/**
 * Teste puro (sem Supabase) da Biblioteca Técnica (Propriedades/Runas/
 * Escalpos) — checkpoint v0.53. Lê os 3 DBs reais para confirmar
 * normalização/busca/agrupamento genéricos, sem catálogo manual
 * hardcoded no helper nem no teste.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeTechnicalContentItem,
  searchTechnicalContent,
  groupTechnicalContentByCategory,
  listTechnicalContentCategories,
  formatTechnicalContentField,
  describeTechnicalContentEffects,
  type TechnicalContentItem,
} from "../src/lib/content";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("=== test-technical-library ===\n");

const propriedadesDb = readJson<{ propriedades: Record<string, unknown>[] }>("content/db_propriedades_normalizado_v1.json");
const runasDb = readJson<{ runas: Record<string, unknown>[] }>("content/db_runas_normalizado_v1_2.json");
const escalposDb = readJson<{ escalpos: Record<string, unknown>[] }>("content/db_escalpos_normalizado_v1_3.json");

const propriedades: TechnicalContentItem[] = propriedadesDb.propriedades.map(normalizeTechnicalContentItem);
const runas: TechnicalContentItem[] = runasDb.runas.map(normalizeTechnicalContentItem);
const escalpos: TechnicalContentItem[] = escalposDb.escalpos.map(normalizeTechnicalContentItem);

assert.ok(propriedades.length >= 10, "Catálogo real de propriedades deve ter pelo menos 10 registros.");
assert.ok(runas.length >= 30, "Catálogo real de runas deve ter pelo menos 30 registros.");
assert.ok(escalpos.length >= 50, "Catálogo real de escalpos deve ter pelo menos 50 registros.");

// -------------------------------------------------------------
// 1. Normalização de payload completo — campos reais preservados,
//    nada inventado, nenhum catálogo manual (dados vêm 100% do JSON lido).
// -------------------------------------------------------------
const alcance = propriedades.find((p) => p.slug === "alcance");
assert.ok(alcance, "Propriedade 'alcance' deve existir no DB real.");
assert.equal(alcance!.nome, "Alcance");
assert.equal(alcance!.categoria, "propriedade_arma");
assert.equal(alcance!.categoriaLabel, "Propriedade de Arma");
assert.ok(alcance!.descricaoCurta && alcance!.descricaoCurta.length > 0);
assert.deepEqual(alcance!.tags, ["arma", "ofensiva", "movimento"]);
assert.equal(alcance!.preco, null, "Propriedades não têm preço no DB real — deve ficar null, nunca inventado.");
assert.ok(alcance!.payloadAutomacao, "payload_automacao deve ser preservado bruto.");
assert.equal(alcance!.raw.id, "alcance", "raw deve preservar o registro original completo.");

const runaRetratil = runas.find((r) => r.slug === "runa_cac_retratil");
assert.ok(runaRetratil, "Runa 'runa_cac_retratil' deve existir no DB real.");
assert.equal(runaRetratil!.preco, 500, "Runas têm preço numérico real no DB — deve vir do payload.");
assert.equal(runaRetratil!.raridade, "comum");
assert.equal(runaRetratil!.raridadeLabel, "Comum");

const rpi = escalpos.find((e) => e.slug === "rpi_oficial");
assert.ok(rpi, "Escalpo 'rpi_oficial' deve existir no DB real.");
assert.equal(rpi!.preco, 0, "Preço 0 é um valor real (gratuito), diferente de null (ausente) — não deve virar null.");
assert.deepEqual(rpi!.requisitos, [], "requisitos vazio deve ser preservado como array vazio, não descartado.");
console.log("1. Normalização de payload completo (3 catálogos reais) — OK");

// -------------------------------------------------------------
// 2. Payload incompleto — só nome cai em fallback; nada quebra, nada é inventado.
// -------------------------------------------------------------
const vazio = normalizeTechnicalContentItem({});
assert.equal(vazio.nome, "Sem nome");
assert.equal(vazio.preco, null);
assert.deepEqual(vazio.tags, []);
assert.equal(vazio.categoria, undefined);
assert.equal(vazio.payloadAutomacao, undefined);
assert.deepEqual(vazio.raw, {});

const soSlug = normalizeTechnicalContentItem({ slug: "so-slug" });
assert.equal(soSlug.nome, "so-slug", "Sem 'nome', cai no slug — nunca lança erro.");
assert.equal(soSlug.id, "so-slug", "Sem 'id', cai no slug também.");

const payloadMalformado = normalizeTechnicalContentItem({
  id: "x",
  nome: "X",
  tags: "não é array",
  preco: "não é número",
  categoria_label: 123,
  payload_automacao: { efeitos: "não é array" },
});
assert.deepEqual(payloadMalformado.tags, [], "tags malformado vira array vazio, não lança erro.");
assert.equal(payloadMalformado.preco, null, "preco malformado vira null, nunca um número inventado.");
assert.equal(payloadMalformado.categoriaLabel, undefined, "categoria_label de tipo errado é ignorado, não convertido.");
assert.deepEqual(describeTechnicalContentEffects(payloadMalformado), [], "efeitos malformado (não-array) devolve lista vazia, nunca quebra.");
console.log("2. Payload incompleto/malformado — fallback defensivo, nada inventado, nada quebra — OK");

// -------------------------------------------------------------
// 3. Busca por nome/slug/descrição/tag.
// -------------------------------------------------------------
const porNome = searchTechnicalContent(propriedades, "alcance");
assert.ok(porNome.some((p) => p.slug === "alcance"), "Busca por nome deve encontrar 'Alcance'.");

const porSlug = searchTechnicalContent(runas, "runa_cac_retratil");
assert.ok(porSlug.some((r) => r.slug === "runa_cac_retratil"), "Busca por slug deve funcionar.");

const porTag = searchTechnicalContent(propriedades, "ofensiva");
assert.ok(porTag.some((p) => p.slug === "alcance"), "Busca por tag ('ofensiva') deve encontrar a propriedade.");

const porDescricaoMaiuscula = searchTechnicalContent(escalpos, "SINAPTICO");
assert.ok(porDescricaoMaiuscula.some((e) => e.slug === "rpi_oficial"), "Busca deve ser case-insensitive (maiúsculas) e encontrar trecho da descrição de 'rpi_oficial'.");
const semResultado = searchTechnicalContent(escalpos, "termo-que-nao-existe-em-nenhum-registro-xyz");
assert.equal(semResultado.length, 0, "Busca sem correspondência deve devolver lista vazia, nunca lançar erro.");

assert.deepEqual(searchTechnicalContent(propriedades, ""), propriedades, "Busca vazia devolve a lista inteira.");
console.log("3. Busca por nome/slug/tag/descrição — OK");

// -------------------------------------------------------------
// 4. Agrupamento por categoria — nenhum item omitido, "Sem categoria" para ausentes.
// -------------------------------------------------------------
const gruposEscalpos = groupTechnicalContentByCategory(escalpos);
const totalAgrupado = [...gruposEscalpos.values()].reduce((sum, arr) => sum + arr.length, 0);
assert.equal(totalAgrupado, escalpos.length, "Agrupar não pode perder nem duplicar itens.");
assert.ok(gruposEscalpos.has("Identidade"), "Categoria 'Identidade' (categoria_label de rpi_oficial) deve existir no agrupamento.");

const categoriasRunas = listTechnicalContentCategories(runas);
assert.ok(categoriasRunas.length > 0, "Runas devem ter categorias listáveis para filtro.");

const semCategoria = groupTechnicalContentByCategory([normalizeTechnicalContentItem({ id: "y", nome: "Y" })]);
assert.ok(semCategoria.has("Sem categoria"), "Item sem categoria cai no grupo 'Sem categoria', nunca é descartado.");
console.log("4. Agrupamento por categoria (sem perda de itens, fallback 'Sem categoria') — OK");

// -------------------------------------------------------------
// 5. formatTechnicalContentField — nunca quebra com array/objeto/null,
//    nunca despeja JSON bruto (é 1 linha legível).
// -------------------------------------------------------------
assert.equal(formatTechnicalContentField(null), "");
assert.equal(formatTechnicalContentField(undefined), "");
assert.equal(formatTechnicalContentField(2), "2");
assert.equal(formatTechnicalContentField(true), "true");
assert.equal(formatTechnicalContentField(["a", "b"]), "a, b");
const linha = formatTechnicalContentField({ tipo: "modificador", valor: -1, alvo_tags: ["visao"] });
assert.ok(linha.startsWith("modificador"), "Objeto com 'tipo' deve começar a linha pelo tipo.");
assert.ok(!linha.includes("{"), "Nunca deve parecer JSON bruto (sem chaves/colchetes de objeto).");
console.log("5. formatTechnicalContentField nunca quebra e nunca despeja JSON bruto — OK");

// -------------------------------------------------------------
// 6. Efeitos reais dos 3 catálogos viram resumo legível (payload_automacao.efeitos).
// -------------------------------------------------------------
const efeitosAlcance = describeTechnicalContentEffects(alcance!);
assert.ok(efeitosAlcance.length >= 1, "Propriedade 'Alcance' deve ter pelo menos 1 efeito resumido.");
assert.ok(efeitosAlcance[0].includes("alterar_alcance_arma"));

const efeitosRuna = describeTechnicalContentEffects(runaRetratil!);
assert.ok(efeitosRuna.length >= 1, "Runa deve ter pelo menos 1 efeito resumido.");

const efeitosEscalpo = describeTechnicalContentEffects(rpi!);
assert.ok(efeitosEscalpo.length >= 1, "Escalpo deve ter pelo menos 1 efeito resumido.");
console.log("6. Efeitos reais dos 3 catálogos (propriedades/runas/escalpos) resumidos como texto legível — OK");

// -------------------------------------------------------------
// 7. Nenhum catálogo manual hardcoded — os nomes vêm 100% do JSON lido em runtime.
// -------------------------------------------------------------
const helperSrc = readFileSync("src/lib/content/technicalLibrary.ts", "utf8");
assert.ok(!/Alcance|Retrátil|Registro Pessoal Imperial/i.test(helperSrc), "O helper não deve conter nomes de itens específicos hardcoded.");
console.log("7. Nenhum catálogo manual hardcoded no helper (nomes vêm só do JSON em runtime) — OK");

console.log("\ntest-technical-library — todos os cenários passaram.");
