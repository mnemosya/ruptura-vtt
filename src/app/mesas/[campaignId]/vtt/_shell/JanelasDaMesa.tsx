"use client";

/**
 * AS JANELAS DA MESA — quem está aberto, num lugar só.
 *
 * Elas nasceram dentro do `PainelVtt` porque as portas eram todas de
 * lá (a aba Participantes abre "Jogadores e convites", a aba
 * Personagens abre a lista inteira…). Agora o MENU DA MESA abre as
 * mesmas janelas, e ele vive no trilho de ferramentas, do outro lado
 * da tela — duas portas para o mesmo cômodo, com o estado numa delas.
 *
 * Então o estado sobe: o painel continua DESENHANDO as janelas, mas
 * quem sabe se estão abertas é este contexto. Nenhuma delas troca a
 * URL e nenhuma remonta o VTT — é o ponto da coisa toda, a mesa é a
 * única tela.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { RankingV12 } from "../../../../../lib/rulesetV12";

/** Cada janela que a mesa sabe abrir sem navegar. */
export type JanelaDaMesa =
  | "personagens"
  | "bando"
  | "compendio"
  | "participantes"
  | "convites"
  | "mercado"
  | "livro"
  | "conteudo"
  | "organizador"
  | "configuracoes"
  | "novo-personagem";

/** Personagem criado só com o nome, a ser completado pelo assistente v1.2. */
export interface PersonagemACompletar {
  characterId: string;
  nome: string;
}

/** Personagem já criado subindo até `alvo` na Forja de evolução. */
export interface PersonagemAEvoluir {
  characterId: string;
  alvo: RankingV12;
}

interface ValorJanelas {
  aberta: (janela: JanelaDaMesa) => boolean;
  abrir: (janela: JanelaDaMesa) => void;
  fechar: (janela: JanelaDaMesa) => void;
  /** Quando presente, "novo-personagem" abre completando este personagem. */
  completar: PersonagemACompletar | null;
  abrirCompletar: (alvo: PersonagemACompletar) => void;
  evolucao: PersonagemAEvoluir | null;
  /** Nulo fora da mesa: aí a ficha abre a Forja de evolução por conta própria. */
  abrirEvolucao: ((alvo: PersonagemAEvoluir) => void) | null;
  fecharEvolucao: () => void;
}

const Contexto = createContext<ValorJanelas | null>(null);

export function ProvedorJanelasDaMesa({ children }: { children: React.ReactNode }) {
  const [abertas, setAbertas] = useState<ReadonlySet<JanelaDaMesa>>(new Set());
  const [completar, setCompletar] = useState<PersonagemACompletar | null>(null);
  const [evolucao, setEvolucao] = useState<PersonagemAEvoluir | null>(null);
  const fecharEvolucao = useCallback(() => setEvolucao(null), []);

  const abrir = useCallback((janela: JanelaDaMesa) => {
    setAbertas((atual) => {
      if (atual.has(janela)) return atual;
      const proximo = new Set(atual);
      proximo.add(janela);
      return proximo;
    });
  }, []);

  const fechar = useCallback((janela: JanelaDaMesa) => {
    if (janela === "novo-personagem") setCompletar(null);
    setAbertas((atual) => {
      if (!atual.has(janela)) return atual;
      const proximo = new Set(atual);
      proximo.delete(janela);
      return proximo;
    });
  }, []);

  const abrirCompletar = useCallback((alvo: PersonagemACompletar) => {
    setCompletar(alvo);
    abrir("novo-personagem");
  }, [abrir]);

  const valor = useMemo<ValorJanelas>(
    () => ({ aberta: (j) => abertas.has(j), abrir, fechar, completar, abrirCompletar, evolucao, abrirEvolucao: setEvolucao, fecharEvolucao }),
    [abertas, abrir, fechar, completar, abrirCompletar, evolucao, fecharEvolucao],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Fora do provedor devolve um valor INERTE em vez de estourar: a
 * galeria de estilos monta o painel sozinho, e um contexto obrigatório
 * transformaria "quero ver o componente" em "monte a mesa inteira".
 */
const INERTE: ValorJanelas = { aberta: () => false, abrir: () => {}, fechar: () => {}, completar: null, abrirCompletar: () => {}, evolucao: null, abrirEvolucao: null, fecharEvolucao: () => {} };

export function useJanelasDaMesa(): ValorJanelas {
  return useContext(Contexto) ?? INERTE;
}
