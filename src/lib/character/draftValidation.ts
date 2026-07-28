/**
 * Draft persistente do wizard de criação de personagem — validação de
 * runtime do payload vindo do banco (checkpoint draft persistente).
 *
 * `character_creation_drafts.payload` é `jsonb` sem schema enforcement
 * do Postgres além de "é JSON válido" — o valor pode ter sido gravado
 * por uma versão anterior do client, corrompido, ou (em tese) forjado
 * por uma chamada direta à RPC. `parseDraftPayload` nunca lança: calls
 * inválidas devolvem `null`, e quem chama (`loadCharacterCreationDraft`,
 * `src/lib/character/storage.ts`) traduz isso para
 * `{ kind: "invalid" }` — nunca para "nenhum draft" (`{ kind: "none" }`,
 * reservado estritamente para "nenhuma linha encontrada").
 *
 * Só guarda ESCOLHAS mínimas (slugs/quantidades/níveis) — nunca dados
 * derivados de conteúdo canônico (preço, nome). `carteira`/`inventario`
 * são reconstruídos no client a partir do conteúdo efetivo ATUAL
 * (replay de `purchaseItem`, `inventory.ts`), nunca lidos daqui.
 */

export interface DraftIdentidade {
  nome: string;
  alcunha: string;
  conceito: string;
  origem: string;
  idioma: string;
  afiliacao: string;
}

export interface DraftItemEscolhido {
  itemSlug: string;
  quantidade: number;
}

export interface DraftPayload {
  schema_version: 1;
  step: number;
  identidade: DraftIdentidade;
  atributos: Record<string, number>;
  pericias: Record<string, number>;
  niveisVertente: Record<string, number>;
  magiasEscolhidas: string[];
  talentoNivelIdEscolhido: string;
  itensEscolhidos: DraftItemEscolhido[];
}

/** Payload de wizard nunca passa de poucos KB em uso legítimo — teto generoso contra abuso, não um limite de produto. */
const MAX_SERIALIZED_LENGTH = 200_000;
const IDENTIDADE_CAMPOS = ["nome", "alcunha", "conceito", "origem", "idioma", "afiliacao"] as const;

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIdentidade(raw: unknown): DraftIdentidade | null {
  if (!isPlainObject(raw)) return null;
  const identidade: Partial<DraftIdentidade> = {};
  for (const campo of IDENTIDADE_CAMPOS) {
    const valor = raw[campo];
    if (typeof valor !== "string") return null;
    identidade[campo] = valor;
  }
  return identidade as DraftIdentidade;
}

function parseNumberRecord(raw: unknown): Record<string, number> | null {
  if (!isPlainObject(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isFiniteInteger(value)) return null;
    out[key] = value;
  }
  return out;
}

function parseStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every((item) => typeof item === "string")) return null;
  return raw as string[];
}

function parseItensEscolhidos(raw: unknown): DraftItemEscolhido[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DraftItemEscolhido[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const { itemSlug, quantidade } = item;
    if (typeof itemSlug !== "string" || itemSlug.length === 0) return null;
    if (!isFiniteInteger(quantidade) || quantidade <= 0) return null;
    out.push({ itemSlug, quantidade });
  }
  return out;
}

/** Nunca lança — payload malformado/incompatível devolve `null` (fail-open). */
export function parseDraftPayload(raw: unknown): DraftPayload | null {
  try {
    if (JSON.stringify(raw).length > MAX_SERIALIZED_LENGTH) return null;
  } catch {
    return null;
  }

  if (!isPlainObject(raw)) return null;
  if (raw.schema_version !== 1) return null;
  if (!isFiniteInteger(raw.step) || raw.step < 1 || raw.step > 7) return null;

  const identidade = parseIdentidade(raw.identidade);
  if (!identidade) return null;

  const atributos = parseNumberRecord(raw.atributos);
  if (!atributos) return null;

  const pericias = parseNumberRecord(raw.pericias);
  if (!pericias) return null;

  const niveisVertente = parseNumberRecord(raw.niveisVertente);
  if (!niveisVertente) return null;

  const magiasEscolhidas = parseStringArray(raw.magiasEscolhidas);
  if (!magiasEscolhidas) return null;

  if (typeof raw.talentoNivelIdEscolhido !== "string") return null;

  const itensEscolhidos = parseItensEscolhidos(raw.itensEscolhidos);
  if (!itensEscolhidos) return null;

  return {
    schema_version: 1,
    step: raw.step,
    identidade,
    atributos,
    pericias,
    niveisVertente,
    magiasEscolhidas,
    talentoNivelIdEscolhido: raw.talentoNivelIdEscolhido,
    itensEscolhidos,
  };
}
