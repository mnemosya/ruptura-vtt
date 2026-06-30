"use client";

/**
 * Página de DEBUG da ficha mínima — não é a interface final do VTT.
 *
 * Estado do personagem em edição é local (useState) até o usuário
 * clicar em "Salvar personagem" — aí é persistido na tabela
 * `characters` via Server Actions (src/lib/character/storage.ts).
 * Os derivados são recalculados automaticamente a cada render porque
 * dependem de `character.atributos` via useMemo.
 *
 * UI organizada em abas (useState local, sem lib nova) só para
 * preparar o crescimento futuro (inventário/magia/combate) sem
 * empilhar tudo numa página só — nenhuma regra muda por causa disso.
 */

import { useMemo, useState } from "react";
import { createInitialCharacter, computeDerivedStats, normalizeCharacter } from "../../../lib/character";
import { createCharacter, updateCharacter, getCharacter, listCharacters, deleteCharacter } from "../../../lib/character/storage";
import type {
  Character,
  CharacterAttributes,
  CharacterRecord,
  CharacterResources,
  CharacterRulesPayload,
  DerivedDefinition,
  DerivedStats,
} from "../../../lib/character";

interface Props {
  regras: CharacterRulesPayload | null;
  usandoFallback: boolean;
  personagensIniciais: CharacterRecord[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

const TABS = ["geral", "atributos", "pericias", "recursos", "personagens", "debug"] as const;
type TabId = (typeof TABS)[number];

const TAB_LABELS: Record<TabId, string> = {
  geral: "Geral",
  atributos: "Atributos",
  pericias: "Perícias",
  recursos: "Recursos",
  personagens: "Personagens salvos",
  debug: "Debug",
};

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

/** Recurso atual: inteiro, sem teto (pode passar do máximo), nunca negativo. */
function parseRecursoAtual(rawValue: number): number {
  if (!Number.isFinite(rawValue)) return 0;
  return Math.max(0, Math.trunc(rawValue));
}

const RECURSO_ATUAL_FIELDS = [
  { id: "pv", label: "PV atual", maxId: "pv_max" },
  { id: "pe", label: "PE atual", maxId: "pe_max" },
  { id: "mana", label: "Mana atual", maxId: "mana_max" },
  { id: "integridade", label: "Integridade atual", maxId: "integridade_max" },
] as const satisfies readonly { id: keyof CharacterResources; label: string; maxId: keyof DerivedStats }[];

function derivedMetaById(regras: CharacterRulesPayload | null, id: string): DerivedDefinition | undefined {
  return regras?.derivados.find((d) => d.id === id);
}

export default function CharacterSheetClient({ regras, usandoFallback, personagensIniciais }: Props) {
  const [character, setCharacter] = useState<Character>(() => createInitialCharacter(regras));
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [personagens, setPersonagens] = useState<CharacterRecord[]>(personagensIniciais);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("geral");

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

  /**
   * Edição manual de recursos atuais (PV/PE/Mana/Integridade). Aceita
   * só inteiro >= 0; não trava no máximo de propósito — combate/dano
   * fica para depois, aqui é só edição livre com aviso visual.
   */
  function updateRecursoAtual(id: keyof CharacterResources, rawValue: number) {
    setCharacter((prev) => ({
      ...prev,
      recursos_atuais: { ...prev.recursos_atuais, [id]: parseRecursoAtual(rawValue) },
    }));
  }

  function handleRestoreRecursosMax() {
    setCharacter((prev) => ({
      ...prev,
      recursos_atuais: {
        pv: derivados.pv_max,
        pe: derivados.pe_max,
        mana: derivados.mana_max,
        integridade: derivados.integridade_max,
      },
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

      <nav
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          borderBottom: "1px solid #333",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            data-testid={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "transparent",
              color: activeTab === tab ? "inherit" : "#888",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #4caf50" : "2px solid transparent",
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: activeTab === tab ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {TAB_LABELS[tab]}
            {tab === "personagens" ? ` (${personagens.length})` : ""}
          </button>
        ))}
      </nav>

      {activeTab === "geral" && (
        <Section title="Geral">
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

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button onClick={handleSave} disabled={saveState === "saving"} style={buttonStyle}>
              {saveState === "saving" ? "Salvando…" : "Salvar personagem"}
            </button>
            <button onClick={handleNew} style={buttonStyle}>
              Novo personagem
            </button>
            {saveState === "saved" && <span style={{ fontSize: 13, color: "#4caf50" }}>✓ Salvo</span>}
            {saveState === "error" && (
              <span style={{ fontSize: 13, color: "#ff6b6b" }}>Erro: {errorMessage}</span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, opacity: 0.7 }}>
            <span>id: {characterId ?? "ainda não salvo"}</span>
            <span>schema version: {character.metadados?.schema_version ?? "—"}</span>
          </div>
        </Section>
      )}

      {activeTab === "atributos" && (
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
      )}

      {activeTab === "pericias" && (
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
      )}

      {activeTab === "recursos" && (
        <>
          <Section title="Derivados (máximos)">
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

          <Section title="Recursos atuais">
            <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
              Edição manual (inteiro, sem negativo). Sem regra de dano/cura/gasto ainda —
              isso fica para a etapa de combate.
            </p>
            <button onClick={handleRestoreRecursosMax} style={{ ...buttonStyle, marginBottom: 12 }}>
              Restaurar recursos ao máximo
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              {RECURSO_ATUAL_FIELDS.map(({ id, label, maxId }) => (
                <ResourceField
                  key={id}
                  testId={`recurso-atual-${id}`}
                  label={label}
                  value={character.recursos_atuais?.[id] ?? 0}
                  max={derivados[maxId]}
                  onChange={(v) => updateRecursoAtual(id, v)}
                />
              ))}
            </div>
          </Section>
        </>
      )}

      {activeTab === "personagens" && (
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
      )}

      {activeTab === "debug" && (
        <Section title="Debug">
          <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
            Informações técnicas simples — nunca o payload inteiro, nunca variáveis de
            ambiente ou chaves.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontFamily: "monospace" }}>
            <span>selectedCharacterId: {characterId ?? "null"}</span>
            <span>schema_version: {character.metadados?.schema_version ?? "—"}</span>
            <span>saveState: {saveState}</span>
            <span>errorMessage: {errorMessage ?? "null"}</span>
            <span>personagens salvos (count): {personagens.length}</span>
            <span>usandoFallback (regras_personagem): {String(usandoFallback)}</span>
          </div>
        </Section>
      )}
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

function ResourceField({
  label,
  value,
  max,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  testId?: string;
  onChange: (value: number) => void;
}) {
  const acimaDoMaximo = value > max;
  return (
    <div style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="number"
          data-testid={testId}
          value={value}
          min={0}
          step={1}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: 64,
            fontSize: 18,
            fontWeight: 700,
            background: "#0f1014",
            color: "inherit",
            border: "1px solid #333",
            borderRadius: 4,
            padding: "4px 6px",
            textAlign: "center",
          }}
        />
        <span style={{ fontSize: 13, opacity: 0.5 }}>/ {max}</span>
      </div>
      {acimaDoMaximo && (
        <div data-testid={testId ? `${testId}-aviso` : undefined} style={{ fontSize: 11, color: "#f5a623", marginTop: 4 }}>
          acima do máximo
        </div>
      )}
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
