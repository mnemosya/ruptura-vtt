/**
 * CONTRATOS DO FEED — a fronteira entre o LOG TÉCNICO e a CONVERSA.
 *
 * Três coisas distintas, que este arquivo mantém separadas:
 *
 *   · `table_logs`  — auditoria append-only. Continua recebendo TUDO.
 *   · FEED          — projeção DELIBERADA. Só o que a mesa precisa ler.
 *   · WORKFLOW      — estado de uma resolução interativa, correlacionado
 *                     por `workflowId`, que evolui DENTRO do mesmo card.
 *
 * A regra dura: **allowlist explícita**. Um tipo que não está em
 * `PROJETORES` simplesmente não aparece. Não existe `GenericLogCard`,
 * não existe fallback que desenhe JSON, e um tipo novo criado por outra
 * feature não vaza para o Chat só por existir.
 *
 * O que fica de FORA por decisão (não por esquecimento) está em
 * `EXCLUIDOS_DO_FEED`, com o motivo. Esses dados não somem: aparecem
 * DENTRO do card que os originou (PA e munição no card do ataque, por
 * exemplo), que é onde significam alguma coisa.
 *
 * SNAPSHOT: todo card carrega o que precisa para se desenhar, lido do
 * payload gravado no momento do evento. Editar uma magia no Compêndio
 * hoje não pode reescrever o que o Chat mostrou ontem — por isso nada
 * aqui resolve conteúdo por slug em tempo de render.
 *
 * Módulo PURO: sem React, sem rede. Exercitado por
 * `scripts/test-vtt-painel-feed.ts`.
 */

import type { TableLogEntry, TableLogVisibility } from "../../../../../../lib/table";
/* Type-only: some na compilação, então o módulo continua PURO (o teste
   em node nunca carrega o componente). É o que evita duplicar a união
   das seis faixas em dois lugares que precisariam mudar juntos. */
import type { ResultKey } from "../../_dados3d/ResultadoRolagem";

/** Versão do contrato de card. Sobe quando a FORMA de um card muda de um jeito que o render antigo não entenderia. */
export const SCHEMA_VERSION_CARTAO = 1;

/**
 * `magenta` entrou junto com a faixa de margem no card de teste: a
 * classificação `falha_limitada` é magenta na régua das seis faixas
 * (`_dados3d/ResultadoRolagem`), e sem esse acento a espinha teria que
 * arredondar pra vermelho — juntando na mesma cor uma falha que a
 * regra trata como parcial e uma que ela trata como total.
 */
export type AcentoCartao = "cy" | "am" | "perigo" | "ok" | "mana" | "magenta" | "neutro";

/** Autoria já resolvida — nunca reconstruída por join em tempo de render. */
export interface AutoriaCartao {
  /** Nome exibido: personagem, "Narrador" ou o nome público da conta. */
  nome: string;
  tipo: "personagem" | "narrador" | "jogador" | "sistema";
  characterId: string | null;
  /** Conta que registrou (para agrupar mensagens consecutivas com segurança). */
  userId: string | null;
}

interface CartaoComum {
  /** `table_logs.id` — identidade estável, o que o feed usa como key e como âncora de leitura. */
  id: string;
  schemaVersion: number;
  criadoEm: string;
  visibilidade: TableLogVisibility;
  autoria: AutoriaCartao;
  /** Tipo bruto de origem — só para diagnóstico/atributo de teste, nunca para decidir render. */
  origem: string;
}

/** Módulo numérico de um card (DES 6, MOD +0, ND 10, PA 3). */
export interface ModuloCartao {
  rotulo: string;
  valor: string;
  sub?: string;
  acento?: AcentoCartao;
}

export interface CartaoMensagem extends CartaoComum {
  kind: "mensagem";
  texto: string;
  estilo: "normal" | "narracao";
}

export interface CartaoRolagem extends CartaoComum {
  kind: "rolagem";
  /** "TESTE DE PERÍCIA", "TESTE DE ATRIBUTO", "TESTE DE VONTADE"… */
  tipoTeste: string;
  nome: string;
  modulos: ModuloCartao[];
  total: number | null;
  /** `null` quando o evento não registra sucesso/falha (rolagem aberta). */
  sucesso: boolean | null;
  margem: string | null;
  dados: number[];
  /**
   * Dados da rolagem LIVRE com as faces de cada um (`2d6 + 1d4`) — é o
   * que permite desenhar a peça certa pra cada dado, como a ferramenta
   * faz. Vazio em teste de Ruptura (todo dado é d8) e em registros
   * antigos, anteriores ao campo `termos` no payload.
   */
  termos: { faces: number; valor: number }[];
  /** Modo com que os dados foram lidos: soma (padrão) ou maior dado. */
  modo: "sum" | "high";
  maior: number | null;
  alvo: string | null;
  /** Modificadores automáticos aplicados, com nome da fonte. */
  modificadores: { nome: string; valor: number }[];
  /**
   * Leitura de TESTE — o que a faixa da ferramenta de rolar dados
   * desenha (`_dados3d/ResultadoRolagem`). `null` na bandeja livre, que
   * não tem maior dado nem classificação: ali um punhado de dados é
   * somado, e "maior 7 · sem perícia" seria mentira.
   *
   * Existe pra que o Chat mostre a MESMA leitura que a ferramenta e o
   * Console mostram — e não uma terceira versão parecida.
   */
  teste: {
    maiorDado: number;
    pericia: string | null;
    periciaValor: number;
    modificador: number;
    cd: number | null;
    classificacao: ResultKey | null;
  } | null;
}

/** Conteúdo do Compêndio compartilhado ou usado — o snapshot completo. */
export interface SnapshotConteudo {
  categoria: string;
  categoriaRotulo: string;
  slug: string;
  nome: string;
  origem: "oficial" | "modificado" | "homebrew";
  origemRotulo: string;
  resumo: string;
  descricao: string | null;
  tags: string[];
  estatisticas: { rotulo: string; valor: string }[];
}

export interface CartaoReferencia extends CartaoComum {
  kind: "referencia";
  conteudo: SnapshotConteudo;
}

/**
 * Uso de item/talento — referência + o que o uso consumiu.
 *
 * O design de origem desenha DUAS peças (ItemCard carrega carga e
 * quantidade restante; TalentCard carrega gatilho e recarga). Aqui elas
 * continuam sendo um `kind` só, porque a moldura é a mesma e o `switch`
 * de `EntradaFeed` não ganha nada em dobrar — o que muda é o DADO, e
 * por isso cada lado tem os campos que só fazem sentido pra ele.
 */
export interface CartaoUso extends CartaoComum {
  kind: "uso";
  tipoUso: "item" | "talento";
  nome: string;
  descricao: string | null;
  tags: string[];
  custos: ModuloCartao[];
  efeito: string | null;
  /** Item: o que sobrou depois do uso ("2 de 5 cargas"). */
  restante: string | null;
  /** Talento: o que dispara o uso. */
  gatilho: string | null;
  /** Talento: quando volta a ficar disponível. */
  recarga: string | null;
}

export type EstadoAtaque =
  | "declarado"
  | "aguardando_alvo"
  | "aguardando_ataque"
  | "aguardando_defesa"
  | "aguardando_dano"
  | "aguardando_aplicacao"
  | "resolvido"
  | "errou"
  | "cancelado";

export interface CartaoAtaque extends CartaoComum {
  kind: "ataque";
  workflowId: string;
  estado: EstadoAtaque;
  /** Arma/magia usada. */
  nome: string;
  atacante: string;
  tags: string[];
  custos: ModuloCartao[];
  /** Módulos do ATAQUE (dados, atributo, perícia, modificador). */
  modulosAtaque: ModuloCartao[];
  /** Módulos da DEFESA do alvo. */
  modulosDefesa: ModuloCartao[];
  totalAtaque: number | null;
  totalDefesa: number | null;
  alvo: string | null;
  alvoTokenId: string | null;
  alvoCharacterId: string | null;
  acertou: boolean | null;
  margem: number | null;
  faixaMargem: string | null;
  dano: number | null;
  danoTipo: string | null;
  regiao: string | null;
  mitigacao: number | null;
  /** Preenchido quando o dano já foi aplicado — `PV anterior → PV atual`. */
  pvAntes: number | null;
  pvDepois: number | null;
  /** `true` quando esta entrada é apenas de MAGIA (acento violeta, rótulo diferente). */
  magica: boolean;
}

export type EstadoMagia =
  | "conjurada"
  | "aguardando_ataque"
  | "ataque_rolado"
  | "defesa_resolvida"
  | "aguardando_dano"
  | "aguardando_aplicacao"
  | "resolvida"
  | "manual";

export interface CartaoMagia extends CartaoComum {
  kind: "magia";
  workflowId: string;
  estado: EstadoMagia;
  nome: string;
  conjurador: string;
  vertente: string | null;
  nivel: number | null;
  tags: string[];
  custos: ModuloCartao[];
  /** Estatísticas do snapshot (alcance, área, resistência, dano). */
  estatisticas: { rotulo: string; valor: string }[];
  descricao: string | null;
  /** `true` quando a magia é de ataque e o fluxo continua noutro card. */
  exigeAtaque: boolean;
  /** Motivo, quando o estado é "manual" (sem estrutura suficiente para automatizar). */
  motivoManual: string | null;
}

/**
 * Condição, efeito temporário ou efeito de cena.
 *
 * `familia` existe porque as três respondem perguntas diferentes: uma
 * CONDIÇÃO pergunta "quanto isso me machuca e como eu saio" (intensidade,
 * dano por rodada, cura), um EFEITO TEMPORÁRIO pergunta "quando isso
 * acaba" (duração). O card lê `familia` para mostrar um ou outro, em vez
 * de despejar os dois conjuntos de campos meio vazios.
 */
export interface CartaoEfeito extends CartaoComum {
  kind: "efeito";
  acao: "aplicado" | "removido" | "expirado" | "resistido" | "dano" | "cura";
  familia: "condicao" | "temporario" | "cena";
  nome: string;
  fonte: string | null;
  alvo: string | null;
  duracao: string | null;
  /** Condição: intensidade/pilha acumulada. */
  intensidade: number | null;
  /** Condição: o que ela cobra por rodada ("1d8"). */
  danoPorRodada: string | null;
  /** Condição: como sair dela ("Teste de Vigor CD 12"). */
  cura: string | null;
  /** Dano/cura resultante quando o evento o registra. */
  delta: { rotulo: string; valor: string; acento: AcentoCartao } | null;
  descricao: string | null;
}

/**
 * COLAPSO — progressão, não evento solto.
 *
 * Os cinco tipos (`collapse_*`) são momentos da MESMA queda, e o card
 * mostra em que segmento ela está. Antes todos caíam em `CartaoEfeito`
 * com `acao: "dano"` forçado, e os cinco saíam com a mesma cara.
 */
export type FaseColapso = "iniciado" | "avancado" | "estabilizado" | "encerrado" | "desfecho";

export interface CartaoColapso extends CartaoComum {
  kind: "colapso";
  fase: FaseColapso;
  /** Qual trilha colapsou — PV ou PE. */
  recurso: string | null;
  alvo: string | null;
  segmento: number | null;
  segmentoMax: number;
  motivo: string | null;
  desfecho: string | null;
}

/** SURTO DE SOBRECARGA — o que o teste de vontade desencadeia. */
export interface CartaoSobrecarga extends CartaoComum {
  kind: "sobrecarga";
  alvo: string | null;
  /** Tipo do surto sorteado pela regra. */
  efeito: string | null;
  indice: number | null;
  maximo: number;
  danoPsiquico: number | null;
  danoDado: string | null;
  rupturaPendente: boolean;
}

/**
 * DESCANSO — recuperação de recursos.
 *
 * O payload é `{ before, after }`; o card mostra `antes → depois` por
 * recurso que mudou. Enquanto isto caía em `CartaoEfeito`, o card saía
 * com o nome "Efeito" e nenhum número — o pior caso do inventário.
 */
export interface CartaoDescanso extends CartaoComum {
  kind: "descanso";
  duracao: "curto" | "longo";
  alvo: string | null;
  recursos: { rotulo: string; antes: number; depois: number; delta: number }[];
}

/** RUPTURA RESOLVIDA — o preço cobrado e o que ele devolveu. */
export interface CartaoRuptura extends CartaoComum {
  kind: "ruptura";
  alvo: string | null;
  nivel: number | null;
  integridadeAntes: number | null;
  integridadeDepois: number | null;
  bonusMana: number | null;
}

/** Vários efeitos da MESMA resolução (fim de rodada/cena) num card só. */
export interface CartaoResolucao extends CartaoComum {
  kind: "resolucao";
  titulo: string;
  linhas: { ator: string; efeito: string; resultado: string; restante: string; encerrado: boolean }[];
}

export interface CartaoDivisor extends CartaoComum {
  kind: "divisor";
  texto: string;
  acento: AcentoCartao;
}

export interface CartaoPendencia extends CartaoComum {
  kind: "pendencia";
  titulo: string;
  descricao: string;
  alvo: string | null;
  /** `true` quando outra entrada já resolveu esta pendência. */
  resolvida: boolean;
  resultado: string | null;
}

export type CartaoFeed =
  | CartaoMensagem
  | CartaoRolagem
  | CartaoReferencia
  | CartaoUso
  | CartaoAtaque
  | CartaoMagia
  | CartaoEfeito
  | CartaoColapso
  | CartaoSobrecarga
  | CartaoDescanso
  | CartaoRuptura
  | CartaoResolucao
  | CartaoDivisor
  | CartaoPendencia;

// =====================================================================
// Leitura tolerante de payload
// =====================================================================

type P = Record<string, unknown>;

const txt = (p: P, ...ks: string[]): string | null => {
  for (const k of ks) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};
const num = (p: P, ...ks: string[]): number | null => {
  for (const k of ks) {
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};
const bool = (p: P, ...ks: string[]): boolean | null => {
  for (const k of ks) {
    const v = p[k];
    if (typeof v === "boolean") return v;
  }
  return null;
};
const lista = (p: P, ...ks: string[]): string[] => {
  for (const k of ks) {
    const v = p[k];
    if (Array.isArray(v)) {
      const s = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (s.length > 0) return s;
    }
  }
  return [];
};
const numeros = (p: P, ...ks: string[]): number[] => {
  for (const k of ks) {
    const v = p[k];
    if (Array.isArray(v)) {
      const n = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
      if (n.length > 0) return n;
    }
  }
  return [];
};
const sinal = (n: number): string => (n >= 0 ? `+${n}` : String(n));

function autoriaDe(entry: TableLogEntry): AutoriaCartao {
  const p = entry.payload as P;
  const personagem = txt(p, "characterNome", "atacanteNome", "conjuradorNome", "sourceCharacterName", "targetCharacterName");
  const autorNome = txt(p, "autorNome");
  const autorTipo = txt(p, "autorTipo");
  if (personagem) {
    return { nome: personagem, tipo: "personagem", characterId: entry.character_id, userId: entry.created_by_user_id };
  }
  if (autorNome) {
    const tipo = autorTipo === "narrador" ? "narrador" : autorTipo === "jogador" ? "jogador" : "personagem";
    return { nome: autorNome, tipo, characterId: entry.character_id, userId: entry.created_by_user_id };
  }
  return { nome: "Sistema", tipo: "sistema", characterId: entry.character_id, userId: entry.created_by_user_id };
}

function comum(entry: TableLogEntry): CartaoComum {
  return {
    id: entry.id,
    schemaVersion: SCHEMA_VERSION_CARTAO,
    criadoEm: entry.created_at,
    visibilidade: entry.visibility,
    autoria: autoriaDe(entry),
    origem: entry.type,
  };
}

// =====================================================================
// EXCLUSÕES DELIBERADAS
// =====================================================================

/**
 * Tipos que o log grava e o feed NÃO mostra isoladamente, com o motivo.
 * Servem de documentação executável: o teste puro confere que nenhum
 * deles tem projetor.
 */
export const EXCLUIDOS_DO_FEED: Record<string, string> = {
  character_state_change: "mutação crua de recurso — aparece dentro do card que a causou",
  character_evolution: "progressão de ficha, não é evento de mesa",
  character_created: "criação de ficha, não é evento de mesa — mesmo motivo de character_evolution",
  inventory_transfer: "logística de inventário; o Bando já mostra o resultado",
  ammunition: "consumo de munição — aparece no card do ataque",
  action_used: "consumo de PA — aparece no card da ação",
  round_pa_reduced_by_condition: "ajuste automático de PA; aparece na resolução de fim de rodada",
  talent_resource_changed: "mutação crua de recurso de talento",
  talent_effect_applied: "passo intermediário de talento; o efeito aplicado já tem card próprio",
  talent_triggered: "gatilho interno de talento, redundante com o uso",
  talent_opportunity_resolved: "passo intermediário de talento",
  defense_reaction_used: "a defesa é uma ETAPA do ataque — aparece dentro do card do ataque",
  condition_end_round_check_resolved: "resolução de teste pendente — atualiza o card de pendência",
  rupture_choice_resolved: "idem — atualiza o card de pendência da Ruptura",
  profile_event: "mecanismo de perfil removido do produto (migrations 0051-0058)",
  scene_rupture_pending: "aviso redundante com o card de pendência de Ruptura",
};

// =====================================================================
// PROJETORES (a allowlist)
// =====================================================================

type Projetor = (entry: TableLogEntry) => CartaoFeed | null;

function projetarMensagem(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  return {
    ...comum(entry),
    kind: "mensagem",
    texto: txt(p, "text", "mensagem") ?? "",
    estilo: p.estilo === "narracao" ? "narracao" : "normal",
  };
}

function projetarRolagem(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const modulos: ModuloCartao[] = [];
  const atributo = txt(p, "atributo");
  const atributoValor = num(p, "atributoValor", "valorAtributo");
  if (atributo) modulos.push({ rotulo: atributo, valor: atributoValor != null ? String(atributoValor) : "—", sub: txt(p, "atributoDado") ?? undefined });
  const pericia = txt(p, "pericia");
  const periciaValor = num(p, "periciaValor", "valorPericia");
  if (pericia) modulos.push({ rotulo: pericia, valor: periciaValor != null ? String(periciaValor) : "—" });
  const modificador = num(p, "modificador", "mod", "bonus");
  if (modificador != null) modulos.push({ rotulo: "MOD", valor: sinal(modificador) });
  const dificuldade = num(p, "dificuldade", "nd", "cd");
  if (dificuldade != null) modulos.push({ rotulo: "ND", valor: String(dificuldade), acento: "perigo" });

  const dados = numeros(p, "dados", "rolagens", "resultados");
  const efeitos = Array.isArray(p.effectsApplied) ? (p.effectsApplied as P[]) : [];
  // "maior" destaca UM dado como "o que valeu" — certo pro teste de
  // Ruptura (é literalmente o maior dado que decide) e pra expressão
  // livre sem modo (sempre soma, mas nenhum payload antigo carrega
  // `modo`, então o destaque nunca existiu pra ela — não é este ponto
  // que muda esse comportamento). ERRADO quando a própria rolagem diz
  // que o modo foi "somar" (`modo: "sum"`, gravado pela bandeja de
  // dados livre da mesa): aí TODOS os dados pesam igual, e sublinhar
  // um deles sugere que ele foi escolhido — ele não foi.
  const destacarMaior = txt(p, "modo") !== "sum";

  /**
   * INTENÇÃO acima da mecânica.
   *
   * Quem rolou "Aparar" rolou Luta por baixo — mas o cartão que diz
   * "TESTE DE PERÍCIA · LUTA" é verdadeiro e inútil: some exatamente a
   * ação que foi escolhida, e na mesa "aparei" e "testei Luta" são
   * coisas diferentes. Quando a rolagem carrega a intenção, ela manda;
   * a perícia usada continua visível no módulo ao lado, que é onde ela
   * é informação e não manchete.
   */
  const intencaoNome = txt(p, "intencaoNome");
  const intencaoTipo = txt(p, "intencaoTipo");

  const expressao = txt(p, "expressao");
  const tipoTeste =
    intencaoTipo
      ? intencaoTipo
      : entry.type === "overload_will_roll"
        ? "TESTE DE VONTADE"
        : pericia
          ? "TESTE DE PERÍCIA"
          : atributo
            ? "TESTE DE ATRIBUTO"
            // Sem atributo nem perícia é a bandeja livre: um punhado de
            // dados, não um teste "aberto" (que na régua do sistema
            // significa outra coisa — teste sem CD definida).
            : "ROLAGEM LIVRE";

  return {
    ...comum(entry),
    kind: "rolagem",
    tipoTeste,
    nome: intencaoNome ?? pericia ?? atributo ?? expressao ?? "Dados",
    modulos,
    total: num(p, "total"),
    sucesso: bool(p, "sucesso", "passou"),
    margem: txt(p, "margemRotulo", "margem", "faixa"),
    dados,
    termos: termosDoPayload(p),
    modo: txt(p, "modo") === "high" ? "high" : "sum",
    maior: destacarMaior && dados.length > 0 ? Math.max(...dados) : null,
    alvo: txt(p, "alvoNome", "targetName"),
    modificadores: efeitos
      .map((e) => ({ nome: typeof e.sourceName === "string" ? e.sourceName : "—", valor: typeof e.modifier === "number" ? e.modifier : 0 }))
      .filter((m) => m.nome !== "—" || m.valor !== 0),
    teste: montarLeituraDeTeste(p, atributo, pericia, periciaValor, modificador, dificuldade),
  };
}

/**
 * `termos` do payload da bandeja livre: um par faces/valor por dado
 * lançado. Descarta o que não for um par íntegro — meio termo com
 * `faces` ausente desenharia um dado sem forma.
 */
function termosDoPayload(p: P): { faces: number; valor: number }[] {
  const bruto = p.termos;
  if (!Array.isArray(bruto)) return [];
  const termos: { faces: number; valor: number }[] = [];
  for (const t of bruto as P[]) {
    const faces = typeof t?.faces === "number" ? t.faces : null;
    const valor = typeof t?.valor === "number" ? t.valor : null;
    if (faces == null || valor == null) continue;
    termos.push({ faces, valor });
  }
  return termos;
}

/**
 * A leitura só existe quando a rolagem É um teste (tem atributo ou
 * perícia) e o payload gravou o maior dado. Sem isso — bandeja livre,
 * ou um log antigo anterior a `maiorDado` — o card cai no desenho de
 * módulos, que continua certo pra somar dados.
 */
function montarLeituraDeTeste(
  p: P,
  atributo: string | null,
  pericia: string | null,
  periciaValor: number | null,
  modificador: number | null,
  cd: number | null,
): CartaoRolagem["teste"] {
  if (!atributo && !pericia) return null;
  const maiorDado = num(p, "maiorDado");
  if (maiorDado == null) return null;
  const classificacao = txt(p, "classificacaoMargem");
  return {
    maiorDado,
    pericia,
    periciaValor: periciaValor ?? 0,
    modificador: modificador ?? 0,
    cd,
    classificacao: (classificacao as ResultKey | null) ?? null,
  };
}

function snapshotDoPayload(p: P): SnapshotConteudo {
  const est = Array.isArray(p.estatisticas)
    ? (p.estatisticas as P[])
        .map((e) => ({ rotulo: typeof e.rotulo === "string" ? e.rotulo : "", valor: typeof e.valor === "string" ? e.valor : String(e.valor ?? "") }))
        .filter((e) => e.rotulo && e.valor)
    : [];
  const origemBruta = txt(p, "origem") ?? "oficial";
  return {
    categoria: txt(p, "categoria") ?? "",
    categoriaRotulo: txt(p, "categoriaRotulo") ?? "",
    slug: txt(p, "slug") ?? "",
    nome: txt(p, "nome") ?? "(sem nome)",
    origem: origemBruta === "homebrew" || origemBruta === "modificado" ? origemBruta : "oficial",
    origemRotulo: txt(p, "origemRotulo") ?? "Oficial",
    resumo: txt(p, "resumo") ?? "",
    descricao: txt(p, "descricao", "descricao_curta"),
    tags: lista(p, "tags"),
    estatisticas: est,
  };
}

function projetarReferencia(entry: TableLogEntry): CartaoFeed {
  return { ...comum(entry), kind: "referencia", conteudo: snapshotDoPayload(entry.payload as P) };
}

function projetarUso(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const custos: ModuloCartao[] = [];
  const pa = num(p, "paGasto", "custoPa", "pa");
  if (pa != null) custos.push({ rotulo: "PA", valor: String(pa) });
  const cargas = num(p, "cargasGastas", "cargasAtual");
  if (cargas != null) custos.push({ rotulo: "Cargas", valor: String(cargas) });
  const usos = num(p, "usosRestantes");
  if (usos != null) custos.push({ rotulo: "Usos", valor: String(usos) });
  return {
    ...comum(entry),
    kind: "uso",
    tipoUso: entry.type === "item_used" ? "item" : "talento",
    nome: txt(p, "itemNome", "talentoNome", "nome") ?? (entry.type === "item_used" ? "Item" : "Talento"),
    descricao: txt(p, "descricao", "efeito", "efeitoTexto"),
    tags: lista(p, "tags"),
    custos,
    efeito: txt(p, "resultado", "efeitoResultado"),
    restante: txt(p, "restanteRotulo", "restante", "quantidadeRestante"),
    gatilho: txt(p, "gatilho", "trigger"),
    recarga: txt(p, "recarga", "recargaRotulo"),
  };
}

function projetarAtaque(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const magica = entry.type.startsWith("spell_");
  const modAtaque: ModuloCartao[] = [];
  const dadosAtaque = numeros(p, "dadosAtaque", "atacanteDados");
  if (dadosAtaque.length > 0) dadosAtaque.forEach((d, i) => modAtaque.push({ rotulo: i === 0 ? "DADO" : `D${i + 1}`, valor: String(d) }));
  const modA = num(p, "modificadorAtaque", "atacanteModificador");
  if (modA != null) modAtaque.push({ rotulo: "MOD", valor: sinal(modA) });

  const modDefesa: ModuloCartao[] = [];
  const dadosDefesa = numeros(p, "dadosDefesa", "defensorDados");
  if (dadosDefesa.length > 0) dadosDefesa.forEach((d, i) => modDefesa.push({ rotulo: i === 0 ? "DEF" : `D${i + 1}`, valor: String(d) }));
  const modD = num(p, "modificadorDefesa", "defensorModificador");
  if (modD != null) modDefesa.push({ rotulo: "MOD", valor: sinal(modD) });

  const custos: ModuloCartao[] = [];
  const pa = num(p, "paGasto", "custoPa");
  if (pa != null) custos.push({ rotulo: "PA", valor: String(pa) });
  const mana = num(p, "manaGasta", "custoMana");
  if (mana != null) custos.push({ rotulo: "Mana", valor: String(mana), acento: "mana" });
  const municao = num(p, "municaoGasta");
  if (municao != null) custos.push({ rotulo: "Munição", valor: String(municao) });

  const acertou = bool(p, "acertou", "sucesso");
  const pvAntes = num(p, "pvAntes", "pvAnterior");
  const pvDepois = num(p, "pvDepois", "pvAtual");
  const dano = num(p, "dano", "danoTotal", "danoAplicado");

  const estado: EstadoAtaque =
    pvDepois != null ? "resolvido" : acertou === false ? "errou" : dano != null ? "aguardando_aplicacao" : "aguardando_dano";

  return {
    ...comum(entry),
    kind: "ataque",
    workflowId: txt(p, "workflowId", "attackId") ?? entry.id,
    estado,
    nome: txt(p, "armaNome", "spellNome", "magiaNome", "nome") ?? (magica ? "Ataque mágico" : "Ataque"),
    atacante: txt(p, "atacanteNome", "characterNome") ?? "—",
    tags: lista(p, "tags", "propriedades"),
    custos,
    modulosAtaque: modAtaque,
    modulosDefesa: modDefesa,
    totalAtaque: num(p, "totalAtaque", "atacanteTotal"),
    totalDefesa: num(p, "totalDefesa", "defensorTotal"),
    alvo: txt(p, "alvoNome", "defensorNome", "targetCharacterName"),
    alvoTokenId: txt(p, "alvoTokenId"),
    alvoCharacterId: txt(p, "alvoCharacterId", "defensorCharacterId", "targetCharacterId"),
    acertou,
    margem: num(p, "margem"),
    faixaMargem: txt(p, "faixaMargem", "margemRotulo", "banda"),
    dano,
    danoTipo: txt(p, "danoTipo", "tipoDano"),
    regiao: txt(p, "regiaoRotulo", "regiao"),
    mitigacao: num(p, "mitigacao", "mit"),
    pvAntes,
    pvDepois,
    magica,
  };
}

function projetarMagia(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const custos: ModuloCartao[] = [];
  const pa = num(p, "paGasto", "custoPa");
  if (pa != null) custos.push({ rotulo: "PA", valor: String(pa) });
  const mana = num(p, "manaGasta", "custoMana");
  if (mana != null) custos.push({ rotulo: "Mana", valor: String(mana), acento: "mana" });

  const est: { rotulo: string; valor: string }[] = [];
  const alcance = txt(p, "alcance");
  if (alcance) est.push({ rotulo: "Alcance", valor: alcance });
  const area = txt(p, "area");
  if (area) est.push({ rotulo: "Área", valor: area });
  const resistencia = txt(p, "resistencia", "resistenciaRotulo");
  if (resistencia) est.push({ rotulo: "Resistência", valor: resistencia });
  const danoTxt = txt(p, "danoFormula", "dano");
  if (danoTxt) est.push({ rotulo: "Dano", valor: danoTxt });

  const exigeAtaque = bool(p, "exigeAtaque", "ehAtaque") ?? entry.type === "spell_attack_used";
  const motivoManual = txt(p, "resolucaoManual", "motivoManual");

  return {
    ...comum(entry),
    kind: "magia",
    workflowId: txt(p, "workflowId", "castId") ?? entry.id,
    estado: motivoManual ? "manual" : exigeAtaque ? "aguardando_ataque" : "conjurada",
    nome: txt(p, "spellNome", "magiaNome", "nome") ?? "Magia",
    conjurador: txt(p, "characterNome", "conjuradorNome") ?? "—",
    vertente: txt(p, "vertente"),
    nivel: num(p, "nivel"),
    tags: lista(p, "tags"),
    custos,
    estatisticas: est,
    descricao: txt(p, "descricao", "efeito"),
    exigeAtaque,
    motivoManual,
  };
}

function projetarEfeito(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const t = entry.type;
  let acao: CartaoEfeito["acao"] = "aplicado";
  if (t === "condition_removed" || t === "temporary_effect_removed") acao = "removido";
  else if (t === "condition_auto_removed" || t === "temporary_effect_expired" || t === "scene_effect_expired") acao = "expirado";
  else if (t === "condition_end_round_damage") acao = "dano";

  /* Colapso, sobrecarga e descanso SAÍRAM daqui: cada um tem card
     próprio agora. O que resta é o que de fato é condição/efeito. */
  const familia: CartaoEfeito["familia"] =
    t === "scene_effect_expired" ? "cena" : t.startsWith("condition_") ? "condicao" : "temporario";

  const dano = num(p, "dano", "danoAplicado", "valor");
  const cura = num(p, "cura", "curaAplicada");
  const delta =
    cura != null
      ? { rotulo: "Cura", valor: `+${cura}`, acento: "ok" as AcentoCartao }
      : dano != null
        ? { rotulo: "Dano", valor: `−${dano}`, acento: "perigo" as AcentoCartao }
        : null;
  if (cura != null) acao = "cura";

  const nomes = lista(p, "nomes", "condicoes");
  return {
    ...comum(entry),
    kind: "efeito",
    acao,
    familia,
    nome: txt(p, "condicaoNome", "efeitoNome", "nome") ?? nomes[0] ?? "Efeito",
    fonte: txt(p, "fonteNome", "sourceName", "origem"),
    alvo: txt(p, "alvoNome", "characterNome", "targetCharacterName"),
    duracao: txt(p, "duracaoRotulo", "duracao"),
    intensidade: num(p, "intensidade", "pilha", "stacks", "nivel"),
    danoPorRodada: txt(p, "danoPorRodada", "danoRodada", "danoDado"),
    cura: txt(p, "curaRotulo", "cura", "resistencia"),
    delta,
    descricao: txt(p, "descricao", "descricao_curta"),
  };
}

/* ---- colapso · sobrecarga · descanso · ruptura --------------------- */

const FASE_COLAPSO: Record<string, FaseColapso> = {
  collapse_started: "iniciado",
  collapse_advanced: "avancado",
  collapse_stabilized: "estabilizado",
  collapse_ended: "encerrado",
  collapse_outcome: "desfecho",
};

function projetarColapso(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const bruto = txt(p, "tipo");
  return {
    ...comum(entry),
    kind: "colapso",
    fase: FASE_COLAPSO[entry.type] ?? "avancado",
    recurso: bruto === "pv" ? "PV" : bruto === "pe" ? "PE" : bruto,
    alvo: txt(p, "characterNome", "alvoNome"),
    segmento: num(p, "segmentos", "segmento"),
    /* A regra são 3 segmentos (`lib/character/collapse.ts`), mas quem
       manda é o payload: um evento gravado sob outra regra continua
       legível. */
    segmentoMax: num(p, "segmentosMax", "maxSegmentos") ?? 3,
    motivo: txt(p, "motivo"),
    desfecho: txt(p, "desfecho", "resultado"),
  };
}

function projetarSobrecarga(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  return {
    ...comum(entry),
    kind: "sobrecarga",
    alvo: txt(p, "characterNome", "alvoNome"),
    efeito: txt(p, "tipo", "efeito"),
    indice: num(p, "indice"),
    maximo: num(p, "maxSurtos") ?? 3,
    danoPsiquico: num(p, "danoPsiquico", "dano"),
    danoDado: txt(p, "danoDado"),
    rupturaPendente: bool(p, "rupturaPendente") ?? false,
  };
}

const RECURSOS_DESCANSO: [string, string][] = [["pv", "PV"], ["pe", "PE"], ["mana", "Mana"]];

function projetarDescanso(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const antes = (p.before ?? {}) as P;
  const depois = (p.after ?? {}) as P;
  const recursos = RECURSOS_DESCANSO.flatMap(([chave, rotulo]) => {
    const a = num(antes, chave);
    const d = num(depois, chave);
    /* Só o que MUDOU. Listar recurso intacto num card de recuperação é
       ruído: quem lê quer saber o que voltou. */
    if (a == null || d == null || a === d) return [];
    return [{ rotulo, antes: a, depois: d, delta: d - a }];
  });
  return {
    ...comum(entry),
    kind: "descanso",
    duracao: entry.type === "rest_long" ? "longo" : "curto",
    alvo: txt(p, "characterNome", "alvoNome"),
    recursos,
  };
}

function projetarRuptura(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  return {
    ...comum(entry),
    kind: "ruptura",
    alvo: txt(p, "characterNome", "alvoNome"),
    nivel: num(p, "ruptureLevel", "nivel"),
    integridadeAntes: num(p, "integrityBefore"),
    integridadeDepois: num(p, "integrityAfter"),
    bonusMana: num(p, "manaBonusApplied"),
  };
}

function projetarResolucao(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const brutas = Array.isArray(p.linhas) ? (p.linhas as P[]) : Array.isArray(p.efeitos) ? (p.efeitos as P[]) : [];
  const linhas = brutas.map((l) => ({
    ator: txt(l, "ator", "characterNome", "personagem") ?? "—",
    efeito: txt(l, "efeito", "nome", "condicao") ?? "—",
    resultado: txt(l, "resultado", "resumo") ?? "",
    restante: txt(l, "restante", "duracao") ?? "",
    encerrado: (bool(l, "encerrado", "expirado") ?? false) || txt(l, "restante") === "Expired",
  }));
  const rodada = num(p, "newRound", "rodada", "previousRound");
  const cena = num(p, "newScene", "cena");
  const titulo = cena != null ? `Fim da cena ${cena}` : rodada != null ? `Fim da rodada ${rodada}` : "Resolução";
  return { ...comum(entry), kind: "resolucao", titulo, linhas };
}

function projetarDivisor(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const rodada = num(p, "rodada", "newRound", "round");
  const janela = txt(p, "janelaRotulo", "janela");
  const evento = txt(p, "evento");
  const partes: string[] = [];
  if (evento === "combate_iniciado") partes.push("Combate iniciado");
  else if (evento === "combate_encerrado") partes.push("Combate encerrado");
  if (rodada != null) partes.push(`Rodada ${String(rodada).padStart(2, "0")}`);
  if (janela) partes.push(janela === "rapidos" ? "Turnos rápidos" : janela === "lentos" ? "Turnos lentos" : janela);
  const cena = num(p, "newScene");
  if (partes.length === 0 && cena != null) partes.push(`Cena ${cena}`);
  return {
    ...comum(entry),
    kind: "divisor",
    texto: (partes.join(" // ") || "Nova rodada").toUpperCase(),
    acento: evento === "combate_encerrado" ? "neutro" : "cy",
  };
}

function projetarPendencia(entry: TableLogEntry): CartaoFeed {
  const p = entry.payload as P;
  const t = entry.type;
  const titulo =
    t === "integrity_zero_pending"
      ? "Integridade zerada"
      : t === "rupture_choice_created"
        ? "Marca e traço pendentes"
        : "Teste pendente";
  const descricao =
    txt(p, "descricao", "motivo", "instrucao") ??
    (t === "integrity_zero_pending"
      ? "A Integridade chegou a zero e exige resolução do Narrador."
      : t === "rupture_choice_created"
        ? "A Ruptura exige registrar uma Marca e um Traço."
        : "Uma condição exige um teste no fim da rodada.");
  return {
    ...comum(entry),
    kind: "pendencia",
    titulo,
    descricao,
    alvo: txt(p, "characterNome", "alvoNome"),
    resolvida: false,
    resultado: null,
  };
}

/**
 * A ALLOWLIST. Fora daqui, nada entra no feed.
 *
 * Ordem de leitura: tipos de conversa, depois rolagem, depois os
 * mecânicos, depois os de combate/estrutura.
 */
export const PROJETORES: Record<string, Projetor> = {
  chat: projetarMensagem,

  rolagem_pericia: projetarRolagem,
  rolagem_expressao: projetarRolagem,
  overload_will_roll: projetarRolagem,

  compendio_compartilhado: projetarReferencia,

  item_used: projetarUso,
  talent_used: projetarUso,

  attack_resolved: projetarAtaque,
  spell_attack_resolved: projetarAtaque,
  /* Passo de aplicação de dano — compartilha `workflowId` com o ataque
     de origem, então SUBSTITUI o card em vez de criar outro (ver
     `projetarFeed`). É assim que o card "evolui" no mesmo lugar. */
  attack_damage_applied: projetarAtaque,

  spell_cast: projetarMagia,
  spell_attack_used: projetarMagia,

  condition_applied: projetarEfeito,
  condition_removed: projetarEfeito,
  condition_auto_removed: projetarEfeito,
  condition_auto_removal_undone: projetarEfeito,
  condition_end_round_damage: projetarEfeito,
  temporary_effect_added: projetarEfeito,
  temporary_effect_removed: projetarEfeito,
  temporary_effect_expired: projetarEfeito,
  scene_effect_expired: projetarEfeito,
  collapse_started: projetarColapso,
  collapse_advanced: projetarColapso,
  collapse_stabilized: projetarColapso,
  collapse_ended: projetarColapso,
  collapse_outcome: projetarColapso,

  overload_surge: projetarSobrecarga,
  overload_surge_used: projetarSobrecarga,

  rest_short: projetarDescanso,
  rest_long: projetarDescanso,

  rupture_resolved: projetarRuptura,

  round_end_processed: projetarResolucao,
  scene_end_processed: projetarResolucao,

  round_ended: projetarDivisor,
  scene_ended: projetarDivisor,
  combate_vtt: projetarDivisor,

  condition_end_round_check_created: projetarPendencia,
  integrity_zero_pending: projetarPendencia,
  rupture_choice_created: projetarPendencia,
};

/** Um tipo é projetável? (usado pelo teste puro e pelo diagnóstico) */
export function tipoNoFeed(tipo: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROJETORES, tipo);
}

/**
 * Projeta UMA entrada. `null` = fora da allowlist, e o feed nem
 * desenha um espaço vazio. É aqui que o log técnico para de vazar.
 */
export function projetarEntrada(entry: TableLogEntry): CartaoFeed | null {
  const projetor = PROJETORES[entry.type];
  if (!projetor) return null;
  try {
    return projetor(entry);
  } catch {
    // Um payload corrompido não pode derrubar o feed inteiro — a
    // entrada simplesmente não aparece (o log continua íntegro).
    return null;
  }
}

/**
 * Projeta a lista inteira, em ordem CRONOLÓGICA, e correlaciona
 * workflows: quando duas entradas compartilham `workflowId`, só a mais
 * recente sobrevive — é ela que carrega o estado atual. É o que faz o
 * ataque evoluir DENTRO do mesmo card em vez de gerar uma linha nova
 * por etapa.
 */
/**
 * Resolução → pendência que ela fecha.
 *
 * `EXCLUIDOS_DO_FEED` já dizia que estes tipos "atualizam o card de
 * pendência" — mas ninguém os atualizava: `projetarPendencia` devolvia
 * `resolvida: false` fixo e a resolução era descartada junto com os
 * outros excluídos. O card ficava âmbar para sempre, e a mesa via
 * pendência aberta que já tinha sido resolvida.
 */
const RESOLVE_PENDENCIA: Record<string, string> = {
  condition_end_round_check_resolved: "condition_end_round_check_created",
  rupture_choice_resolved: "rupture_choice_created",
};

/** Chave de correlação: personagem + tipo da pendência. */
function chaveDaPendencia(tipoPendente: string, entry: TableLogEntry): string {
  const p = entry.payload as P;
  const quem = entry.character_id ?? txt(p, "characterNome", "alvoNome") ?? "?";
  return `${tipoPendente}::${quem}`;
}

/** Texto curto do que a resolução decidiu — o que a faixa do card mostra. */
function resultadoDaResolucao(entry: TableLogEntry): string {
  const p = entry.payload as P;
  const explicito = txt(p, "resultado", "resumo");
  if (explicito) return explicito;
  const marca = txt(p, "marca");
  const traco = txt(p, "traco");
  if (marca || traco) return [marca, traco].filter(Boolean).join(" · ");
  const sucesso = bool(p, "sucesso");
  if (sucesso != null) return sucesso ? "Sucesso" : "Falha";
  return "Resolvida";
}

export function projetarFeed(logsCronologicos: readonly TableLogEntry[]): CartaoFeed[] {
  const cartoes: CartaoFeed[] = [];
  /** workflowId → índice em `cartoes`. */
  const porWorkflow = new Map<string, number>();
  /** chave de pendência → índice em `cartoes`. */
  const porPendencia = new Map<string, number>();

  for (const entry of logsCronologicos) {
    /* A resolução vem ANTES do descarte dos excluídos: ela não vira
       card, mas fecha o card que já está no feed. */
    const tipoPendente = RESOLVE_PENDENCIA[entry.type];
    if (tipoPendente) {
      const alvo = porPendencia.get(chaveDaPendencia(tipoPendente, entry));
      if (alvo != null) {
        const pendencia = cartoes[alvo];
        if (pendencia.kind === "pendencia") {
          cartoes[alvo] = { ...pendencia, resolvida: true, resultado: resultadoDaResolucao(entry) };
        }
      }
      continue;
    }

    const cartao = projetarEntrada(entry);
    if (!cartao) continue;

    if (cartao.kind === "ataque" || cartao.kind === "magia") {
      const anterior = porWorkflow.get(cartao.workflowId);
      if (anterior != null) {
        cartoes[anterior] = cartao;
        continue;
      }
      porWorkflow.set(cartao.workflowId, cartoes.length);
    }
    if (cartao.kind === "pendencia") {
      porPendencia.set(chaveDaPendencia(entry.type, entry), cartoes.length);
    }
    cartoes.push(cartao);
  }
  return cartoes;
}

/** Intervalo, em ms, dentro do qual mensagens do mesmo autor compartilham cabeçalho. */
export const JANELA_CONTINUACAO_MS = 4 * 60 * 1000;

/**
 * Uma mensagem é continuação da anterior? Só quando é do MESMO autor
 * (mesma conta E mesmo personagem), com a MESMA visibilidade e o mesmo
 * estilo, dentro da janela curta. Visibilidade e autoria diferentes
 * nunca colapsam — seria ambiguidade de privacidade.
 */
export function ehContinuacao(atual: CartaoFeed, anterior: CartaoFeed | undefined): boolean {
  if (!anterior) return false;
  if (atual.kind !== "mensagem" || anterior.kind !== "mensagem") return false;
  if (atual.estilo !== anterior.estilo) return false;
  if (atual.visibilidade !== anterior.visibilidade) return false;
  if (atual.autoria.nome !== anterior.autoria.nome) return false;
  if (atual.autoria.userId !== anterior.autoria.userId) return false;
  if (atual.autoria.characterId !== anterior.autoria.characterId) return false;
  const dt = Date.parse(atual.criadoEm) - Date.parse(anterior.criadoEm);
  return Number.isFinite(dt) && dt >= 0 && dt <= JANELA_CONTINUACAO_MS;
}

/**
 * Rótulo de visibilidade, do ponto de vista de quem lê.
 *
 * CORREÇÃO de um rótulo errado: `private` NÃO é "só eu". A regra real
 * de `listLogsForViewer` é autor + narrador dono da mesa. Para o
 * jogador isso é "somente narrador"; para o narrador, "reservada".
 */
export function rotuloVisibilidade(v: TableLogVisibility, papel: "narrator" | "player"): string | null {
  if (v === "public") return null;
  if (v === "gm") return "Narrador";
  return papel === "player" ? "Somente Narrador" : "Reservada";
}

/** Acento de cada tipo de card — a única dimensão de cor "por tipo". */
/** As seis faixas na paleta do painel — espelho de `RESULTS`. */
const ACENTO_DA_FAIXA: Record<ResultKey, AcentoCartao> = {
  sucesso_critico: "ok",
  sucesso_padrao: "cy",
  sucesso_limitado: "am",
  falha_limitada: "magenta",
  falha: "perigo",
  falha_critica: "perigo",
};

export function acentoDoCartao(cartao: CartaoFeed): AcentoCartao {
  switch (cartao.kind) {
    case "mensagem":
      return cartao.estilo === "narracao" ? "am" : "neutro";
    case "rolagem":
      /* Num TESTE a espinha segue a CLASSIFICAÇÃO, a mesma que a faixa
         usa — o card é uma unidade de leitura, e espinha verde com
         faixa ciana fazia o olho procurar uma diferença que não existe.
         Os hexes batem exatamente com os de `RESULTS`, então as duas
         pontas do card saem na mesma cor, não em duas parecidas.
         Sem classificação (bandeja livre, ou teste sem CD) sobra o
         veredito binário, que é tudo que o evento registrou — e ali o
         sucesso é CIANO, não verde, pela mesma razão que na faixa
         (`FaixaSoma`): verde é o topo, reservado ao crítico, e uma soma
         contra CD não tem crítico. Verde aqui pintava de "crítico"
         qualquer acerto raspado, e ainda punha espinha verde ao lado de
         faixa ciana no mesmo card. */
      if (cartao.teste?.classificacao) return ACENTO_DA_FAIXA[cartao.teste.classificacao];
      if (cartao.teste) return "neutro";
      return cartao.sucesso === false ? "perigo" : "cy";
    case "referencia":
      return "cy";
    case "uso":
      return cartao.tipoUso === "talento" ? "mana" : "cy";
    case "ataque":
      return cartao.magica ? "mana" : cartao.acertou === false ? "perigo" : cartao.estado === "resolvido" ? "perigo" : "cy";
    case "magia":
      return "mana";
    case "efeito":
      return cartao.acao === "cura" ? "ok" : cartao.acao === "dano" ? "perigo" : cartao.acao === "expirado" || cartao.acao === "removido" ? "neutro" : "am";
    case "colapso":
      /* Estabilizado e encerrado são ALÍVIO — o acento muda junto, senão
         o feed fica vermelho depois que o perigo já passou. */
      return cartao.fase === "estabilizado" || cartao.fase === "encerrado" ? "ok" : "perigo";
    case "sobrecarga":
      return cartao.rupturaPendente ? "perigo" : "mana";
    case "descanso":
      return "ok";
    case "ruptura":
      return "perigo";
    case "resolucao":
      return "cy";
    case "divisor":
      return cartao.acento;
    case "pendencia":
      return "am";
  }
}
