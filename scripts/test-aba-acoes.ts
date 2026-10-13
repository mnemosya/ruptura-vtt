import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buscarAcoes, custoDoCartao, montarAbaAcoes, type AbaAcoes, type CatalogoAcoesV12 } from "../src/lib/character/abaAcoes";
import type { Character } from "../src/lib/character/types";

/**
 * Modelo de visão da aba Ações (src/lib/character/abaAcoes.ts).
 * Regra central: nada trava; o que a ficha contradiz vira aviso.
 */

const catalogo = JSON.parse(readFileSync("content/v12/db_acoes_v1_2.json", "utf8")) as CatalogoAcoesV12;

const base = (extra: Partial<Character> = {}): Character =>
  ({ nome: "Teste", atributos: {}, pericias: {}, estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 }, condicoes_ativas: [], ...extra }) as unknown as Character;

const condicao = (slug: string) => ({ id: slug, conditionId: slug, nome: slug, aplicadaEm: "2026-10-13", ativa: true });
const item = (aba: AbaAcoes, cena: string, slug: string) => {
  const i = aba.grupos.flatMap((g) => g.itens).find((x) => x.acao.cena === cena && x.acao.slug === slug);
  assert.ok(i, `${cena}:${slug} na aba`);
  return i;
};
const avisos = (aba: AbaAcoes, cena: string, slug: string) => item(aba, cena, slug).avisos.map((a) => a.texto);

// Kael: Brutalista C, sem deck, 1 PA gasto, Postura ofensiva ativa.
const kael = base({
  estado_jogo: { pa_gastos: 1, reacoes_usadas: 0 },
  condicoes_ativas: [condicao("postura_ofensiva")],
  progressao: { classe_id: "combatente", subclasse_id: "brutalista", ranking: "C" },
} as Partial<Character>);
const abaKael = montarAbaAcoes(catalogo, kael, { paMax: 3, reacoesPorRodada: 1, fixadas: ["combate:agarrar"], emCombate: true });

assert.equal(abaKael.cenaSugerida, "combate", "tracker ativo abre em Combate");
assert.deepEqual(abaKael.recursos.pa, { restantes: 2, max: 3 });
assert.deepEqual(abaKael.recursos.reacoes, { restantes: 1, total: 1 });
assert.equal(abaKael.recursos.trama, null);

// Nada trava: Levantar sem estar Caído continua na lista, com aviso.
assert.deepEqual(avisos(abaKael, "combate", "levantar"), ["Você não está Caído"]);
assert.deepEqual(avisos(abaKael, "combate", "esquivar"), [], "Reação disponível, sem aviso");
assert.equal(item(abaKael, "combate", "postura_ofensiva").ativa, true, "postura ativa vem da condição");
assert.equal(item(abaKael, "combate", "postura_defensiva").ativa, false);
assert.deepEqual(abaKael.fixadas.map((i) => i.chave), ["combate:agarrar"]);

// Trama sem acesso: aviso da CENA (banner), não repetido como aviso de ação.
assert.equal(abaKael.avisoDaCena.trama, "Você não tem Deck Sináptico nem Sináptica");
const sondarKael = item(abaKael, "trama", "sondar");
assert.deepEqual(sondarKael.avisos.filter((a) => a.alcance === "acao"), [], "sem deck, nenhum aviso extra por cartão");
assert.equal(sondarKael.avisos.filter((a) => a.alcance === "cena").length, 1);
// Acessar Trama no combate avisa na própria ação.
assert.deepEqual(avisos(abaKael, "combate", "acessar_trama"), ["Você não tem Deck Sináptico nem Sináptica"]);

// Ações de classe: grupo da subclasse, na cena certa, ranking avisa sem travar.
const brutalista = abaKael.grupos.find((g) => g.slug === "classe");
assert.ok(brutalista && brutalista.cena === "combate" && brutalista.nome === "Brutalista");
assert.deepEqual(avisos(abaKael, "combate", "classe_demolidor"), ["Disponível no Ranking A"]);
assert.deepEqual(avisos(abaKael, "combate", "classe_rerrolar"), []);

// Sem PA suficiente: avisa, não trava.
const semPa = montarAbaAcoes(catalogo, base({ estado_jogo: { pa_gastos: 2 } }), { paMax: 3, reacoesPorRodada: 1 });
assert.deepEqual(avisos(semPa, "combate", "agarrar"), ["Você tem 1 PA nesta rodada"]);
assert.deepEqual(avisos(semPa, "combate", "fintar"), []);
assert.equal(item(semPa, "combate", "agarrar").avisos[0].alcance, "recurso", "falta de PA só aparece na gaveta, não no cartão");
const semReacao = montarAbaAcoes(catalogo, base({ estado_jogo: { reacoes_usadas: 1 } }), { paMax: 3, reacoesPorRodada: 1 });
assert.match(avisos(semReacao, "combate", "esquivar")[0], /–1 de desvantagem/);

// Nyx: Tecelã em Sessão, com deck; conhece 6 comandos.
const nyx = base({
  progressao: { classe_id: "tecnico", subclasse_id: "tecelao", ranking: "C" },
  escalpos_instalados: [{ id: "e1", contentId: "escalpos_deck_sinaptico_civil", instaladoEm: "2026-10-13" }],
  trama_ativa: { id: "t", nome: "Depósito", classificacao: "civil", limiteDeteccao: 6, niveisRevelados: 1, posicaoAtual: "", bloqueios: [], nos: [], presencasHostis: [], ramAtual: 1, ramMaximo: 12, paGastosNaTrama: 0, deteccaoAtual: 2, detecaoAcionada: false, rastro: 3, protocolosUsados: [], iniciadaEm: "", ativa: true },
} as Partial<Character>);
const conhecidos = ["controlar_sistema", "controlar_unidade", "quebrar_bloqueio", "travar_acesso", "extrair_dados", "apagar_rastros"];
const abaNyx = montarAbaAcoes(catalogo, nyx, { paMax: 3, reacoesPorRodada: 1, comandosConhecidos: conhecidos, ultimaCena: "investigacao" });

assert.equal(abaNyx.cenaSugerida, "trama", "Sessão ativa abre na Trama");
assert.deepEqual(abaNyx.recursos.trama, { ram: 1, ramMax: 12, deteccao: 2, limite: 6, rastro: 3 });
assert.equal(abaNyx.avisoDaCena.trama, undefined);
assert.deepEqual(avisos(abaNyx, "trama", "sondar"), []);
assert.deepEqual(avisos(abaNyx, "trama", "pulso_sinaptico"), ["Você tem 1 RAM"]);
assert.deepEqual(avisos(abaNyx, "trama", "corromper_dados"), ["Este comando não está no seu deck nem na sua Sináptica", "Você tem 1 RAM"]);
assert.equal(abaNyx.grupos.find((g) => g.slug === "comando")?.nota, "6 de 10 conhecidos · cada uso +1 Rastro");
assert.equal(abaNyx.grupos.find((g) => g.slug === "classe")?.cena, "trama", "ações da Tecelã ficam na Trama");
assert.equal(item(abaNyx, "trama", "conectar").ram, 0);

// Com deck mas sem Sessão: avisa "não está numa Sessão" na ação.
const nyxForaDaSessao = montarAbaAcoes(catalogo, { ...nyx, trama_ativa: undefined } as Character, { paMax: 3, reacoesPorRodada: 1 });
assert.deepEqual(avisos(nyxForaDaSessao, "trama", "sondar"), ["Você não está numa Sessão"]);
assert.deepEqual(avisos(nyxForaDaSessao, "trama", "conectar"), [], "Conectar é o que abre a Sessão");
assert.equal(nyxForaDaSessao.cenaSugerida, "combate");

// Custos do cartão.
assert.deepEqual(custoDoCartao({ pa: 1, pa_max: 2 }), { valor: "1–2", unidade: "PA" });
assert.deepEqual(custoDoCartao({ reacao: 1 }), { valor: "1", unidade: "Reação" });
assert.deepEqual(custoDoCartao({ livre: true, ram: 0 }), { valor: "—", unidade: "Livre" });

// Busca atravessa as cenas e ignora acento.
assert.deepEqual(buscarAcoes(abaKael, "agarr").map((i) => i.chave), ["combate:agarrar"]);
assert.deepEqual(buscarAcoes(abaKael, "ACESSAR").map((i) => i.chave), ["combate:acessar_trama", "investigacao:acessar"]);
assert.deepEqual(buscarAcoes(abaKael, "forcar").map((i) => i.chave), ["trama:forcar_rota"]);

console.log("aba-acoes ok");
