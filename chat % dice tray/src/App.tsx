import { useState } from "react";
import {
  SpellCard,
  ConditionCard,
  EffectCard,
  ItemCard,
  WeaponCard,
  TalentCard,
  ACCENTS,
  Badge,
  CommandButton,
  GhostButton,
  ResultStrip,
  DurationPill,
  type ResultKey,
} from "./components/cards";
import {
  SpellCardB,
  ConditionCardB,
  EffectCardB,
  ItemCardB,
  WeaponCardB,
  TalentCardB,
} from "./components/cardsB";
import ToolsWorkspace from "./components/tools";
import ToolsConsole from "./components/toolsConsole";
import { DicePhysicsLab, DiceTray } from "./components/dice";

type Design = "A" | "B";
type View = "A" | "B" | "tools" | "console" | "physics";

/* ------------------------------------------------------------------ */

function Ambient() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{ background: "radial-gradient(1100px 600px at 82% -15%, rgba(69,184,201,0.05), transparent 60%)" }}
      />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(#0d1a2b 1px, transparent 1px), linear-gradient(90deg, #0d1a2b 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage: "radial-gradient(circle at 55% 30%, black, transparent 80%)",
        }}
      />
    </div>
  );
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { key: View; label: string }[] = [
    { key: "A", label: "Chat · A" },
    { key: "B", label: "Chat · B" },
    { key: "tools", label: "Ferram. · Flutuante" },
    { key: "console", label: "Ferram. · Console" },
    { key: "physics", label: "Lab · Dados" },
  ];
  return (
    <div className="flex rounded-[2px] p-0.5" style={{ border: "1px solid #182338", background: "#0a111e" }}>
      {opts.map((o) => {
        const active = view === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="rounded-[1px] px-3 py-1 font-display text-[9.5px] font-600 uppercase tracking-[0.14em] transition-colors"
            style={{
              color: active ? "#0c1420" : "#6f83a3",
              background: active ? ACCENTS.cyan.hex : "transparent",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TopBar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <header className="flex items-center justify-between gap-3 px-6 py-3.5" style={{ borderBottom: "1px solid #182338" }}>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-[17px] font-700 uppercase tracking-[0.36em] text-ink">Ruptura</span>
        <span className="hidden font-mono text-[8.5px] uppercase tracking-[0.24em] text-cyan sm:inline">
          VTT Engine v0.0.1
        </span>
      </div>
      <ViewSwitch view={view} onChange={onChange} />
    </header>
  );
}

/* ------------------------------------------------------------------ */

function ChatFeed({ design }: { design: Design }) {
  if (design === "A")
    return (
      <>
        <SpellCard cast />
        <WeaponCard rolled result="critico" />
        <ConditionCard />
        <EffectCard />
        <ItemCard used />
        <TalentCard />
      </>
    );
  return (
    <>
      <SpellCardB cast />
      <WeaponCardB rolled result="critico" />
      <ConditionCardB />
      <EffectCardB />
      <ItemCardB used />
      <TalentCardB />
    </>
  );
}

function ChatLog({ design }: { design: Design }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[3px]" style={{ background: "rgba(9,15,26,0.6)", border: "1px solid #182338" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #182338" }}>
        <div>
          <div className="font-display text-[11px] font-700 uppercase tracking-[0.2em] text-ink">Chat Log</div>
          <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-faint">Mesa Teste v0.58 • Rodada 2</div>
        </div>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-faint">6 eventos</span>
      </div>

      <div className="rup-scroll flex-1 space-y-2 overflow-y-auto p-3">
        <ChatFeed design={design} />
      </div>

      {design === "B" && (
        <div className="px-3 pt-3">
          <DiceTray />
        </div>
      )}

      <div className="flex items-center gap-2 p-3" style={{ borderTop: "1px solid #182338" }}>
        <div className="flex flex-1 items-center gap-2 rounded-[2px] px-3 py-2" style={{ background: "#0c1420", border: "1px solid #182338" }}>
          <span className="font-mono text-[10px] text-cyan">›</span>
          <span className="font-mono text-[10px] text-ink-faint">Enviar mensagem ou /rolar…</span>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-[2px] text-cyan transition-colors hover:text-cyan-bright"
          style={{ border: "1px solid #1c4a52", background: "rgba(69,184,201,0.07)" }}
          aria-label="Enviar"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const TABS = [
  { key: "magia", label: "Magia" },
  { key: "condicao", label: "Condição" },
  { key: "efeito", label: "Efeito" },
  { key: "item", label: "Item" },
  { key: "arma", label: "Arma" },
  { key: "talento", label: "Talento" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function renderCard(tab: TabKey, design: Design, expanded: boolean) {
  const p = { defaultExpanded: expanded };
  if (design === "A")
    switch (tab) {
      case "magia": return <SpellCard {...p} vertente="Energética" />;
      case "condicao": return <ConditionCard {...p} />;
      case "efeito": return <EffectCard {...p} />;
      case "item": return <ItemCard {...p} />;
      case "arma": return <WeaponCard {...p} rolled result="padrao" />;
      case "talento": return <TalentCard {...p} />;
    }
  switch (tab) {
    case "magia": return <SpellCardB {...p} />;
    case "condicao": return <ConditionCardB {...p} />;
    case "efeito": return <EffectCardB {...p} />;
    case "item": return <ItemCardB {...p} />;
    case "arma": return <WeaponCardB {...p} rolled result="padrao" />;
    case "talento": return <TalentCardB {...p} />;
  }
}

function ColLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-display text-[8.5px] font-600 uppercase tracking-[0.22em] text-ink-faint">{children}</span>;
}

function ShowcasePair({ tab, design }: { tab: TabKey; design: Design }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <ColLabel>Compacto</ColLabel>
        {renderCard(tab, design, false)}
      </div>
      <div className="space-y-2">
        <ColLabel>Expandido</ColLabel>
        {renderCard(tab, design, true)}
      </div>
    </div>
  );
}

function Panel({ title, code, children }: { title: string; code: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[3px] p-4" style={{ background: "#0c1420", border: "1px solid #182338" }}>
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="font-display text-[12px] font-700 uppercase tracking-[0.16em] text-ink">{title}</h2>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-faint">{code}</span>
      </div>
      {children}
    </section>
  );
}

const RESULT_KEYS: ResultKey[] = ["critico", "padrao", "limitado", "falha-limitada", "falha"];
const ROLLS = ["21", "17", "12", "8", "4"];

function Showcase({ design }: { design: Design }) {
  const [tab, setTab] = useState<TabKey>("arma");
  return (
    <div className="rup-scroll h-full overflow-y-auto pb-10 pr-1">
      <div className="mb-5">
        <div className="font-mono text-[8.5px] uppercase tracking-[0.26em] text-cyan">
          sys.ruptura // showcase · design {design}
        </div>
        <h1 className="mt-1.5 font-display text-[26px] font-700 uppercase tracking-[0.05em] text-ink">
          Cards do Chat Log
        </h1>
        <p className="mt-1.5 max-w-lg text-[12px] leading-relaxed text-ink-dim">
          {design === "A"
            ? "Opção A — painel: trilho de acento lateral, ícone em tile e grade de números. Sóbrio e denso."
            : "Opção B — dossiê de campo: brackets nos cantos, espinha lateral com categoria vertical e stats inline."}
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="rounded-[2px] px-3 py-1.5 font-display text-[10px] font-600 uppercase tracking-[0.14em] transition-colors"
              style={{
                color: active ? "#0c1420" : "#6f83a3",
                background: active ? ACCENTS.cyan.hex : "transparent",
                border: `1px solid ${active ? ACCENTS.cyan.hex : "#182338"}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mb-8">
        <ShowcasePair tab={tab} design={design} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Resultados de Teste" code="result">
          <div className="space-y-1.5">
            {RESULT_KEYS.map((k, i) => (
              <ResultStrip key={k} result={k} roll={ROLLS[i]} />
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Badges" code="badge">
            <div className="flex flex-wrap gap-1.5">
              <Badge accent={ACCENTS.cyan}>Cinética</Badge>
              <Badge accent={ACCENTS.amber}>Energética</Badge>
              <Badge accent={ACCENTS.arcane}>Cognitiva</Badge>
              <Badge accent={ACCENTS.danger}>Negativa</Badge>
              <Badge>Nível 3</Badge>
              <Badge accent={ACCENTS.slate}>Utilizado</Badge>
            </div>
          </Panel>

          <Panel title="Duração" code="duration">
            <div className="flex flex-col gap-2">
              <DurationPill accent={ACCENTS.cyan}>2 rodadas restantes</DurationPill>
              <DurationPill accent={ACCENTS.arcane}>Expira: início do turno</DurationPill>
              <DurationPill expired>Expirado</DurationPill>
            </div>
          </Panel>
        </div>

        <Panel title="Comandos" code="command">
          <div className="grid grid-cols-2 gap-2">
            <CommandButton accent={ACCENTS.amber}>Atacar</CommandButton>
            <CommandButton accent={ACCENTS.arcane}>Conjurar</CommandButton>
            <CommandButton disabled>Utilizado</CommandButton>
            <GhostButton>Ver Detalhes</GhostButton>
          </div>
        </Panel>

        <Panel title="Estado — Expirado" code="state">
          {design === "A" ? <EffectCard expired /> : <EffectCardB expired />}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function App() {
  const [view, setView] = useState<View>("A");
  const design: Design = view === "B" ? "B" : "A";
  return (
    <div className="flex h-full flex-col font-body text-ink">
      <Ambient />
      <TopBar view={view} onChange={setView} />
      {view === "tools" || view === "console" || view === "physics" ? (
        <main className="min-h-0 flex-1 p-5">
          {view === "tools" ? <ToolsWorkspace /> : view === "console" ? <ToolsConsole /> : <DicePhysicsLab />}
        </main>
      ) : (
        <main className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(340px,400px)_1fr] lg:overflow-hidden">
          <div className="h-[78vh] min-h-0 lg:h-auto">
            <ChatLog design={design} />
          </div>
          <div className="min-h-0">
            <Showcase design={design} />
          </div>
        </main>
      )}
    </div>
  );
}
