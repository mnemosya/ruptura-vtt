"use client";

/**
 * "Minhas Campanhas" (aditivo §4.2) — lista TODAS as campanhas da
 * conta autenticada, narradora em algumas e jogadora em outras, com a
 * ação principal certa para cada papel.
 *
 * Layout da V1 "Seco" (prancheta Main.dc.html do board "Minhas
 * Campanhas — game UI"): um DESTAQUE grande no topo — a campanha
 * selecionada, com arte, nome, região, elenco e "Entrar na mesa" —,
 * abas de papel, busca e "Criar campanha" logo abaixo, a grade de cards
 * e, ao lado, Rede e Atividade. Clicar num card (ou ← →) troca o
 * destaque; Enter entra na mesa em destaque; "/" foca a busca.
 *
 * "Criar campanha" continua vivendo nesta mesma página, num modal,
 * aberto pelo botão da barra ou pelo item do menu de perfil (que chega
 * como `?novo=1`).
 *
 * Hero e atividade derivam de campaign_online_sessions, e a contagem de
 * participantes vem dos batimentos autenticados (0139) — conexão real,
 * nunca número simulado. Quando a consulta falha, o hero diz que não
 * sabe; "não deu para saber" jamais é exibido como "não tem ninguém".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createCampaignWithMetadata } from "../../lib/campaign/metadataActions";
import type { Campaign } from "../../lib/table";
import type { OnlineSession } from "../../lib/campaign/onlineSessionActions";
import { usePushToast } from "./_global/GlobalShell";
import { usePresence } from "../_design/usePresence";
import { capaDaCampanha, nomeDaRegiao, relativeTime } from "./_global/parts";
import { RANKINGS_V12, REGIOES_V12, type RankingV12, type RegiaoIdV12 } from "../../lib/rulesetV12";
import { textoDeParticipantes } from "./_global/participantes";
import { AlertTriangle, RotateCw, Search, Spinner, X } from "../_design/icons";
import { AvatarUsuario } from "../_design/AvatarUsuario";
import { ConvitesModal } from "./_global/ConvitesModal";
import { EnvioImagem, type RecorteEnvio } from "../ficha/_console/EnvioImagem";
import { prepararRecorte } from "../../lib/vtt/imagePreparation";
import { CortinaDaMesa } from "./_global/CortinaDaMesa";

/** Um personagem de jogador no elenco do destaque. */
export interface MembroElenco {
  id: string;
  nome: string;
  classe: string | null;
  /** Retrato assinado; `null` = sem avatar (o retrato mostra as iniciais). */
  avatarUrl: string | null;
  /** Nome de exibição de quem controla; `null` quando não dá para saber. */
  jogador: string | null;
  /** Personagem de quem está logado — ganha a borda laranja. */
  eu: boolean;
}

export interface CampaignCardData {
  latestSession?: OnlineSession | null;
  sessionError?: string;
  /** Narrador com batimento recente (2 min). Ausente quando a leitura falhou. */
  narratorOnline?: boolean;
  /** Jogadores ativos com batimento recente, sem contar o narrador. */
  playerCount?: number;
  campaign: Campaign;
  role: "narrator" | "player";
  /** Só relevante para role="player" — quantos personagens a conta controla nesta campanha. null para narrador (não se aplica). */
  controlledCharacterCount: number | null;
  /** Participantes ativos. null quando a RLS não permite contar (conta só jogadora). */
  memberCount: number | null;
  /** Personagens visíveis para esta conta nesta campanha. */
  characterCount: number;
  /** Participantes com nome de exibição — só chega preenchido para o narrador. */
  people: { userId: string; name: string }[];
  /** Os primeiros personagens de jogador, para os retratos do destaque. */
  elenco?: MembroElenco[];
}

type Filter = "all" | "narrator" | "player";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "narrator", label: "Narrador" },
  { id: "player", label: "Jogador" },
];

const NOME_CLASSE: Record<string, string> = {
  ancora: "Âncora", cacador: "Caçador", combatente: "Combatente", face: "Face",
  infiltrador: "Infiltrador", tecnico: "Técnico", vanguarda: "Vanguarda",
};

function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase() || "?";
}

function IconeMais({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function Seta({ size = 12, stroke = 3.5 }: { size?: number; stroke?: number }) {
  return <svg className="v1-seta" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} aria-hidden="true"><path d="M8 4l8 8-8 8" /></svg>;
}

/** Ordem do destaque padrão: sessão em andamento, depois a última sessão, depois a primeira da lista. */
function destaquePadrao(lista: CampaignCardData[]): string | null {
  const comSessao = lista
    .filter((item) => !item.sessionError && item.latestSession)
    .sort((a, b) => b.latestSession!.started_at.localeCompare(a.latestSession!.started_at) || a.campaign.id.localeCompare(b.campaign.id));
  const escolhida = comSessao.find((item) => item.latestSession!.ended_at === null) ?? comSessao[0] ?? lista[0];
  return escolhida?.campaign.id ?? null;
}

export default function MesasDashboardClient({
  campanhasIniciais,
  errorInicial,
  currentUserId,
  currentUserName,
  presencaDaRede,
  presencaIndisponivel,
}: {
  campanhasIniciais: CampaignCardData[];
  errorInicial: string | null;
  currentUserId: string;
  currentUserName: string;
  /** Presença real por conta. Vazio quando a leitura falhou. */
  presencaDaRede: Record<string, boolean>;
  presencaIndisponivel: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pushToast = usePushToast();

  const [campanhas, setCampanhas] = useState<CampaignCardData[]>(campanhasIniciais);
  const [error, setError] = useState<string | null>(errorInicial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [convitesOpen, setConvitesOpen] = useState(false);
  const [destaqueId, setDestaqueId] = useState<string | null>(() => destaquePadrao(campanhasIniciais));
  /** Arte que estava no destaque antes da troca — fica por baixo enquanto a nova entra com a cortina. */
  const [arteAnterior, setArteAnterior] = useState<React.CSSProperties | null>(null);
  /** Cresce a cada filtro/busca: os cards entram de novo em cascata. */
  const [lista, setLista] = useState(0);
  const [entrando, setEntrando] = useState<CampaignCardData | null>(null);
  const buscaRef = useRef<HTMLInputElement | null>(null);

  /**
   * Quem abriu o modal de criação — para devolver o foco ao fechar.
   * Faltava por completo: `autoFocus` levava o foco pra dentro do
   * diálogo e, no fechamento, ele voltava pro `<body>`; quem navega por
   * teclado perdia o lugar e precisava tabular a página inteira de novo.
   *
   * O gatilho é capturado AQUI, no handler do clique, e não dentro do
   * modal via `document.activeElement`: quando o modal monta, o
   * `autoFocus` do input já moveu o foco pra dentro dele, então lá
   * dentro não há mais como saber de onde o usuário veio. `null` no
   * caminho `?novo=1` é honesto — o gatilho é um item de menu de outra
   * casca, que nem existe mais quando o modal fecha.
   */
  const gatilhoCriacaoRef = useRef<HTMLElement | null>(null);

  const abrirCriacao = useCallback((e?: { currentTarget: HTMLElement }) => {
    gatilhoCriacaoRef.current = e?.currentTarget ?? null;
    setCreateOpen(true);
  }, []);

  const devolverFocoAoGatilho = useCallback(() => {
    const el = gatilhoCriacaoRef.current;
    gatilhoCriacaoRef.current = null;
    // `isConnected`: o gatilho pode ter saído do DOM enquanto o modal
    // estava aberto (a lista rerenderiza) — focar um nó órfão é no-op,
    // mas checar deixa a intenção explícita.
    if (el?.isConnected) el.focus();
  }, []);

  useEffect(() => { setCampanhas(campanhasIniciais); }, [campanhasIniciais]);

  // O destaque escolhido sobrevive ao refresh; se a campanha sumiu, volta ao padrão.
  useEffect(() => {
    if (!destaqueId || !campanhas.some((c) => c.campaign.id === destaqueId)) setDestaqueId(destaquePadrao(campanhas));
  }, [campanhas, destaqueId]);

  // O item "Criar campanha" do menu de perfil chega como ?novo=1.
  useEffect(() => {
    if (searchParams.get("novo") === "1") setCreateOpen(true);
  }, [searchParams]);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    devolverFocoAoGatilho();
    if (searchParams.get("novo") === "1") router.replace("/mesas");
  }, [devolverFocoAoGatilho, router, searchParams]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campanhas.filter(({ campaign, role }) => {
      const roleOk = filter === "all" || role === filter;
      return roleOk && (!q || campaign.name.toLowerCase().includes(q));
    });
  }, [campanhas, filter, search]);

  const destaque = campanhas.find((c) => c.campaign.id === destaqueId) ?? null;
  const narradas = useMemo(() => campanhas.filter((c) => c.role === "narrator").map((c) => c.campaign), [campanhas]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [router]);

  const selecionar = useCallback((id: string) => {
    if (id === destaqueId) return;
    const atual = campanhas.find((c) => c.campaign.id === destaqueId);
    setArteAnterior(atual ? capaDaCampanha(atual.campaign) : null);
    setDestaqueId(id);
  }, [campanhas, destaqueId]);

  const entrar = useCallback((data: CampaignCardData) => {
    setEntrando(data);
    router.push(`/mesas/${data.campaign.id}`);
  }, [router]);

  // Atalhos da V1: "/" foca a busca, Enter entra na mesa em destaque, ← → trocam o destaque.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (createOpen || convitesOpen || entrando) return;
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || alvo?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); buscaRef.current?.focus(); return; }
      if (e.key === "Enter" && tag !== "BUTTON" && tag !== "A" && destaque) { e.preventDefault(); entrar(destaque); return; }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && filtradas.length) {
        const i = Math.max(0, filtradas.findIndex((c) => c.campaign.id === destaqueId));
        const prox = (i + (e.key === "ArrowRight" ? 1 : -1) + filtradas.length) % filtradas.length;
        e.preventDefault();
        selecionar(filtradas[prox].campaign.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen, convitesOpen, entrando, destaque, destaqueId, filtradas, entrar, selecionar]);

  function handleCreated(data: CampaignCardData) {
    setCreateOpen(false);
    pushToast("success", `Campanha "${data.campaign.name}" criada.`);
    router.push(`/mesas/${data.campaign.id}`);
  }

  const mudarFiltro = (f: Filter) => { setFilter(f); setLista((n) => n + 1); };
  const mudarBusca = (q: string) => { setSearch(q); setLista((n) => n + 1); };
  const temCampanhas = campanhas.length > 0;

  return (
    <main className="v1-camp">
      <div className="v1-camp-col">
        {error && (
          <div className="v1-estado v1-estado--erro" role="alert" data-testid="dash-erro">
            <AlertTriangle size={30} />
            <span className="v1-estado-titulo">Falha ao carregar campanhas</span>
            <span className="v1-estado-txt">{error}</span>
            <button type="button" className="v1-u v1-ghost v1-btn-contorno" onClick={() => { setError(null); router.refresh(); }}>
              <RotateCw size={13} /> Tentar novamente
            </button>
          </div>
        )}

        {!error && !temCampanhas && <VazioCampanhas onCriar={abrirCriacao} />}

        {!error && temCampanhas && (
          <>
            {campanhas.some((item) => item.sessionError) && <p role="status" className="v1-aviso">Não foi possível atualizar o estado de algumas sessões. Tentaremos novamente automaticamente.</p>}
            {destaque && <Destaque data={destaque} arteAnterior={arteAnterior} onEntrar={() => entrar(destaque)} />}

            <div className="v1-barra v1-e3">
              <div className="v1-abas" role="tablist" aria-label="Filtrar por papel">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} data-testid={`dash-filtro-${f.id}`}
                    onClick={() => mudarFiltro(f.id)} className={`v1-u v1-sub v1-aba${filter === f.id ? " on" : ""}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="v1-barra-vao" />
              <label className="v1-busca">
                <Search size={14} strokeWidth={2.5} aria-hidden="true" />
                <span className="sr-only">Buscar campanhas</span>
                <input ref={buscaRef} id="busca-campanhas" data-testid="dash-busca" type="search" className="v1-u"
                  value={search} onChange={(e) => mudarBusca(e.target.value)} placeholder="Buscar campanha" />
                <kbd className="v1-tecla">/</kbd>
              </label>
              <button type="button" className="v1-u v1-ghost v1-btn-criar" data-testid="dash-abrir-criar-mesa" onClick={abrirCriacao}>
                <IconeMais /> Criar campanha
              </button>
            </div>

            {filtradas.length === 0 ? (
              <div className="v1-estado v1-carta-a" data-testid="dash-sem-resultado">
                <span className="v1-estado-titulo">Nenhuma campanha</span>
                <span className="v1-estado-txt">
                  {search.trim() ? <>Nada com “{search.trim()}”</> : "Nenhuma com esse filtro"}
                </span>
                <button type="button" className="v1-u v1-ghost v1-btn-contorno" onClick={() => { setSearch(""); setFilter("all"); setLista((n) => n + 1); }}>
                  Limpar filtros
                </button>
              </div>
            ) : (
              <div className="v1-grade" data-testid="dash-mesas-lista">
                {filtradas.map((item, i) => (
                  <div key={`${item.campaign.id}-${lista}`} className="v1-carta-a" style={{ animationDelay: `${(0.2 + i * 0.06).toFixed(2)}s` }}>
                    <CardCampanha data={item} selecionado={item.campaign.id === destaqueId}
                      onSelecionar={() => selecionar(item.campaign.id)} onEntrar={() => entrar(item)} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!error && temCampanhas && (
        <aside className="v1-lado v1-e3" aria-label="Painel lateral">
          <PainelRede campanhas={campanhas} currentUserId={currentUserId} currentUserName={currentUserName}
            presenca={presencaDaRede} indisponivel={presencaIndisponivel}
            podeConvidar={narradas.length > 0} onConvidar={() => setConvitesOpen(true)} />
          <PainelAtividade campanhas={campanhas} destaqueId={destaqueId} onSelecionar={selecionar} />
        </aside>
      )}

      {/* `aberto` como PROP em vez de `createOpen && <Modal/>`: o
          próprio modal usa `usePresence` pra continuar montado durante
          os 150ms de saída — sem isso, React arrancava o nó no frame do
          clique e nenhuma animação de fechamento chegava a existir. */}
      <CreateCampaignModal aberto={createOpen} onClose={closeCreate} onCreated={handleCreated} />
      <ConvitesModal aberto={convitesOpen} campanhas={narradas}
        campanhaInicial={destaque?.role === "narrator" ? destaque.campaign.id : narradas[0]?.id ?? null}
        onClose={() => setConvitesOpen(false)} />
      {entrando && <CortinaDaMesa nome={entrando.campaign.name} papel={entrando.role} regiao={nomeDaRegiao(entrando.campaign)} capa={capaDaCampanha(entrando.campaign)} />}
    </main>
  );
}

// ── Destaque ────────────────────────────────────────────────────────
function Destaque({ data, arteAnterior, onEntrar }: { data: CampaignCardData; arteAnterior: React.CSSProperties | null; onEntrar: () => void }) {
  const { campaign, role, narratorOnline, playerCount, latestSession } = data;
  const narrador = role === "narrator";
  const aoVivo = !!latestSession && latestSession.ended_at === null;
  const regiao = nomeDaRegiao(campaign);
  const elenco = data.elenco ?? [];
  const extra = data.characterCount - elenco.length;
  const sobrancelha = aoVivo ? "Sessão em andamento"
    : latestSession ? `Última sessão · ${relativeTime(latestSession.started_at)}` : "Sem sessões registradas";
  const presenca = textoDeParticipantes(narratorOnline, playerCount);
  // Remontar pelo id replays as entradas (cortina, glitch, cascata) a cada troca.
  const k = campaign.id;
  return (
    <section className="v1-destaque v1-e2" aria-label="Campanha em destaque" data-testid="dash-mesa-destaque">
      {arteAnterior && <div className="v1-destaque-arte" style={arteAnterior} aria-hidden="true" />}
      <div key={`arte-${k}`} className={`v1-destaque-arte${arteAnterior ? " v1-wipe-a" : ""}`} style={capaDaCampanha(campaign)} aria-hidden="true" />
      <div className="v1-destaque-veu1" aria-hidden="true" />
      <div className="v1-destaque-veu2" aria-hidden="true" />
      <div className="v1-destaque-corpo" key={`corpo-${k}`}>
        <div className="v1-destaque-topo">
          <span className="v1-desliza-a v1-d1 v1-destaque-sobrancelha">{sobrancelha}</span>
          <span className={`v1-desliza-a v1-d1 v1-papel${narrador ? "" : " v1-papel--jogador"}`}>◆ {narrador ? "Narrador" : "Jogador"}</span>
        </div>
        <div className="v1-destaque-meio">
          <h1 className="v1-glitch-a v1-destaque-nome">{campaign.name}</h1>
          <span className="v1-desliza-a v1-d2 v1-destaque-regiao">{regiao ? `Região · ${regiao}` : "Sem região"}</span>
          {aoVivo && <span className="v1-desliza-a v1-d2 v1-destaque-presenca" data-testid="dash-destaque-participantes" title={presenca}><span aria-hidden="true">●</span> {presenca}</span>}
        </div>
        <div className="v1-destaque-base">
          <div className="v1-elenco">
            <span className="v1-desliza-a v1-d2 v1-elenco-rotulo">Elenco · {data.characterCount}</span>
            <div className="v1-elenco-retratos">
              {elenco.map((m, i) => <Retrato key={m.id} m={m} delay={0.2 + i * 0.05} />)}
              {extra > 0 && <div className="v1-pop-a v1-retrato-extra" style={{ animationDelay: `${(0.2 + elenco.length * 0.05).toFixed(2)}s` }}>+{extra}</div>}
              {data.characterCount === 0 && <div className="v1-pop-a v1-retrato-vazio" aria-label="Sem personagens"><IconeMais size={20} /></div>}
            </div>
          </div>
          <div className="v1-destaque-acao">
            <div className="v1-pulso">
              <Link href={`/mesas/${campaign.id}`} data-testid={`dash-abrir-${campaign.id}`} className="v1-play"
                aria-label={`Entrar na campanha ${campaign.name}`} onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); onEntrar(); } }}>
                <Seta size={18} stroke={3} />
                <span>Entrar na mesa</span>
              </Link>
            </div>
            <kbd className="v1-tecla v1-tecla--clara">Enter</kbd>
          </div>
        </div>
      </div>
    </section>
  );
}

function Retrato({ m, delay }: { m: MembroElenco; delay: number }) {
  const classe = m.classe ? NOME_CLASSE[m.classe] ?? m.classe : null;
  const jogador = m.eu ? "Você" : m.jogador;
  return (
    <div className="v1-retrato-wrap v1-pop-a" style={{ animationDelay: `${delay.toFixed(2)}s` }}>
      <div className={`v1-retrato${m.eu ? " v1-retrato--eu" : ""}`}>
        {m.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={m.avatarUrl} alt={m.nome} />
          : <div className="v1-retrato-reserva" role="img" aria-label={m.nome}>
              <svg viewBox="0 0 64 88" aria-hidden="true"><circle cx="32" cy="34" r="12" /><path d="M8 88 C10 64 20 54 32 54 C44 54 54 64 56 88 Z" /></svg>
              <span>{iniciais(m.nome)}</span>
            </div>}
      </div>
      <span className="v1-rotulo" aria-hidden="true">
        <span className="v1-rotulo-nome">{m.nome}</span>
        {(jogador || classe) && <span className={`v1-rotulo-sub${m.eu ? " v1-rotulo-sub--eu" : ""}`}>{[jogador, classe].filter(Boolean).join(" · ")}</span>}
      </span>
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────
function CardCampanha({ data, selecionado, onSelecionar, onEntrar }: { data: CampaignCardData; selecionado: boolean; onSelecionar: () => void; onEntrar: () => void }) {
  const { campaign, role } = data;
  const regiao = nomeDaRegiao(campaign);
  const narrador = role === "narrator";
  return (
    <div className={`v1-card${selecionado ? " is-sel" : ""}${narrador ? "" : " v1-card--jogador"}`} data-testid="dash-mesa-item">
      <button type="button" className="v1-u v1-sel" onClick={onSelecionar} aria-pressed={selecionado} aria-label={`Selecionar ${campaign.name}`}>
        <span className="v1-arte" style={capaDaCampanha(campaign)} aria-hidden="true" />
        <span className="v1-card-veu" aria-hidden="true" />
        <span className="v1-canto v1-c1" aria-hidden="true" /><span className="v1-canto v1-c2" aria-hidden="true" />
        <span className="v1-canto v1-c3" aria-hidden="true" /><span className="v1-canto v1-c4" aria-hidden="true" />
        <span className="v1-faixa" aria-hidden="true" />
        <span className="v1-texto">
          <span className="v1-card-papel">◆ {narrador ? "Narrador" : "Jogador"}</span>
          <span className="v1-card-nome" title={campaign.name}>{campaign.name}</span>
          <span className="v1-card-meta">{regiao ? `${regiao} · ` : ""}{relativeTime(campaign.updated_at)}</span>
        </span>
      </button>
      <Link href={`/mesas/${campaign.id}`} data-testid={`dash-abrir-${campaign.id}`} className="v1-entrar"
        aria-label={`${narrador ? "Entrar na" : "Abrir"} campanha ${campaign.name}`}
        onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); onEntrar(); } }}>
        <Seta />
        Entrar
      </Link>
    </div>
  );
}

// ── Painéis laterais ────────────────────────────────────────────────
function PainelRede({ campanhas, currentUserId, currentUserName, presenca, indisponivel, podeConvidar, onConvidar }: {
  campanhas: CampaignCardData[];
  currentUserId: string;
  currentUserName: string;
  presenca: Record<string, boolean>;
  indisponivel: boolean;
  podeConvidar: boolean;
  onConvidar: () => void;
}) {
  const people = useMemo(() => {
    const map = new Map<string, string>();
    // A própria conta já é a primeira linha; sem isto o narrador apareceria duas vezes.
    campanhas.forEach((c) => c.people.forEach((p) => { if (p.userId !== currentUserId) map.set(p.userId, p.name); }));
    return Array.from(map.entries()).map(([userId, name]) => ({ userId, name }));
  }, [campanhas, currentUserId]);

  const somenteJogador = campanhas.length > 0 && campanhas.every((c) => c.role === "player");
  const todos = [{ userId: currentUserId, name: currentUserName, eu: true }, ...people.map((p) => ({ ...p, eu: false }))];
  const online = todos.filter((p) => presenca[p.userId] === true).length;

  return (
    <section className="v1-painel v1-painel--rede" aria-label="Rede">
      <div className="v1-painel-cab">
        <h2 className="v1-painel-titulo">Rede</h2>
        {!indisponivel && <span className="v1-painel-info">{online} / {todos.length} online</span>}
      </div>
      {/* Cada pessoa vira um link de verdade para o perfil: dentro de
          /mesas a navegação é interceptada e abre em modal, e o mesmo
          endereço colado numa aba nova abre a página cheia. */}
      <div className="v1-rede-lista">
        {todos.map((p) => {
          const on = presenca[p.userId] === true;
          return (
            <Link key={p.userId} href={`/perfil?userId=${p.userId}`}
              className={`v1-rede v1-pessoa${p.eu ? " v1-pessoa--eu" : ""}`}
              data-testid={p.eu ? "rede-pessoa-eu" : "rede-pessoa"}>
              <span className={`v1-hex v1-pessoa-hex${p.eu ? " v1-pessoa-hex--eu" : ""}`} aria-hidden="true">
                <AvatarUsuario userId={p.userId} fallback={<>{iniciais(p.name).charAt(0)}</>} />
              </span>
              <span className="v1-pessoa-texto">
                <span className="v1-pessoa-nome">{p.name}{p.eu ? " (você)" : ""}</span>
                {indisponivel
                  ? <span className="v1-pessoa-status">Status indisponível</span>
                  : <span className={`v1-pessoa-status${on ? " v1-pessoa-status--on v1-carregando" : ""}`}>{on ? "● Online" : "○ Offline"}</span>}
              </span>
              <Seta />
            </Link>
          );
        })}
      </div>
      {people.length === 0 && (
        <p className="v1-painel-nota">
          {somenteJogador
            ? "A lista de participantes de uma mesa só é visível para quem a narra."
            : "Quem entrar pelos seus convites aparece aqui."}
        </p>
      )}
      {podeConvidar && (
        <button type="button" className="v1-u v1-ghost v1-btn-convidar" onClick={onConvidar} aria-haspopup="dialog" data-testid="dash-convidar">
          Convidar para a mesa
        </button>
      )}
    </section>
  );
}

function PainelAtividade({ campanhas, destaqueId, onSelecionar }: { campanhas: CampaignCardData[]; destaqueId: string | null; onSelecionar: (id: string) => void }) {
  const rows = useMemo(
    () => campanhas.filter((item) => !item.sessionError && item.latestSession)
      .sort((a, b) => b.latestSession!.started_at.localeCompare(a.latestSession!.started_at) || a.campaign.id.localeCompare(b.campaign.id))
      .slice(0, 4),
    [campanhas],
  );
  return (
    <section className="v1-painel v1-painel--atividade" aria-label="Atividade recente">
      <h2 className="v1-painel-titulo">Atividade</h2>
      {rows.length === 0 ? (
        <p className="v1-painel-nota">Nenhuma atividade recente.</p>
      ) : (
        <ol className="v1-atividade">
          {rows.map((row) => {
            const sel = row.campaign.id === destaqueId;
            return (
              <li key={row.campaign.id}>
                <button type="button" className={`v1-u v1-linha${sel ? " v1-linha--sel" : ""}`} onClick={() => onSelecionar(row.campaign.id)}>
                  <span className="v1-losango" aria-hidden="true" />
                  <span className="v1-linha-texto">
                    <span className="v1-linha-nome" title={row.campaign.name}>{row.campaign.name}</span>
                    <span className="v1-linha-quando">Sessão · <time dateTime={row.latestSession!.started_at}>{new Date(row.latestSession!.started_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ── Sem campanhas (opção B: Narrar ou Jogar) ────────────────────────
/** A luz do cartão segue o cursor: grava a posição em `--mx`/`--my`. */
function seguirCursor(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

function VazioCampanhas({ onCriar }: { onCriar: (e?: { currentTarget: HTMLElement }) => void }) {
  return (
    <div className="v1-vazio" data-testid="dash-vazio">
      <div className="v1-vazio-cab">
        <span className="v1-e1 v1-vazio-sobrancelha" style={{ animationDelay: ".1s" }}>Nenhuma campanha · escolha como começar</span>
        <h1 className="v1-glitch-a v1-vazio-titulo">Você ainda não participa de nenhuma campanha</h1>
      </div>
      <div className="vb-cards">
        <section className="vb-card vb-revela vb-card--narrar" aria-label="Narrar" onMouseMove={seguirCursor}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="vb-arte" src="/forja/regioes/vastra.webp" alt="" aria-hidden="true" />
          <div className="vb-veu" aria-hidden="true" />
          <span className="vb-canto vb-c1" aria-hidden="true" /><span className="vb-canto vb-c2" aria-hidden="true" />
          <span className="vb-num vb-cai vb-cai--0">01</span>
          <span className="vb-faixa" aria-hidden="true" />
          <div className="vb-corpo">
            <span className="vb-papel vb-cai vb-cai--1">◆ Narrador</span>
            <span className="vb-titulo vb-cai vb-cai--2">Narrar</span>
            <span className="vb-sub vb-cai vb-cai--3">Crie uma campanha</span>
            <p className="vb-txt vb-cai vb-cai--4">Comece a narrar seu próprio mundo. Você entra como narrador e convida os jogadores depois.</p>
            <div className="vb-mais vb-cai vb-cai--5">
              <div className="vb-pulso">
                <button type="button" className="v1-u vb-play" onClick={onCriar} data-testid="dash-vazio-criar">
                  <IconeMais size={16} /> Criar campanha
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="vb-card vb-revela vb-revela--2 vb-card--jogar" aria-label="Jogar" onMouseMove={seguirCursor}>
          <div className="vb-arte vb-arte-faixas" aria-hidden="true">
            {/* eslint-disable @next/next/no-img-element */}
            <img src="/forja/classes/infiltrador.webp" alt="" style={{ objectPosition: "50% 25%" }} />
            <img src="/forja/classes/combatente.webp" alt="" style={{ objectPosition: "67% 25%" }} />
            <img src="/forja/classes/vanguarda.webp" alt="" style={{ objectPosition: "42% 25%" }} />
            <img src="/forja/classes/cacador.webp" alt="" style={{ objectPosition: "50% 25%" }} />
            {/* eslint-enable @next/next/no-img-element */}
          </div>
          <div className="vb-veu vb-veu--jogar" aria-hidden="true" />
          <span className="vb-canto vb-c1" aria-hidden="true" /><span className="vb-canto vb-c2" aria-hidden="true" />
          <span className="vb-num vb-cai vb-cai--0">02</span>
          <span className="vb-faixa" aria-hidden="true" />
          <div className="vb-corpo">
            <span className="vb-papel vb-cai vb-cai--1">◆ Jogador</span>
            <span className="vb-titulo vb-cai vb-cai--2">Jogar</span>
            <span className="vb-sub vb-cai vb-cai--3">Entre por um convite</span>
            <p className="vb-txt vb-cai vb-cai--4">Abra o link enviado pelo narrador de uma mesa. A campanha aparece aqui assim que você entrar.</p>
            <div className="vb-mais vb-cai vb-cai--5">
              <span className="vb-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
                <span>/join/<span className="vb-link-pontos">••••••••••</span><span className="vb-cursor">▌</span></span>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Modal de criação ────────────────────────────────────────────────
function CreateCampaignModal({
  aberto,
  onClose,
  onCreated,
}: {
  aberto: boolean;
  onClose: () => void;
  onCreated: (data: CampaignCardData) => void;
}) {
  const { montado } = usePresence(aberto, 180);
  const [nome, setNome] = useState("");
  const [nomeTocado, setNomeTocado] = useState(false);
  const [previewId, setPreviewId] = useState("preview");
  const [regiao, setRegiao] = useState<RegiaoIdV12 | null>(null);
  const [rankingInicial, setRankingInicial] = useState<RankingV12>("F");
  const [descricao, setDescricao] = useState("");
  const [capa, setCapa] = useState<File | null>(null);
  const [capaPreview, setCapaPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** O modal de envio da capa (scanner + enquadramento 16:9) aberto. */
  const [envioCapa, setEnvioCapa] = useState(false);
  const [recortando, setRecortando] = useState(false);
  const [erroCapa, setErroCapa] = useState<string | null>(null);
  /** Cresce a cada troca de capa/região: a capa nova entra com a cortina. */
  const [capaTroca, setCapaTroca] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setPreviewId(crypto.randomUUID()); }, []);

  // A devolução do foco ao gatilho é responsabilidade do PAI
  // (`devolverFocoAoGatilho`) — ver a nota lá: aqui dentro o
  // `autoFocus` do input já apagou o rastro de quem abriu.

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      // Com o envio da capa aberto, o Esc é dele (ele fecha a si mesmo), não do modal.
      if (envioCapa) return;
      if (e.key === "Escape" && !busy) onClose();
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)');
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, busy, onClose, envioCapa]);

  useEffect(() => {
    if (!capa) { setCapaPreview(null); return; }
    const url = URL.createObjectURL(capa);
    setCapaPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [capa]);

  if (!montado) return null;

  async function handleCreate() {
    const trimmed = nome.trim();
    if (!trimmed) { setNomeTocado(true); return; }
    if (busy) return;
    setBusy(true);
    setErro(null);
    try {
      const form = new FormData();
      form.set("name", trimmed);
      form.set("id", previewId);
      form.set("description", descricao);
      form.set("region", regiao ?? "");
      form.set("initial_ranking", rankingInicial);
      if (capa) form.set("cover", capa);
      const campaign = await createCampaignWithMetadata(form);
      onCreated({
        campaign,
        role: "narrator",
        controlledCharacterCount: null,
        memberCount: 1,
        characterCount: 0,
        people: [],
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar campanha.");
      setBusy(false);
    }
  }

  function handleCoverFile(file: File | null) {
    if (file && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setCapa(null);
      setErro("Use uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setCapa(null);
      setErro("A capa deve ter até 5 MB.");
      return;
    }
    setCapa(file);
    setCapaTroca((n) => n + 1);
    setErro(null);
  }

  /** O modal de envio devolve o arquivo e o recorte 16:9; o que entra como capa já é o recorte. */
  async function usarCapa(arquivo: File, r: RecorteEnvio | null): Promise<boolean> {
    if (!r) return false;
    setRecortando(true);
    setErroCapa(null);
    try {
      const pronta = await prepararRecorte(arquivo, { x: r.x, y: r.y, largura: r.tamanho, altura: r.altura ?? r.tamanho * 9 / 16 }, 1600, 5 * 1024 * 1024);
      URL.revokeObjectURL(pronta.previewUrl);
      handleCoverFile(new File([pronta.blob], "capa.webp", { type: "image/webp" }));
      return true;
    } catch (err) {
      setErroCapa(err instanceof Error ? err.message : "Falha ao preparar a capa.");
      return false;
    } finally {
      setRecortando(false);
    }
  }

  const nomeOk = !!nome.trim();
  // "sai" só quando está fechando: no frame em que monta, `visivel` ainda é falso,
  // e a classe de saída ali fazia o modal tocar a saída e logo a entrada (o "vai e vem").
  const sai = aberto ? "" : " sai";
  const regiaoNome = regiao ? REGIOES_V12[regiao].nome : null;

  return (
    <>
      <div className={`v1-veu${sai}`} onMouseDown={() => { if (!busy) onClose(); }} aria-hidden="true" />
      <div ref={dialogRef} className={`v1-modal v1-modal--criar${sai}`} role="dialog" aria-modal="true" aria-labelledby="criar-campanha-titulo">
        <h2 id="criar-campanha-titulo" className="sr-only">Criar campanha</h2>
        <div className="v1-modal-capa">
          <div key={capaTroca} className={`v1-modal-capa-img${capaTroca ? " v1-capa-a" : ""}`}
            style={capaPreview ? { backgroundImage: `url('${capaPreview}')`, backgroundSize: "cover", backgroundPosition: "center" } : capaDaCampanha({ id: previewId, regiao, cover_path: null })}
            aria-hidden="true" />
          <div className="v1-modal-capa-veu" aria-hidden="true" />
          <button type="button" className="v1-u v1-fechar" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={14} /></button>
          {capa && (
            <button type="button" className="v1-u v1-capa-btn v1-capa-btn--remover" disabled={busy} onClick={() => handleCoverFile(null)}>
              Remover capa
            </button>
          )}
          <button type="button" className="v1-u v1-capa-btn" onClick={() => { setErroCapa(null); setEnvioCapa(true); }} disabled={busy}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true"><rect x="3" y="5" width="18" height="14" /><path d="M3 16l5-5 4 4 3-3 6 6" /></svg>
            {capa ? "Trocar capa" : "Escolher capa"}
          </button>
          <div className="v1-modal-capa-texto">
            <span className="v1-modal-sobrancelha">Nova campanha · ◆ Narrador</span>
            <span className={`v1-modal-nome${nomeOk ? "" : " v1-modal-nome--vazio"}`}>{nome.trim() || "Nome da campanha"}</span>
          </div>
        </div>
        {envioCapa && (
          <EnvioImagem
            titulo="CAPA DA CAMPANHA"
            contexto={nome.trim() ? `CAMPANHA · ${nome.trim().toUpperCase()}` : "NOVA CAMPANHA"}
            canal="UPLOAD://CAPA"
            forma="capa"
            cor="#f5a200"
            atual={capaPreview}
            erro={erroCapa}
            enviando={recortando}
            rotuloUsar="USAR CAPA"
            onUsar={usarCapa}
            onRemover={() => { handleCoverFile(null); return true; }}
            fechar={() => setEnvioCapa(false)}
          />
        )}
        <div className="v1-modal-campos">
          <label className="v1-campo-grupo">
            <span className="v1-campo-rotulo">Nome da campanha</span>
            <input id="nova-campanha-nome" data-testid="dash-nova-mesa" className="v1-u v1-campo"
              value={nome} autoFocus maxLength={120}
              onChange={(e) => { setNome(e.target.value); setNomeTocado(true); if (e.target.value.trim()) setErro(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              placeholder="Ex.: Ecos de Vosek" />
            {nomeTocado && !nomeOk && <span role="alert" className="v1-campo-erro v1-desliza-a">Informe o nome da campanha.</span>}
          </label>
          <div className="v1-campo-grupo">
            <span className="v1-campo-rotulo">Região inicial · <span className="v1-campo-opcional">Opcional</span></span>
            <div className="v1-chips" role="radiogroup" aria-label="Região inicial" data-testid="dash-nova-mesa-regiao">
              {(Object.keys(REGIOES_V12) as RegiaoIdV12[]).map((id) => {
                const on = regiao === id;
                return (
                  <button key={id} type="button" role="radio" aria-checked={on} className={`v1-u v1-chip${on ? " on" : ""}`}
                    onClick={() => { setRegiao(on ? null : id); if (!capa) setCapaTroca((n) => n + 1); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/forja/regioes/${id}.webp`} alt="" aria-hidden="true" />
                    <span className="v1-chip-veu" aria-hidden="true" />
                    {on && <span className="v1-check v1-chip-check" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4}><path d="M5 12l5 5 9-10" /></svg></span>}
                    <span className="v1-chip-nome">{REGIOES_V12[id].nome}</span>
                  </button>
                );
              })}
            </div>
            <span className="v1-campo-nota">{regiaoNome ? `Região inicial · ${regiaoNome}` : "Nenhuma · decidir depois"}</span>
          </div>
          <div className="v1-campo-grupo">
            <span className="v1-campo-rotulo">Ranking inicial</span>
            <div className="v1-ranks" role="radiogroup" aria-label="Ranking inicial" data-testid="dash-nova-mesa-ranking">
              {RANKINGS_V12.map((rank) => (
                <button key={rank} type="button" role="radio" aria-checked={rankingInicial === rank}
                  className={`v1-u v1-rk${rankingInicial === rank ? " on" : ""}`} onClick={() => setRankingInicial(rank)}>{rank}</button>
              ))}
            </div>
          </div>
          <label className="v1-campo-grupo">
            <span className="v1-campo-rotulo v1-campo-rotulo--linha"><span>Descrição · <span className="v1-campo-opcional">Opcional</span></span><span className="v1-campo-opcional">{descricao.length} / 1000</span></span>
            <textarea id="nova-campanha-descricao" className="v1-u v1-campo v1-campo--area" value={descricao} maxLength={1000}
              onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Sobre o que é esta campanha?" />
          </label>
          {erro && <span role="alert" className="v1-campo-erro v1-desliza-a">{erro}</span>}
          <div className="v1-modal-rodape">
            <span className="v1-modal-nota">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f5a200" strokeWidth={2.2} aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>
              Você entra como narrador.
            </span>
            <button type="button" className="v1-u v1-ghost v1-btn-cancelar" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="button" className="v1-u v1-criar v1-btn-primario" data-testid="dash-criar-mesa" onClick={handleCreate} disabled={busy || !nomeOk}>
              {busy ? <><Spinner size={13} className="mo-spin" /> Forjando…</> : "Criar campanha"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
