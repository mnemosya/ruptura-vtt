"use client";

/**
 * O MOTOR da Forja: o personagem em construção (um `DraftV12`, o mesmo
 * formato do rascunho do servidor), as pendências e o salvamento.
 *
 * O salvamento vem do assistente anterior (`AssistenteV12`): debounce de
 * 800 ms, gravação imediata ao trocar de passo, gravações em fila para a
 * revisão nunca correr, pausa em conflito de revisão. Sem `campaignId`
 * (a prévia em /dev/forja) nada é lido nem gravado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DRAFT_V12_SCHEMA_VERSION,
  REGIOES_V12,
  escolhasCriacaoV12,
  pendenciasCriacaoV12,
  etapasProgressaoV12,
  pendenciasProgressaoV12,
  rankingsDaProgressaoV12,
  type EtapaProgressaoV12,
  sanitizeDraftV12,
  type CampoCriacaoV12,
  type DraftForjaV12,
  type DraftV12,
  type PendenciaCriacaoV12,
  type RegiaoIdV12,
  type RankingV12,
} from "../../../../../lib/rulesetV12";
import {
  apagarRascunhoV12Action,
  criarPersonagemV12Action,
  lerRascunhoV12Action,
  salvarRascunhoV12Action,
  type CatalogosCriacaoV12,
} from "../_acoes/criacaoV12Actions";

const AUTOSAVE_DEBOUNCE_MS = 800;

export type EstadoRascunho =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "incompativel"; mensagem: string }
  | { tipo: "pronto" };

/** Passo da Forja → etapa do assistente anterior (o `step` do rascunho, 1 a 5). */
const ETAPA_DO_PASSO = [1, 2, 2, 2, 3, 3, 3, 3, 3, 5] as const;

/** Em que passo da Forja cada campo é resolvido. */
export const PASSO_DO_CAMPO: Record<CampoCriacaoV12, number> = {
  nome: 0,
  local: 1,
  antecedente: 2,
  qualidades: 3,
  complicacoes: 3,
  classe: 4,
  atributos: 5,
  pericias: 6,
  vertente: 7,
  progressao: 8,
  compras: 9,
};

function novoRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function rascunhoInicial(regiaoCampanha: RegiaoIdV12 | null, nome = "", rankingInicial: RankingV12 = "F"): DraftV12 {
  return {
    schema_version: DRAFT_V12_SCHEMA_VERSION,
    ruleset_version: "1.2",
    step: 1,
    nome,
    rankingInicial,
    codinome: "",
    regiaoId: regiaoCampanha ?? "beldran",
    localOrigem: "",
    idiomaCampanha: regiaoCampanha ? REGIOES_V12[regiaoCampanha].idioma : "",
    antecedenteId: "",
    antecedente: { meio: "", papel: "", relacao_atual: "" },
    refratario: { estopim: "", primeiros_passos: "", consequencia: "" },
    rpi: { nome_registrado: "", ocupacao_declarada: "", origem: "" },
    qualidades: [],
    complicacoes: [],
    classeSlug: "",
    perfilAtributos: "",
    atributos: { corpo: null, mente: null, animo: null },
    perfilPericias: "",
    pericias: {},
    vertente: "",
    compras: {},
    forja: { passo: 0, conceito: "", aparencia: "", relato: "" },
  };
}

const FORJA_VAZIA: DraftForjaV12 = { passo: 0, conceito: "", aparencia: "", relato: "" };

export interface Criacao {
  d: DraftV12;
  forja: DraftForjaV12;
  set: (p: Partial<DraftV12>) => void;
  setForja: (p: Partial<DraftForjaV12>) => void;
  passo: number;
  irPara: (passo: number) => void;
  trocarClasse: (slug: string) => void;
  pendencias: PendenciaCriacaoV12[];
  /** Por passo da Forja: está resolvido? O último (Revisão) = sem pendência nenhuma. */
  passosCompletos: boolean[];
  /** Etapas da progressão inicial (rank acima de F); vazio no F. */
  etapas: EtapaProgressaoV12[];
  temProgressao: boolean;
  /** De 0 a 1: campos resolvidos sobre o total. */
  sincronia: number;
  aviso: string | null;
  dispensarAviso: () => void;
  // Persistência
  persiste: boolean;
  estado: EstadoRascunho;
  salvando: boolean;
  conflito: boolean;
  temRascunhoSalvo: boolean;
  recarregar: () => void;
  descartarRascunho: () => Promise<void>;
  salvarAgora: () => Promise<void>;
  // Conclusão (Fase 4 do plano)
  enviando: boolean;
  erroEnvio: string | null;
  concluir: (opcoes?: { pn?: boolean }) => Promise<string | null>;
}

export function useCriacao({ catalogos, regiaoCampanha, rankingInicial = "F", campaignId, semCampanha = false, completar }: {
  catalogos: CatalogosCriacaoV12;
  regiaoCampanha: RegiaoIdV12 | null;
  rankingInicial?: RankingV12;
  /** Mesa onde o personagem é criado. Sem ela (prévia), nada é lido, gravado ou criado. */
  campaignId?: string;
  /** Personagem sem campanha: cria solto, do jogador, sem rascunho salvo. */
  semCampanha?: boolean;
  /**
   * Completar um personagem criado só com o nome: não lê nem grava o
   * rascunho da mesa (que é de outra criação) e, ao concluir, atualiza
   * esse personagem em vez de criar outro.
   */
  completar?: { characterId: string; nome: string } | null;
}): Criacao {
  const nomeInicial = completar?.nome;
  const persiste = Boolean(campaignId) && !completar;
  const [d, setD] = useState<DraftV12>(() => rascunhoInicial(regiaoCampanha, nomeInicial, rankingInicial));
  const [estado, setEstado] = useState<EstadoRascunho>(persiste ? { tipo: "carregando" } : { tipo: "pronto" });
  const [aviso, setAviso] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [temRascunhoSalvo, setTemRascunhoSalvo] = useState(false);
  const [requestId, setRequestId] = useState(novoRequestId);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const revisaoRef = useRef(0);
  const sujoRef = useRef(false);
  const concluidoRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filaRef = useRef<Promise<void>>(Promise.resolve());
  const ultimoSalvoRef = useRef<string | null>(null);
  const dRef = useRef(d);
  dRef.current = d;

  const forja = d.forja ?? FORJA_VAZIA;
  const set = useCallback((p: Partial<DraftV12>) => setD((o) => ({ ...o, ...p })), []);
  const setForja = useCallback((p: Partial<DraftForjaV12>) => setD((o) => ({ ...o, forja: { ...(o.forja ?? FORJA_VAZIA), ...p } })), []);

  // Progressão inicial: só existe com rank acima de F; entra nas pendências
  // como mais um campo (e na Sincronia como mais um passo).
  const etapas = useMemo(
    () => etapasProgressaoV12(d, catalogos.classes.find((x) => x.slug === d.classeSlug), catalogos.subclasses ?? []),
    [d, catalogos],
  );
  const temProgressao = rankingsDaProgressaoV12(d.rankingInicial).length > 0;
  const pendencias = useMemo(
    () => [...pendenciasCriacaoV12(d, catalogos), ...(temProgressao && !d.classeSlug ? [] : pendenciasProgressaoV12(etapas))],
    [d, catalogos, etapas, temProgressao],
  );
  const passosCompletos = useMemo(() => {
    const abertos = new Set(pendencias.map((p) => PASSO_DO_CAMPO[p.campo]));
    return Array.from({ length: 10 }, (_, i) => (i === 9 ? pendencias.length === 0 : !abertos.has(i)));
  }, [pendencias]);
  const sincronia = useMemo(() => {
    const total = 9 + (temProgressao ? 1 : 0); // CAMPOS_CRIACAO_V12 (+ progressão)
    const abertos = new Set(pendencias.filter((p) => p.campo !== "compras").map((p) => p.campo)).size;
    return (total - abertos) / total;
  }, [pendencias, temProgressao]);

  /* ---------- leitura do rascunho ---------- */
  const carregar = useCallback(async () => {
    if (!campaignId || !persiste) return;
    setEstado({ tipo: "carregando" });
    ultimoSalvoRef.current = null;
    const r = await lerRascunhoV12Action(campaignId);
    if (!r.ok || !r.dados) { setEstado({ tipo: "erro", mensagem: r.erro ?? "Falha ao verificar o rascunho." }); return; }
    const dados = r.dados;
    if (dados.kind === "network_error") { setEstado({ tipo: "erro", mensagem: dados.message }); return; }
    if (dados.kind === "invalid") { setEstado({ tipo: "incompativel", mensagem: dados.message }); return; }
    if (dados.kind === "found") {
      const { draft, descartados } = sanitizeDraftV12(dados.payload, catalogos);
      setD({ ...draft, rankingInicial: draft.rankingInicial ?? rankingInicial, forja: draft.forja ?? { ...FORJA_VAZIA, passo: [0, 0, 1, 4, 8, 8][draft.step] ?? 0 } });
      setRequestId(dados.creationRequestId);
      revisaoRef.current = dados.revision;
      setTemRascunhoSalvo(true);
      if (descartados > 0) setAviso(`${descartados} escolha(s) do rascunho não existem mais no conteúdo publicado e foram removidas.`);
    }
    sujoRef.current = false;
    setEstado({ tipo: "pronto" });
  }, [campaignId, catalogos, persiste, rankingInicial]);

  useEffect(() => { void carregar(); }, [carregar]);

  /* ---------- gravação ---------- */
  const salvarAgora = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    filaRef.current = filaRef.current.then(async () => {
      if (!campaignId || !persiste || concluidoRef.current || conflito || !sujoRef.current) return;
      sujoRef.current = false;
      setSalvando(true);
      const enviado = dRef.current;
      const r = await salvarRascunhoV12Action(campaignId, enviado, requestId, revisaoRef.current);
      setSalvando(false);
      if (!r.ok || !r.dados) {
        sujoRef.current = true;
        setAviso(`Não foi possível salvar o rascunho: ${r.erro ?? "erro desconhecido"}.`);
        return;
      }
      if ("conflito" in r.dados) { setConflito(true); return; }
      revisaoRef.current = r.dados.revisao;
      ultimoSalvoRef.current = JSON.stringify(enviado);
      setTemRascunhoSalvo(true);
    });
    return filaRef.current;
  }, [campaignId, persiste, requestId, conflito]);

  // Sair da Forja desmonta o motor: grava o que ainda estiver no debounce.
  const salvarAgoraRef = useRef(salvarAgora);
  salvarAgoraRef.current = salvarAgora;
  useEffect(() => () => { if (sujoRef.current && !concluidoRef.current) void salvarAgoraRef.current(); }, []);

  // Debounce: compara com o último conteúdo salvo, não com contagem de renders.
  useEffect(() => {
    if (!persiste || estado.tipo !== "pronto") return;
    const atual = JSON.stringify(d);
    if (ultimoSalvoRef.current === null) { ultimoSalvoRef.current = atual; return; }
    if (atual === ultimoSalvoRef.current) return;
    sujoRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void salvarAgora(), AUTOSAVE_DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [d, estado.tipo, salvarAgora, persiste]);

  const irPara = useCallback((passo: number) => {
    setD((o) => ({ ...o, step: ETAPA_DO_PASSO[passo] ?? o.step, forja: { ...(o.forja ?? FORJA_VAZIA), passo } }));
    setTimeout(() => void salvarAgoraRef.current(), 0);
  }, []);

  const descartarRascunho = useCallback(async () => {
    concluidoRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    await filaRef.current;
    if (campaignId && persiste) await apagarRascunhoV12Action(campaignId);
    concluidoRef.current = false;
    sujoRef.current = false;
    ultimoSalvoRef.current = null;
    revisaoRef.current = 0;
    setConflito(false);
    setTemRascunhoSalvo(false);
    setRequestId(novoRequestId());
    setD(rascunhoInicial(regiaoCampanha, nomeInicial, rankingInicial));
    setEstado({ tipo: "pronto" });
  }, [campaignId, persiste, regiaoCampanha, nomeInicial, rankingInicial]);

  /* ---------- Classe: trocar limpa o que dependia dela ---------- */
  const trocarClasse = useCallback((slug: string) => {
    const o = dRef.current;
    if (o.classeSlug === slug) return;
    if (o.perfilPericias || Object.keys(o.pericias).length > 0) {
      setAviso("A Classe mudou: as Perícias foram limpas, porque as opções de cada valor dependem dela.");
    }
    // As escolhas da progressão (Subclasse, pontos) dependem da Classe: recomeçam.
    set({ classeSlug: slug, perfilPericias: "", pericias: {}, avancos: {} });
  }, [set]);

  /* ---------- Conclusão ---------- */
  const concluir = useCallback(async (opcoes?: { pn?: boolean }) => {
    if (!campaignId && !semCampanha) return null;
    setErroEnvio(null);
    setEnviando(true);
    // Para o salvamento antes: depois da criação a RPC recusa gravar um
    // rascunho com o mesmo creationRequestId.
    concluidoRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    await filaRef.current;
    const r = await criarPersonagemV12Action(
      campaignId ?? null,
      escolhasCriacaoV12(dRef.current, catalogos.regioes),
      requestId,
      completar ? { characterId: completar.characterId } : { pn: Boolean(opcoes?.pn) },
    );
    setEnviando(false);
    if (!r.ok || !r.dados) {
      concluidoRef.current = false;
      setErroEnvio(r.erro ?? "Falha ao criar o personagem.");
      return null;
    }
    return r.dados.characterId;
  }, [campaignId, semCampanha, catalogos.regioes, requestId, completar]);

  return {
    d, forja, set, setForja,
    passo: forja.passo, irPara, trocarClasse,
    pendencias, passosCompletos, sincronia, etapas, temProgressao,
    aviso, dispensarAviso: () => setAviso(null),
    persiste, estado, salvando, conflito, temRascunhoSalvo,
    recarregar: () => { setConflito(false); void carregar(); },
    descartarRascunho, salvarAgora,
    enviando, erroEnvio, concluir,
  };
}
