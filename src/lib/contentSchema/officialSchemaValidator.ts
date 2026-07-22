/**
 * Validador de schema oficial em tempo real (Etapa 11).
 *
 * Auditoria: NENHUMA validação contra os schemas oficiais (`content/
 * schema_*.json`) rodava em produção antes desta etapa — só existia
 * como técnica de verificação em scripts de desenvolvimento
 * (`scripts/dev/validate-*.mjs`), usando um avaliador mínimo de JSON
 * Schema reescrito a cada etapa. Este módulo é a PRIMEIRA vez que essa
 * validação roda dentro do próprio app (import), reaproveitando
 * exatamente o mesmo avaliador mínimo (subconjunto: type/enum/const/
 * pattern/required/properties/additionalProperties/items/allOf-if-then/
 * anyOf/$ref) — nunca uma biblioteca externa (`npm install` fora de
 * escopo desta etapa).
 *
 * Só roda em servidor (usa `node:fs`) — nunca importado por um
 * Client Component.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { ContentTypePacote } from "./contentPackage";

const REPO_ROOT = process.cwd();

interface EntradaSchema {
  arquivo: string;
  /** Caminho (chaves separadas por ".") até o array de documentos dentro do schema raiz. */
  caminhoArray: string[];
}

/** Só os 4 tipos editáveis têm schema oficial mapeado nesta etapa — os demais (somente leitura) não são validados contra schema aqui (preservados como estão, sem reescrita). */
const SCHEMAS_POR_TIPO: Partial<Record<ContentTypePacote, EntradaSchema>> = {
  spell: { arquivo: "schema_magias_v1_3.json", caminhoArray: ["properties", "magias"] },
  talent: { arquivo: "schema_talentos_v1_3.json", caminhoArray: ["properties", "talentos"] },
  item: { arquivo: "schema_equipamentos_v1_2.json", caminhoArray: ["properties", "itens"] },
  rune: { arquivo: "schema_runas_v1_2.json", caminhoArray: ["properties", "runas"] },
};

const cacheSchemas = new Map<string, Record<string, unknown>>();

function carregarSchema(arquivo: string): Record<string, unknown> {
  const existente = cacheSchemas.get(arquivo);
  if (existente) return existente;
  const bruto = readFileSync(path.join(REPO_ROOT, "content", arquivo), "utf8");
  const schema = JSON.parse(bruto) as Record<string, unknown>;
  cacheSchemas.set(arquivo, schema);
  return schema;
}

function navegar(obj: Record<string, unknown>, caminho: string[]): Record<string, unknown> {
  let atual: unknown = obj;
  for (const chave of caminho) atual = (atual as Record<string, unknown>)[chave];
  return atual as Record<string, unknown>;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function resolverRef(ref: string, raiz: Record<string, unknown>): Record<string, unknown> {
  let atual: unknown = raiz;
  for (const parte of ref.replace(/^#\//, "").split("/")) atual = (atual as Record<string, unknown>)[parte];
  return atual as Record<string, unknown>;
}

/** Avaliador mínimo de JSON Schema — mesmo subconjunto usado nos harnesses de verificação de todas as etapas anteriores, agora reutilizado em produção (import). */
function validar(schema: Record<string, unknown>, valor: unknown, caminho: string, erros: string[], raiz: Record<string, unknown>): void {
  if (schema.$ref) {
    validar(resolverRef(schema.$ref as string, raiz), valor, caminho, erros, raiz);
    return;
  }
  if (schema.const !== undefined) {
    if (valor !== schema.const) erros.push(`${caminho}: esperado const ${JSON.stringify(schema.const)}`);
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(valor)) erros.push(`${caminho}: valor ${JSON.stringify(valor)} fora do enum`);
  if (schema.pattern && typeof valor === "string" && !new RegExp(schema.pattern as string).test(valor)) erros.push(`${caminho}: não bate com o padrão`);
  if (schema.type) {
    const tipos = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    const t = typeOf(valor);
    const bate = tipos.some((esperado) => esperado === t || (esperado === "integer" && t === "number" && Number.isInteger(valor)));
    if (!bate) erros.push(`${caminho}: tipo ${t} não está em ${JSON.stringify(tipos)}`);
  }
  if (valor && typeof valor === "object" && !Array.isArray(valor) && (schema.type === "object" || schema.properties)) {
    const props = (schema.properties as Record<string, unknown>) ?? {};
    for (const campo of (schema.required as string[]) ?? []) if (!(campo in (valor as Record<string, unknown>))) erros.push(`${caminho}: campo obrigatório "${campo}" ausente`);
    if (schema.additionalProperties === false) {
      const permitidas = new Set(Object.keys(props));
      for (const chave of Object.keys(valor as Record<string, unknown>)) if (!permitidas.has(chave)) erros.push(`${caminho}.${chave}: chave NÃO permitida`);
    }
    for (const [chave, sub] of Object.entries(props)) {
      if (chave in (valor as Record<string, unknown>)) validar(sub as Record<string, unknown>, (valor as Record<string, unknown>)[chave], `${caminho}.${chave}`, erros, raiz);
    }
  }
  if (schema.type === "array" && Array.isArray(valor)) {
    if (typeof schema.minItems === "number" && valor.length < schema.minItems) erros.push(`${caminho}: mínimo ${schema.minItems} itens`);
    if (schema.items) valor.forEach((item, i) => validar(schema.items as Record<string, unknown>, item, `${caminho}[${i}]`, erros, raiz));
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf as Record<string, unknown>[]) {
      if (sub.if) {
        const errosIf: string[] = [];
        validar(sub.if as Record<string, unknown>, valor, caminho, errosIf, raiz);
        if (errosIf.length === 0 && sub.then) validar(sub.then as Record<string, unknown>, valor, caminho, erros, raiz);
      } else {
        validar(sub, valor, caminho, erros, raiz);
      }
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const algumBate = (schema.anyOf as Record<string, unknown>[]).some((sub) => {
      const e: string[] = [];
      validar(sub, valor, caminho, e, raiz);
      return e.length === 0;
    });
    if (!algumBate) erros.push(`${caminho}: nenhuma alternativa de anyOf satisfeita`);
  }
}

/**
 * Valida UM payload de documento contra o schema oficial do seu
 * content_type (só os 4 tipos editáveis têm schema mapeado — os demais
 * devolvem `{ok:true, semSchema:true}`, nunca inventando validação).
 */
export function validarContraSchemaOficial(contentType: ContentTypePacote, payload: unknown): { ok: boolean; erros: string[]; semSchema?: boolean } {
  const entrada = SCHEMAS_POR_TIPO[contentType];
  if (!entrada) return { ok: true, erros: [], semSchema: true };
  const schemaRaiz = carregarSchema(entrada.arquivo);
  const schemaItem = (navegar(schemaRaiz, entrada.caminhoArray) as Record<string, unknown>).items as Record<string, unknown>;
  const erros: string[] = [];
  validar(schemaItem, payload, "$", erros, schemaRaiz);
  return { ok: erros.length === 0, erros };
}
