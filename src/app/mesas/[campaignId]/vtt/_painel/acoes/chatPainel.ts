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
    const [roster, personagens] = await Promise.all([
      listCampaignRoster(campaignId),
      v.acesso.role === "narrator" ? listCharactersForNarratorCampaign(campaignId) : listControlledCharacters(campaignId),
    ]);
    const minhaLinha = usuario ? roster.find((r) => r.userId === usuario.id) : undefined;
    return {
      ok: true,
      dados: {
        nomeDaConta: minhaLinha?.displayName ?? (v.acesso.role === "narrator" ? "Narrador" : "Jogador"),
        personagens: personagens.filter((p) => !p.archived_at).map((p) => ({ id: p.id, nome: p.name })),
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
}

/**
 * Grava a mensagem. Devolve a LINHA criada — o Chat usa o `id` real
 * dela pra descartar a bolha otimista quando o eco do Realtime chegar,
 * sem nunca desenhar a mesma mensagem duas vezes.
 */
export async function enviarMensagemChatAction(params: EnviarMensagemParams): Promise<ResultadoPainel<TableLogEntry>> {
  const v = await exigirAcessoPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const ehNarrador = v.acesso.role === "narrator";

  const texto = params.texto.trim();
  if (!texto) return { ok: false, erro: "Mensagem vazia." };
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
