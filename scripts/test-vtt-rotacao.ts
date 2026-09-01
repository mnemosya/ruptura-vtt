/**
 * Testes PUROS da validação de rotação de pegada — a mesma lógica que
 * `rotacionar_vtt_token` (migration 0071) aplica no servidor, testada
 * aqui do lado do domínio (bounds/bloqueio/colisão pra uma pegada
 * projetada numa orientação nova, âncora fixa). Cobre a parte
 * pure-testável dos itens 28-31 da validação obrigatória — a
 * persistência/sincronização/undo-redo reais (32-34) são verificados
 * via browser (`scripts/dev/check-vtt-pegada-multicelular.ts`).
 *
 * Uso: npx tsx scripts/test-vtt-rotacao.ts
 */

import { type Hex, hexIguais, hexKey } from "../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { type MapaTerreno, type TipoTerreno, dentroDoMapa, pegadaBloqueada } from "../src/app/mesas/[campaignId]/vtt/_dominio/movimento";
import { pegadaEfetiva, pegadaPadrao, pegadasSobrepoem, projetarPegada, rotacionarPegada } from "../src/app/mesas/[campaignId]/vtt/_dominio/pegada";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
const h = (q: number, r: number): Hex => ({ q, r });
function terreno(pares: [Hex, TipoTerreno][]): MapaTerreno {
  return new Map(pares.map(([c, t]) => [hexKey(c), t]));
}
const VAZIO: MapaTerreno = new Map();
const L = 30, A = 30;

/** Mesma checagem que `rotacionar_vtt_token`/`vtt_pegada_celulas` fazem no servidor — bounds+bloqueio+colisão pra uma pegada numa orientação nova, âncora fixa. */
function rotacaoValida(categoria: Parameters<typeof pegadaEfetiva>[0]["categoria"], ancora: Hex, orientacaoNova: number, terrenoM: MapaTerreno, ocupadosPorOutros: readonly Hex[], largura: number, altura: number): boolean {
  const pegada = pegadaEfetiva({ categoria, orientacao: orientacaoNova, pegadaPersonalizada: null });
  const celulas = projetarPegada(ancora, pegada);
  if (!celulas.every((c) => dentroDoMapa(c, largura, altura))) return false;
  if (pegadaBloqueada(terrenoM, celulas)) return false;
  if (pegadasSobrepoem(celulas, ocupadosPorOutros)) return false;
  return true;
}

// ── 28. Rotação válida atualiza TODOS os hexes ocupados ─────────────
{
  const ancora = h(10, 10);
  const pegada0 = pegadaEfetiva({ categoria: "grande", orientacao: 0, pegadaPersonalizada: null });
  const pegada1 = pegadaEfetiva({ categoria: "grande", orientacao: 1, pegadaPersonalizada: null });
  const celulas0 = projetarPegada(ancora, pegada0);
  const celulas1 = projetarPegada(ancora, pegada1);
  const mudou = celulas0.length === celulas1.length && !celulas0.every((c, i) => hexIguais(c, celulas1[i]));
  ok("28 (rotação válida troca o conjunto de hexes ocupados, âncora fixa)", mudou && hexIguais(celulas0[0], ancora) && hexIguais(celulas1[0], ancora), `antes=${JSON.stringify(celulas0)} depois=${JSON.stringify(celulas1)}`);
}

// ── 29. Rotação contra obstáculo é rejeitada ─────────────────────────
{
  const ancora = h(10, 10);
  // Célula "E" da pegada grande orientação 0 é bloqueada — rotação PARA a orientação 0 fica inválida.
  const t = terreno([[h(11, 10), "bloqueado"]]);
  const valida0 = rotacaoValida("grande", ancora, 0, t, [], L, A);
  ok("29 (rotação pra orientação com célula bloqueada é rejeitada)", !valida0, `valida=${valida0}`);
  // Outra orientação, sem tocar o bloqueio, continua válida.
  const valida3 = rotacaoValida("grande", ancora, 3, t, [], L, A);
  ok("29b (outra orientação, sem tocar o bloqueio, continua válida)", valida3, `valida=${valida3}`);
}

// ── 30. Rotação sobre outro token é rejeitada ────────────────────────
{
  const ancora = h(10, 10);
  const outroToken = projetarPegada(h(11, 10), pegadaPadrao("pequeno")); // ocupa exatamente a célula "E" da orientação 0
  const valida0 = rotacaoValida("grande", ancora, 0, VAZIO, outroToken, L, A);
  ok("30 (rotação que sobrepõe outro token é rejeitada)", !valida0, `valida=${valida0}`);
  const valida3 = rotacaoValida("grande", ancora, 3, VAZIO, outroToken, L, A);
  ok("30b (orientação que não sobrepõe o outro token continua válida)", valida3, `valida=${valida3}`);
}

// ── 31. Rotação fora do mapa é rejeitada ─────────────────────────────
{
  // Âncora bem na borda — alguma orientação da pegada grande estica pra fora do mapa pequeno.
  const L2 = 4, A2 = 4;
  const ancora = h(3, 3); // canto do mapa 4×4 (índices 0..3)
  let algumaValida = false, algumaInvalida = false;
  for (let o = 0; o < 6; o++) {
    if (rotacaoValida("grande", ancora, o, VAZIO, [], L2, A2)) algumaValida = true;
    else algumaInvalida = true;
  }
  ok("31 (rotação que estica a pegada pra fora do mapa é rejeitada — pelo menos uma orientação falha no canto)", algumaInvalida, `alguma válida=${algumaValida} alguma inválida=${algumaInvalida}`);
}

// ── 33 (pureza da regra usada pela persistência): pegada simétrica não muda ao rotacionar ──
{
  const ancora = h(0, 0);
  const pegadaEnorme0 = pegadaEfetiva({ categoria: "enorme", orientacao: 0, pegadaPersonalizada: null });
  let todasIguais = true;
  for (let o = 1; o <= 5; o++) {
    const celulasO = projetarPegada(ancora, pegadaEfetiva({ categoria: "enorme", orientacao: o, pegadaPersonalizada: null }));
    const celulas0 = projetarPegada(ancora, pegadaEnorme0);
    const chaves0 = new Set(celulas0.map(hexKey));
    if (!(celulasO.length === celulas0.length && celulasO.every((c) => chaves0.has(hexKey(c))))) todasIguais = false;
  }
  ok("33 (Enorme: NENHUMA orientação muda a ocupação — a UI evita emitir a operação à toa por causa disso)", todasIguais, "confirmado 1..5");
}

// ── extra: rotacionar seguido do inverso restaura a orientação original ──
{
  const ancora = h(5, 5);
  const p0 = pegadaEfetiva({ categoria: "colossal", orientacao: 0, pegadaPersonalizada: null });
  const foiEVoltou = rotacionarPegada(rotacionarPegada(p0, 2), -2);
  const chaves0 = new Set(p0.map(hexKey));
  ok("extra (rotacionar +2 depois -2 restaura a pegada original)", foiEVoltou.every((c) => chaves0.has(hexKey(c))) && foiEVoltou.length === p0.length, "confirmado");
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
