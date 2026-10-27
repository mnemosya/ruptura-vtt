import assert from "node:assert/strict";
import { CLASSES_ACERVO, type Caracteristica, type DossieClasse } from "../src/app/mesas/[campaignId]/vtt/_forja/acervo/classes";
import ancora from "../content/v12/db_classe_ancora_v1_2.json";
import cacador from "../content/v12/db_classe_cacador_v1_2.json";
import combatente from "../content/v12/db_classe_combatente_v1_2.json";
import face from "../content/v12/db_classe_face_v1_2.json";
import infiltrador from "../content/v12/db_classe_infiltrador_v1_2.json";
import tecnico from "../content/v12/db_classe_tecnico_v1_2.json";
import vanguarda from "../content/v12/db_classe_vanguarda_v1_2.json";

const fontes = [ancora, cacador, combatente, face, infiltrador, tecnico, vanguarda];
assert.equal(CLASSES_ACERVO.length, fontes.length);

for (const fonte of fontes) {
  const classe = fonte.classes[0];
  const dossie: DossieClasse | undefined = CLASSES_ACERVO.find((item) => item.id === classe.slug)?.dossie;
  assert.ok(dossie, `Códex de ${classe.nome} ausente`);
  assert.equal(dossie.role, classe.papel_principal);
  assert.deepEqual(dossie.skills3, classe.criacao.pericias_valor_3);
  assert.equal(dossie.intro.join("\n\n"), classe.descricao);
  assert.deepEqual(dossie.syn.map(({ n }) => n), Object.values(classe.criacao.sinergia_vertentes));

  for (const [rank, caracteristicas] of Object.entries(classe.caracteristicas)) {
    const exibidas: Caracteristica[] | undefined = dossie.feats.find((item) => item.r === rank)?.feats;
    assert.deepEqual(exibidas, caracteristicas.map(({ nome, descricao }) => ({ n: nome, d: descricao })), `${classe.nome} ${rank}`);
  }

  assert.deepEqual(dossie.subs.map((item) => item.n), fonte.subclasses.map((item) => item.nome));
  for (const subclasse of fonte.subclasses) {
    const exibida: DossieClasse["subs"][number] | undefined = dossie.subs.find((item) => item.n === subclasse.nome);
    assert.ok(exibida, `Subclasse ${subclasse.nome} ausente`);
    assert.equal(exibida.lore, subclasse.descricao);
    for (const [rank, caracteristicas] of Object.entries(subclasse.caracteristicas)) {
      assert.deepEqual(exibida.ranks.find((item) => item.r === rank)?.feats,
        caracteristicas.map(({ nome, descricao }) => ({ n: nome, d: descricao })), `${subclasse.nome} ${rank}`);
    }
  }
}

console.log("Códex da Forja: 7 classes e todas as subclasses conferem com o conteúdo v1.2.");
