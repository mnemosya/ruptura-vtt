/**
 * Fichas de EXEMPLO dos protótipos. Nomes e números fictícios; os
 * Atributos (Corpo, Mente, Ânimo) e as Perícias são os do sistema
 * (`content/db_regras_personagem_normalizado_v1_4.json`), com valores
 * de 0 a 5. A Ilya repete o exemplo do cap. 13 (Corpo 2, Mobilidade 3).
 */

export type AtributoId = "corpo" | "mente" | "animo";

export interface Atributo { id: AtributoId; nome: string; valor: number }
export interface Pericia { id: string; nome: string; valor: number; atributo: AtributoId }

export interface Personagem {
  id: string;
  nome: string;
  /** Usado pela bancada para testar quebra de layout. */
  nomeLongo: string;
  sigla: string;
  /** Magista rola o Dado Normal e o Dado de Sobrecarga, sempre. */
  magista: boolean;
  atributos: Atributo[];
  pericias: Pericia[];
}

const atributos = (corpo: number, mente: number, animo: number): Atributo[] => [
  { id: "corpo", nome: "Corpo", valor: corpo },
  { id: "mente", nome: "Mente", valor: mente },
  { id: "animo", nome: "Ânimo", valor: animo },
];

export const PERSONAGENS: Personagem[] = [
  {
    id: "ilya",
    nome: "Ilya",
    nomeLongo: "Ilyana Varonskaya-Delacroix",
    sigla: "ILY",
    magista: true,
    atributos: atributos(2, 3, 1),
    pericias: [
      { id: "mobilidade", nome: "Mobilidade", valor: 3, atributo: "corpo" },
      { id: "furtividade", nome: "Furtividade", valor: 2, atributo: "corpo" },
      { id: "reflexos", nome: "Reflexos", valor: 2, atributo: "corpo" },
      { id: "arcanismo", nome: "Arcanismo", valor: 3, atributo: "mente" },
      { id: "tecnomagia", nome: "Tecnomagia", valor: 2, atributo: "mente" },
      { id: "percepcao", nome: "Percepção", valor: 1, atributo: "mente" },
      { id: "psicologia", nome: "Psicologia", valor: 1, atributo: "mente" },
      { id: "vontade", nome: "Vontade", valor: 2, atributo: "animo" },
      { id: "influencia", nome: "Influência", valor: 1, atributo: "mente" },
    ],
  },
  {
    id: "doran",
    nome: "Doran",
    nomeLongo: "Doran Kellerman-Aszódy",
    sigla: "DOR",
    magista: false,
    atributos: atributos(3, 1, 2),
    pericias: [
      { id: "luta", nome: "Luta", valor: 3, atributo: "corpo" },
      { id: "balistica", nome: "Balística", valor: 2, atributo: "corpo" },
      { id: "vigor", nome: "Vigor", valor: 2, atributo: "corpo" },
      { id: "mobilidade", nome: "Mobilidade", valor: 1, atributo: "corpo" },
      { id: "intimidacao", nome: "Intimidação", valor: 2, atributo: "animo" },
      { id: "engenharia", nome: "Engenharia", valor: 1, atributo: "mente" },
      { id: "percepcao", nome: "Percepção", valor: 1, atributo: "mente" },
    ],
  },
];
