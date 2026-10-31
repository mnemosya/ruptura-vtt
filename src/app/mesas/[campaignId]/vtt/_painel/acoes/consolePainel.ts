"use server";

/**
 * Abertura do CONSOLE DO PERSONAGEM dentro do VTT.
 *
 * O caminho antigo era navegar para `/ficha?...` (rota interceptada
 * `@modal/(...)ficha`). Funcionava, mas violava o invariante que este
 * trabalho existe para garantir: a URL mudava, o Next remontava a
 * árvore, e o VTT — mapa, cena, câmera, seleção, painel — ia junto.
 *
 * Aqui o Console é DADO, não rota: esta ação devolve os catálogos e o
 * personagem, e o painel monta `CharacterSheetClient` numa janela
 * interna. Nada navega.
 *
 * DUAS AÇÕES, de propósito, e é isso que dá o "shell imediato":
 *
 *   · `abrirConsoleAction`     — só o ESSENCIAL (personagem + regras).
 *     Responde rápido, e é o que já permite desenhar a janela com
 *     identidade, vitais e recursos.
 *   · `carregarCatalogosConsoleAction` — os onze catálogos, em
 *     paralelo (`lib/console/dadosConsole.ts`). Chega depois e o
 *     cliente guarda em cache POR CAMPANHA: abrir o segundo personagem
 *     da mesma mesa não paga de novo.
 */

import { carregarDadosConsole, type DadosConsole } from "../../../../../../lib/console/dadosConsole";
import { getCharacterForCampaign, updateCharacterSheetPayload } from "../../../../../../lib/character/storage";
import { getCharacterRules } from "../../../../../../lib/content";
import { normalizeCharacter, purchaseItem, removeQuantityFromInventory } from "../../../../../../lib/character";
import { ARS_CONTENT_ID, ARS_REGIOES, installEscalpo, type ArsRegiao } from "../../../../../../lib/character/escalpos";
import { catalogWithMarketEscalpos } from "../../../../../../lib/character/marketEscalpos";
import { addLog } from "../../../../../../lib/table/storage";
import type { CharacterRecord, CharacterRulesPayload } from "../../../../../../lib/character";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";
import { lerTrilhaDaCenaAtiva } from "../../../../../../lib/vtt/sceneStorage";
import type { TurnWindow } from "../../../../../../lib/table/turnTrack";

export interface AberturaConsole {
  personagem: CharacterRecord;
  regras: CharacterRulesPayload | null;
  /** `true` quando a conta pode EDITAR a ficha (narrador dono ou controlador). */
  podeEditar: boolean;
  /**
   * Janela de turno do combate que a MESA está rodando agora, ou `null`
   * fora de combate.
   *
   * A ficha tem regras que dependem disso — o teto de PA em Rápidos é a
   * principal — e o valor vinha de `campaigns.turn_track`, o sistema
   * ANTIGO de trilha (o próprio código chama assim em
   * `_painel/feed/eventosCombate.ts`). O combate de verdade do VTT vive
   * em `vtt_turn_tracks`, por cena. Resultado: com o combate rolando na
   * mesa, a ficha lia `null` e as regras de janela nunca disparavam.
   *
   * Aqui a trilha da CENA é traduzida para o vocabulário que a ficha já
   * entende ("rapidos" → "rapida"). Nenhum dos dois modelos é
   * reescrito: esta é a ponte, e ela tem UM sentido só — a mesa manda,
   * a ficha obedece.
   */
  janelaDeTurno: TurnWindow | null;
}

/** `vtt_turn_tracks` fala "rapidos/lentos"; a ficha fala "rapida/lenta". */
function janelaDaTrilha(estado: unknown): TurnWindow | null {
  if (!estado || typeof estado !== "object") return null;
  const bruto = (estado as { janela?: unknown; modo?: unknown }).janela;
  if (bruto === "rapidos") return "rapida";
  if (bruto === "lentos") return "lenta";
  return null;
}

/**
 * Passo 1 — o mínimo para a janela abrir com conteúdo real.
 *
 * `getCharacterForCampaign` já é filtrado pela RLS (`can_read_character`):
 * quem não pode ver recebe `null`, e a ação devolve o mesmo erro para
 * "não existe" e "não autorizado" — sem vazar a diferença.
 */
export async function abrirConsoleAction(campaignId: string, characterId: string): Promise<ResultadoPainel<AberturaConsole>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const [personagem, regrasDoc, trilha] = await Promise.all([
      getCharacterForCampaign(campaignId, characterId),
      getCharacterRules().catch(() => null),
      // Best-effort: sem cena, sem combate ou sem acesso à trilha, a
      // ficha simplesmente abre fora de combate — como abria antes.
      lerTrilhaDaCenaAtiva(campaignId).catch(() => null),
    ]);
    if (!personagem) return { ok: false, erro: "Personagem não encontrado ou fora do seu acesso." };
    return {
      ok: true,
      dados: {
        personagem,
        regras: (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null,
        // Narrador dono edita qualquer um; o jogador só chega aqui para
        // personagem que controla (a RLS já garantiu a leitura), e a
        // escrita dele continua passando pela RPC restrita por coluna.
        podeEditar: true,
        janelaDeTurno: janelaDaTrilha(trilha),
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao abrir o Console.") };
  }
}

/** Passo 2 — os catálogos pesados, em paralelo. Cacheados por campanha no cliente. */
export async function carregarCatalogosConsoleAction(campaignId: string): Promise<ResultadoPainel<DadosConsole>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    return { ok: true, dados: await carregarDadosConsole(campaignId) };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar os catálogos do Console.") };
  }
}

/** Compra pela janela do Mercado da campanha. A RPC da ficha confere a permissão de escrita. */
export async function comprarNoMercadoAction(campaignId: string, characterId: string, slug: string, quantidade: number, precoUnitario: number, regiaoArs?: ArsRegiao): Promise<ResultadoPainel<CharacterRecord>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 999 || !Number.isSafeInteger(precoUnitario) || precoUnitario < 0) {
    return { ok: false, erro: "Quantidade ou preço inválido." };
  }
  try {
    const [record, dados] = await Promise.all([getCharacterForCampaign(campaignId, characterId), carregarDadosConsole(campaignId)]);
    if (!record || record.campaign_id !== campaignId) return { ok: false, erro: "Comprador não encontrado nesta campanha." };
    if (dados.itemsError || dados.escalposError) return { ok: false, erro: "O catálogo do Mercado está indisponível." };
    const catalogo = catalogWithMarketEscalpos(dados.items, dados.escalpos);
    const item = catalogo.get(slug);
    if (!item || (item.preco ?? 0) <= 0) return { ok: false, erro: "Esse item não está à venda." };
    const personagem = normalizeCharacter(record.payload);
    if (slug === ARS_CONTENT_ID && (quantidade !== 1 || !ARS_REGIOES.some(r => r.id === regiaoArs) || personagem.escalpos_instalados?.some(e => e.contentId === slug && e.regiaoArs === regiaoArs))) {
      return { ok: false, erro: "Escolha uma região livre para comprar a ARS." };
    }
    const agora = new Date().toISOString();
    const compra = purchaseItem({ character: personagem, item, quantidade, walletId: "aretz_informal", precoUnitario, nowIso: agora, catalog: [...catalogo.values()] });
    if (!compra.ok) return { ok: false, erro: compra.reason ?? "Compra não realizada." };
    let proximo = compra.character;
    if (slug === ARS_CONTENT_ID) {
      if (!compra.instance) return { ok: false, erro: "Não foi possível registrar a ARS." };
      const instalado = installEscalpo(proximo, { contentId: slug, regiaoArs, nowIso: agora });
      if (instalado === proximo) return { ok: false, erro: "Essa região já tem uma ARS." };
      const consumido = removeQuantityFromInventory(instalado, compra.instance.id, 1, agora);
      if (!consumido.ok) return { ok: false, erro: "Não foi possível instalar a ARS." };
      proximo = consumido.character;
    }
    const salvo = await updateCharacterSheetPayload(characterId, proximo);
    await addLog({ campaignId, characterId, type: "market_purchase", visibility: "public", payload: { comprador_id: characterId, comprador: record.name, destinatario_id: characterId, destinatario: record.name, carteira: "aretz_informal", item_slug: slug, item_nome: item.nome, quantidade, preco_unitario: precoUnitario, total: compra.totalCost, regiao_ars: regiaoArs ?? null } }).catch(() => undefined);
    return { ok: true, dados: salvo };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao concluir a compra.") };
  }
}
