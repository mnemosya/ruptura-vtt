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
import { getCharacterForCampaign } from "../../../../../../lib/character/storage";
import { getCharacterRules } from "../../../../../../lib/content";
import type { CharacterRecord, CharacterRulesPayload } from "../../../../../../lib/character";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";
import { lerTrilhaDaCenaAtiva, tokenDoPersonagemNaCenaAtiva } from "../../../../../../lib/vtt/sceneStorage";
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
  /**
   * Token DESTE personagem na cena ativa, ou `null` se ele não está no
   * mapa. É o que permite ir da ficha para o tabuleiro: sem isso, o
   * Console não tinha como saber sequer se o personagem que ele mostra
   * está em jogo agora.
   */
  tokenNaCena: string | null;
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
    const [personagem, regrasDoc, trilha, tokenNaCena] = await Promise.all([
      getCharacterForCampaign(campaignId, characterId),
      getCharacterRules().catch(() => null),
      // Best-effort: sem cena, sem combate ou sem acesso à trilha, a
      // ficha simplesmente abre fora de combate — como abria antes.
      lerTrilhaDaCenaAtiva(campaignId).catch(() => null),
      tokenDoPersonagemNaCenaAtiva(campaignId, characterId).catch(() => null),
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
        tokenNaCena,
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
