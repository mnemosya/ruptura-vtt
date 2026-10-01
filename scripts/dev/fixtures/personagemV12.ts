/** Versão tipada de `personagemV12.mjs` para os scripts em TypeScript. */
import type { Character } from "../../../src/lib/character";
import { personagemV12 as impl } from "./personagemV12.mjs";

export function personagemV12(nome: string, extra: Record<string, unknown> = {}): Character {
  return impl(nome, extra) as Character;
}
