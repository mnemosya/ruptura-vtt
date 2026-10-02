// Gera scripts/dev/fixtures/personagem_v12.json: um personagem RUPTURA v1.2
// completo (Âncora, Ranking F), montado pelo builder real (buildCharacterV2).
// É a base dos personagens de teste criados no banco pelos scripts de dev —
// o banco recusa payload sem schema_version 2 desde a Fase 10.
// Rodar: npx tsx scripts/dev/v12/gerar_fixture_personagem.ts
import fs from "fs";
import { buildCharacterV2, VERTENTES_V12, type RulesetContentBundleV12 } from "../../../src/lib/rulesetV12";

const ancora = JSON.parse(fs.readFileSync("content/v12/db_classe_ancora_v1_2.json", "utf8")) as RulesetContentBundleV12;
const traj = JSON.parse(fs.readFileSync("content/v12/db_trajetoria_v1_2.json", "utf8")) as RulesetContentBundleV12;
const regras = JSON.parse(fs.readFileSync("content/db_regras_personagem_normalizado_v1_4.json", "utf8"));
const pericias: string[] = regras.pericias.map((p: { id: string }) => p.id);

const r = buildCharacterV2({
  nome: "Personagem de Teste", classe_id: "ancora", perfil_atributos: "equilibrada", atributos: { corpo: 1, mente: 2, animo: 1 },
  perfil_pericias: "padrao",
  pericias: { valor_3: ["medicina", "psicologia"], valor_2: ["biologia", "percepcao", "vontade"], valor_1: ["arcanismo", "influencia", "logica", "mobilidade", "reflexos", "sociedade", "vigor"] },
  vertente_primaria: "biotica",
  trajetoria: {
    regiao_id: "vastra", local_origem: "Vosek", idiomas: ["vastrano"],
    antecedente: { antecedente_id: "academico", meio: "Laboratório", papel: "Assistente", relacao_atual: "Afastada" },
    transformacao_refratario: { estopim: "Acidente", primeiros_passos: "Fuga", consequencia: "Clandestinidade" },
    rpi_forjado: { nivel: 1, nome_registrado: "Teste", ocupacao_declarada: "Técnica", origem: "Vosek" },
    qualidades: [{ quality_id: "aliado", pontos: 2, detalhes: {} }, { quality_id: "contato", pontos: 1, detalhes: {} }],
    complicacoes: [{ complication_id: "desertor", pontos: 2, detalhes: {} }],
  },
  compras: [],
}, {
  classe: ancora.classes[0], pericias, vertentes: [...VERTENTES_V12], itens: new Map(),
  trajetoria: {
    antecedentes: new Map(traj.backgrounds.map((b) => [b.slug, b])),
    qualidades: new Map(traj.qualities.map((q) => [q.slug, q])),
    complicacoes: new Map(traj.complications.map((x) => [x.slug, x])),
  },
  agora: () => "2026-10-01T00:00:00.000Z",
});
if (!r.ok) throw new Error(r.errors.join(" | "));
fs.writeFileSync("scripts/dev/fixtures/personagem_v12.json", JSON.stringify(r.character, null, 2) + "\n");
console.log("scripts/dev/fixtures/personagem_v12.json gerado.");
