/**
 * Leitura e escrita do estado da cena do VTT.
 *
 * Roda no SERVIDOR, com `getScopedTableClient()` — o client Supabase
 * que carrega o access token do usuário logado. Consequência que é o
 * ponto central do desenho: **toda consulta daqui passa pela RLS da
 * migration 0065 como aquele usuário**. Não existe caminho em que a
 * autorização dependa de um id ou papel mandado pelo cliente.
 *
 * Por isso as funções de escrita aqui não recebem "quem sou eu": o
 * banco já sabe (`auth.uid()`), e as policies decidem. Um jogador
 * chamando `moverToken` para um token que não controla recebe 0 linhas
 * afetadas — não um erro de UI, uma recusa do banco.
 *
 * Granularidade: cada operação toca as linhas que precisa e só elas.
 * Pintar uma célula é um upsert de UMA linha em `vtt_terrain`; mover um
 * token é um update de UMA linha em `vtt_tokens`. Nada de reescrever um
 * JSON de cena inteiro a cada gesto.
 */

import "server-only";
import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";

export type TipoTerreno = "dificil" | "bloqueado";
export type TipoMarca = "linha" | "seta" | "desenho" | "texto";
export type CorMarca = "ciano" | "ambar" | "verde" | "vermelho" | "roxo" | "branco";

/**
 * Os padrões da grade (0122) — os MESMOS que a constante de CSS tinha
 * antes de a cor virar coluna. Uma cena que nunca foi ajustada precisa
 * desenhar exatamente como desenhava.
 */
export const GRADE_COR_PADRAO = "#96bed7";
export const GRADE_OPACIDADE_PADRAO = 0.07;
/**
 * Pixels por célula (0123) — unidade de CONVERSÃO, não de desenho. 70 é
 * o padrão do Roll20 e o mais comum nos mapas prontos.
 */
export const CELULA_PX_PADRAO = 70;

export interface CenaVtt {
  id: string;
  campaignId: string;
  nome: string;
  local: string | null;
  resumo: string | null;
  largura: number;
  altura: number;
  /** Aparência da GRADE (0122). Decoração: não muda alcance, custo nem visão. */
  gradeCor: string;
  gradeOpacidade: number;
  /** Pixels por célula (0123) — só conversão, para encaixar mapas prontos. */
  celulaPx: number;
  revision: number;
  /**
   * Visibilidade e bloqueio de cada camada do mapa, DA MESA (migration
   * 0093) — não preferência de tela. O narrador ajusta e vale pra
   * todos; o formato é validado no cliente
   * (`_shell/PainelCamadas.camadasDeJson`), como todo estado que viaja
   * como jsonb.
   */
  camadas: Record<string, unknown>;
}

export interface TokenVtt {
  id: string;
  sceneId: string;
  characterId: string | null;
  nome: string;
  sigla: string;
  lado: "pj" | "pn" | "neutro";
  vertente: string;
  /** Posição da ÂNCORA — pertence à pegada, nunca o centro geométrico (`_dominio/pegada.ts`). */
  q: number;
  r: number;
  tamanho: "pequeno" | "medio" | "grande" | "enorme" | "colossal";
  /** Rotação em passos de 60°, 0-5. Presets padrão são rotacionados a partir disto no domínio — nunca persistidos já rotacionados. */
  orientacao: number;
  /** Offsets axiais relativos à âncora — só quando a pegada NÃO é o preset da categoria. `null` = usa o preset de `tamanho`. */
  pegadaPersonalizada: { q: number; r: number }[] | null;
  bloqueado: boolean;
  visivel: boolean;
  /**
   * Deslocamento SUB-CÉLULA dentro da âncora (migration 0094), em
   * unidades axiais fracionárias — só desenho. O token OCUPA `q`/`r`;
   * isto é onde ele aparece dentro dela, que é o que faz o movimento
   * com a grade escondida parar onde foi solto em vez de saltar pro
   * centro do hex. Terreno, colisão, alcance, área e caminho seguem
   * enxergando só `q`/`r`.
   */
  offsetQ: number;
  offsetR: number;
  /** Apresentação da presença na cena; recursos vinculados são projetados da ficha canônica. */
  retratoUrl: string | null;
  /**
   * Arquivo PRÓPRIO do token (0101/0102). NÃO é uma URL: é o id do
   * asset, que só vira imagem depois de assinado. Um retrato tem UMA
   * origem — quando isto está preenchido, `retratoUrl` está nulo.
   */
  retratoImageId: string | null;
  /**
   * O que se DESENHA, com a herança do avatar da ficha já resolvida
   * (0105/0106). Igual a `retratoImageId` quando o token tem retrato
   * próprio; o avatar do personagem quando não tem.
   *
   * Os dois existem porque a interface precisa dos dois: um diz o que
   * mostrar, o outro diz o que a pessoa pode remover daqui.
   */
  retratoEfetivoId: string | null;
  pvAtual: number | null;
  pvMax: number | null;
  condicoes: string[];
  /** Flags só chegam a narrador/controlador; observador recebe null. */
  pvPublico: boolean | null;
  pePublico: boolean | null;
  manaPublica: boolean | null;
  /** Resultado do helper canônico `can_move_vtt_token`, calculado no servidor. */
  podeControlar: boolean;
  revision: number;
}

export interface CelulaTerreno {
  q: number;
  r: number;
  tipo: TipoTerreno;
}

/** O que a marcação SIGNIFICA — não confundir com `tipo`, que é a geometria. */
export type SinalMarca = "alvo" | "perigo" | "rota" | "nota";
/** Quanto tempo ela fica. Expiração real, no servidor (`expirar_marcas_da_cena`). */
export type DuracaoMarca = "persistente" | "rodada" | "combate";

export interface MarcaVtt {
  id: string;
  autorId: string;
  tipo: TipoMarca;
  sinal: SinalMarca;
  duracao: DuracaoMarca;
  /** Rodada em que nasceu — é o que permite expirar as de uma rodada só. */
  rodadaCriada: number | null;
  pontos: { q: number; r: number }[];
  texto: string | null;
  cor: CorMarca;
  espessura: number;
  opacidade: number;
  privada: boolean;
  criadaEm: string;
}

/** Os nove formatos de área de Ruptura (`16 COMBATE` → ÁREA) mais a personalizada, de apoio ao narrador. */
export type TipoArea = "esfera" | "domo" | "aura" | "linha" | "faixa" | "parede" | "cubo" | "cone" | "personalizada";
export type ModoLinhaArea = "uma_celula" | "traco_fino";

/**
 * Área de efeito PERSISTIDA. Guarda os PARÂMETROS canônicos da
 * geometria — nunca um desenho em pixels, nunca a lista congelada de
 * tokens atingidos, nunca um resultado que dependa de zoom. Células e
 * tokens afetados são recalculados no cliente a partir daqui
 * (`_dominio/areaEfeito.ts`), então movimento/rotação/troca de pegada/
 * troca de cena reavaliam sozinhos.
 *
 * Coordenadas em axial FRACIONÁRIO (a origem de uma área não precisa
 * cair no centro de uma célula), distâncias em metros, direção em graus.
 */
export interface AreaVtt {
  id: string;
  sceneId: string;
  campaignId: string;
  tipo: TipoArea;
  origemQ: number | null;
  origemR: number | null;
  direcaoGraus: number | null;
  raioM: number | null;
  /** Comprimento em metros. No tipo `cone`, é o ALCANCE. */
  comprimentoM: number | null;
  larguraM: number | null;
  /** Altura em metros dos formatos tridimensionais — informativa nesta fase (o mapa é projeção superior). */
  alturaM: number | null;
  ladoM: number | null;
  /** Sempre 45 no cone; `null` nos demais. Regra fixa aplicada pelo servidor. */
  aberturaGraus: number | null;
  nivelOrigemM: number | null;
  modoLinha: ModoLinhaArea | null;
  pontos: { q: number; r: number }[] | null;
  /** Aura: token de origem. A geometria é derivada da posição/pegada ATUAL dele. */
  tokenId: string | null;
  cor: CorMarca;
  opacidade: number;
  rotulo: string | null;
  visivel: boolean;
  criadorId: string;
  revision: number;
  criadaEm: string;
  atualizadaEm: string;
}

export type PresetObjeto =
  | "muro" | "porta" | "caixa" | "entulho" | "mesa"
  | "veiculo" | "barricada" | "coluna" | "grade" | "personalizado";
export type GrauCoberturaObjeto = "parcial" | "maior" | "total";
export type CategoriaObjeto = "fragil" | "media" | "resistente";

/**
 * Objeto tático da cena — entidade com identidade própria (migration
 * 0085), não um punhado de células pintadas de "bloqueado".
 *
 * `bloqueiaMovimento` e `terrenoProjetado` são os dois campos MECÂNICOS,
 * separados de propósito: entulho é o caso que prova a distinção — não
 * bloqueia, mas encarece o passo. Cobertura, categoria e PD são
 * informação tática MOSTRADA; a regra de cobertura segue consultiva (o
 * narrador decide), nada aqui é aplicado sozinho.
 */
export interface ObjetoVtt {
  id: string;
  sceneId: string;
  nome: string;
  preset: PresetObjeto;
  celulas: { q: number; r: number }[];
  bloqueiaMovimento: boolean;
  /** `"dificil"` projeta custo dobrado nas células ocupadas; `null` não altera o custo. */
  terrenoProjetado: "dificil" | null;
  grauCobertura: GrauCoberturaObjeto | null;
  categoria: CategoriaObjeto | null;
  pd: number | null;
  pdMax: number | null;
  /** Oculto continua BLOQUEANDO no servidor — esconder é segredo do narrador, não licença pra atravessar. */
  visivel: boolean;
  travado: boolean;
  revision: number;
}

export function linhaParaObjeto(o: Record<string, unknown>): ObjetoVtt {
  return {
    id: o.id as string,
    sceneId: o.scene_id as string,
    nome: o.nome as string,
    preset: o.preset as PresetObjeto,
    celulas: (o.celulas as { q: number; r: number }[]) ?? [],
    bloqueiaMovimento: o.bloqueia_movimento as boolean,
    terrenoProjetado: (o.terreno_projetado as "dificil" | null) ?? null,
    grauCobertura: (o.grau_cobertura as GrauCoberturaObjeto | null) ?? null,
    categoria: (o.categoria as CategoriaObjeto | null) ?? null,
    pd: (o.pd as number | null) ?? null,
    pdMax: (o.pd_max as number | null) ?? null,
    visivel: o.visivel as boolean,
    travado: o.travado as boolean,
    revision: o.revision as number,
  };
}

/**
 * Trilha de turnos persistida da cena (migration 0088), CRUA.
 *
 * `estado` fica `unknown` de propósito: as regras de combate moram em
 * `_turnos/modelo.ts` e a validação da forma em
 * `_turnos/serializacao.ts`, ambos do lado do app. Tipar aqui exigiria
 * esta camada (que é `server-only`) importar o modelo de combate de
 * dentro de `src/app/` — dependência invertida, e uma segunda cópia da
 * definição do estado só pra agradar o compilador. Storage transporta;
 * quem entende a forma valida.
 *
 * `null` na cena = não há rodadas ativas.
 */
export interface TrilhaPersistida {
  sceneId: string;
  estado: unknown;
  revision: number;
}

export interface EstadoCena {
  cena: CenaVtt;
  tokens: TokenVtt[];
  terreno: CelulaTerreno[];
  marcas: MarcaVtt[];
  areas: AreaVtt[];
  objetos: ObjetoVtt[];
  medicoes: MedicaoVtt[];
  /** `null` quando não há combate em andamento nesta cena. */
  trilha: TrilhaPersistida | null;
}

/**
 * Relê os objetos da cena. Um objeto vive em DUAS tabelas
 * (`vtt_objects` + `vtt_object_cells`), então o Realtime entrega só um
 * sinal de "mudou" e a lista consistente vem daqui — mesma disciplina de
 * invalidação sanitizada que os tokens usam desde a 0084, e o que evita
 * montar um agregado de duas tabelas a partir de eventos soltos.
 */
export async function carregarObjetosDaCena(sceneId: string): Promise<ObjetoVtt[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("read_vtt_scene_objects", { p_scene_id: sceneId });
  if (error) throw new VttStorageError(`Falha ao ler objetos: ${error.message}`, error);
  return (Array.isArray(data) ? data : []).map((o) => linhaParaObjeto(o as Record<string, unknown>));
}

/**
 * Cria um objeto tático — `create_vtt_object` (migration 0086), narrador-only
 * (a RPC reautoriza via `is_campaign_owner`; a checagem aqui é só UX-cedo, no
 * Server Action). Nasce com PD cheio (`pd === pdMax`, resolvido por quem
 * chama a partir do preset — ver `_dominio/presetsObjeto.ts`).
 */
export async function criarObjeto(params: {
  sceneId: string;
  campaignId: string;
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
}): Promise<ResultadoEscrita & { objeto?: ObjetoVtt }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("create_vtt_object", {
    p_scene_id: params.sceneId,
    p_campaign_id: params.campaignId,
    p_nome: params.nome,
    p_preset: params.preset,
    p_celulas: params.celulas,
    p_bloqueia_movimento: params.bloqueiaMovimento,
    p_terreno_projetado: params.terrenoProjetado,
    p_grau_cobertura: params.grauCobertura,
    p_categoria: params.categoria,
    p_pd: params.pd,
    p_pd_max: params.pdMax,
    p_visivel: params.visivel,
  });
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Criação recusada pelo servidor." };
  const objeto = linhaParaObjeto(data as Record<string, unknown>);
  return { ok: true, revision: objeto.revision, objeto };
}

/** Remove — DURA, sem exclusão lógica (`delete_vtt_object`). Bloqueado por `travado`, checado no servidor. */
export async function removerObjeto(objectId: string): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("delete_vtt_object", { p_object_id: objectId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/**
 * Edita campos NÃO-geométricos de um objeto — `update_vtt_object`
 * (migration 0086), narrador-only, revisão otimista. É POR AQUI que se
 * destrava (`travado` bloqueia `move`/`delete`, nunca `update`) — cinto
 * de segurança contra edição acidental de geometria, não autorização.
 * A RPC substitui TODOS os campos de uma vez (sem `PATCH` parcial): quem
 * chama sempre manda o objeto inteiro de volta, inclusive os campos que
 * não mudaram.
 */
export async function atualizarObjeto(params: {
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
}): Promise<ResultadoEscrita & { objeto?: ObjetoVtt }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("update_vtt_object", {
    p_object_id: params.objectId,
    p_expected_revision: params.revisionEsperada,
    p_nome: params.nome,
    p_bloqueia_movimento: params.bloqueiaMovimento,
    p_terreno_projetado: params.terrenoProjetado,
    p_grau_cobertura: params.grauCobertura,
    p_categoria: params.categoria,
    p_pd: params.pd,
    p_pd_max: params.pdMax,
    p_visivel: params.visivel,
    p_travado: params.travado,
  });
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Edição recusada pelo servidor." };
  const objeto = linhaParaObjeto(data as Record<string, unknown>);
  return { ok: true, revision: objeto.revision, objeto };
}

/**
 * Move (redefine as células) — `move_vtt_object`, revisão otimista.
 * Bloqueado por `travado` no servidor, mesma trava de `removerObjeto`.
 */
export async function moverObjeto(params: {
  objectId: string;
  revisionEsperada: number;
  celulas: { q: number; r: number }[];
}): Promise<ResultadoEscrita & { objeto?: ObjetoVtt }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("move_vtt_object", {
    p_object_id: params.objectId,
    p_expected_revision: params.revisionEsperada,
    p_celulas: params.celulas,
  });
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Movimento recusado pelo servidor." };
  const objeto = linhaParaObjeto(data as Record<string, unknown>);
  return { ok: true, revision: objeto.revision, objeto };
}

/**
 * Aplica dano (`p_delta` negativo) ou reparo (positivo) — `damage_vtt_object`,
 * revisão otimista. O servidor SEMPRE clampa entre 0 e `pdMax`; chegar a 0
 * NÃO remove nem transforma o objeto sozinho — virar entulho ou excluir é
 * decisão do narrador, feita à parte (ver `atualizarObjeto`/`removerObjeto`).
 */
export async function danificarObjeto(params: {
  objectId: string;
  revisionEsperada: number;
  delta: number;
}): Promise<ResultadoEscrita & { objeto?: ObjetoVtt }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("damage_vtt_object", {
    p_object_id: params.objectId,
    p_expected_revision: params.revisionEsperada,
    p_delta: params.delta,
  });
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Dano recusado pelo servidor." };
  const objeto = linhaParaObjeto(data as Record<string, unknown>);
  return { ok: true, revision: objeto.revision, objeto };
}

export class VttStorageError extends Error {
  constructor(message: string, readonly causa?: unknown) {
    super(message);
    this.name = "VttStorageError";
  }
}

/**
 * O id da cena onde a MESA está — o palco (`vtt_campaign_stage`, 0111).
 *
 * Antes da 0111 esta pergunta era "a cena `ativa` da campanha", e era a
 * mesma pergunta que "a cena que estou olhando". Deixaram de ser: o
 * narrador pode estar em qualquer outra. Tudo que é da MESA (rodada,
 * dock, encerrar combate) segue o palco; só a tela do VTT segue a cena
 * escolhida por quem está olhando.
 *
 * Devolve `null` numa campanha ainda sem cena — e, para um jogador de
 * uma campanha cujo palco não existe, a RLS já devolveria vazio de
 * qualquer forma.
 */
/**
 * A cena de QUEM PERGUNTA — não necessariamente a da mesa.
 *
 * Desde a 0118 as duas podem divergir: um jogador mandado para outra
 * cena tem a dele. A regra (`atribuição ?? palco`) mora no banco
 * (`vtt_minha_cena`), e é de propósito que este cliente não a
 * reimplemente — duas cópias divergem no primeiro caso difícil.
 *
 * Para o narrador, que não tem atribuição, isto continua devolvendo o
 * palco, que é o que todo chamador daqui sempre esperou.
 */
export async function idDaCenaDoUsuario(campaignId: string): Promise<string | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("vtt_minha_cena", { p_campaign_id: campaignId });
  if (error) throw new VttStorageError(`Falha ao descobrir a cena: ${error.message}`, error);
  return (data as string | null) ?? null;
}

/** O palco com a REVISÃO junto. */
export interface Palco {
  sceneId: string;
  /**
   * A revisão que `present_vtt_scene` confere. Quem apresenta manda a
   * que leu; se o palco mudou nesse meio-tempo (outra aba do mesmo
   * narrador, um co-narrador), o clique é recusado em vez de aplicado
   * por cima de uma decisão que já não era a mais recente.
   */
  revision: number;
}

/**
 * Onde os JOGADORES estão, com a revisão.
 *
 * É também o ponto de reconciliação do Realtime: um cliente que ficou
 * offline perdeu os eventos de palco daquele intervalo, e reler é a
 * única forma de descobrir para onde a mesa foi sem depender de um
 * histórico que o canal não guarda.
 */
export async function lerPalco(campaignId: string): Promise<Palco | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_campaign_stage")
    .select("presented_scene_id, revision")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new VttStorageError(`Falha ao ler o palco da campanha: ${error.message}`, error);
  if (!data?.presented_scene_id) return null;
  return {
    sceneId: data.presented_scene_id as string,
    revision: (data.revision as number | undefined) ?? 1,
  };
}

/** Um cartão do catálogo — o que `list_vtt_scenes` (0111) devolve por cena. */
export interface CartaoCena {
  id: string;
  nome: string;
  local: string | null;
  resumo: string | null;
  largura: number;
  altura: number;
  /** Aparência da GRADE (0122) — editável por qualquer cena, pela folha da gaveta. */
  gradeCor: string;
  gradeOpacidade: number;
  /** Pixels por célula (0123) — só conversão, para encaixar mapas prontos. */
  celulaPx: number;
  ordem: number;
  revision: number;
  arquivadaEm: string | null;
  apresentada: boolean;
  duplicadaDe: string | null;
  /** Imagem escolhida a dedo ou, na falta, o fundo da cena. A URL assinada sai do serviço de imagens. */
  miniaturaImageId: string | null;
  /** Pasta do catálogo (0117). Nula = raiz, que é o caso normal. */
  pastaId: string | null;
  criadaEm: string;
  atualizadaEm: string;
}

/**
 * O catálogo de cenas da campanha.
 *
 * Jogador recebe UMA cena (a apresentada) — não porque a interface
 * esconde, mas porque `list_vtt_scenes` não tem o que contar a ele.
 */
export async function listarCenas(campaignId: string, incluirArquivadas = false): Promise<CartaoCena[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("list_vtt_scenes", {
    p_campaign_id: campaignId,
    p_incluir_arquivadas: incluirArquivadas,
  });
  if (error) throw new VttStorageError(`Falha ao listar as cenas: ${error.message}`, error);

  return (Array.isArray(data) ? (data as Record<string, unknown>[]) : []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    local: (c.local as string | null) ?? null,
    resumo: (c.resumo as string | null) ?? null,
    largura: c.largura as number,
    altura: c.altura as number,
    gradeCor: (c.grade_cor as string | null) ?? GRADE_COR_PADRAO,
    gradeOpacidade: Number(c.grade_opacidade ?? GRADE_OPACIDADE_PADRAO),
    celulaPx: Number(c.celula_px ?? CELULA_PX_PADRAO),
    ordem: c.ordem as number,
    revision: c.revision as number,
    arquivadaEm: (c.arquivada_em as string | null) ?? null,
    apresentada: c.apresentada === true,
    duplicadaDe: (c.duplicada_de as string | null) ?? null,
    miniaturaImageId: (c.miniatura_image_id as string | null) ?? null,
    pastaId: (c.pasta_id as string | null) ?? null,
    criadaEm: c.criada_em as string,
    atualizadaEm: c.atualizada_em as string,
  }));
}

/** Uma cena recém-criada, como `create_vtt_scene` devolve. */
export interface ResultadoCena {
  ok: boolean;
  erro?: string;
  cena?: CartaoCena;
}

/**
 * Cria uma cena vazia no fim do catálogo.
 *
 * Não move a mesa — criar e apresentar são gestos separados, e é essa
 * separação que permite preparar a próxima cena com jogo em andamento.
 */
export async function criarCena(params: {
  campaignId: string;
  nome: string;
  local?: string | null;
  resumo?: string | null;
  largura?: number;
  altura?: number;
  /** Pixels por célula — o divisor que produziu `largura`/`altura` (0123). */
  celulaPx?: number;
}): Promise<ResultadoCena> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("create_vtt_scene", {
    p_campaign_id: params.campaignId,
    p_nome: params.nome,
    p_local: params.local ?? null,
    p_resumo: params.resumo ?? null,
    p_largura: params.largura ?? 26,
    p_altura: params.altura ?? 18,
    p_celula_px: params.celulaPx ?? CELULA_PX_PADRAO,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!linha) return { ok: false, erro: "A cena não foi criada." };
  return { ok: true, cena: cartaoDeLinhaDeCena(linha) };
}

/**
 * Uma linha CRUA de `vtt_scenes` virando cartão.
 *
 * Serve a `create_vtt_scene` e `duplicate_vtt_scene`, que devolvem a
 * linha da tabela — colunas em inglês, sem o `apresentada` e sem a
 * miniatura derivada que `list_vtt_scenes` calcula. Nenhuma das duas
 * pode nascer apresentada, então `apresentada` é `false` por
 * construção, não por suposição.
 */
function cartaoDeLinhaDeCena(linha: Record<string, unknown>): CartaoCena {
  return {
    id: linha.id as string,
    nome: linha.nome as string,
    local: (linha.local as string | null) ?? null,
    resumo: (linha.resumo as string | null) ?? null,
    largura: linha.largura as number,
    altura: linha.altura as number,
    gradeCor: (linha.grade_cor as string | null) ?? GRADE_COR_PADRAO,
    gradeOpacidade: Number(linha.grade_opacidade ?? GRADE_OPACIDADE_PADRAO),
    celulaPx: Number(linha.celula_px ?? CELULA_PX_PADRAO),
    ordem: linha.ordem as number,
    revision: linha.revision as number,
    arquivadaEm: (linha.archived_at as string | null) ?? null,
    apresentada: false,
    duplicadaDe: (linha.duplicated_from_id as string | null) ?? null,
    miniaturaImageId: (linha.thumbnail_image_id as string | null) ?? null,
    pastaId: (linha.folder_id as string | null) ?? null,
    criadaEm: linha.created_at as string,
    atualizadaEm: linha.updated_at as string,
  };
}

/**
 * Move a MESA para outra cena.
 *
 * `revisionEsperada` é opcional porque o primeiro "Apresentar" de uma
 * sessão não tem revisão lida ainda. Quando vem, o servidor recusa o
 * clique que foi decidido em cima de um palco já mudado — o caso de
 * duas abas do mesmo narrador.
 */
export async function apresentarCena(params: {
  campaignId: string;
  sceneId: string;
  revisionEsperada?: number | null;
}): Promise<ResultadoEscrita & { presentedSceneId?: string }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("present_vtt_scene", {
    p_campaign_id: params.campaignId,
    p_scene_id: params.sceneId,
    p_expected_revision: params.revisionEsperada ?? null,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    ok: true,
    revision: (linha?.revision as number | undefined) ?? undefined,
    presentedSceneId: (linha?.presented_scene_id as string | undefined) ?? params.sceneId,
  };
}

/**
 * Uma pasta do catálogo, com o caminho já montado pelo banco (0117).
 *
 * `caminho` e `nivel` vêm prontos porque a recursão é do banco —
 * remontar a corrente de pais no cliente a cada render seria errar
 * exatamente no lugar onde errar aparece (o breadcrumb).
 */
export interface PastaCena {
  id: string;
  parentId: string | null;
  nome: string;
  ordem: number;
  nivel: number;
  caminho: string;
}

/** As pastas da campanha. Lista vazia para quem não é narrador. */
export async function listarPastas(campaignId: string): Promise<PastaCena[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("list_vtt_scene_folders", { p_campaign_id: campaignId });
  if (error) throw new VttStorageError(`Falha ao listar as pastas: ${error.message}`, error);
  return (Array.isArray(data) ? (data as Record<string, unknown>[]) : []).map((f) => ({
    id: f.id as string,
    parentId: (f.parent_id as string | null) ?? null,
    nome: f.nome as string,
    ordem: f.ordem as number,
    nivel: f.nivel as number,
    caminho: f.caminho as string,
  }));
}

function pastaDeLinha(linha: Record<string, unknown>, nivel = 1, caminho?: string): PastaCena {
  return {
    id: linha.id as string,
    parentId: (linha.parent_id as string | null) ?? null,
    nome: linha.nome as string,
    ordem: linha.ordem as number,
    // As RPCs de escrita devolvem a LINHA, que não tem nível nem
    // caminho (os dois são derivados da árvore). Quem escreve relê a
    // lista logo em seguida; estes valores são só o preenchimento do
    // intervalo.
    nivel,
    caminho: caminho ?? (linha.nome as string),
  };
}

export async function criarPasta(params: {
  campaignId: string;
  nome: string;
  parentId?: string | null;
}): Promise<{ ok: boolean; erro?: string; pasta?: PastaCena }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("create_vtt_scene_folder", {
    p_campaign_id: params.campaignId,
    p_nome: params.nome,
    p_parent_id: params.parentId ?? null,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!linha) return { ok: false, erro: "A pasta não foi criada." };
  return { ok: true, pasta: pastaDeLinha(linha) };
}

export async function renomearPasta(params: { folderId: string; nome: string }): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("rename_vtt_scene_folder", {
    p_folder_id: params.folderId, p_nome: params.nome,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Reparenta. Ciclo e quinto nível são recusados pelo gatilho (0117). */
export async function moverPasta(params: {
  folderId: string;
  novoParentId: string | null;
}): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("move_vtt_scene_folder", {
    p_folder_id: params.folderId, p_novo_parent_id: params.novoParentId,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** O que a exclusão em cascata levou — e o que ela poupou. */
export interface ResumoExclusaoPasta {
  cenas: number;
  subpastas: number;
  /** Nome da cena APRESENTADA, quando ela estava na pasta e foi poupada (0129). */
  preservada: string | null;
}

/**
 * Apaga a pasta, as subpastas e as cenas delas (migration 0129). Exige
 * o nome da pasta digitado — mesmo preço de apagar UMA cena, pra uma
 * ação que apaga várias.
 */
export async function excluirPasta(folderId: string, nomeConfirmacao: string): Promise<ResultadoEscrita & { resumo?: ResumoExclusaoPasta }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("delete_vtt_scene_folder", {
    p_folder_id: folderId,
    p_nome_confirmacao: nomeConfirmacao,
  });
  if (error) return { ok: false, erro: error.message };
  const bruto = (data ?? {}) as Partial<Record<keyof ResumoExclusaoPasta, unknown>>;
  return {
    ok: true,
    resumo: {
      cenas: typeof bruto.cenas === "number" ? bruto.cenas : 0,
      subpastas: typeof bruto.subpastas === "number" ? bruto.subpastas : 0,
      preservada: typeof bruto.preservada === "string" ? bruto.preservada : null,
    },
  };
}

/** Move uma cena para uma pasta, ou para a raiz com `null`. */
export async function moverCenaParaPasta(params: {
  sceneId: string;
  folderId: string | null;
}): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("move_vtt_scene_to_folder", {
    p_scene_id: params.sceneId, p_folder_id: params.folderId,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

// ── Dividir o grupo (0118) ──────────────────────────────────────────
/** Onde cada jogador está, para os indicadores do catálogo. */
export interface PosicaoJogador {
  userId: string;
  nome: string;
  sceneId: string | null;
  /** Foi MANDADO para lá (decisão de alguém) ou só segue o palco (padrão). */
  atribuido: boolean;
}

export async function listarPosicoesJogadores(campaignId: string): Promise<PosicaoJogador[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("list_vtt_player_placements", { p_campaign_id: campaignId });
  if (error) throw new VttStorageError(`Falha ao listar os jogadores: ${error.message}`, error);
  return (Array.isArray(data) ? (data as Record<string, unknown>[]) : []).map((j) => ({
    userId: j.user_id as string,
    nome: j.nome as string,
    sceneId: (j.scene_id as string | null) ?? null,
    atribuido: j.atribuido === true,
  }));
}

/**
 * Manda jogadores para uma cena.
 *
 * Mandar para a cena do PALCO remove a atribuição em vez de gravá-la —
 * decidido no servidor (0118), não aqui: é a diferença entre "está aqui
 * porque mandei" e "está aqui porque a mesa está", e só a segunda
 * acompanha a próxima apresentação.
 */
export async function moverJogadores(params: {
  campaignId: string;
  userIds: string[];
  sceneId: string;
}): Promise<ResultadoEscrita & { total?: number }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("move_players_to_scene", {
    p_campaign_id: params.campaignId,
    p_user_ids: params.userIds,
    p_scene_id: params.sceneId,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, total: typeof data === "number" ? data : undefined };
}

/** Todo mundo volta a seguir o palco. */
export async function reagruparJogadores(campaignId: string): Promise<ResultadoEscrita & { total?: number }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("regroup_vtt_players", { p_campaign_id: campaignId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, total: typeof data === "number" ? data : undefined };
}

/** Os dois modos que o diálogo de duplicação oferece (0116). */
export type ModoDuplicacao = "completa" | "mapa";

/**
 * Copia uma cena inteira. Transação única no servidor, com os ids de
 * token e objeto remapeados — ver `duplicate_vtt_scene` (0116) para o
 * que deliberadamente NÃO é copiado.
 */
export async function duplicarCena(params: {
  sceneId: string;
  nome?: string | null;
  modo?: ModoDuplicacao;
}): Promise<ResultadoCena> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("duplicate_vtt_scene", {
    p_scene_id: params.sceneId,
    p_nome: params.nome ?? null,
    p_modo: params.modo ?? "completa",
  });
  if (error) return { ok: false, erro: error.message };
  const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!linha) return { ok: false, erro: "A cena não foi duplicada." };
  return { ok: true, cena: cartaoDeLinhaDeCena(linha) };
}

/**
 * Tira a cena do catálogo principal. Recusada na cena apresentada — a
 * mesa ficaria numa cena congelada (o gatilho da 0115).
 */
export async function arquivarCena(sceneId: string): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("archive_vtt_scene", { p_scene_id: sceneId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Devolve a cena ao catálogo. */
export async function restaurarCena(sceneId: string): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("restore_vtt_scene", { p_scene_id: sceneId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/**
 * Apaga a cena e, em cascata, o conteúdo dela.
 *
 * `nomeConfirmacao` é conferido no SERVIDOR contra o nome real. Não é
 * cerimônia: é o que impede uma chamada errada do cliente de apagar
 * sessões inteiras de mesa. Arquivar continua sendo o caminho.
 */
export async function excluirCena(params: {
  sceneId: string;
  nomeConfirmacao: string;
}): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("delete_vtt_scene", {
    p_scene_id: params.sceneId,
    p_nome_confirmacao: params.nomeConfirmacao,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Renumera o catálogo pela ordem da lista. Devolve o catálogo já reordenado. */
export async function reordenarCenas(params: {
  campaignId: string;
  sceneIds: string[];
}): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("reorder_vtt_scenes", {
    p_campaign_id: params.campaignId,
    p_scene_ids: params.sceneIds,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/**
 * Carrega UMA cena, por id, com tudo que a mesa precisa.
 *
 * Devolve `null` quando a cena não existe OU quando quem pede não pode
 * vê-la — os dois casos são o mesmo `null` de propósito: distinguir
 * "não existe" de "existe e não é sua" contaria ao jogador que o
 * narrador tem uma cena escondida, que é exatamente o que a 0112
 * passou a impedir.
 */
export async function carregarCena(sceneId: string): Promise<EstadoCena | null> {
  const client = await getScopedTableClient();

  const { data: cenaRow, error: erroCena } = await client
    .from("vtt_scenes")
    .select("id, campaign_id, nome, local, resumo, largura, altura, grade_cor, grade_opacidade, celula_px, revision, camadas")
    .eq("id", sceneId)
    .maybeSingle();

  if (erroCena) throw new VttStorageError(`Falha ao ler a cena: ${erroCena.message}`, erroCena);
  if (!cenaRow) return null;

  const [tokensRes, terrenoRes, marcasRes, areasRes, objetosRes, medicoesRes, trilhaRes] = await Promise.all([
    client.rpc("read_vtt_scene_tokens", { p_scene_id: sceneId }),
    client.from("vtt_terrain").select("q, r, tipo").eq("scene_id", sceneId),
    client.from("vtt_marks")
      .select("id, autor_id, tipo, sinal, duracao, rodada_criada, pontos, texto, cor, espessura, opacidade, privada, created_at")
      .eq("scene_id", sceneId)
      .order("created_at", { ascending: true }),
    client.from("vtt_areas")
      .select(COLUNAS_AREA)
      .eq("scene_id", sceneId)
      .order("created_at", { ascending: true }),
    // Objetos vêm por RPC (não leitura direta): a projeção já resolve
    // visibilidade e agrega as células numa consulta só — ler as duas
    // tabelas daqui exigiria um segundo round-trip e reimplementaria a
    // regra de quem enxerga o quê no cliente.
    client.rpc("read_vtt_scene_objects", { p_scene_id: sceneId }),
    client.from("vtt_measurements")
      .select("id, autor_id, pontos, cor, rotulo, privada, created_at")
      .eq("scene_id", sceneId)
      .order("created_at", { ascending: true }),
    // Trilha na MESMA carga da cena: é o que faz um F5 no meio do
    // combate voltar na rodada certa, sem um segundo round-trip que
    // deixaria os trilhos piscando "sem combate" antes de aparecer.
    client.from("vtt_turn_tracks").select("scene_id, estado, revision").eq("scene_id", sceneId).maybeSingle(),
  ]);

  if (tokensRes.error) throw new VttStorageError(`Falha ao ler tokens: ${tokensRes.error.message}`, tokensRes.error);
  if (terrenoRes.error) throw new VttStorageError(`Falha ao ler terreno: ${terrenoRes.error.message}`, terrenoRes.error);
  if (marcasRes.error) throw new VttStorageError(`Falha ao ler marcações: ${marcasRes.error.message}`, marcasRes.error);
  if (areasRes.error) throw new VttStorageError(`Falha ao ler áreas: ${areasRes.error.message}`, areasRes.error);
  if (objetosRes.error) throw new VttStorageError(`Falha ao ler objetos: ${objetosRes.error.message}`, objetosRes.error);
  if (medicoesRes.error) throw new VttStorageError(`Falha ao ler medições: ${medicoesRes.error.message}`, medicoesRes.error);
  if (trilhaRes.error) throw new VttStorageError(`Falha ao ler a trilha de turnos: ${trilhaRes.error.message}`, trilhaRes.error);

  return {
    trilha: trilhaRes.data
      ? { sceneId, estado: trilhaRes.data.estado as unknown, revision: trilhaRes.data.revision as number }
      : null,
    cena: {
      id: sceneId,
      campaignId: cenaRow.campaign_id as string,
      nome: cenaRow.nome as string,
      local: (cenaRow.local as string | null) ?? null,
      resumo: (cenaRow.resumo as string | null) ?? null,
      largura: cenaRow.largura as number,
      gradeCor: (cenaRow.grade_cor as string | null) ?? GRADE_COR_PADRAO,
      gradeOpacidade: Number(cenaRow.grade_opacidade ?? GRADE_OPACIDADE_PADRAO),
      celulaPx: Number(cenaRow.celula_px ?? CELULA_PX_PADRAO),
      altura: cenaRow.altura as number,
      revision: cenaRow.revision as number,
      camadas: (cenaRow.camadas as Record<string, unknown> | null) ?? {},
    },
    tokens: (Array.isArray(tokensRes.data) ? tokensRes.data : []).map((t) => linhaParaTokenVtt(t as Record<string, unknown>)),
    terreno: (terrenoRes.data ?? []).map((c) => ({ q: c.q as number, r: c.r as number, tipo: c.tipo as TipoTerreno })),
    areas: (areasRes.data ?? []).map((a) => linhaParaArea(a as Record<string, unknown>)),
    objetos: (Array.isArray(objetosRes.data) ? objetosRes.data : []).map((o) => linhaParaObjeto(o as Record<string, unknown>)),
    medicoes: (medicoesRes.data ?? []).map((m) => ({
      id: m.id as string,
      autorId: m.autor_id as string,
      pontos: (m.pontos as { q: number; r: number }[]) ?? [],
      cor: m.cor as CorMarca,
      rotulo: (m.rotulo as string | null) ?? null,
      privada: m.privada === true,
      criadaEm: m.created_at as string,
    })),
    marcas: (marcasRes.data ?? []).map((m) => ({
      id: m.id as string,
      autorId: m.autor_id as string,
      tipo: m.tipo as TipoMarca,
      sinal: (m.sinal as SinalMarca | null) ?? "alvo",
      duracao: (m.duracao as DuracaoMarca | null) ?? "persistente",
      rodadaCriada: (m.rodada_criada as number | null) ?? null,
      pontos: (m.pontos as { q: number; r: number }[]) ?? [],
      texto: (m.texto as string | null) ?? null,
      cor: m.cor as CorMarca,
      espessura: m.espessura as number,
      opacidade: Number(m.opacidade),
      privada: m.privada as boolean,
      criadaEm: m.created_at as string,
    })),
  };
}

/**
 * Carrega a cena em que os JOGADORES estão.
 *
 * É o ponto de entrada de quem não escolhe cena: o jogador ao abrir a
 * mesa, e o narrador na primeira carga (antes de o catálogo dizer onde
 * ele parou). Duas idas ao banco em vez de uma — resolver o palco e
 * depois ler a cena — porque a alternativa seria um join que devolve a
 * cena inteira só para descobrir o id.
 */
export async function carregarCenaApresentada(campaignId: string): Promise<EstadoCena | null> {
  const sceneId = await idDaCenaDoUsuario(campaignId);
  if (!sceneId) return null;
  return carregarCena(sceneId);
}

/**
 * @deprecated Use `carregarCenaApresentada` (mesa) ou `carregarCena`
 * (uma cena específica). Fica enquanto houver chamador antigo — o nome
 * mente desde a 0111, porque "ativa" deixou de ser uma cena só.
 */
export const carregarCenaAtiva = carregarCenaApresentada;

export interface ResultadoEscrita {
  ok: boolean;
  /** Mensagem curta pra UI quando `ok` é falso. */
  erro?: string;
  /** Revisão nova, quando a operação devolve uma. */
  revision?: number;
}

/**
 * Move um token pela ROTA inteira (não só o destino).
 *
 * Auditoria pós-0065: a versão anterior fazia `UPDATE` direto na
 * tabela, e a tabela concedia `UPDATE` genérico de TODAS as colunas a
 * `authenticated` — um jogador com permissão de mover podia, na mesma
 * chamada, trocar `character_id`/`visivel`/`bloqueado`/`lado`/`nome`.
 * Pior: só o CLIENTE validava limites do mapa e célula bloqueada
 * (`_dominio/movimento.ts`), então uma chamada direta ao banco (fora da
 * UI) podia mover um token pra fora da grade ou atravessar bloqueio.
 *
 * A migration 0066 fechou os dois: revogou o `UPDATE` genérico da
 * tabela e criou `move_vtt_token` (SECURITY DEFINER), que só altera
 * `q`/`r`/`revision`/`updated_at`, e REVALIDA a rota inteira contra
 * limites e bloqueio no servidor — a mesma checagem que
 * `_dominio/movimento.ts` faz no cliente, agora também do lado que não
 * pode ser contornado.
 *
 * `rota` inclui a ORIGEM (primeiro ponto) — é o que permite ao servidor
 * checar cada célula ENTRADA, não só o destino final.
 */
export async function moverToken(params: {
  tokenId: string;
  rota: { q: number; r: number }[];
  revisionEsperada: number;
  /**
   * Onde dentro da célula âncora o token pousa (migration 0094). Só
   * desenho — a célula ocupada continua sendo o fim da rota. Omitido
   * (ou zero) recentraliza, que é o comportamento com a grade à vista.
   */
  offset?: { q: number; r: number };
}): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("move_vtt_token", {
    p_token_id: params.tokenId,
    p_rota: params.rota,
    p_expected_revision: params.revisionEsperada,
    p_offset_q: params.offset?.q ?? 0,
    p_offset_r: params.offset?.r ?? 0,
  });

  if (error) {
    // Mensagens de `raise exception` no Postgres chegam aqui —
    // já são o texto explicativo que a UI mostra (limites, bloqueio,
    // permissão, revisão desatualizada).
    return { ok: false, erro: error.message };
  }
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return { ok: false, erro: "Movimento recusado pelo servidor." };
  return { ok: true, revision: linha.revision as number };
}

/**
 * Move VÁRIOS tokens como UMA operação — `move_vtt_tokens`
 * (migration 0126).
 *
 * Não é açúcar sobre N chamadas de `moverToken`: chamadas separadas
 * validam colisão contra a posição persistida dos colegas de grupo,
 * que ainda não saíram do lugar, então uma formação andando na própria
 * direção era recusada com "Posição indisponível" (um token ia, o
 * outro voltava). Aqui os membros do lote não são obstáculo entre si
 * DURANTE o percurso — só as posições finais precisam ser distintas —
 * e tudo acontece numa transação: ou todos se movem, ou nenhum.
 */
export async function moverTokens(params: {
  movimentos: { tokenId: string; rota: { q: number; r: number }[]; revisionEsperada: number }[];
}): Promise<{ ok: boolean; erro?: string; revisoes?: { id: string; revision: number }[] }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("move_vtt_tokens", {
    p_movimentos: params.movimentos.map((m) => ({
      token_id: m.tokenId,
      rota: m.rota,
      expected_revision: m.revisionEsperada,
    })),
  });

  if (error) return { ok: false, erro: error.message };
  const linhas = (Array.isArray(data) ? data : data ? [data] : []) as { id: string; revision: number }[];
  if (linhas.length === 0) return { ok: false, erro: "Movimento recusado pelo servidor." };
  return { ok: true, revisoes: linhas.map((l) => ({ id: l.id, revision: l.revision })) };
}

/**
 * Rotaciona um token — `rotacionar_vtt_token` (migration 0071),
 * mesma autorização/concorrência de `moverToken` (narrador ou quem
 * controla o personagem, revisão otimista). O SERVIDOR recalcula a
 * pegada na orientação nova e valida limites/bloqueio/colisão contra
 * ela — o cliente nunca decide sozinho que uma rotação é válida.
 */
export async function rotacionarToken(params: {
  tokenId: string;
  orientacao: number;
  revisionEsperada: number;
}): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("rotacionar_vtt_token", {
    p_token_id: params.tokenId,
    p_orientacao: params.orientacao,
    p_expected_revision: params.revisionEsperada,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return { ok: false, erro: "Rotação recusada pelo servidor." };
  return { ok: true, revision: linha.revision as number };
}

/**
 * Trava/destrava e mostra/oculta um token — só narrador
 * (`set_vtt_token_flags`, migration 0066). Ligada ao menu contextual
 * do token (gerenciamento completo, migration 0073).
 */
export async function definirFlagsToken(params: {
  tokenId: string;
  bloqueado: boolean;
  visivel: boolean;
}): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("set_vtt_token_flags", {
    p_token_id: params.tokenId,
    p_bloqueado: params.bloqueado,
    p_visivel: params.visivel,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return { ok: false, erro: "Alteração recusada pelo servidor." };
  return { ok: true, revision: linha.revision as number };
}

function linhaParaTokenVtt(linha: Record<string, unknown>): TokenVtt {
  return {
    id: linha.id as string,
    sceneId: linha.scene_id as string,
    characterId: (linha.character_id as string | null) ?? null,
    nome: linha.nome as string,
    sigla: linha.sigla as string,
    lado: linha.lado as TokenVtt["lado"],
    vertente: linha.vertente as string,
    q: linha.q as number,
    r: linha.r as number,
    tamanho: linha.tamanho as TokenVtt["tamanho"],
    orientacao: linha.orientacao as number,
    pegadaPersonalizada: (linha.pegada_personalizada as { q: number; r: number }[] | null) ?? null,
    bloqueado: linha.bloqueado as boolean,
    visivel: linha.visivel as boolean,
    retratoUrl: (linha.retrato_url as string | null) ?? null,
    retratoImageId: (linha.retrato_image_id as string | null) ?? null,
    retratoEfetivoId: (linha.retrato_efetivo_id as string | null) ?? null,
    offsetQ: Number(linha.offset_q ?? 0) || 0,
    offsetR: Number(linha.offset_r ?? 0) || 0,
    pvAtual: (linha.pv_atual as number | null) ?? null,
    pvMax: (linha.pv_max as number | null) ?? null,
    condicoes: (linha.condicoes as string[] | null) ?? [],
    pvPublico: typeof linha.pv_publico === "boolean" ? linha.pv_publico : null,
    pePublico: typeof linha.pe_publico === "boolean" ? linha.pe_publico : null,
    manaPublica: typeof linha.mana_publica === "boolean" ? linha.mana_publica : null,
    podeControlar: linha.pode_controlar === true,
    revision: linha.revision as number,
  };
}

export interface ResultadoEscritaToken extends ResultadoEscrita {
  token?: TokenVtt;
}

/**
 * Cria um token novo — narrador-only (`create_vtt_token`, migration
 * 0073). O servidor revalida a pegada inteira (limites, bloqueio,
 * colisão) na posição pedida — o preview no cliente é só UX.
 */
export async function criarToken(params: {
  sceneId: string;
  campaignId: string;
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
}): Promise<ResultadoEscritaToken> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("create_vtt_token", {
    p_scene_id: params.sceneId,
    p_campaign_id: params.campaignId,
    p_nome: params.nome,
    p_sigla: params.sigla,
    p_lado: params.lado,
    p_vertente: params.vertente,
    p_tamanho: params.tamanho,
    p_orientacao: params.orientacao,
    p_pegada_personalizada: params.pegadaPersonalizada,
    p_q: params.q,
    p_r: params.r,
    p_character_id: params.characterId,
    p_visivel: params.visivel,
    p_bloqueado: params.bloqueado,
    p_retrato_url: params.retratoUrl,
    p_pv_atual: params.pvAtual,
    p_pv_max: params.pvMax,
    p_condicoes: params.condicoes,
  }).single();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Criação recusada pelo servidor." };
  const token = linhaParaTokenVtt(data as Record<string, unknown>);
  return { ok: true, revision: token.revision, token };
}

/** Edita campos não-geométricos de um token — narrador-only, revisão otimista. */
export async function atualizarToken(params: {
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
}): Promise<ResultadoEscritaToken> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("update_vtt_token", {
    p_token_id: params.tokenId,
    p_nome: params.nome,
    p_sigla: params.sigla,
    p_lado: params.lado,
    p_vertente: params.vertente,
    p_character_id: params.characterId,
    p_retrato_url: params.retratoUrl,
    p_pv_atual: params.pvAtual,
    p_pv_max: params.pvMax,
    p_condicoes: params.condicoes,
    p_expected_revision: params.revisionEsperada,
  }).single();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Edição recusada pelo servidor." };
  const token = linhaParaTokenVtt(data as Record<string, unknown>);
  return { ok: true, revision: token.revision, token };
}

/**
 * Edita TUDO que o formulário de edição pode mudar — campos de
 * apresentação/estado E, quando de fato mudou, o tamanho — numa única
 * RPC atômica (`edit_vtt_token`, migration 0076). Corrige uma
 * persistência PARCIAL real: chamar `atualizarToken` seguido de
 * `redimensionarToken` (duas RPCs, duas transações) deixava o restante
 * da edição salvo mesmo quando o redimensionar era recusado por
 * colisão/borda/bloqueio. Uma única revisão sobe, uma única
 * invalidação é emitida — nunca duas. Nunca move nem gira: o servidor
 * revalida a pegada nova contra a âncora/orientação JÁ PERSISTIDAS,
 * não aceita nenhuma das duas como parâmetro.
 */
export async function editarToken(params: {
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
}): Promise<ResultadoEscritaToken> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("edit_vtt_token", {
    p_token_id: params.tokenId,
    p_nome: params.nome,
    p_sigla: params.sigla,
    p_lado: params.lado,
    p_vertente: params.vertente,
    p_character_id: params.characterId,
    p_retrato_url: params.retratoUrl,
    p_pv_atual: params.pvAtual,
    p_pv_max: params.pvMax,
    p_condicoes: params.condicoes,
    p_tamanho: params.tamanho,
    p_expected_revision: params.revisionEsperada,
  }).single();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Edição recusada pelo servidor." };
  const token = linhaParaTokenVtt(data as Record<string, unknown>);
  return { ok: true, revision: token.revision, token };
}

/**
 * Muda tamanho/orientação/pegada — âncora preservada
 * (`resize_vtt_token`, migration 0073). Reusa `_dominio/pegada.ts` pro
 * cliente montar o preview; o servidor recalcula a pegada sozinho
 * (`vtt_pegada_celulas`) e revalida contra limites/bloqueio/colisão —
 * nunca confia na lista de células que o cliente eventualmente exiba.
 * O formulário de editar usa `editarToken` (acima), atômica — esta
 * função fica intocada só porque tem suíte própria de autorização
 * (`check-vtt-gerenciamento-tokens.ts`); não é mais chamada pela UI.
 */
export async function redimensionarToken(params: {
  tokenId: string;
  tamanho: TokenVtt["tamanho"];
  orientacao: number;
  pegadaPersonalizada: { q: number; r: number }[] | null;
  revisionEsperada: number;
}): Promise<ResultadoEscritaToken> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("resize_vtt_token", {
    p_token_id: params.tokenId,
    p_tamanho: params.tamanho,
    p_orientacao: params.orientacao,
    p_pegada_personalizada: params.pegadaPersonalizada,
    p_expected_revision: params.revisionEsperada,
  }).single();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Alteração de tamanho recusada pelo servidor." };
  const token = linhaParaTokenVtt(data as Record<string, unknown>);
  return { ok: true, revision: token.revision, token };
}

/**
 * Duplica — a posição já vem escolhida por quem chama (busca
 * determinística por anel hexagonal, ver `VttClient.tsx`); o servidor
 * só VALIDA aquela posição, nunca escolhe uma sozinho nem confia que o
 * cliente já garantiu que cabe.
 */
export async function duplicarToken(params: {
  tokenId: string;
  q: number;
  r: number;
}): Promise<ResultadoEscritaToken> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("duplicate_vtt_token", {
    p_token_id: params.tokenId,
    p_q: params.q,
    p_r: params.r,
  }).single();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Duplicação recusada pelo servidor." };
  const token = linhaParaTokenVtt(data as Record<string, unknown>);
  return { ok: true, revision: token.revision, token };
}

/**
 * Remove — DURA, sem exclusão lógica (`delete_vtt_token`, migration
 * 0073). Não há coluna de arquivamento em `vtt_tokens`; oferecer um
 * "desfazer" aqui seria fingir uma reversibilidade que não existe.
 */
export async function removerToken(tokenId: string): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("delete_vtt_token", { p_token_id: tokenId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/**
 * Ping efêmero — a RPC (`vtt_ping`, migration 0073) é quem PUBLICA o
 * broadcast, não este código: o cliente nunca chama `channel.send()`
 * pra ping, só assina o canal pra RECEBER (`_realtime/vttRealtime.ts`).
 * Devolve `false` (não erro) quando o rate limit do servidor recusa —
 * é um estado normal de uso, não uma falha.
 */
export async function enviarPing(params: {
  campaignId: string;
  sceneId: string;
  q: number;
  r: number;
  /** "Ping de foco" (menu contextual, estilo Roll20): recentraliza a câmera de quem recebe. Padrão `false` — ping comum, só visual. */
  foco?: boolean;
}): Promise<{ ok: boolean; enviado: boolean; erro?: string }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("vtt_ping", {
    p_campaign_id: params.campaignId,
    p_scene_id: params.sceneId,
    p_q: params.q,
    p_r: params.r,
    p_foco: params.foco ?? false,
  });
  if (error) return { ok: false, enviado: false, erro: error.message };
  return { ok: true, enviado: data === true };
}

/**
 * Pinta uma célula de terreno (upsert) ou apaga (`tipo: null`).
 *
 * Só o narrador passa — `vtt_terrain_insert/update/delete` exigem
 * `is_campaign_owner`. Um jogador chamando isto direto recebe recusa
 * do banco, não da interface.
 */
export async function pintarTerreno(params: {
  sceneId: string;
  campaignId: string;
  q: number;
  r: number;
  tipo: TipoTerreno | null;
}): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();

  if (params.tipo === null) {
    const { error } = await client
      .from("vtt_terrain")
      .delete()
      .eq("scene_id", params.sceneId)
      .eq("q", params.q)
      .eq("r", params.r);
    if (error) return { ok: false, erro: `Falha ao apagar terreno: ${error.message}` };
    return { ok: true };
  }

  const { error } = await client.from("vtt_terrain").upsert(
    {
      scene_id: params.sceneId,
      campaign_id: params.campaignId,
      q: params.q,
      r: params.r,
      tipo: params.tipo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scene_id,q,r" },
  );
  if (error) return { ok: false, erro: `Terreno recusado: ${error.message}` };
  return { ok: true };
}

/**
 * Pinta ou apaga VÁRIAS células numa chamada só — o caso de "pintar
 * arrastando". Uma requisição com N linhas, não N requisições: é a
 * diferença entre uma pincelada e uma rajada de round-trips.
 *
 * `apagar: true` remove todas as células listadas; senão, faz upsert de
 * todas com o `tipo` informado. RLS é a MESMA das funções de célula
 * única (só narrador) — em lote não abre exceção nenhuma.
 */
export async function pintarTerrenoLote(params: {
  sceneId: string;
  campaignId: string;
  celulas: { q: number; r: number }[];
  tipo: TipoTerreno | null;
}): Promise<ResultadoEscrita> {
  if (params.celulas.length === 0) return { ok: true };
  const client = await getScopedTableClient();

  if (params.tipo === null) {
    // Postgrest não tem "delete where (q,r) in ((..),(..))" via query
    // builder — apaga célula a célula. Continua sendo UMA função pra
    // quem chama (o arraste inteiro vira uma promise só), só não é
    // literalmente um único round-trip de rede. Em PARALELO (não em
    // série): um balde de centenas de células levava vários segundos
    // pra desfazer com round-trips sequenciais — concorrentes, o tempo
    // total cai pro round-trip MAIS LENTO, não pra soma de todos.
    const resultados = await Promise.all(
      params.celulas.map((c) => client.from("vtt_terrain").delete().eq("scene_id", params.sceneId).eq("q", c.q).eq("r", c.r)),
    );
    const falha = resultados.find((r) => r.error)?.error;
    return falha ? { ok: false, erro: `Falha ao apagar terreno: ${falha.message}` } : { ok: true };
  }

  const { error } = await client.from("vtt_terrain").upsert(
    params.celulas.map((c) => ({
      scene_id: params.sceneId,
      campaign_id: params.campaignId,
      q: c.q,
      r: c.r,
      tipo: params.tipo,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "scene_id,q,r" },
  );
  if (error) return { ok: false, erro: `Terreno recusado: ${error.message}` };
  return { ok: true };
}

/**
 * Cria uma marcação.
 *
 * `autorId` NÃO é parâmetro — resolvido aqui via `getCurrentUser()`,
 * batendo com a promessa que o comentário original já fazia mas o
 * código não cumpria (auditoria pós-0065). Antes, quem chamava esta
 * função decidia o valor de `autorId`; a policy `vtt_marks_insert`
 * (`autor_id = auth.uid()`) já impedia EXPLORAÇÃO — um valor forjado só
 * fazia a inserção falhar —, mas o contrato mentia sobre a própria
 * garantia. Agora é estruturalmente impossível passar autoria errada:
 * a função nem aceita o parâmetro.
 */
export async function criarMarca(params: {
  sceneId: string;
  campaignId: string;
  tipo: TipoMarca;
  sinal: SinalMarca;
  duracao: DuracaoMarca;
  /** Rodada corrente do combate, quando há — `null` fora dele. */
  rodadaCriada: number | null;
  pontos: { q: number; r: number }[];
  texto?: string | null;
  cor: CorMarca;
  espessura: number;
  opacidade: number;
  privada: boolean;
}): Promise<ResultadoEscrita & { id?: string }> {
  const usuario = await getCurrentUser();
  if (!usuario) return { ok: false, erro: "Sessão expirada — faça login novamente." };

  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_marks")
    .insert({
      scene_id: params.sceneId,
      campaign_id: params.campaignId,
      autor_id: usuario.id,
      tipo: params.tipo,
      sinal: params.sinal,
      duracao: params.duracao,
      rodada_criada: params.rodadaCriada,
      pontos: params.pontos,
      texto: params.texto ?? null,
      cor: params.cor,
      espessura: params.espessura,
      opacidade: params.opacidade,
      privada: params.privada,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Marcação recusada: ${error.message}` };
  if (!data) return { ok: false, erro: "Marcação recusada pelo banco." };
  return { ok: true, id: data.id as string };
}

/**
 * Apaga uma marcação. A policy `vtt_marks_delete` já restringe a autor
 * ou narrador — jogador tentando apagar marcação alheia casa 0 linhas.
 */
export async function apagarMarca(marcaId: string): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("vtt_marks").delete().eq("id", marcaId).select("id").maybeSingle();
  if (error) return { ok: false, erro: `Falha ao apagar marcação: ${error.message}` };
  if (!data) return { ok: false, erro: "Você só pode apagar as suas próprias marcações." };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Medições permanentes da régua (migration 0087)
//
// Mesma disciplina de `vtt_marks`: escrita direta na tabela com RLS
// (não RPC), porque a autorização é simples e declarativa — cria quem
// é participante, como si mesmo; apaga o autor ou o narrador. Não há
// UPDATE: uma régua é imutável, quem errou apaga e mede de novo.
// ─────────────────────────────────────────────────────────────────

/**
 * Régua PERSISTIDA. Guarda só os pontos — a distância NÃO é gravada de
 * propósito: ela depende do terreno, que muda. Recalcular no cliente
 * (`medir()`) faz a régua salva se reavaliar sozinha quando alguém
 * pinta terreno difícil por baixo dela; um número congelado aqui
 * viraria uma régua mentirosa na primeira mudança de cenário.
 */
export interface MedicaoVtt {
  id: string;
  autorId: string;
  pontos: { q: number; r: number }[];
  cor: CorMarca;
  rotulo: string | null;
  /** Régua salva que só o AUTOR enxerga (migration 0128) — a RLS já filtra na leitura; isto existe pra UI poder DIZER que é privada. */
  privada: boolean;
  criadaEm: string;
}

/**
 * Cria uma medição permanente. `autor_id` sai de `getCurrentUser()`,
 * nunca de parâmetro — mesmo motivo de `criarMarca`: um contrato que
 * aceita autoria por fora mente sobre a própria garantia, ainda que a
 * policy recuse o valor forjado.
 */
export async function criarMedicao(params: {
  sceneId: string;
  campaignId: string;
  pontos: { q: number; r: number }[];
  cor?: CorMarca;
  rotulo?: string | null;
  /** Só o autor vê (migration 0128). Omitido = da mesa, que é o padrão desde a 0087. */
  privada?: boolean;
}): Promise<ResultadoEscrita & { id?: string }> {
  const usuario = await getCurrentUser();
  if (!usuario) return { ok: false, erro: "Sessão expirada — faça login novamente." };
  // Espelha o CHECK da 0087 — recusar aqui dá uma mensagem em
  // português em vez de um erro cru de constraint vindo do Postgres.
  if (params.pontos.length < 2) return { ok: false, erro: "Uma medição precisa de pelo menos dois pontos." };
  if (params.pontos.length > 64) return { ok: false, erro: "Medição com dobras demais (máximo 64 pontos)." };

  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_measurements")
    .insert({
      scene_id: params.sceneId,
      campaign_id: params.campaignId,
      autor_id: usuario.id,
      pontos: params.pontos,
      cor: params.cor ?? "ciano",
      rotulo: params.rotulo ?? null,
      privada: params.privada ?? false,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: `Medição recusada: ${error.message}` };
  if (!data) return { ok: false, erro: "Medição recusada pelo banco." };
  return { ok: true, id: data.id as string };
}

/**
 * Apaga uma medição. A policy `vtt_measurements_delete` já restringe a
 * autor ou narrador — tentar apagar régua alheia casa 0 linhas, e o
 * `!data` vira a mensagem de recusa.
 */
export async function apagarMedicao(medicaoId: string): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("vtt_measurements").delete().eq("id", medicaoId).select("id").maybeSingle();
  if (error) return { ok: false, erro: `Falha ao apagar medição: ${error.message}` };
  if (!data) return { ok: false, erro: "Você só pode apagar as suas próprias medições." };
  return { ok: true };
}

/**
 * Apaga TODAS as medições da cena que este usuário pode apagar — as
 * suas, e todas se for narrador. Um `delete` só, filtrado por cena: a
 * RLS decide quais linhas casam, então o jogador limpa as próprias
 * réguas sem nunca tocar nas dos outros, e o narrador limpa o mapa
 * inteiro. Devolve quantas saíram, pra UI dizer o que de fato ocorreu.
 */
export async function limparMedicoesDaCena(sceneId: string): Promise<ResultadoEscrita & { removidas?: number }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("vtt_measurements").delete().eq("scene_id", sceneId).select("id");
  if (error) return { ok: false, erro: `Falha ao limpar medições: ${error.message}` };
  return { ok: true, removidas: (data ?? []).length };
}

// ─────────────────────────────────────────────────────────────────
// Áreas de efeito (migration 0081; autorização revista na 0083)
//
// Mesma disciplina de `vtt_tokens` depois da 0066/0073: `authenticated`
// só tem `select` na tabela; TODA escrita passa por RPC
// `security definer`. Criar exige só ser participante VÁLIDO da
// campanha (`pode_criar_vtt_area`, 0083) — não existe mais autorização
// explícita por jogador. Editar/excluir/duplicar exige narrador OU
// autoria (`pode_editar_vtt_area`). O cliente nunca manda campanha,
// cena, criador ou revisão que ele mesmo escolheu — os três primeiros
// vêm da própria linha/do `auth.uid()`, e a revisão só é aceita se
// ainda for a corrente.
// ─────────────────────────────────────────────────────────────────

const COLUNAS_AREA =
  "id, scene_id, campaign_id, tipo, origem_q, origem_r, direcao_graus, raio_m, comprimento_m, largura_m, altura_m, lado_m, abertura_graus, nivel_origem_m, modo_linha, pontos, token_id, cor, opacidade, rotulo, visivel, criador_id, revision, created_at, updated_at";

/** `numeric` do Postgres chega como string no PostgREST — converter num lugar só evita `"4" + 1 === "41"` espalhado pelo cliente. */
function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function linhaParaArea(linha: Record<string, unknown>): AreaVtt {
  return {
    id: linha.id as string,
    sceneId: linha.scene_id as string,
    campaignId: linha.campaign_id as string,
    tipo: linha.tipo as TipoArea,
    origemQ: numeroOuNulo(linha.origem_q),
    origemR: numeroOuNulo(linha.origem_r),
    direcaoGraus: numeroOuNulo(linha.direcao_graus),
    raioM: numeroOuNulo(linha.raio_m),
    comprimentoM: numeroOuNulo(linha.comprimento_m),
    larguraM: numeroOuNulo(linha.largura_m),
    alturaM: numeroOuNulo(linha.altura_m),
    ladoM: numeroOuNulo(linha.lado_m),
    aberturaGraus: numeroOuNulo(linha.abertura_graus),
    nivelOrigemM: numeroOuNulo(linha.nivel_origem_m),
    modoLinha: (linha.modo_linha as ModoLinhaArea | null) ?? null,
    pontos: (linha.pontos as { q: number; r: number }[] | null) ?? null,
    tokenId: (linha.token_id as string | null) ?? null,
    cor: linha.cor as CorMarca,
    opacidade: Number(linha.opacidade),
    rotulo: (linha.rotulo as string | null) ?? null,
    visivel: linha.visivel as boolean,
    criadorId: linha.criador_id as string,
    revision: linha.revision as number,
    criadaEm: linha.created_at as string,
    atualizadaEm: linha.updated_at as string,
  };
}

export interface ParametrosAreaEscrita {
  origemQ: number | null;
  origemR: number | null;
  direcaoGraus: number | null;
  raioM: number | null;
  comprimentoM: number | null;
  larguraM: number | null;
  alturaM: number | null;
  ladoM: number | null;
  nivelOrigemM: number | null;
  modoLinha: ModoLinhaArea | null;
  pontos: { q: number; r: number }[] | null;
  tokenId: string | null;
  cor: CorMarca;
  opacidade: number;
  rotulo: string | null;
  visivel: boolean;
}

export interface ResultadoEscritaArea extends ResultadoEscrita {
  area?: AreaVtt;
}

export async function criarArea(params: ParametrosAreaEscrita & { sceneId: string; campaignId: string; tipo: TipoArea }): Promise<ResultadoEscritaArea> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("create_vtt_area", {
    p_scene_id: params.sceneId,
    p_campaign_id: params.campaignId,
    p_tipo: params.tipo,
    p_origem_q: params.origemQ,
    p_origem_r: params.origemR,
    p_direcao_graus: params.direcaoGraus,
    p_raio_m: params.raioM,
    p_comprimento_m: params.comprimentoM,
    p_largura_m: params.larguraM,
    p_altura_m: params.alturaM,
    p_lado_m: params.ladoM,
    p_nivel_origem_m: params.nivelOrigemM,
    p_modo_linha: params.modoLinha,
    p_pontos: params.pontos,
    p_token_id: params.tokenId,
    p_cor: params.cor,
    p_opacidade: params.opacidade,
    p_rotulo: params.rotulo,
    p_visivel: params.visivel,
  }).single();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Área recusada pelo servidor." };
  const area = linhaParaArea(data as Record<string, unknown>);
  return { ok: true, revision: area.revision, area };
}

export async function atualizarArea(params: ParametrosAreaEscrita & { areaId: string; revisionEsperada: number }): Promise<ResultadoEscritaArea> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("update_vtt_area", {
    p_area_id: params.areaId,
    p_origem_q: params.origemQ,
    p_origem_r: params.origemR,
    p_direcao_graus: params.direcaoGraus,
    p_raio_m: params.raioM,
    p_comprimento_m: params.comprimentoM,
    p_largura_m: params.larguraM,
    p_altura_m: params.alturaM,
    p_lado_m: params.ladoM,
    p_nivel_origem_m: params.nivelOrigemM,
    p_modo_linha: params.modoLinha,
    p_pontos: params.pontos,
    p_token_id: params.tokenId,
    p_cor: params.cor,
    p_opacidade: params.opacidade,
    p_rotulo: params.rotulo,
    p_visivel: params.visivel,
    p_expected_revision: params.revisionEsperada,
  }).single();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Edição de área recusada pelo servidor." };
  const area = linhaParaArea(data as Record<string, unknown>);
  return { ok: true, revision: area.revision, area };
}

export async function duplicarArea(areaId: string): Promise<ResultadoEscritaArea> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("duplicate_vtt_area", { p_area_id: areaId }).single();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Duplicação recusada pelo servidor." };
  const area = linhaParaArea(data as Record<string, unknown>);
  return { ok: true, revision: area.revision, area };
}

/** Remoção DURA — não há arquivamento em `vtt_areas`; oferecer "desfazer" fingiria uma reversibilidade que não existe. */
export async function removerArea(areaId: string): Promise<ResultadoEscrita> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("delete_vtt_area", { p_area_id: areaId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Trilha de turnos (migration 0088)
//
// As três escritas passam por RPC `security definer`, nunca por
// UPDATE direto: a tabela não concede escrita nenhuma a
// `authenticated`, porque a regra de "quem pode mudar o quê" é fina
// demais pra uma policy (narrador inicia/encerra/edita elenco e modo;
// qualquer participante avança). Ver o cabeçalho da migration.
// ─────────────────────────────────────────────────────────────────

/**
 * A trilha da cena ATIVA da campanha, sem carregar a cena inteira.
 *
 * Existe para o Console do Personagem: ele precisa saber em que janela
 * de turno a mesa está (o teto de PA em Rápidos depende disso) e é
 * caro demais ler tokens, terreno, marcas e áreas só para isso.
 * Devolve `null` quando não há cena, não há combate ou a RLS filtrou.
 */
export async function lerTrilhaDaCenaAtiva(campaignId: string): Promise<unknown | null> {
  const client = await getScopedTableClient();
  // O palco, não "a cena mais antiga": esta leitura é da MESA, e a mesa
  // está onde o narrador a colocou (0111). Antes do catálogo as duas
  // respostas coincidiam; hoje a mais antiga pode ser uma cena que
  // ninguém está jogando.
  const sceneIdPalco = await idDaCenaDoUsuario(campaignId);
  if (!sceneIdPalco) return null;
  const { data } = await client
    .from("vtt_turn_tracks")
    .select("estado")
    .eq("scene_id", sceneIdPalco)
    .maybeSingle();
  return data?.estado ?? null;
}

/**
 * O token daquele personagem na cena ATIVA, ou `null` se ele não está
 * no mapa. Mesmo motivo de `lerTrilhaDaCenaAtiva`: o Console precisa
 * do dado, não da cena inteira.
 */
export async function tokenDoPersonagemNaCenaAtiva(campaignId: string, characterId: string): Promise<string | null> {
  const client = await getScopedTableClient();
  // O palco, não "a cena mais antiga": esta leitura é da MESA, e a mesa
  // está onde o narrador a colocou (0111). Antes do catálogo as duas
  // respostas coincidiam; hoje a mais antiga pode ser uma cena que
  // ninguém está jogando.
  const sceneIdPalco = await idDaCenaDoUsuario(campaignId);
  if (!sceneIdPalco) return null;
  // Pela RPC, não por `select` direto: `vtt_tokens` teve o SELECT
  // revogado de `authenticated` na 0084 justamente para que ninguém
  // leia as colunas privadas por fora da projeção. E a projeção só
  // devolve `character_id` a quem controla o token — que é exatamente
  // quem pode ganhar um atalho para ele no mapa.
  const { data } = await client.rpc("read_vtt_scene_tokens", { p_scene_id: sceneIdPalco });
  const linhas = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const alvo = linhas.find((t) => t.character_id === characterId);
  return (alvo?.id as string | undefined) ?? null;
}

/**
 * Trilha da cena ativa + quais tokens do elenco são de quem pergunta.
 *
 * Serve o dock da casca, que só tem `campaignId`. `pode_controlar` sai
 * da MESMA projeção que o mapa usa (`read_vtt_scene_tokens`) — quem
 * decide o que é "meu" continua sendo o servidor, em um lugar só.
 */
export async function lerTrilhaDaMesa(campaignId: string): Promise<
  {
    sceneId: string;
    estado: unknown;
    revision: number;
    tokensQueControlo: string[];
    /** tokenId → characterId, só dos tokens que esta pessoa controla. */
    personagemDoToken: Record<string, string>;
  } | null
> {
  const client = await getScopedTableClient();
  // O palco, não "a cena mais antiga": esta leitura é da MESA, e a mesa
  // está onde o narrador a colocou (0111). Antes do catálogo as duas
  // respostas coincidiam; hoje a mais antiga pode ser uma cena que
  // ninguém está jogando.
  const sceneIdPalco = await idDaCenaDoUsuario(campaignId);
  if (!sceneIdPalco) return null;
  const sceneId = sceneIdPalco;

  const [trilhaRes, tokensRes] = await Promise.all([
    client.from("vtt_turn_tracks").select("estado, revision").eq("scene_id", sceneId).maybeSingle(),
    client.rpc("read_vtt_scene_tokens", { p_scene_id: sceneId }),
  ]);

  const meus = (Array.isArray(tokensRes.data) ? (tokensRes.data as Record<string, unknown>[]) : [])
    .filter((t) => t.pode_controlar === true);
  const tokensQueControlo = meus.map((t) => t.id as string);
  // O elenco do combate é feito de TOKENS, mas os cards da Mesa são de
  // PERSONAGENS. Esta ponte evita que cada tela refaça a tradução — e
  // ela só existe para os tokens de quem pergunta, porque a projeção
  // só devolve `character_id` a quem controla.
  const personagemDoToken: Record<string, string> = {};
  for (const t of meus) {
    if (typeof t.character_id === "string") personagemDoToken[t.id as string] = t.character_id;
  }

  // Sem combate a cena ainda existe — e o dock precisa saber disso pra
  // oferecer "Iniciar rodada" em vez de sumir.
  if (!trilhaRes.data) return { sceneId, estado: null, revision: 0, tokensQueControlo, personagemDoToken };
  return {
    sceneId,
    estado: trilhaRes.data.estado as unknown,
    revision: trilhaRes.data.revision as number,
    tokensQueControlo,
    personagemDoToken,
  };
}

/**
 * Encerra o combate da cena ativa da campanha, se houver.
 *
 * Serve o "Encerrar rodada" da mesa (`lib/table/endRound.ts`), que
 * precisa fechar o combate sem conhecer cena nem `sceneId`. Silencioso
 * quando não há cena ou não há combate: encerrar o que já está
 * encerrado não é erro.
 */
export async function encerrarTrilhaDaCampanha(campaignId: string): Promise<void> {
  // Encerra o combate da cena onde a MESA está — ver o comentário em
  // `lerTrilhaDaMesa`. Encerrar a rodada de uma cena que o narrador
  // está só preparando seria encerrar nada.
  const sceneIdPalco = await idDaCenaDoUsuario(campaignId);
  if (!sceneIdPalco) return;
  await encerrarTrilha(sceneIdPalco);
}

/**
 * Grava as camadas da cena. Narrador-only e revisão conferida DENTRO
 * da RPC (0093) — aqui não há checagem própria, como no resto do VTT.
 */
export async function definirCamadasDaCena(params: {
  sceneId: string;
  camadas: Record<string, unknown>;
  revisionEsperada: number;
}): Promise<ResultadoEscrita & { revision?: number; camadas?: Record<string, unknown> }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("set_vtt_scene_camadas", {
    p_scene_id: params.sceneId,
    p_camadas: params.camadas,
    p_expected_revision: params.revisionEsperada,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return { ok: false, erro: "Ajuste de camadas recusado pelo servidor." };
  return {
    ok: true,
    revision: linha.revision as number,
    camadas: (linha.camadas as Record<string, unknown> | null) ?? {},
  };
}

/**
 * Grava a configuração da cena (nome, local, resumo, tamanho da grade).
 * Narrador-only e revisão conferida DENTRO da RPC (migration 0097) —
 * `vtt_scenes` só tem SELECT para `authenticated`.
 */
export async function definirConfigDaCena(params: {
  sceneId: string;
  nome: string;
  local: string | null;
  resumo: string | null;
  largura: number;
  altura: number;
  /** `undefined` mantém o que está lá — a RPC trata `null` como "não mexa". */
  gradeCor?: string;
  gradeOpacidade?: number;
  celulaPx?: number;
  revisionEsperada: number;
}): Promise<ResultadoEscrita & { cena?: CenaVtt }> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("set_vtt_scene_config", {
    p_scene_id: params.sceneId,
    p_nome: params.nome,
    p_local: params.local,
    p_resumo: params.resumo,
    p_largura: params.largura,
    p_altura: params.altura,
    p_expected_revision: params.revisionEsperada,
    p_grade_cor: params.gradeCor ?? null,
    p_grade_opacidade: params.gradeOpacidade ?? null,
    p_celula_px: params.celulaPx ?? null,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!linha) return { ok: false, erro: "Alteração da cena recusada pelo servidor." };
  return {
    ok: true,
    cena: {
      id: linha.id as string,
      campaignId: linha.campaign_id as string,
      nome: linha.nome as string,
      local: (linha.local as string | null) ?? null,
      resumo: (linha.resumo as string | null) ?? null,
      largura: linha.largura as number,
      altura: linha.altura as number,
      gradeCor: (linha.grade_cor as string | null) ?? GRADE_COR_PADRAO,
      gradeOpacidade: Number(linha.grade_opacidade ?? GRADE_OPACIDADE_PADRAO),
      celulaPx: Number(linha.celula_px ?? CELULA_PX_PADRAO),
      revision: linha.revision as number,
      camadas: (linha.camadas as Record<string, unknown> | null) ?? {},
    },
  };
}

/**
 * Apaga as marcações que expiraram — as de "esta rodada" quando a
 * rodada vira, as de "este combate" quando as rodadas encerram.
 *
 * Roda no SERVIDOR (`expirar_marcas_da_cena`, migration 0098) pra que a
 * marcação suma no mesmo instante pra todo mundo. Filtrar no cliente
 * deixaria cada participante com uma tela diferente da do vizinho.
 */
export async function expirarMarcasDaCena(params: {
  sceneId: string;
  rodadaAtual: number;
  combateEncerrado: boolean;
}): Promise<number> {
  const client = await getScopedTableClient();
  const { data } = await client.rpc("expirar_marcas_da_cena", {
    p_scene_id: params.sceneId,
    p_rodada_atual: params.rodadaAtual,
    p_combate_encerrado: params.combateEncerrado,
  });
  return typeof data === "number" ? data : 0;
}

/** Relê a trilha da cena — usado pra resolver conflito de revisão sem recarregar a cena inteira. */
export async function carregarTrilha(sceneId: string): Promise<TrilhaPersistida | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_turn_tracks")
    .select("scene_id, estado, revision")
    .eq("scene_id", sceneId)
    .maybeSingle();
  if (error) throw new VttStorageError(`Falha ao ler a trilha de turnos: ${error.message}`, error);
  if (!data) return null;
  return { sceneId, estado: data.estado as unknown, revision: data.revision as number };
}

export interface ResultadoTrilha extends ResultadoEscrita {
  trilha?: TrilhaPersistida | null;
}

/** Inicia (ou reinicia) as rodadas da cena — só narrador, decidido no servidor. */
export async function iniciarTrilha(params: { sceneId: string; estado: unknown }): Promise<ResultadoTrilha> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("iniciar_vtt_trilha", {
    p_scene_id: params.sceneId,
    p_estado: params.estado,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return { ok: false, erro: "Início de rodadas recusado pelo servidor." };
  return {
    ok: true,
    revision: linha.revision as number,
    trilha: { sceneId: params.sceneId, estado: linha.estado as unknown, revision: linha.revision as number },
  };
}

/**
 * Avança a trilha com revisão otimista. Um conflito volta como
 * `ok: false` com a mensagem do servidor — quem chama relê e reaplica,
 * nunca força por cima.
 */
export async function atualizarTrilha(params: {
  sceneId: string;
  estado: unknown;
  revisionEsperada: number;
}): Promise<ResultadoTrilha> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("atualizar_vtt_trilha", {
    p_scene_id: params.sceneId,
    p_estado: params.estado,
    p_expected_revision: params.revisionEsperada,
  });
  if (error) return { ok: false, erro: error.message };
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return { ok: false, erro: "Atualização da trilha recusada pelo servidor." };
  return {
    ok: true,
    revision: linha.revision as number,
    trilha: { sceneId: params.sceneId, estado: linha.estado as unknown, revision: linha.revision as number },
  };
}

/** Encerra as rodadas — só narrador. Nunca toca nos tokens da cena. */
export async function encerrarTrilha(sceneId: string): Promise<ResultadoTrilha> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("encerrar_vtt_trilha", { p_scene_id: sceneId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, trilha: null };
}
