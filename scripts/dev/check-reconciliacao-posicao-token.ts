/**
 * Teste DETERMINÍSTICO, sem browser, das funções puras de
 * `_dominio/reconciliacaoPosicao.ts`.
 *
 * Chama as funções REAIS exportadas diretamente, com entradas
 * fabricadas — sem reimplementar `onAnimacaoConcluida`/`onToken` de
 * `VttClient.tsx` aqui. Reduz o risco de o teste e a integração
 * divergirem: se a política mudar, este arquivo continua testando a
 * política de verdade, não uma cópia que pode ficar desatualizada.
 *
 * O que NÃO é (nem tenta ser) coberto aqui, por ser responsabilidade
 * de INTEGRAÇÃO (React/efeitos), não de função pura — confirmado por
 * leitura de código em `VttClient.tsx`, não reimplementado:
 *   - que `onToken` de fato chama `reconciliarPosicaoOnToken` mesmo
 *     quando `jaAplicado` é verdadeiro (o guard `if (protecao)` está
 *     FORA de qualquer condicional sobre `jaAplicado` — só a ESCRITA
 *     da linha do token depende disso, não a limpeza da proteção);
 *   - que o timer único é de fato agendado/cancelado nos pontos certos
 *     (criação de proteção, limpeza, troca de cena).
 * O que ESTE arquivo prova é que, dado o par (proteção atual, evento),
 * a FUNÇÃO decide corretamente — a chamada dela no lugar certo é
 * verificável por leitura do arquivo (poucas linhas, comentadas).
 */

import type { Hex } from "../../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import {
  type ProtecaoMovimentoVisual,
  criarProtecaoMovimento,
  decidirNovoMovimento,
  reconciliarPosicaoOnToken,
  limparProtecaoToken,
  limparTodasAsProtecoes,
  proximaExpiracao,
  removerProtecoesExpiradas,
} from "../../src/app/mesas/[campaignId]/vtt/_dominio/reconciliacaoPosicao";

let passou = 0;
let falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const TOKEN = "tok-1";
const TOKEN2 = "tok-2";
const A: Hex = { q: 5, r: 0 };
const B: Hex = { q: 10, r: 0 };
const JANELA_MS = 1500;

// ── 1-3. Broadcast fora de ordem: B chega primeiro, A (mais antigo) depois — A é rejeitado ──
{
  // B chega primeiro — nenhuma proteção anterior, sempre aceito.
  const decisaoB = decidirNovoMovimento(null, { movementId: "mov-B", iniciadoEm: 1000 });
  registrar("1 (broadcast B, sem proteção anterior: aplicar)", decisaoB === "aplicar", `decisão=${decisaoB}`);
  const protecaoB = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-B", destino: B, iniciadoEm: 1000, agora: 1100, janelaMs: JANELA_MS });

  // A chega DEPOIS (ordem de chegada local), mas seu `iniciadoEm` (900)
  // é MENOR que o de B (1000) — é mais ANTIGO na origem real, mesmo
  // tendo chegado por último na rede.
  const decisaoA = decidirNovoMovimento({ movementId: protecaoB.movementId, iniciadoEm: protecaoB.iniciadoEm }, { movementId: "mov-A", iniciadoEm: 900 });
  registrar("2 (broadcast A, mais antigo por `iniciadoEm`, chegando DEPOIS de B: ignorar)", decisaoA === "ignorar", `decisão=${decisaoA}`);

  // Como a decisão foi "ignorar", o chamador NUNCA substitui a proteção
  // — ela continua sendo exatamente `protecaoB`, intocada.
  registrar("3 (animação e proteção continuam apontando pra B — A nunca a substituiu)", protecaoB.movementId === "mov-B" && protecaoB.destino.q === B.q && protecaoB.destino.r === B.r, `proteção=${JSON.stringify(protecaoB)}`);
}

// ── 1b/2b/3b. Reprodução exata do achado da rodada seguinte: a
// CONFIRMAÇÃO de B encerra `protecoesPosicaoRef` (a proteção visual),
// mas `ultimosMovimentosRef` (a identidade do movimento vigente)
// sobrevive — sem isso, um A atrasado chegando DEPOIS da confirmação
// encontraria "nada vigente" e seria aceito por engano. ─────────────
{
  // 1. broadcast B é aceito — cria a entrada em AMBOS os mapas (mesmo
  // objeto, `VttClient.tsx` faz `protecoesPosicaoRef.set(...)` e
  // `ultimosMovimentosRef.set(...)` com a MESMA `entrada`).
  const entradaB = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-B", destino: B, iniciadoEm: 1000, agora: 1100, janelaMs: JANELA_MS });
  let protecoesPosicao = new Map([[TOKEN, entradaB]]);
  const ultimosMovimentos = new Map([[TOKEN, entradaB]]);

  // 2. `onToken` de B confirma o destino — `reconciliarPosicaoOnToken`
  // diz pra limpar. O CHAMADOR (replicando exatamente `VttClient.tsx`)
  // só aplica isso em `protecoesPosicao` — `ultimosMovimentos` nunca é
  // tocado por essa limpeza.
  const decisaoConfirmacao = reconciliarPosicaoOnToken({ protecao: entradaB, eventoTokenId: TOKEN, eventoPosicao: B, agora: 1200 });
  if (decisaoConfirmacao.limparProtecao) protecoesPosicao = limparProtecaoToken(protecoesPosicao, TOKEN);
  registrar("1b (confirmação de B: proteção de posição encerrada)", !protecoesPosicao.has(TOKEN), `has=${protecoesPosicao.has(TOKEN)}`);
  registrar("2b (confirmação de B: identidade em `ultimosMovimentos` SOBREVIVE)", ultimosMovimentos.get(TOKEN)?.movementId === "mov-B", `ultimoConhecido=${JSON.stringify(ultimosMovimentos.get(TOKEN))}`);

  // 3. broadcast A, mais antigo, chega DEPOIS da confirmação de B — a
  // arbitragem compara contra `ultimosMovimentos` (que ainda tem B),
  // NUNCA contra `protecoesPosicao` (que já está vazio nesse ponto) —
  // se comparasse contra a proteção de posição já esvaziada, `atual`
  // seria `null` e A seria aceito por engano.
  const ultimoConhecidoAposConfirmacao = ultimosMovimentos.get(TOKEN) ?? null;
  const decisaoAAtrasado = decidirNovoMovimento(
    ultimoConhecidoAposConfirmacao ? { movementId: ultimoConhecidoAposConfirmacao.movementId, iniciadoEm: ultimoConhecidoAposConfirmacao.iniciadoEm } : null,
    { movementId: "mov-A", iniciadoEm: 900 },
  );
  registrar("3b (A atrasado, chegando DEPOIS da confirmação de B: continua rejeitado)", decisaoAAtrasado === "ignorar", `decisão=${decisaoAAtrasado}`);
}

// ── 4. Broadcast duplicado de B é no-op ──────────────────────────────
{
  const protecaoB = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-B", destino: B, iniciadoEm: 1000, agora: 1100, janelaMs: JANELA_MS });
  const decisaoDuplicata = decidirNovoMovimento({ movementId: protecaoB.movementId, iniciadoEm: protecaoB.iniciadoEm }, { movementId: "mov-B", iniciadoEm: 1000 });
  registrar("4 (broadcast duplicado do MESMO movimento: duplicata, não reinicia nada)", decisaoDuplicata === "duplicata", `decisão=${decisaoDuplicata}`);
}

// ── 5. Empate temporal exato: resultado determinístico e estável ────
{
  // Mesmo `iniciadoEm` (500) pros dois, `movementId` diferentes
  // ("mov-X" vs "mov-Y") — o desempate é por comparação de string,
  // então "mov-Y" > "mov-X" sempre vence, EM QUALQUER ORDEM de chegada:
  const candidatoYVenceX = decidirNovoMovimento({ movementId: "mov-X", iniciadoEm: 500 }, { movementId: "mov-Y", iniciadoEm: 500 });
  const candidatoXPerdeParaY = decidirNovoMovimento({ movementId: "mov-Y", iniciadoEm: 500 }, { movementId: "mov-X", iniciadoEm: 500 });
  registrar("5a (empate: candidato Y contra atual X — Y vence, string maior)", candidatoYVenceX === "aplicar", `decisão=${candidatoYVenceX}`);
  registrar("5b (empate, ORDEM DE CHEGADA invertida: candidato X contra atual Y — X ainda perde, mesmo resultado)", candidatoXPerdeParaY === "ignorar", `decisão=${candidatoXPerdeParaY}`);
}

// ── 6/7. Reconciliação de POSIÇÃO independe de `jaAplicado`/revisão — a função nem recebe esse conceito ──
{
  const protecaoB = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-B", destino: B, iniciadoEm: 1000, agora: 1100, janelaMs: JANELA_MS });

  // 6. Eco confirmatório (posição do evento == destino protegido) —
  // sempre limpa a proteção, incondicionalmente. `VttClient.tsx` chama
  // esta função ANTES de checar `jaAplicado` (só usa `jaAplicado` pra
  // decidir se REESCREVE a linha do token, nunca pra decidir se chama
  // esta função) — é essa chamada incondicional, não a função em si,
  // que garante o comportamento pedido; a função prova que, UMA VEZ
  // chamada, o resultado é sempre o correto.
  const decisaoEco = reconciliarPosicaoOnToken({ protecao: protecaoB, eventoTokenId: TOKEN, eventoPosicao: B, agora: 1200 });
  registrar("6 (eco confirmatório do destino protegido: limpa a proteção)", decisaoEco.limparProtecao === true && decisaoEco.posicao.q === B.q, `decisão=${JSON.stringify(decisaoEco)}`);

  // 7. Evento intermediário/obsoleto (posição do evento == A, não o
  // destino protegido B) — nunca limpa, nunca deixa a posição regredir,
  // mesmo que o chamador tenha `jaAplicado=true` no contexto dele (de
  // novo: esta função não sabe nem precisa saber disso).
  const decisaoIntermediaria = reconciliarPosicaoOnToken({ protecao: protecaoB, eventoTokenId: TOKEN, eventoPosicao: A, agora: 1200 });
  registrar("7 (evento intermediário/obsoleto: NÃO limpa, preserva o destino B)", decisaoIntermediaria.limparProtecao === false && decisaoIntermediaria.posicao.q === B.q && decisaoIntermediaria.posicao.r === B.r, `decisão=${JSON.stringify(decisaoIntermediaria)}`);
}

// ── 8. Proteção expira mesmo sem chegar nenhum `onToken` novo ───────
{
  const protecaoB = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-B", destino: B, iniciadoEm: 1000, agora: 1000, janelaMs: JANELA_MS });
  const protecoes = new Map([[TOKEN, protecaoB]]);
  registrar("8a (`proximaExpiracao` aponta pro `expiraEm` da única proteção — é o instante que o timer único agendaria)", proximaExpiracao(protecoes) === protecaoB.expiraEm, `proximaExpiracao=${proximaExpiracao(protecoes)}, expiraEm=${protecaoB.expiraEm}`);
  // O timer dispara SOZINHO no instante agendado — nenhum `onToken`
  // chega nesse meio-tempo. `removerProtecoesExpiradas` é exatamente o
  // que o callback do timer executa.
  const depoisDoTimer = removerProtecoesExpiradas(protecoes, protecaoB.expiraEm);
  registrar("8b (proteção removida pelo timer sozinho, sem nenhum `onToken` novo)", !depoisDoTimer.has(TOKEN), `has=${depoisDoTimer.has(TOKEN)}`);
}

// ── 9. Timer antigo não remove proteção NOVA do mesmo token ─────────
{
  const protecaoAntiga = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-old", destino: A, iniciadoEm: 1000, agora: 1000, janelaMs: 500 }); // expiraEm=1500
  const instanteQueOTimerVelhoDispararia = protecaoAntiga.expiraEm;

  // Antes desse instante chegar, a proteção antiga é SUBSTITUÍDA por
  // uma nova (outro movimento, outro `expiraEm`, bem mais tarde).
  const protecaoNova = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-new", destino: B, iniciadoEm: 2000, agora: 2000, janelaMs: 5000 }); // expiraEm=7000
  const protecoesAtuais = new Map([[TOKEN, protecaoNova]]);

  // O timer "antigo" (que teria sido agendado quando `protecaoAntiga`
  // foi criada) dispara no instante em que ELE foi programado — mas
  // `removerProtecoesExpiradas` sempre lê o mapa ATUAL passado por
  // quem chama, nunca uma referência capturada no momento do
  // agendamento. Como o mapa atual já tem `protecaoNova` (que expira
  // muito depois), nada é removido.
  const resultado = removerProtecoesExpiradas(protecoesAtuais, instanteQueOTimerVelhoDispararia);
  registrar("9 (timer velho, disparando no tempo agendado pra proteção antiga, não remove a proteção NOVA do mesmo token)", resultado.get(TOKEN)?.movementId === "mov-new", `proteção restante=${JSON.stringify(resultado.get(TOKEN))}`);
}

// ── 10. Outro token permanece intacto durante toda a arbitragem ─────
{
  const protecaoToken2 = criarProtecaoMovimento({ tokenId: TOKEN2, movementId: "mov-outro", destino: { q: 99, r: 99 }, iniciadoEm: 1000, agora: 1000, janelaMs: JANELA_MS });
  const protecoes = new Map([[TOKEN2, protecaoToken2]]);

  // Toda a arbitragem de B/A do token 1 acontece "ao lado" — nenhuma
  // função aqui recebe ou toca `protecoes` (o mapa do token 2).
  decidirNovoMovimento(null, { movementId: "mov-B", iniciadoEm: 1000 });
  decidirNovoMovimento({ movementId: "mov-B", iniciadoEm: 1000 }, { movementId: "mov-A", iniciadoEm: 900 });
  reconciliarPosicaoOnToken({ protecao: protecaoToken2, eventoTokenId: TOKEN /* nota: token DIFERENTE do protegido */, eventoPosicao: A, agora: 1100 });

  registrar("10 (outro token permanece intacto)", protecoes.get(TOKEN2)?.movementId === "mov-outro" && protecoes.get(TOKEN2)?.destino.q === 99, `proteção token2=${JSON.stringify(protecoes.get(TOKEN2))}`);
}

// ── Limpeza: token removido / troca de cena ──────────────────────────
{
  const protecoes = new Map<string, ProtecaoMovimentoVisual>();
  protecoes.set(TOKEN, criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-B", destino: B, iniciadoEm: 1000, agora: 1000, janelaMs: JANELA_MS }));
  protecoes.set(TOKEN2, criarProtecaoMovimento({ tokenId: TOKEN2, movementId: "mov-outro", destino: { q: 99, r: 99 }, iniciadoEm: 1000, agora: 1000, janelaMs: JANELA_MS }));

  const depoisDeRemoverToken1 = limparProtecaoToken(protecoes, TOKEN);
  registrar("R1 (token removido: sua proteção some)", !depoisDeRemoverToken1.has(TOKEN), `has(TOKEN)=${depoisDeRemoverToken1.has(TOKEN)}`);
  registrar("R2 (token removido: proteção de OUTRO token intacta)", depoisDeRemoverToken1.get(TOKEN2)?.destino.q === 99, `proteção token2=${JSON.stringify(depoisDeRemoverToken1.get(TOKEN2))}`);
  registrar("R3 (remover proteção de token sem proteção nenhuma é no-op — mesma referência)", limparProtecaoToken(depoisDeRemoverToken1, "token-inexistente") === depoisDeRemoverToken1, "");

  const depoisDaTrocaDeCena = limparTodasAsProtecoes();
  registrar("C1 (troca de cena: todas as proteções somem)", depoisDaTrocaDeCena.size === 0, `size=${depoisDaTrocaDeCena.size}`);
}

// ── Recusa real de B restaura a posição confirmada (a origem) ───────
{
  const O: Hex = { q: 0, r: 0 };
  // Movimento otimista B começa.
  const protecaoB = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-B", destino: B, iniciadoEm: 1000, agora: 1000, janelaMs: JANELA_MS });
  // Servidor recusa — retração é um movimento NOVO (outro `movementId`,
  // `iniciadoEm` posterior por construção: acontece depois, na resposta
  // da rejeição), destino = origem confirmada. Passa pela MESMA
  // arbitragem de qualquer outro candidato.
  const decisaoRetracao = decidirNovoMovimento({ movementId: protecaoB.movementId, iniciadoEm: protecaoB.iniciadoEm }, { movementId: "mov-B:retreat", iniciadoEm: 1050 });
  registrar("J1 (retração aceita — é um movimento mais novo que a tentativa original)", decisaoRetracao === "aplicar", `decisão=${decisaoRetracao}`);
  const protecaoRetracao = criarProtecaoMovimento({ tokenId: TOKEN, movementId: "mov-B:retreat", destino: O, iniciadoEm: 1050, agora: 1050, janelaMs: JANELA_MS });

  const decisaoConfirmaOrigem = reconciliarPosicaoOnToken({ protecao: protecaoRetracao, eventoTokenId: TOKEN, eventoPosicao: O, agora: 1200 });
  registrar("J2 (onToken confirma a origem: posição=O, proteção encerrada)", decisaoConfirmaOrigem.posicao.q === O.q && decisaoConfirmaOrigem.posicao.r === O.r && decisaoConfirmaOrigem.limparProtecao === true, `decisão=${JSON.stringify(decisaoConfirmaOrigem)}`);
}

console.log(`\n${passou} passaram, ${falhou} falharam.`);
process.exit(falhou > 0 ? 1 : 0);
