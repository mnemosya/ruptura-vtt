"use server";

/**
 * Envio de mensagem pelo Chat do painel da Mesa.
 *
 * Por que uma ação PRÓPRIA em vez de o componente chamar `addLog`
 * direto (como a aba Mesa da ficha faz): a AUTORIA precisa ser
 * resolvida no servidor. `append_table_log` (migration 0057) já
 * garante o essencial — o autor da linha é sempre `auth.uid()`, e um
 * `p_character_id` que a conta não possa gerenciar é recusado
 * (`can_manage_character`) — mas o NOME que o cartão exibe vinha do
 * payload, isto é, do browser. Um cliente adulterado podia gravar uma
 * mensagem sua com `characterNome: "Narrador"`.
 *
 * Aqui o nome nunca vem do cliente: personagem é relido de
 * `characters` (pela RLS, então só se a conta puder mesmo vê-lo) e o
 * nome da conta vem de `list_campaign_roster`. O cliente só escolhe
 * QUAL identidade quer usar — o servidor decide se pode e como ela se
 * chama.
 *
 * Visibilidade também é revalidada: jogador nunca grava `gm`, mesmo
 * mandando `gm` na chamada.
 */

import { getCurrentUser } from "../../../../../../lib/auth/session";
import { getCharacterForCampaign, listControlledCharacters, listCharactersForNarratorCampaign } from "../../../../../../lib/character/storage";
import { addLog, listCampaignRoster } from "../../../../../../lib/table/storage";
import { TABLE_LOG_VISIBILITIES, type TableLogEntry, type TableLogVisibility } from "../../../../../../lib/table";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";
import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import { getCharacterRules } from "../../../../../../lib/content";
import type { CharacterRulesPayload } from "../../../../../../lib/character";
import { getSpellCostChoice, getVertenteLevel, normalizeCharacter, normalizeSpellContent } from "../../../../../../lib/character";
import { listSpellsEffective } from "../../../../../../lib/campaignContent";
import { montarAbaAcoes, type CatalogoAcoesV12 } from "../../../../../../lib/character/abaAcoes";
import type { EtapaComando, OpcaoComando } from "../feed/comandoConteudo";
import acoesV12 from "../../../../../../../content/v12/db_acoes_v1_2.json";

/** Teto de tamanho de uma mensagem — protege o payload jsonb e a renderização; o excedente é recusado, nunca truncado em silêncio. */
const MAX_CARACTERES_MENSAGEM = 2000;

export interface IdentidadeDisponivel {
  id: string;
  nome: string;
}

export interface ContextoChatPainel {
  /** Nome público da conta logada nesta campanha (roster) — nunca e-mail, nunca UUID. */
  nomeDaConta: string;
  /**
   * Personagens que a conta pode usar como identidade AQUI: narrador,
   * os personagens não arquivados da campanha (inclui PNs — é ele que
   * os interpreta); jogador, só os que controla.
   */
  personagens: IdentidadeDisponivel[];
  /** Catálogo publicado para reconhecer comandos mesmo sem personagem escolhido. */
  pericias?: { id: string; nome: string; atributoPrimario?: string; atributosAlternativos?: { atributo: string; contexto: string }[] }[];
}

export interface OpcoesComandoChat {
  versao?: 2;
  acoes: OpcaoComando[];
  magias: OpcaoComando[];
}

function custoAcao(acao: CatalogoAcoesV12["acoes"][number]): string {
  if (acao.custo.pa_preparado) return "1+ PA";
  if (acao.custo.proprio) return "PA —";
  const valores = (acao.opcoes?.length ? acao.opcoes.map((o) => o.custo.pa ?? acao.custo.pa ?? 0) : [acao.custo.pa ?? 0]);
  const min = Math.min(...valores), max = Math.max(...valores, acao.custo.pa_max ?? 0);
  return `${min}${acao.custo.repeticao_incremento ? "+" : max > min ? `–${max}` : ""} PA`;
}

function custoManaMagia(escolha: ReturnType<typeof getSpellCostChoice>, custo: number | null): string {
  if (escolha?.tipo === "valor") return `${escolha.min}${escolha.max == null ? "+" : escolha.max > escolha.min ? `–${escolha.max}` : ""} Mana`;
  if (escolha?.tipo === "nivel") {
    const valores = escolha.tabela.linhas.map((l) => l.mana).filter((n): n is number => n != null);
    if (valores.length) { const min = Math.min(...valores), max = Math.max(...valores); return `${min}${max > min ? `–${max}` : ""} Mana`; }
  }
  return custo == null ? "Mana variável" : `${custo} Mana`;
}

/** Opções efetivas da identidade atual; nunca oferece magia não aprendida. */
export async function lerOpcoesComandoChatV2Action(campaignId: string, characterId: string): Promise<ResultadoPainel<OpcoesComandoChat>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const permitidos = v.acesso.role === "narrator" ? null : await listControlledCharacters(campaignId, { somenteEditar: true });
    if (permitidos && !permitidos.some((p) => p.id === characterId)) return { ok: false, erro: "Você não pode agir por este personagem." };
    const personagem = await getCharacterForCampaign(campaignId, characterId);
    if (!personagem || personagem.archived_at) return { ok: false, erro: "Personagem indisponível." };
    const ficha = normalizeCharacter(personagem.payload);
    const aba = montarAbaAcoes(acoesV12 as unknown as CatalogoAcoesV12, ficha, { paMax: 0, reacoesPorRodada: 0 });
    const aprendidas = new Set((ficha.magias_aprendidas ?? []).map((m) => m.spellSlug));
    const docs = await listSpellsEffective(campaignId).catch(() => []);
    return { ok: true, dados: {
      versao: 2,
      acoes: aba.grupos.flatMap((g) => g.itens.map((i) => ({
        id: i.chave, nome: i.acao.nome, detalhe: g.nome,
        identidade: { familia: "a" as const, cena: i.acao.cena, grupo: i.acao.grupo, slug: i.acao.slug, classe: !!i.acao.classe },
        custo: { pa: custoAcao(i.acao), extra: i.acao.custo.reacao ? `${i.acao.custo.reacao} Reação` : i.acao.custo.ram ? `${i.acao.custo.ram} RAM` : i.acao.custo.proprio ? "Custo próprio" : undefined },
        custosPorComplemento: Object.fromEntries((i.acao.opcoes ?? []).map((o) => [o.nome, { pa: `${o.custo.pa ?? i.acao.custo.pa ?? 0}${i.acao.custo.repeticao_incremento ? "+" : ""} PA` }])),
        complementos: i.acao.opcoes?.map((o) => o.nome) ?? (i.acao.teste?.pericias === "qualquer"
          ? [] : (i.acao.teste?.pericias?.length ?? 0) > 1
            ? (i.acao.teste?.pericias as string[]).map((id) => id)
            : []),
      }))),
      magias: docs.map((doc) => normalizeSpellContent(doc.payload as Record<string, unknown>))
        .filter((s) => s.status === "published" && aprendidas.has(s.slug))
        .map((s) => {
          const escolha = getSpellCostChoice(s);
          const etapas: EtapaComando[] = [];
          if (escolha?.tipo === "nivel") {
            const nivelVertente = getVertenteLevel(ficha, s.vertente);
            etapas.push({ rotulo: "NÍVEL DA MAGIA", opcoes: escolha.tabela.linhas
              .filter((l) => l.mana != null && (nivelVertente == null || l.nivel <= nivelVertente))
              .map((l) => ({ codigo: `nivel ${l.nivel}`, nome: `Nível ${l.nivel}`, detalhe: `${l.mana} Mana`, custo: { mana: `${l.mana} Mana` } })) });
          } else if (escolha?.tipo === "valor") {
            etapas.push({ rotulo: "MANA INVESTIDA", opcoes: [{ codigo: `mana ${escolha.min}`, nome: `${escolha.min} Mana`, detalhe: escolha.max == null ? "MÍNIMO · DIGITE OUTRO VALOR" : `FAIXA ${escolha.min}–${escolha.max}`, custo: { mana: `${escolha.min} Mana` } }],
              valorLivre: { prefixo: "mana", min: escolha.min, max: escolha.max } });
          }
          for (const e of s.estatisticas.escolhasConjuracao ?? []) {
            etapas.push({ rotulo: `ESCOLHA ${e.rotulo.toLocaleUpperCase("pt-BR")}`, opcoes: e.opcoes.map((o) => ({ codigo: `${e.id}=${o.id}`, nome: o.nome, detalhe: o.resumo })) });
          }
          return { id: s.slug, nome: s.nome, detalhe: `${s.vertente} · nível ${s.estatisticas.nivel}`,
            identidade: { familia: "m" as const, vertente: s.vertente },
            etapas,
            custo: { pa: `${s.estatisticas.custo_pa} PA`, mana: custoManaMagia(escolha, s.estatisticas.custo_mana) },
            custosPorComplemento: escolha?.tipo === "nivel"
              ? Object.fromEntries(escolha.tabela.linhas.map((l) => [`nivel ${l.nivel}`, { mana: l.mana == null ? "Mana variável" : `${l.mana} Mana` }]))
              : {},
            complementos: escolha?.tipo === "nivel" ? escolha.tabela.linhas.map((l) => `nivel ${l.nivel}`)
              : escolha?.tipo === "valor" ? [`mana ${escolha.min}`]
              : s.estatisticas.escolhasConjuracao?.[0]?.opcoes.map((o) => `${s.estatisticas.escolhasConjuracao?.[0].id}=${o.id}`) ?? [] };
        }),
    } };
  } catch (e) { return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar ações e magias.") }; }
}

/**
 * Contexto de autoria do Chat — quem eu sou e com quem posso falar.
 * Lido ao abrir a aba e ao a janela recuperar o foco; nunca embutido
 * no primeiro render do VTT (o painel carrega sob demanda).
 */
export async function lerContextoChatAction(campaignId: string): Promise<ResultadoPainel<ContextoChatPainel>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };

  try {
    const usuario = await getCurrentUser();
    const [roster, personagens, regrasDoc] = await Promise.all([
      listCampaignRoster(campaignId),
      v.acesso.role === "narrator" ? listCharactersForNarratorCampaign(campaignId) : listControlledCharacters(campaignId, { somenteEditar: true }),
      getCharacterRules().catch(() => null),
    ]);
    const minhaLinha = usuario ? roster.find((r) => r.userId === usuario.id) : undefined;
    return {
      ok: true,
      dados: {
        nomeDaConta: minhaLinha?.displayName ?? (v.acesso.role === "narrator" ? "Narrador" : "Jogador"),
        personagens: personagens.filter((p) => !p.archived_at).map((p) => ({ id: p.id, nome: p.name })),
        pericias: ((regrasDoc?.payload as CharacterRulesPayload | undefined)?.pericias ?? []).map((p) => ({ id: p.id, nome: p.nome, atributoPrimario: p.atributo_primario, atributosAlternativos: p.atributos_alternativos })),
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar o contexto do Chat.") };
  }
}

export interface EnviarMensagemParams {
  campaignId: string;
  texto: string;
  /** Identidade pedida. `null` = falar como Narrador (narrador) ou como a própria conta (jogador). */
  characterId: string | null;
  visibilidade: TableLogVisibility;
  /** `true` = fala de cena do narrador (renderizada como narração). Ignorado para jogador. */
  narracao?: boolean;
  /** Imagem já enviada (`finalizarUploadChatAction` ou reaproveitada). Com ela, o texto vira legenda opcional. */
  imagem?: { id: string; largura: number | null; altura: number | null } | null;
}

/**
 * Grava a mensagem. Devolve a LINHA criada — o Chat usa o `id` real
 * dela pra descartar a bolha otimista quando o eco do Realtime chegar,
 * sem nunca desenhar a mesma mensagem duas vezes.
 */
function medidaSegura(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 20000 ? Math.round(n) : null;
}

export async function enviarMensagemChatAction(params: EnviarMensagemParams): Promise<ResultadoPainel<TableLogEntry>> {
  const v = await exigirAcessoPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const ehNarrador = v.acesso.role === "narrator";

  const texto = params.texto.trim();
  const imagem = params.imagem ?? null;
  if (!texto && !imagem) return { ok: false, erro: "Mensagem vazia." };
  if (texto.length > MAX_CARACTERES_MENSAGEM) {
    return { ok: false, erro: `Mensagem longa demais (máximo ${MAX_CARACTERES_MENSAGEM} caracteres).` };
  }

  // Visibilidade: valor fora do enum vira "public"; "gm" só existe pro
  // narrador. Nunca aceita o que o cliente mandou sem checar.
  let visibilidade: TableLogVisibility = (TABLE_LOG_VISIBILITIES as readonly string[]).includes(params.visibilidade)
    ? params.visibilidade
    : "public";
  if (visibilidade === "gm" && !ehNarrador) visibilidade = "private";

  try {
    // A imagem tem de ser de QUEM manda: enviada por ela para o chat, ou
    // que ela já pode ver. Um id qualquer da campanha (um mapa escondido)
    // viraria visível para a mesa só por ser citado (migration 0153).
    if (imagem) {
      const client = await getScopedTableClient();
      const { data: pode, error } = await client.rpc("pode_anexar_imagem_chat", {
        p_campaign_id: params.campaignId,
        p_asset_id: imagem.id,
      });
      if (error || pode !== true) return { ok: false, erro: "Não foi possível anexar esta imagem." };
    }

    // Autoria. `characterId` só é aceito depois de reler o personagem
    // pela RLS — quem não pode lê-lo recebe `null` (RLS filtra a linha)
    // e a chamada é recusada aqui, antes de chegar na RPC.
    let characterId: string | null = null;
    let characterNome: string | null = null;
    if (params.characterId) {
      const personagem = await getCharacterForCampaign(params.campaignId, params.characterId);
      if (!personagem) return { ok: false, erro: "Você não pode falar como este personagem." };
      if (personagem.archived_at) return { ok: false, erro: "Este personagem está arquivado." };
      characterId = personagem.id;
      characterNome = personagem.name;
    }

    let autorNome: string;
    let autorTipo: "personagem" | "narrador" | "jogador";
    if (characterNome) {
      autorNome = characterNome;
      autorTipo = "personagem";
    } else if (ehNarrador) {
      autorNome = "Narrador";
      autorTipo = "narrador";
    } else {
      const usuario = await getCurrentUser();
      const roster = await listCampaignRoster(params.campaignId);
      autorNome = (usuario ? roster.find((r) => r.userId === usuario.id)?.displayName : null) ?? "Jogador";
      autorTipo = "jogador";
    }

    const entrada = await addLog({
      campaignId: params.campaignId,
      characterId: characterId ?? undefined,
      type: "chat",
      visibility: visibilidade,
      payload: {
        // `text` é o campo que `chatText` (lib/table/logPresentation.ts)
        // já lê há várias versões — nada de um segundo formato.
        text: texto,
        ...(imagem ? {
          imagemId: imagem.id,
          // Medidas só para reservar o espaço no card; nunca autorizam nada.
          imagemLargura: medidaSegura(imagem.largura),
          imagemAltura: medidaSegura(imagem.altura),
        } : {}),
        // Autoria completa NO PAYLOAD: o cartão é renderizável no
        // futuro sem join nenhum, mesmo que o personagem seja
        // renomeado, arquivado ou removido depois.
        autorNome,
        autorTipo,
        characterId,
        characterNome,
        ...(ehNarrador && params.narracao ? { estilo: "narracao" } : {}),
        source: "vtt_painel_chat",
      },
    });
    return { ok: true, dados: entrada };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao enviar a mensagem.") };
  }
}

/* ── Menu do card: excluir e fixar (migration 0152) ────────────────
   A autorização é das RPCs (narrador exclui qualquer card, o autor os
   próprios; fixar vale para quem vê o card). Aqui só a porta da mesa. */

export async function excluirCardAction(campaignId: string, logId: string): Promise<ResultadoPainel> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const client = await getScopedTableClient();
    const { error } = await client.rpc("excluir_table_log", { p_log_id: logId });
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao excluir o card.") };
  }
}

export async function fixarCardAction(campaignId: string, logId: string, fixar: boolean): Promise<ResultadoPainel> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const client = await getScopedTableClient();
    const { error } = await client.rpc("fixar_table_log", { p_log_id: logId, p_fixar: fixar });
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, fixar ? "Falha ao fixar o card." : "Falha ao desafixar o card.") };
  }
}
