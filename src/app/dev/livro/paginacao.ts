"use client";

/**
 * PAGINAÇÃO — quantas páginas cada capítulo ocupa e em que página cai
 * cada título e verbete.
 *
 * Quem compõe é o `compositor`; aqui ficam os resultados. A contagem e as
 * âncoras são guardadas (por capítulo e data de edição), então os números
 * de página aparecem de imediato numa segunda visita.
 * É uma loja externa (`useSyncExternalStore`) para que só os números de
 * página se redesenhem quando um capítulo novo é medido — o miolo, que
 * é pesado, não.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import { VERSAO_LAYOUT, par, type Caderno } from "./modelo";

export interface Medida {
  /** Data de edição do capítulo medido. */
  v: string;
  /** Páginas de texto corrido (sem contar a abertura). */
  n: number;
  /** Âncora → página do texto corrido (0 = primeira página de texto). */
  a: Record<string, number>;
}

const CHAVE = `lv-medidas-${VERSAO_LAYOUT}`;


export class LojaPaginacao {
  private medidas = new Map<string, Medida>();
  /** Páginas compostas (HTML), só em memória: recompõe ao abrir o capítulo. */
  private compostas = new Map<string, string[]>();
  private ouvintes = new Set<() => void>();
  private inicios: (number | null)[] | null = null;
  private gravar: ReturnType<typeof setTimeout> | null = null;
  versao = 0;
  /** Páginas do índice remissivo (depende da busca). */
  paginasIndice = 2;

  constructor(readonly cadernos: Caderno[]) {}

  assinar = (f: () => void) => { this.ouvintes.add(f); return () => { this.ouvintes.delete(f); }; };
  lerVersao = () => this.versao;

  private avisar() {
    this.versao++;
    this.inicios = null;
    for (const f of this.ouvintes) f();
  }

  carregar() {
    try {
      const bruto = window.localStorage.getItem(CHAVE);
      if (!bruto) return;
      const validas = new Map(this.cadernos.flatMap((c) => (c.tipo === "capitulo" ? [[c.id, c.linha.editadoEm] as const] : [])));
      for (const [id, m] of Object.entries(JSON.parse(bruto) as Record<string, Medida>)) {
        if (validas.get(id) === m.v) this.medidas.set(id, m);
      }
      this.avisar();
    } catch { /* medidas guardadas ilegíveis: mede de novo */ }
  }

  medida(id: string): Medida | undefined { return this.medidas.get(id); }
  paginasCompostas(id: string): string[] | undefined { return this.compostas.get(id); }

  /** Guarda um capítulo composto: as páginas ficam em memória, a contagem e as âncoras vão para o disco. */
  guardar(id: string, v: string, paginas: string[], ancoras: Record<string, number>) {
    this.compostas.set(id, paginas);
    const antes = this.medidas.get(id);
    this.definir(id, { v, n: paginas.length, a: ancoras });
    // Mesma medida de antes: `definir` não avisou, mas agora há páginas para mostrar.
    if (antes && this.medidas.get(id) === antes) this.avisar();
  }

  definir(id: string, m: Medida) {
    const antes = this.medidas.get(id);
    if (antes && antes.v === m.v && antes.n === m.n && Object.keys(antes.a).length === Object.keys(m.a).length && Object.entries(m.a).every(([k, col]) => antes.a[k] === col)) return;
    this.medidas.set(id, m);
    this.avisar();
    if (this.gravar) clearTimeout(this.gravar);
    this.gravar = setTimeout(() => {
      try { window.localStorage.setItem(CHAVE, JSON.stringify(Object.fromEntries(this.medidas))); } catch { /* sem espaço: mede de novo na próxima visita */ }
    }, 800);
  }

  definirPaginasIndice(n: number) {
    if (n === this.paginasIndice) return;
    this.paginasIndice = n;
    this.avisar();
  }

  /** Páginas do caderno (sempre par); `null` enquanto o capítulo não foi medido. */
  paginasDe(i: number): number | null {
    const c = this.cadernos[i];
    if (!c) return null;
    if (c.tipo === "frente") return 2;
    if (c.tipo === "indice") return par(this.paginasIndice);
    const m = this.medidas.get(c.id);
    return m ? 2 + par(m.n) : null;
  }

  /**
   * Número da primeira página (a da esquerda) do caderno `i`. A folha de
   * rosto é a página 0 e o Sumário a 1: página par à esquerda, ímpar à
   * direita, como em livro. `null` enquanto algum capítulo anterior não
   * foi medido.
   */
  inicioDe(i: number): number | null {
    if (!this.inicios) {
      this.inicios = [];
      let soma: number | null = 0;
      for (let k = 0; k < this.cadernos.length; k++) {
        this.inicios.push(soma);
        const n = this.paginasDe(k);
        soma = soma == null || n == null ? null : soma + n;
      }
    }
    return this.inicios[i] ?? null;
  }

  indiceDe(id: string): number { return this.cadernos.findIndex((c) => c.id === id); }

  /** Página (dentro do caderno) onde cai uma âncora; `null` se ainda não medida. */
  paginaDaAncora(id: string, ancora: string): number | null {
    const col = this.medidas.get(id)?.a[ancora];
    return col == null ? null : 2 + col;
  }

  /** Número de página, como impresso, de um destino do livro. */
  numeroDe(id: string, ancora?: string): number | null {
    const i = this.indiceDe(id);
    const inicio = i < 0 ? null : this.inicioDe(i);
    if (inicio == null) return null;
    if (!ancora) return inicio;
    const p = this.paginaDaAncora(id, ancora);
    return p == null ? null : inicio + p;
  }

  /** Quantos capítulos ainda faltam medir. */
  faltam(): number {
    return this.cadernos.filter((c) => c.tipo === "capitulo" && !this.medidas.has(c.id)).length;
  }
}

export const ContextoPaginacao = createContext<LojaPaginacao | null>(null);

/** A loja, redesenhando quem chama a cada medida nova. */
export function usePaginacao(): LojaPaginacao {
  const loja = useContext(ContextoPaginacao);
  if (!loja) throw new Error("usePaginacao fora do livro");
  useSyncExternalStore(loja.assinar, loja.lerVersao, () => 0);
  return loja;
}
