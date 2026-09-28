"use server";

/**
 * Diretório de PERSONAGENS do painel da Mesa — documentos persistentes
 * (`characters`), nunca tokens da cena.
 *
 * Fonte por papel, sem ampliar nada do modelo de permissão existente:
 *   · narrador dono: `listCharactersForNarratorCampaign` (o mesmo da
 *     página Personagens), mais as pastas/ordem da migration 0090;
 *   · jogador: `listControlledCharacters` — só o que ele controla, sem
 *     pasta nenhuma (as tabelas de pasta são do narrador, ver o
 *     cabeçalho da 0090). Um jogador que chame estas ações com um
 *     `campaignId` de outra mesa recebe erro de acesso, e mesmo se
 *     passasse, a RLS de `characters` já filtra linha a linha.
 *
 * As MUTAÇÕES de personagem (criar, renomear, duplicar, arquivar,
 * restaurar) delegam às funções canônicas de
 * `lib/character/storage.ts` — nenhuma regra de domínio reimplementada
 * aqui, nenhum segundo caminho de escrita em `characters`.
 */

import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import {
  archiveCharacter,
  createCharacterForCampaign,
  duplicateCharacter,
  getCharacterForCampaign,
  listArchivedCharactersForNarratorCampaign,
  listCharacterControllers,
  listCharactersForNarratorCampaign,
  listControlledCharacters,
  renameCharacter,
  restoreCharacter,
} from "../../../../../../lib/character/storage";
import {
  computeDerivedStats,
  createInitialCharacter,
  normalizeCharacter,
  type CharacterRecord,
  type CharacterRulesPayload,
} from "../../../../../../lib/character";
import { getCharacterRules } from "../../../../../../lib/content";
import { assinarDownloadUrls } from "../../../../../../lib/vtt/imageService";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { exigirAcessoPainel, exigirNarradorPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

const TABELA_PASTAS = "campaign_character_folders";
const TABELA_COLOCACOES = "campaign_character_placements";

export interface PastaDiretorio {
  id: string;
  nome: string;
  parentId: string | null;
  posicao: number;
}

export interface EntradaDiretorio {
  characterId: string;
  nome: string;
  /** "pn" quando `payload.metadados.tipo_personagem === "pn"` — apresentação, nunca autorização. */
  tipo: "jogador" | "pn";
  /** Pasta onde vive. `null` = raiz. Sempre `null` para o jogador. */
  pastaId: string | null;
  posicao: number;
  arquivado: boolean;
  /**
   * Quantas contas controlam este personagem nesta campanha. Só o
   * narrador recebe um número (a RLS de `character_controllers` só
   * mostra ao jogador a própria linha); para o jogador vem `null` e a
   * linha não decora nada.
   */
  controladores: number | null;
  /**
   * PV atual/máximo — o mesmo cálculo do resumo (`lerResumoPersonagemAction`),
   * só que para TODA a lista de uma vez. Opcional: os testes puros
   * (`scripts/test-vtt-painel.ts`) montam `EntradaDiretorio` de mão pra
   * testar só a árvore de pastas, sem regra de personagem nenhuma —
   * ausência aqui não é um bug, é "não computado", e a linha
   * simplesmente não desenha a barra.
   */
  pv?: { atual: number; max: number };
  /** PE atual/máximo — mesmo cálculo e mesma opcionalidade do `pv`. */
  pe?: { atual: number; max: number };
  /** Quantas condições ATIVAS o personagem tem agora. Mesmo caso de opcionalidade do `pv`. */
  condicoes?: number;
  /**
   * Avatar da ficha JÁ ASSINADO. Assinar em lote aqui, com a lista
   * inteira numa ida só, é o que evita uma chamada por linha — a
   * alternativa seria cada `LinhaDiretorio` pedir o próprio endereço e
   * a abertura do painel virar N requisições.
   *
   * `null` quando a ficha não tem avatar: aí a linha cai na sigla, que
   * é o mesmo desfecho de sempre.
   */
  avatarUrl?: string | null;
}

/** Igual ao par normalizeCharacter→computeDerivedStats→normalizeCharacter de `lerResumoPersonagemAction`, mas achatado pra rodar em lote sobre a lista inteira sem repetir a leitura de regras. */
function resumoLeveDoPersonagem(
  c: CharacterRecord,
  regras: CharacterRulesPayload | null,
): { pv: { atual: number; max: number }; pe: { atual: number; max: number }; condicoes: number } {
  const primeiraLeitura = normalizeCharacter(c.payload);
  const derived = computeDerivedStats(primeiraLeitura.atributos, regras, primeiraLeitura.mana_bonus_ruptura ?? 0);
  const personagem = normalizeCharacter(primeiraLeitura, derived);
  return {
    pv: { atual: personagem.recursos_atuais?.pv ?? derived.pv_max, max: derived.pv_max },
    pe: { atual: personagem.recursos_atuais?.pe ?? derived.pe_max, max: derived.pe_max },
    condicoes: (personagem.condicoes_ativas ?? []).filter((cond) => cond.ativa).length,
  };
}

/**
 * Assina os avatares da lista INTEIRA numa ida só.
 *
 * Por que aqui e não em cada linha: a alternativa natural — cada
 * `LinhaDiretorio` pedir o próprio endereço — transformaria abrir o
 * painel em N requisições, uma por personagem. Aqui é uma, com todos os
 * ids de uma vez.
 *
 * Falhar não derruba o diretório: sem endereço, a linha desenha a
 * sigla, que é exatamente o que ela fazia antes de existir avatar.
 */
async function avataresAssinados(registros: CharacterRecord[]): Promise<Map<string, string>> {
  const ids = registros.map((c) => c.avatar_image_id ?? null).filter((id): id is string => !!id);
  if (ids.length === 0) return new Map();
  try {
    const usuario = await getCurrentUser();
    if (!usuario) return new Map();
    return await assinarDownloadUrls(ids, usuario.id);
  } catch {
    return new Map();
  }
}

export interface DiretorioPersonagens {
  pastas: PastaDiretorio[];
  entradas: EntradaDiretorio[];
  /** `true` só para o narrador dono — a interface esconde ações, mas a autorização real está no servidor. */
  podeAdministrar: boolean;
}

function tipoDoRegistro(c: CharacterRecord): "jogador" | "pn" {
  return c.payload?.metadados?.tipo_personagem === "pn" ? "pn" : "jogador";
}

export interface RecursoResumoPersonagem {
  atual: number;
  max: number;
}

/**
 * Resumo LEVE de um personagem — o suficiente para o dossiê da aba
 * Personagens sem abrir o Console inteiro (que carrega onze
 * catálogos). Reusa os MESMOS dois passos de `readSelectedTokenHudAction`
 * (`hudActions.ts`): normaliza uma vez para ler os atributos reais,
 * calcula os derivados com a regra publicada, normaliza de novo para
 * os recursos atuais ficarem sempre dentro do teto certo.
 */
export interface ResumoPersonagem {
  characterId: string;
  nome: string;
  tipo: "jogador" | "pn";
  atributos: { corpo: number; mente: number; animo: number };
  recursos: {
    pv: RecursoResumoPersonagem;
    pe: RecursoResumoPersonagem;
    mana: RecursoResumoPersonagem;
  };
  /** Só os nomes das condições ATIVAS — o dossiê não é a ficha inteira. */
  condicoesAtivas: string[];
  contadores: { talentos: number; magias: number; itens: number };
}

export async function lerResumoPersonagemAction(
  campaignId: string,
  characterId: string,
): Promise<ResultadoPainel<ResumoPersonagem>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };

  try {
    const [personagem, regrasDoc] = await Promise.all([
      getCharacterForCampaign(campaignId, characterId),
      getCharacterRules().catch(() => null),
    ]);
    if (!personagem) return { ok: false, erro: "Personagem não encontrado ou fora do seu acesso." };

    const regras = (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null;
    const primeiraLeitura = normalizeCharacter(personagem.payload);
    const derived = computeDerivedStats(primeiraLeitura.atributos, regras, primeiraLeitura.mana_bonus_ruptura ?? 0);
    const personagemNormalizado = normalizeCharacter(primeiraLeitura, derived);

    return {
      ok: true,
      dados: {
        characterId: personagem.id,
        nome: personagem.name,
        tipo: tipoDoRegistro(personagem),
        atributos: { ...personagemNormalizado.atributos },
        recursos: {
          pv: { atual: personagemNormalizado.recursos_atuais?.pv ?? derived.pv_max, max: derived.pv_max },
          pe: { atual: personagemNormalizado.recursos_atuais?.pe ?? derived.pe_max, max: derived.pe_max },
          mana: { atual: personagemNormalizado.recursos_atuais?.mana ?? derived.mana_max, max: derived.mana_max },
        },
        condicoesAtivas: (personagemNormalizado.condicoes_ativas ?? []).filter((c) => c.ativa).map((c) => c.nome),
        contadores: {
          talentos: personagemNormalizado.talentos_adquiridos?.length ?? 0,
          magias: personagemNormalizado.magias_aprendidas?.length ?? 0,
          itens: personagemNormalizado.inventario?.length ?? 0,
        },
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar o resumo do personagem.") };
  }
}

/**
 * Lê o diretório inteiro (pastas + entradas). Chamado ao abrir a aba,
 * ao a janela recuperar o foco e depois de cada mutação — nunca no
 * primeiro render do VTT.
 *
 * `incluirArquivados` só tem efeito para o narrador: é o "acesso
 * administrativo coerente" aos arquivados, o mesmo conceito que a
 * página Personagens já oferece pelo filtro "Arquivados". Fora dele,
 * personagem arquivado não aparece no diretório normal.
 */
export async function lerDiretorioPersonagensAction(
  campaignId: string,
  opcoes: { incluirArquivados?: boolean } = {},
): Promise<ResultadoPainel<DiretorioPersonagens>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };

  try {
    if (v.acesso.role !== "narrator") {
      const [controlados, regrasDoc] = await Promise.all([
        listControlledCharacters(campaignId),
        getCharacterRules().catch(() => null),
      ]);
      const regras = (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null;
      const avatares = await avataresAssinados(controlados);
      return {
        ok: true,
        dados: {
          pastas: [],
          podeAdministrar: false,
          entradas: controlados
            .filter((c) => !c.archived_at)
            .map((c, i) => ({
              characterId: c.id,
              nome: c.name,
              tipo: tipoDoRegistro(c),
              pastaId: null,
              posicao: i,
              arquivado: false,
              controladores: null,
              avatarUrl: (c.avatar_image_id && avatares.get(c.avatar_image_id)) || null,
              ...resumoLeveDoPersonagem(c, regras),
            })),
        },
      };
    }

    const client = await getScopedTableClient();
    const [ativos, arquivados, controles, pastasResp, colocacoesResp, regrasDoc] = await Promise.all([
      listCharactersForNarratorCampaign(campaignId),
      opcoes.incluirArquivados ? listArchivedCharactersForNarratorCampaign(campaignId) : Promise.resolve<CharacterRecord[]>([]),
      listCharacterControllers(campaignId).catch(() => []),
      client.from(TABELA_PASTAS).select("id, nome, parent_id, posicao").eq("campaign_id", campaignId),
      client.from(TABELA_COLOCACOES).select("character_id, folder_id, posicao").eq("campaign_id", campaignId),
      getCharacterRules().catch(() => null),
    ]);
    const regras = (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null;
    if (pastasResp.error) throw new Error(pastasResp.error.message);
    if (colocacoesResp.error) throw new Error(colocacoesResp.error.message);

    const controladoresPorPersonagem = new Map<string, number>();
    for (const c of controles) {
      controladoresPorPersonagem.set(c.character_id, (controladoresPorPersonagem.get(c.character_id) ?? 0) + 1);
    }
    const colocacaoPorPersonagem = new Map(
      (colocacoesResp.data ?? []).map((r) => [
        String((r as { character_id: string }).character_id),
        { pastaId: (r as { folder_id: string | null }).folder_id ?? null, posicao: (r as { posicao: number }).posicao ?? 0 },
      ]),
    );

    // `listCharactersForNarratorCampaign` traz ativos E arquivados
    // (não filtra); o diretório normal só mostra os ativos, e a lista
    // de arquivados vem da leitura dedicada quando pedida.
    const registros = [...ativos.filter((c) => !c.archived_at), ...arquivados];
    const avatares = await avataresAssinados(registros);

    return {
      ok: true,
      dados: {
        podeAdministrar: true,
        pastas: (pastasResp.data ?? []).map((r) => ({
          id: String((r as { id: string }).id),
          nome: String((r as { nome: string }).nome),
          parentId: (r as { parent_id: string | null }).parent_id ?? null,
          posicao: (r as { posicao: number }).posicao ?? 0,
        })),
        entradas: registros.map((c) => {
          const colocacao = colocacaoPorPersonagem.get(c.id);
          return {
            characterId: c.id,
            nome: c.name,
            tipo: tipoDoRegistro(c),
            pastaId: colocacao?.pastaId ?? null,
            posicao: colocacao?.posicao ?? 0,
            arquivado: !!c.archived_at,
            controladores: controladoresPorPersonagem.get(c.id) ?? 0,
            avatarUrl: (c.avatar_image_id && avatares.get(c.avatar_image_id)) || null,
            ...resumoLeveDoPersonagem(c, regras),
          };
        }),
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar o diretório de personagens.") };
  }
}

// =====================================================================
// Pastas (narrador) — escrita direta, autorizada pela RLS da 0090
// (`is_campaign_owner`), com a checagem de papel aqui só como erro
// cedo e legível.
// =====================================================================

export async function criarPastaAction(campaignId: string, nome: string, parentId: string | null): Promise<ResultadoPainel<{ id: string }>> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return { ok: false, erro: "Dê um nome à pasta." };
  if (nomeLimpo.length > 60) return { ok: false, erro: "Nome de pasta longo demais (máximo 60 caracteres)." };
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client
      .from(TABELA_PASTAS)
      .insert({ campaign_id: campaignId, nome: nomeLimpo, parent_id: parentId, posicao: 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, dados: { id: String((data as { id: string }).id) } };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao criar a pasta.") };
  }
}

export async function renomearPastaAction(campaignId: string, pastaId: string, nome: string): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return { ok: false, erro: "Dê um nome à pasta." };
  if (nomeLimpo.length > 60) return { ok: false, erro: "Nome de pasta longo demais (máximo 60 caracteres)." };
  try {
    const client = await getScopedTableClient();
    const { error } = await client.from(TABELA_PASTAS).update({ nome: nomeLimpo }).eq("id", pastaId).eq("campaign_id", campaignId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao renomear a pasta.") };
  }
}

/**
 * Apaga a pasta. Subpastas somem junto (FK `on delete cascade`) e os
 * personagens que estavam nelas voltam à raiz (`on delete set null` na
 * FK de `folder_id`) — nenhum personagem é apagado, nunca.
 */
export async function removerPastaAction(campaignId: string, pastaId: string): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const client = await getScopedTableClient();
    const { error } = await client.from(TABELA_PASTAS).delete().eq("id", pastaId).eq("campaign_id", campaignId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao remover a pasta.") };
  }
}

/**
 * Coloca um personagem numa pasta (ou na raiz, com `pastaId` nulo) e
 * grava a posição manual. `upsert` na PK `character_id` — um
 * personagem tem no máximo uma colocação, e mover é sempre a mesma
 * linha, nunca um histórico.
 */
export async function moverPersonagemParaPastaAction(
  campaignId: string,
  characterId: string,
  pastaId: string | null,
  posicao = 0,
): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const client = await getScopedTableClient();
    const { error } = await client
      .from(TABELA_COLOCACOES)
      .upsert(
        { character_id: characterId, campaign_id: campaignId, folder_id: pastaId, posicao: Math.max(0, Math.trunc(posicao)) },
        { onConflict: "character_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao mover o personagem.") };
  }
}

/**
 * Ordem das PASTAS dentro do mesmo pai.
 *
 * `update` linha a linha, e não `upsert` em lote como nas colocações:
 * `campaign_character_folders` tem `nome` obrigatório, e um upsert
 * precisaria reenviar o nome de cada pasta só pra gravar um inteiro —
 * qualquer renomeação concorrente seria desfeita pelo nome velho que
 * viajou junto. São poucas pastas, e cada `update` toca só a coluna
 * que mudou.
 */
export async function reordenarPastasAction(
  campaignId: string,
  ordem: { pastaId: string; posicao: number }[],
): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  if (ordem.length === 0) return { ok: true };
  try {
    const client = await getScopedTableClient();
    for (const { pastaId, posicao } of ordem) {
      const { error } = await client
        .from(TABELA_PASTAS)
        .update({ posicao: Math.max(0, Math.trunc(posicao)) })
        .eq("id", pastaId)
        .eq("campaign_id", campaignId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao reordenar as pastas.") };
  }
}

/**
 * Ordem manual dentro de uma pasta.
 *
 * A `posicao` vem EXPLÍCITA, e não do índice do array: pastas e
 * personagens dividem uma fila só na tela, e a posição de um
 * personagem é a dele NAQUELA fila — não a dele entre os personagens.
 * Derivar do índice aqui embaralharia a intercalação na primeira
 * releitura.
 */
export async function reordenarPersonagensAction(
  campaignId: string,
  ordem: { characterId: string; pastaId: string | null; posicao: number }[],
): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  if (ordem.length === 0) return { ok: true };
  try {
    const client = await getScopedTableClient();
    const { error } = await client.from(TABELA_COLOCACOES).upsert(
      ordem.map((o) => ({
        character_id: o.characterId,
        campaign_id: campaignId,
        folder_id: o.pastaId,
        posicao: Math.max(0, Math.trunc(o.posicao)),
      })),
      { onConflict: "character_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao reordenar o diretório.") };
  }
}

// =====================================================================
// Personagens — delegação pura para `lib/character/storage.ts`
// =====================================================================

export async function criarPersonagemPainelAction(
  campaignId: string,
  nome: string,
  tipo: "jogador" | "pn",
): Promise<ResultadoPainel<{ id: string }>> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return { ok: false, erro: "Dê um nome ao personagem." };
  try {
    const personagem = createInitialCharacter(null, nomeLimpo);
    if (tipo === "pn") {
      personagem.metadados = {
        ...personagem.metadados,
        schema_version: personagem.metadados?.schema_version ?? 1,
        tipo_personagem: "pn",
      };
    }
    const criado = await createCharacterForCampaign(campaignId, personagem);
    return { ok: true, dados: { id: criado.id } };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao criar o personagem.") };
  }
}

export async function duplicarPersonagemPainelAction(campaignId: string, characterId: string): Promise<ResultadoPainel<{ id: string }>> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const copia = await duplicateCharacter(characterId);
    return { ok: true, dados: { id: copia.id } };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao duplicar o personagem.") };
  }
}

export async function renomearPersonagemPainelAction(campaignId: string, characterId: string, nome: string): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  if (!nome.trim()) return { ok: false, erro: "Dê um nome ao personagem." };
  try {
    await renameCharacter(characterId, nome.trim());
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao renomear o personagem.") };
  }
}

export async function arquivarPersonagemPainelAction(campaignId: string, characterId: string): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    await archiveCharacter(characterId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao arquivar o personagem.") };
  }
}

export async function restaurarPersonagemPainelAction(campaignId: string, characterId: string): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    await restoreCharacter(characterId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao restaurar o personagem.") };
  }
}
