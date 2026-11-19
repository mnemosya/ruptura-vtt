"use client";

/**
 * ESTADO DOS PROTÓTIPOS — no lugar das server actions
 * (`registrarRolagemPericiaAction` e afins) e da ficha lida do banco.
 *
 * Uma rolagem congela a ficha no clique (`TesteCongelado`), pede os
 * dados à mesa e vira registro (o "cartão" do chat de mentira). Trocar e
 * desfazer mexem no registro e no conduto (Sobrecarga, Integridade,
 * Rupturas) — sempre pela regra de `regra.ts`, nunca por conta própria.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode,
} from "react";
import {
  aplicarTroca, custoDaTroca, distribuirD4, resolverTeste, reverterTroca,
  type Alvo, type Conduto, type CustoTroca, type Resolucao, type TrocaAplicada,
} from "./regra";
import { PERSONAGENS, type Personagem } from "./personagens";
import { useMesa, type MesaApi } from "./MesaDupla";
import type { Aparencia } from "./materiais";
import { aquecerArena, type DadoArena, type EstadoDado, type Pose } from "./ArenaDupla";

export type Papel = "rola" | "observa";
export type Natureza = "normal" | "sobrecarga";
export type Visibilidade = "public" | "private" | "gm";

export interface TesteCongelado {
  personagemId: string;
  nome: string;
  sigla: string;
  magista: boolean;
  atributo: { nome: string; valor: number };
  pericia: { nome: string; valor: number } | null;
  modificador: number;
  alvo: Alvo;
  visibilidade: Visibilidade;
}

export interface Rolagem {
  id: string;
  n: number;
  criadaEm: number;
  teste: TesteCongelado;
  /** `rolando` → `normal` (o Normal assentou) → `completa` (os dois assentaram). */
  fase: "rolando" | "normal" | "completa";
  normal: number | null;
  sobrecarga: number | null;
  troca: TrocaAplicada | null;
  /**
   * Troca feita com a perda de Integridade AINDA rolando na mesa (as
   * consequências se resolvem depois da ação, cap. 18): o resultado já
   * vale pelo Sobrecarga, a perda chega quando os d4 assentarem.
   */
  perdaPendente: { d4: number; antes: Conduto } | null;
  trocadaEm: number | null;
  /** A bancada dizia "já houve uma substituição nesta ação" quando rolou. */
  substituicaoNaAcao: boolean;
  forca: number;
  dados: DadoArena[];
  poses: Record<string, Pose> | null;
  rotulos: Record<string, number[]> | null;
}

export interface Forcar { ativo: boolean; normal: number; sobrecarga: number; perda: number | null }

export interface Telemetria {
  cargaMs: number | null;
  forca: number | null;
  normalMs: number | null;
  sobrecargaMs: number | null;
  quedaMs: number | null;
  fpsMedio: number | null;
  fpsMinimo: number | null;
  preSimMs: number | null;
  trocaMs: number | null;
  custoMedioMs: number | null;
  custoPiorMs: number | null;
  semPintura: boolean;
}

export interface Proposta {
  id: "a" | "b" | "c" | "d" | "e";
  letra: "A" | "B" | "C" | "D" | "E";
  nome: string;
  /** Classe de escopo do CSS da proposta, posta na raiz. */
  classe: string;
  aparencias: {
    normal: Aparencia;
    /** O Sobrecarga pode mudar com o conduto (proposta B). */
    sobrecarga: (c: Conduto) => Aparencia;
    /** d4 da perda de Integridade, quando a proposta os rola na mesa. */
    perda?: Aparencia;
  };
  /** Estado visual do Sobrecarga quando assenta (padrão `reserva`). */
  estadoSobrecarga?: EstadoDado;
  /** Etiqueta de quem rolou acompanhando os dados. */
  etiquetaNaMesa?: boolean;
  /** Os d4 da perda de Integridade caem na mesa (senão, sorteio silencioso). */
  perdaNaMesa?: boolean;
  /** Reação da mesa 3D à troca e ao desfazer. */
  aoTrocar?: (r: Rolagem, mesa: MesaApi) => void;
  aoDesfazer?: (r: Rolagem, mesa: MesaApi) => void;
  /** Peças da janela que a proposta desenha. */
  Pool: ComponentType;
  Resultado: ComponentType;
  Cartao: ComponentType<{ r: Rolagem }>;
  /** Camada própria sobre a mesa (rótulos, gatilhos). */
  Extras?: ComponentType;
  /**
   * Superfície própria no lugar da janela "Rolar Dados" (propostas D e
   * E): a proposta desenha a composição do teste e o resultado do zero,
   * para quem rola e, se quiser, para quem observa. `Pool` e `Resultado`
   * ficam sem uso.
   */
  Superficie?: ComponentType;
  rotuloBotao?: (r: Rolagem | null, rolando: boolean, magista: boolean) => string;
}

/* ── derivados ──────────────────────────────────────────────────────── */

export function parcelasDe(t: TesteCongelado) {
  return { atributo: t.atributo.valor, pericia: t.pericia?.valor ?? 0, modificador: t.modificador };
}

/** Qual dado vale agora. */
export function usado(r: Rolagem): Natureza {
  return r.troca || r.perdaPendente ? "sobrecarga" : "normal";
}

/** Houve troca (aplicada ou com a perda ainda rolando)? */
export function trocada(r: Rolagem): boolean {
  return !!r.troca || !!r.perdaPendente;
}

/** Leitura de um dos dados (ou do que vale agora). */
export function resolucao(r: Rolagem, natureza: Natureza = usado(r)): Resolucao | null {
  const dado = natureza === "normal" ? r.normal : r.sobrecarga;
  return dado == null ? null : resolverTeste(parcelasDe(r.teste), r.teste.alvo, dado);
}

/** Leitura que valia ANTES da troca (para o "antes → depois"). */
export function resolucaoAntes(r: Rolagem): Resolucao | null {
  return trocada(r) ? resolucao(r, "normal") : null;
}

/* ── contexto ───────────────────────────────────────────────────────── */

interface TesteJanela {
  atributoId: string;
  periciaId: string;
  modificador: number;
  alvoTipo: "cd" | "contestado";
  cd: string;
  oponente: string;
  iniciou: "eu" | "oponente";
  visibilidade: Visibilidade;
}

export interface ProtoApi {
  proposta: Proposta;
  personagens: Personagem[];
  personagem: Personagem;
  magista: boolean;
  nomeVisivel: string;
  escolherPersonagem: (id: string) => void;
  nomeLongo: boolean;
  setNomeLongo: (v: boolean) => void;
  definirMagista: (v: boolean) => void;
  conduto: Conduto;
  setConduto: (c: Conduto) => void;
  /** Preço da PRÓXIMA troca, pelo conduto de agora. */
  custo: CustoTroca;
  substituicaoNaAcao: boolean;
  setSubstituicaoNaAcao: (v: boolean) => void;
  forcar: Forcar;
  setForcar: (f: Forcar) => void;
  papel: Papel;
  setPapel: (p: Papel) => void;
  reduzidoSimulado: boolean;
  setReduzidoSimulado: (v: boolean) => void;
  teste: TesteJanela;
  setTeste: (patch: Partial<TesteJanela>) => void;
  rolagens: Rolagem[];
  atual: Rolagem | null;
  rolando: boolean;
  carga: number;
  setCarga: (c: number) => void;
  rolar: (forca: number) => void;
  trocar: (id: string) => Promise<void>;
  desfazer: (id: string) => void;
  /** Muda o total do oponente da rolagem (o narrador corrige / o oponente também trocou). */
  ajustarOponente: (id: string, oponente: number) => void;
  trocando: string | null;
  limparChat: () => void;
  telemetria: Telemetria;
  janelaAberta: boolean;
  setJanelaAberta: (v: boolean) => void;
  aplicarCenario: (id: CenarioId) => void;
  /** Dado com foco pedido (proposta B: a janela aponta o cartão). */
  focoCartao: string | null;
  focarCartao: (id: string | null) => void;
}

export type CenarioId =
  | "ilya" | "abaixo" | "alcanca" | "ultrapassa1" | "ultrapassa2" | "ultima" | "contestado" | "naoMagista";

export const CENARIOS: { id: CenarioId; rotulo: string; detalhe: string }[] = [
  { id: "ilya", rotulo: "Ilya · cap. 13", detalhe: "Corpo 2 + Mobilidade 3, CD 12 · Normal 3, Sobrecarga 8" },
  { id: "abaixo", rotulo: "Abaixo do limite", detalhe: "Sobrecarga 1 de 3" },
  { id: "alcanca", rotulo: "Alcança o limite", detalhe: "Sobrecarga 2 de 3 → Ruptura" },
  { id: "ultrapassa1", rotulo: "Ultrapassa · 1º", detalhe: "3 de 3 → 1d4 de Integridade" },
  { id: "ultrapassa2", rotulo: "Ultrapassa · 2º", detalhe: "4 de 3 → 2d4 de Integridade" },
  { id: "ultima", rotulo: "Última Vontade", detalhe: "Integridade 1, alcança o limite" },
  { id: "contestado", rotulo: "Contestado", detalhe: "Ilya × oponente 11, Ilya iniciou" },
  { id: "naoMagista", rotulo: "Não magista", detalhe: "Doran, Corpo + Luta, CD 10" },
];

const Contexto = createContext<ProtoApi | null>(null);

const CONDUTO_INICIAL: Conduto = { sobrecarga: 1, limite: 3, integridade: 8, rupturas: 0 };

function sortearD4(n: number): number[] {
  const v = new Uint32Array(n);
  crypto.getRandomValues(v);
  return Array.from(v, (x) => 1 + (x % 4));
}

export function ProvedorProto({ proposta, reduzidoSimulado, setReduzidoSimulado, children }: {
  proposta: Proposta;
  /** Mora fora daqui: a mesa (que envolve este provedor) também precisa dele. */
  reduzidoSimulado: boolean;
  setReduzidoSimulado: (v: boolean) => void;
  children: ReactNode;
}) {
  const mesa = useMesa();
  const [personagemId, setPersonagemId] = useState("ilya");
  const [nomeLongo, setNomeLongo] = useState(false);
  const [magistas, setMagistas] = useState<Record<string, boolean>>(() => Object.fromEntries(PERSONAGENS.map((p) => [p.id, p.magista])));
  const [conduto, setConduto] = useState<Conduto>(CONDUTO_INICIAL);
  const condutoRef = useRef(conduto);
  condutoRef.current = conduto;
  const [substituicaoNaAcao, setSubstituicaoNaAcao] = useState(false);
  const [forcar, setForcar] = useState<Forcar>({ ativo: false, normal: 3, sobrecarga: 8, perda: null });
  const [papel, setPapel] = useState<Papel>("rola");
  const [teste, setTesteState] = useState<TesteJanela>({
    atributoId: "corpo", periciaId: "mobilidade", modificador: 0, alvoTipo: "cd", cd: "12", oponente: "11", iniciou: "eu", visibilidade: "public",
  });
  const [rolagens, setRolagens] = useState<Rolagem[]>([]);
  const rolagensRef = useRef(rolagens);
  rolagensRef.current = rolagens;
  const [atualId, setAtualId] = useState<string | null>(null);
  const [carga, setCarga] = useState(0);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [telemetria, setTelemetria] = useState<Telemetria>({
    cargaMs: null, forca: null, normalMs: null, sobrecargaMs: null, quedaMs: null, fpsMedio: null, fpsMinimo: null, preSimMs: null, trocaMs: null,
    custoMedioMs: null, custoPiorMs: null, semPintura: false,
  });
  const [janelaAberta, setJanelaAberta] = useState(true);
  const [focoCartao, focarCartao] = useState<string | null>(null);
  const seq = useRef(0);

  // Shaders compilados com a página parada, não no primeiro lance.
  useEffect(() => {
    const t = setTimeout(() => {
      const a = proposta.aparencias;
      aquecerArena([
        { lados: 10, aparencia: a.normal },
        { lados: 10, aparencia: a.sobrecarga(condutoRef.current) },
        ...(a.perda ? [{ lados: 4, aparencia: a.perda }] : []),
      ]);
    }, 600);
    return () => clearTimeout(t);
  }, [proposta]);

  const personagem = PERSONAGENS.find((p) => p.id === personagemId) ?? PERSONAGENS[0];
  const magista = magistas[personagem.id] ?? personagem.magista;
  const nomeVisivel = nomeLongo ? personagem.nomeLongo : personagem.nome;

  const setTeste = useCallback((patch: Partial<TesteJanela>) => setTesteState((t) => ({ ...t, ...patch })), []);

  const escolherPersonagem = useCallback((id: string) => {
    setPersonagemId(id);
    const p = PERSONAGENS.find((x) => x.id === id);
    if (p) setTesteState((t) => ({
      ...t,
      atributoId: p.atributos.some((a) => a.id === t.atributoId) ? t.atributoId : p.atributos[0].id,
      periciaId: p.pericias.some((x) => x.id === t.periciaId) ? t.periciaId : "",
    }));
  }, []);

  const atualizar = useCallback((id: string, f: (r: Rolagem) => Rolagem) => {
    setRolagens((rs) => rs.map((r) => (r.id === id ? f(r) : r)));
  }, []);

  const congelar = useCallback((): TesteCongelado => {
    const atributo = personagem.atributos.find((a) => a.id === teste.atributoId) ?? personagem.atributos[0];
    const pericia = personagem.pericias.find((p) => p.id === teste.periciaId) ?? null;
    const cdNum = Number.parseInt(teste.cd, 10);
    const opNum = Number.parseInt(teste.oponente, 10);
    const alvo: Alvo = teste.alvoTipo === "contestado" && Number.isFinite(opNum)
      ? { tipo: "contestado", oponente: opNum, iniciou: teste.iniciou }
      : teste.alvoTipo === "cd" && Number.isFinite(cdNum) ? { tipo: "cd", cd: cdNum } : { tipo: "livre" };
    return {
      personagemId: personagem.id, nome: nomeVisivel, sigla: personagem.sigla, magista,
      atributo: { nome: atributo.nome, valor: atributo.valor },
      pericia: pericia ? { nome: pericia.nome, valor: pericia.valor } : null,
      modificador: teste.modificador, alvo, visibilidade: teste.visibilidade,
    };
  }, [personagem, teste, nomeVisivel, magista]);

  // Travado até os DOIS dados assentarem (como a janela real): a janela
  // já mostra o veredito do Normal antes, mas não aceita outro lance.
  const rolando = rolagens.some((r) => r.fase !== "completa");

  const rolar = useCallback((forca: number) => {
    if (rolagensRef.current.some((r) => r.fase !== "completa")) return;
    const t = congelar();
    const n = ++seq.current;
    const id = `r${n}`;
    const idN = `${id}-normal`, idS = `${id}-sobrecarga`;
    const dados: DadoArena[] = [{ id: idN, lados: 10, aparencia: proposta.aparencias.normal, forcado: forcar.ativo ? forcar.normal : null }];
    if (t.magista) dados.push({ id: idS, lados: 10, aparencia: proposta.aparencias.sobrecarga(condutoRef.current), forcado: forcar.ativo ? forcar.sobrecarga : null });
    const nova: Rolagem = {
      id, n, criadaEm: Date.now(), teste: t, fase: "rolando", normal: null, sobrecarga: null, troca: null, perdaPendente: null, trocadaEm: null,
      substituicaoNaAcao, forca, dados, poses: null, rotulos: null,
    };
    setRolagens((rs) => [...rs, nova]);
    setAtualId(id);
    setTelemetria((tm) => ({ ...tm, cargaMs: Math.round(Math.min(1, forca) * 2000), forca, normalMs: null, sobrecargaMs: null, quedaMs: null, trocaMs: null }));
    void mesa.lancar(dados, forca, {
      estadoAoAssentar: { [idN]: "neutro", [idS]: proposta.estadoSobrecarga ?? "reserva" },
      rotulo: proposta.etiquetaNaMesa ? `${t.nome} · ${t.atributo.nome}${t.pericia ? ` + ${t.pericia.nome}` : ""}` : undefined,
      aoAssentarDado: (res) => {
        if (res.id === idN) {
          atualizar(id, (r) => ({ ...r, normal: res.valor, fase: t.magista && r.sobrecarga == null ? "normal" : "completa" }));
          setTelemetria((tm) => ({ ...tm, normalMs: res.assentouMs }));
        } else if (res.id === idS) {
          atualizar(id, (r) => ({ ...r, sobrecarga: res.valor, fase: r.normal == null ? r.fase : "completa" }));
          setTelemetria((tm) => ({ ...tm, sobrecargaMs: res.assentouMs }));
        }
      },
    }).then(({ resultados, medida }) => {
      atualizar(id, (r) => ({
        ...r,
        fase: "completa",
        normal: resultados.find((x) => x.id === idN)?.valor ?? r.normal,
        sobrecarga: resultados.find((x) => x.id === idS)?.valor ?? r.sobrecarga,
        poses: Object.fromEntries(resultados.map((x) => [x.id, x.pose])),
        rotulos: Object.fromEntries(resultados.map((x) => [x.id, x.rotulos])),
      }));
      setTelemetria((tm) => ({
        ...tm, quedaMs: medida.quedaMs, fpsMedio: medida.fpsMedio, fpsMinimo: medida.fpsMinimo, preSimMs: medida.preSimMs,
        custoMedioMs: medida.custoMedioMs, custoPiorMs: medida.custoPiorMs, semPintura: medida.semPintura,
      }));
    });
  }, [congelar, forcar, mesa, proposta, substituicaoNaAcao, atualizar]);

  const trocar = useCallback(async (id: string) => {
    const r = rolagensRef.current.find((x) => x.id === id);
    if (!r || trocada(r) || r.sobrecarga == null || !r.teste.magista) return;
    const inicio = performance.now();
    const antes = condutoRef.current;
    const custo = custoDaTroca(antes);
    const fechar = (d4: number[]) => {
      const t = aplicarTroca(antes, d4);
      condutoRef.current = t.depois;
      setConduto(t.depois);
      const feita = { ...(rolagensRef.current.find((x) => x.id === id) ?? r), troca: t, perdaPendente: null, trocadaEm: Date.now() };
      atualizar(id, () => feita);
      return feita;
    };

    if (custo.faixa === "ultrapassa" && proposta.perdaNaMesa && proposta.aparencias.perda && !(forcar.ativo && forcar.perda != null)) {
      // Duas fases: o Sobrecarga vale JÁ (e o ponto entra); a perda de
      // Integridade cai na mesa e só se aplica quando os d4 assentam.
      const provisorio = { ...antes, sobrecarga: custo.sobrecargaDepois };
      condutoRef.current = provisorio;
      setConduto(provisorio);
      const pendente = { ...r, perdaPendente: { d4: custo.d4, antes }, trocadaEm: Date.now() };
      atualizar(id, () => pendente);
      proposta.aoTrocar?.(pendente, mesa);
      setTelemetria((tm) => ({ ...tm, trocaMs: Math.round(performance.now() - inicio) }));
      const pedido: DadoArena[] = Array.from({ length: custo.d4 }, (_, i) => ({
        id: `${id}-perda-${Date.now()}-${i}`, lados: 4, aparencia: proposta.aparencias.perda!,
      }));
      setTrocando(id);
      const { resultados } = await mesa.lancar(pedido, 0.45);
      setTrocando(null);
      // Desfeita enquanto os d4 rolavam? Então a perda não vale mais.
      if (!rolagensRef.current.find((x) => x.id === id)?.perdaPendente) return;
      fechar(resultados.map((x) => x.valor));
      return;
    }

    let d4: number[] = [];
    if (custo.faixa === "ultrapassa") d4 = forcar.ativo && forcar.perda != null ? distribuirD4(forcar.perda, custo.d4) : sortearD4(custo.d4);
    const feita = fechar(d4);
    proposta.aoTrocar?.(feita, mesa);
    setTelemetria((tm) => ({ ...tm, trocaMs: Math.round(performance.now() - inicio) }));
  }, [atualizar, forcar, mesa, proposta]);

  const desfazer = useCallback((id: string) => {
    const r = rolagensRef.current.find((x) => x.id === id);
    if (!r || !trocada(r)) return;
    // Pendente: volta o conduto de antes (só o ponto tinha entrado).
    const volta = r.troca ? reverterTroca(condutoRef.current, r.troca) : { ...condutoRef.current, sobrecarga: Math.max(0, condutoRef.current.sobrecarga - 1) };
    condutoRef.current = volta;
    setConduto(volta);
    const desfeita = { ...r, troca: null, perdaPendente: null, trocadaEm: null };
    atualizar(id, () => desfeita);
    proposta.aoDesfazer?.(desfeita, mesa);
  }, [atualizar, mesa, proposta]);

  const ajustarOponente = useCallback((id: string, oponente: number) => {
    atualizar(id, (r) => (r.teste.alvo.tipo === "contestado" ? { ...r, teste: { ...r.teste, alvo: { ...r.teste.alvo, oponente } } } : r));
  }, [atualizar]);

  const aplicarCenario = useCallback((c: CenarioId) => {
    const base = { atributoId: "corpo", periciaId: "mobilidade", modificador: 0, alvoTipo: "cd" as const, cd: "12" };
    const ilya = () => { setPersonagemId("ilya"); setMagistas((m) => ({ ...m, ilya: true })); };
    switch (c) {
      case "ilya": ilya(); setTeste(base); setConduto({ sobrecarga: 0, limite: 3, integridade: 8, rupturas: 0 }); setForcar({ ativo: true, normal: 3, sobrecarga: 8, perda: null }); break;
      case "abaixo": ilya(); setTeste(base); setConduto({ sobrecarga: 1, limite: 3, integridade: 8, rupturas: 0 }); setForcar({ ativo: true, normal: 3, sobrecarga: 8, perda: null }); break;
      case "alcanca": ilya(); setTeste(base); setConduto({ sobrecarga: 2, limite: 3, integridade: 8, rupturas: 0 }); setForcar({ ativo: true, normal: 3, sobrecarga: 8, perda: null }); break;
      case "ultrapassa1": ilya(); setTeste(base); setConduto({ sobrecarga: 3, limite: 3, integridade: 7, rupturas: 1 }); setForcar({ ativo: true, normal: 3, sobrecarga: 8, perda: null }); break;
      case "ultrapassa2": ilya(); setTeste(base); setConduto({ sobrecarga: 4, limite: 3, integridade: 5, rupturas: 1 }); setForcar({ ativo: true, normal: 3, sobrecarga: 8, perda: null }); break;
      case "ultima": ilya(); setTeste(base); setConduto({ sobrecarga: 2, limite: 3, integridade: 1, rupturas: 0 }); setForcar({ ativo: true, normal: 3, sobrecarga: 8, perda: null }); break;
      case "contestado": ilya(); setTeste({ ...base, alvoTipo: "contestado", oponente: "11", iniciou: "eu" }); setConduto({ sobrecarga: 1, limite: 3, integridade: 8, rupturas: 0 }); setForcar({ ativo: true, normal: 3, sobrecarga: 8, perda: null }); break;
      case "naoMagista": setPersonagemId("doran"); setTeste({ atributoId: "corpo", periciaId: "luta", modificador: 0, alvoTipo: "cd", cd: "10" }); setForcar({ ativo: true, normal: 6, sobrecarga: 8, perda: null }); break;
    }
  }, [setTeste]);

  const api = useMemo<ProtoApi>(() => ({
    proposta, personagens: PERSONAGENS, personagem, magista, nomeVisivel, escolherPersonagem,
    nomeLongo, setNomeLongo,
    definirMagista: (v) => setMagistas((m) => ({ ...m, [personagem.id]: v })),
    conduto, setConduto: (c) => { condutoRef.current = c; setConduto(c); }, custo: custoDaTroca(conduto),
    substituicaoNaAcao, setSubstituicaoNaAcao, forcar, setForcar, papel, setPapel, reduzidoSimulado, setReduzidoSimulado,
    teste, setTeste, rolagens, atual: rolagens.find((r) => r.id === atualId) ?? null, rolando, carga, setCarga,
    rolar, trocar, desfazer, ajustarOponente, trocando,
    limparChat: () => { setRolagens([]); setAtualId(null); },
    telemetria, janelaAberta, setJanelaAberta, aplicarCenario, focoCartao, focarCartao,
  }), [
    proposta, personagem, magista, nomeVisivel, escolherPersonagem, nomeLongo, conduto, substituicaoNaAcao, forcar, papel,
    reduzidoSimulado, setReduzidoSimulado, teste, setTeste, rolagens, atualId, rolando, carga, rolar, trocar, desfazer, ajustarOponente, trocando,
    telemetria, janelaAberta, aplicarCenario, focoCartao,
  ]);

  return <Contexto.Provider value={api}>{children}</Contexto.Provider>;
}

export function useProto(): ProtoApi {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useProto fora de ProvedorProto");
  return ctx;
}

/** A rolagem que a janela mostra: a última de quem está rolando agora. */
export function useRolagemDaJanela(): Rolagem | null {
  const s = useProto();
  return s.atual && s.atual.teste.personagemId === s.personagem.id ? s.atual : null;
}
