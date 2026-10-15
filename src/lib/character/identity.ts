/** Dossiê narrativo. Não altera as escolhas mecânicas da criação/progressão. */
export interface IdentityDossier {
  /** Registros manuais por subclasse, serializados para o dossiê. */
  acompanhamento_classes?: string;
  codinome?: string;
  local_origem?: string;
  pronomes?: string;
  conceito?: string;
  aparencia?: string;
  historia?: string;
  objetivo?: string;
  conviccao?: string;
  temor?: string;
  vinculos?: string;
  pendencias?: string;
  credenciais?: string;
  registros_alternativos?: string;
  nome_registrado?: string;
  ocupacao?: string;
  origem?: string;
  id_sinaptico?: string;
  nivel_rpi?: string;
  situacao_rpi?: string;
  sinalizado_por?: string;
  alcance_registro?: string;
}

export function readIdentityDossier(value: unknown): IdentityDossier {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string"));
}
