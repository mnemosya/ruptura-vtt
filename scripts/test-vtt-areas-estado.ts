/**
 * Testes PUROS da máquina de estados de Áreas — `_ferramentas/
 * areasEstado.ts`. Foco desta rodada: o fluxo de AURA (rodada de
 * correção de UX — "escolher token não pode concluir a Aura sozinho",
 * "o raio vem SEMPRE de um gesto de arrasto, nunca de um valor
 * predefinido"). Determinísticos, sem browser, sem banco.
 *
 * Uso: npx tsx scripts/test-vtt-areas-estado.ts
 */

import {
  type ConfigAreas, type EstadoAreas,
  AREAS_OCIOSA, CONFIG_AREAS_PADRAO,
  comecarEscolhaDeTokenDaAura, escapeNaAura, escolherTokenDaAura, mover, paramsDaFase, paramsDoArraste, pressionar, soltar,
} from "../src/app/mesas/[campaignId]/vtt/_ferramentas/areasEstado";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const T = 26;
const configAura: ConfigAreas = { ...CONFIG_AREAS_PADRAO, tipo: "aura", raioAuraM: 3, tokenAuraId: "t1" };
const origemToken = { q: 5, r: 5 };

// ══════════════════════════════════════════════════════════════════
// A. Escolher o token NÃO conclui a Aura
// ══════════════════════════════════════════════════════════════════
{
  const escolhendo = comecarEscolhaDeTokenDaAura();
  ok("A1 (tipo Aura entra esperando token — não é geometria concluída)", escolhendo.fase === "escolhendo_token_da_aura", escolhendo.fase);
  ok("A1b (nesta fase não há parâmetros — nenhuma geometria em curso)", paramsDaFase(escolhendo) === null, JSON.stringify(paramsDaFase(escolhendo)));

  // `pointerdown` sobre o token: entra em "pressionada", ainda SEM concluir nada.
  const pressionada = escolherTokenDaAura({
    config: configAura, tokenId: "t1", origem: origemToken, pointerId: 1, px: { x: 0, y: 0 }, precisaoLivre: false,
  });
  ok("A2 (token escolhido — fase 'pressionada', dimensão zerada, NÃO concluída)",
    pressionada.fase === "pressionada" && pressionada.tipo === "aura" && pressionada.gesto.dimensaoArredondada === 0,
    JSON.stringify(pressionada));
  ok("A2b (nesta fase intermediária ainda não há parâmetros — 'pressionada' não é geometria)", paramsDaFase(pressionada) === null, "null esperado");
}

// ══════════════════════════════════════════════════════════════════
// B. Clique-e-solta SEM arrastar (fluxo em DUAS etapas)
// ══════════════════════════════════════════════════════════════════
{
  const pressionada = escolherTokenDaAura({
    config: configAura, tokenId: "t1", origem: origemToken, pointerId: 1, px: { x: 100, y: 100 }, precisaoLivre: false,
  });
  const solto = soltar(pressionada);
  ok("B1 (clique simples sobre o token — vira 'definindo_raio_da_aura', NUNCA uma aura pronta)",
    solto.fase === "definindo_raio_da_aura", solto.fase);
  if (solto.fase === "definindo_raio_da_aura") {
    ok("B1b (o token e a origem escolhidos são preservados)", solto.tokenId === "t1" && solto.origem.q === 5 && solto.origem.r === 5, JSON.stringify(solto));
  }
  ok("B1c ('definindo_raio_da_aura' não tem parâmetros — geometria ainda não existe)", paramsDaFase(solto) === null, "null esperado");

  // Um clique simples NUNCA produz `raioM: config.raioAuraM` como se o usuário tivesse escolhido.
  ok("B2 (raio de config (3 m) NÃO aparece em lugar nenhum do estado pós-clique)",
    JSON.stringify(solto).includes(`"raioM"`) === false, JSON.stringify(solto));
}

// ══════════════════════════════════════════════════════════════════
// C. Um NOVO arrasto, a partir de 'definindo_raio_da_aura', define o raio
// ══════════════════════════════════════════════════════════════════
{
  const definindo: EstadoAreas = { fase: "definindo_raio_da_aura", tokenId: "t1", origem: origemToken };
  // O "novo pointerdown em qualquer ponto do mapa" é modelado, em
  // `VttClient.tsx`, chamando `escolherTokenDaAura` de novo com a
  // origem JÁ FIXADA (nunca reprocurando token) — replicado aqui.
  const novaPressionada = escolherTokenDaAura({
    config: configAura, tokenId: definindo.tokenId, origem: definindo.origem, pointerId: 2, px: { x: 50, y: 50 }, precisaoLivre: false,
  });
  // Arrasta 3 m de distância. Com r fixo, mover +Δ em q desloca Δ
  // METROS em linha reta (mundoParaAxial/axialParaMundo são lineares —
  // ver cabeçalho de `escalaMapa.ts`), então o delta em q É o delta em
  // metros diretamente, sem conversão extra.
  const cursor = { q: origemToken.q + 3, r: origemToken.r };
  const arrastando = mover(novaPressionada, configAura, cursor, { x: 50 + 40, y: 50 }, T, false);
  ok("C1 (arrasto cruzou o limiar — fase 'arrastando')", arrastando.fase === "arrastando", arrastando.fase);
  const params = paramsDaFase(arrastando);
  ok("C2 (o raio da Aura em arrasto é o DISTÂNCIA MEDIDA, não o valor de configuração)",
    !!params && params.tipo === "aura" && Math.abs(params.raioM - 3) < 0.6, JSON.stringify(params));

  const concluida = soltar(arrastando);
  ok("C3 (soltar depois do arrasto conclui a prévia local — 'concluida_local')", concluida.fase === "concluida_local", concluida.fase);
  if (concluida.fase === "concluida_local" && concluida.params.tipo === "aura") {
    ok("C4 (o raio CONCLUÍDO é o medido pelo arrasto, não `raioAuraM` da config)",
      Math.abs(concluida.params.raioM - 3) < 0.6, `raioM=${concluida.params.raioM}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// D. Gesto CONTÍNUO (clicar no token e já arrastar, sem soltar entre os dois)
// ══════════════════════════════════════════════════════════════════
{
  const pressionada = escolherTokenDaAura({
    config: configAura, tokenId: "t1", origem: origemToken, pointerId: 3, px: { x: 0, y: 0 }, precisaoLivre: false,
  });
  const cursor = { q: origemToken.q + 5, r: origemToken.r };
  const arrastando = mover(pressionada, configAura, cursor, { x: 40, y: 0 }, T, false);
  ok("D1 (fluxo contínuo — arrastar sem soltar já mede o raio)", arrastando.fase === "arrastando", arrastando.fase);
  const params = paramsDaFase(arrastando);
  ok("D2 (raio medido ~5 m, nunca o padrão de config)", !!params && params.tipo === "aura" && Math.abs(params.raioM - 5) < 0.6, JSON.stringify(params));
}

// ══════════════════════════════════════════════════════════════════
// E. `paramsDoArraste` da Aura usa a distância medida — regressão direta do bug relatado
// ══════════════════════════════════════════════════════════════════
{
  const cursor10m = { q: origemToken.q + 10, r: origemToken.r };
  const p = paramsDoArraste(configAura, origemToken, cursor10m, T, false);
  ok("E1 (10 m de arrasto produz raioM ≈ 10, NUNCA `raioAuraM` (3, o padrão de config))",
    p.tipo === "aura" && Math.abs(p.raioM - 10) < 0.6 && p.raioM !== configAura.raioAuraM, JSON.stringify(p));
}

// ══════════════════════════════════════════════════════════════════
// F. `Esc` em cada fase da Aura — nunca cancela mais do que o pedido
// ══════════════════════════════════════════════════════════════════
{
  ok("F1 (Esc em 'escolhendo_token_da_aura' — cancela a criação inteira)",
    escapeNaAura(comecarEscolhaDeTokenDaAura()).fase === "ociosa", escapeNaAura(comecarEscolhaDeTokenDaAura()).fase);

  const definindo: EstadoAreas = { fase: "definindo_raio_da_aura", tokenId: "t1", origem: origemToken };
  const voltaEscolhaToken = escapeNaAura(definindo);
  ok("F2 (Esc em 'definindo_raio_da_aura' — descarta o token, volta a escolher)",
    voltaEscolhaToken.fase === "escolhendo_token_da_aura", voltaEscolhaToken.fase);

  const pressionada = escolherTokenDaAura({ config: configAura, tokenId: "t1", origem: origemToken, pointerId: 9, px: { x: 0, y: 0 }, precisaoLivre: false });
  const cursor = { q: origemToken.q + 4, r: origemToken.r };
  const arrastando = mover(pressionada, configAura, cursor, { x: 40, y: 0 }, T, false);
  const voltaAoRaio = escapeNaAura(arrastando);
  ok("F3 (Esc DURANTE o arrasto do raio — cancela só o gesto, volta a 'definindo_raio_da_aura' com o MESMO token)",
    voltaAoRaio.fase === "definindo_raio_da_aura" && voltaAoRaio.tokenId === "t1", JSON.stringify(voltaAoRaio));

  const concluida = soltar(arrastando);
  const voltaAoRaioDaConcluida = escapeNaAura(concluida);
  ok("F4 (Esc numa prévia concluída de Aura — descarta a prévia, volta a 'definindo_raio_da_aura' com o mesmo token)",
    voltaAoRaioDaConcluida.fase === "definindo_raio_da_aura" && voltaAoRaioDaConcluida.tokenId === "t1", JSON.stringify(voltaAoRaioDaConcluida));
}

// ══════════════════════════════════════════════════════════════════
// G. Demais formatos continuam com clique-sem-arraste = nenhuma geometria
// ══════════════════════════════════════════════════════════════════
{
  const configEsfera: ConfigAreas = { ...CONFIG_AREAS_PADRAO, tipo: "esfera" };
  const pressionada = pressionar({
    config: configEsfera, origemBruta: { q: 0, r: 0 }, origemEfetiva: { q: 0, r: 0 }, tokenCapturado: null,
    pointerId: 1, px: { x: 0, y: 0 }, precisaoLivre: false,
  });
  const solto = soltar(pressionada);
  ok("G1 (Esfera: clique sem arraste não cria geometria nenhuma — comportamento inalterado)", solto.fase === "ociosa", solto.fase);
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
