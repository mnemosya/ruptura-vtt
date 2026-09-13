"use client";

/**
 * Sincronização Realtime da cena do VTT.
 *
 * Tokens não assinam mais a linha completa de `vtt_tokens`: ela contém
 * campos privados do HUD. Movimento usa o broadcast efêmero próprio e a
 * lista declarativa é reconciliada pela invalidação sanitizada
 * `tokens_changed` + `read_vtt_scene_tokens` (migration 0084).
 *
 * Um canal só por campanha para terreno, marcações, áreas e objetos,
 * seguindo o mesmo princípio de nome de canal de
 * `buildCampaignChannelName` + sufixo, pra não colidir com os canais já
 * abertos pela campanha (sessão, personagens, controllers).
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "../../../../../lib/supabase/browserClient";
import type { AreaVtt, CelulaTerreno, MarcaVtt, MedicaoVtt, TokenVtt } from "../../../../../lib/vtt/sceneStorage";
import { dentroDoMapa } from "../_dominio/movimento";

export type EventoToken =
  | { tipo: "insert" | "update"; token: TokenVtt }
  | { tipo: "delete"; id: string };

export type EventoTerreno =
  | { tipo: "upsert"; celula: CelulaTerreno }
  | { tipo: "delete"; q: number; r: number };

export type EventoMarca =
  | { tipo: "insert"; marca: MarcaVtt }
  | { tipo: "delete"; id: string };

/**
 * Medição permanente criada ou removida. Não há `update`: uma régua é
 * imutável (quem errou apaga e mede de novo), então a tabela nem tem
 * caminho de UPDATE — mesma forma de `EventoMarca`, e pelo mesmo
 * motivo.
 */
export type EventoMedicao =
  | { tipo: "insert"; medicao: MedicaoVtt }
  | { tipo: "delete"; id: string };

/**
 * Área de efeito criada/editada/removida. Diferente de marcação, área
 * TEM edição — então `update` existe e precisa ser aplicado. A guarda
 * contra "revisão antiga sobrescreve revisão nova" (eco do próprio
 * autor chegando depois de uma edição posterior) fica em quem aplica o
 * evento (`VttClient.tsx`), que é quem conhece a revisão local.
 */
export type EventoArea =
  | { tipo: "insert" | "update"; area: AreaVtt }
  | { tipo: "delete"; id: string };

/**
 * Trilha de turnos iniciada/avançada/encerrada (migration 0088).
 *
 * O `estado` viaja CRU (`unknown`): quem recebe valida com
 * `_turnos/serializacao.ts`, o mesmo validador da leitura persistida —
 * um payload de realtime não é mais confiável que uma linha lida, e
 * ter duas portas de entrada com validações diferentes é como estados
 * impossíveis nascem. `encerrada` é o DELETE: os trilhos somem pra
 * todo mundo sem ninguém recarregar.
 */
export type EventoTrilha =
  | { tipo: "estado"; estado: unknown; revision: number }
  | { tipo: "encerrada" };

function numeroOuNuloArea(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * `numeric` do Postgres viaja como string no payload de
 * `postgres_changes` — a MESMA conversão que a leitura server-side faz
 * (`linhaParaArea`, `lib/vtt/sceneStorage.ts`) precisa acontecer aqui,
 * senão a mesma área teria `raioM: 4` depois de um reload e
 * `raioM: "4"` depois de um evento ao vivo.
 */
function linhaParaArea(row: Record<string, unknown>): AreaVtt {
  return {
    id: row.id as string,
    sceneId: row.scene_id as string,
    campaignId: row.campaign_id as string,
    tipo: row.tipo as AreaVtt["tipo"],
    origemQ: numeroOuNuloArea(row.origem_q),
    origemR: numeroOuNuloArea(row.origem_r),
    direcaoGraus: numeroOuNuloArea(row.direcao_graus),
    raioM: numeroOuNuloArea(row.raio_m),
    comprimentoM: numeroOuNuloArea(row.comprimento_m),
    larguraM: numeroOuNuloArea(row.largura_m),
    alturaM: numeroOuNuloArea(row.altura_m),
    ladoM: numeroOuNuloArea(row.lado_m),
    aberturaGraus: numeroOuNuloArea(row.abertura_graus),
    nivelOrigemM: numeroOuNuloArea(row.nivel_origem_m),
    modoLinha: (row.modo_linha as AreaVtt["modoLinha"]) ?? null,
    pontos: (row.pontos as { q: number; r: number }[] | null) ?? null,
    tokenId: (row.token_id as string | null) ?? null,
    cor: row.cor as AreaVtt["cor"],
    opacidade: Number(row.opacidade),
    rotulo: (row.rotulo as string | null) ?? null,
    visivel: row.visivel as boolean,
    criadorId: row.criador_id as string,
    revision: row.revision as number,
    criadaEm: row.created_at as string,
    atualizadaEm: row.updated_at as string,
  };
}

/**
 * Assina os quatro canais da cena. `sceneId` filtra no CLIENTE (o filtro
 * do Postgres é só por `campaign_id` — uma campanha tem uma cena ativa
 * de cada vez nesta fase, mas o filtro server-side por `scene_id`
 * exigiria um canal por cena e reabrir a cada troca; filtrar no
 * cliente é mais simples aqui e igualmente correto: eventos de uma
 * cena que não é mais a ativa são descartados, nunca aplicados).
 */
export function subscribeToVttScene(params: {
  campaignId: string;
  sceneId: string;
  onToken: (e: EventoToken) => void;
  onTerreno: (e: EventoTerreno) => void;
  onMarca: (e: EventoMarca) => void;
  onMedicao: (e: EventoMedicao) => void;
  onArea: (e: EventoArea) => void;
  /** Rodadas iniciadas/avançadas/encerradas por qualquer participante da mesa. */
  onTrilha: (e: EventoTrilha) => void;
  /**
   * Sinal de "os objetos da cena mudaram" — SEM payload de propósito.
   * Um objeto vive em duas tabelas (`vtt_objects` + `vtt_object_cells`),
   * então remontar o agregado a partir de eventos soltos daria estados
   * intermediários incoerentes (objeto sem células, células órfãs). Quem
   * recebe relê a lista inteira via `carregarObjetosDaCena`.
   */
  onObjetosInvalidados: () => void;
  /**
   * Sinal de "as imagens desta cena mudaram" — também SEM payload, e
   * por uma razão a mais que os objetos: a colocação sozinha não basta
   * pra desenhar. Cada imagem precisa de uma URL ASSINADA, que só o
   * servidor emite e só depois de conferir se esta pessoa pode ver
   * aquele arquivo (`vtt_asset_assinavel_para`, 0100).
   *
   * Mandar a linha pelo canal seria mandar `image_id` pra quem o
   * servidor talvez recuse assinar — o identificador de um arquivo que
   * a pessoa não deveria saber que existe. Quem recebe relê a cena e
   * pede as assinaturas, e a recusa acontece onde tem que acontecer.
   */
  onImagensInvalidadas: () => void;
  onStatusChange?: (status: "conectando" | "conectado" | "erro" | "desabilitado") => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) {
    params.onStatusChange?.("desabilitado");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(`campaign:${params.campaignId}:vtt`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vtt_terrain", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const novo = payload.new as Record<string, unknown> | null;
        const velho = payload.old as Record<string, unknown> | null;
        if (payload.eventType === "DELETE") {
          if (velho?.scene_id === params.sceneId) params.onTerreno({ tipo: "delete", q: velho.q as number, r: velho.r as number });
          return;
        }
        if (novo && novo.scene_id === params.sceneId) {
          params.onTerreno({ tipo: "upsert", celula: { q: novo.q as number, r: novo.r as number, tipo: novo.tipo as CelulaTerreno["tipo"] } });
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vtt_marks", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const novo = payload.new as Record<string, unknown> | null;
        const velho = payload.old as Record<string, unknown> | null;
        if (payload.eventType === "DELETE") {
          if (velho?.scene_id === params.sceneId) params.onMarca({ tipo: "delete", id: velho.id as string });
          return;
        }
        // Marcação editada não existe nesta fase (só criar/apagar) — só
        // trata INSERT. Uma linha vinda de UPDATE nunca deveria chegar
        // aqui, mas se chegar, ignorar é mais seguro que assumir forma.
        if (payload.eventType === "INSERT" && novo && novo.scene_id === params.sceneId) {
          params.onMarca({
            tipo: "insert",
            marca: {
              id: novo.id as string,
              autorId: novo.autor_id as string,
              tipo: novo.tipo as MarcaVtt["tipo"],
              sinal: (novo.sinal as MarcaVtt["sinal"] | null) ?? "alvo",
              duracao: (novo.duracao as MarcaVtt["duracao"] | null) ?? "persistente",
              rodadaCriada: (novo.rodada_criada as number | null) ?? null,
              pontos: (novo.pontos as { q: number; r: number }[]) ?? [],
              texto: (novo.texto as string | null) ?? null,
              cor: novo.cor as MarcaVtt["cor"],
              espessura: novo.espessura as number,
              opacidade: Number(novo.opacidade),
              privada: novo.privada as boolean,
              criadaEm: novo.created_at as string,
            },
          });
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vtt_measurements", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const novo = payload.new as Record<string, unknown> | null;
        const velho = payload.old as Record<string, unknown> | null;
        if (payload.eventType === "DELETE") {
          // `replica identity full` (migration 0087) é o que faz o
          // registro "old" trazer `scene_id`/`campaign_id` — sem ela o
          // DELETE nem casaria o filtro por campanha.
          if (velho?.scene_id === params.sceneId) params.onMedicao({ tipo: "delete", id: velho.id as string });
          return;
        }
        // Medição não tem edição — só INSERT importa. Um UPDATE não
        // deveria existir; ignorar é mais seguro que supor a forma.
        if (payload.eventType === "INSERT" && novo && novo.scene_id === params.sceneId) {
          params.onMedicao({
            tipo: "insert",
            medicao: {
              id: novo.id as string,
              autorId: novo.autor_id as string,
              pontos: (novo.pontos as { q: number; r: number }[]) ?? [],
              cor: novo.cor as MedicaoVtt["cor"],
              rotulo: (novo.rotulo as string | null) ?? null,
              criadaEm: novo.created_at as string,
            },
          });
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vtt_areas", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const novo = payload.new as Record<string, unknown> | null;
        const velho = payload.old as Record<string, unknown> | null;
        if (payload.eventType === "DELETE") {
          // Inclui a remoção EM CASCATA de uma aura quando o token de
          // origem é apagado (`token_id ... on delete cascade`,
          // migration 0081) — o WAL emite o DELETE da área do mesmo
          // jeito, e `replica identity full` garante que ele casa o
          // filtro por campanha.
          if (velho?.scene_id === params.sceneId) params.onArea({ tipo: "delete", id: velho.id as string });
          return;
        }
        if (novo && novo.scene_id === params.sceneId) {
          params.onArea({ tipo: payload.eventType === "INSERT" ? "insert" : "update", area: linhaParaArea(novo) });
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vtt_turn_tracks", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const novo = payload.new as Record<string, unknown> | null;
        const velho = payload.old as Record<string, unknown> | null;
        if (payload.eventType === "DELETE") {
          // `replica identity full` (migration 0088) é o que faz o
          // "old" trazer `scene_id`/`campaign_id` — sem ela, encerrar
          // rodadas não casaria o filtro por campanha e os outros
          // participantes ficariam com os trilhos na tela.
          if (velho?.scene_id === params.sceneId) params.onTrilha({ tipo: "encerrada" });
          return;
        }
        if (novo && novo.scene_id === params.sceneId) {
          params.onTrilha({ tipo: "estado", estado: novo.estado as unknown, revision: novo.revision as number });
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vtt_objects", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const cena = (payload.new as Record<string, unknown> | null)?.scene_id
          ?? (payload.old as Record<string, unknown> | null)?.scene_id;
        if (cena === params.sceneId) params.onObjetosInvalidados();
      },
    )
    .on(
      "postgres_changes",
      // `vtt_object_cells` não tem `campaign_id` (as células pertencem ao
      // objeto, não à campanha) — filtra por cena, que é o escopo certo
      // e igualmente estreito.
      { event: "*", schema: "public", table: "vtt_object_cells", filter: `scene_id=eq.${params.sceneId}` },
      () => params.onObjetosInvalidados(),
    )
    .on(
      "postgres_changes",
      // Só as COLOCAÇÕES entram no canal. `vtt_image_assets` fica fora
      // da publicação de propósito (0099): publicar o arquivo vazaria a
      // existência de asset que nenhuma colocação visível expõe.
      { event: "*", schema: "public", table: "vtt_scene_images", filter: `scene_id=eq.${params.sceneId}` },
      () => params.onImagensInvalidadas(),
    )
    .on(
      "postgres_changes",
      // Esconder a camada muda o que a MESA enxerga (0093 + 0100): as
      // imagens da camada escondida deixam de ser assináveis, então a
      // releitura precisa acontecer também quando só `camadas` mudou.
      { event: "UPDATE", schema: "public", table: "vtt_scenes", filter: `id=eq.${params.sceneId}` },
      () => params.onImagensInvalidadas(),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") params.onStatusChange?.("conectado");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") params.onStatusChange?.("erro");
      else params.onStatusChange?.("conectando");
    });

  return () => {
    client.removeChannel(channel);
  };
}

/** O palco mudou: a mesa inteira foi para outra cena. */
export interface EventoPalco {
  sceneId: string;
  revision: number;
}

/**
 * Assina a MUDANÇA DE PALCO — a fita dos jogadores.
 *
 * Canal PRÓPRIO, e não mais um listener em `subscribeToVttScene`, por
 * uma razão estrutural: aquele canal é reassinado a cada troca de cena
 * (depende de `sceneId`), e a mudança de palco é justamente o evento
 * que CAUSA uma troca de cena. Pendurado lá, ele se derrubaria a si
 * mesmo, e existiria uma janela — entre remover o canal antigo e o novo
 * ficar pronto — em que um segundo "Apresentar" simplesmente não
 * chegaria. O palco é da CAMPANHA; a assinatura dele dura o que a
 * campanha durar.
 *
 * `onReconectado` existe porque o canal não guarda histórico: quem
 * ficou offline não recebe o que perdeu. Toda vez que a inscrição
 * (re)estabelece, quem escuta relê o palco e reconcilia — é o único
 * jeito de um cliente que caiu voltar para a cena certa.
 */
export function subscribeToVttPalco(params: {
  campaignId: string;
  onPalco: (e: EventoPalco) => void;
  /** Disparado a cada `SUBSCRIBED`, inclusive o primeiro. */
  onReconectado?: () => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) return () => {};

  const channel: RealtimeChannel = client
    .channel(`campaign:${params.campaignId}:palco`)
    .on(
      "postgres_changes",
      // INSERT entra junto: a primeira apresentação de uma campanha que
      // nunca teve palco CRIA a linha em vez de atualizá-la, e escutar
      // só UPDATE perderia exatamente a estreia.
      { event: "*", schema: "public", table: "vtt_campaign_stage", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const novo = payload.new as Record<string, unknown> | null;
        if (!novo?.presented_scene_id) return;
        params.onPalco({
          sceneId: novo.presented_scene_id as string,
          revision: (novo.revision as number | undefined) ?? 1,
        });
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") params.onReconectado?.();
    });

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * Evento EFÊMERO de movimento — nunca persistido, existe só pra outros
 * clientes reproduzirem a MESMA animação que o autor está vendo. A
 * releitura sanitizada disparada por `tokens_changed` carrega só a
 * posição FINAL (é a fonte de verdade, ver `move_vtt_token`), sem a
 * rota — sozinha ela não permite a nenhum outro cliente saber por onde
 * o token passou, então não dá pra animar a partir dela. Este
 * evento é o complemento: a MESMA rota expandida que vai pro
 * `move_vtt_token` (nunca uma calculada separadamente, ver
 * `expandirRota` em `_dominio/movimento.ts`), suficiente pra qualquer
 * cliente reconstruir a trajetória exata.
 */
export interface EventoMovimentoToken {
  /** Identifica este movimento — usado pra dedupe (broadcast local, eco do próprio autor, atualização do banco, retry). */
  movementId: string;
  campaignId: string;
  sceneId: string;
  /** Id PERSISTIDO do token (`vtt_tokens.id`). */
  tokenId: string;
  /** Rota expandida, célula a célula, adjacente — a mesma mandada a `move_vtt_token`. */
  rota: { q: number; r: number }[];
  revisionEsperada: number;
  autorId: string;
  /** `Date.now()` de quando o autor iniciou — quem recebe usa isto pra compensar o atraso de rede e sincronizar o relógio da própria animação. */
  iniciadoEm: number;
  /** Duração total em ms — a MESMA que o autor está usando pra animar localmente. */
  duracao: number;
}

function nomeCanalMovimento(campaignId: string): string {
  return `campaign:${campaignId}:vtt:movimento`;
}

/**
 * Assina o canal de broadcast de movimento e devolve como publicar
 * nele — canal PRIVADO (autorização em `realtime.messages`, migration
 * 0070, mesmo padrão de `presenceRealtime.ts`): sem isso, qualquer
 * client que descobrisse o UUID da campanha poderia ouvir/forjar
 * movimentos de token, e Broadcast não herda RLS de `campaign_members`
 * automaticamente (não é uma tabela normal).
 *
 * Um canal PRÓPRIO, separado do de `subscribeToVttScene` — aditivo de
 * baixo risco: não reconfigura (nem precisa re-testar) o canal de
 * `postgres_changes` já em produção, só que já cobre tokens/terreno/
 * marcas.
 *
 * `publicar` funciona mesmo chamado antes do canal terminar de
 * assinar (o cliente Supabase enfileira); na prática, por este hook
 * ser montado no mount de `VttClient` e o primeiro movimento só
 * acontecer bem depois (o usuário precisa arrastar um token primeiro),
 * a assinatura já está pronta.
 */
export function subscribeToVttTokenMovement(params: {
  campaignId: string;
  onMovimento: (e: EventoMovimentoToken) => void;
}): { publicar: (e: EventoMovimentoToken) => void; unsubscribe: () => void } {
  const client = getBrowserSupabaseClient();
  if (!client) return { publicar: () => {}, unsubscribe: () => {} };

  const channel: RealtimeChannel = client
    .channel(nomeCanalMovimento(params.campaignId), { config: { private: true } })
    .on("broadcast", { event: "token_move" }, (payload) => {
      params.onMovimento(payload.payload as EventoMovimentoToken);
    })
    .subscribe();

  return {
    publicar: (e) => { void channel.send({ type: "broadcast", event: "token_move", payload: e }); },
    unsubscribe: () => { client.removeChannel(channel); },
  };
}

/**
 * Evento de PING — efêmero, nunca persistido. Diferente do canal de
 * movimento acima (o cliente publica direto), este canal é SÓ DE
 * RECEBIMENTO do lado do cliente: quem publica é a própria RPC
 * `vtt_ping` (`_acoes/sceneActions.ts::enviarPingAction`), via
 * `realtime.send()` do lado do servidor (migration 0073/0074) — o
 * cliente nunca chama `channel.send()` pra ping, e a policy de
 * `realtime.messages` (migration 0074) só concede SELECT pra
 * `authenticated` — sem policy de INSERT, `channel.send()` direto é
 * recusado pelo próprio Postgres, não só por convenção do código.
 * `autorId` aqui é por isso genuinamente confiável (veio de
 * `auth.uid()` dentro da RPC) — diferente da ressalva documentada pro
 * canal de movimento acima.
 */
export interface EventoPing {
  v: number;
  id: string;
  campaignId: string;
  sceneId: string;
  autorId: string;
  q: number;
  r: number;
  largura: number;
  altura: number;
  /**
   * "Ping de foco" (menu contextual do mapa, migration 0089) — quem
   * RECEBE decide o que fazer com isto (recentralizar a própria
   * câmera, `VttClient.tsx`); o servidor só carrega o booleano
   * adiante, nunca interpreta.
   */
  foco: boolean;
  /** `Date.now()`-like, em ms, do INSTANTE do servidor — usado pra descartar eventos antigos (ver `validadeMs`). */
  ts: number;
}

/** Tópico isolado por CENA, não só por campanha (migration 0074) — evita que um ping vazio de/pra uma cena que não é a ativa apareça como se fosse. */
function nomeCanalPing(campaignId: string, sceneId: string): string {
  return `campaign:${campaignId}:scene:${sceneId}:vtt:ping`;
}

/** Eventos com mais que isso de idade (relógio do cliente vs. `ts` do servidor) são descartados — nunca renderizados como se fossem novos. */
export const PING_VALIDADE_MS = 4000;
/** Tolerância de relógio pra frente — um `ts` mais adiantado que isto em relação ao relógio local é tratado como suspeito, nunca aceito às cegas. */
const PING_TOLERANCIA_FUTURO_MS = 5000;

const REGEX_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Valida o payload bruto de um broadcast de ping em RUNTIME — nunca um
 * `as EventoPing` cego. A policy da migration 0074 já garante que só a
 * RPC publica no canal, mas o payload em si (o CONTEÚDO do broadcast)
 * ainda é dado vindo da rede, não um valor confiável por construção —
 * validar aqui é defesa em profundidade contra um payload malformado
 * (bug futuro na RPC, cliente Realtime com bug, campo truncado), nunca
 * contra quem pode publicar (isso já é a policy). Payload inválido
 * devolve `null` — quem chama descarta em silêncio, nunca deixa entrar
 * no estado React.
 */
export function validarPayloadPing(bruto: unknown, esperado: { campaignId: string; sceneId: string }): EventoPing | null {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
  const p = bruto as Record<string, unknown>;

  if (p.v !== 1) return null;
  if (typeof p.id !== "string" || !REGEX_UUID.test(p.id)) return null;
  if (typeof p.autorId !== "string" || !REGEX_UUID.test(p.autorId)) return null;
  if (typeof p.campaignId !== "string" || p.campaignId !== esperado.campaignId) return null;
  if (typeof p.sceneId !== "string" || p.sceneId !== esperado.sceneId) return null;
  if (typeof p.q !== "number" || !Number.isInteger(p.q)) return null;
  if (typeof p.r !== "number" || !Number.isInteger(p.r)) return null;
  if (typeof p.largura !== "number" || !Number.isInteger(p.largura) || p.largura <= 0) return null;
  if (typeof p.altura !== "number" || !Number.isInteger(p.altura) || p.altura <= 0) return null;
  if (!dentroDoMapa({ q: p.q, r: p.r }, p.largura, p.altura)) return null;
  if (typeof p.ts !== "number" || !Number.isFinite(p.ts)) return null;

  const agora = Date.now();
  if (agora - p.ts > PING_VALIDADE_MS) return null; // expirado
  if (p.ts - agora > PING_TOLERANCIA_FUTURO_MS) return null; // suspeito demais no futuro

  return {
    v: 1, id: p.id, campaignId: p.campaignId, sceneId: p.sceneId, autorId: p.autorId,
    q: p.q, r: p.r, largura: p.largura, altura: p.altura,
    // Campo NOVO (migration 0089) — `false` se ausente, nunca rejeita o
    // payload por causa dele: um servidor ainda rodando a versão
    // anterior da RPC (janela de deploy) continua produzindo pings
    // válidos, só sem foco.
    foco: p.foco === true,
    ts: p.ts,
  };
}

export function subscribeToVttPing(params: {
  campaignId: string;
  sceneId: string;
  onPing: (e: EventoPing) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) return () => {};

  const esperado = { campaignId: params.campaignId, sceneId: params.sceneId };
  const channel: RealtimeChannel = client
    .channel(nomeCanalPing(params.campaignId, params.sceneId), { config: { private: true } })
    .on("broadcast", { event: "ping" }, (payload) => {
      const e = validarPayloadPing(payload.payload, esperado);
      if (!e) return; // descartado em silêncio — nunca chega ao estado React.
      params.onPing(e);
    })
    .subscribe();

  return () => { client.removeChannel(channel); };
}

/**
 * Invalidação SANITIZADA de tokens (migration 0075) — nenhum dado de
 * token no payload, só "a lista autorizada de tokens desta cena
 * mudou". Existe porque `postgres_changes` (o `onToken` de
 * `subscribeToVttScene`, acima) não é suficiente sozinho: quando um
 * token deixa de satisfazer a RLS de quem assina (ex.: o narrador
 * oculta um token que um jogador via), o Realtime nunca entrega esse
 * UPDATE a esse assinante — a linha nova falha a checagem de RLS no
 * momento da entrega, e não existe substituto automático (não vira um
 * DELETE sintético). Este canal é o complemento: avisa que ALGO mudou
 * pra esta cena, sem revelar O QUÊ, e quem recebe relê a cena inteira
 * pela mesma leitura sujeita à RLS (`lerCenaAtiva`) — o que É
 * observável nessa releitura (a lista de tokens autorizados) já é,
 * por definição, tudo que este usuário tem permissão de ver.
 *
 * Publicado pelas 6 RPCs de CRUD/flags (`security definer`,
 * `realtime.send()`) — mesmo padrão de autorização do ping: canal só
 * de SELECT pra membro, sem policy de INSERT (client não publica
 * direto aqui tampouco).
 */
export interface EventoTokensAlterados {
  v: number;
  campaignId: string;
  sceneId: string;
  ts: number;
}

function nomeCanalTokensAlterados(campaignId: string, sceneId: string): string {
  return `campaign:${campaignId}:scene:${sceneId}:vtt:tokens-changed`;
}

/** Mesma folga de validade/futuro do ping — não é crítico pra este evento (ele só dispara uma releitura), mas evita reagir a algo absurdamente velho ou de relógio adulterado. */
const TOKENS_ALTERADOS_VALIDADE_MS = 15000;
const TOKENS_ALTERADOS_TOLERANCIA_FUTURO_MS = 5000;

function validarPayloadTokensAlterados(bruto: unknown, esperado: { campaignId: string; sceneId: string }): EventoTokensAlterados | null {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
  const p = bruto as Record<string, unknown>;
  if (p.v !== 1) return null;
  if (typeof p.campaignId !== "string" || p.campaignId !== esperado.campaignId) return null;
  if (typeof p.sceneId !== "string" || p.sceneId !== esperado.sceneId) return null;
  if (typeof p.ts !== "number" || !Number.isFinite(p.ts)) return null;
  const agora = Date.now();
  if (agora - p.ts > TOKENS_ALTERADOS_VALIDADE_MS) return null;
  if (p.ts - agora > TOKENS_ALTERADOS_TOLERANCIA_FUTURO_MS) return null;
  return { v: 1, campaignId: p.campaignId, sceneId: p.sceneId, ts: p.ts };
}

export function subscribeToVttTokensChanged(params: {
  campaignId: string;
  sceneId: string;
  onChanged: (e: EventoTokensAlterados) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) return () => {};

  const esperado = { campaignId: params.campaignId, sceneId: params.sceneId };
  const channel: RealtimeChannel = client
    .channel(nomeCanalTokensAlterados(params.campaignId, params.sceneId), { config: { private: true } })
    .on("broadcast", { event: "tokens_changed" }, (payload) => {
      const e = validarPayloadTokensAlterados(payload.payload, esperado);
      if (!e) return;
      params.onChanged(e);
    })
    .subscribe();

  return () => { client.removeChannel(channel); };
}

/**
 * Invalidação SANITIZADA de áreas (migration 0081) — mesmo papel que
 * `subscribeToVttTokensChanged` cumpre pros tokens, pelo mesmo motivo:
 * quando o narrador OCULTA uma área que um jogador via, a linha nova
 * deixa de satisfazer a RLS daquele assinante e o `postgres_changes`
 * simplesmente não entrega o UPDATE (não vira um DELETE sintético). Sem
 * este canal, o jogador ficaria com a área na tela até recarregar.
 *
 * O payload não carrega NADA da área — só "a lista autorizada de áreas
 * desta cena mudou"; quem recebe relê pela mesma leitura sujeita à RLS.
 * Publicado só pelas RPCs (`security definer` + `realtime.send()`); a
 * policy da 0081 concede apenas SELECT, então `channel.send()` direto
 * do cliente é recusado pelo próprio Postgres.
 */
export interface EventoAreasAlteradas {
  v: number;
  campaignId: string;
  sceneId: string;
  ts: number;
}

function nomeCanalAreasAlteradas(campaignId: string, sceneId: string): string {
  return `campaign:${campaignId}:scene:${sceneId}:vtt:areas-changed`;
}

const AREAS_ALTERADAS_VALIDADE_MS = 15000;
const AREAS_ALTERADAS_TOLERANCIA_FUTURO_MS = 5000;

function validarPayloadAreasAlteradas(bruto: unknown, esperado: { campaignId: string; sceneId: string }): EventoAreasAlteradas | null {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
  const p = bruto as Record<string, unknown>;
  if (p.v !== 1) return null;
  if (typeof p.campaignId !== "string" || p.campaignId !== esperado.campaignId) return null;
  if (typeof p.sceneId !== "string" || p.sceneId !== esperado.sceneId) return null;
  if (typeof p.ts !== "number" || !Number.isFinite(p.ts)) return null;
  const agora = Date.now();
  if (agora - p.ts > AREAS_ALTERADAS_VALIDADE_MS) return null;
  if (p.ts - agora > AREAS_ALTERADAS_TOLERANCIA_FUTURO_MS) return null;
  return { v: 1, campaignId: p.campaignId, sceneId: p.sceneId, ts: p.ts };
}

export function subscribeToVttAreasChanged(params: {
  campaignId: string;
  sceneId: string;
  onChanged: (e: EventoAreasAlteradas) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) return () => {};

  const esperado = { campaignId: params.campaignId, sceneId: params.sceneId };
  const channel: RealtimeChannel = client
    .channel(nomeCanalAreasAlteradas(params.campaignId, params.sceneId), { config: { private: true } })
    .on("broadcast", { event: "areas_changed" }, (payload) => {
      const e = validarPayloadAreasAlteradas(payload.payload, esperado);
      if (!e) return;
      params.onChanged(e);
    })
    .subscribe();

  return () => { client.removeChannel(channel); };
}

/**
 * Assinatura SÓ da trilha de turnos — para quem está fora do VTT.
 *
 * O dock da casca precisa do combate ao vivo em qualquer rota da
 * campanha, e `subscribeToVttScene` não serve: ela exige os sete
 * manipuladores da cena inteira e usa o canal `:vtt`, que o VTT já
 * ocupa. Duas inscrições no MESMO canal, do mesmo cliente, é onde
 * supabase-js começa a devolver evento pra um e não pro outro — por
 * isso esta tem canal próprio.
 *
 * Mesma disciplina da irmã: o `estado` viaja CRU e quem recebe valida
 * com `_turnos/serializacao.ts`. Um payload de realtime não é mais
 * confiável que uma linha lida.
 */
export function subscribeToTrilhaDaMesa(params: {
  campaignId: string;
  sceneId: string;
  onTrilha: (e: EventoTrilha) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) return () => {};

  const channel: RealtimeChannel = client
    .channel(`campaign:${params.campaignId}:trilha`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vtt_turn_tracks", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const novo = payload.new as Record<string, unknown> | null;
        const velho = payload.old as Record<string, unknown> | null;
        if (payload.eventType === "DELETE") {
          // `replica identity full` (0088) é o que traz `scene_id` no "old".
          if (velho?.scene_id === params.sceneId) params.onTrilha({ tipo: "encerrada" });
          return;
        }
        if (novo && novo.scene_id === params.sceneId) {
          params.onTrilha({ tipo: "estado", estado: novo.estado as unknown, revision: novo.revision as number });
        }
      },
    )
    .subscribe();

  return () => { void client.removeChannel(channel); };
}

/**
 * Camadas da cena mudaram (migration 0093).
 *
 * Canal próprio, pelo mesmo motivo da trilha: `subscribeToVttScene`
 * exige os sete manipuladores da cena inteira, e o canal `:vtt` já
 * está ocupado por ela.
 *
 * O payload viaja CRU (`unknown`) — quem recebe valida com
 * `_shell/PainelCamadas.camadasDeJson`, o mesmo validador da leitura
 * persistida. Duas portas de entrada com validações diferentes é como
 * estados impossíveis nascem.
 */
export function subscribeToCamadasDaCena(params: {
  campaignId: string;
  sceneId: string;
  onCamadas: (e: { camadas: unknown; revision: number }) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) return () => {};

  const channel: RealtimeChannel = client
    .channel(`campaign:${params.campaignId}:cena`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "vtt_scenes", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => {
        const novo = payload.new as Record<string, unknown> | null;
        if (novo && novo.id === params.sceneId) {
          params.onCamadas({ camadas: novo.camadas, revision: novo.revision as number });
        }
      },
    )
    .subscribe();

  return () => { void client.removeChannel(channel); };
}
