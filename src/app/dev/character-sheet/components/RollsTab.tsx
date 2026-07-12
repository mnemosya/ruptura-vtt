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
  marginPromotions?: { periciaId: string; de: string; para: string; origem: string }[];
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
    const finalModifier = manualModifier + modificadorEfeitos;
    const promocao = temPericia ? marginPromotions.find((p) => p.periciaId === periciaId) : undefined;

    const resultado = rollPericia({
      atributoId,
      atributoNome: atributoDef?.nome ?? atributoId,
      atributoValor: atributos[atributoId],
      periciaId: temPericia ? periciaId : undefined,
      periciaNome: temPericia ? periciaDef?.nome ?? periciaId : undefined,
      periciaValor: temPericia ? pericias[periciaId] ?? 0 : undefined,
      modificador: finalModifier,
      cd,
      promocaoMargem: promocao ? { de: promocao.de as MargemClassificacao, para: promocao.para as MargemClassificacao, origem: promocao.origem } : undefined,
    });

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

        {periciaId !== SEM_PERICIA && marginPromotions.some((p) => p.periciaId === periciaId) && (
          <p data-testid="roll-promocao-disponivel" style={{ fontSize: 11, color: "#5ec8ff", marginTop: -6, marginBottom: 12 }}>
            Promoção de margem ativa nesta perícia: {marginPromotions.find((p) => p.periciaId === periciaId)?.origem} — falha limitada conta como sucesso limitado (com CD informado).
          </p>
        )}

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
          {historico.map((entry) => (
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
