#!/usr/bin/env node
/**
 * Gera `content/v12/db_acoes_v1_2.json`: o catálogo da aba Ações do Console,
 * com as ações das três cenas (combate, investigação e Trama) num formato só.
 *
 * Fontes:
 * - combate: `fontes/combate_v12.md` (cópia do Notion, cap. 22. CENAS DE COMBATE);
 * - Trama: `fontes/trama_v12.md` (cópia do Notion, cap. 24. TECENDO A MALHA);
 * - investigação: `content/v12/db_investigacao_v1_2.json` (já transcrito).
 *
 * A LISTA é curada aqui (slug, grupo, custo, teste, opções, requisitos); o TEXTO
 * da regra é copiado da fonte pelo título da ação, para não divergir do livro.
 * Se uma ação curada não for encontrada na fonte, o script falha.
 *
 * Requisitos nunca bloqueiam: o VTT nem sempre está 100% registrado, então a
 * aba usa os requisitos só para avisar ("Pela ficha, você não está Caído").
 *
 * O arquivo v1.1 (`content/db_acoes_combate_normalizado_v1_1.json`) continua
 * intocado: o motor atual (`actionConsole.ts`) e seus testes dependem dele.
 *
 * Uso: node scripts/dev/v12/gerar_acoes_v12.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FONTES = "scripts/dev/v12/fontes";
const SAIDA = "content/v12/db_acoes_v1_2.json";

// ---------------------------------------------------------------------------
// Leitura do Notion exportado (markdown com <details>, <callout>, <table>)
// ---------------------------------------------------------------------------

/** Remove marcas do Notion e normaliza para o markdown que `TextoComRegras` entende. */
function limpar(md) {
  return md
    .replace(/\t/g, "")
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/g, (_, corpo) => tabela(corpo))
    .replace(/<callout[^>]*>\s*([\s\S]*?)\s*<\/callout>/g, (_, c) => c.split("\n").filter((l) => l.trim() && l.trim() !== "---").map((l) => `> ${l.trim()}`).join("\n"))
    .replace(/<span[^>]*>([\s\S]*?)<\/span>/g, "$1")
    .replace(/<mention-page[^>]*\/>/g, "")
    .replace(/<mention-page[^>]*>([\s\S]*?)<\/mention-page>/g, "$1")
    .replace(/<\/?(colgroup|col)[^>]*>/g, "")
    .replace(/\\([*_`[\]()|<>])/g, "$1")
    .replace(/\*{4,}/g, "")
    .replace(/\*\*\s*\*\*/g, " ")
    .replace(/^---\s*$/gm, "")
    .replace(/[  ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tabela(corpo) {
  const linhas = [...corpo.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/\n/g, " ").trim()));
  if (!linhas.length) return "";
  return "\n" + [`| ${linhas[0].join(" | ")} |`, `| ${linhas[0].map(() => "---").join(" | ")} |`, ...linhas.slice(1).map((l) => `| ${l.join(" | ")} |`)].join("\n") + "\n";
}

/** Título de um <summary> sem custo nem marcação: "**ATACAR ****`2 PA`**" → "ATACAR". */
function tituloDoSummary(s) {
  return s.replace(/`[^`]*`/g, "").replace(/[*\\]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Todos os blocos <details> (inclusive aninhados), com o corpo cru até o </details> correspondente. */
function blocos(md) {
  const out = [];
  const re = /<details>\s*<summary>([\s\S]*?)<\/summary>/g;
  let m;
  while ((m = re.exec(md))) {
    let prof = 1;
    let i = re.lastIndex;
    const tag = /<\/?details>/g;
    tag.lastIndex = i;
    let t;
    while ((t = tag.exec(md))) {
      prof += t[0] === "<details>" ? 1 : -1;
      if (prof === 0) break;
    }
    out.push({ titulo: tituloDoSummary(m[1]), corpo: md.slice(i, t ? t.index : md.length) });
  }
  return out;
}

function porTitulo(lista, titulo) {
  const achado = lista.find((b) => b.titulo === titulo.toUpperCase());
  if (!achado) throw new Error(`Ação "${titulo}" não encontrada na fonte.`);
  return achado;
}

/** Corpo sem os <details> filhos (eles viram opções). */
function semFilhos(corpo) {
  let s = corpo;
  for (;;) {
    const i = s.indexOf("<details>");
    if (i < 0) return s;
    let prof = 0;
    const tag = /<\/?details>/g;
    tag.lastIndex = i;
    let t;
    while ((t = tag.exec(s))) {
      prof += t[0] === "<details>" ? 1 : -1;
      if (prof === 0) break;
    }
    s = s.slice(0, i) + s.slice(t ? t.index + "</details>".length : s.length);
  }
}

// ---------------------------------------------------------------------------
// Combate (cap. 22)
// ---------------------------------------------------------------------------

const combateMd = readFileSync(`${FONTES}/combate_v12.md`, "utf8");
const inicioAcoes = combateMd.indexOf("AÇÕES DE MOVIMENTO");
const fimAcoes = combateMd.indexOf("# CAMPO DE BATALHA");
const combateBlocos = blocos(combateMd.slice(combateMd.lastIndexOf("<details>", inicioAcoes), fimAcoes));

const pa = (valor, extra = {}) => ({ pa: valor, ...extra });
const reacao = { reacao: 1 };
const livre = { livre: true };

/** Lista curada do combate, na ordem do livro. `titulo` = título no Notion. */
const COMBATE = [
  { slug: "deslocar", titulo: "Deslocar-se", grupo: "movimento", custo: pa(1, { repeticao_incremento: 1 }), funcao: "Andar, correr, manobrar ou saltar.",
    opcoes: [
      { slug: "andar", nome: "Andar", funcao: "Até 10 + Corpo metros, sem teste." },
      { slug: "correr", nome: "Correr", funcao: "O dobro de Andar; pode exigir Mobilidade (Corpo 3+ dispensa).", teste: { pericias: ["mobilidade"], condicional: true } },
      { slug: "manobrar", nome: "Manobrar", funcao: "Até 10 + Corpo metros por terreno difícil; sempre testa Mobilidade.", teste: { pericias: ["mobilidade"] } },
      { slug: "saltar_horizontal", nome: "Saltar (horizontal)", funcao: "Distância pela tabela de Corpo; com ou sem impulso." },
      { slug: "saltar_vertical", nome: "Saltar (vertical)", funcao: "Altura pela tabela de Corpo, sem teste." },
    ] },
  { slug: "levantar", titulo: "Levantar", grupo: "movimento", custo: pa(1), funcao: "Sair da condição Caído.", requisitos: [{ tipo: "condicao_em_si", condicao: "caido", aviso: "Você não está Caído" }] },
  { slug: "escapar", titulo: "Escapar", grupo: "movimento", custo: pa(2), funcao: "Livrar-se de uma restrição de movimento.", teste: { pericias: ["luta", "vigor"], contra: "Resistir do oponente ou CD" },
    requisitos: [{ tipo: "condicao_em_si", condicao: ["agarrado", "imobilizado"], aviso: "Você não está Agarrado nem Imobilizado" }] },
  { slug: "esconder_se", titulo: "Esconder-se", grupo: "movimento", custo: pa(1), funcao: "Sumir da atenção dos inimigos.", teste: { pericias: ["furtividade"], contra: "Percepção de cada inimigo" } },
  { slug: "interagir", titulo: "Interagir", grupo: "movimento", custo: pa(1), funcao: "Usar um objeto, dispositivo ou elemento da cena." },
  { slug: "sacar_guardar_trocar", titulo: "Sacar, guardar ou trocar", grupo: "movimento", custo: pa(1, { pa_max: 2 }), funcao: "Mudar o que está nas mãos; o custo depende de onde está o item.",
    opcoes: [
      { slug: "acesso_rapido", nome: "Acesso rápido", custo: pa(1), funcao: "Coldre, bainha, bolso utilitário ou outro suporte de acesso imediato." },
      { slug: "mochila", nome: "Mochila", custo: pa(2), funcao: "Mochila ou outro compartimento fechado." },
    ] },
  { slug: "recarregar", titulo: "Recarregar", grupo: "movimento", custo: pa(1, { pa_max: 2 }), funcao: "Repor a munição da arma; o custo depende de onde está a munição.",
    opcoes: [
      { slug: "suporte_ou_acesso_rapido", nome: "Suporte de munição ou acesso rápido", custo: pa(1), funcao: "Usa a munição disponível diretamente." },
      { slug: "mochila", nome: "Mochila", custo: pa(2), funcao: "Retira a munição da Mochila na mesma ação." },
    ] },

  { slug: "atacar", titulo: "Atacar", grupo: "ofensiva", custo: pa(2), funcao: "Ferir um inimigo ou danificar um objeto.", teste: { contra: "Esquivar, Aparar ou Bloquear do alvo" },
    opcoes: [
      { slug: "corpo_a_corpo", titulo: "Ataque corpo a corpo", nome: "Corpo a corpo", custo: pa(2), funcao: "Alvo a até 1 m, desarmado ou com arma branca.", teste: { pericias: ["luta"] } },
      { slug: "distancia", titulo: "Ataque à distância", nome: "À distância", custo: pa(2), funcao: "Arremesso e disparo usam Precisão; armas de fogo, Balística.", teste: { pericias: ["precisao", "balistica"] } },
      { slug: "secundario", titulo: "Ataque secundário", nome: "Secundário", custo: pa(1), funcao: "Uma vez por rodada, depois de Atacar com arma leve.",
        requisitos: [{ tipo: "arma_secundaria_leve", aviso: "Você não empunha uma segunda arma leve" }] },
    ] },
  { slug: "agarrar", titulo: "Agarrar", grupo: "ofensiva", custo: pa(2), funcao: "Prender um alvo adjacente.", teste: { pericias: ["luta"], contra: "Resistir ou Esquivar do alvo" } },
  { slug: "estrangular", titulo: "Estrangular", grupo: "ofensiva", custo: pa(2), funcao: "Incapacitar um alvo Imobilizado ou Atordoado.", teste: { pericias: ["luta"], contra: "Vigor do alvo" } },
  { slug: "derrubar", titulo: "Derrubar", grupo: "ofensiva", custo: pa(2), funcao: "Deixar um alvo adjacente Caído.", teste: { pericias: ["luta"], contra: "Resistir ou Esquivar do alvo" } },
  { slug: "empurrar", titulo: "Empurrar", grupo: "ofensiva", custo: pa(2), funcao: "Deslocar o oponente à força.", teste: { pericias: ["luta"], contra: "Resistir ou Esquivar do alvo" } },
  { slug: "desarmar", titulo: "Desarmar", grupo: "ofensiva", custo: pa(2), funcao: "Tirar a arma da mão do oponente.", teste: { pericias: ["luta"], contra: "Resistir ou Esquivar do alvo" } },
  { slug: "fintar", titulo: "Fintar", grupo: "ofensiva", custo: pa(1), funcao: "Abrir a guarda para o próximo golpe.", teste: { pericias: ["luta", "influencia"], contra: "Percepção ou Lógica do alvo" } },

  { slug: "aparar", titulo: "Aparar", grupo: "defensiva", tipo: "reacao", custo: reacao, funcao: "Desviar um golpe corpo a corpo com a arma.", teste: { pericias: ["luta"] },
    requisitos: [{ tipo: "arma_com_propriedade", propriedade: "aparar", aviso: "Sua arma empunhada não tem a propriedade Aparar" }] },
  { slug: "bloquear", titulo: "Bloquear", grupo: "defensiva", tipo: "reacao", custo: reacao, funcao: "Interpor escudo ou proteção no ataque.", teste: { pericias: ["reflexos"] },
    requisitos: [{ tipo: "empunhando_protecao", aviso: "Você não empunha escudo ou proteção" }] },
  { slug: "esquivar", titulo: "Esquivar", grupo: "defensiva", tipo: "reacao", custo: reacao, funcao: "Sair da trajetória do perigo.", teste: { pericias: ["reflexos"] } },
  { slug: "resistir", titulo: "Resistir", grupo: "defensiva", tipo: "reacao", custo: reacao, funcao: "Não ser deslocado, derrubado ou imobilizado.", teste: { pericias: ["vigor", "mobilidade"] } },

  { slug: "mirar", titulo: "Mirar", grupo: "diversa", custo: pa(1), funcao: "+1 no próximo ataque à distância (até +2).", teste: { pericias: ["percepcao"], contra: "CD do narrador" } },
  { slug: "acessar_trama", titulo: "Acessar Trama", grupo: "diversa", custo: pa(1), funcao: "Conectar a um ponto de acesso no alcance.",
    requisitos: [{ tipo: "acesso_trama", aviso: "Você não tem Deck Sináptico nem Sináptica" }] },
  { slug: "preparar_turno", titulo: "Preparar turno", grupo: "diversa", tipo: "reacao", custo: { reacao: 1, pa_preparado: true }, funcao: "Guardar ações para um gatilho fora da ordem." },
  { slug: "usar_pericia", titulo: "Usar perícia", grupo: "diversa", custo: pa(1), funcao: "Criar vantagem, impor desvantagem ou ler a cena.", teste: { pericias: "qualquer" } },

  { slug: "postura_defensiva", titulo: "Postura defensiva", grupo: "postura", custo: pa(1), funcao: "+1 em defensivas, –1 em ofensivas.", estado: "postura" },
  { slug: "postura_ofensiva", titulo: "Postura ofensiva", grupo: "postura", custo: pa(1), funcao: "+1 em ofensivas, –1 em defensivas.", estado: "postura" },
];

/** As livres não têm <details> próprio: vêm da lista em AÇÕES LIVRES. */
const LIVRES = [
  { slug: "falar", nome: "Falar", funcao: "Gritar ordens, provocar, alertar aliados." },
  { slug: "gestos_rapidos", nome: "Gestos rápidos", funcao: "Apontar, sinalizar, soltar um alvo agarrado." },
];

function combate() {
  const acoes = COMBATE.map((c) => {
    const bloco = porTitulo(combateBlocos, c.titulo);
    const acao = {
      slug: c.slug,
      nome: c.titulo,
      cena: "combate",
      grupo: c.grupo,
      tipo: c.tipo ?? "acao",
      custo: c.custo,
      funcao: c.funcao,
      teste: c.teste ?? null,
      requisitos: c.requisitos ?? [],
      descricao: limpar(semFilhos(bloco.corpo)),
    };
    if (c.estado) acao.estado = c.estado;
    if (c.opcoes) {
      acao.opcoes = c.opcoes.map(({ titulo, ...o }) => ({
        ...o,
        custo: o.custo ?? c.custo,
        ...(titulo ? { descricao: limpar(porTitulo(combateBlocos, titulo).corpo) } : {}),
      }));
    }
    return acao;
  });
  const livres = porTitulo(combateBlocos, "Ações livres");
  for (const l of LIVRES) {
    acoes.push({ slug: l.slug, nome: l.nome, cena: "combate", grupo: "livre", tipo: "livre", custo: livre, funcao: l.funcao, teste: null, requisitos: [], descricao: trechoDaLista(livres.corpo, l.nome) });
  }
  return acoes;
}

/** Item "- **FALAR**" da lista de Ações livres, até o próximo item de mesmo nível. */
function trechoDaLista(corpo, nome) {
  const linhas = corpo.split("\n");
  const i = linhas.findIndex((l) => l.replace(/\t/g, "").startsWith(`- **${nome.toUpperCase()}**`));
  if (i < 0) throw new Error(`Ação livre "${nome}" não encontrada.`);
  const nivel = linhas[i].match(/^\t*/)[0].length;
  const fim = linhas.findIndex((l, j) => j > i && l.match(/^\t*/)[0].length <= nivel && l.trim().startsWith("- **"));
  return limpar(linhas.slice(i + 1, fim < 0 ? undefined : fim).join("\n").replace(/^\t+/gm, ""));
}

// ---------------------------------------------------------------------------
// Trama (cap. 24)
// ---------------------------------------------------------------------------

const tramaMd = readFileSync(`${FONTES}/trama_v12.md`, "utf8");
const tramaAcoes = tramaMd.slice(tramaMd.indexOf("# AÇÕES DE TRAMA"), tramaMd.indexOf("# CLASSIFICAÇÕES"));
const tramaBlocos = blocos(tramaAcoes);

const TRAMA = {
  trilha: [
    ["conectar", "Conectar", "Vincular-se a um ponto de acesso."],
    ["avancar", "Avançar", "Mover o avatar até 10 espaços."],
    ["sondar", "Sondar", "Revelar o que há adiante na trilha."],
    ["examinar", "Examinar", "Decifrar defesas de um Nó ou Bloqueio."],
    ["monitorar", "Monitorar", "Vigiar um elemento e reagir a ele."],
    ["forcar_rota", "Forçar rota", "Saltar direto até um Nó analisado."],
    ["criar_ruido", "Criar ruído", "Reduzir a Detecção com interferência."],
    ["desligar", "Desligar", "Sair da Sessão de forma controlada."],
    ["desplugar", "Desplugar", "Saída abrupta: aciona Detecção e causa 1d8."],
  ],
  ofensiva: [
    ["despistar", "Despistar", "Confundir o rastreamento do perseguidor."],
    ["ofuscar", "Ofuscar", "Cegar os sentidos de Sentinela ou Admin."],
    ["expor_nucleo", "Expor núcleo", "Revelar onde a defesa inimiga falha."],
    ["pulso_sinaptico", "Pulso sináptico", "1d6 + Mente de dano psíquico."],
  ],
  comando: [
    ["controlar_sistema", "Controlar sistema", "Operar portões, câmeras e elevadores."],
    ["controlar_unidade", "Controlar unidade", "Assumir um drone, robô ou veículo."],
    ["quebrar_bloqueio", "Quebrar bloqueio", "Forçar passagem por um Bloqueio."],
    ["travar_acesso", "Travar acesso", "Erguer uma barreira sobre Nó ou Bloqueio."],
    ["extrair_dados", "Extrair dados", "Copiar dados de um Nó de Dados."],
    ["corromper_dados", "Corromper dados", "Destruir arquivos de um Nó de Dados."],
    ["instalar_virus", "Instalar vírus", "Deixar uma sabotagem com gatilho."],
    ["forjar_credencial", "Forjar credencial", "Criar uma identidade falsa no sistema."],
    ["modificar_assinatura", "Modificar assinatura", "Atribuir suas ações a outro ID."],
    ["apagar_rastros", "Apagar rastros", "Remover evidências do seu percurso."],
  ],
};

const PERICIAS = { tecnomagia: "tecnomagia", percepção: "percepcao", lógica: "logica", robótica: "robotica" };

/** "**CONECTAR ****`1 PA`*** ***`0 RAM`**" → { pa: 1, ram: 0 } (custo lido do summary cru). */
function custoTrama(md, titulo) {
  const m = [...md.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].find((s) => tituloDoSummary(s[1]) === titulo.toUpperCase());
  const cru = m[1];
  const ram = Number(cru.match(/`(\d+) RAM`/)?.[1] ?? 0);
  if (/Ação Livre/i.test(cru)) return { livre: true, ram };
  return { pa: Number(cru.match(/`(\d+) PA`/)[1]), ram };
}

/** Separa o cabeçalho "**Tipo:** … **Teste:** …" do texto da regra. */
function fichaTrama(corpo) {
  // As linhas variam entre "**Tipo:** X", "**Alcance: **X" e "**Alcance: –**".
  const CABECALHO = /^\s*\*\*(Tipo|Alvo|Alcance|Duração|Teste):[^\n]*\n?/gm;
  const campo = (nome) => {
    const linha = corpo.match(new RegExp(`^\\s*\\*\\*${nome}:([^\\n]*)`, "m"))?.[1];
    return linha ? limpar(linha).replace(/[*`]/g, "").trim() || null : null;
  };
  const texto = corpo.replace(CABECALHO, "");
  const testeTxt = campo("Teste");
  let teste = null;
  if (testeTxt && testeTxt !== "–") {
    const i = testeTxt.indexOf(" vs ");
    const pericia = i < 0 ? testeTxt : testeTxt.slice(0, i);
    const slug = PERICIAS[pericia.trim().toLowerCase()];
    teste = { pericias: slug ? [slug] : [], contra: i < 0 ? null : testeTxt.slice(i + 4).trim() };
  }
  return { tipo_trama: campo("Tipo"), alvo: campo("Alvo"), alcance: campo("Alcance"), duracao: campo("Duração"), teste, descricao: limpar(texto) };
}

function trama() {
  const acoes = [];
  for (const [grupo, lista] of Object.entries(TRAMA)) {
    for (const [slug, nome, funcao] of lista) {
      const bloco = porTitulo(tramaBlocos, nome);
      const f = fichaTrama(bloco.corpo);
      const requisitos = [{ tipo: "acesso_trama", aviso: "Você não tem Deck Sináptico nem Sináptica" }];
      if (slug !== "conectar") requisitos.push({ tipo: "sessao_ativa", aviso: "Você não está numa Sessão" });
      if (grupo === "comando") requisitos.push({ tipo: "comando_conhecido", aviso: "Este comando não está no seu deck nem na sua Sináptica" });
      acoes.push({
        slug,
        nome,
        cena: "trama",
        grupo: grupo === "comando" ? "comando" : `protocolo_${grupo}`,
        tipo: grupo === "comando" ? "comando" : "protocolo",
        custo: custoTrama(tramaAcoes, nome),
        funcao,
        teste: f.teste,
        requisitos,
        // Comandos sempre deixam +1 Rastro; falhas de qualquer ação somam Detecção (padrão +1, crítica +3).
        rastro: grupo === "comando" ? 1 : 0,
        tipo_trama: f.tipo_trama,
        alvo: f.alvo,
        alcance: f.alcance,
        duracao: f.duracao,
        descricao: f.descricao,
      });
    }
  }
  return acoes;
}

// ---------------------------------------------------------------------------
// Investigação (cap. 21, já transcrito)
// ---------------------------------------------------------------------------

const PERICIA_INVESTIGACAO = { correlacionar: ["logica"], vasculhar: ["percepcao"], investigar: "qualquer" };

function investigacao() {
  const db = JSON.parse(readFileSync("content/v12/db_investigacao_v1_2.json", "utf8"));
  return db.acoes.map((a) => ({
    slug: a.slug,
    nome: a.nome,
    cena: "investigacao",
    grupo: "investigacao",
    tipo: "acao",
    custo: a.custo.tipo === "pa" ? { pa: a.custo.valor } : { proprio: true },
    funcao: a.funcao.replace(/\.$/, "") + ".",
    teste: PERICIA_INVESTIGACAO[a.slug] ? { pericias: PERICIA_INVESTIGACAO[a.slug] } : null,
    requisitos: [],
    ...(a.regra ? { regra: a.regra } : {}),
    descricao: a.descricao,
  }));
}

// ---------------------------------------------------------------------------

const acoes = [...combate(), ...investigacao(), ...trama()];
const slugs = new Set();
for (const a of acoes) {
  const chave = `${a.cena}:${a.slug}`;
  if (slugs.has(chave)) throw new Error(`Slug repetido: ${chave}`);
  slugs.add(chave);
  if (!a.descricao || a.descricao.length < 40) throw new Error(`Descrição vazia ou curta demais: ${chave}`);
}

const saida = {
  _meta: {
    ruleset_version: "1.2",
    conteudo: "acoes",
    status: "draft",
    gerado_por: "scripts/dev/v12/gerar_acoes_v12.mjs",
    fontes: [
      "Notion — RUPTURA (1.2) / 22. CENAS DE COMBATE (editado em 12/10/2026)",
      "Notion — RUPTURA (1.2) / 21. CENAS DE INVESTIGAÇÃO, via content/v12/db_investigacao_v1_2.json",
      "Notion — RUPTURA (1.2) / 24. TECENDO A MALHA (editado em 11/10/2026)",
    ],
    total_registros: acoes.length,
    observacoes: [
      "Catálogo da aba Ações do Console. Não substitui db_acoes_combate_normalizado_v1_1.json, que ainda alimenta actionConsole.ts.",
      "Requisitos geram avisos, nunca bloqueios: o VTT nem sempre está 100% registrado.",
      "Custo com pa_max (ex.: 1/2 PA no livro) significa 1 OU 2 PA conforme a opção escolhida, nunca meio PA.",
      "Atacar e Deslocar-se são uma ação só; as formas ficam em `opcoes`.",
      "Na Trama, comandos somam +1 Rastro sempre; falhas somam Detecção (limitada 0, padrão +1, crítica +3).",
    ],
  },
  grupos: {
    combate: [
      { slug: "movimento", nome: "Movimento" },
      { slug: "ofensiva", nome: "Ofensivas" },
      { slug: "defensiva", nome: "Defensivas" },
      { slug: "diversa", nome: "Diversas" },
      { slug: "postura", nome: "Posturas" },
      { slug: "livre", nome: "Livres" },
    ],
    investigacao: [{ slug: "investigacao", nome: "Ações de investigação" }],
    trama: [
      { slug: "protocolo_trilha", nome: "Protocolos de Trilha" },
      { slug: "protocolo_ofensiva", nome: "Protocolos de Ofensiva" },
      { slug: "comando", nome: "Comandos" },
    ],
  },
  acoes,
};

writeFileSync(SAIDA, JSON.stringify(saida, null, 2) + "\n");
const porCena = acoes.reduce((m, a) => ((m[a.cena] = (m[a.cena] ?? 0) + 1), m), {});
console.log(`${SAIDA}: ${acoes.length} ações`, porCena);
