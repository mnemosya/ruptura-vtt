"use server";

/**
 * ROLAGEM DE VERDADE na mesa — a ponte que faltava entre a ferramenta
 * "Rolar Dados" do VTT e o sistema real de Ruptura.
 *
 * Antes desta ação, o rolador do VTT era uma maquete: cinco atributos
 * inventados ("Potência/Reflexos/Vigor/Intelecto/Presença"), seis
 * perícias fixas, e um resultado que morria no `useState` do
 * componente — nunca chegava ao `table_logs`, nunca aparecia no Chat,
 * nunca soube de que personagem se tratava.
 *
 * O QUE VEM DO SERVIDOR (nunca do browser):
 *   · quem pode rolar como qual personagem (mesma regra do Chat:
 *     narrador usa qualquer um da campanha, jogador só os que controla);
 *   · o NOME do personagem gravado no card;
 *   · o valor do ATRIBUTO e o da PERÍCIA — relidos de `characters`
 *     pela RLS a cada rolagem, então uma ficha adulterada no cliente
 *     não vira bônus;
 *   · a QUANTIDADE de dados (tem que bater com o atributo lido do
 *     banco — não adianta mandar vinte d8);
 *   · a aritmética inteira e a faixa de margem (`resolverPericia`, a
 *     mesma função que o Console usa);
 *   · a visibilidade (`gm` só existe pro narrador).
 *
 * O QUE VEM DO CLIENTE, E POR QUÊ: as FACES dos dados. A simulação
 * física roda no browser (é ela que o jogador vê), e o produto exige
 * que o valor saia da face que ficou pra cima quando o corpo dorme —
 * nunca sorteado antes e "encenado" depois. Então a face é, por
 * construção, informação do cliente. O que dá pra checar, é checado:
 * cada dado precisa ser inteiro de 1 a 8 e a contagem precisa bater
 * com o atributo real. Uma mesa que precise de dado inauditável tem
 * que rolar pelo Console (RNG no servidor), não por aqui.
 */

import { getCurrentUser } from "../../../../../../lib/auth/session";
import {
  getCharacterForCampaign,
  listCharactersForNarratorCampaign,
  listControlledCharacters,
} from "../../../../../../lib/character/storage";
import { normalizeCharacter } from "../../../../../../lib/character";
import type { AttributeDefinition, CharacterRulesPayload, SkillDefinition } from "../../../../../../lib/character";
import { getCharacterRules } from "../../../../../../lib/content";
import { resolverPericia } from "../../../../../../lib/dice";
import { addLog, listCampaignRoster } from "../../../../../../lib/table/storage";
import { TABLE_LOG_VISIBILITIES, type TableLogEntry, type TableLogVisibility } from "../../../../../../lib/table";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

/** Teto do modificador manual — protege o payload e a leitura do card; fora disso é recusado, nunca truncado em silêncio. */
const MODIFICADOR_MAX = 20;
/** Teto da CD aceita. Acima disso não é dificuldade, é digitação errada. */
const CD_MAX = 99;
/** Teto de dados numa rolagem livre — o palco (e a leitura) não comportam mais que isso. */
const DADOS_LIVRES_MAX = 20;

export interface AtributoRolagem {
  id: string;
  nome: string;
  valor: number;
}

export interface PericiaRolagem {
  id: string;
  nome: string;
  valor: number;
  /** Atributo que a perícia usa por padrão — deixa o rolador pré-selecionar o par certo. */
  atributoPrimario: string;
}

export interface FichaRolagem {
  characterId: string;
  nome: string;
  atributos: AtributoRolagem[];
  pericias: PericiaRolagem[];
}

export interface ContextoRolagem {
  /** Personagens que esta conta pode usar como identidade da rolagem. */
  personagens: { id: string; nome: string }[];
  /** Ficha do personagem pedido — `null` quando nenhum foi pedido ou o acesso não permite. */
  ficha: FichaRolagem | null;
  /** Narrador pode rolar escondido (`gm`); jogador, no máximo `private`. */
  ehNarrador: boolean;
}

/**
 * Nomes de exibição quando a campanha ainda não publicou
 * `regras_personagem`. Os IDs são os do modelo real
 * (`CharacterAttributes`), não uma invenção deste arquivo — o fallback
 * cobre a falta do CONTEÚDO, nunca a falta da regra.
 */
const ATRIBUTOS_PADRAO: { id: "corpo" | "mente" | "animo"; nome: string }[] = [
  { id: "corpo", nome: "Corpo" },
  { id: "mente", nome: "Mente" },
  { id: "animo", nome: "Ânimo" },
];

/**
 * `CharacterAttributes` é um objeto FECHADO (corpo/mente/animo) — ler
 * por chave dinâmica exige a ponte explícita, não um cast que finge
 * que ele tem índice de string.
 */
function valorDeAtributo(atributos: Record<"corpo" | "mente" | "animo", number>, id: string): number {
  if (id === "corpo" || id === "mente" || id === "animo") return atributos[id];
  return 0;
}

function montarFicha(
  characterId: string,
  nomeDoBanco: string,
  payload: unknown,
  regras: CharacterRulesPayload | null,
): FichaRolagem {
  const personagem = normalizeCharacter(payload);
  const defsAtributo: AttributeDefinition[] | undefined = regras?.atributos;
  const defsPericia: SkillDefinition[] | undefined = regras?.pericias;

  const atributos: AtributoRolagem[] = (defsAtributo && defsAtributo.length > 0
    ? defsAtributo.map((d) => ({ id: d.id, nome: d.nome }))
    : ATRIBUTOS_PADRAO
  ).map(({ id, nome }) => ({
    id,
    nome,
    valor: Math.max(0, Math.trunc(valorDeAtributo(personagem.atributos, id))),
  }));

  // Sem catálogo de perícias publicado, as perícias DA FICHA ainda
  // servem: o personagem tem os valores, só não temos nome bonito.
  const pericias: PericiaRolagem[] = (defsPericia && defsPericia.length > 0
    ? defsPericia.map((d) => ({ id: d.id, nome: d.nome, atributoPrimario: d.atributo_primario }))
    : Object.keys(personagem.pericias).map((id) => ({ id, nome: id, atributoPrimario: "" }))
  ).map(({ id, nome, atributoPrimario }) => ({
    id,
    nome,
    atributoPrimario,
    valor: Math.max(0, Math.trunc(personagem.pericias[id] ?? 0)),
  }));

  return { characterId, nome: nomeDoBanco, atributos, pericias };
}

/**
 * Contexto do rolador: identidades disponíveis e, se um personagem for
 * pedido, a ficha dele já reduzida ao que a rolagem precisa. Lido ao
 * abrir a ferramenta e a cada troca de personagem — nunca embutido no
 * primeiro render do VTT.
 */
export async function lerContextoRolagemAction(
  campaignId: string,
  characterId: string | null,
): Promise<ResultadoPainel<ContextoRolagem>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const ehNarrador = v.acesso.role === "narrator";

  try {
    const [personagens, regrasDoc, personagemPedido] = await Promise.all([
      ehNarrador ? listCharactersForNarratorCampaign(campaignId) : listControlledCharacters(campaignId),
      getCharacterRules().catch(() => null),
      characterId ? getCharacterForCampaign(campaignId, characterId) : Promise.resolve(null),
    ]);
    const regras = (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null;

    return {
      ok: true,
      dados: {
        personagens: personagens.filter((p) => !p.archived_at).map((p) => ({ id: p.id, nome: p.name })),
        ficha:
          personagemPedido && !personagemPedido.archived_at
            ? montarFicha(personagemPedido.id, personagemPedido.name, personagemPedido.payload, regras)
            : null,
        ehNarrador,
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar o contexto da rolagem.") };
  }
}

/** Visibilidade revalidada: valor fora do enum vira pública; `gm` só pro narrador. */
function visibilidadeSegura(pedida: string, ehNarrador: boolean): TableLogVisibility {
  const valida = (TABLE_LOG_VISIBILITIES as readonly string[]).includes(pedida)
    ? (pedida as TableLogVisibility)
    : "public";
  return valida === "gm" && !ehNarrador ? "private" : valida;
}

function inteiroNaFaixa(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n >= min && n <= max ? n : null;
}

export interface RegistrarRolagemPericiaParams {
  campaignId: string;
  characterId: string;
  atributoId: string;
  /** `null` = rolagem sem perícia (o sistema trata o bônus como 0). */
  periciaId: string | null;
  modificador: number;
  /** CD do teste. `null` = rolagem aberta, sem sucesso/falha. */
  cd: number | null;
  /** Faces lidas da física, na ordem em que os corpos pararam. */
  dados: number[];
  visibilidade: TableLogVisibility;
  /**
   * De onde veio a rolagem — o rótulo que o feed mostra e a etiqueta
   * que o log guarda.
   *
   * Existe porque esta ação deixou de ser só do rolador 3D: o Console
   * do Personagem rola pelas mesmas regras e precisa cair no MESMO
   * `table_logs`, com o mesmo formato, senão a mesa teria dois
   * vocabulários de rolagem. O padrão continua sendo o rolador, então
   * nenhuma chamada existente muda.
   */
  origem?: { rotulo: string; source: string };
  /**
   * O que a pessoa QUIS rolar, quando a perícia usada não é a
   * resposta: "Aparar" testa Luta, "Esquivar" testa Reflexos. Sem
   * isto o feed mostra "TESTE DE PERÍCIA · LUTA" — verdadeiro e
   * inútil, porque some justamente a ação que foi escolhida.
   */
  intencao?: { tipo: string; nome: string } | null;
}

const ORIGEM_PADRAO = { rotulo: "Mesa — Rolar Dados", source: "vtt_mesa_dados" } as const;

/**
 * Grava a rolagem de perícia. Tudo que dá pra reconferir é reconferido
 * aqui — só as faces vêm do cliente (ver o cabeçalho do arquivo).
 */
export async function registrarRolagemPericiaAction(
  params: RegistrarRolagemPericiaParams,
): Promise<ResultadoPainel<TableLogEntry>> {
  const v = await exigirAcessoPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const ehNarrador = v.acesso.role === "narrator";

  try {
    const personagem = await getCharacterForCampaign(params.campaignId, params.characterId);
    if (!personagem) return { ok: false, erro: "Você não pode rolar por este personagem." };
    if (personagem.archived_at) return { ok: false, erro: "Este personagem está arquivado." };

    const regrasDoc = await getCharacterRules().catch(() => null);
    const ficha = montarFicha(
      personagem.id,
      personagem.name,
      personagem.payload,
      (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null,
    );

    const atributo = ficha.atributos.find((a) => a.id === params.atributoId);
    if (!atributo) return { ok: false, erro: "Atributo desconhecido para este personagem." };
    const pericia = params.periciaId ? ficha.pericias.find((p) => p.id === params.periciaId) : null;
    if (params.periciaId && !pericia) return { ok: false, erro: "Perícia desconhecida para este personagem." };

    const modificador = inteiroNaFaixa(params.modificador, -MODIFICADOR_MAX, MODIFICADOR_MAX);
    if (modificador == null) return { ok: false, erro: `Modificador fora da faixa (−${MODIFICADOR_MAX} a +${MODIFICADOR_MAX}).` };
    const cd = params.cd == null ? null : inteiroNaFaixa(params.cd, 1, CD_MAX);
    if (params.cd != null && cd == null) return { ok: false, erro: `CD fora da faixa (1 a ${CD_MAX}).` };

    // Os dados: a contagem tem que ser a do ATRIBUTO LIDO DO BANCO, e
    // cada face um d8 de verdade. É o teto do que dá pra validar de
    // uma simulação que roda no cliente.
    const dados = Array.isArray(params.dados) ? params.dados.map((d) => inteiroNaFaixa(d, 1, 8)) : [];
    if (dados.length !== atributo.valor || dados.some((d) => d == null)) {
      return {
        ok: false,
        erro: `Dados inconsistentes: ${atributo.nome} ${atributo.valor} pede ${atributo.valor} d8 entre 1 e 8.`,
      };
    }

    const resultado = resolverPericia(
      {
        atributoId: atributo.id,
        atributoNome: atributo.nome,
        atributoValor: atributo.valor,
        periciaId: pericia?.id,
        periciaNome: pericia?.nome,
        periciaValor: pericia?.valor ?? 0,
        modificador,
        cd: cd ?? undefined,
      },
      dados as number[],
    );

    const entrada = await addLog({
      campaignId: params.campaignId,
      characterId: personagem.id,
      type: "rolagem_pericia",
      visibility: visibilidadeSegura(params.visibilidade, ehNarrador),
      payload: {
        // Mesmos campos que a aba Rolagens do Console grava — um
        // formato só de rolagem no `table_logs`, não dois.
        characterId: personagem.id,
        characterNome: personagem.name,
        atributo: resultado.atributoNome,
        atributoValor: resultado.atributoValor,
        pericia: resultado.periciaNome ?? null,
        periciaValor: resultado.periciaValor,
        modificador: resultado.modificador,
        dados: resultado.dados,
        maiorDado: resultado.maiorDado,
        total: resultado.total,
        cd: resultado.cd ?? null,
        sucesso: resultado.sucesso ?? null,
        margem: resultado.margem ?? null,
        classificacaoMargem: resultado.classificacaoMargem ?? null,
        // O feed lê a margem como RÓTULO (`projetarRolagem` usa `txt`);
        // `margem` numérica sozinha não aparecia no card.
        margemRotulo: resultado.classificacaoMargem ? ROTULO_MARGEM[resultado.classificacaoMargem] : null,
        intencaoTipo: params.intencao?.tipo ?? null,
        intencaoNome: params.intencao?.nome ?? null,
        origem: (params.origem ?? ORIGEM_PADRAO).rotulo,
        source: (params.origem ?? ORIGEM_PADRAO).source,
      },
    });
    return { ok: true, dados: entrada };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao registrar a rolagem.") };
  }
}

const ROTULO_MARGEM: Record<string, string> = {
  falha_critica: "Falha Crítica",
  falha: "Falha",
  falha_limitada: "Falha Limitada",
  sucesso_limitado: "Sucesso Limitado",
  sucesso_padrao: "Sucesso Padrão",
  sucesso_critico: "Sucesso Crítico",
};

export interface RegistrarRolagemLivreParams {
  campaignId: string;
  /** Identidade opcional — sem personagem, a autoria é a conta (ou "Narrador"). */
  characterId: string | null;
  /** Faces lidas da física, pareadas com o tipo de dado que as produziu. */
  dados: { faces: number; valor: number }[];
  modificador: number;
  /** `high` = usa o maior dado (teste), `sum` = soma tudo. */
  modo: "sum" | "high";
  /**
   * CD opcional, igual à do teste de Ruptura. `null` = sem CD definida.
   *
   * Aqui ela só decide SUCESSO (total ≥ CD) — nunca faixa de margem: as
   * seis faixas são a regra do teste de d8, e uma soma de d4+d20 não é
   * aquele teste. Classificar margem aqui seria inventar regra.
   */
  cd: number | null;
  visibilidade: TableLogVisibility;
}

/**
 * Grava a rolagem livre (bandeja: d4…d20 em qualquer combinação) como
 * `rolagem_expressao` — o mesmo tipo que o Console usa pra expressões,
 * então o feed já sabe desenhar.
 */
export async function registrarRolagemLivreAction(
  params: RegistrarRolagemLivreParams,
): Promise<ResultadoPainel<TableLogEntry>> {
  const v = await exigirAcessoPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const ehNarrador = v.acesso.role === "narrator";

  try {
    const lancados = Array.isArray(params.dados) ? params.dados : [];
    if (lancados.length === 0) return { ok: false, erro: "Nenhum dado na rolagem." };
    if (lancados.length > DADOS_LIVRES_MAX) return { ok: false, erro: `No máximo ${DADOS_LIVRES_MAX} dados por rolagem.` };
    for (const d of lancados) {
      const faces = inteiroNaFaixa(d?.faces, 2, 100);
      const valor = inteiroNaFaixa(d?.valor, 1, faces ?? 0);
      if (faces == null || valor == null) return { ok: false, erro: "Dados inconsistentes na rolagem livre." };
    }
    const modificador = inteiroNaFaixa(params.modificador, -MODIFICADOR_MAX, MODIFICADOR_MAX);
    if (modificador == null) return { ok: false, erro: `Modificador fora da faixa (−${MODIFICADOR_MAX} a +${MODIFICADOR_MAX}).` };
    const modo = params.modo === "high" ? "high" : "sum";
    const cd = params.cd == null ? null : inteiroNaFaixa(params.cd, 1, CD_MAX);
    if (params.cd != null && cd == null) return { ok: false, erro: `CD fora da faixa (1 a ${CD_MAX}).` };

    let characterId: string | null = null;
    let characterNome: string | null = null;
    if (params.characterId) {
      const personagem = await getCharacterForCampaign(params.campaignId, params.characterId);
      if (!personagem) return { ok: false, erro: "Você não pode rolar por este personagem." };
      if (personagem.archived_at) return { ok: false, erro: "Este personagem está arquivado." };
      characterId = personagem.id;
      characterNome = personagem.name;
    }

    let autorNome = characterNome;
    let autorTipo: "personagem" | "narrador" | "jogador" = "personagem";
    if (!autorNome) {
      if (ehNarrador) {
        autorNome = "Narrador";
        autorTipo = "narrador";
      } else {
        const usuario = await getCurrentUser();
        const roster = await listCampaignRoster(params.campaignId);
        autorNome = (usuario ? roster.find((r) => r.userId === usuario.id)?.displayName : null) ?? "Jogador";
        autorTipo = "jogador";
      }
    }

    const valores = lancados.map((d) => Math.trunc(d.valor));
    const base = modo === "high" ? Math.max(...valores) : valores.reduce((a, b) => a + b, 0);
    const total = base + modificador;
    // Expressão canônica no formato que `rollExpression` aceita — o
    // card mostra "3d8+1d6+2", não uma lista solta de números.
    const porFaces = new Map<number, number>();
    for (const d of lancados) porFaces.set(d.faces, (porFaces.get(d.faces) ?? 0) + 1);
    const termos = [...porFaces.entries()].sort((a, b) => a[0] - b[0]).map(([faces, qtd]) => `${qtd}d${faces}`);
    const expressao =
      termos.join("+") + (modificador !== 0 ? (modificador > 0 ? `+${modificador}` : `${modificador}`) : "");

    const entrada = await addLog({
      campaignId: params.campaignId,
      characterId: characterId ?? undefined,
      type: "rolagem_expressao",
      visibility: visibilidadeSegura(params.visibilidade, ehNarrador),
      payload: {
        characterId,
        characterNome,
        autorNome,
        autorTipo,
        expressao,
        // Números puros: é o que `projetarRolagem` lê pra desenhar os
        // dados no card (o formato de termos do Console não aparece lá).
        dados: valores,
        termos: lancados.map((d) => ({ faces: d.faces, valor: d.valor })),
        modificador,
        modo,
        total,
        cd,
        sucesso: cd == null ? null : total >= cd,
        source: "vtt_mesa_dados",
      },
    });
    return { ok: true, dados: entrada };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao registrar a rolagem.") };
  }
}
