"use client";

/**
 * Assistente de criação RUPTURA v1.2 — Ranking F.
 *
 * Sequência canônica: Conceito → Trajetória → Classe → Equipamento →
 * Revisão. A tela só coleta ESCOLHAS; recursos, perícias zeradas,
 * carteira e inventário são montados no servidor (`createCharacterV2`)
 * e revalidados pela RPC. As pendências mostradas aqui servem apenas
 * para orientar o jogador — o servidor é quem decide.
 *
 * O rascunho é salvo sozinho (debounce de 800 ms e a cada troca de
 * etapa) na mesma tabela do assistente anterior, com `schema_version: 2`.
 * Ao abrir, ele é restaurado e ajustado aos catálogos atuais. Magias
 * iniciais ainda não fazem parte da criação (regra pendente no plano).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "../../../../../_design/icons";
import {
  DRAFT_V12_SCHEMA_VERSION,
  RANKINGS_V12,
  resolveClassResourceV12,
  sanitizeDraftV12,
  type DraftV12,
  type AttributeIdV12,
  type ClassContentV12,
  type CreationChoicesV12,
} from "../../../../../../lib/rulesetV12";
import {
  apagarRascunhoV12Action,
  criarPersonagemV12Action,
  lerRascunhoV12Action,
  salvarRascunhoV12Action,
  type CatalogosCriacaoV12,
  type OpcaoTrajetoriaV12,
} from "../../_acoes/criacaoV12Actions";

const ETAPAS = [
  { id: 1, nome: "Conceito" },
  { id: 2, nome: "Trajetória" },
  { id: 3, nome: "Classe" },
  { id: 4, nome: "Equipamento" },
  { id: 5, nome: "Revisão" },
] as const;

const ATRIBUTOS: Array<{ id: AttributeIdV12; nome: string }> = [
  { id: "corpo", nome: "Corpo" },
  { id: "mente", nome: "Mente" },
  { id: "animo", nome: "Ânimo" },
];

const NOMES_VERTENTE: Record<string, string> = {
  biotica: "Biótica",
  cinetica: "Cinética",
  cognitiva: "Cognitiva",
  energetica: "Energética",
  material: "Material",
  sinaptica: "Sináptica",
};

const RECURSOS_EXIBIDOS: Array<{ id: string; nome: string }> = [
  { id: "pv", nome: "PV" },
  { id: "pe", nome: "PE" },
  { id: "mana", nome: "Mana" },
  { id: "integridade", nome: "Integridade" },
  { id: "reacoes", nome: "Reações" },
  { id: "andar", nome: "Andar" },
];

interface Escolha {
  id: string;
  pontos: 1 | 2;
}

/** ~800ms — autosave por debounce; troca de etapa e "Salvar e sair" salvam na hora. */
const AUTOSAVE_DEBOUNCE_MS = 800;

type EstadoRascunho =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "incompativel"; mensagem: string }
  | { tipo: "pronto" };

const formatarAretz = (valor: number) => `Ⱥ ${valor.toLocaleString("pt-BR")}`;

function novoRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export default function AssistenteV12({
  campaignId,
  catalogos,
  onSair,
  onConcluir,
}: {
  campaignId: string;
  catalogos: CatalogosCriacaoV12;
  onSair: () => void;
  onConcluir: (characterId: string) => void;
}) {
  const [step, setStepBruto] = useState(1);

  // Conceito
  const [nome, setNome] = useState("");
  const [codinome, setCodinome] = useState("");

  // Trajetória
  const [regiaoId, setRegiaoId] = useState(catalogos.regioes[0]?.id ?? "");
  const [localOrigem, setLocalOrigem] = useState("");
  const [idiomaCampanha, setIdiomaCampanha] = useState("");
  const [antecedenteId, setAntecedenteId] = useState("");
  const [antecedente, setAntecedente] = useState({ meio: "", papel: "", relacao_atual: "" });
  const [refratario, setRefratario] = useState({ estopim: "", primeiros_passos: "", consequencia: "" });
  const [rpi, setRpi] = useState({ nome_registrado: "", ocupacao_declarada: "", origem: "" });
  const [qualidades, setQualidades] = useState<Escolha[]>([]);
  const [complicacoes, setComplicacoes] = useState<Escolha[]>([]);

  // Classe
  const [classeSlug, setClasseSlug] = useState(catalogos.classes[0]?.slug ?? "");
  const classe: ClassContentV12 | undefined = catalogos.classes.find((c) => c.slug === classeSlug);
  const [perfilAtributos, setPerfilAtributos] = useState("");
  const [atributos, setAtributos] = useState<Record<AttributeIdV12, number | null>>({ corpo: null, mente: null, animo: null });
  const [perfilPericias, setPerfilPericias] = useState("");
  const [pericias, setPericias] = useState<Record<string, 0 | 1 | 2 | 3>>({});
  const [vertente, setVertente] = useState("");

  // Equipamento
  const [compras, setCompras] = useState<Record<string, number>>({});

  const [enviando, setEnviando] = useState(false);
  /** Narrador: criar como PN (personagem do narrador), como no "+ Personagem". */
  const [ehPn, setEhPn] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(novoRequestId);

  // Rascunho persistente
  const [estadoRascunho, setEstadoRascunho] = useState<EstadoRascunho>({ tipo: "carregando" });
  const [aviso, setAviso] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const revisaoRef = useRef(0);
  const sujoRef = useRef(false);
  const concluidoRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filaRef = useRef<Promise<void>>(Promise.resolve());
  /** JSON do último rascunho salvo ou restaurado; `null` até a tela ficar pronta. */
  const ultimoSalvoRef = useRef<string | null>(null);

  const regiao = catalogos.regioes.find((r) => r.id === regiaoId);
  const idiomas = useMemo(() => {
    const lista = [regiao?.idioma, idiomaCampanha].filter((i): i is string => Boolean(i));
    return [...new Set(lista)];
  }, [regiao, idiomaCampanha]);

  const perfilAtr = classe?.criacao.perfis_atributos.find((p) => p.slug === perfilAtributos);
  const perfilPer = classe?.criacao.perfis_pericias.find((p) => p.slug === perfilPericias);

  const qualidadesPorSlug = useMemo(() => new Map(catalogos.qualidades.map((q) => [q.slug, q])), [catalogos.qualidades]);
  const complicacoesPorSlug = useMemo(() => new Map(catalogos.complicacoes.map((c) => [c.slug, c])), [catalogos.complicacoes]);
  const itensPorSlug = useMemo(() => new Map(catalogos.itens.map((i) => [i.slug, i])), [catalogos.itens]);

  const somaQualidades = qualidades.reduce((s, q) => s + q.pontos, 0);
  const somaComplicacoes = complicacoes.reduce((s, c) => s + c.pontos, 0);

  const orcamento = useMemo(() => {
    let total = classe?.criacao.equipamento_inicial.aretz ?? 0;
    for (const q of qualidades) total += qualidadesPorSlug.get(q.id)?.aretzPorPontos?.[String(q.pontos)] ?? 0;
    return total;
  }, [classe, qualidades, qualidadesPorSlug]);
  const gasto = Object.entries(compras).reduce((s, [slug, qtd]) => s + (itensPorSlug.get(slug)?.preco ?? 0) * qtd, 0);

  const atributosCompletos = ATRIBUTOS.every((a) => atributos[a.id] !== null);
  const valoresAtributos = atributosCompletos ? (atributos as Record<AttributeIdV12, number>) : null;

  const contagemPericias = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0 };
    for (const v of Object.values(pericias)) if (v > 0) c[v as 1 | 2 | 3]++;
    return c;
  }, [pericias]);

  // Valores ainda livres no perfil de Atributos (permutação).
  const valoresLivres = (alvo: AttributeIdV12): number[] => {
    if (!perfilAtr) return [];
    const usados = ATRIBUTOS.filter((a) => a.id !== alvo).map((a) => atributos[a.id]).filter((v): v is number => v !== null);
    const restantes = [...perfilAtr.valores];
    for (const u of usados) {
      const i = restantes.indexOf(u);
      if (i >= 0) restantes.splice(i, 1);
    }
    return [...new Set(restantes)].sort((a, b) => b - a);
  };

  const niveisPermitidos = (skillId: string): Array<0 | 1 | 2 | 3> => {
    if (!classe) return [0];
    const niveis: Array<0 | 1 | 2 | 3> = [0, 1];
    if (classe.criacao.pericias_valor_2.includes(skillId)) niveis.push(2);
    if (classe.criacao.pericias_valor_3.includes(skillId)) niveis.push(3);
    if (classe.criacao.pericias_valor_1 !== "qualquer_nao_escolhida" && !classe.criacao.pericias_valor_1.includes(skillId)) {
      return niveis.filter((n) => n !== 1);
    }
    return niveis;
  };

  const pendencias = useMemo(() => {
    const p: Array<{ etapa: number; texto: string }> = [];
    if (!nome.trim()) p.push({ etapa: 1, texto: "Defina o nome do personagem." });
    if (!localOrigem.trim()) p.push({ etapa: 2, texto: "Defina a cidade, distrito ou comunidade de origem." });
    if (!antecedenteId) p.push({ etapa: 2, texto: "Escolha um Antecedente." });
    if (Object.values(antecedente).some((v) => !v.trim())) p.push({ etapa: 2, texto: "Defina Meio, Papel e Relação atual do Antecedente." });
    if (Object.values(refratario).some((v) => !v.trim())) p.push({ etapa: 2, texto: "Defina Estopim, Primeiros passos e Consequência." });
    if (Object.values(rpi).some((v) => !v.trim())) p.push({ etapa: 2, texto: "Defina nome registrado, ocupação declarada e origem do RPI Forjado." });
    if (somaQualidades !== 3) p.push({ etapa: 2, texto: `Qualidades devem somar 3 pontos (atual: ${somaQualidades}).` });
    if (somaComplicacoes < 2) p.push({ etapa: 2, texto: `Complicações devem somar ao menos 2 pontos (atual: ${somaComplicacoes}).` });
    if (!classe) p.push({ etapa: 3, texto: "Escolha uma Classe." });
    if (!perfilAtr) p.push({ etapa: 3, texto: "Escolha um perfil de Atributos." });
    else if (!atributosCompletos) p.push({ etapa: 3, texto: "Distribua os valores do perfil entre Corpo, Mente e Ânimo." });
    if (!perfilPer) p.push({ etapa: 3, texto: "Escolha um perfil de Perícias." });
    else {
      for (const n of [3, 2, 1] as const) {
        const esperado = perfilPer.quantidades[`valor_${n}`];
        if (contagemPericias[n] !== esperado) p.push({ etapa: 3, texto: `Perícias de valor ${n}: ${contagemPericias[n]} de ${esperado}.` });
      }
    }
    if (!vertente) p.push({ etapa: 3, texto: "Escolha a Vertente Primária." });
    if (gasto > orcamento) p.push({ etapa: 4, texto: `Compras (${formatarAretz(gasto)}) acima do orçamento (${formatarAretz(orcamento)}).` });
    return p;
  }, [nome, localOrigem, antecedenteId, antecedente, refratario, rpi, somaQualidades, somaComplicacoes, classe, perfilAtr, atributosCompletos, perfilPer, contagemPericias, vertente, gasto, orcamento]);

  const rascunho: DraftV12 = useMemo(() => ({
    schema_version: DRAFT_V12_SCHEMA_VERSION,
    ruleset_version: "1.2",
    step,
    nome,
    codinome,
    regiaoId,
    localOrigem,
    idiomaCampanha,
    antecedenteId,
    antecedente,
    refratario,
    rpi,
    qualidades,
    complicacoes,
    classeSlug,
    perfilAtributos,
    atributos,
    perfilPericias,
    pericias,
    vertente,
    compras,
  }), [step, nome, codinome, regiaoId, localOrigem, idiomaCampanha, antecedenteId, antecedente, refratario, rpi, qualidades, complicacoes, classeSlug, perfilAtributos, atributos, perfilPericias, pericias, vertente, compras]);
  const rascunhoRef = useRef(rascunho);
  rascunhoRef.current = rascunho;

  const aplicarRascunho = (d: DraftV12) => {
    setStepBruto(d.step);
    setNome(d.nome);
    setCodinome(d.codinome);
    setRegiaoId(d.regiaoId);
    setLocalOrigem(d.localOrigem);
    setIdiomaCampanha(d.idiomaCampanha);
    setAntecedenteId(d.antecedenteId);
    setAntecedente(d.antecedente);
    setRefratario(d.refratario);
    setRpi(d.rpi);
    setQualidades(d.qualidades);
    setComplicacoes(d.complicacoes);
    setClasseSlug(d.classeSlug);
    setPerfilAtributos(d.perfilAtributos);
    setAtributos(d.atributos);
    setPerfilPericias(d.perfilPericias);
    setPericias(d.pericias);
    setVertente(d.vertente);
    setCompras(d.compras);
  };

  const carregarRascunho = useCallback(async () => {
    setEstadoRascunho({ tipo: "carregando" });
    ultimoSalvoRef.current = null;
    const r = await lerRascunhoV12Action(campaignId);
    if (!r.ok || !r.dados) {
      setEstadoRascunho({ tipo: "erro", mensagem: r.erro ?? "Falha ao verificar o rascunho." });
      return;
    }
    const dados = r.dados;
    if (dados.kind === "network_error") {
      setEstadoRascunho({ tipo: "erro", mensagem: dados.message });
      return;
    }
    if (dados.kind === "invalid") {
      setEstadoRascunho({ tipo: "incompativel", mensagem: dados.message });
      return;
    }
    if (dados.kind === "found") {
      const { draft, descartados } = sanitizeDraftV12(dados.payload, catalogos);
      aplicarRascunho(draft);
      setRequestId(dados.creationRequestId);
      revisaoRef.current = dados.revision;
      setAviso(
        descartados > 0
          ? `Rascunho restaurado. ${descartados} escolha(s) não existem mais no conteúdo publicado e foram removidas.`
          : "Rascunho restaurado.",
      );
    }
    sujoRef.current = false;
    setEstadoRascunho({ tipo: "pronto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, catalogos]);

  useEffect(() => {
    void carregarRascunho();
  }, [carregarRascunho]);

  /** Grava o estado atual; as gravações são serializadas para a revisão nunca correr. */
  const salvarAgora = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    filaRef.current = filaRef.current.then(async () => {
      if (concluidoRef.current || conflito || !sujoRef.current) return;
      sujoRef.current = false;
      setSalvando(true);
      const enviado = rascunhoRef.current;
      const r = await salvarRascunhoV12Action(campaignId, enviado, requestId, revisaoRef.current);
      setSalvando(false);
      if (!r.ok || !r.dados) {
        sujoRef.current = true;
        setAviso(`Não foi possível salvar o rascunho: ${r.erro ?? "erro desconhecido"}.`);
        return;
      }
      if ("conflito" in r.dados) {
        setConflito(true);
        return;
      }
      revisaoRef.current = r.dados.revisao;
      ultimoSalvoRef.current = JSON.stringify(enviado);
    });
    return filaRef.current;
  }, [campaignId, requestId, conflito]);

  // Fechar a janela (X, Esc) desmonta o assistente: grava o que ainda
  // estiver pendente do debounce em vez de perder os últimos ~800 ms.
  const salvarAgoraRef = useRef(salvarAgora);
  salvarAgoraRef.current = salvarAgora;
  useEffect(() => () => {
    if (sujoRef.current && !concluidoRef.current) void salvarAgoraRef.current();
  }, []);

  // Autosave por debounce. Compara com o último conteúdo salvo (ou
  // restaurado) em vez de contar renders: assim abrir a janela — inclusive
  // com os efeitos dobrados do modo estrito — não gera gravação.
  useEffect(() => {
    if (estadoRascunho.tipo !== "pronto") return;
    const atual = JSON.stringify(rascunho);
    if (ultimoSalvoRef.current === null) {
      ultimoSalvoRef.current = atual;
      return;
    }
    if (atual === ultimoSalvoRef.current) return;
    sujoRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void salvarAgora(), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [rascunho, estadoRascunho.tipo, salvarAgora]);

  // Trocar de etapa salva na hora (o efeito acima marca o rascunho como sujo).
  const setStep = (proximo: number | ((s: number) => number)) => {
    setStepBruto(proximo);
    setTimeout(() => void salvarAgoraRef.current(), 0);
  };

  async function salvarESair() {
    if (JSON.stringify(rascunhoRef.current) !== ultimoSalvoRef.current) sujoRef.current = true;
    await salvarAgora();
    onSair();
  }

  async function cancelarCriacao() {
    if (!window.confirm("Descartar este rascunho? O que foi preenchido será perdido.")) return;
    concluidoRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    await filaRef.current;
    await apagarRascunhoV12Action(campaignId);
    onSair();
  }

  async function descartarIncompativel() {
    await apagarRascunhoV12Action(campaignId);
    sujoRef.current = false;
    setEstadoRascunho({ tipo: "pronto" });
  }

  const escolhas = (): CreationChoicesV12 => {
    const porNivel = (n: 1 | 2 | 3) => Object.entries(pericias).filter(([, v]) => v === n).map(([id]) => id);
    return {
      nome: nome.trim(),
      classe_id: classeSlug,
      perfil_atributos: perfilAtributos,
      atributos: valoresAtributos ?? { corpo: 0, mente: 0, animo: 0 },
      perfil_pericias: perfilPericias,
      pericias: { valor_3: porNivel(3), valor_2: porNivel(2), valor_1: porNivel(1) },
      vertente_primaria: vertente,
      trajetoria: {
        regiao_id: regiaoId,
        local_origem: localOrigem.trim(),
        idiomas,
        antecedente: { antecedente_id: antecedenteId, ...antecedente },
        transformacao_refratario: refratario,
        rpi_forjado: { nivel: 1, ...rpi },
        ...(codinome.trim() ? { codinome: codinome.trim() } : {}),
        qualidades: qualidades.map((q) => ({ quality_id: q.id, pontos: q.pontos, detalhes: {} })),
        complicacoes: complicacoes.map((c) => ({ complication_id: c.id, pontos: c.pontos, detalhes: {} })),
      },
      compras: Object.entries(compras).filter(([, q]) => q > 0).map(([itemSlug, quantidade]) => ({ itemSlug, quantidade })),
    };
  };

  async function concluir() {
    setErro(null);
    setEnviando(true);
    // Para o autosave antes de concluir: depois da criação a RPC recusa
    // gravar um rascunho com o mesmo creationRequestId.
    concluidoRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    await filaRef.current;
    const r = await criarPersonagemV12Action(campaignId, escolhas(), requestId, { pn: catalogos.ehNarrador && ehPn });
    setEnviando(false);
    if (!r.ok || !r.dados) {
      concluidoRef.current = false;
      setErro(r.erro ?? "Falha ao criar o personagem.");
      return;
    }
    onConcluir(r.dados.characterId);
  }

  const trocarClasse = (slug: string) => {
    setClasseSlug(slug);
    setPerfilAtributos("");
    setAtributos({ corpo: null, mente: null, animo: null });
    setPerfilPericias("");
    setPericias({});
    setVertente("");
  };

  if (estadoRascunho.tipo === "carregando") {
    return (
      <main className="rm-page" style={{ maxWidth: 720 }} data-testid="assistente-v12">
        <p className="rm-faint"><Spinner size={13} strokeWidth={2} className="mo-spin" aria-hidden="true" /> Verificando rascunho salvo…</p>
      </main>
    );
  }

  if (estadoRascunho.tipo === "erro") {
    return (
      <main className="rm-page" style={{ maxWidth: 720 }} data-testid="assistente-v12">
        <p role="alert" className="rm-erro" style={{ marginBottom: 12 }}>
          Não foi possível verificar se você tem um rascunho salvo: {estadoRascunho.mensagem}
        </p>
        <button onClick={() => void carregarRascunho()} className="rm-btn rm-btn-ghost rv-focusable">Tentar novamente</button>
      </main>
    );
  }

  if (estadoRascunho.tipo === "incompativel") {
    return (
      <main className="rm-page" style={{ maxWidth: 720 }} data-testid="assistente-v12">
        <p role="alert" className="rm-note rm-note--warn" style={{ marginBottom: 12 }}>
          {estadoRascunho.mensagem} Para começar uma criação v1.2, ele precisa ser descartado.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void descartarIncompativel()} className="rm-btn rm-btn-danger rv-focusable" data-testid="v12-descartar-incompativel">
            Descartar e começar do zero
          </button>
          <button onClick={onSair} className="rm-btn rm-btn-ghost rv-focusable">Voltar</button>
        </div>
      </main>
    );
  }

  return (
    <main className="rm-page" style={{ maxWidth: 720 }} data-testid="assistente-v12">
      {erro && <p role="alert" className="rm-erro" style={{ marginBottom: 16 }}>Erro: {erro}</p>}
      {conflito && (
        <p role="alert" className="rm-note rm-note--danger" style={{ marginBottom: 16 }}>
          Este rascunho foi alterado em outra janela, e o salvamento automático foi pausado para não sobrescrever.{" "}
          <button onClick={() => { setConflito(false); void carregarRascunho(); }} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">
            Carregar a versão salva
          </button>
        </p>
      )}
      {aviso && !conflito && <p className="rm-note rm-note--warn" style={{ marginBottom: 16 }} data-testid="v12-aviso-rascunho">{aviso}</p>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button
          onClick={() => void salvarESair()}
          disabled={salvando || conflito}
          aria-busy={salvando}
          className="rm-btn rm-btn-ghost rv-focusable"
          data-testid="v12-salvar-sair"
        >
          {salvando && <Spinner size={13} strokeWidth={2} className="mo-spin" aria-hidden="true" />}
          Salvar e sair
        </button>
        <button onClick={() => void cancelarCriacao()} className="rm-btn rm-btn-danger rv-focusable" data-testid="v12-cancelar">
          Cancelar criação
        </button>
        <span className="rm-faint" aria-live="polite" data-testid="v12-status-rascunho">
          {conflito ? "" : salvando ? "Salvando rascunho…" : revisaoRef.current > 0 ? "Rascunho salvo" : ""}
        </span>
      </div>

      <nav className="rm-pills" aria-label="Etapas da criação" style={{ marginBottom: 24 }}>
        {ETAPAS.map((e) => (
          <button
            key={e.id}
            aria-current={step === e.id ? "step" : undefined}
            onClick={() => setStep(e.id)}
            className="rm-pill rv-focusable"
            data-testid={`v12-etapa-${e.id}`}
          >
            {e.id}. {e.nome}
          </button>
        ))}
      </nav>

      {step === 1 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Conceito</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <Campo rotulo="Nome *" valor={nome} onChange={setNome} testId="v12-nome" />
            <Campo rotulo="Codinome (opcional)" valor={codinome} onChange={setCodinome} />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mo-panel-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <h2 className="rm-section-title">Região de origem</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
              <label className="rm-field">
                <span className="rm-field-label">Região</span>
                <select value={regiaoId} onChange={(e) => setRegiaoId(e.target.value)} className="rm-select rv-focusable" data-testid="v12-regiao">
                  {catalogos.regioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </label>
              <Campo rotulo="Cidade, distrito ou comunidade *" valor={localOrigem} onChange={setLocalOrigem} testId="v12-local" />
              <label className="rm-field">
                <span className="rm-field-label">Idioma da região onde a campanha começa</span>
                <select value={idiomaCampanha} onChange={(e) => setIdiomaCampanha(e.target.value)} className="rm-select rv-focusable">
                  <option value="">O mesmo da origem</option>
                  {catalogos.regioes.map((r) => <option key={r.id} value={r.idioma}>{r.idioma}</option>)}
                </select>
              </label>
              <p className="rm-faint">Idiomas conhecidos: {idiomas.join(", ") || "—"}</p>
            </div>
          </div>

          <div>
            <h2 className="rm-section-title">Antecedente</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
              <label className="rm-field">
                <span className="rm-field-label">Antecedente *</span>
                <select value={antecedenteId} onChange={(e) => setAntecedenteId(e.target.value)} className="rm-select rv-focusable" data-testid="v12-antecedente">
                  <option value="">Escolha…</option>
                  {catalogos.antecedentes.map((a) => <option key={a.slug} value={a.slug}>{a.nome}</option>)}
                </select>
              </label>
              {antecedenteId && (
                <p className="rm-faint">{catalogos.antecedentes.find((a) => a.slug === antecedenteId)?.familiaridade}</p>
              )}
              <Campo rotulo="Meio *" valor={antecedente.meio} onChange={(v) => setAntecedente({ ...antecedente, meio: v })} />
              <Campo rotulo="Papel *" valor={antecedente.papel} onChange={(v) => setAntecedente({ ...antecedente, papel: v })} />
              <Campo rotulo="Relação atual *" valor={antecedente.relacao_atual} onChange={(v) => setAntecedente({ ...antecedente, relacao_atual: v })} />
            </div>
          </div>

          <div>
            <h2 className="rm-section-title">Tornando-se refratário</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
              <Campo rotulo="Estopim *" valor={refratario.estopim} onChange={(v) => setRefratario({ ...refratario, estopim: v })} />
              <Campo rotulo="Primeiros passos *" valor={refratario.primeiros_passos} onChange={(v) => setRefratario({ ...refratario, primeiros_passos: v })} />
              <Campo rotulo="Consequência *" valor={refratario.consequencia} onChange={(v) => setRefratario({ ...refratario, consequencia: v })} />
            </div>
          </div>

          <div>
            <h2 className="rm-section-title">RPI Forjado (Nível 1)</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
              <Campo rotulo="Nome registrado *" valor={rpi.nome_registrado} onChange={(v) => setRpi({ ...rpi, nome_registrado: v })} />
              <Campo rotulo="Ocupação declarada *" valor={rpi.ocupacao_declarada} onChange={(v) => setRpi({ ...rpi, ocupacao_declarada: v })} />
              <Campo rotulo="Como o RPI chegou às suas mãos *" valor={rpi.origem} onChange={(v) => setRpi({ ...rpi, origem: v })} />
            </div>
          </div>

          <SeletorOpcoes
            titulo="Qualidades"
            resumo={`${somaQualidades} de 3 pontos`}
            opcoes={catalogos.qualidades}
            porSlug={qualidadesPorSlug}
            escolhas={qualidades}
            onChange={setQualidades}
            testId="v12-qualidades"
          />
          <SeletorOpcoes
            titulo="Complicações"
            resumo={`${somaComplicacoes} ponto(s) — mínimo 2; mais apenas por acordo do grupo`}
            opcoes={catalogos.complicacoes}
            porSlug={complicacoesPorSlug}
            escolhas={complicacoes}
            onChange={setComplicacoes}
            testId="v12-complicacoes"
          />
        </section>
      )}

      {step === 3 && (
        <section className="mo-panel-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <h2 className="rm-section-title">Classe</h2>
            <label className="rm-field" style={{ maxWidth: 480 }}>
              <span className="rm-field-label">Classe *</span>
              <select value={classeSlug} onChange={(e) => trocarClasse(e.target.value)} className="rm-select rv-focusable" data-testid="v12-classe">
                {catalogos.classes.length === 0 && <option value="">Nenhuma Classe publicada</option>}
                {catalogos.classes.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
              </select>
            </label>
            {classe && (
              <p className="rm-faint" style={{ marginTop: 8 }}>
                <strong>{classe.papel_principal}</strong> · {classe.papeis_secundarios.join(", ")}
              </p>
            )}
          </div>

          {classe && (
            <>
              <div>
                <h2 className="rm-section-title">Atributos</h2>
                <div className="rm-pills" style={{ marginBottom: 12 }}>
                  {classe.criacao.perfis_atributos.map((p) => (
                    <button
                      key={p.slug}
                      aria-pressed={perfilAtributos === p.slug}
                      onClick={() => { setPerfilAtributos(p.slug); setAtributos({ corpo: null, mente: null, animo: null }); }}
                      className="rm-pill rv-focusable"
                      data-testid={`v12-perfil-atributos-${p.slug}`}
                    >
                      {p.nome} ({p.valores.join(", ")})
                    </button>
                  ))}
                </div>
                {perfilAtr && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {ATRIBUTOS.map((a) => (
                      <label key={a.id} className="rm-field" style={{ minWidth: 120 }}>
                        <span className="rm-field-label">{a.nome}</span>
                        <select
                          value={atributos[a.id] ?? ""}
                          onChange={(e) => setAtributos({ ...atributos, [a.id]: e.target.value === "" ? null : Number(e.target.value) })}
                          className="rm-select rv-focusable"
                          data-testid={`v12-atributo-${a.id}`}
                        >
                          <option value="">—</option>
                          {valoresLivres(a.id).map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {valoresAtributos && (
                <div>
                  <h2 className="rm-section-title">Recursos iniciais</h2>
                  <p className="rm-faint">
                    {RECURSOS_EXIBIDOS.map((r) => {
                      const valor = resolveClassResourceV12(classe, r.id, valoresAtributos);
                      return valor === undefined ? null : `${r.nome} ${valor}`;
                    }).filter(Boolean).join(" · ")}
                    {` · PA ${classe.progressao[RANKINGS_V12[0]].pa}`}
                  </p>
                </div>
              )}

              <div>
                <h2 className="rm-section-title">Perícias</h2>
                <div className="rm-pills" style={{ marginBottom: 12 }}>
                  {classe.criacao.perfis_pericias.map((p) => (
                    <button
                      key={p.slug}
                      aria-pressed={perfilPericias === p.slug}
                      onClick={() => setPerfilPericias(p.slug)}
                      className="rm-pill rv-focusable"
                      data-testid={`v12-perfil-pericias-${p.slug}`}
                    >
                      {p.nome} ({p.quantidades.valor_3}×3, {p.quantidades.valor_2}×2, {p.quantidades.valor_1}×1)
                    </button>
                  ))}
                </div>
                {perfilPer && (
                  <>
                    <p className="rm-faint" style={{ marginBottom: 8 }}>
                      Valor 3: {contagemPericias[3]}/{perfilPer.quantidades.valor_3} · Valor 2: {contagemPericias[2]}/{perfilPer.quantidades.valor_2} · Valor 1: {contagemPericias[1]}/{perfilPer.quantidades.valor_1}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {catalogos.pericias.map((p) => (
                        <label key={p.id} className="rm-field" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span>{p.nome}</span>
                          <select
                            value={pericias[p.id] ?? 0}
                            onChange={(e) => setPericias({ ...pericias, [p.id]: Number(e.target.value) as 0 | 1 | 2 | 3 })}
                            className="rm-select rv-focusable"
                            style={{ width: 64 }}
                            data-testid={`v12-pericia-${p.id}`}
                          >
                            {niveisPermitidos(p.id).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div>
                <h2 className="rm-section-title">Vertente Primária</h2>
                <p className="rm-faint" style={{ marginBottom: 8 }}>Você recebe 1 ponto na Vertente escolhida.</p>
                <div className="rm-pills">
                  {(classe.criacao.vertentes_primarias === "qualquer" ? catalogos.vertentes : classe.criacao.vertentes_primarias).map((v) => {
                    const sinergia = classe.criacao.sinergia_vertentes?.[v];
                    return (
                      <button
                        key={v}
                        aria-pressed={vertente === v}
                        onClick={() => setVertente(v)}
                        className="rm-pill rv-focusable"
                        data-testid={`v12-vertente-${v}`}
                      >
                        {NOMES_VERTENTE[v] ?? v}
                        {sinergia ? ` ${"●".repeat(sinergia)}${"○".repeat(5 - sinergia)}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Equipamento inicial</h2>
          <p className="rm-faint" style={{ marginBottom: 12 }}>
            Orçamento {formatarAretz(orcamento)} · gasto {formatarAretz(gasto)} · restante {formatarAretz(orcamento - gasto)}
            {classe ? ` · Mochila de ${classe.criacao.equipamento_inicial.espacos_mochila} espaços` : ""}
          </p>
          {gasto > orcamento && <p className="rm-note rm-note--danger" style={{ marginBottom: 12 }}>As compras excedem o orçamento.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {catalogos.itens.map((i) => (
              <div key={i.slug} className="rm-card rm-card-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px" }}>
                <span>{i.nome} <span className="rm-faint">· {formatarAretz(i.preco)}</span></span>
                <input
                  type="number"
                  min={0}
                  value={compras[i.slug] ?? 0}
                  onChange={(e) => setCompras({ ...compras, [i.slug]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                  className="rm-input rv-focusable"
                  style={{ width: 72 }}
                  aria-label={`Quantidade de ${i.nome}`}
                  data-testid={`v12-compra-${i.slug}`}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="mo-panel-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 className="rm-section-title">Revisão</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "6px 12px" }}>
            <dt className="rm-faint">Nome</dt><dd>{nome || "—"}{codinome ? ` (“${codinome}”)` : ""}</dd>
            <dt className="rm-faint">Origem</dt><dd>{regiao?.nome} · {localOrigem || "—"} · {idiomas.join(", ")}</dd>
            <dt className="rm-faint">Antecedente</dt><dd>{catalogos.antecedentes.find((a) => a.slug === antecedenteId)?.nome ?? "—"}</dd>
            <dt className="rm-faint">Qualidades</dt><dd>{qualidades.map((q) => `${qualidadesPorSlug.get(q.id)?.nome} (${q.pontos})`).join(", ") || "—"}</dd>
            <dt className="rm-faint">Complicações</dt><dd>{complicacoes.map((c) => `${complicacoesPorSlug.get(c.id)?.nome} (${c.pontos})`).join(", ") || "—"}</dd>
            <dt className="rm-faint">Classe</dt><dd>{classe?.nome ?? "—"} · Ranking F</dd>
            <dt className="rm-faint">Atributos</dt><dd>{valoresAtributos ? ATRIBUTOS.map((a) => `${a.nome} ${valoresAtributos[a.id]}`).join(" · ") : "—"}</dd>
            <dt className="rm-faint">Perícias</dt>
            <dd>
              {([3, 2, 1] as const).map((n) => {
                const lista = catalogos.pericias.filter((p) => pericias[p.id] === n).map((p) => p.nome);
                return lista.length ? <div key={n}>{n}: {lista.join(", ")}</div> : null;
              })}
            </dd>
            <dt className="rm-faint">Vertente Primária</dt><dd>{vertente ? NOMES_VERTENTE[vertente] ?? vertente : "—"}</dd>
            <dt className="rm-faint">Equipamento</dt>
            <dd>
              {Object.entries(compras).filter(([, q]) => q > 0).map(([slug, q]) => `${q}× ${itensPorSlug.get(slug)?.nome}`).join(", ") || "Nenhum item"}
              {" · "}carteira final {formatarAretz(orcamento - gasto)}
            </dd>
          </dl>

          <p className="rm-note rm-note--warn">Magias iniciais ainda não fazem parte desta criação.</p>

          {pendencias.length > 0 ? (
            <div className="rm-note rm-note--danger" data-testid="v12-pendencias">
              <strong>Pendências</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {pendencias.map((p) => (
                  <li key={p.texto}>
                    <button className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable" onClick={() => setStep(p.etapa)}>Etapa {p.etapa}</button> {p.texto}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {catalogos.ehNarrador && (
            <label className="rm-note" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input type="checkbox" checked={ehPn} onChange={(e) => setEhPn(e.target.checked)} data-testid="v12-pn" />
              É um PN (personagem do narrador)
            </label>
          )}

          <div>
            <button
              onClick={concluir}
              disabled={enviando || pendencias.length > 0}
              data-pending={enviando}
              aria-busy={enviando}
              className="rm-btn rm-btn-primary rv-focusable"
              data-testid="v12-criar"
            >
              {enviando && <Spinner size={13} strokeWidth={2} className="mo-spin" aria-hidden="true" />}
              {enviando ? "Criando…" : "Criar personagem"}
            </button>
          </div>
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="rm-btn rm-btn-ghost rv-focusable">Anterior</button>
        {step < ETAPAS.length && (
          <button onClick={() => setStep((s) => Math.min(ETAPAS.length, s + 1))} className="rm-btn rm-btn-primary rv-focusable" data-testid="v12-proxima">Próxima</button>
        )}
      </div>
    </main>
  );
}

function Campo({ rotulo, valor, onChange, testId }: { rotulo: string; valor: string; onChange: (v: string) => void; testId?: string }) {
  return (
    <label className="rm-field">
      <span className="rm-field-label">{rotulo}</span>
      <input value={valor} onChange={(e) => onChange(e.target.value)} className="rm-input rv-focusable" data-testid={testId} />
    </label>
  );
}

function SeletorOpcoes({
  titulo,
  resumo,
  opcoes,
  porSlug,
  escolhas,
  onChange,
  testId,
}: {
  titulo: string;
  resumo: string;
  opcoes: OpcaoTrajetoriaV12[];
  porSlug: Map<string, OpcaoTrajetoriaV12>;
  escolhas: Escolha[];
  onChange: (e: Escolha[]) => void;
  testId: string;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const categorias = [...new Set(opcoes.map((o) => o.categoria ?? ""))];
  const nomeCategoria = (c: string) => c.replace(/_/g, " ").replace(/^./, (l) => l.toUpperCase());

  return (
    <div data-testid={testId}>
      <h2 className="rm-section-title">{titulo} <span className="rm-faint" style={{ fontWeight: 400 }}>· {resumo}</span></h2>

      {escolhas.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {escolhas.map((e, i) => {
            const opcao = porSlug.get(e.id);
            return (
              <li key={`${e.id}-${i}`} className="rm-card rm-card-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px" }}>
                <span style={{ flex: 1 }}>{opcao?.nome ?? e.id}</span>
                {opcao && opcao.custos.length > 1 ? (
                  <select
                    value={e.pontos}
                    onChange={(ev) => onChange(escolhas.map((x, j) => (j === i ? { ...x, pontos: Number(ev.target.value) as 1 | 2 } : x)))}
                    className="rm-select rv-focusable"
                    style={{ width: 96 }}
                    aria-label={`Pontos de ${opcao.nome}`}
                  >
                    {opcao.custos.map((c) => <option key={c} value={c}>{c} ponto{c > 1 ? "s" : ""}</option>)}
                  </select>
                ) : (
                  <span className="rm-faint">{e.pontos} ponto{e.pontos > 1 ? "s" : ""}</span>
                )}
                <button onClick={() => onChange(escolhas.filter((_, j) => j !== i))} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">Remover</button>
              </li>
            );
          })}
        </ul>
      )}

      {categorias.map((categoria) => (
        <div key={categoria} style={{ marginBottom: 8 }}>
          {categoria && <p className="rm-field-label" style={{ margin: "8px 0 4px" }}>{nomeCategoria(categoria)}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {opcoes.filter((o) => (o.categoria ?? "") === categoria).map((o) => {
              const jaEscolhida = escolhas.some((e) => e.id === o.slug);
              const bloqueada = jaEscolhida && !o.repetivel;
              return (
                <div key={o.slug}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => onChange([...escolhas, { id: o.slug, pontos: o.custos[0] }])}
                      disabled={bloqueada}
                      className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable"
                      data-testid={`${testId}-${o.slug}`}
                    >
                      + {o.nome}
                    </button>
                    <span className="rm-faint">{o.custos.join(" ou ")} ponto(s){o.repetivel ? " · repetível" : ""}</span>
                    <button
                      onClick={() => setAberta(aberta === o.slug ? null : o.slug)}
                      aria-expanded={aberta === o.slug}
                      className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable"
                    >
                      {aberta === o.slug ? "Ocultar" : "Ler"}
                    </button>
                  </div>
                  {aberta === o.slug && (
                    <p className="rm-faint" style={{ whiteSpace: "pre-line", margin: "4px 0 8px 8px" }}>{o.descricao}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
