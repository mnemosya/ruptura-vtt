import assert from "node:assert/strict";
import { VERTENTES_ACERVO } from "../src/app/mesas/[campaignId]/vtt/_forja/acervo/vertentes";
import primarias from "../src/app/mesas/[campaignId]/vtt/_forja/acervo/vertentesPrimariasV12.json";
import magias from "../content/v12/db_magias_vertentes_v1_2.json";

assert.equal(VERTENTES_ACERVO.length, 6);
let exibidas = 0;

for (const vertente of VERTENTES_ACERVO) {
  const grimorio = vertente.grimorio;
  const primaria = primarias.vertentes[vertente.id];
  assert.ok(primaria, `${vertente.nome}: Vertente Primária ausente`);
  assert.equal(grimorio.primaria.intro, primaria.intro);
  assert.equal(grimorio.primaria.nivel3.descricao, primaria.nivel3.descricao);
  assert.ok(grimorio.primaria.nivel3.descricao.length > 100);

  for (const nivel of grimorio.levels) {
    const publicadas = magias.magias.filter((magia) => magia.status === "published" && magia.vertente === vertente.id && magia.estatisticas.nivel === nivel.lv);
    assert.equal(nivel.spells.length, publicadas.length, `${vertente.nome}, nível ${nivel.lv}: total de magias`);
    for (const magia of publicadas) {
      const ficha = nivel.spells.find((item) => item.n === magia.nome);
      assert.ok(ficha, `${vertente.nome}, nível ${nivel.lv}: ${magia.nome} ausente`);
      assert.equal(ficha.d, magia.descricao_longa, `${magia.nome}: descrição`);
      assert.equal(ficha.type, magia.estatisticas.tipo_magia, `${magia.nome}: tipo`);
      assert.equal(ficha.range, magia.estatisticas.alcance.texto, `${magia.nome}: alcance`);
      assert.equal(ficha.dur, magia.estatisticas.duracao.texto, `${magia.nome}: duração`);
      assert.equal(ficha.req, magia.estatisticas.pre_requisito ?? "", `${magia.nome}: pré-requisito`);
      assert.ok(ficha.tags.some((tag) => tag.includes("MANA")), `${magia.nome}: custo de Mana`);
      assert.equal(ficha.tags[1], magia.estatisticas.conjuracao.texto.toUpperCase(), `${magia.nome}: conjuração`);
      exibidas++;
    }
  }
}

assert.equal(exibidas, magias.magias.filter((magia) => magia.status === "published").length);
console.log(`Códex da Forja: 6 Vertentes e ${exibidas} magias conferem com o conteúdo publicado v1.2.`);
