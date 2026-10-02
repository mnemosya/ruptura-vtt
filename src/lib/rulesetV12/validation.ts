import {
  CLASS_FEATURE_RANKINGS_V12,
  RANKINGS_V12,
  REGIOES_V12,
  RUPTURA_V12_CHARACTER_SCHEMA_VERSION,
  RUPTURA_V12_CONTENT_SCHEMA_VERSION,
  RUPTURA_V12_RULESET_VERSION,
  SUBCLASS_FEATURE_RANKINGS_V12,
  type BackgroundContentV12,
  type CharacterV2,
  type ClassContentV12,
  type ComplicationContentV12,
  type QualityContentV12,
  type RankingV12,
  type RulesetContentBundleV12,
  type SubclassContentV12,
} from "./contracts";

export interface ValidationResultV12<T> {
  ok: boolean;
  errors: string[];
  value?: T;
}

type UnknownRecord = Record<string, unknown>;

const SLUG_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const RANK_INDEX = new Map<RankingV12, number>(RANKINGS_V12.map((ranking, index) => [ranking, index]));

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function requireRecord(value: unknown, path: string, errors: string[]): UnknownRecord {
  const result = record(value);
  if (!result) errors.push(`${path}: objeto obrigatório ausente ou inválido.`);
  return result ?? {};
}

function requireString(value: unknown, path: string, errors: string[]): string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path}: texto obrigatório ausente.`);
    return "";
  }
  return value;
}

/** Texto narrativo opcional: precisa ser texto, pode ficar vazio. */
function optionalString(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string") errors.push(`${path}: esperado texto (pode ficar vazio).`);
}

function requireSlug(value: unknown, path: string, errors: string[]): string {
  const slug = requireString(value, path, errors);
  if (slug && !SLUG_PATTERN.test(slug)) errors.push(`${path}: slug inválido; use minúsculas, números e underscore.`);
  return slug;
}

function requireStringArray(value: unknown, path: string, errors: string[], min = 0): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${path}: lista de textos inválida.`);
    return [];
  }
  if (value.length < min) errors.push(`${path}: requer ao menos ${min} item(ns).`);
  return value as string[];
}

function validateEnvelope(value: UnknownRecord, errors: string[]): void {
  if (value.schema_version !== RUPTURA_V12_CONTENT_SCHEMA_VERSION) {
    errors.push(`schema_version: esperado ${RUPTURA_V12_CONTENT_SCHEMA_VERSION}.`);
  }
  if (value.ruleset_version !== RUPTURA_V12_RULESET_VERSION) {
    errors.push(`ruleset_version: esperado "${RUPTURA_V12_RULESET_VERSION}".`);
  }
  requireSlug(value.slug, "slug", errors);
  requireString(value.nome, "nome", errors);
  requireString(value.descricao, "descricao", errors);
}

function result<T>(value: unknown, errors: string[]): ValidationResultV12<T> {
  return errors.length === 0 ? { ok: true, errors, value: value as T } : { ok: false, errors };
}

export function validateClassContentV12(value: unknown): ValidationResultV12<ClassContentV12> {
  const errors: string[] = [];
  const root = requireRecord(value, "$", errors);
  validateEnvelope(root, errors);
  requireString(root.papel_principal, "papel_principal", errors);
  requireStringArray(root.papeis_secundarios, "papeis_secundarios", errors);
  const creation = requireRecord(root.criacao, "criacao", errors);

  const attributeProfiles = Array.isArray(creation.perfis_atributos) ? creation.perfis_atributos : [];
  if (attributeProfiles.length === 0) errors.push("criacao.perfis_atributos: ao menos um perfil é obrigatório.");
  attributeProfiles.forEach((profile, index) => {
    const item = requireRecord(profile, `criacao.perfis_atributos[${index}]`, errors);
    requireSlug(item.slug, `criacao.perfis_atributos[${index}].slug`, errors);
    requireString(item.nome, `criacao.perfis_atributos[${index}].nome`, errors);
    const values = item.valores;
    if (!Array.isArray(values) || values.length !== 3 || values.some((v) => !Number.isInteger(v) || (v as number) < 0 || (v as number) > 3)) {
      errors.push(`criacao.perfis_atributos[${index}].valores: esperado trio inteiro entre 0 e 3.`);
    } else if ((values as number[]).reduce((sum, current) => sum + current, 0) !== 4) {
      errors.push(`criacao.perfis_atributos[${index}].valores: a distribuição inicial deve somar 4.`);
    }
  });

  const skillProfiles = Array.isArray(creation.perfis_pericias) ? creation.perfis_pericias : [];
  if (skillProfiles.length === 0) errors.push("criacao.perfis_pericias: ao menos um perfil é obrigatório.");
  skillProfiles.forEach((profile, index) => {
    const item = requireRecord(profile, `criacao.perfis_pericias[${index}]`, errors);
    requireSlug(item.slug, `criacao.perfis_pericias[${index}].slug`, errors);
    const quantities = requireRecord(item.quantidades, `criacao.perfis_pericias[${index}].quantidades`, errors);
    for (const key of ["valor_1", "valor_2", "valor_3"] as const) {
      if (!Number.isInteger(quantities[key]) || (quantities[key] as number) < 0) {
        errors.push(`criacao.perfis_pericias[${index}].quantidades.${key}: inteiro não negativo obrigatório.`);
      }
    }
  });
  requireStringArray(creation.pericias_valor_3, "criacao.pericias_valor_3", errors, 1);
  requireStringArray(creation.pericias_valor_2, "criacao.pericias_valor_2", errors, 1);

  const features = requireRecord(root.caracteristicas, "caracteristicas", errors);
  const featureSlugs = new Set<string>();
  for (const ranking of CLASS_FEATURE_RANKINGS_V12) {
    const lista = features[ranking];
    if (!Array.isArray(lista) || lista.length === 0) {
      errors.push(`caracteristicas.${ranking}: ao menos uma característica é obrigatória.`);
      continue;
    }
    lista.forEach((entry, index) => {
      const feature = requireRecord(entry, `caracteristicas.${ranking}[${index}]`, errors);
      const slug = requireSlug(feature.slug, `caracteristicas.${ranking}[${index}].slug`, errors);
      if (slug && featureSlugs.has(slug)) errors.push(`caracteristicas.${ranking}[${index}].slug: slug duplicado "${slug}" na Classe.`);
      featureSlugs.add(slug);
      requireString(feature.nome, `caracteristicas.${ranking}[${index}].nome`, errors);
      requireString(feature.descricao, `caracteristicas.${ranking}[${index}].descricao`, errors);
    });
  }
  for (const ranking of SUBCLASS_FEATURE_RANKINGS_V12) {
    if (features[ranking] !== undefined) errors.push(`caracteristicas.${ranking}: características de Subclasse não pertencem ao documento de Classe.`);
  }

  requireStringArray(root.subclasses, "subclasses", errors, 1);
  const progression = requireRecord(root.progressao, "progressao", errors);
  const expectedPa: Record<RankingV12, number> = { F: 3, E: 3, D: 3, C: 4, B: 4, A: 4, S: 5, "S+": 5 };
  const expectedLimit: Record<RankingV12, number> = { F: 3, E: 3, D: 3, C: 4, B: 4, A: 5, S: 5, "S+": 5 };
  const expectedSkillPoints: Record<RankingV12, number> = { F: 0, E: 2, D: 0, C: 2, B: 0, A: 2, S: 0, "S+": 2 };
  const expectedAttributePoints: Record<RankingV12, number> = { F: 0, E: 0, D: 1, C: 0, B: 1, A: 0, S: 1, "S+": 0 };
  const expectedBranchPoints: Record<RankingV12, number> = { F: 0, E: 1, D: 0, C: 1, B: 0, A: 1, S: 0, "S+": 1 };
  const expectedSpells: Record<RankingV12, number> = { F: 0, E: 0, D: 1, C: 0, B: 1, A: 0, S: 1, "S+": 0 };
  for (const ranking of RANKINGS_V12) {
    const advancement = requireRecord(progression[ranking], `progressao.${ranking}`, errors);
    if (advancement.ranking !== ranking) errors.push(`progressao.${ranking}.ranking: deve ser "${ranking}".`);
    if (advancement.pa !== expectedPa[ranking]) errors.push(`progressao.${ranking}.pa: esperado ${expectedPa[ranking]}.`);
    if (advancement.limite_pericia !== expectedLimit[ranking]) errors.push(`progressao.${ranking}.limite_pericia: esperado ${expectedLimit[ranking]}.`);
    if (advancement.pontos_pericia !== expectedSkillPoints[ranking]) errors.push(`progressao.${ranking}.pontos_pericia: esperado ${expectedSkillPoints[ranking]}.`);
    if (advancement.pontos_atributo !== expectedAttributePoints[ranking]) errors.push(`progressao.${ranking}.pontos_atributo: esperado ${expectedAttributePoints[ranking]}.`);
    if (advancement.pontos_vertente !== expectedBranchPoints[ranking]) errors.push(`progressao.${ranking}.pontos_vertente: esperado ${expectedBranchPoints[ranking]}.`);
    if (advancement.magias_adicionais !== expectedSpells[ranking]) errors.push(`progressao.${ranking}.magias_adicionais: esperado ${expectedSpells[ranking]}.`);
    if (advancement.escolhe_subclasse !== (ranking === "E")) errors.push(`progressao.${ranking}.escolhe_subclasse: deve ser ${ranking === "E"}.`);
  }
  return result<ClassContentV12>(value, errors);
}

export function validateSubclassContentV12(value: unknown): ValidationResultV12<SubclassContentV12> {
  const errors: string[] = [];
  const root = requireRecord(value, "$", errors);
  validateEnvelope(root, errors);
  requireSlug(root.classe_slug, "classe_slug", errors);
  const features = requireRecord(root.caracteristicas, "caracteristicas", errors);
  for (const ranking of SUBCLASS_FEATURE_RANKINGS_V12) {
    if (!Array.isArray(features[ranking]) || features[ranking].length === 0) {
      errors.push(`caracteristicas.${ranking}: ao menos uma característica é obrigatória.`);
      continue;
    }
    (features[ranking] as unknown[]).forEach((entry, index) => {
      const feature = requireRecord(entry, `caracteristicas.${ranking}[${index}]`, errors);
      requireSlug(feature.slug, `caracteristicas.${ranking}[${index}].slug`, errors);
      requireString(feature.nome, `caracteristicas.${ranking}[${index}].nome`, errors);
      requireString(feature.descricao, `caracteristicas.${ranking}[${index}].descricao`, errors);
    });
  }
  for (const ranking of CLASS_FEATURE_RANKINGS_V12) {
    if (features[ranking] !== undefined) errors.push(`caracteristicas.${ranking}: Subclasse só concede características em E, C e A.`);
  }
  return result<SubclassContentV12>(value, errors);
}

export function validateBackgroundContentV12(value: unknown): ValidationResultV12<BackgroundContentV12> {
  const errors: string[] = [];
  const root = requireRecord(value, "$", errors);
  validateEnvelope(root, errors);
  requireString(root.familiaridade, "familiaridade", errors);
  const resource = requireRecord(root.recurso_por_sessao, "recurso_por_sessao", errors);
  if (resource.usos !== 1) errors.push("recurso_por_sessao.usos: Antecedente v1.2 possui exatamente 1 uso por sessão.");
  requireStringArray(resource.opcoes, "recurso_por_sessao.opcoes", errors, 2);
  return result<BackgroundContentV12>(value, errors);
}

function validateTrajectoryOptionV12<T extends QualityContentV12 | ComplicationContentV12>(value: unknown): ValidationResultV12<T> {
  const errors: string[] = [];
  const root = requireRecord(value, "$", errors);
  validateEnvelope(root, errors);
  requireString(root.categoria, "categoria", errors);
  if (!Array.isArray(root.custos_permitidos) || root.custos_permitidos.length === 0 || root.custos_permitidos.some((cost) => cost !== 1 && cost !== 2)) {
    errors.push("custos_permitidos: informe uma lista não vazia contendo apenas 1 e/ou 2.");
  }
  return result<T>(value, errors);
}

export const validateQualityContentV12 = (value: unknown): ValidationResultV12<QualityContentV12> => validateTrajectoryOptionV12(value);
export const validateComplicationContentV12 = (value: unknown): ValidationResultV12<ComplicationContentV12> => validateTrajectoryOptionV12(value);

export function validateRulesetContentBundleV12(value: unknown): ValidationResultV12<RulesetContentBundleV12> {
  const errors: string[] = [];
  const root = requireRecord(value, "$", errors);
  const collections = {
    classes: Array.isArray(root.classes) ? root.classes : [],
    subclasses: Array.isArray(root.subclasses) ? root.subclasses : [],
    backgrounds: Array.isArray(root.backgrounds) ? root.backgrounds : [],
    qualities: Array.isArray(root.qualities) ? root.qualities : [],
    complications: Array.isArray(root.complications) ? root.complications : [],
  };
  for (const key of Object.keys(collections) as Array<keyof typeof collections>) {
    if (!Array.isArray(root[key])) errors.push(`${key}: coleção obrigatória ausente.`);
  }

  const validators = {
    classes: validateClassContentV12,
    subclasses: validateSubclassContentV12,
    backgrounds: validateBackgroundContentV12,
    qualities: validateQualityContentV12,
    complications: validateComplicationContentV12,
  } as const;

  for (const key of Object.keys(collections) as Array<keyof typeof collections>) {
    const seen = new Set<string>();
    collections[key].forEach((entry, index) => {
      const validation = validators[key](entry as never);
      errors.push(...validation.errors.map((error) => `${key}[${index}].${error}`));
      const slug = record(entry)?.slug;
      if (typeof slug === "string") {
        if (seen.has(slug)) errors.push(`${key}[${index}].slug: slug duplicado "${slug}".`);
        seen.add(slug);
      }
    });
  }

  const classesBySlug = new Map(collections.classes.flatMap((entry) => {
    const item = record(entry);
    return typeof item?.slug === "string" ? [[item.slug, item] as const] : [];
  }));
  const subclassesBySlug = new Map(collections.subclasses.flatMap((entry) => {
    const item = record(entry);
    return typeof item?.slug === "string" ? [[item.slug, item] as const] : [];
  }));

  for (const [classSlug, classEntry] of classesBySlug) {
    if (!Array.isArray(classEntry.subclasses)) continue;
    for (const subclassSlug of classEntry.subclasses) {
      if (typeof subclassSlug !== "string") continue;
      const subclass = subclassesBySlug.get(subclassSlug);
      if (!subclass) {
        errors.push(`classes.${classSlug}.subclasses: referência ausente "${subclassSlug}".`);
      } else if (subclass.classe_slug !== classSlug) {
        errors.push(`subclasses.${subclassSlug}.classe_slug: esperado "${classSlug}" para corresponder à Classe que o lista.`);
      }
    }
  }
  for (const [subclassSlug, subclass] of subclassesBySlug) {
    if (typeof subclass.classe_slug !== "string") continue;
    const owner = classesBySlug.get(subclass.classe_slug);
    if (!owner) {
      errors.push(`subclasses.${subclassSlug}.classe_slug: Classe ausente "${subclass.classe_slug}".`);
    } else if (!Array.isArray(owner.subclasses) || !owner.subclasses.includes(subclassSlug)) {
      errors.push(`classes.${subclass.classe_slug}.subclasses: precisa listar a Subclasse "${subclassSlug}".`);
    }
  }

  return result<RulesetContentBundleV12>(value, errors);
}

export function validateCharacterV2(value: unknown): ValidationResultV12<CharacterV2> {
  const errors: string[] = [];
  const root = requireRecord(value, "$", errors);
  if (root.schema_version !== RUPTURA_V12_CHARACTER_SCHEMA_VERSION) errors.push(`schema_version: esperado ${RUPTURA_V12_CHARACTER_SCHEMA_VERSION}.`);
  if (root.ruleset_version !== RUPTURA_V12_RULESET_VERSION) errors.push(`ruleset_version: esperado "${RUPTURA_V12_RULESET_VERSION}".`);
  requireString(root.nome, "nome", errors);
  const attributes = requireRecord(root.atributos, "atributos", errors);
  for (const attribute of ["corpo", "mente", "animo"] as const) {
    const value = attributes[attribute];
    if (!Number.isInteger(value) || !Number.isFinite(value) || (value as number) > 5) {
      errors.push(`atributos.${attribute}: inteiro até 5 obrigatório.`);
    }
  }
  const skills = requireRecord(root.pericias, "pericias", errors);
  for (const [slug, value] of Object.entries(skills)) {
    if (!SLUG_PATTERN.test(slug) || !Number.isInteger(value) || (value as number) < 0 || (value as number) > 5) {
      errors.push(`pericias.${slug}: esperado inteiro entre 0 e 5 com slug válido.`);
    }
  }

  const trajectory = requireRecord(root.trajetoria, "trajetoria", errors);
  const regiao = requireSlug(trajectory.regiao_id, "trajetoria.regiao_id", errors);
  if (regiao && !(regiao in REGIOES_V12)) errors.push(`trajetoria.regiao_id: "${regiao}" não é uma das cinco regiões do Império.`);
  requireString(trajectory.local_origem, "trajetoria.local_origem", errors);
  requireStringArray(trajectory.idiomas, "trajetoria.idiomas", errors, 1);
  const background = requireRecord(trajectory.antecedente, "trajetoria.antecedente", errors);
  requireSlug(background.antecedente_id, "trajetoria.antecedente.antecedente_id", errors);
  // Meio, Papel, Relação atual, a transformação e os dados do RPI são
  // narrativos: ficam entre jogador e narrador e podem ficar vazios.
  optionalString(background.meio, "trajetoria.antecedente.meio", errors);
  optionalString(background.papel, "trajetoria.antecedente.papel", errors);
  optionalString(background.relacao_atual, "trajetoria.antecedente.relacao_atual", errors);
  const transformation = requireRecord(trajectory.transformacao_refratario, "trajetoria.transformacao_refratario", errors);
  for (const key of ["estopim", "primeiros_passos", "consequencia"] as const) optionalString(transformation[key], `trajetoria.transformacao_refratario.${key}`, errors);
  for (const key of ["conceito", "aparencia", "relato_refratario"] as const) {
    if (trajectory[key] !== undefined) optionalString(trajectory[key], `trajetoria.${key}`, errors);
  }
  const rpi = requireRecord(trajectory.rpi_forjado, "trajetoria.rpi_forjado", errors);
  if (rpi.nivel !== 1) errors.push("trajetoria.rpi_forjado.nivel: personagem novo começa com RPI Forjado de nível 1.");
  for (const key of ["nome_registrado", "ocupacao_declarada", "origem"] as const) optionalString(rpi[key], `trajetoria.rpi_forjado.${key}`, errors);

  const qualities = Array.isArray(trajectory.qualidades) ? trajectory.qualidades : [];
  const complications = Array.isArray(trajectory.complicacoes) ? trajectory.complicacoes : [];
  qualities.forEach((entry, index) => {
    const item = requireRecord(entry, `trajetoria.qualidades[${index}]`, errors);
    requireSlug(item.quality_id, `trajetoria.qualidades[${index}].quality_id`, errors);
    if (item.pontos !== 1 && item.pontos !== 2) errors.push(`trajetoria.qualidades[${index}].pontos: esperado 1 ou 2.`);
    requireRecord(item.detalhes, `trajetoria.qualidades[${index}].detalhes`, errors);
  });
  complications.forEach((entry, index) => {
    const item = requireRecord(entry, `trajetoria.complicacoes[${index}]`, errors);
    requireSlug(item.complication_id, `trajetoria.complicacoes[${index}].complication_id`, errors);
    if (item.pontos !== 1 && item.pontos !== 2) errors.push(`trajetoria.complicacoes[${index}].pontos: esperado 1 ou 2.`);
    requireRecord(item.detalhes, `trajetoria.complicacoes[${index}].detalhes`, errors);
  });
  const qualityBudget = qualities.reduce((sum, entry) => sum + (record(entry)?.pontos === 2 ? 2 : record(entry)?.pontos === 1 ? 1 : 0), 0);
  const complicationBudget = complications.reduce((sum, entry) => sum + (record(entry)?.pontos === 2 ? 2 : record(entry)?.pontos === 1 ? 1 : 0), 0);
  if (qualityBudget !== 3) errors.push(`trajetoria.qualidades: orçamento deve somar 3; recebido ${qualityBudget}.`);
  // Mínimo de 2: Complicações adicionais são permitidas quando o grupo concorda (cap. 8).
  if (complicationBudget < 2) errors.push(`trajetoria.complicacoes: orçamento deve somar ao menos 2; recebido ${complicationBudget}.`);

  const progression = requireRecord(root.progressao, "progressao", errors);
  requireSlug(progression.classe_id, "progressao.classe_id", errors);
  if (!RANKINGS_V12.includes(progression.ranking as RankingV12)) errors.push("progressao.ranking: Ranking inválido.");
  const rankingIndex = RANK_INDEX.get(progression.ranking as RankingV12);
  if (rankingIndex !== undefined && rankingIndex >= (RANK_INDEX.get("E") ?? 1)) requireSlug(progression.subclasse_id, "progressao.subclasse_id", errors);
  if (rankingIndex === 0 && progression.subclasse_id !== undefined) errors.push("progressao.subclasse_id: Ranking F ainda não escolheu Subclasse.");

  const magic = requireRecord(root.magia, "magia", errors);
  requireSlug(magic.vertente_primaria, "magia.vertente_primaria", errors);
  const branchLevels = requireRecord(magic.niveis_vertente, "magia.niveis_vertente", errors);
  const primaryLevel = branchLevels[magic.vertente_primaria as string];
  if (!Number.isInteger(primaryLevel) || (primaryLevel as number) < 1) errors.push("magia.niveis_vertente: a Vertente Primária precisa ter ao menos nível 1.");
  requireStringArray(magic.magias_aprendidas, "magia.magias_aprendidas", errors);
  return result<CharacterV2>(value, errors);
}

export function isCharacterV2(value: unknown): value is CharacterV2 {
  return validateCharacterV2(value).ok;
}
