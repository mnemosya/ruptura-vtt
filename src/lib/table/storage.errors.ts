/**
 * Erro de persistência de Mesa/Log. Separado de storage.ts porque
 * arquivos "use server" só podem exportar funções assíncronas — não
 * classes (mesmo padrão de src/lib/character/storage.errors.ts).
 */
export class TableStorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TableStorageError";
  }
}
