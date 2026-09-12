"use client";

import { AbrirFicha } from "../../_shell/AbrirFicha";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ImageUp, Redo2, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import {
  applyConsoleMutation,
  type Character,
  type CharacterRulesPayload,
  type ConsoleMutation,
  type ReactionRules,
  type TalentContent,
} from "../../../../../lib/character";
import { rollPericia, type RupturaRollResult } from "../../../../../lib/dice";
import type { HudMutationInput, HudMutationMeta, HudResourceId, SelectedTokenHudData } from "../../../../../lib/vtt/hudTypes";
import { PointResourceControls } from "../../../../ficha/_console/panels/IdentityAside";
import { ConditionsControls } from "../../../../ficha/_console/panels/PinsAndConditions";
import { ResourceControls } from "../../../../ficha/_console/panels/VitalsRow";
import {
  ConditionPickerModal,
  DefensePickerModal,
  ResistirAtributoModal,
  RollResultModal,
  type TipoDefesa,
} from "../../../../ficha/_console/panels/AuxModals";
import {
  mutateSelectedTokenHudAction,
  readSelectedTokenHudAction,
  setSelectedTokenHudVisibilityAction,
} from "../_acoes/hudActions";
import type { TokenApresentacao } from "../_dominio/tokenApresentacao";
import { EditorRetratoToken } from "./EditorRetratoToken";

export interface HudConditionOption {
  slug: string;
  name: string;
  description?: string;
}

export interface SelectedTokenHudProps {
  campaignId: string;
  token: TokenApresentacao;
  invalidationKey: number;
  rules: CharacterRulesPayload | null;
  reactionRules: ReactionRules;
  talents: TalentContent[];
  conditions: HudConditionOption[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRotate: (direction: 1 | -1) => void;
  /** Somente para o harness visual protegido em /dev; nunca usado pela mesa real. */
  visualFixtureData?: SelectedTokenHudData;
}

type MutationResult = Awaited<ReturnType<typeof mutateSelectedTokenHudAction>>;
type AuxState =
  | null
  | "condition"
  | "defense"
  | "resist"
  | { type: "roll"; result: RupturaRollResult; defense: { usouReacao: boolean; penalidade: number; defesasSemReacao: number } };

function resourceList(data: SelectedTokenHudData, pending: ReadonlySet<string>) {
  return (["pv", "pe", "mana"] as const).flatMap((id) => {
    const value = data.resources[id];
    if (!value) return [];
    return [{
      id,
      atual: value.atual,
      max: value.max,
      publico: data.canControl ? data.visibility?.[id] : undefined,
      pendente: pending.has(`resource:${id}`) || pending.has(`visibility:${id}`),
    }];
  });
}

function mutationKey(mutation: HudMutationInput): string {
  if (mutation.type === "resource") return `resource:${mutation.resource}`;
  if (mutation.type === "pa") return "pa";
  if (mutation.type === "reactions") return "reactions";
  if (mutation.type === "defense") return "defense";
  return "conditions";
}

function toOptimisticConsoleMutation(mutation: HudMutationInput, nowIso: string): ConsoleMutation | null {
  if (mutation.type === "resource") return { ...mutation, nowIso };
  if (mutation.type === "condition_add") {
    return {
      type: "condition_add",
      condition: {
        id: `pending:${mutation.condition.slug}:${nowIso}`,
        conditionId: mutation.condition.slug,
        nome: mutation.condition.name,
        descricao: mutation.condition.description,
        aplicadaEm: nowIso,
        removidaEm: null,
        ativa: true,
      },
    };
  }
  if (mutation.type === "condition_remove") return { type: "condition_remove", conditionId: mutation.conditionId, nowIso };
  return mutation;
}

function optimisticData(
  current: SelectedTokenHudData,
  mutation: HudMutationInput,
  props: Pick<SelectedTokenHudProps, "rules" | "reactionRules" | "talents">,
): SelectedTokenHudData {
  if (current.character && current.derived) {
    const consoleMutation = toOptimisticConsoleMutation(mutation, new Date().toISOString());
    if (!consoleMutation || mutation.type === "defense") return current;
    const result = applyConsoleMutation(current.character, consoleMutation, {
      derived: current.derived,
      rules: props.rules,
      reactionRules: props.reactionRules,
      talents: props.talents,
    });
    const character = result.character;
    return {
      ...current,
      character,
      resources: {
        pv: { atual: character.recursos_atuais?.pv ?? current.derived.pv_max, max: current.derived.pv_max },
        pe: { atual: character.recursos_atuais?.pe ?? current.derived.pe_max, max: current.derived.pe_max },
        mana: { atual: character.recursos_atuais?.mana ?? current.derived.mana_max, max: current.derived.mana_max },
      },
    };
  }

  if (mutation.type === "resource" && mutation.resource === "pv" && current.resources.pv) {
    return { ...current, resources: { ...current.resources, pv: { ...current.resources.pv, atual: mutation.value } } };
  }
  if (mutation.type === "condition_add") {
    return { ...current, tokenConditions: [...(current.tokenConditions ?? []), mutation.condition.slug] };
  }
  if (mutation.type === "condition_remove" && mutation.tokenConditionSlug) {
    return { ...current, tokenConditions: (current.tokenConditions ?? []).filter((slug) => slug !== mutation.tokenConditionSlug) };
  }
  return current;
}

function rollDefense(character: Character, rules: CharacterRulesPayload | null, skillId: string, meta: HudMutationMeta): RupturaRollResult {
  const skill = rules?.pericias.find((candidate) => candidate.id === skillId);
  const candidate = skill?.atributo_primario;
  const attributeId: keyof Character["atributos"] = candidate === "mente" || candidate === "animo" ? candidate : "corpo";
  const attribute = rules?.atributos.find((candidateAttribute) => candidateAttribute.id === attributeId);
  return rollPericia({
    atributoId: attributeId,
    atributoNome: attribute?.nome ?? attributeId,
    atributoValor: character.atributos[attributeId],
    periciaId: skillId,
    periciaNome: skill?.nome,
    periciaValor: character.pericias[skillId] ?? 0,
    modificador: meta.reactionPenalty ?? 0,
  });
}

export function SelectedTokenHud(props: SelectedTokenHudProps) {
  const { campaignId, token } = props;
  const [data, setData] = useState<SelectedTokenHudData | null>(null);
  const dataRef = useRef<SelectedTokenHudData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [aux, setAux] = useState<AuxState>(null);
  const [collapsed, setCollapsed] = useState(false);
  const requestSequence = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  const commitData = useCallback((next: SelectedTokenHudData | null) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const reload = useCallback(async (showLoading = false) => {
    const sequence = ++requestSequence.current;
    if (showLoading) setLoading(true);
    if (props.visualFixtureData) {
      if (!mounted.current || sequence !== requestSequence.current) return null;
      setLoading(false);
      commitData(props.visualFixtureData);
      setError(null);
      return props.visualFixtureData;
    }
    const result = await readSelectedTokenHudAction({ campaignId, tokenId: token.id });
    if (!mounted.current || sequence !== requestSequence.current) return null;
    setLoading(false);
    if (!result.ok || !result.data) {
      commitData(null);
      setError(null);
      return null;
    }
    commitData(result.data);
    setError(null);
    return result.data;
  }, [campaignId, commitData, props.visualFixtureData, token.id]);

  useEffect(() => {
    mounted.current = true;
    const saved = window.localStorage.getItem("ruptura:vtt:selected-hud:collapsed");
    setCollapsed(saved === "true");
    void reload(true);
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    if (props.invalidationKey === 0) return;
    void reload(false);
  }, [props.invalidationKey, reload]);

  function markPending(key: string, active: boolean) {
    setPending((current) => {
      const next = new Set(current);
      if (active) next.add(key); else next.delete(key);
      return next;
    });
  }

  const runMutation = useCallback((mutation: HudMutationInput): Promise<MutationResult> => {
    const key = mutationKey(mutation);
    markPending(key, true);
    const current = dataRef.current;
    if (current) commitData(optimisticData(current, mutation, props));

    let settle!: (result: MutationResult) => void;
    const completion = new Promise<MutationResult>((resolve) => { settle = resolve; });
    queue.current = queue.current.catch(() => undefined).then(async () => {
      const result = await mutateSelectedTokenHudAction({ campaignId, tokenId: token.id, mutation });
      if (!mounted.current) { settle(result); return; }
      if (result.ok && result.data) {
        commitData(result.data);
        setError(null);
      } else {
        setError(result.error ?? "Não foi possível atualizar o HUD.");
        await reload(false);
      }
      markPending(key, false);
      settle(result);
    });
    return completion;
  }, [campaignId, commitData, props, reload, token.id]);

  const toggleVisibility = useCallback((resource: HudResourceId, isPublic: boolean) => {
    const key = `visibility:${resource}`;
    markPending(key, true);
    const current = dataRef.current;
    if (current?.visibility) commitData({ ...current, visibility: { ...current.visibility, [resource]: isPublic } });
    queue.current = queue.current.catch(() => undefined).then(async () => {
      const result = await setSelectedTokenHudVisibilityAction({ campaignId, tokenId: token.id, resource, public: isPublic });
      if (!mounted.current) return;
      if (result.ok && result.data) {
        commitData(result.data);
        setError(null);
      } else {
        setError(result.error ?? "Não foi possível atualizar a visibilidade.");
        await reload(false);
      }
      markPending(key, false);
    });
  }, [campaignId, commitData, reload, token.id]);

  const conditionBySlug = useMemo(() => new Map(props.conditions.map((condition) => [condition.slug, condition])), [props.conditions]);
  const activeConditions = useMemo(() => {
    if (!data?.canControl) return [];
    if (data.character) return (data.character.condicoes_ativas ?? []).filter((condition) => condition.ativa !== false);
    return (data.tokenConditions ?? []).map((slug) => ({
      id: slug,
      nome: conditionBySlug.get(slug)?.name ?? slug,
      descricao: conditionBySlug.get(slug)?.description,
    }));
  }, [conditionBySlug, data]);

  const resources = data ? resourceList(data, pending) : [];
  const pointData = data?.character && data.derived ? {
    pa: { available: Math.max(0, data.derived.pa_max - (data.character.estado_jogo?.pa_gastos ?? 0)), max: data.derived.pa_max },
    reactions: { available: Math.max(0, data.derived.reacoes_por_rodada - (data.character.estado_jogo?.reacoes_usadas ?? 0)), max: data.derived.reacoes_por_rodada },
  } : null;

  async function chooseDefense(skillId: string) {
    setAux(null);
    const result = await runMutation({ type: "defense" });
    if (!result.ok || !result.data?.character) return;
    const meta = result.meta ?? {};
    setAux({
      type: "roll",
      result: rollDefense(result.data.character, props.rules, skillId, meta),
      defense: {
        usouReacao: meta.usedReaction === true,
        penalidade: meta.reactionPenalty ?? 0,
        defesasSemReacao: meta.defensesWithoutReaction ?? 0,
      },
    });
  }

  function chooseDefenseType(type: TipoDefesa) {
    if (type === "resistir") { setAux("resist"); return; }
    const skillId = type === "aparar" ? "luta" : "reflexos";
    void chooseDefense(skillId);
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("ruptura:vtt:selected-hud:collapsed", String(next));
      return next;
    });
  }

  if (!loading && !data) return null;

  const name = data?.name ?? token.nome;
  const initials = data?.initials ?? token.sigla;
  const imageUrl = data?.imageUrl ?? token.retrato;
  const canControl = data?.canControl === true;
  const showConditions = !collapsed && canControl;
  const showPoints = !collapsed && canControl && pointData !== null;
  const showCenter = resources.length > 0 || showConditions;
  /**
   * O RETRATO É O BOTÃO. "Alterar retrato" não vira mais um ícone na
   * fileira de ações: quem quer trocar o retrato clica no retrato, que
   * é o alvo mais óbvio da tela e já está ali, do tamanho certo.
   *
   * É por AQUI que o jogador entra — e é a razão de a 0101 existir.
   * `edit_vtt_token` (0076) é narrador-only e o gerenciador de token
   * inteiro também: sem este caminho, o backend novo não entregaria
   * nada a quem controla o token sem conduzir a mesa.
   */
  const [editandoRetrato, setEditandoRetrato] = useState(false);

  const collapseButton = (
    <button type="button" className="rv-hud-toggle" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? "Expandir HUD" : "Recolher HUD"}>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
  );

  return (
    <section
      className="rv-hud"
      data-collapsed={collapsed}
      data-controller={canControl}
      data-has-center={showCenter}
      data-has-resources={resources.length > 0}
      data-has-points={showPoints}
      aria-label={`Token selecionado: ${name}`}
    >
      {!showCenter && collapseButton}

      {editandoRetrato && (
        <div className="rv-hud-retrato-editor">
          <EditorRetratoToken
            campaignId={campaignId}
            tokenId={token.id}
            revision={token.revision}
            retratoUrlAtual={token.retrato}
            previewAtual={imageUrl}
            // A ORIGEM vem resolvida do domínio (0106 separa o retrato
            // próprio do efetivo): o editor precisa saber se a cara na
            // tela é deste token ou da ficha aparecendo por baixo.
            origem={token.origemRetrato}
            nomePersonagem={data?.character?.nome ?? null}
            onConcluido={(o) => { if (!o?.manterAberto) setEditandoRetrato(false); }}
            onCancelar={() => setEditandoRetrato(false)}
          />
        </div>
      )}

      <div className="rv-hud-identity">
        <div className="rv-hud-namebar">
          <strong>{name}</strong>
          <span>token selecionado</span>
        </div>
        {canControl ? (
          <button
            type="button" className="rv-hud-portrait rv-hud-portrait--editavel"
            onClick={() => setEditandoRetrato(true)}
            aria-label={`Alterar o retrato de ${name}`}
          >
            {imageUrl ? <img src={imageUrl} alt="" /> : <span>{initials}</span>}
            <span className="rv-hud-portrait__lapis" aria-hidden>
              <ImageUp size={13} />
            </span>
          </button>
        ) : (
          <div className="rv-hud-portrait" aria-label={`Retrato de ${name}`}>
            {imageUrl ? <img src={imageUrl} alt="" /> : <span>{initials}</span>}
          </div>
        )}
      </div>

      {showCenter && <div className="rv-hud-center">
        {!showPoints && collapseButton}
        {canControl && (
          <div className="rv-hud-header-actions" aria-label="Ações do token">
            <button type="button" onClick={props.onUndo} disabled={!props.canUndo} aria-label="Desfazer movimento"><Undo2 size={13} /></button>
            <button type="button" onClick={props.onRedo} disabled={!props.canRedo} aria-label="Refazer movimento"><Redo2 size={13} /></button>
            <button type="button" onClick={() => props.onRotate(-1)} aria-label="Rotacionar token à esquerda"><RotateCcw size={13} /></button>
            <button type="button" onClick={() => props.onRotate(1)} aria-label="Rotacionar token à direita"><RotateCw size={13} /></button>
            {data?.characterId && (
              <AbrirFicha campaignId={campaignId} characterId={data.characterId}>Ficha</AbrirFicha>
            )}
          </div>
        )}
        {resources.length > 0 && (
          <ResourceControls
            resources={resources}
            readOnly={!canControl}
            variant="hud"
            onEdit={canControl ? (resource, value) => { void runMutation({ type: "resource", resource, value }); } : undefined}
            onTogglePublic={canControl ? toggleVisibility : undefined}
          />
        )}
        {showConditions && (
          <ConditionsControls
            conditions={activeConditions}
            variant="hud"
            busy={pending.has("conditions")}
            onAdd={() => setAux("condition")}
            onRemove={(conditionId) => {
              const tokenConditionSlug = data?.character ? undefined : conditionId;
              void runMutation({ type: "condition_remove", conditionId, tokenConditionSlug });
            }}
          />
        )}
      </div>}

      {showPoints && pointData && (
        <div className="rv-hud-right">
          {collapseButton}
          <PointResourceControls
            rotulo="PA"
            disponivel={pointData.pa.available}
            max={pointData.pa.max}
            variant="hud"
            disabled={pending.has("pa")}
            onAlternar={(delta) => { void runMutation({ type: "pa", delta }); }}
          />
          <PointResourceControls
            rotulo="Reações"
            disponivel={pointData.reactions.available}
            max={pointData.reactions.max}
            variant="hud"
            disabled={pending.has("reactions") || pending.has("defense")}
            onAlternar={(delta) => { void runMutation({ type: "reactions", delta }); }}
            onRolarDefesa={() => setAux("defense")}
          />
        </div>
      )}

      {error && <p className="rv-hud-error" role="alert">{error}</p>}

      {aux === "condition" && (
        <ConditionPickerModal
          disponiveis={props.conditions.map((condition) => ({ slug: condition.slug, nome: condition.name, descricao_curta: condition.description }))}
          onFechar={() => setAux(null)}
          onAplicar={(condition) => {
            const option = conditionBySlug.get(condition.slug);
            setAux(null);
            void runMutation({ type: "condition_add", condition: { slug: condition.slug, name: condition.nome, description: option?.description } });
          }}
        />
      )}
      {aux === "defense" && <DefensePickerModal onEscolher={chooseDefenseType} onFechar={() => setAux(null)} />}
      {aux === "resist" && <ResistirAtributoModal onEscolher={(skillId) => { void chooseDefense(skillId); }} onFechar={() => setAux(null)} />}
      {typeof aux === "object" && aux?.type === "roll" && (
        <RollResultModal resultado={aux.result} defesa={aux.defense} personagem={name} onFechar={() => setAux(null)} />
      )}
    </section>
  );
}
