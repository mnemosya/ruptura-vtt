/**
 * Teste PURO da trilha de turnos de Ruptura (sem browser, sem banco).
 *
 * O alvo é o EXEMPLO DE ORDEM do próprio livro
 * (`docs/fontes/16 COMBATE` → "FRAGMENTANDO OS PONTOS DE AÇÃO"):
 *
 *   Turnos rápidos (2 PA)
 *     PJ 1 → PN 1 → PJ 2 (gasta 1 PA e decide fragmentar)
 *   Turnos lentos (3+ PA)
 *     PN 2 → PJ 2 (retorna e gasta o 1 PA restante) → PN 3 → PJ 3 → PJ 4
 *
 * Rodar a sequência do livro contra o modelo é a única forma honesta de
 * afirmar "a trilha implementa as regras de Ruptura". Um teste que só
 * verificasse que a interface renderiza pílulas não provaria nada sobre
 * a regra.
 *
 * Uso: npx tsx scripts/test-trilha-ruptura.ts
 */

import {
  type EstadoTrilha,
  type Participante,
  assumirTurno,
  avancarParaLentos,
  concluirTurno,
  elegibilidade,
  elegiveisAgora,
  ladoDaVez,
  ladoQueAbreProximaJanela,
  podeEncerrarJanela,
  proximaRodada,
  tetoPaAgora,
} from "../src/app/mesas/[campaignId]/vtt/_turnos/modelo";

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

function participante(
  id: string, nome: string, lado: "pj" | "pn",
  declaracao: "rapidos" | "lentos" | null = "rapidos",
  paTotal = 3, reflexos = 1,
): Participante {
  return { id, nome, lado, declaracao, paTotal, paGasto: 0, reflexos, agiuEm: [], fragmentouEm: null, encerrou: false, incapaz: null };
}

function estadoInicial(): EstadoTrilha {
  return {
    modo: "combate",
    rodada: 1,
    janela: "rapidos",
    ultimoLado: null,
    agindoId: null,
    ladoSurpresa: null,
    participantes: [
      participante("pj1", "PJ 1", "pj", "rapidos"),
      participante("pj2", "PJ 2", "pj", "rapidos"),
      participante("pj3", "PJ 3", "pj", "lentos"),
      participante("pj4", "PJ 4", "pj", "lentos"),
      participante("pn1", "PN 1", "pn", "rapidos"),
      participante("pn2", "PN 2", "pn", "lentos"),
      participante("pn3", "PN 3", "pn", "lentos"),
    ],
  };
}

function agir(e: EstadoTrilha, id: string, pa: number): EstadoTrilha {
  return concluirTurno(assumirTurno(e, id), pa);
}

function p(e: EstadoTrilha, id: string): Participante {
  return e.participantes.find((x) => x.id === id)!;
}

// ── O exemplo do livro, passo a passo ────────────────────────────
let e = estadoInicial();

ok("1 (início: qualquer lado pode abrir)", ladoDaVez(e) === null, `ladoDaVez=${ladoDaVez(e)} (sem alternância pendente)`);

// PJ 1 age nos rápidos gastando 2 PA (o teto da janela).
ok("2 (PJ 1 elegível nos rápidos)", elegibilidade(p(e, "pj1"), e).apto, `teto de PA agora=${tetoPaAgora(p(e, "pj1"), "rapidos")}`);
e = agir(e, "pj1", 2);
ok("3 (após PJ 1, a vez é do lado PN — alternância)", ladoDaVez(e) === "pn", `ladoDaVez=${ladoDaVez(e)}`);
ok(
  "3b (PJ 1 gastou o teto da janela, NÃO conta como fragmentar)",
  p(e, "pj1").fragmentouEm === null,
  `fragmentouEm=${p(e, "pj1").fragmentouEm} (gastou 2 de 2 permitidos; o PA restante é do teto, não escolha)`,
);
// Usa `pj2`, que declarou RÁPIDOS: é o único jeito de isolar a
// alternância. `pj3` declarou Lentos, então seria barrado pela
// declaração antes de a alternância sequer ser avaliada — o critério
// passaria pelo motivo errado, medindo outra regra.
ok(
  "3c (outro PJ do MESMO grupo não pode agir enquanto o PN não agir)",
  !elegibilidade(p(e, "pj2"), e).apto && elegibilidade(p(e, "pj2"), e).motivo?.tipo === "aguarda_alternancia",
  `motivo="${elegibilidade(p(e, "pj2"), e).motivo?.texto}"`,
);
// E quem declarou o OUTRO grupo é barrado por declaração, não por
// alternância — dois motivos distintos, que a interface mostra
// diferente.
ok(
  "3d (quem declarou Lentos aguarda o próprio grupo, não a alternância)",
  elegibilidade(p(e, "pj3"), e).motivo?.tipo === "janela_incompativel",
  `motivo="${elegibilidade(p(e, "pj3"), e).motivo?.texto}"`,
);

// PN 1 age.
e = agir(e, "pn1", 2);
ok("4 (após PN 1, a vez volta pros PJ)", ladoDaVez(e) === "pj", `ladoDaVez=${ladoDaVez(e)}`);

// PJ 2 gasta 1 PA e FRAGMENTA (guarda o resto).
e = agir(e, "pj2", 1);
ok(
  "5 (PJ 2 gastou 1 de 2 e ficou marcado como fragmentado)",
  p(e, "pj2").fragmentouEm === "rapidos",
  `fragmentouEm=${p(e, "pj2").fragmentouEm}, paGasto=${p(e, "pj2").paGasto}`,
);
ok(
  "5b (PJ 2 não pode reagir ainda nos rápidos)",
  !elegibilidade(p(e, "pj2"), e).apto,
  `motivo="${elegibilidade(p(e, "pj2"), e).motivo?.texto}"`,
);

// ── Passagem pra Lentos ──────────────────────────────────────────
ok(
  "6 (quem abre os Lentos é o lado oposto ao último a agir nos Rápidos)",
  ladoQueAbreProximaJanela(e) === "pn",
  `último a agir foi ${e.ultimoLado} → abre ${ladoQueAbreProximaJanela(e)}`,
);
e = avancarParaLentos(e);
ok("6b (janela agora é lentos)", e.janela === "lentos", `janela=${e.janela}`);

// PN 2 abre os lentos com 3 PA.
ok("7 (PN 2 elegível nos lentos com 3 PA)", elegibilidade(p(e, "pn2"), e).apto, `paRestante=3`);
e = agir(e, "pn2", 3);

// PJ 2 RETORNA com o PA fragmentado — e com teto de 1, não 3.
{
  const teto = tetoPaAgora(p(e, "pj2"), "lentos");
  ok(
    "8 (PJ 2 retorna nos lentos com teto de 1 PA — mantém o limite dos rápidos)",
    elegibilidade(p(e, "pj2"), e).apto && teto === 1,
    `elegível=${elegibilidade(p(e, "pj2"), e).apto}, teto=${teto} (livro: "terá no máximo mais 1 PA para usar")`,
  );
}
e = agir(e, "pj2", 1);

// PN 3 → PJ 3 → PJ 4.
e = agir(e, "pn3", 3);
ok("9 (PJ 3 elegível — alternância devolveu a vez aos PJ)", elegibilidade(p(e, "pj3"), e).apto, `ladoDaVez=${ladoDaVez(e)}`);
e = agir(e, "pj3", 3);

// Agora os PN acabaram: PJ 4 deve poder agir em SEQUÊNCIA, sem alternar.
{
  const pnAptos = e.participantes.filter((x) => x.lado === "pn" && elegibilidade(x, e, { ignorarAlternancia: true }).apto);
  const el = elegibilidade(p(e, "pj4"), e);
  ok(
    "10 (lado PN esgotado → PJ 4 age em sequência, sem alternância)",
    pnAptos.length === 0 && el.apto,
    `PNs aptos=${pnAptos.length}, PJ 4 elegível=${el.apto}${el.motivo ? ` motivo="${el.motivo.texto}"` : ""}`,
  );
}
e = agir(e, "pj4", 3);

ok("11 (janela pode ser encerrada — ninguém mais apto)", podeEncerrarJanela(e), `elegíveis=${elegiveisAgora(e).length}`);

// ── Rodada seguinte ──────────────────────────────────────────────
const antesRodada = e.rodada;
const ultimoLadoAntes = e.ultimoLado;
e = proximaRodada(e);
ok("12 (rodada avança e PA renova)", e.rodada === antesRodada + 1 && e.participantes.every((x) => x.paGasto === 0), `rodada=${e.rodada}`);
ok("12b (janela volta pra rápidos)", e.janela === "rapidos", `janela=${e.janela}`);
ok(
  "12c (alternância NÃO reinicia com a rodada)",
  e.ultimoLado === ultimoLadoAntes,
  `ultimoLado preservado=${e.ultimoLado} (a alternância atravessa a rodada)`,
);
ok(
  "12d (marcas de fragmentação zeradas — fragmentar é 1× por RODADA)",
  e.participantes.every((x) => x.fragmentouEm === null && x.agiuEm.length === 0),
  "todos limpos",
);

// ── Emboscada: lado surpreendente age inteiro, sem alternância ───
{
  let emb: EstadoTrilha = { ...estadoInicial(), modo: "emboscada", ladoSurpresa: "pj" };
  emb = { ...emb, participantes: emb.participantes.map((x) => ({ ...x, declaracao: "rapidos" as const })) };
  emb = agir(emb, "pj1", 2);
  const outroPjApto = elegibilidade(p(emb, "pj3"), emb).apto;
  const pnApto = elegibilidade(p(emb, "pn1"), emb).apto;
  ok(
    "13 (emboscada: PJ age em seguida de PJ, e o PN não age)",
    outroPjApto && !pnApto,
    `PJ 3 apto=${outroPjApto}, PN 1 apto=${pnApto} motivo="${elegibilidade(p(emb, "pn1"), emb).motivo?.texto}"`,
  );
}

// ── Incapaz: motivo precisa ser explicável pela interface ────────
{
  let inc = estadoInicial();
  inc = {
    ...inc,
    participantes: inc.participantes.map((x) => (x.id === "pn1" ? { ...x, incapaz: { motivo: "Inconsciente" } } : x)),
  };
  const el = elegibilidade(p(inc, "pn1"), inc);
  ok("14 (incapaz reporta motivo textual)", !el.apto && el.motivo?.tipo === "incapaz", `motivo="${el.motivo?.texto}"`);
}

// ── Lentos exige 3+ PA de quem não fragmentou ────────────────────
{
  let baixo = estadoInicial();
  baixo = { ...baixo, janela: "lentos", participantes: baixo.participantes.map((x) => ({ ...x, paTotal: 2, declaracao: "lentos" as const })) };
  const el = elegibilidade(p(baixo, "pj1"), baixo);
  ok(
    "15 (sem fragmentar, entrar nos Lentos exige 3+ PA)",
    !el.apto && el.motivo?.tipo === "janela_incompativel",
    `motivo="${el.motivo?.texto}"`,
  );
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
