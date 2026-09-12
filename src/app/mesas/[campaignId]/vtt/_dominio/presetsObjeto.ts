/**
 * Presets de OBJETO TÁTICO — funções e dados PUROS.
 *
 * Fonte das regras: `docs/fontes/16 COMBATE` → COBERTURA.
 *
 * GRAUS (o texto dá os exemplos, e são eles que definem cada preset):
 *   • parcial — "metade do corpo ou mais ainda visível (ex.: atrás de
 *     carros baixos, mesas, balcões ou janelas abertas)";
 *   • maior   — "apenas uma parte mínima do corpo exposta (ex.: atrás
 *     de uma coluna larga, esquina ou porta entreaberta)";
 *   • total   — "corpo completamente protegido (ex.: atrás de uma
 *     parede sólida ou barricada alta)".
 *
 * DURABILIDADE (tabela oficial):
 *   • Frágil     2 a 5 PD  — porta de compensado, mesa de plástico…
 *   • Média      6 a 15 PD — porta maciça, balcão de granito, carro popular…
 *   • Resistente 16+ PD    — muro de tijolo, portão de ferro, concreto…
 *
 * O preset é um PONTO DE PARTIDA plausível, não uma trava: o narrador
 * altera qualquer campo depois. O que os testes garantem é que nenhum
 * padrão nasce FORA da faixa oficial da própria categoria — errar isso
 * calado seria pior que não ter preset.
 */

import type { CategoriaObjeto, GrauCoberturaObjeto, PresetObjeto } from "../../../../../lib/vtt/sceneStorage";

/** Faixa oficial de PD por categoria (`max: null` = "16+", sem teto). */
export const FAIXA_PD_POR_CATEGORIA: Record<CategoriaObjeto, { min: number; max: number | null }> = {
  fragil: { min: 2, max: 5 },
  media: { min: 6, max: 15 },
  resistente: { min: 16, max: null },
};

export interface DefinicaoPreset {
  rotulo: string;
  /** Chave visual reaproveitada do renderizador que já existe (`APARENCIA_OBJETO`). */
  aparencia: "conteiner" | "veiculo" | "entulho" | "muro" | "barril" | "grade" | "banca";
  bloqueiaMovimento: boolean;
  /** Só faz sentido quando NÃO bloqueia — entulho é o caso: atravessa, mas custa o dobro. */
  terrenoProjetado: "dificil" | null;
  grauCobertura: GrauCoberturaObjeto | null;
  categoria: CategoriaObjeto | null;
  pd: number | null;
  /** Frase curta do porquê destes padrões — mostrada ao escolher o preset. */
  nota: string;
}

export const PRESETS_OBJETO: Record<PresetObjeto, DefinicaoPreset> = {
  muro: {
    rotulo: "Muro", aparencia: "muro",
    bloqueiaMovimento: true, terrenoProjetado: null,
    grauCobertura: "total", categoria: "resistente", pd: 20,
    nota: "Parede sólida: cobertura total; muro de tijolo é resistente (16+ PD).",
  },
  porta: {
    rotulo: "Porta", aparencia: "muro",
    bloqueiaMovimento: true, terrenoProjetado: null,
    grauCobertura: "maior", categoria: "media", pd: 10,
    nota: "Porta entreaberta dá cobertura maior; porta maciça é categoria média.",
  },
  caixa: {
    rotulo: "Caixa / contêiner", aparencia: "conteiner",
    bloqueiaMovimento: true, terrenoProjetado: null,
    grauCobertura: "parcial", categoria: "fragil", pd: 5,
    nota: "Caixas empilhadas: cobertura parcial, material frágil.",
  },
  entulho: {
    rotulo: "Entulho", aparencia: "entulho",
    // O caso que prova a separação entre bloquear e encarecer: dá pra
    // atravessar, mas o passo custa o dobro.
    bloqueiaMovimento: false, terrenoProjetado: "dificil",
    grauCobertura: "parcial", categoria: "fragil", pd: 4,
    nota: "Não bloqueia: atravessa como terreno difícil, com cobertura parcial.",
  },
  mesa: {
    rotulo: "Mesa / balcão", aparencia: "banca",
    bloqueiaMovimento: true, terrenoProjetado: null,
    grauCobertura: "parcial", categoria: "fragil", pd: 3,
    nota: "Mesas e balcões são exemplo de cobertura parcial; mesa comum é frágil.",
  },
  veiculo: {
    rotulo: "Veículo", aparencia: "veiculo",
    bloqueiaMovimento: true, terrenoProjetado: null,
    grauCobertura: "parcial", categoria: "media", pd: 10,
    nota: "Carro baixo dá cobertura parcial; carro popular é categoria média.",
  },
  barricada: {
    rotulo: "Barricada", aparencia: "conteiner",
    bloqueiaMovimento: true, terrenoProjetado: null,
    grauCobertura: "total", categoria: "media", pd: 12,
    nota: "Barricada alta protege o corpo inteiro; improvisada, fica na categoria média.",
  },
  coluna: {
    rotulo: "Coluna", aparencia: "muro",
    bloqueiaMovimento: true, terrenoProjetado: null,
    grauCobertura: "maior", categoria: "resistente", pd: 18,
    nota: "Coluna larga expõe só parte mínima do corpo; concreto é resistente.",
  },
  grade: {
    rotulo: "Grade / portão", aparencia: "grade",
    bloqueiaMovimento: true, terrenoProjetado: null,
    grauCobertura: "parcial", categoria: "resistente", pd: 16,
    nota: "Vê-se através (cobertura parcial), mas portão de ferro é resistente.",
  },
  // A CHAVE continua `personalizado` — é valor persistido em
  // `vtt_objects.preset`. Só o rótulo mudou pra "Livre".
  personalizado: {
    rotulo: "Livre", aparencia: "entulho",
    bloqueiaMovimento: true, terrenoProjetado: null,
    // Sem cobertura e sem PD de propósito: quem escolhe "livre" está
    // dizendo que vai preencher à mão. Inventar número aqui só criaria
    // um valor errado que ninguém pediu.
    grauCobertura: null, categoria: null, pd: null,
    nota: "Bloqueia a passagem. Cobertura e durabilidade nascem vazias — você define depois de criar.",
  },
};

/** Campos que a criação envia ao servidor para um preset (PD atual nasce cheio). */
export function valoresIniciaisDoPreset(preset: PresetObjeto): {
  nome: string;
  bloqueiaMovimento: boolean;
  terrenoProjetado: "dificil" | null;
  grauCobertura: GrauCoberturaObjeto | null;
  categoria: CategoriaObjeto | null;
  pd: number | null;
  pdMax: number | null;
} {
  const d = PRESETS_OBJETO[preset];
  return {
    nome: d.rotulo,
    bloqueiaMovimento: d.bloqueiaMovimento,
    terrenoProjetado: d.terrenoProjetado,
    grauCobertura: d.grauCobertura,
    categoria: d.categoria,
    pd: d.pd,
    pdMax: d.pd,
  };
}

/** `true` se o PD cabe na faixa OFICIAL da categoria. `null` em qualquer um dos dois = nada a validar. */
export function pdDentroDaFaixa(categoria: CategoriaObjeto | null, pd: number | null): boolean {
  if (categoria === null || pd === null) return true;
  const faixa = FAIXA_PD_POR_CATEGORIA[categoria];
  return pd >= faixa.min && (faixa.max === null || pd <= faixa.max);
}
