"use client";

/**
 * Shell da ÁREA AUTENTICADA GLOBAL (aditivo §4.3 — o "menu geral da
 * conta", que existe FORA de qualquer campanha). Substitui a antiga
 * `AccountNav` horizontal.
 *
 * Estrutura, conforme a referência do Figma:
 *   - sidebar expandida por padrão (marca + navegação com ícone e
 *     texto + Sair no rodapé), recolhível para o modo compacto (só
 *     ícones) e expansível de novo — a escolha fica guardada no
 *     `localStorage`; em telas estreitas ela vira drawer;
 *   - topbar discreta, só com o controle de perfil à direita e seu
 *     menu suspenso;
 *   - fundo HUD com parallax, grade, vinheta e scanlines;
 *   - cursor HUD próprio.
 *
 * As preferências visuais ("reduzir movimento", "alto contraste") vivem
 * aqui em contexto + `localStorage`: são preferências de renderização
 * desta instalação, não dados de conta (não há hoje onde persistí-las
 * no servidor — ver pendência em docs/checkpoints).
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LinkPending, NavPendingProvider } from "../../_design/NavPending";
import { BootMinDurationOverlay } from "../../_boundaries/BootMinDurationOverlay";
import { signOut } from "../../../lib/auth/actions";
import {
  AlertTriangle, BookText, CheckCircle, ChevronDown, LayoutGrid, LogOut, Menu,
  PanelLeftClose, PanelLeftOpen, Plus, Spinner, Ticket, User, UserCog, Users, X,
} from "../../_design/icons";
import "../../_design/app.css";

export type NavKey = "campaigns" | "characters" | "compendium" | "account";

const NAV_ITEMS: { key: NavKey; label: string; href: string; icon: React.ReactNode }[] = [
  { key: "campaigns", label: "Minhas Campanhas", href: "/mesas", icon: <LayoutGrid size={18} strokeWidth={1.5} /> },
  { key: "characters", label: "Personagens", href: "/mesas/personagens", icon: <Users size={18} strokeWidth={1.5} /> },
  { key: "compendium", label: "Compêndio", href: "/mesas/compendio", icon: <BookText size={18} strokeWidth={1.5} /> },
  { key: "account", label: "Conta e Preferências", href: "/mesas/conta", icon: <UserCog size={18} strokeWidth={1.5} /> },
];

const COLLAPSED_KEY = "ruptura.sidebar.collapsed";
const PREFS_KEY = "ruptura.prefs";

// ── Preferências visuais ────────────────────────────────────────────
export interface VisualPrefs { reduceMotion: boolean; highContrast: boolean }
interface PrefsContextValue {
  prefs: VisualPrefs;
  togglePref: (key: keyof VisualPrefs) => void;
}
const PrefsContext = createContext<PrefsContextValue | null>(null);

/** Preferências visuais do shell global. Só funciona dentro de <GlobalShell>. */
export function useVisualPrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("useVisualPrefs precisa estar dentro de <GlobalShell>.");
  return ctx;
}

// ── Toasts ──────────────────────────────────────────────────────────
export type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; text: string }
const ToastContext = createContext<((kind: ToastKind, text: string) => void) | null>(null);

/** Empurra um aviso efêmero no rodapé. Fora do shell, vira no-op. */
export function usePushToast() {
  return useContext(ToastContext) ?? (() => undefined);
}

// ── Cursor HUD ──────────────────────────────────────────────────────
/**
 * Exportado para o Console do Personagem (`src/app/ficha/_console/`)
 * reusar o MESMO tracking (mousemove/hover/click), em vez de uma
 * implementação paralela — o Console não passa por `GlobalShell`, mas
 * precisa do mesmo cursor HUD do resto do VTT.
 */
export function HudCursor({ enabled }: { enabled: boolean }) {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -300, y: -300 });
  const ring = useRef({ x: -300, y: -300 });
  const raf = useRef(0);
  const hovering = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) dotRef.current.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
      const target = e.target as HTMLElement | null;
      const hoverable = target?.closest?.("button, a, input, select, textarea, [role='tab'], [role='button'], label");
      if (hoverable && !hovering.current) {
        hovering.current = true;
        ringRef.current?.classList.add("ra-cursor-ring--hover");
      } else if (!hoverable && hovering.current) {
        hovering.current = false;
        ringRef.current?.classList.remove("ra-cursor-ring--hover");
      }
    };
    const tick = () => {
      ring.current.x += (mouse.current.x - ring.current.x) * 0.14;
      ring.current.y += (mouse.current.y - ring.current.y) * 0.14;
      if (ringRef.current) ringRef.current.style.transform = `translate(${ring.current.x - 17}px, ${ring.current.y - 17}px)`;
      raf.current = requestAnimationFrame(tick);
    };
    const onDown = () => ringRef.current?.classList.add("ra-cursor-ring--click");
    const onUp = () => ringRef.current?.classList.remove("ra-cursor-ring--click");

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    raf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(raf.current);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={dotRef} className="ra-cursor-dot" aria-hidden="true" />
      <div ref={ringRef} className="ra-cursor-ring" aria-hidden="true" />
    </>
  );
}

function useParallax(ref: React.RefObject<HTMLDivElement | null>, strength: number, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const onMove = (e: MouseEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * strength;
      target.y = (e.clientY / window.innerHeight - 0.5) * strength;
    };
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.05;
      cur.y += (target.y - cur.y) * 0.05;
      if (ref.current) ref.current.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, [ref, strength, enabled]);
}

// ── Shell ───────────────────────────────────────────────────────────
/**
 * Rota ativa DERIVADA do pathname, não recebida por prop.
 *
 * Mudou porque a casca saiu das páginas e subiu para o layout do grupo
 * `(global)` — e um layout não sabe (nem deve saber) qual das quatro
 * rotas filhas está em cena. `usePathname` já estava aqui de qualquer
 * forma; a prop `active` só duplicava, em quatro lugares, uma
 * informação que o próprio componente tinha.
 *
 * Ordem importa: `/mesas` é prefixo de todas as outras, então a
 * checagem exata dele vem por último.
 */
function rotaAtiva(pathname: string): NavKey | null {
  if (pathname.startsWith("/mesas/personagens")) return "characters";
  if (pathname.startsWith("/mesas/compendio")) return "compendium";
  if (pathname.startsWith("/mesas/conta")) return "account";
  if (pathname === "/mesas") return "campaigns";
  return null;
}

export function GlobalShell({
  userEmail,
  displayName,
  children,
}: {
  userEmail: string;
  displayName: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ativo = rotaAtiva(pathname);

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [prefs, setPrefs] = useState<VisualPrefs>({ reduceMotion: false, highContrast: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const bgRef = useRef<HTMLDivElement>(null);
  useParallax(bgRef, 20, !prefs.reduceMotion);

  // Estado guardado localmente — lido depois da hidratação para não
  // divergir do HTML do servidor.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VisualPrefs>;
        setPrefs({ reduceMotion: !!parsed.reduceMotion, highContrast: !!parsed.highContrast });
      }
    } catch {
      /* localStorage indisponível (modo privado, etc.) — segue com o padrão. */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignora */ }
      return next;
    });
  }, []);

  const togglePref = useCallback((key: keyof VisualPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignora */ }
      return next;
    });
  }, []);

  const pushToast = useCallback((kind: ToastKind, text: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  // Fecha o menu de perfil ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Navegar fecha o drawer (o Link já trocou a rota).
  useEffect(() => { setDrawerOpen(false); setMenuOpen(false); }, [pathname]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const shortName = useMemo(() => {
    const base = displayName?.trim() || userEmail.split("@")[0] || "Operador";
    return base.split(" ")[0];
  }, [displayName, userEmail]);

  const prefsValue = useMemo(() => ({ prefs, togglePref }), [prefs, togglePref]);

  const rootClass = [
    "ra-root",
    prefs.highContrast ? "ra-hc" : "",
    prefs.reduceMotion ? "ra-reduce-motion ra-no-cursor" : "",
  ].filter(Boolean).join(" ");

  return (
    <PrefsContext.Provider value={prefsValue}>
      <ToastContext.Provider value={pushToast}>
        {/* Agrega `useLinkStatus()` de todo `<LinkPending>` desta casca
            numa contagem única — é o sinal que `BootMinDurationOverlay`
            (dentro de `.ra2-content`, abaixo) usa pra saber se alguma
            navegação está em voo. Precisa envolver TANTO os links do
            menu quanto a sobreposição, então fica na raiz da árvore. */}
        <NavPendingProvider>
        <div className={rootClass}>
          <HudCursor enabled={!prefs.reduceMotion} />

          <div className="ra-bg" aria-hidden="true">
            <div className="ra-bg-img" ref={bgRef} />
            <div className="ra-bg-grid" />
            <div className="ra-bg-vignette" />
          </div>
          <div className="ra-scanlines" aria-hidden="true" />
          <div className="ra-vp-corner ra-vp-tl" aria-hidden="true" />
          <div className="ra-vp-corner ra-vp-tr" aria-hidden="true" />
          <div className="ra-vp-corner ra-vp-bl" aria-hidden="true" />
          <div className="ra-vp-corner ra-vp-br" aria-hidden="true" />

          <div className="ra2-shell">
            {/*
              MONTADO sempre, visibilidade por `data-open` — antes era
              `drawerOpen && <div/>`, e por isso o véu era ARRANCADO do
              DOM no frame do clique enquanto a sidebar ainda deslizava
              por 250ms. Os dois agora saem juntos, com as mesmas
              durações (`.mo-scrim`, motion.css). Fora do mobile ele
              continua `display: none` pela media query de `app.css`,
              então montá-lo sempre não custa nada.
            */}
            <div
              className="ra2-scrim mo-scrim"
              data-open={drawerOpen}
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />

            <div className={`ra2-sidebar-wrap${drawerOpen ? " ra2-sidebar-wrap--open" : ""}`}>
              <nav
                className={`ra2-sidebar${collapsed ? " ra2-sidebar--collapsed" : ""}`}
                aria-label="Navegação global"
              >
                <Link href="/mesas" className="ra2-brand" aria-label="Ruptura VTT — Minhas Campanhas">
                  {collapsed ? (
                    <span className="ra2-brand-mark" aria-hidden="true">R</span>
                  ) : (
                    <span className="ra2-brand-full">
                      <span className="ra2-brand-name">RUPTURA</span>
                      <span className="ra2-brand-sub" style={{ display: "block" }}>VTT ENGINE v0.0.1</span>
                    </span>
                  )}
                </Link>

                <div className="ra2-nav">
                  {NAV_ITEMS.map((item) => {
                    const isActive = ativo === item.key;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        data-testid={`nav-${item.key}`}
                        aria-current={isActive ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`ra2-nav-item${isActive ? " ra2-nav-item--active" : ""}`}
                      >
                        <span className="ra2-nav-icon">{item.icon}</span>
                        <span className="ra2-nav-label">{item.label}</span>
                        {/* Destino pendente — ver `NavPending.tsx` e
                            `.ra2-nav-item:has(.mo-linkflag)` em app.css. */}
                        <LinkPending />
                      </Link>
                    );
                  })}
                </div>

                <div className="ra2-sidebar-foot">
                  <button
                    type="button"
                    data-testid="sidebar-recolher"
                    className="ra2-collapse-btn"
                    onClick={toggleCollapsed}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
                  >
                    {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                    <span>Recolher</span>
                  </button>

                  <button
                    type="button"
                    data-testid="account-nav-sair"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    title={collapsed ? "Sair" : undefined}
                    className="ra2-nav-item ra2-nav-logout"
                    aria-busy={signingOut}
                  >
                    {/* Sair chama uma Server Action + dois `router.*` —
                        é a ação mais lenta da casca e a única sem
                        feedback próprio até aqui. O rótulo já mudava
                        pra "Saindo…"; o que faltava era o sinal de que
                        algo está EM CURSO (e `aria-busy`, pro leitor de
                        tela receber a mesma informação). */}
                    <span className="ra2-nav-icon">
                      {signingOut
                        ? <Spinner size={18} strokeWidth={1.5} className="mo-spin" />
                        : <LogOut size={18} strokeWidth={1.5} />}
                    </span>
                    <span className="ra2-nav-label">{signingOut ? "Saindo…" : "Sair"}</span>
                  </button>
                </div>
              </nav>
            </div>

            <div className="ra2-main">
              <header className="ra2-topbar">
                <button
                  type="button"
                  className="ra2-menu-btn"
                  onClick={() => setDrawerOpen((o) => !o)}
                  aria-label="Abrir navegação"
                  aria-expanded={drawerOpen}
                >
                  <Menu size={18} />
                </button>

                <div className="ra-menu-anchor" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="ra2-profile"
                    data-testid="topbar-perfil"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    <span className="ra2-profile-avatar" aria-hidden="true"><User size={15} strokeWidth={1.4} /></span>
                    <span className="ra2-profile-name">{shortName}</span>
                    <span className="ra-online">
                      <span className="ra-online-dot" aria-hidden="true" />
                      <span className="ra-online-txt">Online</span>
                    </span>
                    <ChevronDown size={14} className={`ra2-chevron${menuOpen ? " ra2-chevron--up" : ""}`} />
                  </button>

                  {menuOpen && (
                    <div className="ra-menu" role="menu">
                      <div className="ra-menu-head">
                        <div className="ra-menu-name">{displayName?.trim() || shortName}</div>
                        <div className="ra-menu-mail">{userEmail}</div>
                      </div>
                      <Link href="/mesas" role="menuitem" className="ra-menu-item" data-testid="account-nav-minhas-campanhas">
                        <LayoutGrid size={15} /> Minhas Campanhas
                      </Link>
                      <Link href="/mesas?novo=1" role="menuitem" className="ra-menu-item" data-testid="account-nav-criar-campanha">
                        <Plus size={15} /> Criar campanha
                      </Link>
                      <Link href="/mesas/conta" role="menuitem" className="ra-menu-item" data-testid="account-nav-conta">
                        <UserCog size={15} /> Conta e preferências
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        className="ra-menu-item ra-menu-item--danger"
                        onClick={handleSignOut}
                        disabled={signingOut}
                      >
                        <LogOut size={15} /> {signingOut ? "Saindo…" : "Sair"}
                      </button>
                    </div>
                  )}
                </div>
              </header>

              <div className="ra2-content">
                {children}
                <BootMinDurationOverlay label="Carregando" />
              </div>
            </div>
          </div>

          <div className="ra-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`ra-toast${t.kind === "success" ? " ra-toast--success" : t.kind === "error" ? " ra-toast--error" : ""}`}
              >
                {t.kind === "success" ? <CheckCircle size={14} /> : t.kind === "error" ? <AlertTriangle size={14} /> : <Ticket size={14} />}
                {t.text}
              </div>
            ))}
          </div>
        </div>
        </NavPendingProvider>
      </ToastContext.Provider>
    </PrefsContext.Provider>
  );
}

/** Botão de fechar padrão dos modais do shell. */
export function ModalCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="ra-iconbtn ra-modal-close" onClick={onClose} aria-label="Fechar">
      <X size={16} />
    </button>
  );
}
