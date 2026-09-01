/**
 * Testes PUROS das decisões de gesto de Áreas — `_ferramentas/
 * areasSnap.ts`: snap angular de 15°, arredondamento de dimensão
 * (inteiro por padrão, livre com modificador) e snap da origem em
 * token. Determinísticos, sem browser, sem banco.
 *
 * Uso: npx tsx scripts/test-vtt-areas-snap.ts
 */

import {
  type TokenParaSnap,
  CASAS_PRECISAO_LIVRE, LIMITE_SNAP_TOKEN_CELULAS, PASSO_SNAP_DIRECAO_GRAUS,
  arredondarDimensao, candidatoAoSnap, formatarMetros, limitarCasas, limiteSnapTokenEmMundo,
  normalizarGraus, precisaoLivreDoEvento, resolverOrigemArea, resolverSnapCelula, resolverSnapToken, snapAngular, tipoTemDirecao,
} from "../src/app/mesas/[campaignId]/vtt/_ferramentas/areasSnap";
import { mundoParaAxial, axialParaMundo } from "../src/app/mesas/[campaignId]/vtt/_dominio/escalaMapa";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const T = 26;

// ══════════════════════════════════════════════════════════════════
// A. Snap angular
// ══════════════════════════════════════════════════════════════════
{
  ok("A1 (passo é 15°)", PASSO_SNAP_DIRECAO_GRAUS === 15, `${PASSO_SNAP_DIRECAO_GRAUS}`);

  // Perto de 0°.
  ok("A2 (1° trava em 0°)", snapAngular(1, true) === 0, `${snapAngular(1, true)}`);
  ok("A2b (359° trava em 0°, não em 360°)", snapAngular(359, true) === 0, `${snapAngular(359, true)}`);
  ok("A2c (7° trava em 0°)", snapAngular(7, true) === 0, `${snapAngular(7, true)}`);
  ok("A2d (8° trava em 15°)", snapAngular(8, true) === 15, `${snapAngular(8, true)}`);

  // Limite exato entre dois passos — empate metade PARA CIMA.
  ok("A3 (7,5° — empate exato — sobe pra 15°, regra metade-para-cima)", snapAngular(7.5, true) === 15, `${snapAngular(7.5, true)}`);
  ok("A3b (22,5° — empate — sobe pra 30°)", snapAngular(22.5, true) === 30, `${snapAngular(22.5, true)}`);
  ok("A3c (352,5° — empate no topo — sobe e volta pra 0°, nunca 360°)", snapAngular(352.5, true) === 0, `${snapAngular(352.5, true)}`);

  // Ângulos negativos e passagem por 360°.
  ok("A4 (-90° vira 270°)", snapAngular(-90, true) === 270, `${snapAngular(-90, true)}`);
  ok("A4b (-1° vira 0°)", snapAngular(-1, true) === 0, `${snapAngular(-1, true)}`);
  ok("A4c (-8° vira 345°)", snapAngular(-8, true) === 345, `${snapAngular(-8, true)}`);
  ok("A4d (370° vira 15°)", snapAngular(370, true) === 15, `${snapAngular(370, true)}`);
  ok("A4e (720° vira 0°)", snapAngular(720, true) === 0, `${snapAngular(720, true)}`);
  ok("A4f (normalizarGraus sozinho: -90 → 270)", normalizarGraus(-90) === 270, `${normalizarGraus(-90)}`);

  // Todo resultado fica na faixa canônica [0,360).
  let foraDaFaixa = 0;
  for (let g = -720; g <= 720; g += 0.5) {
    const r = snapAngular(g, true);
    if (!(r >= 0 && r < 360)) foraDaFaixa++;
    if (r % 15 !== 0) foraDaFaixa++;
  }
  ok("A5 (2881 ângulos: resultado sempre em [0,360) E múltiplo de 15)", foraDaFaixa === 0, `${foraDaFaixa} violações`);

  // Desligado: direção livre, nenhuma quantização.
  ok("A6 (desligado — 37,3° passa intacto)", snapAngular(37.3, false) === 37.3, `${snapAngular(37.3, false)}`);
  ok("A6b (desligado ainda normaliza a faixa: -30 → 330)", snapAngular(-30, false) === 330, `${snapAngular(-30, false)}`);

  // ESTABILIDADE: reavaliar o mesmo ângulo dá sempre o mesmo resultado
  // (sem histerese, sem dependência do valor anterior).
  let instavel = 0;
  for (const g of [0, 7.4999, 7.5, 7.5001, 44.9, 45, 45.1, 359.9]) {
    const primeira = snapAngular(g, true);
    for (let i = 0; i < 50; i++) if (snapAngular(g, true) !== primeira) instavel++;
  }
  ok("A7 (ponteiro parado — 50 reavaliações do mesmo ângulo dão sempre o mesmo passo)", instavel === 0, `${instavel} oscilações`);

  // Quais tipos oferecem a opção.
  ok("A8 (tipos com direção: linha, faixa, parede, cubo, cone)",
    ["linha", "faixa", "parede", "cubo", "cone"].every(tipoTemDirecao), "todos");
  ok("A8b (esfera/domo/aura NÃO têm direção — a opção não se aplica)",
    !tipoTemDirecao("esfera") && !tipoTemDirecao("domo") && !tipoTemDirecao("aura"), "nenhum");

  // O Cone: o snap muda a DIREÇÃO CENTRAL, nunca a abertura (que é
  // outro parâmetro, fixo em 45° — este módulo nem o toca).
  ok("A9 (snapAngular só devolve direção — nenhuma função aqui toca abertura do cone)",
    typeof snapAngular(40, true) === "number" && snapAngular(40, true) === 45, `direção=${snapAngular(40, true)}`);
}

// ══════════════════════════════════════════════════════════════════
// B. Arredondamento de dimensão
// ══════════════════════════════════════════════════════════════════
{
  // Padrão: inteiro.
  ok("B1 (2,23 m vira 2 m no modo padrão)", arredondarDimensao(2.23, false) === 2, `${arredondarDimensao(2.23, false)}`);
  ok("B1b (3,71 m vira 4 m)", arredondarDimensao(3.71, false) === 4, `${arredondarDimensao(3.71, false)}`);
  ok("B1c (5,08 m vira 5 m)", arredondarDimensao(5.08, false) === 5, `${arredondarDimensao(5.08, false)}`);
  ok("B1d (valor já inteiro não muda)", arredondarDimensao(6, false) === 6, `${arredondarDimensao(6, false)}`);

  // Empate: metade PARA CIMA — critério explícito e testado.
  ok("B2 (2,5 m — empate exato — sobe pra 3 m)", arredondarDimensao(2.5, false) === 3, `${arredondarDimensao(2.5, false)}`);
  ok("B2b (0,5 m — empate — sobe pra 1 m)", arredondarDimensao(0.5, false) === 1, `${arredondarDimensao(0.5, false)}`);
  ok("B2c (1,5 m — empate — sobe pra 2 m)", arredondarDimensao(1.5, false) === 2, `${arredondarDimensao(1.5, false)}`);

  // Abaixo de 0,5 m: arredonda pra 0 e continua degenerado (o domínio
  // recusa) — este módulo nunca inventa um mínimo pra salvar o gesto.
  ok("B3 (0,3 m no modo inteiro vira 0 — gesto degenerado, recusado pelo domínio)", arredondarDimensao(0.3, false) === 0, `${arredondarDimensao(0.3, false)}`);
  ok("B3b (0,49 m vira 0)", arredondarDimensao(0.49, false) === 0, `${arredondarDimensao(0.49, false)}`);

  // Precisão livre.
  ok("B4 (com modificador, 2,23 m permanece 2,23 m)", arredondarDimensao(2.23, true) === 2.23, `${arredondarDimensao(2.23, true)}`);
  ok("B4b (com modificador, 0,3 m permanece 0,3 m)", arredondarDimensao(0.3, true) === 0.3, `${arredondarDimensao(0.3, true)}`);
  ok("B4c (com modificador, limita a 2 casas: 3,14159 → 3,14)", arredondarDimensao(3.14159, true) === 3.14, `${arredondarDimensao(3.14159, true)}`);
  ok("B4d (CASAS_PRECISAO_LIVRE é 2)", CASAS_PRECISAO_LIVRE === 2, `${CASAS_PRECISAO_LIVRE}`);

  // Ruído de ponto flutuante NUNCA aparece.
  const suspeitos = [2.23, 1.1 + 2.2, 0.1 + 0.2, 8.115, 1.005, 4.35];
  const comRuido = suspeitos.filter((v) => {
    const r = arredondarDimensao(v, true);
    return String(r).replace("-", "").replace(".", "").length > 6;
  });
  ok("B5 (nenhum valor livre sai com ruído binário tipo 2,2300000001)", comRuido.length === 0, `${JSON.stringify(suspeitos.map((v) => arredondarDimensao(v, true)))}`);
  ok("B5b (limitarCasas(1.1+2.2) = 3.3 exato, não 3.3000000000000003)", limitarCasas(1.1 + 2.2) === 3.3, `${limitarCasas(1.1 + 2.2)}`);

  // Entradas inválidas nunca propagam.
  ok("B6 (NaN vira 0)", arredondarDimensao(NaN, false) === 0 && arredondarDimensao(NaN, true) === 0, "0");
  ok("B6b (Infinity vira 0)", arredondarDimensao(Infinity, true) === 0, `${arredondarDimensao(Infinity, true)}`);
  ok("B6c (negativo vira 0 — dimensão nunca é negativa)", arredondarDimensao(-3, false) === 0, `${arredondarDimensao(-3, false)}`);

  // Modificador lido do EVENTO — nunca de estado global.
  ok("B7 (Alt liga precisão livre)", precisaoLivreDoEvento({ altKey: true }), "sim");
  ok("B7b (Meta/Command liga precisão livre)", precisaoLivreDoEvento({ metaKey: true }), "sim");
  ok("B7c (nenhum modificador — modo inteiro)", !precisaoLivreDoEvento({}), "não");
  ok("B7d (altKey false explícito — modo inteiro)", !precisaoLivreDoEvento({ altKey: false, metaKey: false }), "não");

  // Modificador pressionado E solto durante o mesmo gesto: como a
  // decisão vem do evento atual, o mesmo valor bruto alterna
  // imediatamente entre livre e inteiro.
  const bruto = 3.71;
  const sequencia = [false, true, true, false, true, false].map((mod) => arredondarDimensao(bruto, mod));
  ok("B8 (mesmo valor bruto alterna imediatamente conforme o modificador do evento)",
    JSON.stringify(sequencia) === JSON.stringify([4, 3.71, 3.71, 4, 3.71, 4]), JSON.stringify(sequencia));

  // Formatação.
  ok("B9 (inteiro formata sem casas)", formatarMetros(3) === "3 m", formatarMetros(3));
  ok("B9b (fração formata com vírgula)", formatarMetros(2.23) === "2,23 m", formatarMetros(2.23));
  ok("B9c (fração de uma casa não ganha zero à toa)", formatarMetros(2.5) === "2,5 m", formatarMetros(2.5));
  ok("B9d (ruído binário não vaza na formatação)", formatarMetros(1.1 + 2.2) === "3,3 m", formatarMetros(1.1 + 2.2));
}

// ══════════════════════════════════════════════════════════════════
// C. Snap da origem em token
// ══════════════════════════════════════════════════════════════════
{
  const tok = (id: string, q: number, r: number, elegivel = true): TokenParaSnap => ({ id, origem: { q, r }, elegivel });

  ok("C0 (limite é 1,5 célula, centralizado)", LIMITE_SNAP_TOKEN_CELULAS === 1.5, `${LIMITE_SNAP_TOKEN_CELULAS}`);
  ok("C0b (limite convertido pra unidades do mundo bate com 1,5 m)", Math.abs(limiteSnapTokenEmMundo(T) - 1.5 * T * Math.sqrt(3)) < 1e-9, `${limiteSnapTokenEmMundo(T).toFixed(3)}`);

  // Desligado: nunca captura.
  {
    const r = resolverSnapToken({ ponto: { q: 5, r: 5 }, tokens: [tok("a", 5, 5)], ligado: false, tamanhoCelula: T });
    ok("C1 (opção desligada — nunca captura, mantém o ponto clicado)", r.tokenId === null && r.origem.q === 5, JSON.stringify(r));
  }

  // Nenhum token próximo.
  {
    const r = resolverSnapToken({ ponto: { q: 0, r: 0 }, tokens: [tok("a", 20, 20)], ligado: true, tamanhoCelula: T });
    ok("C2 (nenhum token dentro do limite — origem livre, criação não é bloqueada)", r.tokenId === null && r.origem.q === 0 && r.origem.r === 0, JSON.stringify(r));
  }

  // Um token próximo.
  {
    const r = resolverSnapToken({ ponto: { q: 5.2, r: 5.1 }, tokens: [tok("a", 5, 5)], ligado: true, tamanhoCelula: T });
    ok("C3 (um token próximo — origem vira a ORIGEM MECÂNICA dele, não o ponto clicado)", r.tokenId === "a" && r.origem.q === 5 && r.origem.r === 5, JSON.stringify(r));
  }

  // Dois tokens à MESMA distância — desempate determinístico por id.
  {
    const ponto = { q: 5, r: 5 };
    const a = tok("zzz", 4, 5), b = tok("aaa", 6, 5);
    const r1 = resolverSnapToken({ ponto, tokens: [a, b], ligado: true, tamanhoCelula: T });
    const r2 = resolverSnapToken({ ponto, tokens: [b, a], ligado: true, tamanhoCelula: T });
    ok("C4 (empate exato — desempate pelo MENOR id, não pela ordem do array)", r1.tokenId === "aaa" && r2.tokenId === "aaa", `${r1.tokenId} / ${r2.tokenId}`);
  }

  // Token inelegível (oculto/decorativo/não autorizado) é ignorado.
  {
    const r = resolverSnapToken({ ponto: { q: 5, r: 5 }, tokens: [tok("oculto", 5, 5, false)], ligado: true, tamanhoCelula: T });
    ok("C5 (token inelegível é ignorado mesmo em cima do ponteiro)", r.tokenId === null, JSON.stringify(r));
  }
  {
    // Inelegível perto + elegível um pouco mais longe: captura o elegível.
    const r = resolverSnapToken({ ponto: { q: 5, r: 5 }, tokens: [tok("perto", 5, 5, false), tok("longe", 6, 5, true)], ligado: true, tamanhoCelula: T });
    ok("C5b (com um inelegível em cima, captura o elegível vizinho)", r.tokenId === "longe", JSON.stringify(r));
  }

  // Pegada multicelular: a origem mecânica pode cair ENTRE células — o
  // snap usa exatamente esse ponto fracionário.
  {
    const origemGrande = { q: 5 + 1 / 3, r: 5 + 1 / 3 }; // centroide de um "grande" ancorado em (5,5)
    const r = resolverSnapToken({ ponto: { q: 5.4, r: 5.4 }, tokens: [{ id: "g", origem: origemGrande, elegivel: true }], ligado: true, tamanhoCelula: T });
    ok("C6 (pegada multicelular — captura a origem mecânica FRACIONÁRIA, não a âncora inteira)",
      r.tokenId === "g" && Math.abs(r.origem.q - (5 + 1 / 3)) < 1e-12 && !Number.isInteger(r.origem.q), JSON.stringify(r.origem));
  }

  // Limite EXATO: um token exatamente na distância-limite ainda conta;
  // um fio além, não.
  {
    const centro = axialParaMundo({ q: 0, r: 0 }, T);
    const limite = limiteSnapTokenEmMundo(T);
    const noLimite = mundoParaAxial(centro.x + limite, centro.y, T);
    const alemDoLimite = mundoParaAxial(centro.x + limite * 1.0001, centro.y, T);
    const rNo = resolverSnapToken({ ponto: { q: 0, r: 0 }, tokens: [{ id: "t", origem: noLimite, elegivel: true }], ligado: true, tamanhoCelula: T });
    const rAlem = resolverSnapToken({ ponto: { q: 0, r: 0 }, tokens: [{ id: "t", origem: alemDoLimite, elegivel: true }], ligado: true, tamanhoCelula: T });
    ok("C7 (token exatamente NO limite é capturado)", rNo.tokenId === "t", `${rNo.tokenId}`);
    ok("C7b (token um fio ALÉM do limite não é capturado)", rAlem.tokenId === null, `${rAlem.tokenId}`);
  }

  // Zoom/pan não participam: o mesmo cenário em escalas diferentes de
  // desenho dá exatamente o mesmo token capturado.
  {
    const tokens = [tok("a", 5, 5), tok("b", 9, 9)];
    const ids = [4, 13, 26, 97.5].map((tam) => resolverSnapToken({ ponto: { q: 5.3, r: 5.2 }, tokens, ligado: true, tamanhoCelula: tam }).tokenId);
    ok("C8 (resultado idêntico em 4 escalas de desenho — zoom e pan não participam)", ids.every((i) => i === ids[0] && i === "a"), JSON.stringify(ids));
  }

  // `candidatoAoSnap` usa a MESMA decisão do gesto real.
  {
    const tokens = [tok("a", 5, 5)];
    const ponto = { q: 5.2, r: 5.1 };
    const candidato = candidatoAoSnap({ ponto, tokens, ligado: true, tamanhoCelula: T });
    const real = resolverSnapToken({ ponto, tokens, ligado: true, tamanhoCelula: T }).tokenId;
    ok("C9 (o realce do candidato prevê exatamente o que a captura real vai fazer)", candidato === real && candidato === "a", `${candidato} / ${real}`);
  }

  // Lista vazia não quebra.
  {
    const r = resolverSnapToken({ ponto: { q: 1, r: 2 }, tokens: [], ligado: true, tamanhoCelula: T });
    ok("C10 (cena sem tokens — origem livre, sem erro)", r.tokenId === null && r.origem.q === 1 && r.origem.r === 2, JSON.stringify(r));
  }
}

// ══════════════════════════════════════════════════════════════════
// D. Snap da origem no CENTRO DA CÉLULA
// ══════════════════════════════════════════════════════════════════
{
  // Clique exatamente no centro do hex (0,0) — resultado é o próprio centro.
  {
    const centro = axialParaMundo({ q: 0, r: 0 }, T);
    const ponto = mundoParaAxial(centro.x, centro.y, T);
    const r = resolverSnapCelula({ ponto, ligado: true, tamanhoCelula: T });
    ok("D1 (clique no centro exato — resultado é o centro canônico (0,0))", r.q === 0 && r.r === 0, JSON.stringify(r));
  }

  // Clique perto de uma borda — ainda cai na célula de origem.
  {
    const centro = axialParaMundo({ q: 0, r: 0 }, T);
    const pertoDaBorda = mundoParaAxial(centro.x + T * 0.4, centro.y, T);
    const r = resolverSnapCelula({ ponto: pertoDaBorda, ligado: true, tamanhoCelula: T });
    ok("D2 (clique perto de uma borda, ainda dentro da célula — cai no centro dela)", r.q === 0 && r.r === 0, JSON.stringify(r));
  }

  // Clique perto de um vértice, mas do lado de FORA — cai na célula vizinha correta.
  {
    const vizinho = axialParaMundo({ q: 1, r: 0 }, T);
    const pertoDoVizinho = mundoParaAxial(vizinho.x - 1, vizinho.y, T);
    const r = resolverSnapCelula({ ponto: pertoDoVizinho, ligado: true, tamanhoCelula: T });
    ok("D3 (clique já do lado do vizinho — snap pro centro do VIZINHO, não da origem)", r.q === 1 && r.r === 0, JSON.stringify(r));
  }

  // Opção desligada preserva o ponto livre exatamente.
  {
    const ponto = { q: 3.37, r: -1.12 };
    const r = resolverSnapCelula({ ponto, ligado: false, tamanhoCelula: T });
    ok("D4 (opção desligada — preserva o ponto livre, sem arredondar)", r.q === ponto.q && r.r === ponto.r, JSON.stringify(r));
  }

  // Zoom/pan não participam: mesmo ponto lógico, escalas de desenho diferentes, mesmo hex.
  {
    const alvo = axialParaMundo({ q: 2, r: -1 }, T);
    const pontoLogico = { q: 2.1, r: -1.05 }; // perto do centro de (2,-1) em qualquer escala
    const resultados = [4, 13, 26, 97.5].map((tam) => resolverSnapCelula({ ponto: pontoLogico, ligado: true, tamanhoCelula: tam }));
    ok("D5 (mesmo ponto axial, 4 escalas de tela — sempre o mesmo hex)",
      resultados.every((r) => r.q === 2 && r.r === -1), JSON.stringify(resultados));
    void alvo;
  }

  // Não importa o que ocupa a célula — token, objeto ou terreno: o centro geométrico é o mesmo.
  {
    const pontoQualquer = { q: 4.3, r: 2.6 };
    const r = resolverSnapCelula({ ponto: pontoQualquer, ligado: true, tamanhoCelula: T });
    ok("D6 (resultado não depende do que ocupa a célula — é geometria pura)", r.q === 4 && r.r === 3, JSON.stringify(r));
  }
}

// ══════════════════════════════════════════════════════════════════
// E. Prioridade entre os dois snaps de origem (token vs. célula)
// ══════════════════════════════════════════════════════════════════
{
  const tok = (id: string, q: number, r: number, elegivel = true): TokenParaSnap => ({ id, origem: { q, r }, elegivel });
  const ponto = { q: 5.2, r: 5.1 };

  // As duas desligadas: ponto livre.
  {
    const r = resolverOrigemArea({ ponto, tokens: [tok("a", 5, 5)], snapToken: false, snapCelula: false, tamanhoCelula: T });
    ok("E1 (as duas desligadas — ponto livre, sem token nem célula)", r.tokenId === null && !r.viaCelula && r.origem.q === ponto.q, JSON.stringify(r));
  }

  // Só célula ligada, sem token por perto: cai no centro da célula.
  {
    const r = resolverOrigemArea({ ponto, tokens: [], snapToken: false, snapCelula: true, tamanhoCelula: T });
    ok("E2 (só célula ligada — cai no centro do hex)", r.tokenId === null && r.viaCelula && r.origem.q === 5 && r.origem.r === 5, JSON.stringify(r));
  }

  // Só token ligado, com token por perto: captura o token, nunca a célula.
  {
    const r = resolverOrigemArea({ ponto, tokens: [tok("a", 5, 5)], snapToken: true, snapCelula: false, tamanhoCelula: T });
    ok("E3 (só token ligado, com token perto — captura o token)", r.tokenId === "a" && !r.viaCelula, JSON.stringify(r));
  }

  // Os dois ligados, COM token por perto: token tem prioridade sobre a célula.
  {
    const r = resolverOrigemArea({ ponto, tokens: [tok("a", 5, 5)], snapToken: true, snapCelula: true, tamanhoCelula: T });
    ok("E4 (os dois ligados, token por perto — token VENCE a célula)", r.tokenId === "a" && !r.viaCelula, JSON.stringify(r));
  }

  // Os dois ligados, SEM token por perto: cai pro centro da célula (nunca falha a criação).
  {
    const r = resolverOrigemArea({ ponto, tokens: [tok("longe", 40, 40)], snapToken: true, snapCelula: true, tamanhoCelula: T });
    ok("E5 (os dois ligados, sem token por perto — degrada pra célula, não falha)", r.tokenId === null && r.viaCelula && r.origem.q === 5 && r.origem.r === 5, JSON.stringify(r));
  }

  // Token inelegível é ignorado mesmo com os dois ligados — cai pra célula.
  {
    const r = resolverOrigemArea({ ponto, tokens: [tok("oculto", 5, 5, false)], snapToken: true, snapCelula: true, tamanhoCelula: T });
    ok("E6 (token inelegível ignorado — degrada pra célula normalmente)", r.tokenId === null && r.viaCelula, JSON.stringify(r));
  }
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
process.exit(falhou > 0 ? 1 : 0);
