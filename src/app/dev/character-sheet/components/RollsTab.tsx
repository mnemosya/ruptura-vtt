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
import type { CharacterAttributes, CharacterSkills, AttributeDefinition, SkillDefinition } from "../../../../lib/character";
import { addLog } from "../../../../lib/table/storage";
import { TABLE_LOG_VISIBILITIES, type TableLogVisibility } from "../../../../lib/table";

const HISTORICO_MAX = 10;
const SEM_PERICIA = "";

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
}) {
  const atributoIds = ["corpo", "mente", "animo"] as const;
  const [atributoId, setAtributoId] = useState<(typeof atributoIds)[number]>("corpo");
  const [periciaId, setPericiaId] = useState<string>(SEM_PERICIA);
  const [modificadorInput, setModificadorInput] = useState("0");
  const [cdInput, setCdInput] = useState("");
  const [origemAtual, setOrigemAtual] = useState<string | null>(null);

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
    const modificador = parseIntOrDefault(modificadorInput, 0);
    const cd = cdInput.trim() === "" ? undefined : parseIntOrDefault(cdInput, 0);
    const temPericia = periciaId !== SEM_PERICIA;

    const resultado = rollPericia({
      atributoId,
      atributoNome: atributoDef?.nome ?? atributoId,
      atributoValor: atributos[atributoId],
      periciaId: temPericia ? periciaId : undefined,
      periciaNome: temPericia ? periciaDef?.nome ?? periciaId : undefined,
      periciaValor: temPericia ? pericias[periciaId] ?? 0 : undefined,
      modificador,
      cd,
    });

    pushHistorico({ kind: "pericia", resultado, origem: origemAtual ?? undefined });

    const periciaParte = resultado.periciaNome ? ` + ${resultado.periciaNome}` : " (sem perícia)";
    const cdParte =
      resultado.cd != null ? ` vs CD ${resultado.cd} (${resultado.sucesso ? "Sucesso" : "Falha"})` : "";
    onLog("rolagem_pericia", `${resultado.atributoNome}${periciaParte}: total ${resultado.total}${cdParte}`);

    await persistirNaMesa("rolagem_pericia", {
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
    });
  }

  async function handleRolarExpressao() {
    setExpressaoErro(null);
    try {
      const resultado = rollExpression(expressaoInput);
      pushHistorico({ kind: "expressao", resultado });
      onLog("rolagem_expressao", `"${resultado.expression}": total ${resultado.total}`);

      await persistirNaMesa("rolagem_expressao", {
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
              onChange={(e) => setAtributoId(e.target.value as (typeof atributoIds)[number])}
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
