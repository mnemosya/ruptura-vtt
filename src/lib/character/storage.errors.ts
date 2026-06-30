/**
 * Erro de persistência de personagem. Separado de storage.ts porque
 * arquivos "use server" só podem exportar funções assíncronas — não
 * classes.
 */
export class CharacterStorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "CharacterStorageError";
  }
}
