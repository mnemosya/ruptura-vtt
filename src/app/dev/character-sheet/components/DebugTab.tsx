import { Section } from "./Section";

type SaveState = "idle" | "saving" | "saved" | "error";

export function DebugTab({
  characterId,
  schemaVersion,
  saveState,
  errorMessage,
  personagensCount,
  usandoFallback,
}: {
  characterId: string | null;
  schemaVersion: number | undefined;
  saveState: SaveState;
  errorMessage: string | null;
  personagensCount: number;
  usandoFallback: boolean;
}) {
  return (
    <Section title="Debug">
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
        Informações técnicas simples — nunca o payload inteiro, nunca variáveis de ambiente
        ou chaves.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontFamily: "monospace" }}>
        <span>selectedCharacterId: {characterId ?? "null"}</span>
        <span>schema_version: {schemaVersion ?? "—"}</span>
        <span>saveState: {saveState}</span>
        <span>errorMessage: {errorMessage ?? "null"}</span>
        <span>personagens salvos (count): {personagensCount}</span>
        <span>usandoFallback (regras_personagem): {String(usandoFallback)}</span>
      </div>
    </Section>
  );
}
