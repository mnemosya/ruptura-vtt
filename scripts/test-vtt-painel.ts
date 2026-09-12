/**
 * Testes PUROS do painel lateral da Mesa — moldura, Chat, diretório de
 * Personagens, Participantes, Bando e Compêndio.
 *
 * Sem DOM, sem rede, sem banco: exercita a lógica que os componentes
 * apenas ligam à tela. É o par determinístico do browser check
 * (`scripts/dev/check-vtt-painel.ts`, que precisa de servidor e
 * credenciais reais).
 *
 * Uso: npx tsx scripts/test-vtt-painel.ts
 */

import {
  ABAS_ORDEM,
  LARGURA_MAX,
  LARGURA_MIN,
  LARGURA_PADRAO,
  comecarLeitura,
  dadosDoEstado,
  ehAbaId,
  falharLeitura,
  limitarLarguraPainel,
  proximaAbaPorSeta,
  type AbaId,
  type EstadoAba,
} from "../src/app/mesas/[campaignId]/vtt/_painel/tipos";
import {
  PREFERENCIAS_PAINEL_PADRAO,
  chavePreferenciasPainel,
  normalizarPreferenciasPainel,
} from "../src/app/mesas/[campaignId]/vtt/_painel/preferencias";
import {
  contarNaoLidos,
  detalheDaRolagem,
  estaNoFim,
  familiaDaEntrada,
  iniciaisDe,
  ordenarCronologicamente,
  pendentesAindaVisiveis,
  resolverIdentidade,
  visibilidadesDoPapel,
  type EnvioPendente,
} from "../src/app/mesas/[campaignId]/vtt/_painel/chatModelo";
import {
  contarOnline,
  estadoPresenca,
  montarLinhasParticipantes,
  ordenarParticipantes,
  presencaDisponivel,
} from "../src/app/mesas/[campaignId]/vtt/_painel/participantesModelo";
import {
  contarEntradas,
  desserializarPersonagemArrastado,
  entradaCasaBusca,
  montarArvore,
  normalizarBusca,
  serializarPersonagemArrastado,
  siglaDoNome,
} from "../src/app/mesas/[campaignId]/vtt/_painel/personagensModelo";
import {
  agruparPorCategoria,
  desserializarItemBando,
  detalhesDaInstancia,
  itemCasaBusca,
  rotuloDaCategoriaItem,
  serializarItemBando,
  totalDeUnidades,
} from "../src/app/mesas/[campaignId]/vtt/_painel/bandoModelo";
import {
  CATEGORIAS_COMPENDIO,
  chaveCache,
  ehCategoriaCompendio,
  filtrarLinhas,
  resumoDoPayload,
  rotuloDaOrigem,
  termosDeBusca,
  type LinhaCompendio,
} from "../src/app/mesas/[campaignId]/vtt/_painel/compendioModelo";
import { formatTableLogEntry } from "../src/lib/table/logPresentation";
import type { TableLogEntry } from "../src/lib/table";
import type { EntradaDiretorio, PastaDiretorio } from "../src/app/mesas/[campaignId]/vtt/_painel/acoes/personagensPainel";
import type { ItemBandoPainel } from "../src/app/mesas/[campaignId]/vtt/_painel/acoes/bandoPainel";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) {
    passou++;
    console.log(`ok - ${criterio}: ${detalhe}`);
  } else {
    falhou++;
    console.error(`FALHA - ${criterio}: ${detalhe}`);
  }
}

function log(parcial: Partial<TableLogEntry> & { id: string; created_at: string }): TableLogEntry {
  return {
    campaign_id: "camp",
    character_id: null,
    type: "chat",
    visibility: "public",
    payload: {},
    created_by_user_id: null,
    ...parcial,
  } as TableLogEntry;
}

// ═════════════════════════ MOLDURA ═════════════════════════

ok("M1 (as cinco abas, na ordem canônica)", ABAS_ORDEM.join(",") === "chat,personagens,participantes,bando,compendio", ABAS_ORDEM.join(","));
ok("M2 (ehAbaId recusa qualquer coisa fora do catálogo)", ehAbaId("chat") && !ehAbaId("mapa") && !ehAbaId(null) && !ehAbaId(3), "ok");

{
  const setas = ["ArrowRight", "ArrowDown"] as const;
  const okDireita = setas.every((k) => proximaAbaPorSeta("chat", k) === "personagens");
  const okEsquerda = ["ArrowLeft", "ArrowUp"].every((k) => proximaAbaPorSeta("chat", k) === "compendio");
  ok("M3 (setas andam nos dois eixos, com WRAP nas pontas)", okDireita && okEsquerda, `direita=${okDireita}, wrap-esquerda=${okEsquerda}`);
}
ok(
  "M4 (Home/End vão às pontas; tecla desconhecida devolve null)",
  proximaAbaPorSeta("bando", "Home") === "chat" &&
    proximaAbaPorSeta("chat", "End") === "compendio" &&
    proximaAbaPorSeta("chat", "Enter") === null &&
    proximaAbaPorSeta("chat", "Tab") === null,
  "ok",
);
ok(
  "M5 (largura clampada em LARGURA_MIN–LARGURA_MAX; lixo cai no padrão, nunca NaN)",
  limitarLarguraPainel(10) === LARGURA_MIN &&
    limitarLarguraPainel(9999) === LARGURA_MAX &&
    limitarLarguraPainel(LARGURA_MIN + 0.4) === LARGURA_MIN &&
    limitarLarguraPainel(Number.NaN) === LARGURA_PADRAO &&
    limitarLarguraPainel(Number.POSITIVE_INFINITY) === LARGURA_PADRAO,
  `min=${limitarLarguraPainel(10)}, max=${limitarLarguraPainel(9999)}, nan=${limitarLarguraPainel(Number.NaN)}`,
);

{
  const a = chavePreferenciasPainel("u1", "c1");
  const b = chavePreferenciasPainel("u2", "c1");
  const c = chavePreferenciasPainel("u1", "c2");
  const anon = chavePreferenciasPainel(null, "c1");
  ok(
    "M6 (preferência é por usuário E campanha, e não vaza entre mesas)",
    a !== b && a !== c && anon.includes(":anon:") && /^rv-painel:v\d+:/.test(a),
    `${a} | ${b} | ${c} | ${anon}`,
  );
}
{
  const salvo = normalizarPreferenciasPainel({ aba: "bando", aberto: false, largura: 999 });
  const corrompido = normalizarPreferenciasPainel({ aba: "inexistente", aberto: "sim", largura: "grande" });
  const nada = normalizarPreferenciasPainel(null);
  ok(
    "M7 (leitura de preferência é tolerante campo a campo, nunca descarta o conjunto)",
    salvo.aba === "bando" && salvo.aberto === false && salvo.largura === LARGURA_MAX &&
      corrompido.aba === PREFERENCIAS_PAINEL_PADRAO.aba &&
      corrompido.aberto === PREFERENCIAS_PAINEL_PADRAO.aberto &&
      corrompido.largura === PREFERENCIAS_PAINEL_PADRAO.largura &&
      nada.aba === PREFERENCIAS_PAINEL_PADRAO.aba,
    JSON.stringify({ salvo, corrompido }),
  );
}

{
  // Releitura que falha PRESERVA o que já estava na tela — o achado que
  // o provider da campanha já documenta, aplicado a cada aba.
  const pronto: EstadoAba<number[]> = { fase: "pronto", dados: [1, 2, 3] };
  const relendo = comecarLeitura(pronto);
  const falhou_ = falharLeitura(relendo, "rede caiu");
  const doZero = comecarLeitura({ fase: "ocioso" } as EstadoAba<number[]>);
  ok(
    "M8 (erro de releitura preserva o dado antigo; primeira leitura mostra 'carregando')",
    relendo.fase === "recarregando" &&
      falhou_.fase === "erro" &&
      JSON.stringify(dadosDoEstado(falhou_)) === "[1,2,3]" &&
      doZero.fase === "carregando" &&
      dadosDoEstado(doZero) === null,
    `${relendo.fase} → ${falhou_.fase}, dados=${JSON.stringify(dadosDoEstado(falhou_))}`,
  );
}

// ═════════════════════════ CHAT ═════════════════════════

{
  const logs = [
    log({ id: "c", created_at: "2026-02-01T10:02:00.000Z" }),
    log({ id: "a", created_at: "2026-02-01T10:00:00.000Z" }),
    log({ id: "b", created_at: "2026-02-01T10:01:00.000Z" }),
  ];
  const ordenados = ordenarCronologicamente(logs);
  ok(
    "C1 (ordem cronológica convencional: mais antigo em cima)",
    ordenados.map((l) => l.id).join("") === "abc",
    ordenados.map((l) => l.id).join(""),
  );
  ok("C1b (a lista de origem não é mutada — outros consumidores mantêm a ordem descendente)", logs[0].id === "c", logs.map((l) => l.id).join(""));
}
{
  // Empate de milissegundo: a ordem tem que ser TOTAL e estável.
  const mesmoInstante = [
    log({ id: "z", created_at: "2026-02-01T10:00:00.000Z" }),
    log({ id: "y", created_at: "2026-02-01T10:00:00.000Z" }),
  ];
  const um = ordenarCronologicamente(mesmoInstante).map((l) => l.id).join("");
  const dois = ordenarCronologicamente([...mesmoInstante].reverse()).map((l) => l.id).join("");
  ok("C2 (empate de created_at desempata por id — ordem estável entre renders)", um === "yz" && dois === "yz", `${um} / ${dois}`);
}
{
  const logs = [log({ id: "srv-1", created_at: "2026-02-01T10:00:00.000Z" })];
  const pendentes: EnvioPendente[] = [
    { id: "loc-1", texto: "oi", autorNome: "Mara", visibilidade: "public", idServidor: "srv-1", erro: null, criadoEm: "" },
    { id: "loc-2", texto: "em voo", autorNome: "Mara", visibilidade: "public", idServidor: null, erro: null, criadoEm: "" },
  ];
  const restantes = pendentesAindaVisiveis(logs, pendentes);
  ok(
    "C3 (eco do Realtime não duplica: o pendente já confirmado some, o em voo fica)",
    restantes.length === 1 && restantes[0].id === "loc-2",
    restantes.map((p) => p.id).join(","),
  );
}
{
  // Duas mensagens de texto IDÊNTICO são duas mensagens — o casamento é
  // por id de linha, nunca por conteúdo.
  const logs = [
    log({ id: "s1", created_at: "2026-02-01T10:00:00.000Z", payload: { text: "ok" } }),
    log({ id: "s2", created_at: "2026-02-01T10:00:01.000Z", payload: { text: "ok" } }),
  ];
  const pendentes: EnvioPendente[] = [
    { id: "l1", texto: "ok", autorNome: "A", visibilidade: "public", idServidor: "s3", erro: null, criadoEm: "" },
  ];
  ok("C4 (mensagens idênticas não colapsam)", pendentesAindaVisiveis(logs, pendentes).length === 1, "pendente preservado");
}
{
  const logs = ordenarCronologicamente([
    log({ id: "1", created_at: "2026-02-01T10:00:00.000Z" }),
    log({ id: "2", created_at: "2026-02-01T10:01:00.000Z" }),
    log({ id: "3", created_at: "2026-02-01T10:02:00.000Z" }),
    log({ id: "4", created_at: "2026-02-01T10:03:00.000Z" }),
  ]);
  ok(
    "C5 (não lidos contam por ID a partir do último visto)",
    contarNaoLidos(logs, "2") === 2 && contarNaoLidos(logs, "4") === 0,
    `apos2=${contarNaoLidos(logs, "2")}, apos4=${contarNaoLidos(logs, "4")}`,
  );
  ok(
    "C6 (primeira abertura não conta o histórico inteiro como não lido)",
    contarNaoLidos(logs, null) === 0,
    `${contarNaoLidos(logs, null)}`,
  );
  ok(
    "C7 (id desconhecido não inventa contagem)",
    contarNaoLidos(logs, "removido") === 0,
    `${contarNaoLidos(logs, "removido")}`,
  );
}
ok(
  "C8 (autoscroll só perto do fim)",
  estaNoFim(960, 1000, 40) && !estaNoFim(200, 1000, 400),
  `noFim=${estaNoFim(960, 1000, 40)}, lendoAcima=${estaNoFim(200, 1000, 400)}`,
);

{
  const disponiveis = [
    { id: "p1", nome: "Mara Venn" },
    { id: "p2", nome: "Siv" },
  ];
  const base = { nomeDaConta: "Rafa", personagensDisponiveis: disponiveis, escolhaManual: null };

  const porToken = resolverIdentidade({
    ...base,
    papel: "player",
    personagemDoTokenSelecionado: { id: "p2", nome: "Encapuzado" },
  });
  ok(
    "C9 (token selecionado define a autoria — e o NOME vem do personagem, não do token)",
    porToken.modo === "personagem" && porToken.characterId === "p2" && porToken.nome === "Siv",
    JSON.stringify(porToken),
  );

  const tokenNaoAutorizado = resolverIdentidade({
    ...base,
    papel: "player",
    personagemDoTokenSelecionado: { id: "alheio", nome: "PN do narrador" },
  });
  ok(
    "C10 (token de personagem não autorizado NÃO vira identidade — cai no fallback)",
    tokenNaoAutorizado.modo === "personagem" && tokenNaoAutorizado.characterId === "p1",
    JSON.stringify(tokenNaoAutorizado),
  );

  const narradorSemNada = resolverIdentidade({
    ...base,
    papel: "narrator",
    personagensDisponiveis: [],
    personagemDoTokenSelecionado: null,
  });
  ok(
    "C11 (narrador sem personagem fala como Narrador)",
    narradorSemNada.modo === "narrador" && narradorSemNada.nome === "Narrador" && narradorSemNada.characterId === null,
    JSON.stringify(narradorSemNada),
  );

  const jogadorSemNada = resolverIdentidade({
    ...base,
    papel: "player",
    personagensDisponiveis: [],
    personagemDoTokenSelecionado: null,
  });
  ok(
    "C12 (jogador sem personagem usa identidade padrão EXPLÍCITA — o nome da conta, nunca 'Mesa')",
    jogadorSemNada.modo === "conta" && jogadorSemNada.nome === "Rafa",
    JSON.stringify(jogadorSemNada),
  );

  const manual = resolverIdentidade({
    ...base,
    papel: "player",
    escolhaManual: "p1",
    personagemDoTokenSelecionado: { id: "p2", nome: "Siv" },
  });
  ok("C13 (escolha manual vence o token selecionado)", manual.modo === "personagem" && manual.characterId === "p1", JSON.stringify(manual));

  const manualRevogada = resolverIdentidade({
    ...base,
    papel: "player",
    escolhaManual: "p9",
    personagemDoTokenSelecionado: null,
  });
  ok(
    "C14 (escolha manual que deixou de ser autorizada é ignorada, nunca enviada)",
    manualRevogada.modo === "personagem" && manualRevogada.characterId === "p1",
    JSON.stringify(manualRevogada),
  );

  const jogadorPedindoNarrador = resolverIdentidade({
    ...base,
    papel: "player",
    escolhaManual: "narrador",
    personagensDisponiveis: [],
    personagemDoTokenSelecionado: null,
  });
  ok(
    "C15 (jogador NÃO consegue falar como Narrador nem pedindo explicitamente)",
    jogadorPedindoNarrador.modo !== "narrador",
    JSON.stringify(jogadorPedindoNarrador),
  );
}
ok(
  "C16 (jogador nunca recebe a visibilidade 'gm' como opção)",
  visibilidadesDoPapel("player").join(",") === "public,private" && visibilidadesDoPapel("narrator").includes("gm"),
  `${visibilidadesDoPapel("player").join(",")} | ${visibilidadesDoPapel("narrator").join(",")}`,
);
{
  const familias = [
    [familiaDaEntrada({ type: "chat", payload: {} }), "mensagem"],
    [familiaDaEntrada({ type: "chat", payload: { estilo: "narracao" } }), "narracao"],
    [familiaDaEntrada({ type: "rolagem_pericia", payload: {} }), "rolagem"],
    [familiaDaEntrada({ type: "attack_resolved", payload: {} }), "combate"],
    [familiaDaEntrada({ type: "spell_cast", payload: {} }), "magia"],
    [familiaDaEntrada({ type: "condition_applied", payload: {} }), "condicao"],
    [familiaDaEntrada({ type: "round_ended", payload: {} }), "turno"],
    [familiaDaEntrada({ type: "tipo_que_ninguem_conhece", payload: {} }), "sistema"],
  ];
  ok("C17 (cada família visual do Chat, e o desconhecido caindo em 'sistema')", familias.every(([a, b]) => a === b), JSON.stringify(familias));
}
{
  const bruto = formatTableLogEntry(log({ id: "x", created_at: "", type: "tipo_novo_do_futuro", payload: { alvo: "Corvo", dano: 3 } }));
  ok(
    "C18 (tipo desconhecido nunca vira JSON cru — apresentação genérica legível)",
    !bruto.includes("{") && bruto.includes("Corvo") && bruto.includes("3"),
    bruto,
  );
}
{
  const com = detalheDaRolagem({ pericia: "Percepção", dados: [7, 3, 6], total: 7, margem: "Sucesso padrão" });
  const sem = detalheDaRolagem({ pericia: "Percepção", total: 7 });
  ok(
    "C19 (detalhe de rolagem só quando o payload tem os dados)",
    com?.dados.length === 3 && com?.maior === 7 && com?.rotulo === "Percepção" && sem === null,
    JSON.stringify({ com, sem }),
  );
}
ok(
  "C20 (iniciais do autor: 1 ou 2 letras, nunca vazio)",
  iniciaisDe("Mara Venn") === "MV" && iniciaisDe("Siv") === "S" && iniciaisDe("   ") === "?",
  `${iniciaisDe("Mara Venn")}/${iniciaisDe("Siv")}/${iniciaisDe("   ")}`,
);
{
  const cartao = formatTableLogEntry(
    log({
      id: "y",
      created_at: "",
      type: "compendio_compartilhado",
      payload: { nome: "Compressão", categoriaRotulo: "Magias", origemRotulo: "Homebrew da mesa", resumo: "cognitivo · nível 2" },
    }),
  );
  ok(
    "C21 (cartão do Compêndio no Chat sai legível, com procedência)",
    cartao.includes("Compressão") && cartao.includes("Magias") && cartao.includes("Homebrew") && cartao.includes("nível 2"),
    cartao,
  );
}

// ═════════════════════════ PARTICIPANTES ═════════════════════════

{
  const online = new Set(["u1"]);
  ok(
    "P1 (presença só é afirmada com o canal sincronizado)",
    estadoPresenca("subscribed", online, "u1") === "online" &&
      estadoPresenca("subscribed", online, "u2") === "offline" &&
      estadoPresenca("connecting", online, "u2") === "conectando" &&
      estadoPresenca("error", online, "u2") === "indisponivel" &&
      estadoPresenca("disabled", online, "u2") === "indisponivel",
    "quatro estados distintos",
  );
  ok(
    "P2 (falha de Presence NÃO transforma todo mundo em offline)",
    estadoPresenca("error", new Set<string>(), "u1") !== "offline" &&
      estadoPresenca("connecting", new Set<string>(), "u1") !== "offline" &&
      !presencaDisponivel("error") &&
      !presencaDisponivel("connecting"),
    "nenhum 'offline' fora de subscribed",
  );
  ok(
    "P3 (contador online é null quando a presença não é confiável)",
    contarOnline([{ userId: "u1" }, { userId: "u2" }], "subscribed", online) === 1 &&
      contarOnline([{ userId: "u1" }], "connecting", online) === null &&
      contarOnline([{ userId: "u1" }], "error", online) === null,
    "ok",
  );
}
{
  const roster = [
    { userId: "u3", displayName: "bea", role: "player" as const },
    { userId: "u2", displayName: "Ana", role: "player" as const },
    { userId: "u1", displayName: "Zed", role: "narrator" as const },
  ];
  const ordem = ordenarParticipantes(roster).map((p) => p.displayName).join(",");
  ok("P4 (narrador primeiro, demais em ordem alfabética insensível a caixa)", ordem === "Zed,Ana,bea", ordem);
}
{
  const linhas = montarLinhasParticipantes({
    roster: [{ userId: "u1", displayName: "Rafa", role: "player" }],
    status: "subscribed",
    onlineUserIds: new Set(["u1"]),
    controlesPorUsuario: new Map([["u1", [{ id: "p1", nome: "Mara Venn" }]]]),
  });
  ok(
    "P5 (personagens controlados vêm da fonte segura, nunca do token selecionado)",
    linhas[0].personagens.length === 1 && linhas[0].personagens[0].nome === "Mara Venn" && linhas[0].presenca === "online",
    JSON.stringify(linhas[0]),
  );
}

// ═════════════════════════ PERSONAGENS ═════════════════════════

function entrada(p: Partial<EntradaDiretorio> & { characterId: string; nome: string }): EntradaDiretorio {
  return { tipo: "jogador", pastaId: null, posicao: 0, arquivado: false, controladores: 0, ...p };
}

{
  const pastas: PastaDiretorio[] = [
    { id: "f1", nome: "Aliados", parentId: null, posicao: 0 },
    { id: "f2", nome: "Inimigos", parentId: null, posicao: 1 },
    { id: "f3", nome: "Doca 7", parentId: "f2", posicao: 0 },
  ];
  const entradas = [
    entrada({ characterId: "c1", nome: "Mara Venn", pastaId: "f1" }),
    entrada({ characterId: "c2", nome: "Corvo", pastaId: "f3", tipo: "pn" }),
    entrada({ characterId: "c3", nome: "Siv" }),
    entrada({ characterId: "c4", nome: "Antigo", arquivado: true }),
  ];
  const arvore = montarArvore({ pastas, entradas, consulta: "", ordenacao: "alfabetica", incluirArquivados: false });
  ok(
    "PJ1 (árvore com subpasta e raiz, arquivado fora do diretório normal)",
    arvore.entradas.length === 1 &&
      arvore.entradas[0].nome === "Siv" &&
      arvore.subpastas.length === 2 &&
      arvore.subpastas[1].subpastas[0].entradas[0].nome === "Corvo" &&
      contarEntradas(arvore) === 3,
    `raiz=${arvore.entradas.length}, pastas=${arvore.subpastas.length}, total=${contarEntradas(arvore)}`,
  );

  const comArquivados = montarArvore({ pastas, entradas, consulta: "", ordenacao: "alfabetica", incluirArquivados: true });
  ok("PJ2 (acesso administrativo mostra os arquivados quando pedido)", contarEntradas(comArquivados) === 4, `${contarEntradas(comArquivados)}`);

  const busca = montarArvore({ pastas, entradas, consulta: "cor", ordenacao: "alfabetica", incluirArquivados: false });
  ok(
    "PJ3 (busca ACHATA a árvore e procura no diretório inteiro, não só na pasta aberta)",
    busca.subpastas.length === 0 && busca.entradas.length === 1 && busca.entradas[0].nome === "Corvo",
    JSON.stringify(busca.entradas.map((e) => e.nome)),
  );

  const orfa = montarArvore({
    pastas: [{ id: "f9", nome: "Órfã", parentId: "sumida", posicao: 0 }],
    entradas: [entrada({ characterId: "c9", nome: "Perdido", pastaId: "tambem-sumida" })],
    consulta: "",
    ordenacao: "alfabetica",
    incluirArquivados: false,
  });
  ok(
    "PJ4 (pasta/entrada órfã sobe pra raiz — ninguém fica invisível por causa de uma pasta apagada)",
    orfa.subpastas.length === 1 && orfa.entradas.length === 1,
    `pastas=${orfa.subpastas.length}, entradas=${orfa.entradas.length}`,
  );

  const manual = montarArvore({
    pastas: [],
    entradas: [
      entrada({ characterId: "a", nome: "Zeta", posicao: 0 }),
      entrada({ characterId: "b", nome: "Alfa", posicao: 1 }),
    ],
    consulta: "",
    ordenacao: "manual",
    incluirArquivados: false,
  });
  ok("PJ5 (ordenação manual respeita `posicao`; a alfabética ignora)", manual.entradas.map((e) => e.nome).join(",") === "Zeta,Alfa", manual.entradas.map((e) => e.nome).join(","));
}
ok(
  "PJ6 (busca por nome ignora acento e caixa)",
  normalizarBusca("Compressão") === "compressao" &&
    entradaCasaBusca(entrada({ characterId: "x", nome: "Ítalo Perez" }), "italo") &&
    !entradaCasaBusca(entrada({ characterId: "x", nome: "Ítalo Perez" }), "zzz"),
  "ok",
);
ok(
  "PJ7 (sigla igual à do GerenciadorToken — personagem e token nascem com a mesma marca)",
  siglaDoNome("Mara Venn") === "MV" && siglaDoNome("Siv") === "SIV" && siglaDoNome("") === "",
  `${siglaDoNome("Mara Venn")}/${siglaDoNome("Siv")}`,
);
{
  const carga = { characterId: "c1", nome: "Mara Venn", sigla: "MV", tipo: "jogador" as const };
  const voltou = desserializarPersonagemArrastado(serializarPersonagemArrastado(carga));
  ok("PJ8 (arrasto de personagem faz round-trip)", JSON.stringify(voltou) === JSON.stringify(carga), JSON.stringify(voltou));
  ok(
    "PJ9 (arrasto malformado/de outro tipo é ignorado, nunca cria token)",
    desserializarPersonagemArrastado("não é json") === null &&
      desserializarPersonagemArrastado('{"v":2,"characterId":"x","nome":"y"}') === null &&
      desserializarPersonagemArrastado('{"v":1,"nome":"sem id"}') === null,
    "três recusas",
  );
}

// ═════════════════════════ BANDO ═════════════════════════

function item(p: Partial<ItemBandoPainel> & { id: string; nome: string }): ItemBandoPainel {
  return { slug: null, categoria: null, subtipo: null, quantidade: 1, payload: {} as ItemBandoPainel["payload"], ...p };
}

{
  const itens = [
    item({ id: "i1", nome: "Pistola Rasgo", categoria: "arma", quantidade: 1 }),
    item({ id: "i2", nome: "Balas 9mm", categoria: "municao", quantidade: 24 }),
    item({ id: "i3", nome: "Colete", categoria: "armadura" }),
    item({ id: "i4", nome: "Bugiganga", categoria: null }),
  ];
  const grupos = agruparPorCategoria(itens, "");
  ok(
    "B1 (agrupa por categoria real; 'Sem categoria' sempre por último)",
    grupos.length === 4 && grupos[grupos.length - 1].rotulo === "Sem categoria",
    grupos.map((g) => g.rotulo).join(" | "),
  );
  ok("B2 (rótulo de categoria desconhecida não é inventado, só capitalizado)", rotuloDaCategoriaItem("quimera") === "Quimera" && rotuloDaCategoriaItem(null) === "Sem categoria", "ok");
  ok(
    "B3 (busca por nome e por slug, sem acento)",
    itemCasaBusca(item({ id: "x", nome: "Munição Pesada" }), "municao") && !itemCasaBusca(item({ id: "x", nome: "Colete" }), "pistola"),
    "ok",
  );
  ok("B4 (contador soma UNIDADES, não linhas)", totalDeUnidades(itens) === 27, `${totalDeUnidades(itens)}`);
  ok("B5 (busca filtra os grupos)", agruparPorCategoria(itens, "colete").length === 1, JSON.stringify(agruparPorCategoria(itens, "colete").map((g) => g.rotulo)));
}
{
  const completo = item({
    id: "i9",
    nome: "Fuzil Runado",
    categoria: "arma",
    payload: {
      subtipo: "longa",
      estado: "equipado",
      cargasAtual: 2,
      municaoCarregada: { itemNome: "Balas 9mm", quantidade: 12 },
      runasInstaladas: [{ runaNome: "Sobregravação" }],
      propriedadesTecnicas: [{ id: "p1" }, { id: "p2" }],
      precoPago: 480,
    } as unknown as ItemBandoPainel["payload"],
  });
  const linhas = detalhesDaInstancia(completo);
  const rotulos = linhas.map((l) => l.rotulo).join(",");
  ok(
    "B6 (o detalhe expõe o estado técnico da INSTÂNCIA: cargas, munição carregada, runas, propriedades)",
    rotulos.includes("Cargas") && rotulos.includes("Carregada") && rotulos.includes("Runas") && rotulos.includes("Propriedades"),
    rotulos,
  );
  ok(
    "B7 (item sem estado técnico não ganha linha inventada — nada de '0/0')",
    detalhesDaInstancia(item({ id: "i0", nome: "Corda" })).length === 0,
    `${detalhesDaInstancia(item({ id: "i0", nome: "Corda" })).length}`,
  );
}
{
  const carga = { id: "row-1", nome: "Balas 9mm", quantidade: 24 };
  const voltou = desserializarItemBando(serializarItemBando(carga));
  ok(
    "B8 (arrasto de item do bando faz round-trip; formato inválido é ignorado)",
    JSON.stringify(voltou) === JSON.stringify(carga) && desserializarItemBando("{}") === null && desserializarItemBando("xx") === null,
    JSON.stringify(voltou),
  );
}

// ═════════════════════════ COMPÊNDIO ═════════════════════════

ok(
  "K1 (as seis categorias pedidas)",
  CATEGORIAS_COMPENDIO.join(",") === "magias,talentos,itens,runas,condicoes,companheiros" && ehCategoriaCompendio("runas") && !ehCategoriaCompendio("armas"),
  CATEGORIAS_COMPENDIO.join(","),
);
{
  const termos = termosDeBusca({
    slug: "compressao",
    nome: "Compressão",
    payload: { vertente: "cognitivo", descricao: "um texto longo de regra que não deve entrar na busca", estatisticas: { tipo_magia: "ataque" } },
  });
  ok(
    "K2 (busca cobre slug, nome e campos relevantes — nunca o texto de regra inteiro)",
    termos.includes("compressao") && termos.includes("compressão") && termos.includes("cognitivo") && termos.includes("ataque") &&
      !termos.some((t) => t.includes("texto longo de regra")),
    JSON.stringify(termos),
  );
}
{
  const resumo = resumoDoPayload({ categoria: "arma", subtipo: "longa", nivel: 2 });
  const soDescricao = resumoDoPayload({ descricao_curta: "Comprime o espaço à volta do alvo." });
  ok(
    "K3 (resumo curto sai de campos escalares, com fallback pra descrição curta — nunca JSON)",
    resumo === "arma · longa · nível 2" && soDescricao.startsWith("Comprime") && !resumo.includes("{"),
    `${resumo} | ${soDescricao}`,
  );
}
ok(
  "K4 (procedência tem rótulo próprio pra oficial/modificado/homebrew)",
  rotuloDaOrigem("oficial") === "Oficial" && rotuloDaOrigem("modificado").includes("Modificado") && rotuloDaOrigem("homebrew").includes("Homebrew"),
  "ok",
);
{
  const linhas: LinhaCompendio[] = [
    { categoria: "magias", slug: "compressao", nome: "Compressão", origem: "oficial", subtitulo: null },
    { categoria: "magias", slug: "elo-fantasma", nome: "Elo Fantasma", origem: "homebrew", subtitulo: null },
  ];
  ok(
    "K5 (refino local usa a mesma regra da busca do servidor)",
    filtrarLinhas(linhas, "elo").length === 1 && filtrarLinhas(linhas, "").length === 2 && filtrarLinhas(linhas, "compress")[0].slug === "compressao",
    "ok",
  );
}
ok(
  "K6 (cache de sessão trata consulta vazia e espaços como a mesma chave)",
  chaveCache("magias", "  ") === chaveCache("magias", "") && chaveCache("magias", "Fogo") === chaveCache("magias", "fogo") && chaveCache("itens", "") !== chaveCache("magias", ""),
  "ok",
);

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
