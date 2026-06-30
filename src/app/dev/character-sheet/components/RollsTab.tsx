"use client";

/**
 * Dice Tray local — sem chat, sem log persistente, sem mesa online.
 * Histórico é estado visual local deste componente (não vai para
 * CharacterSheetClient nem para o payload salvo): trocar de aba ou
 * recarregar a página reseta o histórico, o que é esperado nesta
 * etapa (item 5 do pedido: "não salvar no Supabase ainda").
 */

import { useRef, useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import {
  rollExpression,
  rollPericia,
  DiceExpressionError,
  type DiceRollResult,
  type RupturaRollResult,
} from "../../../../lib/dice";
import type { CharacterAttributes, CharacterSkills, AttributeDefinition, SkillDefinition } from "../../../../lib/character";

const HISTORICO_MAX = 10;

type HistoricoEntry =
  | { id: string; kind: "pericia"; resultado: RupturaRollResult }
  | { id: string; kind: "expressao"; resultado: DiceRollResult };

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
}: {
  atributos: CharacterAttributes;
  atributoDefinitions: AttributeDefinition[] | undefined;
  pericias: CharacterSkills;
  periciaDefinitions: SkillDefinition[] | undefined;
}) {
  const atributoIds = ["corpo", "mente", "animo"] as const;
  const [atributoId, setAtributoId] = useState<(typeof atributoIds)[number]>("corpo");
  const [periciaId, setPericiaId] = useState<string>(periciaDefinitions?.[0]?.id ?? "");
  const [modificadorInput, setModificadorInput] = useState("0");
  const [cdInput, setCdInput] = useState("");

  const [expressaoInput, setExpressaoInput] = useState("");
  const [expressaoErro, setExpressaoErro] = useState<string | null>(null);

  const [historico, setHistorico] = useState<HistoricoEntry[]>([]);
  const counterRef = useRef(0);

  function pushHistorico(entry: Omit<HistoricoEntry, "id">) {
    counterRef.current += 1;
    const full = { ...entry, id: `${entry.kind}-${counterRef.current}` } as HistoricoEntry;
    setHistorico((prev) => [full, ...prev].slice(0, HISTORICO_MAX));
  }

  function handleRolarPericia() {
    const atributoDef = atributoDefinitions?.find((a) => a.id === atributoId);
    const periciaDef = periciaDefinitions?.find((p) => p.id === periciaId);
    const modificador = parseIntOrDefault(modificadorInput, 0);
    const cd = cdInput.trim() === "" ? undefined : parseIntOrDefault(cdInput, 0);

    const resultado = rollPericia({
      atributoId,
      atributoNome: atributoDef?.nome ?? atributoId,
      atributoValor: atributos[atributoId],
      periciaId,
      periciaNome: periciaDef?.nome ?? periciaId,
      periciaValor: pericias[periciaId] ?? 0,
      modificador,
      cd,
    });

    pushHistorico({ kind: "pericia", resultado });
  }

  function handleRolarExpressao() {
    setExpressaoErro(null);
    try {
      const resultado = rollExpression(expressaoInput);
      pushHistorico({ kind: "expressao", resultado });
    } catch (err) {
      setExpressaoErro(err instanceof DiceExpressionError ? err.message : "Expressão inválida.");
    }
  }

  function handleLimparHistorico() {
    setHistorico([]);
  }

  return (
    <>
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
              onChange={(e) => setPericiaId(e.target.value)}
              style={{ ...selectStyle, minWidth: 160 }}
            >
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
              {entry.kind === "pericia" ? <PericiaResultado resultado={entry.resultado} /> : <ExpressaoResultado resultado={entry.resultado} />}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function PericiaResultado({ resultado }: { resultado: RupturaRollResult }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {resultado.atributoNome} ({resultado.atributoValor}d8) + {resultado.periciaNome}
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
