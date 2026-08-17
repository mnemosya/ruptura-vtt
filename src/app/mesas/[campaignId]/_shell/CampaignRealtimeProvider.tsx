"use client";

/**
 * Estado de SESSÃO da campanha, vivo enquanto a pessoa estiver em
 * qualquer rota sob `/mesas/[campaignId]` — campanha (inclui
 * `turn_track`), log da mesa, roster de participantes e o que a conta
 * logada controla (`viewer`).
 *
 * Existe porque a casca da campanha passa a ter painéis que sobrevivem
 * à navegação (log, rastreador de turno, participantes). Eles são
 * IRMÃOS de `{children}`, não descendentes, então não dá para receber
 * esses dados por props da página roteada — daí Context, e não
 * prop-drilling. Nenhuma biblioteca de estado: é um provider e um hook.
 *
 * O que este provider NÃO assina, de propósito: o canal `characters`.
 * Ele existe para manter a lista de personagens que só a ferramenta
 * "Resolver Ataque" usa, e essa lista vem com um payload pesado
 * (regras, itens, propriedades, runas) que só o narrador, e só na Mesa,
 * precisa. Subir isso para cá faria toda rota da campanha pagar por
 * ela. A assinatura de `characters` fica local à Mesa
 * (`MesaClient.tsx`), com indicador de sincronização PRÓPRIO — ver a
 * nota sobre os dois status abaixo.
 *
 * Dois status separados, nunca um agregado: `sessionSyncStatus` (aqui,
 * cobre `campaigns` + `table_logs`) e o status do canal de personagens
 * (na Mesa). Um número só poderia dizer "Sincronizado" enquanto
 * "Resolver Ataque" está cego, ou o contrário — e quem lê o indicador
 * não teria como saber qual dos dois quebrou.
 *
 * `roster` E `viewer.controlledCharacterIds` não têm canal Realtime
 * (`campaign_members`/`character_controllers` não são assinados —
 * decisão da Fase 0/1). Os dois recarregam pelos MESMOS gatilhos: a
 * janela recuperando o foco, e um botão manual — é o piso aceitável
 * que a auditoria da Fase 1 aceitou para `reloadMembers`, estendido
 * aqui também a `reloadViewer` (mesma limitação, mesma solução).
 *
 * `onlineUserIds` (Fase 3b) É Realtime, mas de um tipo diferente dos
 * outros: canal de PRESENCE (`useCampaignPresence`), não
 * `postgres_changes` — dado efêmero, nunca persiste em tabela nenhuma,
 * nunca degrada `roster` (que continua vindo de `campaign_members` via
 * `listCampaignRoster`). Ver `presenceRealtime.ts` pro porquê de cada
 * decisão (chave de presença = `userId`, sem timeout próprio).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCampaign, listLogsForViewer, listCampaignRoster, type CampaignRosterEntry } from "../../../../lib/table/storage";
import { reloadControlledCharacterIds } from "../../../../lib/campaign/sessionActions";
import { setBrowserSupabaseRealtimeAuth } from "../../../../lib/supabase/browserClient";
import { refreshAccessToken } from "../../../../lib/auth/actions";
import { useCampaignSessionRealtime, useCampaignPresence } from "../../../../lib/realtime/useCampaignRealtime";
import type { RealtimeStatus } from "../../../../lib/realtime/tableRealtime";
import type { Campaign, TableLogEntry } from "../../../../lib/table";
import type { CampaignRole } from "../../../../lib/campaign/access";
import type { CampaignSessionViewer } from "../../../../lib/campaign/session";

interface CampaignSessionValue {
  campaignId: string;
  role: CampaignRole;
  isNarrator: boolean;
  /** Quem está vendo e o que controla — base de "é a minha vez" e de "meus personagens". */
  viewer: CampaignSessionViewer;

  campaign: Campaign;
  /** Aplicação otimista de uma mudança já confirmada pelo servidor (ex.: encerrar rodada devolve a campanha nova). */
  setCampaign: (next: Campaign) => void;
  logs: TableLogEntry[];
  roster: CampaignRosterEntry[];
  /**
   * `userId`s com a campanha aberta AGORA (Fase 3b, Presence) — dado
   * EFÊMERO, nunca vem do banco. Vazio até o canal sincronizar pela
   * primeira vez, ou se o canal falhar. Múltiplas abas da mesma conta
   * contam como 1 — dedupe feita no CLIENTE (por `user_id` no payload
   * rastreado), não pela key de presença do Realtime; ver o achado de
   * auditoria completo em `presenceRealtime.ts` (chave compartilhada
   * quebrava o `leave` de desconexão).
   *
   * NUNCA renderizar isto sem checar `presenceSyncStatus === "subscribed"`
   * primeiro — um `onlineUserIds` vazio por si só é ambíguo (ninguém
   * online DE VERDADE vs. o canal ainda não sincronizou/falhou), e
   * tratar o segundo caso como "todo mundo offline" seria exatamente o
   * "estado enganoso" que esta fase existe pra evitar (a mesma
   * degradação que o mock `mockOnlineCount`, no dashboard, ainda finge
   * não ter).
   *
   * NUNCA usar isto pra autorização nem decisão de gameplay — é um sinal
   * DECORATIVO. A chave de presença é uma string que o próprio cliente
   * escolhe; o Realtime autoriza QUEM entra no canal (migration 0062,
   * `is_campaign_member`), mas não valida que a `key` usada em `track()`
   * é de fato o `auth.uid()` de quem chamou. Ver o cabeçalho de
   * `presenceRealtime.ts` pro detalhamento completo.
   */
  onlineUserIds: Set<string>;
  /** Status do canal de Presence — ver a nota em `onlineUserIds` sobre por que checar isto antes de usar o Set. */
  presenceSyncStatus: RealtimeStatus;

  /** Só `campaigns` + `table_logs`. O canal de personagens tem status próprio, na Mesa. */
  sessionSyncStatus: RealtimeStatus;
  /**
   * Estado da AUTENTICAÇÃO do WebSocket de Realtime — separado do status
   * do canal porque os dois são independentes: o canal pode seguir
   * "subscribed" (é status de socket) enquanto o Postgres já parou de
   * entregar evento porque o token expirou e a RLS `to authenticated`
   * deixou de casar. Sem este estado, o indicador mentiria
   * "Sincronizado" numa aba aberta há horas.
   *
   *   - `"ok"`: token válido, renovação agendada.
   *   - `"renovando"`: troca silenciosa em voo (não é erro — não alarma
   *     a interface por causa de um blip de rede de 300ms).
   *   - `"interrompido"`: a renovação falhou por motivo transitório
   *     (rede/Supabase). Vale "Tentar novamente" — `renovarRealtimeAuth`.
   *   - `"precisa_login"`: o refresh token em si morreu (revogado,
   *     expirado, já usado fora da janela de tolerância). Só um login
   *     novo resolve; retry não adianta.
   */
  realtimeAuthEstado: RealtimeAuthEstado;
  /**
   * `true` quando a sincronização está degradada DE VERDADE
   * (`interrompido`/`precisa_login`) — nunca durante `renovando`.
   * Qualquer OUTRO canal apoiado no mesmo client de browser (ex.:
   * `characters`, na Mesa do narrador) aplica esta mesma sobreposição
   * no próprio indicador.
   */
  realtimeAuthDegradado: boolean;
  /** Renovação manual ("Tentar novamente" do aviso global). Mesma rotina do agendamento automático. */
  renovarRealtimeAuth: () => Promise<void>;
  /**
   * Erro visível — o primeiro entre os quatro recursos que tiver uma
   * releitura falhada agora. Derivado de um erro POR RECURSO
   * (`campaign`/`logs`/`roster`/`viewer`), nunca um campo único
   * compartilhado: um único `sessionError` setado/limpo por qualquer um
   * dos quatro `reload*` tinha uma corrida real — uma releitura BEM
   * SUCEDIDA de um recurso (ex.: `reloadCampaign`, disparada pelo
   * Realtime) limpava o erro que outro recurso (ex.: `reloadMembers`,
   * falhando de verdade) tinha acabado de mostrar, sem o problema
   * original ter sido resolvido. Os painéis mostram sem esvaziar o que
   * já tinham.
   */
  sessionError: string | null;

  reloadCampaign: () => Promise<void>;
  reloadLogs: () => Promise<void>;
  /**
   * Releitura do roster. Não há Realtime em `campaign_members`, então
   * entrada de novo participante (alguém aceitando convite em outra
   * sessão) só aparece quando isto é chamado: ao abrir a aba
   * Participantes, ao a janela recuperar o foco, e pelo botão manual.
   */
  reloadMembers: () => Promise<void>;
  /**
   * Releitura de `viewer.controlledCharacterIds`. Mesma limitação do
   * roster (sem Realtime em `character_controllers`) — um narrador
   * atribuindo/removendo controle enquanto o jogador está com a
   * campanha aberta só reflete no próximo foco de janela ou clique
   * manual, nunca em tempo real.
   */
  reloadViewer: () => Promise<void>;

  /**
   * Id estável desta instância do provider — gerado uma vez, DEPOIS de
   * montar (`useEffect`, nunca durante a renderização — ver o porquê
   * junto da implementação). `null` até o efeito rodar (SSR e a
   * primeira pintura do cliente, sempre); depois disso, nunca muda
   * enquanto a instância viver. Prova de "instância única" ao navegar
   * entre rotas da campanha: se esse valor mudar entre duas leituras do
   * DOM (já ambas pós-montagem), o provider remontou (o que mataria o
   * scroll do log e o estado do dock silenciosamente). Exposto pra
   * `SessionPanel` renderizar num atributo de teste — o provider em si
   * não tem nó de DOM próprio.
   */
  sessionMountId: number | null;
}

const CampaignSessionContext = createContext<CampaignSessionValue | null>(null);

export function useCampaignSession(): CampaignSessionValue {
  const ctx = useContext(CampaignSessionContext);
  if (!ctx) {
    throw new Error("useCampaignSession precisa de um <CampaignRealtimeProvider> acima na árvore.");
  }
  return ctx;
}

let contadorDeMontagens = 0;

export type RealtimeAuthEstado = "ok" | "renovando" | "interrompido" | "precisa_login";

/**
 * Renova o token com esta antecedência do `exp` — folga suficiente pra
 * ida e volta da Server Action antes de qualquer evento ser perdido.
 */
const MARGEM_RENOVACAO_MS = 60_000;
/**
 * Piso entre duas renovações. Evita laço quente se o servidor devolver
 * um token que já nasce perto do fim (relógio do cliente adiantado, por
 * exemplo) — sem isto, `exp - agora - margem` daria negativo em série.
 */
const MIN_ESPERA_RENOVACAO_MS = 5_000;
/** Espera antes de tentar de novo depois de uma falha transitória. */
const RETENTATIVA_RENOVACAO_MS = 30_000;

/** `exp` (ms desde epoch) de um JWT, ou `null` se ilegível. Nunca lança — token malformado só desativa o timer de expiração, não quebra a página. */
function decodificarExpiracaoJwt(token: string): number | null {
  try {
    const payloadBase64Url = token.split(".")[1];
    if (!payloadBase64Url) return null;
    const payloadBase64 = payloadBase64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(payloadBase64)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function CampaignRealtimeProvider({
  campaignId,
  role,
  viewer: viewerInicial,
  initialCampaign,
  initialLogs,
  initialRoster,
  initialErrors,
  realtimeAccessToken,
  children,
}: {
  campaignId: string;
  role: CampaignRole;
  viewer: CampaignSessionViewer;
  initialCampaign: Campaign;
  /** Já filtrado por visibilidade no servidor (`listLogsForViewer`) — nunca log bruto. */
  initialLogs: TableLogEntry[];
  initialRoster: CampaignRosterEntry[];
  /**
   * Erro já conhecido ANTES do primeiro render — `layout.tsx` degrada
   * uma falha de `listLogsForViewer`/`listCampaignRoster` pra lista
   * vazia (não pode derrubar a casca inteira), mas precisa dizer ISSO
   * aqui, senão "vazio de verdade" e "falhou ao carregar" ficam
   * indistinguíveis pro usuário (e o retry nunca aparece pra cobrir o
   * segundo caso). Nunca inclui `viewer` — a leitura SSR de
   * `controlledCharacterIds` é tolerante DE PROPÓSITO (ver
   * `resolveCampaignSessionViewer`), sem equivalente de retry na
   * primeira pintura.
   */
  initialErrors: { logs?: string; roster?: string };
  /** Access token da conta logada (nunca o refresh token) — ver `setBrowserSupabaseRealtimeAuth`. `null` sem sessão válida. */
  realtimeAccessToken: string | null;
  children: ReactNode;
}) {
  const [campaign, setCampaign] = useState(initialCampaign);
  const [logs, setLogs] = useState(initialLogs);
  const [roster, setRoster] = useState(initialRoster);
  const [viewer, setViewer] = useState(viewerInicial);

  // ── Autenticação do Realtime, com renovação silenciosa ──────────────
  //
  // O WebSocket precisa do access token pra RLS `to authenticated`
  // entregar evento (ver `setBrowserSupabaseRealtimeAuth`), e esse token
  // expira em ~1h. Uma sessão de RPG dura várias horas: renovar é
  // obrigatório, não opcional. `refreshAccessToken` (Server Action) usa
  // o refresh token do cookie httpOnly — que nunca chega ao cliente — e
  // devolve só o access token novo; `realtime.setAuth` empurra ele pros
  // canais JÁ inscritos (confirmado no realtime-js: `_performAuth`
  // percorre `this.channels` e faz `push(access_token)` em cada um que
  // já está joined). Nenhuma assinatura é recriada, então drawer, aba,
  // scroll, dock e formulário em andamento não são tocados.
  const [tokenRealtime, setTokenRealtime] = useState(realtimeAccessToken);
  const [realtimeAuthEstado, setRealtimeAuthEstado] = useState<RealtimeAuthEstado>("ok");

  // A prop só substitui o token vigente se for MAIS NOVA. O payload RSC
  // de uma rota já visitada pode ser servido do cache do cliente ao
  // navegar de volta, carregando o token daquele render — aceitar isso
  // cegamente rebaixaria um token recém-renovado pra um mais velho.
  useEffect(() => {
    if (!realtimeAccessToken) return;
    setTokenRealtime((atual) => {
      if (!atual) return realtimeAccessToken;
      const expAtual = decodificarExpiracaoJwt(atual) ?? 0;
      const expNovo = decodificarExpiracaoJwt(realtimeAccessToken) ?? 0;
      return expNovo > expAtual ? realtimeAccessToken : atual;
    });
  }, [realtimeAccessToken]);

  // APLICAÇÃO do token no WebSocket — dona exclusiva de declarar "ok".
  // A renovação (abaixo) só BUSCA o token e o coloca em `tokenRealtime`;
  // quem decide se a sessão está de fato sincronizada é este efeito,
  // depois de `setAuth` resolver. Separar assim fecha um buraco real: a
  // versão anterior marcava "ok" assim que a Server Action devolvia um
  // token, sem saber se o socket tinha aceitado — se `setAuth` falhasse,
  // a interface dizia "Sincronizado" com o canal mudo.
  useEffect(() => {
    let cancelado = false;
    setBrowserSupabaseRealtimeAuth(tokenRealtime)
      .then(() => {
        if (cancelado) return;
        // Não atropela um `precisa_login` — aquele exige ação do usuário
        // e não é resolvido por uma aplicação de token bem-sucedida.
        setRealtimeAuthEstado((estado) => (estado === "precisa_login" ? estado : "ok"));
      })
      .catch(() => {
        if (cancelado) return;
        setRealtimeAuthEstado("interrompido");
      });
    return () => {
      cancelado = true;
    };
  }, [tokenRealtime]);

  // Espelho do token em ref — o efeito de foco (bem abaixo) precisa ler
  // o valor ATUAL sem entrar como dependência: se `tokenRealtime`
  // entrasse lá, cada renovação recriaria os listeners de
  // `focus`/`visibilitychange` à toa.
  const tokenRealtimeRef = useRef(tokenRealtime);
  tokenRealtimeRef.current = tokenRealtime;

  // Uma renovação em voo por vez — o agendamento, o foco da janela e o
  // botão "Tentar novamente" podem coincidir.
  const renovacaoEmVoo = useRef(false);
  const renovarRealtimeAuth = useCallback(async () => {
    if (renovacaoEmVoo.current) return;
    renovacaoEmVoo.current = true;
    setRealtimeAuthEstado("renovando");
    try {
      const resultado = await refreshAccessToken();
      if (!resultado.ok || !resultado.accessToken) {
        setRealtimeAuthEstado(resultado.needsLogin ? "precisa_login" : "interrompido");
        return;
      }
      // NÃO marca "ok" aqui: só coloca o token novo em estado. Quem
      // confirma é o efeito de aplicação acima, depois de `setAuth`
      // resolver de verdade no WebSocket.
      //
      // Comparação contra `tokenRealtimeRef.current` — NUNCA lendo um
      // side effect de dentro do updater de `setTokenRealtime` (achado
      // de auditoria: a versão anterior atribuía `mesmoToken` dentro do
      // updater e lia logo depois; React não garante quando esse
      // updater roda, então a leitura podia acontecer antes dele —
      // travando a interface em "renovando" pra sempre se o token
      // devolvido fosse idêntico ao vigente). O ref já é síncrono e
      // sempre reflete o valor do render mais recente.
      const novoToken = resultado.accessToken;
      if (tokenRealtimeRef.current === novoToken) {
        // Token idêntico ao já aplicado — mudar o estado pra ele mesmo
        // não dispara o efeito de aplicação (dependência não muda), tem
        // que aplicar aqui diretamente.
        try {
          await setBrowserSupabaseRealtimeAuth(novoToken);
          setRealtimeAuthEstado("ok");
        } catch {
          setRealtimeAuthEstado("interrompido");
        }
      } else {
        setTokenRealtime(novoToken);
      }
    } catch {
      setRealtimeAuthEstado("interrompido");
    } finally {
      renovacaoEmVoo.current = false;
    }
  }, []);

  // Agenda a próxima renovação pro instante certo (nunca polling).
  // Reagenda sozinho a cada token novo; em falha transitória, tenta de
  // novo em `RETENTATIVA_RENOVACAO_MS`. Em `precisa_login` para — só um
  // login novo resolve, insistir só queimaria requisição.
  useEffect(() => {
    if (realtimeAuthEstado === "precisa_login" || realtimeAuthEstado === "renovando") return;
    if (!tokenRealtime) return;

    let atraso: number;
    if (realtimeAuthEstado === "interrompido") {
      atraso = RETENTATIVA_RENOVACAO_MS;
    } else {
      const expiraEmMs = decodificarExpiracaoJwt(tokenRealtime);
      if (expiraEmMs === null) return;
      atraso = Math.max(expiraEmMs - Date.now() - MARGEM_RENOVACAO_MS, MIN_ESPERA_RENOVACAO_MS);
    }

    const timer = setTimeout(() => {
      renovarRealtimeAuth();
    }, atraso);
    return () => clearTimeout(timer);
  }, [tokenRealtime, realtimeAuthEstado, renovarRealtimeAuth]);

  const realtimeAuthDegradado = realtimeAuthEstado === "interrompido" || realtimeAuthEstado === "precisa_login";

  // Erro POR RECURSO (ver o comentário do campo `sessionError` na
  // interface) — cada `reload*` só toca a própria chave, nunca as das
  // outras três. `sessionError` exposto ao consumidor é derivado deste
  // mapa (primeiro erro presente), não o inverso. Parte de `initialErrors`
  // (nunca `{}` fixo) — uma falha já conhecida antes do primeiro render
  // entra aqui desde já, em vez de esperar o primeiro `reload*` pra
  // aparecer.
  const [erros, setErros] = useState<{ campaign?: string; logs?: string; roster?: string; viewer?: string }>(initialErrors);
  const sessionError = erros.campaign ?? erros.logs ?? erros.roster ?? erros.viewer ?? null;

  function definirErro(chave: "campaign" | "logs" | "roster" | "viewer", mensagem: string | null) {
    setErros((prev) => {
      if (mensagem === null) {
        if (!(chave in prev)) return prev;
        const { [chave]: _removido, ...resto } = prev;
        return resto;
      }
      return { ...prev, [chave]: mensagem };
    });
  }

  // Sequenciamento por recurso — protege contra DUAS chamadas
  // concorrentes ao MESMO `reload*` resolverem fora de ordem (achado
  // real: o efeito de foco abaixo dispara `reloadMembers`+`reloadViewer`
  // ao voltar pra aba, e `focus`+`visibilitychange` costumam disparar
  // JUNTOS no mesmo evento de "usuário voltou a olhar" — duas chamadas
  // de verdade, não uma suposição). Sem isso, a resposta mais LENTA das
  // duas (não necessariamente a mais RECENTE) venceria e sobrescreveria
  // dado mais fresco com um mais velho. Cada `reload*` incrementa o
  // próprio contador ao iniciar e só aplica o resultado se, quando a
  // resposta chega, o contador ainda for o mesmo — uma chamada mais
  // nova da mesma função já teria incrementado de novo, invalidando a
  // resposta antiga silenciosamente (não é erro, é descarte correto).
  const seqCampaign = useRef(0);
  const seqLogs = useRef(0);
  const seqRoster = useRef(0);
  const seqViewer = useRef(0);

  // `sessionMountId` NÃO pode ser gerado durante a renderização (nem
  // com `useRef`/`useState(() => ...)`) — o contador de módulo vive em
  // dois runtimes JS INDEPENDENTES (o processo Node do servidor, que
  // acumula um valor alto depois de renderizar N requests; o browser do
  // cliente, que sempre recomeça do zero). O SSR escreveria um número, a
  // primeira renderização do cliente calcularia outro — divergência de
  // hidratação de verdade (React acusa: "server rendered HTML didn't
  // match the client properties"), não um bug cosmético. A correção é
  // gerar o id só DEPOIS de montar, num `useEffect` (client-only, nunca
  // roda no servidor) — a primeira renderização do cliente ainda
  // renderiza `null` (idêntico ao SSR, sem mismatch), e o valor real
  // chega num re-render normal logo em seguida.
  const [sessionMountId, setSessionMountId] = useState<number | null>(null);
  useEffect(() => {
    contadorDeMontagens += 1;
    setSessionMountId(contadorDeMontagens);
  }, []);

  // Toda releitura preserva o que já estava na tela quando falha: o
  // painel mostra o aviso de erro junto do conteúdo antigo, em vez de
  // esvaziar a lista por causa de uma leitura que não voltou. Cada uma
  // também descarta a própria resposta se uma chamada MAIS NOVA da
  // mesma função já estiver em voo (ver `seq*` acima) — nem o
  // `setState` de sucesso nem o de erro rodam nesse caso.
  const reloadCampaign = useCallback(async () => {
    const seq = ++seqCampaign.current;
    try {
      const atual = await getCampaign(campaignId);
      if (seq !== seqCampaign.current) return;
      if (atual) setCampaign(atual);
      definirErro("campaign", null);
    } catch (e) {
      if (seq !== seqCampaign.current) return;
      definirErro("campaign", e instanceof Error ? e.message : "Erro ao recarregar a campanha.");
    }
  }, [campaignId]);

  const reloadLogs = useCallback(async () => {
    const seq = ++seqLogs.current;
    try {
      const dados = await listLogsForViewer(campaignId, {});
      if (seq !== seqLogs.current) return;
      setLogs(dados);
      definirErro("logs", null);
    } catch (e) {
      if (seq !== seqLogs.current) return;
      definirErro("logs", e instanceof Error ? e.message : "Erro ao recarregar o log da mesa.");
    }
  }, [campaignId]);

  const reloadMembers = useCallback(async () => {
    const seq = ++seqRoster.current;
    try {
      const dados = await listCampaignRoster(campaignId);
      if (seq !== seqRoster.current) return;
      setRoster(dados);
      definirErro("roster", null);
    } catch (e) {
      if (seq !== seqRoster.current) return;
      definirErro("roster", e instanceof Error ? e.message : "Erro ao recarregar os participantes.");
    }
  }, [campaignId]);

  const reloadViewer = useCallback(async () => {
    const seq = ++seqViewer.current;
    try {
      const controlledCharacterIds = await reloadControlledCharacterIds(campaignId);
      if (seq !== seqViewer.current) return;
      setViewer((v) => ({ ...v, controlledCharacterIds }));
      definirErro("viewer", null);
    } catch (e) {
      if (seq !== seqViewer.current) return;
      definirErro("viewer", e instanceof Error ? e.message : "Erro ao recarregar seus personagens controlados.");
    }
  }, [campaignId]);

  // Piso aceitável pra roster/viewer sem Realtime (ver cabeçalho): a
  // janela recuperando o foco recarrega os dois. `visibilitychange`
  // cobre trocar de aba OU minimizar/restaurar; `focus` cobre alternar
  // entre janelas do sistema operacional — os dois eventos juntos são o
  // padrão recomendado pra "usuário voltou a olhar pra isto", nenhum
  // sozinho cobre os dois casos — mas na prática costumam disparar
  // JUNTOS no mesmo evento real de "voltei a olhar pra isto" (trocar de
  // aba e voltar, por exemplo), o que chamaria `reloadMembers`/
  // `reloadViewer` duas vezes seguidas à toa. O sequenciamento em cada
  // `reload*` (acima) já torna isso INÓCUO mesmo se acontecer — mas essa
  // trava de 250ms evita o desperdício de rede na maioria dos casos
  // reais, sem ser a única proteção (chamadas vindas de outros lugares,
  // como o botão manual, continuam protegidas só pelo sequenciamento).
  useEffect(() => {
    let ultimoDisparoEm = 0;
    function aoRecuperarFoco() {
      const agora = Date.now();
      if (agora - ultimoDisparoEm < 250) return;
      ultimoDisparoEm = agora;
      reloadMembers();
      reloadViewer();

      // Rede de segurança da renovação: `setTimeout` NÃO é confiável
      // quando a máquina suspende (o timer só dispara ao acordar, muito
      // depois do `exp`) e navegadores estrangulam timers de aba em
      // segundo plano. Voltar a olhar pra janela é exatamente o momento
      // de conferir se o token venceu enquanto ninguém via — sem isto, o
      // usuário voltaria de um notebook fechado com o Realtime mudo até
      // o timer atrasado disparar.
      const expiraEmMs = tokenRealtimeRef.current ? decodificarExpiracaoJwt(tokenRealtimeRef.current) : null;
      if (expiraEmMs !== null && expiraEmMs - Date.now() <= MARGEM_RENOVACAO_MS) {
        renovarRealtimeAuth();
      }
    }
    function aoMudarVisibilidade() {
      if (document.visibilityState === "visible") aoRecuperarFoco();
    }
    window.addEventListener("focus", aoRecuperarFoco);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.removeEventListener("focus", aoRecuperarFoco);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [reloadMembers, reloadViewer]);

  // Só `campaigns` + `table_logs`. O canal de `characters` nem é aberto
  // aqui — quem o assina é a Mesa do narrador, com status próprio (ver
  // cabeçalho).
  const sessionSyncStatusCanal = useCampaignSessionRealtime(campaignId, {
    onCampaignChange: reloadCampaign,
    onTableLogsChange: reloadLogs,
  });
  // Sobrepõe pra "error" quando a autenticação está degradada — o CANAL
  // pode continuar "subscribed" (é status de websocket, não de
  // autorização), mas a RLS já parou de entregar evento. Sem isto,
  // `sessionSyncStatus` mentiria "Sincronizado" numa aba antiga.
  // `renovando` NÃO conta: uma troca silenciosa de token leva
  // milissegundos e não deve piscar erro na interface.
  const sessionSyncStatus: RealtimeStatus = realtimeAuthDegradado ? "error" : sessionSyncStatusCanal;

  // Presence (Fase 3b) — dado decorativo, canal PRÓPRIO, status NÃO
  // entra em `sessionSyncStatus` (ver comentário do campo na
  // interface): uma falha aqui não pode marcar a sessão inteira como
  // fora de sincronia por causa de um dot online/offline.
  const { onlineUserIds, status: presenceSyncStatus } = useCampaignPresence(campaignId, viewer.userId);

  const value = useMemo<CampaignSessionValue>(
    () => ({
      campaignId,
      role,
      isNarrator: role === "narrator",
      viewer,
      campaign,
      setCampaign,
      logs,
      roster,
      onlineUserIds,
      presenceSyncStatus,
      sessionSyncStatus,
      realtimeAuthEstado,
      realtimeAuthDegradado,
      renovarRealtimeAuth,
      sessionError,
      reloadCampaign,
      reloadLogs,
      reloadMembers,
      reloadViewer,
      sessionMountId,
    }),
    [
      campaignId,
      role,
      viewer,
      campaign,
      logs,
      roster,
      onlineUserIds,
      presenceSyncStatus,
      sessionSyncStatus,
      realtimeAuthEstado,
      realtimeAuthDegradado,
      renovarRealtimeAuth,
      sessionError,
      reloadCampaign,
      reloadLogs,
      reloadMembers,
      reloadViewer,
      sessionMountId,
    ],
  );

  return <CampaignSessionContext.Provider value={value}>{children}</CampaignSessionContext.Provider>;
}
