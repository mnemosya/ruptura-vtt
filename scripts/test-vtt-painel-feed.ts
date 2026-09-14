/**
 * Testes PUROS do FEED do painel — allowlist, projeção, correlação de
 * workflow, agrupamento de mensagens, rótulo de visibilidade e eventos
 * semânticos de combate.
 *
 * É o par determinístico de `scripts/dev/check-vtt-painel.ts`: aqui se
 * prova a REGRA (o que entra no feed, com que forma), lá se prova que a
 * regra chegou à tela.
 *
 * Uso: npx tsx scripts/test-vtt-painel-feed.ts
 */

import { escreverComando, lerComandoRolagem } from "../src/app/mesas/[campaignId]/vtt/_painel/feed/comandoRolagem";
import {
  EXCLUIDOS_DO_FEED,
  PROJETORES,
  acentoDoCartao,
  ehContinuacao,
  projetarEntrada,
  projetarFeed,
  rotuloVisibilidade,
  tipoNoFeed,
  type CartaoAtaque,
  type CartaoFeed,
  type CartaoMensagem,
  type CartaoResolucao,
  type CartaoRolagem,
} from "../src/app/mesas/[campaignId]/vtt/_painel/feed/contratos";
import {
  diffTrilha,
  paraComparavel,
  payloadDoEvento,
  rotuloDaJanela,
} from "../src/app/mesas/[campaignId]/vtt/_painel/feed/eventosCombate";
import type { TableLogEntry } from "../src/lib/table";

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

let seq = 0;
function log(tipo: string, payload: Record<string, unknown>, extra: Partial<TableLogEntry> = {}): TableLogEntry {
  seq += 1;
  return {
    id: extra.id ?? `log-${seq}`,
    campaign_id: "camp",
    character_id: extra.character_id ?? null,
    type: tipo,
    visibility: extra.visibility ?? "public",
    payload,
    created_at: extra.created_at ?? new Date(Date.UTC(2026, 1, 1, 10, 0, seq)).toISOString(),
    created_by_user_id: extra.created_by_user_id ?? "u1",
  };
}

// ═════════════════ ALLOWLIST ═════════════════

{
  const tiposTecnicos = Object.keys(EXCLUIDOS_DO_FEED);
  const vazados = tiposTecnicos.filter((t) => tipoNoFeed(t));
  ok(
    "A1 (nenhum tipo tecnicamente excluído tem projetor — o log não vaza para a conversa)",
    vazados.length === 0,
    vazados.length === 0 ? `${tiposTecnicos.length} tipos excluídos, nenhum projetado` : `VAZOU: ${vazados.join(", ")}`,
  );
}
{
  const criticos = [
    "character_state_change",
    "character_evolution",
    "inventory_transfer",
    "ammunition",
    "action_used",
    "defense_reaction_used",
  ];
  const projetados = criticos.filter((t) => projetarEntrada(log(t, { characterNome: "X" })) !== null);
  ok("A2 (os eventos técnicos citados na spec não aparecem)", projetados.length === 0, projetados.join(", ") || "nenhum aparece");
}
ok(
  "A3 (tipo DESCONHECIDO não vira card genérico — simplesmente não aparece)",
  projetarEntrada(log("tipo_inventado_amanha", { alvo: "Corvo", dano: 3 })) === null,
  "null",
);
{
  const esperados = ["chat", "rolagem_pericia", "attack_resolved", "spell_cast", "condition_applied", "round_ended", "compendio_compartilhado"];
  const faltando = esperados.filter((t) => !tipoNoFeed(t));
  ok("A4 (os tipos de conversa e de mecânica ESTÃO na allowlist)", faltando.length === 0, faltando.join(", ") || `${Object.keys(PROJETORES).length} projetores`);
}

// ═════════════════ MENSAGENS ═════════════════

{
  const c = projetarEntrada(log("chat", { text: "oi", autorNome: "Siv", autorTipo: "personagem" })) as CartaoMensagem;
  ok("M1 (mensagem projeta autoria e texto)", c.kind === "mensagem" && c.texto === "oi" && c.autoria.nome === "Siv", JSON.stringify({ k: c.kind, t: c.texto }));
  const n = projetarEntrada(log("chat", { text: "a névoa desce", autorNome: "Narrador", estilo: "narracao" })) as CartaoMensagem;
  ok("M2 (narração é um ESTILO da mensagem, não um tipo à parte)", n.estilo === "narracao" && acentoDoCartao(n) === "am", `${n.estilo}/${acentoDoCartao(n)}`);
}
{
  const base = { text: "a", autorNome: "Siv", autorTipo: "personagem" };
  const t0 = new Date(Date.UTC(2026, 1, 1, 10, 0, 0)).toISOString();
  const t1 = new Date(Date.UTC(2026, 1, 1, 10, 0, 30)).toISOString();
  const t9 = new Date(Date.UTC(2026, 1, 1, 10, 30, 0)).toISOString();
  const a = projetarEntrada(log("chat", base, { id: "a", created_at: t0, character_id: "p1" })) as CartaoMensagem;
  const b = projetarEntrada(log("chat", base, { id: "b", created_at: t1, character_id: "p1" })) as CartaoMensagem;
  const longe = projetarEntrada(log("chat", base, { id: "c", created_at: t9, character_id: "p1" })) as CartaoMensagem;
  const outroAutor = projetarEntrada(log("chat", { ...base, autorNome: "Mara" }, { id: "d", created_at: t1, character_id: "p2" })) as CartaoMensagem;
  const privada = projetarEntrada(log("chat", base, { id: "e", created_at: t1, character_id: "p1", visibility: "gm" })) as CartaoMensagem;
  ok("M3 (mensagens seguidas do mesmo autor compartilham cabeçalho)", ehContinuacao(b, a), "true");
  ok("M4 (intervalo longo quebra a continuação)", !ehContinuacao(longe, b), "false");
  ok("M5 (autor diferente NUNCA colapsa)", !ehContinuacao(outroAutor, a), "false");
  ok("M6 (visibilidade diferente NUNCA colapsa — privacidade não pode ficar ambígua)", !ehContinuacao(privada, a), "false");
}
{
  // A CORREÇÃO do rótulo errado: `private` é autor + narrador.
  ok(
    "M7 (`private` é 'Somente Narrador' para o jogador — nunca 'Só eu')",
    rotuloVisibilidade("private", "player") === "Somente Narrador" &&
      rotuloVisibilidade("private", "narrator") === "Reservada" &&
      rotuloVisibilidade("gm", "player") === "Narrador" &&
      rotuloVisibilidade("public", "player") === null,
    `${rotuloVisibilidade("private", "player")} / ${rotuloVisibilidade("private", "narrator")}`,
  );
}

// ═════════════════ ROLAGEM ═════════════════

{
  const c = projetarEntrada(
    log("rolagem_pericia", {
      characterNome: "Mara Venn",
      atributo: "Mente",
      atributoValor: 6,
      pericia: "Percepção",
      periciaValor: 3,
      modificador: 0,
      dificuldade: 10,
      total: 8,
      sucesso: false,
      dados: [7, 3, 6],
    }),
  ) as CartaoRolagem;
  const rotulos = c.modulos.map((m) => m.rotulo).join(",");
  ok(
    "R1 (rolagem vira MÓDULOS: atributo, perícia, modificador e dificuldade)",
    c.kind === "rolagem" && rotulos === "Mente,Percepção,MOD,ND" && c.total === 8,
    rotulos,
  );
  ok("R2 (falha usa acento vermelho)", acentoDoCartao(c) === "perigo", acentoDoCartao(c));
  // O sucesso da rolagem LIVRE é ciano, não verde: verde é o topo
  // (crítico), e uma soma contra CD não tem crítico — a mesma regra que
  // `FaixaSoma` aplica na faixa do mesmo card.
  {
    const ganhou = { ...c, sucesso: true } as typeof c;
    ok("R2b (sucesso da rolagem livre é ciano — verde fica pro crítico)", acentoDoCartao(ganhou) === "cy", acentoDoCartao(ganhou));
  }
  ok("R3 (dados individuais ficam disponíveis para o bloco recolhível)", c.dados.length === 3 && c.maior === 7, JSON.stringify(c.dados));
  ok("R4 (o tipo do teste sai do que o payload de fato tem)", c.tipoTeste === "TESTE DE PERÍCIA", c.tipoTeste);

  // Bandeja de dados livre em modo SOMAR: nenhum dado "venceu" os
  // outros — todos entram na soma —, então nenhum pode sair destacado
  // no card. `rolagem_pericia`/expressão sem `modo` continuam
  // destacando o maior (R3 acima já cobre isso).
  const somando = projetarEntrada(
    log("rolagem_expressao", { expressao: "3d8", dados: [7, 3, 6], modificador: 0, modo: "sum", total: 16 }),
  ) as CartaoRolagem;
  ok("R3b (modo somar não destaca nenhum dado — maior sai nulo)", somando.maior === null, `maior=${somando.maior}`);
  const maiorDado = projetarEntrada(
    log("rolagem_expressao", { expressao: "3d8", dados: [7, 3, 6], modificador: 0, modo: "high", total: 7 }),
  ) as CartaoRolagem;
  ok("R3c (modo maior continua destacando o dado que decidiu)", maiorDado.maior === 7, `maior=${maiorDado.maior}`);

  const semPericia = projetarEntrada(log("rolagem_pericia", { atributo: "Corpo", atributoValor: 5, total: 5 })) as CartaoRolagem;
  ok("R5 (sem perícia vira TESTE DE ATRIBUTO)", semPericia.tipoTeste === "TESTE DE ATRIBUTO", semPericia.tipoTeste);
  const aberta = projetarEntrada(log("rolagem_expressao", { expressao: "2d8", total: 9 })) as CartaoRolagem;
  ok("R6 (rolagem sem veredito não inventa sucesso/falha)", aberta.sucesso === null && acentoDoCartao(aberta) === "cy", `${aberta.sucesso}`);
}

// ═════════════════ ATAQUE E WORKFLOW ═════════════════

{
  const c = projetarEntrada(
    log("attack_resolved", {
      workflowId: "wf-1",
      armaNome: "Shortbow",
      atacanteNome: "Mara Venn",
      paGasto: 2,
      municaoGasta: 1,
      totalAtaque: 14,
      totalDefesa: 6,
      alvoNome: "Gravenight",
      alvoCharacterId: "p9",
      acertou: true,
      margem: 6,
      dano: 17,
      danoTipo: "perfurante",
    }),
  ) as CartaoAtaque;
  const custos = c.custos.map((m) => `${m.rotulo} ${m.valor}`).join(", ");
  ok(
    "T1 (PA e munição aparecem DENTRO do card do ataque — é por isso que não têm card próprio)",
    custos.includes("PA 2") && custos.includes("Munição 1"),
    custos,
  );
  ok(
    "T2 (ataque × defesa, dano e alvo, com estado de workflow)",
    c.totalAtaque === 14 && c.totalDefesa === 6 && c.dano === 17 && c.alvo === "Gravenight" && c.estado === "aguardando_aplicacao",
    c.estado,
  );
}
{
  // O card EVOLUI: a aplicação de dano compartilha o workflow e
  // SUBSTITUI a entrada anterior, em vez de empilhar uma linha nova.
  const ataque = log("attack_resolved", { workflowId: "wf-9", armaNome: "Shortbow", dano: 17, alvoCharacterId: "p9", acertou: true }, { id: "atq" });
  const aplicado = log(
    "attack_damage_applied",
    { workflowId: "wf-9", armaNome: "Shortbow", dano: 17, alvoCharacterId: "p9", acertou: true, pvAntes: 20, pvDepois: 3 },
    { id: "apl" },
  );
  const feed = projetarFeed([ataque, aplicado]);
  const ataques = feed.filter((c) => c.kind === "ataque") as CartaoAtaque[];
  ok(
    "T3 (aplicar dano EVOLUI o mesmo card — uma entrada só, no estado resolvido)",
    feed.length === 1 && ataques.length === 1 && ataques[0].estado === "resolvido" && ataques[0].pvDepois === 3,
    `cards=${feed.length}, estado=${ataques[0]?.estado}`,
  );
  ok("T4 (o card resolvido carrega PV anterior → PV atual)", ataques[0].pvAntes === 20 && ataques[0].pvDepois === 3, `${ataques[0].pvAntes} → ${ataques[0].pvDepois}`);
}
{
  const errou = projetarEntrada(log("attack_resolved", { workflowId: "w", acertou: false, totalAtaque: 4, totalDefesa: 9 })) as CartaoAtaque;
  ok("T5 (ataque que errou não fica em 'aguardando dano')", errou.estado === "errou", errou.estado);
}

// ═════════════════ MAGIA ═════════════════

{
  const c = projetarEntrada(
    log("spell_cast", { spellNome: "Compressão", characterNome: "Siv", vertente: "Cognitivo", nivel: 2, paGasto: 3, manaGasta: 2, exigeAtaque: true }),
  );
  const m = c as Extract<CartaoFeed, { kind: "magia" }>;
  ok(
    "G1 (conjurar NÃO rola ataque nem dano — o card nasce aguardando ataque)",
    m.kind === "magia" && m.estado === "aguardando_ataque" && m.exigeAtaque,
    m.estado,
  );
  const custos = m.custos.map((x) => `${x.rotulo} ${x.valor}`).join(", ");
  ok("G2 (PA e Mana consumidos aparecem como módulos)", custos.includes("PA 3") && custos.includes("Mana 2"), custos);
  ok("G3 (magia usa acento violeta)", acentoDoCartao(m) === "mana", acentoDoCartao(m));

  const manual = projetarEntrada(log("spell_cast", { spellNome: "X", resolucaoManual: "Sem fórmula de dano publicada." })) as Extract<CartaoFeed, { kind: "magia" }>;
  ok(
    "G4 (sem estrutura suficiente, o card assume RESOLUÇÃO MANUAL em vez de inventar regra)",
    manual.estado === "manual" && manual.motivoManual !== null,
    manual.motivoManual ?? "",
  );
}

// ═════════════════ EFEITOS E RESOLUÇÃO ═════════════════

{
  const aplicado = projetarEntrada(log("condition_applied", { condicaoNome: "Sangrando", characterNome: "Corvo", duracao: "2 rodadas" }));
  const removido = projetarEntrada(log("condition_removed", { condicaoNome: "Sangrando", characterNome: "Corvo" }));
  const dano = projetarEntrada(log("condition_end_round_damage", { condicaoNome: "Sangrando", characterNome: "Corvo", dano: 3 }));
  const e1 = aplicado as Extract<CartaoFeed, { kind: "efeito" }>;
  const e2 = removido as Extract<CartaoFeed, { kind: "efeito" }>;
  const e3 = dano as Extract<CartaoFeed, { kind: "efeito" }>;
  ok(
    "E1 (aplicado/removido/dano são AÇÕES do mesmo card de efeito)",
    e1.acao === "aplicado" && e2.acao === "removido" && e3.acao === "dano",
    `${e1.acao}/${e2.acao}/${e3.acao}`,
  );
  ok("E2 (dano de efeito sai em vermelho e com delta)", acentoDoCartao(e3) === "perigo" && e3.delta?.valor === "−3", JSON.stringify(e3.delta));
  ok("E3 (efeito encerrado é neutro, nunca vermelho de alarme)", acentoDoCartao(e2) === "neutro", acentoDoCartao(e2));
}
{
  const c = projetarEntrada(
    log("round_end_processed", {
      newRound: 3,
      linhas: [
        { ator: "Corvo", efeito: "Sangrando", resultado: "−3 PV", restante: "1" },
        { ator: "Siv", efeito: "Compressão", restante: "Expired", encerrado: true },
      ],
    }),
  ) as CartaoResolucao;
  ok(
    "E4 (fim de rodada vira UM card-resumo com tabela, não dez linhas soltas)",
    c.kind === "resolucao" && c.linhas.length === 2 && c.linhas[1].encerrado,
    `${c.titulo} · ${c.linhas.length} linha(s)`,
  );
}

// ═════════════════ LEITURA DE TESTE ═════════════════

// O Chat mostra a MESMA leitura que a ferramenta de rolar dados e o
// Console — mas só quando a rolagem É um teste. Na bandeja livre não
// existe maior dado nem classificação, e a faixa de teste diria
// "maior 7 · sem perícia" sobre uma soma.
{
  const teste = projetarEntrada(log("rolagem_pericia", {
    characterNome: "Mara Venn", atributo: "Corpo", atributoValor: 2, pericia: null, periciaValor: 0,
    modificador: 3, cd: 8, total: 10, dados: [6, 7], maiorDado: 7, classificacaoMargem: "sucesso_padrao",
  })) as CartaoRolagem;
  ok(
    "L1 (teste carrega a leitura da ferramenta: maior dado, perícia, mod, CD e classificação)",
    teste.teste != null && teste.teste.maiorDado === 7 && teste.teste.cd === 8 && teste.teste.classificacao === "sucesso_padrao",
    JSON.stringify(teste.teste),
  );
  const livre = projetarEntrada(log("rolagem_expressao", { expressao: "3d8", dados: [7, 3, 6], modo: "sum", total: 16 })) as CartaoRolagem;
  ok("L2 (bandeja livre NÃO ganha leitura de teste — lá os dados são somados)", livre.teste === null, String(livre.teste));
  const antigo = projetarEntrada(log("rolagem_pericia", { atributo: "Corpo", atributoValor: 5, total: 5 })) as CartaoRolagem;
  ok("L3 (log antigo sem maiorDado cai no desenho de módulos em vez de inventar o dado que valeu)", antigo.teste === null, String(antigo.teste));

  // A ESPINHA do card segue a mesma régua da faixa — as duas pontas na
  // mesma cor, não em duas parecidas.
  const faixa = (c: string, sucesso: boolean) => projetarEntrada(log("rolagem_pericia", {
    atributo: "Corpo", atributoValor: 2, modificador: 0, cd: 8, total: 9, dados: [7], maiorDado: 7,
    sucesso, classificacaoMargem: c,
  })) as CartaoRolagem;
  const acentos = [
    ["sucesso_critico", "ok"], ["sucesso_padrao", "cy"], ["sucesso_limitado", "am"],
    ["falha_limitada", "magenta"], ["falha", "perigo"], ["falha_critica", "perigo"],
  ] as const;
  const errados = acentos.filter(([k, esperado]) => acentoDoCartao(faixa(k, k.startsWith("sucesso"))) !== esperado);
  ok(
    "L4 (a espinha segue a CLASSIFICAÇÃO, não o booleano de sucesso — crítico verde, padrão ciano)",
    errados.length === 0,
    errados.length ? JSON.stringify(errados) : acentos.map(([k, a]) => `${k}=${a}`).join(" "),
  );
  const semCd = projetarEntrada(log("rolagem_pericia", { atributo: "Corpo", atributoValor: 2, modificador: 0, total: 2, dados: [2, 1], maiorDado: 2 })) as CartaoRolagem;
  ok("L5 (teste sem CD fica neutro, igual à faixa 'sem CD definida' — não verde de sucesso)", acentoDoCartao(semCd) === "neutro", acentoDoCartao(semCd));
}

// ═════════════════ ESTADOS DO PERSONAGEM ═════════════════

// Colapso, sobrecarga, descanso e Ruptura saíram do card genérico de
// efeito. Estes testes fixam o motivo: cada um lê campos que o
// projetor de efeito NÃO lia, e o descanso é a prova mais dura — o
// payload dele não tem uma única chave que `projetarEfeito` procure.
{
  const inicio = projetarEntrada(log("collapse_started", { characterNome: "Corvo", tipo: "pv", segmentos: 1 })) as Extract<CartaoFeed, { kind: "colapso" }>;
  const estavel = projetarEntrada(log("collapse_stabilized", { characterNome: "Corvo", tipo: "pv", segmentos: 2 })) as Extract<CartaoFeed, { kind: "colapso" }>;
  ok(
    "X1 (colapso tem card PRÓPRIO, com fase e segmento — não é mais 'efeito com dano')",
    inicio.kind === "colapso" && inicio.fase === "iniciado" && inicio.segmento === 1 && inicio.recurso === "PV",
    `${inicio.kind}/${inicio.fase}/${inicio.segmento}`,
  );
  ok(
    "X2 (estabilizar é ALÍVIO: o acento deixa de ser vermelho)",
    acentoDoCartao(inicio) === "perigo" && acentoDoCartao(estavel) === "ok",
    `${acentoDoCartao(inicio)} → ${acentoDoCartao(estavel)}`,
  );
}
{
  const s1 = projetarEntrada(log("overload_surge_used", { characterNome: "Siv", tipo: "Eco Sináptico", indice: 1, maxSurtos: 3, danoDado: "1d4", danoPsiquico: 3 })) as Extract<CartaoFeed, { kind: "sobrecarga" }>;
  const s3 = projetarEntrada(log("overload_surge_used", { characterNome: "Siv", indice: 3, maxSurtos: 3, rupturaPendente: true })) as Extract<CartaoFeed, { kind: "sobrecarga" }>;
  ok(
    "X3 (surto de sobrecarga carrega índice, máximo e o dano da regra)",
    s1.kind === "sobrecarga" && s1.indice === 1 && s1.maximo === 3 && s1.danoPsiquico === 3 && s1.danoDado === "1d4",
    `${s1.indice}/${s1.maximo} · ${s1.danoPsiquico} (${s1.danoDado})`,
  );
  ok("X4 (surto que abre Ruptura vira perigo, não violeta de rotina)", acentoDoCartao(s3) === "perigo", acentoDoCartao(s3));
}
{
  const d = projetarEntrada(log("rest_long", { characterNome: "Corvo", before: { pv: 5, pe: 1, mana: 6 }, after: { pv: 26, pe: 8, mana: 6 } })) as Extract<CartaoFeed, { kind: "descanso" }>;
  const rotulos = d.recursos.map((r) => `${r.rotulo} ${r.antes}→${r.depois}`).join(", ");
  ok(
    "X5 (descanso mostra antes → depois — o card genérico não lia NENHUMA chave deste payload)",
    d.kind === "descanso" && d.duracao === "longo" && d.recursos.length === 2,
    rotulos,
  );
  ok("X6 (recurso que não mudou fica de fora: card de recuperação não lista o que não voltou)", !rotulos.includes("Mana"), rotulos);
}
{
  const r = projetarEntrada(log("rupture_resolved", { characterNome: "Siv", ruptureLevel: 2, integrityBefore: 7, integrityAfter: 6, manaBonusApplied: 2 })) as Extract<CartaoFeed, { kind: "ruptura" }>;
  ok(
    "X7 (rupture_resolved era ÓRFÃO — sem projetor e sem motivo de exclusão; agora tem card)",
    r.kind === "ruptura" && r.nivel === 2 && r.integridadeAntes === 7 && r.bonusMana === 2,
    `nível ${r.nivel}, integridade ${r.integridadeAntes}→${r.integridadeDepois}`,
  );
}
{
  // A regra que `EXCLUIDOS_DO_FEED` já PROMETIA e ninguém cumpria: a
  // resolução não vira card, mas fecha o card da pendência.
  const abertura = log("rupture_choice_created", { characterNome: "Siv" }, { id: "p-a", character_id: "siv" });
  const fecho = log("rupture_choice_resolved", { characterNome: "Siv", marca: "Cicatriz Sináptica", traco: "Fala em ecos" }, { id: "p-b", character_id: "siv" });
  const feed = projetarFeed([abertura, fecho]);
  const pend = feed[0] as Extract<CartaoFeed, { kind: "pendencia" }>;
  ok(
    "X8 (a resolução ATUALIZA a pendência em vez de sumir — um card só, já resolvido)",
    feed.length === 1 && pend.resolvida && pend.resultado === "Cicatriz Sináptica · Fala em ecos",
    `${feed.length} card(s), resolvida=${pend.resolvida}, "${pend.resultado}"`,
  );
  const soAbertura = projetarFeed([abertura]);
  ok(
    "X9 (sem resolução a pendência continua aberta — nada de fechar sozinho)",
    (soAbertura[0] as Extract<CartaoFeed, { kind: "pendencia" }>).resolvida === false,
    "aberta",
  );
}
{
  // Uma CONDIÇÃO e um EFEITO TEMPORÁRIO respondem perguntas diferentes,
  // e a família é o que o card usa pra decidir qual delas mostrar.
  const cond = projetarEntrada(log("condition_applied", { condicaoNome: "Sangrando", characterNome: "Corvo", intensidade: 2, danoPorRodada: "1d8", cura: "Teste de Vigor CD 12" })) as Extract<CartaoFeed, { kind: "efeito" }>;
  const temp = projetarEntrada(log("temporary_effect_added", { efeitoNome: "Compressão", characterNome: "Siv", duracao: "2 rodadas" })) as Extract<CartaoFeed, { kind: "efeito" }>;
  ok(
    "X10 (condição carrega intensidade/dano/cura; efeito temporário carrega duração)",
    cond.familia === "condicao" && cond.intensidade === 2 && cond.cura !== null && temp.familia === "temporario" && temp.intensidade === null,
    `${cond.familia}(int ${cond.intensidade}) · ${temp.familia}(dur ${temp.duracao})`,
  );
}

// ═════════════════ COMBATE (vtt_turn_tracks) ═════════════════

{
  const exploracao = { modo: "exploracao", rodada: 1, janela: "rapidos", participantes: [] };
  const combate = { modo: "combate", rodada: 1, janela: "rapidos", participantes: [{ id: "a", nome: "Siv" }] };
  const r2 = { modo: "combate", rodada: 2, janela: "rapidos", participantes: [{ id: "a", nome: "Siv" }] };
  const lentos = { modo: "combate", rodada: 1, janela: "lentos", participantes: [{ id: "a", nome: "Siv" }] };
  const encerrou = { modo: "combate", rodada: 1, janela: "rapidos", participantes: [{ id: "a", nome: "Siv", encerrouEm: "t" }] };

  ok("C1 (entrar em combate emite UM evento de início)", diffTrilha(exploracao, combate).map((e) => e.evento).join() === "combate_iniciado", JSON.stringify(diffTrilha(exploracao, combate)));
  ok("C2 (sair do combate emite encerramento)", diffTrilha(combate, exploracao).map((e) => e.evento).join() === "combate_encerrado", "ok");
  ok("C3 (rodada nova emite avanço de rodada)", diffTrilha(combate, r2).map((e) => e.evento).join() === "rodada_avancou", "ok");
  ok("C4 (troca de janela emite mudança de janela)", diffTrilha(combate, lentos).map((e) => e.evento).join() === "janela_mudou", "ok");
  ok("C5 (turno encerrado sai por participante)", diffTrilha(combate, encerrou).map((e) => e.evento).join() === "turno_encerrado", "ok");
  ok("C6 (estado IGUAL não emite nada — o feed não enche de ruído a cada salvamento)", diffTrilha(combate, combate).length === 0, "0 eventos");
  ok("C7 (trilha irreconhecível não vira evento)", paraComparavel({ lixo: true }) === null && diffTrilha(null, null).length === 0, "null");
}
{
  const p = payloadDoEvento({ evento: "rodada_avancou", rodada: 3, janela: "rapidos" });
  ok(
    "C8 (payload é SEMÂNTICO — nada de estado bruto da trilha)",
    p.evento === "rodada_avancou" && p.rodada === 3 && p.janelaRotulo === "Turnos rápidos" && !("participantes" in p),
    JSON.stringify(p),
  );
  const cartao = projetarEntrada(log("combate_vtt", p));
  ok(
    "C9 (o evento de combate vira DIVISOR compacto, não card grande)",
    cartao?.kind === "divisor" && (cartao as Extract<CartaoFeed, { kind: "divisor" }>).texto.includes("RODADA 03"),
    (cartao as Extract<CartaoFeed, { kind: "divisor" }>)?.texto ?? "",
  );
  ok("C10 (rótulo de janela é humano)", rotuloDaJanela("lentos") === "Turnos lentos", rotuloDaJanela("lentos"));
}

// ═════════════════ PROJEÇÃO COMPLETA ═════════════════

{
  const entradas = [
    log("chat", { text: "oi", autorNome: "Siv" }),
    log("character_state_change", { characterNome: "Corvo", action: "damage", before: 20, after: 3 }),
    log("inventory_transfer", { itemName: "Balas" }),
    log("attack_resolved", { workflowId: "w1", armaNome: "Arco", dano: 5 }),
    log("action_used", { paGasto: 2 }),
    log("tipo_desconhecido", {}),
  ];
  const feed = projetarFeed(entradas);
  ok(
    "P1 (a projeção descarta o técnico e mantém o que é conversa/mecânica)",
    feed.length === 2 && feed[0].kind === "mensagem" && feed[1].kind === "ataque",
    `${feed.length} cards: ${feed.map((c) => c.kind).join(",")}`,
  );
}
{
  // Payload corrompido não pode derrubar o feed inteiro.
  const mau = { get text() { throw new Error("payload corrompido"); } } as unknown as Record<string, unknown>;
  const entradas = [log("chat", mau), log("chat", { text: "sobrevivi", autorNome: "Siv" })];
  const feed = projetarFeed(entradas);
  ok("P2 (payload corrompido some sozinho, sem derrubar o resto)", feed.length === 1, `${feed.length} card(s)`);
}

/* ── Atalho de rolagem no chat (`/r 1d8 + 2`) ──────────────────── */
{
  const t = (entrada: string) => lerComandoRolagem(entrada);

  const simples = t("/r 1d4");
  ok("R1 (/r 1d4)", simples.tipo === "ok" && escreverComando(simples.comando) === "1d4",
    simples.tipo === "ok" ? escreverComando(simples.comando) : simples.tipo);

  const comMod = t("/r 1d8 +2");
  ok("R2 (/r 1d8 +2)", comMod.tipo === "ok" && escreverComando(comMod.comando) === "1d8+2",
    comMod.tipo === "ok" ? escreverComando(comMod.comando) : JSON.stringify(comMod));

  const doisGrupos = t("/r 1d8 + 1d6");
  ok("R3 (/r 1d8 + 1d6)", doisGrupos.tipo === "ok" && escreverComando(doisGrupos.comando) === "1d8+1d6",
    doisGrupos.tipo === "ok" ? escreverComando(doisGrupos.comando) : JSON.stringify(doisGrupos));

  const negativo = t("/r 2d6-1");
  ok("R4 (modificador negativo, sem espaços)", negativo.tipo === "ok" && escreverComando(negativo.comando) === "2d6-1",
    negativo.tipo === "ok" ? escreverComando(negativo.comando) : JSON.stringify(negativo));

  const semQuantidade = t("/R d20");
  ok("R5 (quantidade omitida = 1, prefixo em maiúscula)", semQuantidade.tipo === "ok" && escreverComando(semQuantidade.comando) === "1d20",
    semQuantidade.tipo === "ok" ? escreverComando(semQuantidade.comando) : JSON.stringify(semQuantidade));

  const longo = t("/rolar 3d6");
  ok("R6 (forma longa /rolar)", longo.tipo === "ok" && escreverComando(longo.comando) === "3d6",
    longo.tipo === "ok" ? escreverComando(longo.comando) : JSON.stringify(longo));

  ok("R7 (texto comum não vira comando)", t("bom dia, mesa").tipo === "texto", t("bom dia, mesa").tipo);
  ok("R8 (outra barra não vira comando)", t("/me sai da sala").tipo === "texto", t("/me sai da sala").tipo);
  ok("R9 (/r sozinho pede o dado)", t("/r").tipo === "erro", t("/r").tipo);
  ok("R10 (dado que a mesa não tem)", t("/r 1d7").tipo === "erro", JSON.stringify(t("/r 1d7")));
  ok("R11 (só modificador, sem dado)", t("/r 5").tipo === "erro", JSON.stringify(t("/r 5")));
  ok("R12 (lixo no meio)", t("/r 1d8 + batata").tipo === "erro", JSON.stringify(t("/r 1d8 + batata")));
  ok("R13 (não dá pra subtrair dados)", t("/r 2d6 - 1d4").tipo === "erro", JSON.stringify(t("/r 2d6 - 1d4")));
  ok("R14 (teto de dados)", t("/r 21d6").tipo === "erro", JSON.stringify(t("/r 21d6")));
  ok("R15 (teto de modificador)", t("/r 1d6 + 21").tipo === "erro", JSON.stringify(t("/r 1d6 + 21")));

  const somaMods = t("/r 1d6 + 2 + 3");
  ok("R16 (modificadores somam)", somaMods.tipo === "ok" && somaMods.comando.modificador === 5,
    somaMods.tipo === "ok" ? String(somaMods.comando.modificador) : JSON.stringify(somaMods));

  const total = t("/r 2d6 + 1d4");
  ok("R17 (total de dados é a soma das quantidades)", total.tipo === "ok" && total.comando.total === 3,
    total.tipo === "ok" ? String(total.comando.total) : JSON.stringify(total));
}

console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
