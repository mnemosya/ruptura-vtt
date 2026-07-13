"use client";

/**
 * Dice Tray local — sem chat, sem log persistente, sem mesa online.
 * Histórico é estado visual local deste componente (não vai para
 * CharacterSheetClient nem para o payload salvo): trocar de aba ou
 * recarregar a página reseta o histórico, o que é esperado nesta
 * etapa (item 5 do pedido: "não salvar no Supabase ainda").
 */

import { useEffect, useRef, useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import {
  rollExpression,
  rollPericia,
  DiceExpressionError,
  type DiceRollResult,
  type MargemClassificacao,
  type PreparedRoll,
  type RupturaRollResult,
} from "../../../../lib/dice";
import type {
  ActiveEffect,
  CharacterAttributes,
  CharacterSkills,
  AttributeDefinition,
  SkillDefinition,
} from "../../../../lib/character";
import { addLog } from "../../../../lib/table/storage";
import { TABLE_LOG_VISIBILITIES, type TableLogVisibility } from "../../../../lib/table";

const HISTORICO_MAX = 10;
const SEM_PERICIA = "";

/**
 * Tags extras que o jogador pode ligar manualmente antes de rolar
 * (checkpoint v0.33, item 5 do pedido) — além das automáticas
 * (atributo escolhido + perícia escolhida, se houver). "manual" existe
 * para marcar uma rolagem como taggeada à mão (não inferida), sem
 * significado de automação próprio. Nenhuma inferência automática de
 * "isso é uma ação ofensiva" a partir do nome da perícia — o jogador
 * decide, como pedido ("não tentar inferir tudo automaticamente").
 */
const TOGGLE_TAGS = ["ofensiva", "defensiva", "visao", "audicao", "reacao", "manual"] as const;
type ToggleTag = (typeof TOGGLE_TAGS)[number];

const TOGGLE_TAG_LABELS: Record<ToggleTag, string> = {
  ofensiva: "Ofensiva",
  defensiva: "Defensiva",
  visao: "Visão",
  audicao: "Audição",
  reacao: "Reação",
  manual: "Manual",
};

const EFFECT_KIND_LABELS: Record<ActiveEffect["kind"], string> = {
  modifier: "Modificador",
  warning: "Aviso",
  lock: "Bloqueio",
  auto_fail: "Falha automática",
};

const VISIBILITY_LABELS: Record<TableLogVisibility, string> = {
  public: "Pública",
  private: "Privada",
  gm: "Narrador",
};

const MARGEM_LABELS: Record<MargemClassificacao, string> = {
  falha_critica: "Falha crítica",
  falha: "Falha",
  falha_limitada: "Falha limitada",
  sucesso_limitado: "Sucesso limitado",
  sucesso_padrao: "Sucesso padrão",
  sucesso_critico: "Sucesso crítico",
};

const MARGEM_CORES: Record<MargemClassificacao, string> = {
  falha_critica: "#c0392b",
  falha: "#ff6b6b",
  falha_limitada: "#ff9f6b",
  sucesso_limitado: "#f5a623",
  sucesso_padrao: "#4caf50",
  sucesso_critico: "#5ec8ff",
};

type HistoricoEntry =
  | { id: string; kind: "pericia"; resultado: RupturaRollResult; origem?: string }
  | { id: string; kind: "expressao"; resultado: DiceRollResult };

/** Omit que distribui sobre union (Omit normal colapsa a união e perde campos exclusivos). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const selectStyle = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
};

const inputStyle = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
  width: 80,
};

function parseIntOrDefault(raw: string, fallback: number): number {
  if (raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function RollsTab({
  atributos,
  atributoDefinitions,
  pericias,
  periciaDefinitions,
  preparedRoll,
  onPreparedRollApplied,
  onLog,
  campaignId,
  characterId,
  characterNome,
  profileId,
  profileNickname,
  profileSessionId,
  activeEffects,
  marginPromotions = [],
  saqueFantasmaAvailable = false,
  gatilhoQuenteStatus,
  onGatilhoDadoResultado,
  bangBangAvailable = false,
  paDisponivel = 0,
  onSpendPaBangBang,
  totemBencaoAvailable = false,
  bencaoTokenAtivo,
  onConsumeBencaoToken,
  falcaoTokenAtivo,
  onConsumeFalcaoToken,
  briefingCampoAtivo,
  onConsumeBriefingCampo,
  entrelinhasAtivo,
  onConsumeEntrelinhas,
  espetaculoMortalAtivo,
  onConsumeEspetaculoMortal,
  showdownStatus,
  onShowdownUsado,
}: {
  atributos: CharacterAttributes;
  atributoDefinitions: AttributeDefinition[] | undefined;
  pericias: CharacterSkills;
  periciaDefinitions: SkillDefinition[] | undefined;
  preparedRoll: PreparedRoll | null;
  onPreparedRollApplied: () => void;
  /** Registra a rolagem no Log local (ver LogTab) — não persiste no Supabase. */
  onLog: (tipo: "rolagem_pericia" | "rolagem_expressao", resumo: string) => void;
  /** Mesa selecionada na aba Geral — null = nenhuma, não persiste em table_logs. */
  campaignId: string | null;
  characterId: string | null;
  characterNome: string;
  /** Perfil selecionado na aba Geral (campaign_profiles) — anotado no payload das rolagens. */
  profileId: string | null;
  profileNickname: string | null;
  /** sessionId do navegador (checkpoint v0.24) — anotado em table_logs.profile_session_id. */
  profileSessionId?: string | null;
  /** Efeitos derivados das condições ativas do personagem (checkpoint v0.33) — ver deriveActiveEffectsFromConditions. */
  activeEffects: ActiveEffect[];
  /** Promoções de margem data-driven por perícia (Passo Fantasma, Olhar Penetrante) — checkpoint talentos. */
  marginPromotions?: { periciaId: string; de: string; para: string; origem: string; contexto: string | null }[];
  /** Malabarista › Saque Fantasma (checkpoint talentos, Fase 1) — personagem adquiriu o talento (ignora a penalidade de Rajada com arma leve de Arremesso, confirmada manualmente). */
  saqueFantasmaAvailable?: boolean;
  /** Pistoleiro › Gatilho Quente (checkpoint talentos, Fase 1 — revisão) — recurso real de dados de gatilho. */
  gatilhoQuenteStatus?: { acquired: boolean; max: number; used: number; available: number };
  /** Chamado logo após uma rolagem com o d8 de gatilho incluído — consome o recurso real e aplica dano extra se resultado 8. */
  onGatilhoDadoResultado?: (resultado: number, foiEscolhido: boolean) => void;
  /** Pistoleiro › Bang Bang (N2) — segundo disparo disponível quando o d8 de gatilho foi escolhido como parte do teste. */
  bangBangAvailable?: boolean;
  /** PA disponível atual — só habilita "Segundo disparo" com PA suficiente. */
  paDisponivel?: number;
  /** Gasta 1 PA para o segundo disparo do Bang Bang (a rolagem em si é a próxima "Rolar" normal, com −1 pré-preenchido). */
  onSpendPaBangBang?: () => void;
  /** Totem › Benção (checkpoint talentos, Fase 1) — personagem adquiriu o talento (promoção no PRÓPRIO teste ao aplicar efeito positivo, confirmada manualmente). */
  totemBencaoAvailable?: boolean;
  /** Token de Benção concedido por um aliado — consumido no PRIMEIRO teste após a concessão (promove se resultar em falha limitada). */
  bencaoTokenAtivo?: { origem: string; concedidoEm: string } | null;
  /** Consome o token de Benção (chamado depois de QUALQUER rolagem, quando o token estava ativo — "o primeiro teste realizado" consome, com ou sem promoção). */
  onConsumeBencaoToken?: () => void;
  /** Estrategista › Falcão (checkpoint talentos, Fase 5) — token +2 concedido por um aliado, aplicado ao PRÓXIMO teste que o recebedor confirmar (não é automático em qualquer rolagem — o jogador escolhe em qual teste usar). */
  falcaoTokenAtivo?: { origem: string; alvoDescricao: string; valor: number; concedidoEm: string } | null;
  onConsumeFalcaoToken?: () => void;
  /** Estrategista › Briefing de Campo (checkpoint talentos, Fase 5) — perícia designada; oferece rerroll +1 na perícia correspondente quando o jogador confirma que o teste foi uma falha. */
  briefingCampoAtivo?: { periciaId: string; origem: string; bonus: number; concedidoEm: string } | null;
  onConsumeBriefingCampo?: () => void;
  /** Manipulador › Entrelinhas (checkpoint talentos, Fase 6) — +valor real no próximo teste de Influência do caster contra a criatura marcada, confirmado no clique. */
  entrelinhasAtivo?: { alvoNome: string; descoberta: string; valor: number; concedidoEm: string } | null;
  onConsumeEntrelinhas?: () => void;
  /** Malabarista › Espetáculo Mortal (checkpoint talentos, Fase 10) — falha_limitada→sucesso_limitado no próximo teste de Precisão da sequência. */
  espetaculoMortalAtivo?: { opcao: "convergencia" | "dispersao"; concedidoEm: string } | null;
  onConsumeEspetaculoMortal?: () => void;
  /** Pistoleiro › Showdown (checkpoint talentos, Fase 11) — 1/cena, gasta até maxDados dados de gatilho de uma vez. */
  showdownStatus?: { acquired: boolean; usedThisScene: boolean; maxDados: number; intervaloAtiva: number[] };
  /** Consome os dados gastos + marca 1/cena — chamado após a rolagem com o total gasto e a contagem de qualificados. */
  onShowdownUsado?: (dadosGastos: number, qualificados: number) => void;
}) {
  const atributoIds = ["corpo", "mente", "animo"] as const;
  const [atributoId, setAtributoId] = useState<(typeof atributoIds)[number]>("corpo");
  const [periciaId, setPericiaId] = useState<string>(SEM_PERICIA);
  const [modificadorInput, setModificadorInput] = useState("0");
  const [cdInput, setCdInput] = useState("");
  const [origemAtual, setOrigemAtual] = useState<string | null>(null);
  // Tags extras ligadas manualmente pelo jogador (checkpoint v0.33) —
  // além de atributoId/periciaId, que sempre entram automaticamente.
  const [tagsExtras, setTagsExtras] = useState<Set<ToggleTag>>(new Set());
  // Tags sintéticas somadas automaticamente pelo `preparedRoll` (ex.: `item:<instanceId>` de Toque de Midas) — não togláveis, sempre presentes enquanto a rolagem preparada durar.
  const [autoTagsPreparadas, setAutoTagsPreparadas] = useState<string[]>([]);
  // Chips de efeito DESLIGADOS manualmente antes de rolar (por id de
  // ActiveEffect) — um chip ausente daqui está ligado (enabledByDefault
  // é sempre true neste checkpoint, ver activeEffects.ts).
  const [chipsDesligados, setChipsDesligados] = useState<Set<string>>(new Set());
  // Confirmação manual de que o teste atual se encaixa no `contexto` estreito
  // de uma promoção de margem (ex.: Olhar Penetrante exige Influência
  // ESPECIFICAMENTE para distorcer percepções/convencer/manipular, não
  // qualquer teste de Influência) — nunca aplica sem essa confirmação
  // explícita quando a promoção tem `contexto`. Reseta ao trocar de perícia.
  const [contextoConfirmado, setContextoConfirmado] = useState(false);
  // Propriedade Rajada (arma de fogo/arremesso_disparo) — dispara múltiplas vezes numa
  // ação em troca de −1 no teste. Malabarista › Saque Fantasma ignora essa penalidade
  // especificamente com arma LEVE de propriedade Arremesso — como o catálogo não
  // estrutura "leve + Arremesso" como um único booleano consultável a partir daqui, o
  // jogador confirma explicitamente (mesmo critério de outras confirmações desta sessão).
  const [rajadaAtiva, setRajadaAtiva] = useState(false);
  const [saqueFantasmaConfirmado, setSaqueFantasmaConfirmado] = useState(false);
  // Pistoleiro › Gatilho Quente — inclui o d8 de gatilho na próxima rolagem; reseta
  // depois de cada "Rolar" (1 dado por ataque, nunca acumula pedido).
  const [usarDadoGatilho, setUsarDadoGatilho] = useState(false);
  // Pistoleiro › Showdown — quantidade de dados de gatilho a gastar de uma vez (0 = não
  // usar), capada por reserva disponível e pelo máximo do payload; reseta após "Rolar".
  const [showdownQuantidade, setShowdownQuantidade] = useState(0);
  const [showdownResumo, setShowdownResumo] = useState<string | null>(null);
  // Bang Bang — true logo após uma rolagem onde o d8 de gatilho foi o maior dado
  // (condição real do payload: "escolher o resultado dele como parte do teste").
  const [bangBangDisponivelAgora, setBangBangDisponivelAgora] = useState(false);
  // Totem › Benção — confirmação de que ESTE teste aplica um efeito positivo em alguém
  // (cura/reforço/proteção); sem `pericias[]` no payload, não dá pra escopar por perícia
  // como Passo Fantasma/Olhar Penetrante, então é uma confirmação avulsa por rolagem.
  const [bencaoAtiva, setBencaoAtiva] = useState(false);
  // Estrategista › Falcão — confirmação de que ESTE teste é o beneficiado pelo token (o
  // jogador escolhe em qual rolagem aplicar o +2, já que o recebedor pode ter mais de um
  // teste pendente antes de "agir sobre o alvo").
  const [falcaoAtiva, setFalcaoAtiva] = useState(false);
  // Manipulador › Entrelinhas — confirmação de que ESTE teste de Influência é contra a
  // criatura marcada (o talento não tem como saber sozinho qual criatura o teste alvo sem
  // um modelo de alvo estruturado nas rolagens).
  const [entrelinhasAtivaCheckbox, setEntrelinhasAtivaCheckbox] = useState(false);
  // Malabarista › Espetáculo Mortal — confirmação de que ESTE teste de Precisão é o da
  // sequência de arremessos (o talento não sabe sozinho qual rolagem é "a" ação da sequência).
  const [espetaculoMortalConfirmado, setEspetaculoMortalConfirmado] = useState(false);

  function toggleTagExtra(tag: ToggleTag) {
    setTagsExtras((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function toggleChip(effectId: string) {
    setChipsDesligados((prev) => {
      const next = new Set(prev);
      if (next.has(effectId)) next.delete(effectId);
      else next.add(effectId);
      return next;
    });
  }

  const rollTagsAtuais = [atributoId, ...(periciaId !== SEM_PERICIA ? [periciaId] : []), ...tagsExtras, ...autoTagsPreparadas];

  // Efeitos aplicáveis à seleção atual (kind="modifier" com pelo menos
  // uma tag em comum) — chips somáveis, ligados por padrão.
  const chipsAplicaveis = activeEffects.filter(
    (e) => e.kind === "modifier" && e.affectedTags.some((tag) => rollTagsAtuais.includes(tag)),
  );
  // Avisos/falhas automáticas aplicáveis — só informativos, nunca somados.
  const avisosAplicaveis = activeEffects.filter(
    (e) => e.kind !== "modifier" && e.affectedTags.some((tag) => rollTagsAtuais.includes(tag)),
  );
  const chipsLigados = chipsAplicaveis.filter((e) => !chipsDesligados.has(e.id));
  const modificadorEfeitos = chipsLigados.reduce((sum, e) => sum + e.modifier, 0);

  const [expressaoInput, setExpressaoInput] = useState("");
  const [expressaoErro, setExpressaoErro] = useState<string | null>(null);

  const [historico, setHistorico] = useState<HistoricoEntry[]>([]);
  const counterRef = useRef(0);

  // Visibilidade da próxima gravação em table_logs — só usada quando há
  // mesa selecionada (campaignId). Padrão pública, conforme pedido.
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  // Erro discreto de gravação no log persistente — nunca bloqueia a
  // rolagem nem o Log local, que já aconteceram antes desta chamada.
  const [persistError, setPersistError] = useState<string | null>(null);

  async function persistirNaMesa(tipo: "rolagem_pericia" | "rolagem_expressao", payload: Record<string, unknown>) {
    if (!campaignId) return;
    try {
      await addLog({
        campaignId,
        characterId: characterId ?? undefined,
        profileId,
        profileSessionId,
        type: tipo,
        visibility: visibilidade,
        payload,
      });
      setPersistError(null);
    } catch (err) {
      setPersistError(
        err instanceof Error ? err.message : "Erro desconhecido ao gravar no log persistente da mesa.",
      );
    }
  }

  // Aplica a seleção vinda de um clique em "Rolar" nas abas
  // Atributos/Perícias (ver CharacterSheetClient). Não rola
  // automaticamente — só preenche os campos, como pedido.
  useEffect(() => {
    if (!preparedRoll) return;
    setAtributoId(preparedRoll.atributoId as (typeof atributoIds)[number]);
    setPericiaId(preparedRoll.periciaId ?? SEM_PERICIA);
    setOrigemAtual(preparedRoll.origem);
    setAutoTagsPreparadas(preparedRoll.extraTags ?? []);
    setContextoConfirmado(false);
    onPreparedRollApplied();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparedRoll]);

  function pushHistorico(entry: DistributiveOmit<HistoricoEntry, "id">) {
    counterRef.current += 1;
    const full = { ...entry, id: `${entry.kind}-${counterRef.current}` } as HistoricoEntry;
    setHistorico((prev) => [full, ...prev].slice(0, HISTORICO_MAX));
  }

  async function handleRolarPericia() {
    const atributoDef = atributoDefinitions?.find((a) => a.id === atributoId);
    const periciaDef = periciaDefinitions?.find((p) => p.id === periciaId);
    const manualModifier = parseIntOrDefault(modificadorInput, 0);
    const cd = cdInput.trim() === "" ? undefined : parseIntOrDefault(cdInput, 0);
    const temPericia = periciaId !== SEM_PERICIA;
    const rajadaPenalidade = rajadaAtiva && !(saqueFantasmaAvailable && saqueFantasmaConfirmado) ? -1 : 0;
    // Estrategista › Falcão — +2 (ou o valor real do payload) só quando o jogador confirma
    // que ESTE teste é "agir diretamente sobre o alvo/detalhe" marcado.
    const falcaoBonus = falcaoTokenAtivo && falcaoAtiva ? falcaoTokenAtivo.valor : 0;
    const entrelinhasBonus = entrelinhasAtivo && entrelinhasAtivaCheckbox && periciaId === "influencia" ? entrelinhasAtivo.valor : 0;
    const finalModifier = manualModifier + modificadorEfeitos + rajadaPenalidade + falcaoBonus + entrelinhasBonus;
    const promocaoCandidata = temPericia ? marginPromotions.find((p) => p.periciaId === periciaId) : undefined;
    // Promoção com `contexto` (ex.: Olhar Penetrante) só aplica com confirmação explícita de que
    // o teste atual se encaixa nesse contexto estreito — sem contexto (ex.: Passo Fantasma, "testes
    // de Furtividade") aplica direto, já que a própria perícia já delimita o uso.
    const promocaoPericia = promocaoCandidata && (!promocaoCandidata.contexto || contextoConfirmado) ? promocaoCandidata : undefined;
    // Totem › Benção — sem `pericias[]` no payload (aplica a QUALQUER teste que aplique um
    // efeito positivo), então a confirmação avulsa (checkbox) ou o token de um aliado tomam
    // precedência sobre a promoção por perícia quando ambos poderiam se aplicar (mesma faixa
    // de margem — nunca empilham, só uma promoção por rolagem).
    const bencaoOrigem = bencaoTokenAtivo ? `Token de Benção (${bencaoTokenAtivo.origem})` : bencaoAtiva ? "Totem — Benção" : null;
    // Malabarista › Espetáculo Mortal — mesma precedência de Benção, escopado à Precisão.
    const espetaculoMortalOrigem =
      espetaculoMortalAtivo && espetaculoMortalConfirmado && periciaId === "precisao" ? `Espetáculo Mortal (${espetaculoMortalAtivo.opcao})` : null;
    const promocao = bencaoOrigem
      ? { de: "falha_limitada" as MargemClassificacao, para: "sucesso_limitado" as MargemClassificacao, origem: bencaoOrigem }
      : espetaculoMortalOrigem
        ? { de: "falha_limitada" as MargemClassificacao, para: "sucesso_limitado" as MargemClassificacao, origem: espetaculoMortalOrigem }
        : promocaoPericia
          ? { de: promocaoPericia.de as MargemClassificacao, para: promocaoPericia.para as MargemClassificacao, origem: promocaoPericia.origem }
          : undefined;

    const resultado = rollPericia({
      atributoId,
      atributoNome: atributoDef?.nome ?? atributoId,
      atributoValor: atributos[atributoId],
      periciaId: temPericia ? periciaId : undefined,
      periciaNome: temPericia ? periciaDef?.nome ?? periciaId : undefined,
      periciaValor: temPericia ? pericias[periciaId] ?? 0 : undefined,
      modificador: finalModifier,
      cd,
      promocaoMargem: promocao,
      incluirDadoGatilho: usarDadoGatilho,
      quantidadeDadosGatilho: showdownQuantidade > 0 ? showdownQuantidade : undefined,
    });

    // Token consumido pelo PRIMEIRO teste após a concessão, com ou sem promoção real
    // (o texto canônico consome no teste, não condicionado ao resultado dar falha limitada).
    if (bencaoTokenAtivo) onConsumeBencaoToken?.();
    setBencaoAtiva(false);
    if (falcaoTokenAtivo && falcaoAtiva) {
      onConsumeFalcaoToken?.();
      setFalcaoAtiva(false);
    }
    if (entrelinhasAtivo && entrelinhasAtivaCheckbox && periciaId === "influencia") {
      onConsumeEntrelinhas?.();
      setEntrelinhasAtivaCheckbox(false);
    }
    if (espetaculoMortalOrigem) {
      onConsumeEspetaculoMortal?.();
      setEspetaculoMortalConfirmado(false);
    }

    if (usarDadoGatilho && resultado.dadoGatilhoResultado != null) {
      onGatilhoDadoResultado?.(resultado.dadoGatilhoResultado, resultado.dadoGatilhoEscolhido === true);
      setBangBangDisponivelAgora(bangBangAvailable && resultado.dadoGatilhoEscolhido === true);
      setUsarDadoGatilho(false);
    } else {
      setBangBangDisponivelAgora(false);
    }

    // Pistoleiro › Showdown — consome os dados gastos (independente do resultado) e lista
    // um lembrete EXATO por dado qualificado (6-8), já que os 4 efeitos afetam o ALVO
    // (cross-character) e nem RollsTab nem TableClient conseguem aplicá-los sozinhos aqui
    // (ver docstring de getShowdownAvailability em talentEngine.ts).
    if (showdownQuantidade > 0 && resultado.dadosGatilhoResultados) {
      const intervalo = showdownStatus?.intervaloAtiva ?? [6, 7, 8];
      const qualificados = resultado.dadosGatilhoResultados.filter((d) => intervalo.includes(d));
      const danoExtra = 2 * (pericias["balistica"] ?? 0);
      if (qualificados.length > 0) {
        setShowdownResumo(
          `Showdown: ${qualificados.length} dado(s) qualificado(s) (${qualificados.join(", ")}) — para cada um, escolha 1: dano extra +${danoExtra} (2× Balística) · alvo perde 1 PA (rodada atual ou próxima) · -1 ofensivo e defensivo até fim da rodada · Desarmar (mova a arma do alvo para fora de "empunhado"). Aplique manualmente no alvo.`,
        );
      } else {
        setShowdownResumo("Showdown: nenhum dado qualificado (6-8) nesta rolagem.");
      }
      onShowdownUsado?.(showdownQuantidade, qualificados.length);
      setShowdownQuantidade(0);
    }

    pushHistorico({ kind: "pericia", resultado, origem: origemAtual ?? undefined });

    const periciaParte = resultado.periciaNome ? ` + ${resultado.periciaNome}` : " (sem perícia)";
    const cdParte =
      resultado.cd != null ? ` vs CD ${resultado.cd} (${resultado.sucesso ? "Sucesso" : "Falha"})` : "";
    onLog("rolagem_pericia", `${resultado.atributoNome}${periciaParte}: total ${resultado.total}${cdParte}`);

    await persistirNaMesa("rolagem_pericia", {
      profileId,
      profileNickname,
      characterId,
      characterNome,
      atributo: resultado.atributoNome,
      atributoValor: resultado.atributoValor,
      pericia: resultado.periciaNome ?? null,
      periciaValor: resultado.periciaValor,
      modificador: resultado.modificador,
      dados: resultado.dados,
      maiorDado: resultado.maiorDado,
      total: resultado.total,
      cd: resultado.cd ?? null,
      sucesso: resultado.sucesso ?? null,
      margem: resultado.margem ?? null,
      classificacaoMargem: resultado.classificacaoMargem ?? null,
      origem: origemAtual ?? null,
      // Checkpoint v0.33 — automação reversível de condições:
      rollTags: rollTagsAtuais,
      effectsApplied: chipsLigados.map((e) => ({
        id: e.id,
        sourceName: e.sourceName,
        modifier: e.modifier,
        explanation: e.explanation,
      })),
      effectsDisabled: chipsAplicaveis
        .filter((e) => chipsDesligados.has(e.id))
        .map((e) => ({ id: e.id, sourceName: e.sourceName, modifier: e.modifier, explanation: e.explanation })),
      manualModifier,
      finalModifier,
    });
  }

  /**
   * Estrategista › Briefing de Campo — rerroll real (+bonus do payload) da última rolagem
   * qualificada (mesma perícia designada), consumido no clique. "Se o aliado falhar" fica a
   * critério do jogador confirmar (este sistema não computa falha genérica sem CD sempre
   * presente) — o botão só aparece habilitado para a rolagem mais recente que casa a
   * perícia, então o jogador decide se era mesmo uma falha antes de clicar.
   */
  async function handleRerollBriefing(original: RupturaRollResult) {
    if (!briefingCampoAtivo) return;
    const bonus = briefingCampoAtivo.bonus;
    const resultado = rollPericia({
      atributoId: original.atributoId,
      atributoNome: original.atributoNome,
      atributoValor: original.atributoValor,
      periciaId: original.periciaId,
      periciaNome: original.periciaNome,
      periciaValor: original.periciaValor,
      modificador: original.modificador + bonus,
      cd: original.cd,
    });
    onConsumeBriefingCampo?.();
    pushHistorico({ kind: "pericia", resultado, origem: `Rerroll — Briefing de Campo (${briefingCampoAtivo.origem}, +${bonus})` });
    const periciaParte = resultado.periciaNome ? ` + ${resultado.periciaNome}` : " (sem perícia)";
    const cdParte = resultado.cd != null ? ` vs CD ${resultado.cd} (${resultado.sucesso ? "Sucesso" : "Falha"})` : "";
    onLog("rolagem_pericia", `Rerroll (Briefing de Campo): ${resultado.atributoNome}${periciaParte}: total ${resultado.total}${cdParte}`);
    await persistirNaMesa("rolagem_pericia", {
      profileId,
      profileNickname,
      characterId,
      characterNome,
      atributo: resultado.atributoNome,
      atributoValor: resultado.atributoValor,
      pericia: resultado.periciaNome ?? null,
      periciaValor: resultado.periciaValor,
      modificador: resultado.modificador,
      dados: resultado.dados,
      maiorDado: resultado.maiorDado,
      total: resultado.total,
      cd: resultado.cd ?? null,
      sucesso: resultado.sucesso ?? null,
      margem: resultado.margem ?? null,
      classificacaoMargem: resultado.classificacaoMargem ?? null,
      origem: `Rerroll — Briefing de Campo (${briefingCampoAtivo.origem}, +${bonus})`,
    });
  }

  async function handleRolarExpressao() {
    setExpressaoErro(null);
    try {
      const resultado = rollExpression(expressaoInput);
      pushHistorico({ kind: "expressao", resultado });
      onLog("rolagem_expressao", `"${resultado.expression}": total ${resultado.total}`);

      await persistirNaMesa("rolagem_expressao", {
        profileId,
        profileNickname,
        characterId,
        characterNome,
        expressao: resultado.expression,
        dados: resultado.dice,
        modificador: resultado.modifier,
        total: resultado.total,
      });
    } catch (err) {
      setExpressaoErro(err instanceof DiceExpressionError ? err.message : "Expressão inválida.");
    }
  }

  function handleLimparHistorico() {
    setHistorico([]);
  }

  return (
    <>
      <Section title="Mesa">
        {campaignId ? (
          <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            Mesa selecionada — rolagens também gravam no log persistente dela (além do Log local).
          </p>
        ) : (
          <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
            Nenhuma mesa selecionada (ver aba Geral) — rolagens ficam só no Log local.
          </p>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, maxWidth: 200 }}>
          Visibilidade no log da mesa
          <select
            data-testid="roll-visibilidade-select"
            value={visibilidade}
            onChange={(e) => setVisibilidade(e.target.value as TableLogVisibility)}
            disabled={!campaignId}
            style={{ ...selectStyle, opacity: campaignId ? 1 : 0.5 }}
          >
            {TABLE_LOG_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        {persistError && (
          <p data-testid="roll-persist-erro" style={{ fontSize: 12, color: "#ff6b6b", marginTop: 8 }}>
            Não foi possível gravar no log persistente da mesa: {persistError}
          </p>
        )}
      </Section>

      <Section title="Rolagem de perícia">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
          Maior dado entre (Atributo)d8 + Perícia + modificador (regra base do Ruptura).
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            Atributo
            <select
              data-testid="roll-atributo-select"
              value={atributoId}
              onChange={(e) => {
                setAtributoId(e.target.value as (typeof atributoIds)[number]);
                setAutoTagsPreparadas([]);
              }}
              style={selectStyle}
            >
              {atributoIds.map((id) => {
                const def = atributoDefinitions?.find((a) => a.id === id);
                return (
                  <option key={id} value={id}>
                    {def?.nome ?? id} ({atributos[id]})
                  </option>
                );
              })}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            Perícia
            <select
              data-testid="roll-pericia-select"
              value={periciaId}
              onChange={(e) => {
                setPericiaId(e.target.value);
                setOrigemAtual(null);
                // Trocar perícia manualmente invalida tags automáticas (item/bricolagem) da rolagem preparada anterior — nunca vazar bônus escopado para um teste diferente.
                setAutoTagsPreparadas([]);
                // Trocar perícia invalida a confirmação de contexto de uma promoção de margem anterior.
                setContextoConfirmado(false);
              }}
              style={{ ...selectStyle, minWidth: 160 }}
            >
              <option value={SEM_PERICIA}>Sem perícia</option>
              {(periciaDefinitions ?? []).map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.nome} ({pericias[skill.id] ?? 0})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            Modificador
            <input
              data-testid="roll-modificador-input"
              type="number"
              step={1}
              value={modificadorInput}
              onChange={(e) => setModificadorInput(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            CD (opcional)
            <input
              data-testid="roll-cd-input"
              type="number"
              step={1}
              value={cdInput}
              onChange={(e) => setCdInput(e.target.value)}
              style={inputStyle}
            />
          </label>

          <button data-testid="roll-pericia-button" onClick={handleRolarPericia} style={buttonStyle}>
            Rolar
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: -6, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <input
              data-testid="roll-rajada-ativa"
              type="checkbox"
              checked={rajadaAtiva}
              onChange={(e) => setRajadaAtiva(e.target.checked)}
            />
            Usar Rajada (arma de fogo/arremesso com propriedade Rajada — −1 no teste)
          </label>
          {rajadaAtiva && saqueFantasmaAvailable && (
            <label
              data-testid="roll-saque-fantasma-confirmar"
              style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "#5ec8ff", marginLeft: 20 }}
            >
              <input
                type="checkbox"
                checked={saqueFantasmaConfirmado}
                onChange={(e) => setSaqueFantasmaConfirmado(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>Saque Fantasma: confirmo que é uma arma LEVE com propriedade Arremesso — ignora a penalidade de Rajada.</span>
            </label>
          )}
          {gatilhoQuenteStatus?.acquired && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <input
                data-testid="roll-gatilho-quente-usar"
                type="checkbox"
                checked={usarDadoGatilho}
                disabled={gatilhoQuenteStatus.available <= 0}
                onChange={(e) => setUsarDadoGatilho(e.target.checked)}
              />
              Usar dado de gatilho (d8 real na rolagem — {gatilhoQuenteStatus.available}/{gatilhoQuenteStatus.max} disponíveis)
            </label>
          )}
          {showdownStatus?.acquired && !showdownStatus.usedThisScene && gatilhoQuenteStatus && gatilhoQuenteStatus.available > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <span>Showdown (1/cena) — gastar</span>
              <select
                data-testid="roll-showdown-quantidade"
                value={showdownQuantidade}
                onChange={(e) => {
                  setShowdownQuantidade(Number(e.target.value));
                  if (Number(e.target.value) > 0) setUsarDadoGatilho(false);
                }}
                style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}
              >
                {Array.from({ length: Math.min(showdownStatus.maxDados, gatilhoQuenteStatus.available) + 1 }, (_, n) => n).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>dado(s) de gatilho de uma vez nesta rolagem</span>
            </label>
          )}
          {showdownResumo && (
            <p data-testid="roll-showdown-resumo" style={{ fontSize: 11, color: "#5ec8ff", margin: 0 }}>
              {showdownResumo}
            </p>
          )}
          {bangBangDisponivelAgora && (
            <div data-testid="roll-bang-bang-disponivel" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#5ec8ff" }}>
              <span>Bang Bang: dado de gatilho fez parte do teste — pode gastar +1 PA para um segundo disparo (−1).</span>
              <button
                data-testid="roll-bang-bang-confirmar"
                disabled={paDisponivel < 1}
                onClick={() => {
                  onSpendPaBangBang?.();
                  setModificadorInput(String(parseIntOrDefault(modificadorInput, 0) - 1));
                  setBangBangDisponivelAgora(false);
                }}
                style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
              >
                Confirmar segundo disparo (−1 pré-preenchido — role novamente)
              </button>
            </div>
          )}
          {bencaoTokenAtivo ? (
            <p data-testid="roll-bencao-token-ativo" style={{ fontSize: 11, color: "#5ec8ff", margin: 0 }}>
              Token de Benção ativo (de {bencaoTokenAtivo.origem}) — este é o primeiro teste desde a concessão: falha
              limitada vira sucesso limitado. Consumido ao rolar.
            </p>
          ) : (
            totemBencaoAvailable && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <input
                  data-testid="roll-bencao-ativa"
                  type="checkbox"
                  checked={bencaoAtiva}
                  onChange={(e) => setBencaoAtiva(e.target.checked)}
                />
                Benção: confirmo que este teste aplica um efeito positivo em alguém (cura/reforço/proteção) — falha
                limitada vira sucesso limitado.
              </label>
            )
          )}
          {falcaoTokenAtivo && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <input
                data-testid="roll-falcao-ativa"
                type="checkbox"
                checked={falcaoAtiva}
                onChange={(e) => setFalcaoAtiva(e.target.checked)}
              />
              Falcão ativo (de {falcaoTokenAtivo.origem}, alvo: {falcaoTokenAtivo.alvoDescricao}) — confirmo que este teste
              age diretamente sobre o alvo/detalhe: +{falcaoTokenAtivo.valor}. Consumido ao rolar.
            </label>
          )}
          {entrelinhasAtivo && periciaId === "influencia" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <input
                data-testid="roll-entrelinhas-ativa"
                type="checkbox"
                checked={entrelinhasAtivaCheckbox}
                onChange={(e) => setEntrelinhasAtivaCheckbox(e.target.checked)}
              />
              Entrelinhas ativo contra {entrelinhasAtivo.alvoNome} ({entrelinhasAtivo.descoberta}) — confirmo que uso essa
              impressão na abordagem: +{entrelinhasAtivo.valor}. Consumido ao rolar.
            </label>
          )}
          {espetaculoMortalAtivo && periciaId === "precisao" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <input
                data-testid="roll-espetaculo-mortal-ativa"
                type="checkbox"
                checked={espetaculoMortalConfirmado}
                onChange={(e) => setEspetaculoMortalConfirmado(e.target.checked)}
              />
              Espetáculo Mortal ativo ({espetaculoMortalAtivo.opcao}) — confirmo que este é o teste de Precisão da sequência: falha
              limitada vira sucesso limitado. Consumido ao rolar.
            </label>
          )}
          {briefingCampoAtivo && periciaId === briefingCampoAtivo.periciaId && (
            <p data-testid="roll-briefing-campo-disponivel" style={{ fontSize: 11, color: "#5ec8ff", margin: 0 }}>
              Briefing de Campo ativo em {periciaDefinitions?.find((p) => p.id === periciaId)?.nome ?? periciaId} (de{" "}
              {briefingCampoAtivo.origem}) — se este teste falhar, use "Rerrolar (Briefing de Campo)" no histórico abaixo.
            </p>
          )}
        </div>

        {periciaId !== SEM_PERICIA && marginPromotions.some((p) => p.periciaId === periciaId) && (() => {
          const promo = marginPromotions.find((p) => p.periciaId === periciaId)!;
          if (!promo.contexto) {
            return (
              <p data-testid="roll-promocao-disponivel" style={{ fontSize: 11, color: "#5ec8ff", marginTop: -6, marginBottom: 12 }}>
                Promoção de margem ativa nesta perícia: {promo.origem} — falha limitada conta como sucesso limitado (com CD informado).
              </p>
            );
          }
          return (
            <label
              data-testid="roll-promocao-contexto-confirmar"
              style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "#5ec8ff", marginTop: -6, marginBottom: 12 }}
            >
              <input
                type="checkbox"
                checked={contextoConfirmado}
                onChange={(e) => setContextoConfirmado(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                {promo.origem} — só se aplica se este teste for especificamente <strong>{promo.contexto}</strong>.
                Confirme que este teste se encaixa nesse contexto para ativar a promoção (falha limitada → sucesso limitado).
              </span>
            </label>
          );
        })()}

        {/* --- Tags extras (checkpoint v0.33) --- */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
            Tags extras desta rolagem (além de {atributoDefinitions?.find((a) => a.id === atributoId)?.nome ?? atributoId}
            {periciaId !== SEM_PERICIA ? ` + ${periciaDefinitions?.find((p) => p.id === periciaId)?.nome ?? periciaId}` : ""}
            , aplicadas automaticamente):
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {TOGGLE_TAGS.map((tag) => (
              <label key={tag} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <input
                  data-testid={`roll-tag-${tag}`}
                  type="checkbox"
                  checked={tagsExtras.has(tag)}
                  onChange={() => toggleTagExtra(tag)}
                />
                {TOGGLE_TAG_LABELS[tag]}
              </label>
            ))}
          </div>
        </div>

        {/* --- Chips de modificadores de condição aplicáveis (checkpoint v0.33) --- */}
        {(chipsAplicaveis.length > 0 || avisosAplicaveis.length > 0) && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
              Modificadores de condição aplicáveis a esta rolagem — desligue o chip para não somar:
            </p>
            <div data-testid="roll-chips-efeitos" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {chipsAplicaveis.map((e) => {
                const ligado = !chipsDesligados.has(e.id);
                return (
                  <button
                    key={e.id}
                    data-testid={`roll-chip-${e.id}`}
                    onClick={() => toggleChip(e.id)}
                    title={e.explanation}
                    style={{
                      background: ligado ? "#3a1d1d" : "#1d1e24",
                      color: ligado ? "#ff9f9f" : "#666",
                      border: `1px solid ${ligado ? "#ff6b6b" : "#333"}`,
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      textDecoration: ligado ? "none" : "line-through",
                    }}
                  >
                    {e.sourceName} {e.modifier >= 0 ? "+" : ""}
                    {e.modifier}
                  </button>
                );
              })}
              {avisosAplicaveis.map((e) => (
                <span
                  key={e.id}
                  data-testid={`roll-aviso-${e.id}`}
                  title={e.explanation}
                  style={{
                    background: "#1d1e24",
                    color: "#f5a623",
                    border: "1px solid #f5a623",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 12,
                  }}
                >
                  ⚠ {e.sourceName} ({EFFECT_KIND_LABELS[e.kind]})
                </span>
              ))}
            </div>
            {chipsAplicaveis.length > 0 && (
              <p data-testid="roll-modificador-efeitos" style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
                Modificador de condições ligadas: {modificadorEfeitos >= 0 ? "+" : ""}
                {modificadorEfeitos} · Modificador final: {parseIntOrDefault(modificadorInput, 0) + modificadorEfeitos >= 0 ? "+" : ""}
                {parseIntOrDefault(modificadorInput, 0) + modificadorEfeitos}
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="Expressão genérica">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
          Aceita apenas dados (d4, d6, d8, d10, d12, d20, d100), números inteiros, "+" e "-".
          Ex.: 1d8, 1d8+1, 2d6+3, 1d8+1d4-1.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            data-testid="roll-expressao-input"
            type="text"
            value={expressaoInput}
            onChange={(e) => setExpressaoInput(e.target.value)}
            placeholder="1d8+1d4-1"
            style={{ ...inputStyle, width: 180 }}
          />
          <button data-testid="roll-expressao-button" onClick={handleRolarExpressao} style={buttonStyle}>
            Rolar expressão
          </button>
        </div>
        {expressaoErro && (
          <p data-testid="roll-expressao-erro" style={{ fontSize: 12, color: "#ff6b6b", marginTop: 8 }}>
            {expressaoErro}
          </p>
        )}
      </Section>

      <Section title={`Histórico (${historico.length}/${HISTORICO_MAX})`}>
        <button onClick={handleLimparHistorico} style={{ ...buttonStyle, marginBottom: 12 }}>
          Limpar histórico
        </button>
        {historico.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhuma rolagem ainda.</p>}
        <div data-testid="roll-historico" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {historico.map((entry, index) => (
            <div
              key={entry.id}
              data-testid="roll-historico-item"
              style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}
            >
              {entry.kind === "pericia" ? (
                <PericiaResultado resultado={entry.resultado} origem={entry.origem} />
              ) : (
                <ExpressaoResultado resultado={entry.resultado} />
              )}
              {index === 0 && entry.kind === "pericia" && briefingCampoAtivo && entry.resultado.periciaId === briefingCampoAtivo.periciaId && (
                <button
                  data-testid="roll-rerroll-briefing"
                  onClick={() => handleRerollBriefing(entry.resultado)}
                  style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", marginTop: 6 }}
                >
                  Rerrolar (Briefing de Campo, +{briefingCampoAtivo.bonus}) — só se foi falha
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function PericiaResultado({ resultado, origem }: { resultado: RupturaRollResult; origem?: string }) {
  return (
    <div>
      {origem && <div data-testid="roll-historico-item-origem" style={{ fontSize: 11, opacity: 0.5 }}>Origem: {origem}</div>}
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {resultado.atributoNome} ({resultado.atributoValor}d8) + {resultado.periciaNome ?? "Sem perícia"}
      </div>
      <div>Resultados individuais: {resultado.dados.join(", ") || "—"}</div>
      <div>Maior d8: {resultado.maiorDado}</div>
      <div>Bônus de perícia: {resultado.periciaValor >= 0 ? "+" : ""}{resultado.periciaValor}</div>
      <div>Modificador: {resultado.modificador >= 0 ? "+" : ""}{resultado.modificador}</div>
      <div style={{ fontWeight: 700 }}>Total: {resultado.total}</div>
      {resultado.cd != null && (
        <>
          <div>CD: {resultado.cd}</div>
          <div style={{ color: resultado.sucesso ? "#4caf50" : "#ff6b6b", fontWeight: 700 }}>
            {resultado.sucesso ? "Sucesso" : "Falha"}
          </div>
          <div>Margem: {resultado.margem != null && resultado.margem >= 0 ? "+" : ""}{resultado.margem}</div>
          {resultado.classificacaoMargem && (
            <div
              data-testid="roll-historico-item-classificacao"
              style={{ color: MARGEM_CORES[resultado.classificacaoMargem], fontWeight: 700 }}
            >
              {MARGEM_LABELS[resultado.classificacaoMargem]}
            </div>
          )}
          {resultado.promocaoAplicada && (
            <div data-testid="roll-historico-item-promocao" style={{ color: "#5ec8ff" }}>
              Promoção de margem: {resultado.promocaoAplicada}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExpressaoResultado({ resultado }: { resultado: DiceRollResult }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Expressão: {resultado.expression}</div>
      <div>
        Dados: {resultado.dice.length > 0
          ? resultado.dice.map((d, i) => `${d.sign < 0 ? "-" : ""}d${d.sides}=${d.value}`).join(", ")
          : "—"}
      </div>
      <div>Modificador: {resultado.modifier >= 0 ? "+" : ""}{resultado.modifier}</div>
      <div style={{ fontWeight: 700 }}>Total: {resultado.total}</div>
    </div>
  );
}
