"use client";

/**
 * Página de DEBUG da ficha mínima — não é a interface final do VTT.
 *
 * Estado do personagem em edição é local (useState) até o usuário
 * clicar em "Salvar personagem" — aí é persistido na tabela
 * `characters` via Server Actions (src/lib/character/storage.ts).
 * Os derivados são recalculados automaticamente a cada render porque
 * dependem de `character.atributos` via useMemo.
 */

import { useMemo, useState } from "react";
import { createInitialCharacter, computeDerivedStats, normalizeCharacter } from "../../../lib/character";
import { createCharacter, updateCharacter, getCharacter, listCharacters, deleteCharacter } from "../../../lib/character/storage";
import type {
  Character,
  CharacterAttributes,
  CharacterRecord,
  CharacterRulesPayload,
  DerivedDefinition,
} from "../../../lib/character";

interface Props {
  regras: CharacterRulesPayload | null;
  usandoFallback: boolean;
  personagensIniciais: CharacterRecord[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

const buttonStyle: React.CSSProperties = {
  background: "#1d1e24",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function derivedMetaById(regras: CharacterRulesPayload | null, id: string): DerivedDefinition | undefined {
  return regras?.derivados.find((d) => d.id === id);
}

export default function CharacterSheetClient({ regras, usandoFallback, personagensIniciais }: Props) {
  const [character, setCharacter] = useState<Character>(() => createInitialCharacter(regras));
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [personagens, setPersonagens] = useState<CharacterRecord[]>(personagensIniciais);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const derivados = useMemo(
    () => computeDerivedStats(character.atributos, regras),
    [character.atributos, regras],
  );

  async function refreshList() {
    try {
      setPersonagens(await listCharacters());
    } catch {
      // Falha ao atualizar a lista não deve esconder o resultado do save/load.
    }
  }

  async function handleSave() {
    setSaveState("saving");
    setErrorMessage(null);
    try {
      // normalizeCharacter garante metadados.schema_version e preenche
      // recursos_atuais ausentes com os _max calculados aqui na UI
      // (derivados) — storage.ts só carimba atualizado_em por cima.
      const toSave = normalizeCharacter(character, derivados);
      const record = characterId
        ? await updateCharacter(characterId, toSave)
        : await createCharacter(toSave);
      setCharacter(record.payload);
      setCharacterId(record.id);
      setSaveState("saved");
      await refreshList();
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao salvar.");
    }
  }

  async function handleLoad(id: string) {
    setSaveState("idle");
    setErrorMessage(null);
    try {
      const record = await getCharacter(id);
      if (!record) {
        setSaveState("error");
        setErrorMessage(`Personagem "${id}" não encontrado.`);
        return;
      }
      // normalizeCharacter aceita payload antigo/incompleto sem quebrar
      // (personagens salvos antes do schema_version, por exemplo).
      setCharacter(normalizeCharacter(record.payload));
      setCharacterId(record.id);
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar.");
    }
  }

  async function handleDelete(id: string) {
    setErrorMessage(null);
    try {
      await deleteCharacter(id);
      if (id === characterId) {
        setCharacterId(null);
        setSaveState("idle");
      }
      await refreshList();
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao apagar.");
    }
  }

  function handleNew() {
    setCharacter(createInitialCharacter(regras));
    setCharacterId(null);
    setSaveState("idle");
    setErrorMessage(null);
  }

  function updateAtributo(id: keyof CharacterAttributes, rawValue: number) {
    const def = regras?.atributos.find((a) => a.id === id);
    const min = def?.valor_minimo ?? 1;
    const max = def?.valor_maximo ?? 5;
    setCharacter((prev) => ({
      ...prev,
      atributos: { ...prev.atributos, [id]: clamp(rawValue, min, max) },
    }));
  }

  function updatePericia(id: string, rawValue: number) {
    const def = regras?.pericias.find((p) => p.id === id);
    const min = def?.valor_minimo ?? 0;
    const max = def?.valor_maximo ?? 5;
    setCharacter((prev) => ({
      ...prev,
      pericias: { ...prev.pericias, [id]: clamp(rawValue, min, max) },
    }));
  }

  const recursoIds = ["pv_max", "pe_max", "mana_max", "integridade_max"] as const;
  const outrosDerivadosIds = ["reacoes_por_rodada", "andar_m", "correr_m", "pa_max"] as const;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
        /dev/character-sheet — ficha mínima. Edição é local até clicar em "Salvar personagem".
      </p>
      {usandoFallback && (
        <p style={{ color: "#f5a623", fontSize: 13, marginBottom: 16 }}>
          ⚠ regras_personagem não veio do banco — usando fórmulas de fallback temporárias.
        </p>
      )}

      <input
        value={character.nome}
        onChange={(e) => setCharacter((prev) => ({ ...prev, nome: e.target.value }))}
        style={{
          fontSize: 28,
          fontWeight: 700,
          background: "transparent",
          color: "inherit",
          border: "none",
          borderBottom: "1px solid #333",
          padding: "4px 0",
          marginBottom: 12,
          width: "100%",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={handleSave} disabled={saveState === "saving"} style={buttonStyle}>
          {saveState === "saving" ? "Salvando…" : "Salvar personagem"}
        </button>
        <button onClick={handleNew} style={buttonStyle}>
          Novo personagem
        </button>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {characterId ? `id: ${characterId}` : "ainda não salvo"}
          {character.metadados?.schema_version != null
            ? ` · schema v${character.metadados.schema_version}`
            : ""}
        </span>
        {saveState === "saved" && <span style={{ fontSize: 13, color: "#4caf50" }}>✓ Salvo</span>}
        {saveState === "error" && (
          <span style={{ fontSize: 13, color: "#ff6b6b" }}>Erro: {errorMessage}</span>
        )}
      </div>

      <Section title="Atributos">
        <div style={{ display: "flex", gap: 16 }}>
          {(["corpo", "mente", "animo"] as const).map((id) => {
            const def = regras?.atributos.find((a) => a.id === id);
            return (
              <NumberField
                key={id}
                testId={`atributo-${id}`}
                label={def?.nome ?? id}
                value={character.atributos[id]}
                min={def?.valor_minimo ?? 1}
                max={def?.valor_maximo ?? 5}
                onChange={(v) => updateAtributo(id, v)}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Recursos">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {recursoIds.map((id) => {
            const meta = derivedMetaById(regras, id);
            return (
              <Stat
                key={id}
                testId={`derivado-${id}`}
                label={meta?.nome ?? id}
                value={derivados[id]}
                hint={meta?.formula_label}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Recursos atuais">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          Somente leitura por enquanto — preenchido com os máximos ao salvar, se ainda
          ausente. Dano/cura/gasto ficam para a etapa de combate.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <Stat label="PV atual" value={character.recursos_atuais?.pv ?? "—"} />
          <Stat label="PE atual" value={character.recursos_atuais?.pe ?? "—"} />
          <Stat label="Mana atual" value={character.recursos_atuais?.mana ?? "—"} />
          <Stat label="Integridade atual" value={character.recursos_atuais?.integridade ?? "—"} />
        </div>
      </Section>

      <Section title="Derivados">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {outrosDerivadosIds.map((id) => {
            const meta = derivedMetaById(regras, id);
            const unidade = meta?.unidade ? ` ${meta.unidade}` : "";
            return (
              <Stat
                key={id}
                testId={`derivado-${id}`}
                label={meta?.nome ?? id}
                value={`${derivados[id]}${unidade}`}
                hint={meta?.formula_label}
              />
            );
          })}
        </div>
      </Section>

      <Section title={`Perícias (${Object.keys(character.pericias).length})`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 16px" }}>
          {(regras?.pericias ?? []).map((skill) => (
            <NumberField
              key={skill.id}
              label={skill.nome}
              value={character.pericias[skill.id] ?? 0}
              min={skill.valor_minimo}
              max={skill.valor_maximo}
              compact
              onChange={(v) => updatePericia(skill.id, v)}
            />
          ))}
        </div>
      </Section>

      <Section title={`Personagens salvos (${personagens.length})`}>
        {personagens.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum personagem salvo ainda.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {personagens.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: p.id === characterId ? "#26283280" : "#1d1e24",
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>
                  {p.id} · atualizado em {new Date(p.updated_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleLoad(p.id)} style={buttonStyle}>
                  Carregar
                </button>
                <button onClick={() => handleDelete(p.id)} style={{ ...buttonStyle, color: "#ff6b6b" }}>
                  Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string | number;
  hint?: string;
  testId?: string;
}) {
  return (
    <div style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <div data-testid={testId} style={{ fontSize: 22, fontWeight: 700 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, opacity: 0.4 }}>{hint}</div>}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  compact,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  compact?: boolean;
  testId?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        background: "#1d1e24",
        borderRadius: 8,
        padding: compact ? "6px 10px" : "10px 14px",
      }}
    >
      <span style={{ fontSize: compact ? 13 : 14 }}>{label}</span>
      <input
        type="number"
        data-testid={testId}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: 56,
          background: "#0f1014",
          color: "inherit",
          border: "1px solid #333",
          borderRadius: 4,
          padding: "2px 6px",
          textAlign: "center",
        }}
      />
    </label>
  );
}
