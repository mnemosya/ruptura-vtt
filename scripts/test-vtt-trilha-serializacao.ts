/**
 * Testes PUROS da fronteira entre o `EstadoTrilha` e o `jsonb` de
 * `vtt_turn_tracks` (migration 0088), e das transições de
 * ADMINISTRAÇÃO da ferramenta "Rodadas".
 *
 * O que está sendo protegido aqui é a coisa mais fácil de quebrar sem
 * ninguém notar: a trilha agora atravessa a rede. Um campo que some na
 * serialização, ou um `as EstadoTrilha` aceitando lixo de uma versão
 * antiga do app, não estoura na hora — estoura no meio de um combate,
 * na casa de outra pessoa. Daí o par ida-e-volta ser testado campo a
 * campo, e a validação ser testada com entradas deliberadamente
 * quebradas.
 *
 * As REGRAS de combate continuam sendo testadas por
 * `test-trilha-ruptura.ts` contra o exemplo do livro — nada aqui
 * duplica aquilo.
 *
 * Uso: npx tsx scripts/test-vtt-trilha-serializacao.ts
 */

import type { EstadoTrilha } from "../src/app/mesas/[campaignId]/vtt/_turnos/modelo";
import {
  PA_PADRAO_TRILHA,
  adicionarParticipantes,
  definirIncapaz,
  estadoInicialTrilha,
  participanteDeToken,
  removerParticipante,
  trilhaDeJson,
  trilhaParaJson,
} from "../src/app/mesas/[campaignId]/vtt/_turnos/serializacao";

let passou = 0;
let falhou = 0;
function ok(criterio: string, condicao: boolean, detalhe: string) {
  if (condicao) {
    passou++;
    console.log(`ok - ${criterio}: ${detalhe}`);
  } else {
    falhou++;
    console.error(`FALHA - ${criterio}: ${detalhe}`);
  }
}

const token = (id: string, lado: "pj" | "pn" | "neutro", condicoes: string[] = []) => ({
  id, nome: `Token ${id}`, lado, condicoes,
});

// ── 1: token → participante ────────────────────────────────────────
{
  const p = participanteDeToken(token("a", "pj"));
  ok("1 (token vira participante com PA padrão e nada declarado)",
    p.lado === "pj" && p.paTotal === PA_PADRAO_TRILHA && p.paGasto === 0
      && p.declaracao === null && p.agiuEm.length === 0 && p.fragmentouEm === null && !p.encerrou && !p.incapaz,
    `lado=${p.lado} paTotal=${p.paTotal} declaracao=${p.declaracao}`);

  ok("1b (token neutro entra pelo lado do narrador — a alternância só tem dois lados)",
    participanteDeToken(token("n", "neutro")).lado === "pn",
    `lado=${participanteDeToken(token("n", "neutro")).lado}`);

  ok("1c (token inconsciente já entra incapaz, com motivo textual)",
    participanteDeToken(token("i", "pj", ["inconsciente"])).incapaz?.motivo === "Inconsciente",
    `${participanteDeToken(token("i", "pj", ["inconsciente"])).incapaz?.motivo}`);
}

// ── 2: estado inicial ──────────────────────────────────────────────
{
  const e = estadoInicialTrilha({ tokens: [token("a", "pj"), token("b", "pn")], modo: "combate" });
  ok("2 (estado inicial: rodada 1, rápidos, sem alternância herdada)",
    e.rodada === 1 && e.janela === "rapidos" && e.ultimoLado === null && e.agindoId === null && e.participantes.length === 2,
    `rodada=${e.rodada} janela=${e.janela} ultimoLado=${e.ultimoLado} n=${e.participantes.length}`);

  const emb = estadoInicialTrilha({ tokens: [token("a", "pj")], modo: "emboscada", ladoSurpresa: "pj" });
  ok("2b (emboscada guarda o lado que surpreendeu)", emb.modo === "emboscada" && emb.ladoSurpresa === "pj",
    `modo=${emb.modo} ladoSurpresa=${emb.ladoSurpresa}`);

  const semEmb = estadoInicialTrilha({ tokens: [token("a", "pj")], modo: "combate", ladoSurpresa: "pj" });
  ok("2c (fora de emboscada, lado surpresa é descartado — nunca fica pendurado)", semEmb.ladoSurpresa === null,
    `ladoSurpresa=${semEmb.ladoSurpresa}`);
}

// ── 3: ida e volta preserva TUDO ───────────────────────────────────
{
  const original: EstadoTrilha = {
    modo: "emboscada",
    rodada: 4,
    janela: "lentos",
    ultimoLado: "pn",
    agindoId: "b",
    ladoSurpresa: "pn",
    participantes: [
      { id: "a", nome: "Mara", lado: "pj", declaracao: "rapidos", paComprometido: 2, paTotal: 3, paGasto: 1,
        reflexos: 3, agiuEm: ["rapidos"], fragmentouEm: "rapidos", encerrou: false, incapaz: null },
      { id: "b", nome: "Vosek", lado: "pn", declaracao: "lentos", paComprometido: null, paTotal: 5, paGasto: 0,
        reflexos: 1, agiuEm: [], fragmentouEm: null, encerrou: true, incapaz: { motivo: "Imobilizado" } },
    ],
  };
  const volta = trilhaDeJson(JSON.parse(JSON.stringify(trilhaParaJson(original))));
  ok("3 (ida e volta pelo JSON devolve exatamente o mesmo estado)",
    JSON.stringify(volta) === JSON.stringify(original),
    volta ? "idêntico" : "voltou null");
}

// ── 4: formas inválidas devolvem null (nunca estado remendado) ─────
{
  const casos: [string, unknown][] = [
    ["não é objeto", "trilha"],
    ["nulo", null],
    ["sem participantes", { modo: "combate", rodada: 1, janela: "rapidos", participantes: [] }],
    ["participantes não é array", { modo: "combate", rodada: 1, janela: "rapidos", participantes: {} }],
    ["modo desconhecido", { modo: "duelo", rodada: 1, janela: "rapidos", participantes: [{ id: "a", lado: "pj", paTotal: 3, paGasto: 0 }] }],
    ["janela desconhecida", { modo: "combate", rodada: 1, janela: "media", participantes: [{ id: "a", lado: "pj", paTotal: 3, paGasto: 0 }] }],
    ["rodada zero", { modo: "combate", rodada: 0, janela: "rapidos", participantes: [{ id: "a", lado: "pj", paTotal: 3, paGasto: 0 }] }],
    ["participante sem id", { modo: "combate", rodada: 1, janela: "rapidos", participantes: [{ lado: "pj", paTotal: 3, paGasto: 0 }] }],
    ["participante com lado inválido", { modo: "combate", rodada: 1, janela: "rapidos", participantes: [{ id: "a", lado: "neutro", paTotal: 3, paGasto: 0 }] }],
    ["participante sem PA", { modo: "combate", rodada: 1, janela: "rapidos", participantes: [{ id: "a", lado: "pj" }] }],
    ["ids repetidos", { modo: "combate", rodada: 1, janela: "rapidos", participantes: [
      { id: "a", lado: "pj", paTotal: 3, paGasto: 0 }, { id: "a", lado: "pn", paTotal: 3, paGasto: 0 }] }],
  ];
  const recusados = casos.filter(([, v]) => trilhaDeJson(v) === null);
  ok(`4 (toda forma inválida vira null — ${recusados.length}/${casos.length})`,
    recusados.length === casos.length,
    casos.filter(([, v]) => trilhaDeJson(v) !== null).map(([nome]) => nome).join(", ") || "todos recusados");
}

// ── 5: saneamento de campos opcionais ──────────────────────────────
{
  const lido = trilhaDeJson({
    modo: "combate", rodada: 2, janela: "rapidos", ultimoLado: "torto", agindoId: "fantasma",
    ladoSurpresa: "pj",
    participantes: [{ id: "a", lado: "pj", paTotal: 3, paGasto: 0, agiuEm: ["rapidos", "sideral"] }],
  });
  ok("5 (agindoId apontando pra quem não está no elenco vira null — turno aberto impossível de concluir)",
    lido?.agindoId === null, `agindoId=${lido?.agindoId}`);
  ok("5b (ultimoLado inválido vira null em vez de invalidar a trilha)", lido?.ultimoLado === null, `ultimoLado=${lido?.ultimoLado}`);
  ok("5c (fora de emboscada, ladoSurpresa lido do banco é descartado)", lido?.ladoSurpresa === null, `ladoSurpresa=${lido?.ladoSurpresa}`);
  ok("5d (janela desconhecida em agiuEm é filtrada, não derruba a trilha)",
    JSON.stringify(lido?.participantes[0].agiuEm) === JSON.stringify(["rapidos"]),
    JSON.stringify(lido?.participantes[0].agiuEm));
  ok("5e (nome ausente cai pro id — participante sem rótulo é pior que participante sem nome bonito)",
    lido?.participantes[0].nome === "a", `nome=${lido?.participantes[0].nome}`);
}

// ── 6: administração do elenco ─────────────────────────────────────
{
  const base = estadoInicialTrilha({ tokens: [token("a", "pj"), token("b", "pn")], modo: "combate" });

  const maior = adicionarParticipantes(base, [token("c", "pj")]);
  ok("6 (adicionar entra no fim do elenco, com PA cheio da rodada corrente)",
    maior.participantes.length === 3 && maior.participantes[2].id === "c" && maior.participantes[2].paGasto === 0,
    `n=${maior.participantes.length}`);

  ok("6b (adicionar quem já está é no-op — nunca duplica)",
    adicionarParticipantes(maior, [token("c", "pj")]) === maior, "mesma referência");

  const agindo: EstadoTrilha = { ...maior, agindoId: "c" };
  const semC = removerParticipante(agindo, "c");
  ok("6c (remover quem está agindo derruba a ativação aberta junto)",
    semC.participantes.length === 2 && semC.agindoId === null, `agindoId=${semC.agindoId}`);

  const semOutro = removerParticipante(agindo, "a");
  ok("6d (remover outro NÃO mexe na ativação em curso)", semOutro.agindoId === "c", `agindoId=${semOutro.agindoId}`);

  ok("6e (remover quem não existe é no-op)", removerParticipante(base, "zz") === base, "mesma referência");

  const incapaz = definirIncapaz(agindo, "c", "Inconsciente");
  ok("6f (marcar incapaz quem está agindo também encerra a ativação)",
    incapaz.participantes.find((p) => p.id === "c")?.incapaz?.motivo === "Inconsciente" && incapaz.agindoId === null,
    `agindoId=${incapaz.agindoId}`);

  ok("6g (reverter incapaz limpa o motivo e não reabre turno nenhum)",
    definirIncapaz(incapaz, "c", null).participantes.find((p) => p.id === "c")?.incapaz === null,
    "incapaz=null");
}

// ── 7: o elenco sobrevive à serialização depois de administrado ────
{
  const administrado = removerParticipante(
    adicionarParticipantes(
      estadoInicialTrilha({ tokens: [token("a", "pj"), token("b", "pn")], modo: "combate" }),
      [token("c", "pn")],
    ),
    "b",
  );
  const volta = trilhaDeJson(JSON.parse(JSON.stringify(trilhaParaJson(administrado))));
  ok("7 (elenco editado atravessa o JSON intacto)",
    JSON.stringify(volta?.participantes.map((p) => p.id)) === JSON.stringify(["a", "c"]),
    JSON.stringify(volta?.participantes.map((p) => p.id)));
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou === 0 ? 0 : 1);
