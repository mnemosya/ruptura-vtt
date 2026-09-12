import { useState } from "react";
import { ACCENTS } from "./components/ui";
import ToolsWorkspace from "./components/tools";
import ToolsConsole from "./components/toolsConsole";
import Sidebar from "./components/sidebar";
import ChargeLab from "./components/chargeLab";

type MainView = "tools" | "console" | "lab";

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

function ViewSwitch({ view, onChange }: { view: MainView; onChange: (v: MainView) => void }) {
  const opts: { key: MainView; label: string }[] = [
    { key: "tools", label: "Ferramentas" },
    { key: "console", label: "Console" },
    { key: "lab", label: "Charge Lab" },
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
            style={{ color: active ? "#0c1420" : "#6f83a3", background: active ? ACCENTS.cyan.hex : "transparent" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TopBar({ view, onChange }: { view: MainView; onChange: (v: MainView) => void }) {
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

export default function App() {
  const [view, setView] = useState<MainView>("tools");
  return (
    <div className="flex h-full flex-col font-body text-ink">
      <Ambient />
      <TopBar view={view} onChange={setView} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-hidden">
          {view === "tools" && <ToolsWorkspace />}
          {view === "console" && <ToolsConsole />}
          {view === "lab" && <ChargeLab />}
        </main>
        <Sidebar />
      </div>
    </div>
  );
}
