import assert from "node:assert/strict";
import {
  validateBackgroundContentV12,
  validateCharacterV2,
  validateClassContentV12,
  validateComplicationContentV12,
  validateQualityContentV12,
  validateRulesetContentBundleV12,
  validateSubclassContentV12,
} from "../src/lib/rulesetV12";

const progression = Object.fromEntries(
  [
    ["F", 3, 3, false],
    ["E", 3, 3, true],
    ["D", 3, 3, false],
    ["C", 4, 4, false],
    ["B", 4, 4, false],
    ["A", 4, 5, false],
    ["S", 5, 5, false],
    ["S+", 5, 5, false],
  ].map(([ranking, pa, limite, escolhe]) => [ranking, {
    ranking,
    pontos_pericia: ["E", "C", "A", "S+"].includes(ranking as string) ? 2 : 0,
    limite_pericia: limite,
    pontos_atributo: ["D", "B", "S"].includes(ranking as string) ? 1 : 0,
    pontos_vertente: ["E", "C", "A", "S+"].includes(ranking as string) ? 1 : 0,
    magias_adicionais: ["D", "B", "S"].includes(ranking as string) ? 1 : 0,
    pa,
    escolhe_subclasse: escolhe,
  }]),
);

const feature = (slug: string) => ({ slug, nome: slug, descricao: "Descrição canônica." });

const anchor = {
  schema_version: 1,
  ruleset_version: "1.2",
  slug: "ancora",
  nome: "Âncora",
  descricao: "Sustenta o grupo sob pressão.",
  papel_principal: "Sustentação",
  papeis_secundarios: ["Coordenação", "Recuperação"],
  criacao: {
    perfis_atributos: [
      { slug: "equilibrada", nome: "Equilibrada", valores: [2, 1, 1] },
      { slug: "concentrada", nome: "Concentrada", valores: [2, 2, 0] },
      { slug: "especializada", nome: "Especializada", valores: [3, 1, 0] },
    ],
    perfis_pericias: [{ slug: "padrao", nome: "Padrão", quantidades: { valor_1: 7, valor_2: 3, valor_3: 2 } }],
    pericias_valor_3: ["biologia", "medicina"],
    pericias_valor_2: ["biologia", "medicina", "vigor"],
    pericias_valor_1: "qualquer_nao_escolhida",
    recursos: { pv: { constante: 10, atributo: "corpo", multiplicador_atributo: 1, texto: "10 + Corpo" } },
    vertentes_primarias: "qualquer",
    equipamento_inicial: { aretz: 3000, espacos_mochila: 10, itens: [] },
  },
  caracteristicas: { F: [feature("ponto_de_apoio")], D: [feature("atencao_dividida")], B: [feature("rede_de_apoio")], S: [feature("a_operacao_continua")] },
  subclasses: ["coordenador", "terapeuta", "vitalista"],
  progressao: progression,
};

assert.equal(validateClassContentV12(anchor).ok, true, JSON.stringify(validateClassContentV12(anchor).errors));
assert.equal(validateClassContentV12({ ...anchor, criacao: { ...anchor.criacao, perfis_atributos: [{ slug: "quebrado", nome: "Quebrado", valores: [3, 3, 0] }] } }).ok, false);
assert.equal(validateClassContentV12({ ...anchor, progressao: { ...anchor.progressao, C: { ...anchor.progressao.C, pa: 3 } } }).ok, false, "Ranking C precisa conceder 4 PA");

const subclass = {
  schema_version: 1, ruleset_version: "1.2", slug: "vitalista", nome: "Vitalista", descricao: "Atendimento de emergência.", classe_slug: "ancora",
  caracteristicas: { E: [feature("atendimento")], C: [feature("triagem_de_combate")], A: [feature("janela_de_reanimacao")] },
};
assert.equal(validateSubclassContentV12(subclass).ok, true, JSON.stringify(validateSubclassContentV12(subclass).errors));
assert.equal(validateSubclassContentV12({ ...subclass, caracteristicas: { ...subclass.caracteristicas, D: [feature("ilegal")] } }).ok, false);

const background = { schema_version: 1, ruleset_version: "1.2", slug: "academico", nome: "Acadêmico", descricao: "Vida acadêmica.", familiaridade: "Rotina universitária.", recurso_por_sessao: { usos: 1, opcoes: ["Perguntar", "Receber vantagem"] } };
assert.equal(validateBackgroundContentV12(background).ok, true);

const option = { schema_version: 1, ruleset_version: "1.2", slug: "contato", nome: "Contato", descricao: "Uma pessoa confiável.", categoria: "relacoes", custos_permitidos: [1] };
assert.equal(validateQualityContentV12(option).ok, true);
assert.equal(validateComplicationContentV12({ ...option, slug: "desertor", custos_permitidos: [1, 2] }).ok, true);

const bundle = {
  classes: [anchor],
  subclasses: [
    { ...subclass, slug: "coordenador", nome: "Coordenador" },
    { ...subclass, slug: "terapeuta", nome: "Terapeuta" },
    subclass,
  ],
  backgrounds: [background],
  qualities: [option],
  complications: [{ ...option, slug: "desertor", nome: "Desertor", custos_permitidos: [1, 2] }],
};
assert.equal(validateRulesetContentBundleV12(bundle).ok, true, JSON.stringify(validateRulesetContentBundleV12(bundle).errors));
assert.equal(validateRulesetContentBundleV12({ ...bundle, subclasses: [subclass] }).ok, false, "Referências ausentes precisam falhar");

const character = {
  schema_version: 2,
  ruleset_version: "1.2",
  nome: "Teste",
  atributos: { corpo: 2, mente: 1, animo: 1 },
  pericias: {},
  trajetoria: {
    regiao_id: "vastra", local_origem: "Vosek", idiomas: ["vastrano"],
    antecedente: { antecedente_id: "academico", meio: "Universidade", papel: "Pesquisador", relacao_atual: "Afastado" },
    transformacao_refratario: { estopim: "Fuga", primeiros_passos: "Contato", consequencia: "Perdeu o cargo" },
    rpi_forjado: { nivel: 1, nome_registrado: "Nome falso", ocupacao_declarada: "Técnico", origem: "Mercado Noturno" },
    qualidades: [{ quality_id: "aliado", pontos: 2, detalhes: {} }, { quality_id: "contato", pontos: 1, detalhes: {} }],
    complicacoes: [{ complication_id: "desertor", pontos: 2, detalhes: {} }],
  },
  progressao: { classe_id: "ancora", ranking: "F", escolhas_por_ranking: { F: {} } },
  magia: { vertente_primaria: "biotica", niveis_vertente: { biotica: 1 }, magias_aprendidas: [] },
};
assert.equal(validateCharacterV2(character).ok, true, JSON.stringify(validateCharacterV2(character).errors));
assert.equal(validateCharacterV2({ ...character, progressao: { ...character.progressao, ranking: "E" } }).ok, false, "Ranking E exige Subclasse");
assert.equal(validateCharacterV2({ ...character, trajetoria: { ...character.trajetoria, qualidades: [{ quality_id: "contato", pontos: 1, detalhes: {} }] } }).ok, false, "Qualidades precisam somar 3");

console.log("test-ruleset-v12-contracts — todos os cenários passaram.");
