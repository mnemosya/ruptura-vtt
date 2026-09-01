"use server";

/**
 * Fronteira chamável pela UI do VTT — Server Actions de verdade
 * (`"use server"`), não só um módulo `server-only`.
 *
 * Auditoria pós-0065/0066: a camada de storage (`lib/vtt/sceneStorage.ts`)
 * é boa base, mas não era alcançável pela UI com o rigor que uma
 * Server Action exige: revalidação de acesso à campanha, conversão de
 * erro em forma previsível, e o ponto único que qualquer componente
 * cliente chama. Este arquivo é essa fronteira.
 *
 * Todo Server Action aqui repete o mesmo primeiro passo:
 * `resolveCampaignAccess(campaignId)` — nunca confia que o `campaignId`
 * recebido do cliente é onde o usuário realmente tem acesso. A RLS no
 * banco (migrations 0065/0066) é a garantia FORTE; isto aqui é a
 * garantia de UX (erro cedo, mensagem em português, sem round-trip até
 * o Postgres pra descobrir "você não é membro desta campanha").
 */

import "server-only";
import { getScopedTableClient } from "../../../../../lib/auth/scopedClient";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { fetchControlledCharacterIdsStrict } from "../../../../../lib/campaign/session";
import { listCharactersForNarratorCampaign } from "../../../../../lib/character/storage";
import {
  carregarCenaAtiva,
  carregarObjetosDaCena,
  carregarTrilha,
  iniciarTrilha,
  atualizarTrilha,
  encerrarTrilha,
  criarObjeto,
  removerObjeto,
  atualizarObjeto,
  moverObjeto,
  danificarObjeto,
  criarMarca,
  apagarMarca,
  criarMedicao,
  apagarMedicao,
  limparMedicoesDaCena,
  moverToken,
  pintarTerrenoLote,
  rotacionarToken,
  definirFlagsToken,
  criarToken,
  atualizarToken,
  editarToken,
  redimensionarToken,
  duplicarToken,
  removerToken,
  enviarPing,
  criarArea,
  atualizarArea,
  duplicarArea,
  removerArea,
  type AreaVtt,
  type CorMarca,
  type ObjetoVtt,
  type PresetObjeto,
  type GrauCoberturaObjeto,
  type CategoriaObjeto,
  type EstadoCena,
  type TrilhaPersistida,
  type ParametrosAreaEscrita,
  type TipoArea,
  type TipoMarca,
  type TipoTerreno,
  type TokenVtt,
} from "../../../../../lib/vtt/sceneStorage";

/** Dimensões padrão (em células = metros) de uma cena recém-criada, sem conteúdo. */
const LARGURA_CENA_PADRAO = 20;
const ALTURA_CENA_PADRAO = 20;

/**
 * Garante que a campanha tem uma cena persistida, criando uma cena EM
 * BRANCO na PRIMEIRA carga — sem elenco, objeto ou terreno fictício.
 * O narrador povoa a partir daqui com as ferramentas reais de
 * Token/Objetos/Terreno.
 *
 * Idempotente: se já existe cena ativa pra campanha, só devolve o
 * estado dela — nunca resemeia por cima de progresso real.
 */
export async function garantirCenaSemente(campaignId: string): Promise<ResultadoAcao<EstadoCena>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const existente = await carregarCenaAtiva(campaignId).catch(() => null);
  if (existente) return { ok: true, dados: existente };

  // RPC `SECURITY DEFINER` (migration 0068), não `INSERT` direto: a
  // 0065 nunca concedeu `insert` em `vtt_scenes` pra `authenticated`
  // (só `select`, de propósito — escrita passa por caminhos estreitos
  // e revalidados, mesmo padrão de `move_vtt_token`). A RPC também é
  // idempotente por si (checa `is_campaign_owner` e devolve a cena já
  // existente), então a corrida de duas sessões abrindo a mesa ao
  // mesmo tempo não duplica cena.
  const client = await getScopedTableClient();
  const { data: cena, error: erroCena } = await client
    .rpc("seed_vtt_scene", {
      p_campaign_id: campaignId,
      p_nome: "Cena sem título",
      p_local: "",
      p_resumo: "",
      p_largura: LARGURA_CENA_PADRAO,
      p_altura: ALTURA_CENA_PADRAO,
    })
    .single();
  if (erroCena || !cena) return { ok: false, erro: erroCena?.message ?? "Falha ao criar a cena inicial." };

  const final = await carregarCenaAtiva(campaignId);
  if (!final) return { ok: false, erro: "Cena criada mas não foi possível relê-la." };
  return { ok: true, dados: final };
}

/**
 * O identificador do usuário logado — necessário no cliente só para
 * a regra de undo/redo ("jogador desfaz só as próprias ações",
 * `_ferramentas/controlador.ts`). Não usar em NENHUMA decisão de
 * autorização: isto é dado de apresentação, a autorização de verdade
 * é sempre revalidada no banco (RLS + RPCs das migrations 0065/0066).
 */
export async function obterUsuarioAtualAction(): Promise<ResultadoAcao<{ id: string }>> {
  const usuario = await getCurrentUser();
  if (!usuario) return { ok: false, erro: "Sessão expirada." };
  return { ok: true, dados: { id: usuario.id } };
}

export interface ResultadoAcao<T = undefined> {
  ok: boolean;
  erro?: string;
  dados?: T;
}

async function exigirAcesso(campaignId: string) {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") {
    return { erro: acesso.kind === "no_session" ? "Sessão expirada." : "Você não tem acesso a esta campanha." };
  }
  return { acesso };
}

export async function lerCenaAtiva(campaignId: string): Promise<ResultadoAcao<EstadoCena | null>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const estado = await carregarCenaAtiva(campaignId);
    return { ok: true, dados: estado };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao carregar a cena." };
  }
}

/**
 * Relê SÓ os objetos da cena — usado pela invalidação do Realtime, que
 * avisa "mudou" sem payload (objeto vive em duas tabelas). Recarregar a
 * cena inteira só por isso derrubaria tokens/áreas já reconciliados.
 */
export async function lerObjetosCenaAction(params: { campaignId: string; sceneId: string }): Promise<ResultadoAcao<{ objetos: ObjetoVtt[] }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const objetos = await carregarObjetosDaCena(params.sceneId);
    return { ok: true, dados: { objetos } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao ler objetos." };
  }
}

export interface CriarObjetoParams {
  campaignId: string;
  sceneId: string;
  nome: string;
  preset: PresetObjeto;
  celulas: { q: number; r: number }[];
  bloqueiaMovimento: boolean;
  terrenoProjetado: "dificil" | null;
  grauCobertura: GrauCoberturaObjeto | null;
  categoria: CategoriaObjeto | null;
  pd: number | null;
  pdMax: number | null;
  visivel: boolean;
}

export async function criarObjetoAction(params: CriarObjetoParams): Promise<ResultadoAcao<{ objeto: ObjetoVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador cria objetos na cena." };

  const r = await criarObjeto(params);
  if (!r.ok || !r.objeto) return { ok: false, erro: r.erro };
  return { ok: true, dados: { objeto: r.objeto } };
}

export async function removerObjetoAction(params: { campaignId: string; objectId: string }): Promise<ResultadoAcao> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador remove objetos da cena." };

  const r = await removerObjeto(params.objectId);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true };
}

export interface AtualizarObjetoParams {
  campaignId: string;
  objectId: string;
  revisionEsperada: number;
  nome: string;
  bloqueiaMovimento: boolean;
  terrenoProjetado: "dificil" | null;
  grauCobertura: GrauCoberturaObjeto | null;
  categoria: CategoriaObjeto | null;
  pd: number | null;
  pdMax: number | null;
  visivel: boolean;
  travado: boolean;
}

export async function atualizarObjetoAction(params: AtualizarObjetoParams): Promise<ResultadoAcao<{ objeto: ObjetoVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador edita objetos da cena." };

  const r = await atualizarObjeto(params);
  if (!r.ok || !r.objeto) return { ok: false, erro: r.erro };
  return { ok: true, dados: { objeto: r.objeto } };
}

export async function moverObjetoAction(params: {
  campaignId: string;
  objectId: string;
  revisionEsperada: number;
  celulas: { q: number; r: number }[];
}): Promise<ResultadoAcao<{ objeto: ObjetoVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador move objetos da cena." };

  const r = await moverObjeto(params);
  if (!r.ok || !r.objeto) return { ok: false, erro: r.erro };
  return { ok: true, dados: { objeto: r.objeto } };
}

export async function danificarObjetoAction(params: {
  campaignId: string;
  objectId: string;
  revisionEsperada: number;
  delta: number;
}): Promise<ResultadoAcao<{ objeto: ObjetoVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador aplica dano/reparo em objetos." };

  const r = await danificarObjeto(params);
  if (!r.ok || !r.objeto) return { ok: false, erro: r.erro };
  return { ok: true, dados: { objeto: r.objeto } };
}

export async function moverTokenAction(params: {
  campaignId: string;
  tokenId: string;
  rota: { q: number; r: number }[];
  revisionEsperada: number;
}): Promise<ResultadoAcao<{ revision: number }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await moverToken({ tokenId: params.tokenId, rota: params.rota, revisionEsperada: params.revisionEsperada });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, dados: { revision: r.revision! } };
}

export async function rotacionarTokenAction(params: {
  campaignId: string;
  tokenId: string;
  orientacao: number;
  revisionEsperada: number;
}): Promise<ResultadoAcao<{ revision: number }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await rotacionarToken({ tokenId: params.tokenId, orientacao: params.orientacao, revisionEsperada: params.revisionEsperada });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, dados: { revision: r.revision! } };
}

export async function pintarTerrenoAction(params: {
  campaignId: string;
  sceneId: string;
  celulas: { q: number; r: number }[];
  tipo: TipoTerreno | null;
}): Promise<ResultadoAcao> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  // Narrador-only é aplicado pela RLS (`vtt_terrain_insert/update/delete`
  // exigem `is_campaign_owner`); checar o papel aqui também é só pra
  // devolver o erro sem round-trip quando já sabemos que vai falhar.
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador altera terreno." };

  const r = await pintarTerrenoLote({
    sceneId: params.sceneId, campaignId: params.campaignId, celulas: params.celulas, tipo: params.tipo,
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true };
}

export async function criarMarcaAction(params: {
  campaignId: string;
  sceneId: string;
  tipo: TipoMarca;
  pontos: { q: number; r: number }[];
  texto?: string | null;
  cor: CorMarca;
  espessura: number;
  opacidade: number;
  privada: boolean;
}): Promise<ResultadoAcao<{ id: string }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await criarMarca({
    sceneId: params.sceneId, campaignId: params.campaignId, tipo: params.tipo, pontos: params.pontos,
    texto: params.texto, cor: params.cor, espessura: params.espessura, opacidade: params.opacidade, privada: params.privada,
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, dados: { id: r.id! } };
}

export async function apagarMarcaAction(params: { campaignId: string; marcaId: string }): Promise<ResultadoAcao> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await apagarMarca(params.marcaId);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true };
}

// ── Medições permanentes da régua (migration 0087) ────────────────
// Mesmo formato das marcações: `exigirAcesso` como garantia de UX
// (erro cedo, em português), RLS como garantia forte. Nenhuma delas
// recebe autoria do cliente — quem cria é sempre `auth.uid()`.

export async function criarMedicaoAction(params: {
  campaignId: string;
  sceneId: string;
  pontos: { q: number; r: number }[];
  cor?: CorMarca;
  rotulo?: string | null;
}): Promise<ResultadoAcao<{ id: string }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await criarMedicao({
    sceneId: params.sceneId, campaignId: params.campaignId,
    pontos: params.pontos, cor: params.cor, rotulo: params.rotulo,
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, dados: { id: r.id! } };
}

export async function apagarMedicaoAction(params: { campaignId: string; medicaoId: string }): Promise<ResultadoAcao> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await apagarMedicao(params.medicaoId);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true };
}

/**
 * Limpa as medições da cena que o usuário PODE apagar (as suas; todas,
 * se narrador) — a RLS faz esse recorte, não o cliente.
 */
export async function limparMedicoesAction(params: { campaignId: string; sceneId: string }): Promise<ResultadoAcao<{ removidas: number }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await limparMedicoesDaCena(params.sceneId);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, dados: { removidas: r.removidas ?? 0 } };
}

/**
 * "O que EU controlo nesta campanha" — reusa a mesma infraestrutura de
 * sessão que o resto do app já usa (`character_controllers`, via
 * `resolveCampaignSessionViewer`/`fetchControlledCharacterIdsStrict`),
 * nunca `characterId !== null` sozinho. Variante ESTRITA (propaga erro
 * de leitura em vez de degradar pra `[]`) — é uma recarga client-side,
 * mesma regra que `sessionActions.ts` já documenta: uma falha aqui não
 * pode "ter sucesso" apagando controle de verdade.
 */
export async function obterControleAction(campaignId: string): Promise<ResultadoAcao<{ controlledCharacterIds: string[] }>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const controlledCharacterIds = await fetchControlledCharacterIdsStrict(campaignId);
    return { ok: true, dados: { controlledCharacterIds } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao ler personagens controlados." };
  }
}

/** Personagens da campanha pro seletor de "vincular personagem" do formulário de token — narrador-only (quem cria/edita token). */
export async function listarPersonagensAction(campaignId: string): Promise<ResultadoAcao<{ id: string; nome: string }[]>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador vincula personagens a tokens." };
  try {
    const personagens = await listCharactersForNarratorCampaign(campaignId);
    return { ok: true, dados: personagens.filter((p) => !p.archived_at).map((p) => ({ id: p.id, nome: p.name })) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao listar personagens." };
  }
}

export interface CriarTokenParams {
  campaignId: string;
  sceneId: string;
  nome: string;
  sigla: string;
  lado: TokenVtt["lado"];
  vertente: string;
  tamanho: TokenVtt["tamanho"];
  orientacao: number;
  pegadaPersonalizada: { q: number; r: number }[] | null;
  q: number;
  r: number;
  characterId: string | null;
  visivel: boolean;
  bloqueado: boolean;
  retratoUrl: string | null;
  pvAtual: number | null;
  pvMax: number | null;
  condicoes: string[];
}

export async function criarTokenAction(params: CriarTokenParams): Promise<ResultadoAcao<{ token: TokenVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador cria tokens." };

  const r = await criarToken(params);
  if (!r.ok || !r.token) return { ok: false, erro: r.erro };
  return { ok: true, dados: { token: r.token } };
}

export interface AtualizarTokenParams {
  campaignId: string;
  tokenId: string;
  nome: string;
  sigla: string;
  lado: TokenVtt["lado"];
  vertente: string;
  characterId: string | null;
  retratoUrl: string | null;
  pvAtual: number | null;
  pvMax: number | null;
  condicoes: string[];
  revisionEsperada: number;
}

export async function atualizarTokenAction(params: AtualizarTokenParams): Promise<ResultadoAcao<{ token: TokenVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador edita tokens." };

  const r = await atualizarToken(params);
  if (!r.ok || !r.token) return { ok: false, erro: r.erro };
  return { ok: true, dados: { token: r.token } };
}

export interface EditarTokenParams {
  campaignId: string;
  tokenId: string;
  nome: string;
  sigla: string;
  lado: TokenVtt["lado"];
  vertente: string;
  characterId: string | null;
  retratoUrl: string | null;
  pvAtual: number | null;
  pvMax: number | null;
  condicoes: string[];
  tamanho: TokenVtt["tamanho"];
  revisionEsperada: number;
}

/** Edição ATÔMICA (`edit_vtt_token`, migration 0076) — campos de apresentação/estado E tamanho, numa RPC só. Usada pelo formulário de editar; nunca move nem gira. */
export async function editarTokenAction(params: EditarTokenParams): Promise<ResultadoAcao<{ token: TokenVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador edita tokens." };

  const r = await editarToken(params);
  if (!r.ok || !r.token) return { ok: false, erro: r.erro };
  return { ok: true, dados: { token: r.token } };
}

export async function redimensionarTokenAction(params: {
  campaignId: string;
  tokenId: string;
  tamanho: TokenVtt["tamanho"];
  orientacao: number;
  pegadaPersonalizada: { q: number; r: number }[] | null;
  revisionEsperada: number;
}): Promise<ResultadoAcao<{ token: TokenVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador altera tamanho de token." };

  const r = await redimensionarToken(params);
  if (!r.ok || !r.token) return { ok: false, erro: r.erro };
  return { ok: true, dados: { token: r.token } };
}

export async function duplicarTokenAction(params: {
  campaignId: string;
  tokenId: string;
  q: number;
  r: number;
}): Promise<ResultadoAcao<{ token: TokenVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador duplica tokens." };

  const r = await duplicarToken(params);
  if (!r.ok || !r.token) return { ok: false, erro: r.erro };
  return { ok: true, dados: { token: r.token } };
}

export async function removerTokenAction(params: { campaignId: string; tokenId: string }): Promise<ResultadoAcao> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador remove tokens." };

  const r = await removerToken(params.tokenId);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true };
}

export async function definirFlagsTokenAction(params: {
  campaignId: string;
  tokenId: string;
  bloqueado: boolean;
  visivel: boolean;
}): Promise<ResultadoAcao<{ revision: number }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (v.acesso!.role !== "narrator") return { ok: false, erro: "Só o narrador oculta/trava tokens." };

  const r = await definirFlagsToken({ tokenId: params.tokenId, bloqueado: params.bloqueado, visivel: params.visivel });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, dados: { revision: r.revision! } };
}

/**
 * Ping — disponível pra narrador E jogador (qualquer membro). A RPC
 * (`vtt_ping`) já reautoriza tudo (membro, cena↔campanha, limites,
 * rate limit) e é ela quem publica o broadcast — este Server Action só
 * garante que o `campaignId` recebido é onde este usuário tem acesso,
 * mesma regra de UX-cedo de todo outro Server Action deste arquivo.
 */
export async function enviarPingAction(params: {
  campaignId: string;
  sceneId: string;
  q: number;
  r: number;
  foco?: boolean;
}): Promise<ResultadoAcao<{ enviado: boolean }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await enviarPing(params);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, dados: { enviado: r.enviado } };
}

// ─────────────────────────────────────────────────────────────────
// Áreas de efeito
//
// A autorização FORTE é a RPC (`pode_gerenciar_vtt_areas`, migration
// 0081): narrador sempre; jogador só com concessão explícita, e mesmo
// assim só sobre o que ele criou. As checagens daqui são de UX — erro
// cedo, mensagem em português — e nunca substituem a do banco. Nenhuma
// destas ações aplica dano, condição, teste, bloqueio ou qualquer outra
// consequência mecânica: elas só gravam a geometria.
// ─────────────────────────────────────────────────────────────────

export interface CriarAreaParams extends ParametrosAreaEscrita {
  campaignId: string;
  sceneId: string;
  tipo: TipoArea;
}

export async function criarAreaAction(params: CriarAreaParams): Promise<ResultadoAcao<{ area: AreaVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await criarArea(params);
  if (!r.ok || !r.area) return { ok: false, erro: r.erro };
  return { ok: true, dados: { area: r.area } };
}

export interface AtualizarAreaParams extends ParametrosAreaEscrita {
  campaignId: string;
  areaId: string;
  revisionEsperada: number;
}

export async function atualizarAreaAction(params: AtualizarAreaParams): Promise<ResultadoAcao<{ area: AreaVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await atualizarArea(params);
  if (!r.ok || !r.area) return { ok: false, erro: r.erro };
  return { ok: true, dados: { area: r.area } };
}

export async function duplicarAreaAction(params: { campaignId: string; areaId: string }): Promise<ResultadoAcao<{ area: AreaVtt }>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await duplicarArea(params.areaId);
  if (!r.ok || !r.area) return { ok: false, erro: r.erro };
  return { ok: true, dados: { area: r.area } };
}

export async function removerAreaAction(params: { campaignId: string; areaId: string }): Promise<ResultadoAcao> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  const r = await removerArea(params.areaId);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Rodadas (trilha de turnos) — migration 0088
//
// Estas quatro actions transportam o estado sem interpretá-lo: o
// `estado` é `unknown` de ponta a ponta, validado por
// `_turnos/serializacao.ts` no cliente e autorizado pelas RPCs no
// servidor. Nenhuma regra de combate atravessa esta fronteira.
// ─────────────────────────────────────────────────────────────────

export async function lerTrilhaAction(
  campaignId: string,
  sceneId: string,
): Promise<ResultadoAcao<TrilhaPersistida | null>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    return { ok: true, dados: await carregarTrilha(sceneId) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao ler as rodadas." };
  }
}

export async function iniciarTrilhaAction(params: {
  campaignId: string;
  sceneId: string;
  estado: unknown;
}): Promise<ResultadoAcao<TrilhaPersistida | null>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const r = await iniciarTrilha({ sceneId: params.sceneId, estado: params.estado });
  return r.ok ? { ok: true, dados: r.trilha ?? null } : { ok: false, erro: r.erro };
}

export async function atualizarTrilhaAction(params: {
  campaignId: string;
  sceneId: string;
  estado: unknown;
  revisionEsperada: number;
}): Promise<ResultadoAcao<TrilhaPersistida | null>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const r = await atualizarTrilha({
    sceneId: params.sceneId, estado: params.estado, revisionEsperada: params.revisionEsperada,
  });
  return r.ok ? { ok: true, dados: r.trilha ?? null } : { ok: false, erro: r.erro };
}

export async function encerrarTrilhaAction(params: {
  campaignId: string;
  sceneId: string;
}): Promise<ResultadoAcao<null>> {
  const v = await exigirAcesso(params.campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  const r = await encerrarTrilha(params.sceneId);
  return r.ok ? { ok: true, dados: null } : { ok: false, erro: r.erro };
}
