/**
 * Testes PUROS do controlador de ferramenta e undo/redo.
 *
 * Uso: npx tsx scripts/test-vtt-controlador.ts
 */

import { readFileSync } from "node:fs";
import {
  ATALHO_FERRAMENTA,
  type Comando,
  type EstadoHistorico,
  HISTORICO_VAZIO,
  elementoEhEditavel,
  ferramentasParaPapel,
  interpretarAtalho,
  prepararRedo,
  prepararUndo,
  registrarComando,
} from "../src/app/mesas/[campaignId]/vtt/_ferramentas/controlador";

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

// ── Ferramentas por papel ─────────────────────────────────────────
ok("1 (jogador não vê Terreno)", !ferramentasParaPapel(false).includes("terreno"), JSON.stringify(ferramentasParaPapel(false)));
ok("2 (narrador vê Terreno)", ferramentasParaPapel(true).includes("terreno"), JSON.stringify(ferramentasParaPapel(true)));
// Autorização de Áreas revista (migration 0083): qualquer participante
// vê a ferramenta — não existe mais autorização explícita por jogador.
ok("2b (jogador vê Áreas — criação é aberta a qualquer participante)", ferramentasParaPapel(false).includes("areas"), JSON.stringify(ferramentasParaPapel(false)));
ok("2c (narrador vê Áreas)", ferramentasParaPapel(true).includes("areas"), JSON.stringify(ferramentasParaPapel(true)));
ok("2d (jogador não vê Objetos)", !ferramentasParaPapel(false).includes("objetos"), JSON.stringify(ferramentasParaPapel(false)));
ok("2e (narrador vê Objetos)", ferramentasParaPapel(true).includes("objetos"), JSON.stringify(ferramentasParaPapel(true)));
ok("2f (todos veem Rolar Dados)", ferramentasParaPapel(false).includes("dados") && ferramentasParaPapel(true).includes("dados"), JSON.stringify(ferramentasParaPapel(false)));

// ── Atalhos ──────────────────────────────────────────────────────
const disponiveisJogador = ferramentasParaPapel(false);
const disponiveisNarrador = ferramentasParaPapel(true);
const base = { ctrlKey: false, metaKey: false, shiftKey: false, alvoEhEditavel: false };

ok("3 (V ativa Interagir)", interpretarAtalho({ ...base, key: "v" }, disponiveisJogador)?.tipo === "ferramenta", "ok");
ok("4 (M ativa Medir)", (interpretarAtalho({ ...base, key: "m" }, disponiveisJogador) as { id: string })?.id === "medir", "ok");
ok("4b (L ativa Rolar Dados)", (interpretarAtalho({ ...base, key: "l" }, disponiveisJogador) as { id: string })?.id === "dados", "ok");
ok(
  "5 (T não ativa nada pro jogador — ferramenta indisponível)",
  interpretarAtalho({ ...base, key: "t" }, disponiveisJogador) === null,
  JSON.stringify(interpretarAtalho({ ...base, key: "t" }, disponiveisJogador)),
);
ok(
  "6 (T ativa Terreno pro narrador)",
  (interpretarAtalho({ ...base, key: "t" }, disponiveisNarrador) as { id: string })?.id === "terreno",
  "ok",
);
ok("7 (Esc cancela)", interpretarAtalho({ ...base, key: "Escape" }, disponiveisJogador)?.tipo === "cancelar", "ok");
ok("8 (Delete apaga)", interpretarAtalho({ ...base, key: "Delete" }, disponiveisJogador)?.tipo === "apagar", "ok");
ok(
  "9 (Ctrl+Z desfaz, Ctrl+Shift+Z refaz — distintos)",
  interpretarAtalho({ ...base, key: "z", ctrlKey: true }, disponiveisJogador)?.tipo === "undo" &&
    interpretarAtalho({ ...base, key: "z", ctrlKey: true, shiftKey: true }, disponiveisJogador)?.tipo === "redo",
  "ok",
);
ok(
  "10 (atalho de ferramenta NÃO dispara com foco em campo editável)",
  interpretarAtalho({ ...base, key: "v", alvoEhEditavel: true }, disponiveisJogador) === null,
  "null",
);
ok(
  "10b (Esc/undo também respeitam o campo editável — nenhum atalho global escapa)",
  interpretarAtalho({ ...base, key: "Escape", alvoEhEditavel: true }, disponiveisJogador) === null &&
    interpretarAtalho({ ...base, key: "z", ctrlKey: true, alvoEhEditavel: true }, disponiveisJogador) === null,
  "null nos dois",
);
ok("11 (elementoEhEditavel reconhece INPUT/TEXTAREA/SELECT/contentEditable)",
  elementoEhEditavel({ tagName: "INPUT" }) && elementoEhEditavel({ tagName: "TEXTAREA" }) &&
  elementoEhEditavel({ tagName: "SELECT" }) && elementoEhEditavel({ isContentEditable: true }) &&
  !elementoEhEditavel({ tagName: "DIV" }) && !elementoEhEditavel(null),
  "todos corretos");
ok("11b (elementoEhEditavel também barra atalho com o botão de força carregando)",
  elementoEhEditavel({ tagName: "BUTTON", dataset: { carregandoForca: "true" } }) &&
  !elementoEhEditavel({ tagName: "BUTTON", dataset: { carregandoForca: "false" } }) &&
  !elementoEhEditavel({ tagName: "BUTTON" }),
  "true só com o dataset explicitamente \"true\"");

// ── Undo/redo — pilha de comandos, não snapshot ───────────────────
function comandoFake(rotulo: string, autorId: string, log: string[]): Comando {
  return {
    rotulo, autorId,
    executar: async () => { log.push(`exec:${rotulo}`); },
    desfazer: async () => { log.push(`undo:${rotulo}`); },
  };
}

{
  const log: string[] = [];
  let h: EstadoHistorico = HISTORICO_VAZIO;
  h = registrarComando(h, comandoFake("mover-A", "user1", log));
  h = registrarComando(h, comandoFake("mover-B", "user1", log));
  const r = prepararUndo(h, "user1", false);
  ok("12 (undo pega o comando mais recente)", r.comando?.rotulo === "mover-B", `${r.comando?.rotulo}`);
  ok("12b (comando some da pilha de desfazer, entra na de refazer)", r.historico.desfazer.length === 1 && r.historico.refazer.length === 1, `desfazer=${r.historico.desfazer.length}, refazer=${r.historico.refazer.length}`);
}

{
  // Comando NOVO depois de um undo limpa a pilha de redo — regra clássica.
  const log: string[] = [];
  let h: EstadoHistorico = HISTORICO_VAZIO;
  h = registrarComando(h, comandoFake("A", "user1", log));
  const u = prepararUndo(h, "user1", false);
  h = u.historico;
  ok("13 (após undo, redo tem 1 comando)", h.refazer.length === 1, `${h.refazer.length}`);
  h = registrarComando(h, comandoFake("B", "user1", log));
  ok("13b (comando novo após undo limpa o redo)", h.refazer.length === 0, `${h.refazer.length}`);
}

{
  // Jogador só desfaz as PRÓPRIAS ações — mesmo não sendo o topo absoluto.
  const log: string[] = [];
  let h: EstadoHistorico = HISTORICO_VAZIO;
  h = registrarComando(h, comandoFake("mover-jogador", "jogador1", log));
  h = registrarComando(h, comandoFake("pintar-narrador", "narrador1", log));
  const r = prepararUndo(h, "jogador1", false);
  ok(
    "14 (jogador desfaz a própria ação, não o topo alheio)",
    r.comando?.rotulo === "mover-jogador",
    `comando=${r.comando?.rotulo} (topo real era pintar-narrador)`,
  );
  ok("14b (a ação do narrador permanece intacta na pilha)", r.historico.desfazer.some((c) => c.rotulo === "pintar-narrador"), "sim");
}

{
  // Jogador SEM ação própria na pilha não desfaz nada.
  const log: string[] = [];
  let h: EstadoHistorico = HISTORICO_VAZIO;
  h = registrarComando(h, comandoFake("pintar-narrador", "narrador1", log));
  const r = prepararUndo(h, "jogador1", false);
  ok("15 (jogador sem ação própria: undo é no-op)", r.comando === null && r.historico.desfazer.length === 1, `comando=${r.comando}, pilha=${r.historico.desfazer.length}`);
}

{
  // Narrador desfaz QUALQUER topo, inclusive de jogador — controle estrutural.
  const log: string[] = [];
  let h: EstadoHistorico = HISTORICO_VAZIO;
  h = registrarComando(h, comandoFake("mover-jogador", "jogador1", log));
  const r = prepararUndo(h, "narrador1", true);
  ok("16 (narrador desfaz ação de jogador)", r.comando?.rotulo === "mover-jogador", `${r.comando?.rotulo}`);
}

{
  // redo simétrico ao undo, com a mesma regra de autoria.
  const log: string[] = [];
  let h: EstadoHistorico = HISTORICO_VAZIO;
  h = registrarComando(h, comandoFake("A", "jogador1", log));
  const u = prepararUndo(h, "jogador1", false);
  const r = prepararRedo(u.historico, "jogador1", false);
  ok("17 (redo devolve o comando desfeito à pilha de desfazer)", r.comando?.rotulo === "A" && r.historico.desfazer.length === 1 && r.historico.refazer.length === 0, "ok");
}

{
  // UMA JANELA POR VEZ, e a ORDEM que isso impõe. `trocarFerramenta`
  // termina fechando o catálogo de cenas (`setPainelCenasAberto(false)`);
  // quem ABRE o catálogo precisa, portanto, falar DEPOIS dele — senão
  // o "abrir" é sobrescrito pelo "fechar" e o clique não faz nada.
  //
  // Já quebrou uma vez, ao extrair o handler que o botão da barra e o
  // chip "Cena ativa" compartilham: o `trocarFerramenta` foi parar
  // DENTRO do updater de `setPainelCenasAberto`, e o catálogo deixou de
  // abrir pelos dois caminhos. Por isso a ordem virou asserção.
  const fonte = readFileSync("src/app/mesas/[campaignId]/vtt/VttClient.tsx", "utf8");
  const corpo = fonte.slice(fonte.indexOf("const alternarCatalogoCenas"), fonte.indexOf("const [salvandoCena"));
  const posTroca = corpo.indexOf('trocarFerramenta("interagir")');
  const posAbrir = corpo.indexOf("setPainelCenasAberto(abrir)");
  ok("18 (abrir o catálogo vem DEPOIS de trocar de ferramenta, que o fecha)",
    posTroca > -1 && posAbrir > posTroca, `troca=${posTroca}, abrir=${posAbrir}`);
  ok("19 (nenhum efeito colateral dentro do updater de setPainelCenasAberto)",
    !/setPainelCenasAberto\(\s*\(/.test(corpo), "updater com efeito dentro é o que quebrou antes");
}

// ── N e C: os dois vizinhos que não são ferramenta ────────────────
{
  const disp = ferramentasParaPapel(true);
  const ev = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; alvoEhEditavel: boolean }> = {}) =>
    interpretarAtalho({ key, ctrlKey: false, metaKey: false, shiftKey: false, alvoEhEditavel: false, ...extra }, disp);

  ok("20 (N adiciona token)", ev("n")?.tipo === "adicionar-token", String(ev("n")?.tipo));
  ok("21 (C abre camadas)", ev("c")?.tipo === "camadas", String(ev("c")?.tipo));
  // Os dois têm que morrer nas mesmas guardas de sempre: nada dispara
  // com foco em campo de texto, nem com modificador (Cmd+N abre janela
  // do navegador, Ctrl+C copia).
  ok("22 (N não dispara com foco em campo)", ev("n", { alvoEhEditavel: true }) === null, "null com foco editável");
  ok("23 (Ctrl+C não vira camadas)", ev("c", { ctrlKey: true })?.tipo !== "camadas", String(ev("c", { ctrlKey: true })?.tipo));
  ok("24 (Cmd+N não vira adicionar token)", ev("n", { metaKey: true })?.tipo !== "adicionar-token", String(ev("n", { metaKey: true })?.tipo));
  // E não podem ter roubado a tecla de nenhuma ferramenta.
  ok("25 (as teclas de ferramenta seguem intactas)",
    disp.every((f) => ev(ATALHO_FERRAMENTA[f].toLowerCase())?.tipo === "ferramenta"),
    disp.map((f) => `${ATALHO_FERRAMENTA[f]}=${ev(ATALHO_FERRAMENTA[f].toLowerCase())?.tipo}`).join(" "));
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
