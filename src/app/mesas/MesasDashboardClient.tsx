"use client";

/**
 * "Minhas Campanhas" (aditivo §4.2) — lista TODAS as campanhas da
 * conta autenticada, narradora em algumas e jogadora em outras, com a
 * ação principal certa para cada papel.
 *
 * "Criar campanha" continua vivendo nesta mesma página; no redesign ela
 * virou um modal HUD, aberto pelo botão da barra de ferramentas ou pelo
 * item do menu de perfil (que chega como `?novo=1`). O formulário tem
 * nome, descrição, região e capa são gravados pela ação de criação.
 *
 * Hero e atividade derivam de campaign_online_sessions, e a contagem de
 * participantes vem dos batimentos autenticados (0139) — conexão real,
 * nunca número simulado. Quando a consulta falha, o hero diz que não
 * sabe; "não deu para saber" jamais é exibido como "não tem ninguém".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronRight, ImagePlus, Shield } from "lucide-react";
import { createCampaignWithMetadata } from "../../lib/campaign/metadataActions";
import type { Campaign } from "../../lib/table";
import type { OnlineSession } from "../../lib/campaign/onlineSessionActions";
import { usePushToast } from "./_global/GlobalShell";
import { usePresence } from "../_design/usePresence";
import {
  DecoBottom, PageHead, SectionHead, capaDaCampanha, nomeDaRegiao, relativeTime,
} from "./_global/parts";
import { RANKINGS_V12, REGIOES_V12, regiaoValida, type RankingV12, type RegiaoIdV12 } from "../../lib/rulesetV12";
import { textoDeParticipantes } from "./_global/participantes";
import {
  Activity, AlertTriangle, RotateCw, ScrollText, Search, Spinner, User, Users, X,
} from "../_design/icons";
import createStyles from "./CreateCampaignModal.module.css";
import { AvatarUsuario } from "../_design/AvatarUsuario";

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
}

type Filter = "all" | "narrator" | "player";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "narrator", label: "Narrador" },
  { id: "player", label: "Jogador" },
];

function IconeMais() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="2 2 12 12" aria-hidden="true">
    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="0.35" />
  </svg>;
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

  // Destaque: a sessão em andamento; sem nenhuma, a campanha da última
  // sessão registrada ("retomar operação").
  const comSessao = filtradas
    .filter((item) => !item.sessionError && item.latestSession)
    .sort((a, b) => b.latestSession!.started_at.localeCompare(a.latestSession!.started_at) || a.campaign.id.localeCompare(b.campaign.id));
  const destaque = comSessao.find((item) => item.latestSession!.ended_at === null) ?? comSessao[0];
  const resto = filtradas.filter((item) => item.campaign.id !== destaque?.campaign.id);

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

  function handleCreated(data: CampaignCardData) {
    setCreateOpen(false);
    pushToast("success", `Campanha "${data.campaign.name}" criada.`);
    router.push(`/mesas/${data.campaign.id}`);
  }

  return (
    <div className="ra2-page-bg-wrap">
      <div className="ra2-page-bg" aria-hidden="true">
        <div className="ra2-page-bg-img" />
        <div className="ra2-page-bg-tint" />
        <div className="ra2-page-bg-grad" />
        <div className="ra2-page-bg-mask" />
      </div>
      <div className="ra2-page ra2-view-enter" style={{ position: "relative", zIndex: 1 }}>
        <PageHead eyebrow="SYS.RUPTURA // ÁREA DE OPERAÇÕES" title="Minhas Campanhas" />

      <div className="ra2-toolbar">
        <div className="ra2-toolbar-group">
          <div className="ra2-search">
            <span className="ra2-search-icon" aria-hidden="true"><Search size={13} strokeWidth={1.4} /></span>
            <label htmlFor="busca-campanhas" className="sr-only">Buscar campanhas</label>
            <input
              id="busca-campanhas"
              data-testid="dash-busca"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar campanhas por nome…"
            />
          </div>

          <div className="ra2-segmented" role="tablist" aria-label="Filtrar por papel">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                data-testid={`dash-filtro-${f.id}`}
                onClick={() => setFilter(f.id)}
                className={`ra2-seg${filter === f.id ? " ra2-seg--active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="ra2-secondary"
          data-testid="dash-abrir-criar-mesa"
          onClick={abrirCriacao}
        >
          <IconeMais />
          <span>Criar campanha</span>
        </button>
      </div>

      {error && (
        <div className="ra-state-box ra-state-box--error" role="alert" data-testid="dash-erro">
          <div className="ra-state-icon"><AlertTriangle size={38} style={{ color: "#ff6a80" }} /></div>
          <h2 className="ra-h2" style={{ marginBottom: 8 }}>Falha ao carregar campanhas</h2>
          <p className="ra-muted" style={{ marginBottom: 22 }}>{error}</p>
          <button
            type="button"
            className="ra-btn"
            style={{ margin: "0 auto" }}
            onClick={() => { setError(null); router.refresh(); }}
          >
            <RotateCw size={13} /> Tentar novamente
          </button>
        </div>
      )}

      {!error && campanhas.length === 0 && (
        <div className="ra-empty" data-testid="dash-vazio">
          <div className="ra-empty-glyph"><ScrollText size={40} /></div>
          <h2 className="ra-empty-title">Você ainda não participa de nenhuma campanha</h2>
          <p className="ra-empty-text">
            Crie uma campanha para começar a narrar seu próprio mundo, ou entre por um convite
            enviado pelo narrador de uma mesa.
          </p>
          <div className="ra-empty-actions">
            <button type="button" className="ra-btn ra-btn--amber" onClick={abrirCriacao}>
              <IconeMais /> Criar campanha
            </button>
          </div>
        </div>
      )}

      {!error && campanhas.length > 0 && filtradas.length === 0 && (
        <div className="ra-state-box" data-testid="dash-sem-resultado">
          <div className="ra-state-icon"><Search size={36} style={{ color: "rgba(0,212,255,.5)" }} /></div>
          <h2 className="ra-h2" style={{ marginBottom: 8 }}>Nenhuma campanha encontrada</h2>
          <p className="ra-muted">
            Nada corresponde{search.trim() ? <> a <strong style={{ color: "#cfeaf6" }}>“{search.trim()}”</strong></> : null}
            {filter !== "all" ? " com esse filtro" : ""}.
          </p>
        </div>
      )}

      {!error && filtradas.length > 0 && (
        <div className="ra2-home-cols">
          <div className="ra2-col">
            {campanhas.some((item) => item.sessionError) && <p role="status" className="ra-muted">Não foi possível atualizar o estado de algumas sessões. Tentaremos novamente automaticamente.</p>}
            {destaque && <FeaturedCampaign data={destaque} />}
            {resto.length > 0 && (
              <>
                <SectionHead title="Todas as campanhas" count={resto.length} />
                {/* Sem stagger nenhum: os cards entram JUNTOS, no fade
                    da própria rota. Duas versões anteriores erraram
                    aqui — `animationDelay: index * 60ms` inline (sem
                    teto: 1,2s de cauda com 20 campanhas) e depois um
                    stagger de 28ms com teto no 8º. O teto resolvia o
                    tempo, não o problema: card entrando um a um chama
                    atenção pro ato de carregar em vez de pro conteúdo, e
                    num grid de cards grandes com borda luminosa lê como
                    pipoca. Uma lista é um bloco de informação, e chega
                    como um bloco. */}
                <div className="ag-grade" data-testid="dash-mesas-lista">
                  {resto.map((item) => <CampaignCard key={item.campaign.id} data={item} />)}
                  <button type="button" className="ag-nova ag-ch" onClick={abrirCriacao} data-testid="dash-cartao-nova">
                    <span className="ag-nova__mais" aria-hidden="true">+</span>
                    <span className="ag-mono ag-mono--cy">Nova campanha</span>
                    <span className="ag-mono ag-mono--peq">Abrir um novo setor</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className="ra2-side" aria-label="Painel lateral">
            <ActivityPanel campanhas={campanhas} />
            <NetworkPanel campanhas={campanhas} currentUserId={currentUserId} currentUserName={currentUserName}
              presenca={presencaDaRede} indisponivel={presencaIndisponivel} />
          </aside>
        </div>
      )}

      {/* `aberto` como PROP em vez de `createOpen && <Modal/>`: o
          próprio modal usa `usePresence` pra continuar montado durante
          os 150ms de saída — sem isso, React arrancava o nó no frame do
          clique e nenhuma animação de fechamento chegava a existir. */}
      <CreateCampaignModal aberto={createOpen} onClose={closeCreate} onCreated={handleCreated} />
      </div>
    </div>
  );
}

// ── Destaque ────────────────────────────────────────────────────────
function FeaturedCampaign({ data }: { data: CampaignCardData }) {
  const { campaign, role, narratorOnline, playerCount, latestSession } = data;
  const aoVivo = latestSession!.ended_at === null;
  const regiao = nomeDaRegiao(campaign);
  const descricao = textoDeParticipantes(narratorOnline, playerCount);
  return (
    <section className="ag-destaque-borda ag-borda ag-ch" aria-label="Campanha em destaque" data-testid="dash-mesa-destaque">
      <div className="ag-destaque ag-ch">
        <div className="ag-destaque__capa" style={capaDaCampanha(campaign)} aria-hidden="true" />
        <div className="ag-destaque__veu" aria-hidden="true" />
        <div className="ag-destaque__corpo">
          <span className="ag-mono ag-mono--am ag-destaque__status">
            {aoVivo
              ? "// Sessão em andamento"
              : <>{"// Retomar operação · última sessão "}{relativeTime(latestSession!.started_at)}</>}
          </span>
          <h2 className="ag-destaque__titulo">{campaign.name}</h2>
          {campaign.description && <p className="ag-destaque__descricao">{campaign.description}</p>}
          <div className="ag-destaque__identidade">
            {regiao && <span className="ag-destaque__regiao">Região · {regiao}</span>}
            <span className={`ag-papel${role === "narrator" ? " ag-papel--narrador" : ""}`}>{role === "narrator" ? "Narrador" : "Jogador"}</span>
          </div>
          {aoVivo && <p className="ag-destaque__presenca" data-testid="dash-destaque-participantes" title={descricao}><span className="ag-destaque__presenca-ponto" aria-hidden="true" />{descricao}</p>}
        </div>
        <div className="ag-destaque__rodape">
          <div className="ag-destaque__dado">
            <span className="ag-mono">Elenco</span>
            <strong>{data.characterCount} {data.characterCount === 1 ? "personagem" : "personagens"}</strong>
          </div>
          <div className="ag-destaque__dado">
            <span className="ag-mono">{aoVivo ? "Sessão iniciada" : "Última sessão"}</span>
            <time dateTime={latestSession!.started_at}>{new Date(latestSession!.started_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
          </div>
          <Link
            href={`/mesas/${campaign.id}`}
            data-testid={`dash-abrir-${campaign.id}`}
            className="ag-entrar ag-destaque__entrar"
            aria-label={`Entrar na campanha ${campaign.name}`}
          >
            <ChevronRight size={17} strokeWidth={2} aria-hidden="true" /><span>Entrar na mesa</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Card ────────────────────────────────────────────────────────────
function CampaignCard({ data }: { data: CampaignCardData }) {
  const { campaign, role } = data;
  const regiao = nomeDaRegiao(campaign);
  const narrador = role === "narrator";
  return (
    <div className="ag-cartao-borda ag-borda ag-ch" data-testid="dash-mesa-item">
      <div className="ag-cartao ag-ch">
        <div className="ag-cartao__capa" style={capaDaCampanha(campaign)} aria-hidden="true" />
        <div className="ag-cartao__veu" aria-hidden="true" />
        <div className="ag-cartao__corpo">
          <span className={`ag-etiqueta ag-etiqueta--${narrador ? "narrador" : "jogador"}`}>◆ {narrador ? "Narrador" : "Jogador"}</span>
          <h3 className="ag-cartao__titulo" title={campaign.name}>{campaign.name}</h3>
          <div className="ag-cartao__rodape">
            <span className="ag-mono ag-mono--peq">{regiao ? `${regiao} · ` : ""}{relativeTime(campaign.updated_at)}</span>
            <Link
              href={`/mesas/${campaign.id}`}
              data-testid={`dash-abrir-${campaign.id}`}
              className="ag-entrar ag-entrar--peq"
              aria-label={`${narrador ? "Entrar na" : "Abrir"} campanha ${campaign.name}`}
            >
              <ChevronRight size={16} strokeWidth={2} aria-hidden="true" /><span>Entrar</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Painéis laterais ────────────────────────────────────────────────
function ActivityPanel({ campanhas }: { campanhas: CampaignCardData[] }) {
  const rows = useMemo(
    () => campanhas.filter((item) => !item.sessionError && item.latestSession)
      .sort((a, b) => b.latestSession!.started_at.localeCompare(a.latestSession!.started_at) || a.campaign.id.localeCompare(b.campaign.id))
      .slice(0, 4),
    [campanhas],
  );

  return (
    <div className="ra2-panel">
      <div className="ra2-panel-title">
        <Activity size={12} strokeWidth={1.4} /> Atividade recente
      </div>
      {rows.length === 0 ? (
        <p className="ra-muted" style={{ fontSize: 12.5 }}>Nenhuma atividade recente.</p>
      ) : (
        <div className="ra2-panel-list">
          {rows.map((row, i) => (
            <div key={row.campaign.id}>
              {i > 0 && <div className="ra2-panel-sep" aria-hidden="true" />}
              <div className="ra2-panel-row">
                <span style={{ paddingTop: 6 }}><span className="ra-diamond" aria-hidden="true" /></span>
                <div className="ra2-panel-row-main">
                  <strong title={row.campaign.name}>{row.campaign.name}</strong>
                  <span>Última sessão: <time dateTime={row.latestSession!.started_at}>{new Date(row.latestSession!.started_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <DecoBottom />
    </div>
  );
}

function NetworkPanel({ campanhas, currentUserId, currentUserName, presenca, indisponivel }: {
  campanhas: CampaignCardData[];
  currentUserId: string;
  currentUserName: string;
  presenca: Record<string, boolean>;
  indisponivel: boolean;
}) {
  const people = useMemo(() => {
    const map = new Map<string, string>();
    // A própria conta já é a primeira linha; sem isto o narrador apareceria duas vezes.
    campanhas.forEach((c) => c.people.forEach((p) => { if (p.userId !== currentUserId) map.set(p.userId, p.name); }));
    return Array.from(map.entries()).map(([userId, name]) => ({ userId, name }));
  }, [campanhas, currentUserId]);

  const somenteJogador = campanhas.length > 0 && campanhas.every((c) => c.role === "player");

  return (
    <div className="ra2-panel">
      <div className="ra2-panel-title">
        <Users size={12} strokeWidth={1.4} /> Rede
      </div>
      {/* Cada pessoa vira um link de verdade para o perfil: dentro de
          /mesas a navegação é interceptada e abre em modal, e o mesmo
          endereço colado numa aba nova abre a página cheia. A linha
          inteira é o alvo, então Enter e Espaço funcionam sem
          `onKeyDown` improvisado. */}
      <div className="ra2-people">
        {[{ userId: currentUserId, name: currentUserName, eu: true },
          ...people.map((p) => ({ ...p, eu: false }))].map((p) => {
          const online = presenca[p.userId] === true;
          return (
            <Link key={p.userId} href={`/perfil?userId=${p.userId}`}
              className={`ra2-person ra2-person--link${online ? "" : " ra2-person--off"}`}
              data-testid={p.eu ? "rede-pessoa-eu" : "rede-pessoa"}>
              <span className="ra2-person-avatar" aria-hidden="true" style={{ overflow: "hidden" }}>
                <AvatarUsuario userId={p.userId} fallback={<User size={14} strokeWidth={1.3} />} />
              </span>
              <div className="ra2-person-main">
                <span className="ra2-person-name">{p.name}{p.eu ? " (você)" : ""}</span>
                {indisponivel
                  ? <span className="ra2-person-off">status indisponível</span>
                  : online
                    ? <span className="ra-online">
                        <span className="ra-online-dot" aria-hidden="true" />
                        <span className="ra-online-txt">Online</span>
                      </span>
                    : <span className="ra2-person-off">offline</span>}
              </div>
            </Link>
          );
        })}
      </div>

      {people.length === 0 && (
        <p className="ra-hint">
          {somenteJogador
            ? "A lista de participantes de uma mesa só é visível para quem a narra."
            : "Convide jogadores em Jogadores e convites, dentro de cada campanha."}
        </p>
      )}
      <DecoBottom />
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
  const { montado, visivel } = usePresence(aberto);
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const capaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setPreviewId(crypto.randomUUID()); }, []);

  // A devolução do foco ao gatilho é responsabilidade do PAI
  // (`devolverFocoAoGatilho`) — ver a nota lá: aqui dentro o
  // `autoFocus` do input já apagou o rastro de quem abriu.

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
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
  }, [aberto, busy, onClose]);

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
    setErro(null);
  }

  return (
    <div
      className="ra-overlay"
      data-open={visivel}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div ref={dialogRef} className={`ra-modal ${createStyles.modal}`} role="dialog" aria-modal="true" aria-labelledby="criar-campanha-titulo">
        <h2 id="criar-campanha-titulo" className="sr-only">Criar campanha</h2>
        <header className={createStyles.banner}>
          <div className={createStyles.cover} style={capaPreview ? { backgroundImage: `url('${capaPreview}')` } : capaDaCampanha({ id: previewId, regiao })} aria-hidden="true" />
          <div className={createStyles.veil} aria-hidden="true" />
          <button type="button" className={createStyles.close} onClick={onClose} disabled={busy} aria-label="Fechar">
            <X size={15} />
          </button>
          <div className={createStyles.bannerCopy}>
            <span className={createStyles.eyebrow}>SYS.FORGE // NOVA CAMPANHA</span>
            <span className={createStyles.role}>◆ Narrador</span>
            <p className={createStyles.previewName}>{nome.trim() || "Nome da campanha"}</p>
          </div>
          <button type="button" className={`${createStyles.button} ${createStyles.upload}`} onClick={() => capaInputRef.current?.click()} disabled={busy}>
            <ImagePlus size={14} /> {capa ? "Trocar capa" : "Escolher capa"}
          </button>
          <input ref={capaInputRef} id="nova-campanha-capa" className={createStyles.fileInput} type="file"
            accept="image/png,image/jpeg,image/webp" disabled={busy}
            onChange={(e) => handleCoverFile(e.target.files?.[0] ?? null)} />
        </header>

        <div className={createStyles.coverStrip}>
          <span>{capa ? "Sua capa · recorte central em 16:9" : "Capa padrão · PNG, JPEG ou WebP · até 5 MB"}</span>
          {capa && <button type="button" className={createStyles.remove} disabled={busy}
            onClick={() => { handleCoverFile(null); if (capaInputRef.current) capaInputRef.current.value = ""; }}>Remover capa</button>}
        </div>

        <div className={createStyles.fields}>
          <div className={createStyles.field}>
            <label className={createStyles.label} htmlFor="nova-campanha-nome">Nome da campanha</label>
            <input id="nova-campanha-nome" data-testid="dash-nova-mesa" className={createStyles.input}
              value={nome} autoFocus maxLength={120}
              onChange={(e) => { setNome(e.target.value); setNomeTocado(true); if (e.target.value.trim()) setErro(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              placeholder="Ex.: Ecos de Vosek" />
            {nomeTocado && !nome.trim() && <span role="alert" className={createStyles.fieldError}>Informe o nome da campanha.</span>}
          </div>
          <div className={createStyles.field}>
            <label className={createStyles.label} htmlFor="nova-campanha-regiao">Região inicial <span className={createStyles.optional}>Opcional</span></label>
            <select id="nova-campanha-regiao" data-testid="dash-nova-mesa-regiao" className={createStyles.input}
              value={regiao ?? ""} onChange={(e) => setRegiao(regiaoValida(e.target.value))}>
              <option value="">Decidir depois</option>
              {(Object.keys(REGIOES_V12) as RegiaoIdV12[]).map((id) => <option key={id} value={id}>{REGIOES_V12[id].nome}</option>)}
            </select>
          </div>
          <div className={createStyles.field}>
            <label className={createStyles.label} htmlFor="nova-campanha-ranking">Ranking inicial</label>
            <select id="nova-campanha-ranking" data-testid="dash-nova-mesa-ranking" className={createStyles.input}
              value={rankingInicial} onChange={(e) => setRankingInicial(e.target.value as RankingV12)}>
              {RANKINGS_V12.map((rank) => <option key={rank} value={rank}>Rank {rank}</option>)}
            </select>
          </div>
          <div className={`${createStyles.field} ${createStyles.full}`}>
            <label className={createStyles.label} htmlFor="nova-campanha-descricao">Descrição <span className={createStyles.optional}>Opcional</span></label>
            <textarea id="nova-campanha-descricao" className={createStyles.input} value={descricao} maxLength={1000}
              onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Sobre o que é esta campanha?" />
            <span className={createStyles.counter}>{descricao.length} / 1000</span>
          </div>
        </div>

        {erro && <p role="alert" className={createStyles.error}>{erro}</p>}

        <footer className={createStyles.footer}>
          <span className={createStyles.footerNote}><Shield size={14} aria-hidden="true" /> Você entra como narrador.</span>
          <button type="button" className={createStyles.button} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={`${createStyles.button} ${createStyles.primary}`}
            data-testid="dash-criar-mesa" onClick={handleCreate} disabled={busy || !nome.trim()}>
            {busy ? <><Spinner size={13} className="ra-spin" /> Forjando…</> : <>Criar campanha <ArrowRight size={14} aria-hidden="true" /></>}
          </button>
        </footer>
      </div>
    </div>
  );
}
