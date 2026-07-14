/**
 * Opções dinâmicas vindas da Biblioteca real (`character_rule`
 * singleton) para popular selects do Construtor de Efeitos — tipos de
 * dano, perícias, atributos. Nunca hardcoda essas listas (elas já
 * existem na Biblioteca e podem mudar); busca uma vez no servidor e
 * repassa como prop para os componentes client.
 */

import { getCharacterRules } from "../content/queries";

export interface TipoDanoOption {
  id: string;
  nome: string;
  subtipos: string[];
}

export interface PericiaOption {
  id: string;
  nome: string;
}

export interface AtributoOption {
  id: string;
  nome: string;
}

export interface OpcoesDeRegras {
  tiposDano: TipoDanoOption[];
  pericias: PericiaOption[];
  atributos: AtributoOption[];
}

function asRecordArray(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor) ? valor.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null) : [];
}

export async function getOpcoesDeRegras(): Promise<OpcoesDeRegras> {
  const doc = await getCharacterRules().catch(() => null);
  const payload = (doc?.payload as Record<string, unknown>) ?? {};

  const tiposDano = asRecordArray(payload.tipos_dano).map((t) => ({
    id: String(t.id ?? ""),
    nome: String(t.nome ?? t.id ?? ""),
    subtipos: Array.isArray(t.subtipos) ? t.subtipos.filter((s): s is string => typeof s === "string") : [],
  }));

  const pericias = asRecordArray(payload.pericias).map((p) => ({ id: String(p.id ?? p.slug ?? ""), nome: String(p.nome ?? p.id ?? "") }));
  const atributos = asRecordArray(payload.atributos).map((a) => ({ id: String(a.id ?? a.slug ?? ""), nome: String(a.nome ?? a.id ?? "") }));

  return { tiposDano, pericias, atributos };
}
