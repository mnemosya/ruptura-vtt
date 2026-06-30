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
 *
 * Este componente é o único que guarda estado e Server Actions; os
 * componentes em ./components são só apresentação — recebem dados e
 * callbacks via props, sem estado próprio (exceto estado visual
 * trivial, se algum dia precisar) e sem acesso direto ao Supabase.
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
} from "../../../lib/character";
import { CharacterSheetTabs, type TabId } from "./components/CharacterSheetTabs";
import { GeneralTab } from "./components/GeneralTab";
import { AttributesTab } from "./components/AttributesTab";
import { SkillsTab } from "./components/SkillsTab";
import { ResourcesTab } from "./components/ResourcesTab";
import { SavedCharactersTab } from "./components/SavedCharactersTab";
import { DebugTab } from "./components/DebugTab";
import type { SheetMode } from "./components/ModeToggle";

interface Props {
  regras: CharacterRulesPayload | null;
  usandoFallback: boolean;
  personagensIniciais: CharacterRecord[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Recurso atual: inteiro, sem teto (pode passar do máximo), nunca negativo. */
function parseRecursoAtual(rawValue: number): number {
  if (!Number.isFinite(rawValue)) return 0;
  return Math.max(0, Math.trunc(rawValue));
}

export default function CharacterSheetClient({ regras, usandoFallback, personagensIniciais }: Props) {
  const [character, setCharacter] = useState<Character>(() => createInitialCharacter(regras));
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [personagens, setPersonagens] = useState<CharacterRecord[]>(personagensIniciais);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("geral");
  // Estado de UI local — não vai para o payload salvo (ver handleSave).
  const [sheetMode, setSheetMode] = useState<SheetMode>("jogo");

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
    // Defesa em profundidade: o input já vem `disabled` em Modo Jogo
    // (não dispara onChange), mas o handler também recusa por garantia.
    if (sheetMode === "jogo") return;
    const def = regras?.atributos.find((a) => a.id === id);
    const min = def?.valor_minimo ?? 1;
    const max = def?.valor_maximo ?? 5;
    setCharacter((prev) => ({
      ...prev,
      atributos: { ...prev.atributos, [id]: clamp(rawValue, min, max) },
    }));
  }

  function updatePericia(id: string, rawValue: number) {
    if (sheetMode === "jogo") return;
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

      <CharacterSheetTabs activeTab={activeTab} personagensCount={personagens.length} onChange={setActiveTab} />

      {activeTab === "geral" && (
        <GeneralTab
          nome={character.nome}
          characterId={characterId}
          schemaVersion={character.metadados?.schema_version}
          saveState={saveState}
          errorMessage={errorMessage}
          sheetMode={sheetMode}
          onModeChange={setSheetMode}
          onNomeChange={(value) => setCharacter((prev) => ({ ...prev, nome: value }))}
          onSave={handleSave}
          onNew={handleNew}
        />
      )}

      {activeTab === "atributos" && (
        <AttributesTab
          atributos={character.atributos}
          definitions={regras?.atributos}
          readOnly={sheetMode === "jogo"}
          onChange={updateAtributo}
        />
      )}

      {activeTab === "pericias" && (
        <SkillsTab
          pericias={character.pericias}
          definitions={regras?.pericias}
          readOnly={sheetMode === "jogo"}
          onChange={updatePericia}
        />
      )}

      {activeTab === "recursos" && (
        <ResourcesTab
          regras={regras}
          derivados={derivados}
          recursosAtuais={character.recursos_atuais}
          onChangeRecursoAtual={updateRecursoAtual}
          onRestoreMax={handleRestoreRecursosMax}
        />
      )}

      {activeTab === "personagens" && (
        <SavedCharactersTab
          personagens={personagens}
          characterId={characterId}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      )}

      {activeTab === "debug" && (
        <DebugTab
          characterId={characterId}
          schemaVersion={character.metadados?.schema_version}
          saveState={saveState}
          errorMessage={errorMessage}
          personagensCount={personagens.length}
          usandoFallback={usandoFallback}
        />
      )}
    </main>
  );
}
