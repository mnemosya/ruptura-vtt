import { useState } from "react";
import { ACCENTS, type Accent } from "./ui";
import { Brackets } from "./tools";

/* ------------------------------------------------------------------ */
/*  Mock data                                                           */
/* ------------------------------------------------------------------ */

type Status = "online" | "ausente" | "offline";

type Participant = {
  id: string;
  initials: string;
  playerName: string;
  characterName: string;
  role: "Narrador" | "Jogador";
  status: Status;
  lastSeen?: string;
  ping?: number;
  accent: Accent;
  notes?: string;
};

const PARTICIPANTS: Participant[] = [
  {
    id: "gm",
    initials: "VT",
    playerName: "Voss Tamblyn",
    characterName: "Narrador",
    role: "Narrador",
    status: "online",
    ping: 24,
    accent: ACCENTS.amber,
    notes: "Mesa Teste · sessão 12",
  },
  {
    id: "p1",
    initials: "IS",
    playerName: "Irana Solis",
    characterName: "Mara Venn",
    role: "Jogador",
    status: "online",
    ping: 41,
    accent: ACCENTS.cyan,
  },
  {
    id: "p2",
    initials: "TM",
    playerName: "Theo Marceau",
    characterName: "Kael Dorn",
    role: "Jogador",
    status: "online",
    ping: 78,
    accent: ACCENTS.magenta,
  },
  {
    id: "p3",
    initials: "FA",
    playerName: "Fen Ashby",
    characterName: "Dex Carrow",
    role: "Jogador",
    status: "ausente",
    lastSeen: "há 8 min",
    accent: ACCENTS.slate,
    notes: "retorna em 5 min (msg no chat)",
  },
  {
    id: "p4",
    initials: "LB",
    playerName: "Loïc Beaumont",
    characterName: "Sienna Valk",
    role: "Jogador",
    status: "offline",
    lastSeen: "há 2 h",
    accent: ACCENTS.slate,
  },
  {
    id: "p5",
    initials: "RQ",
    playerName: "Rael Quinn",
    characterName: "Bree Ashton",
    role: "Jogador",
    status: "offline",
    lastSeen: "há 1 dia",
    accent: ACCENTS.slate,
  },
];

/* ------------------------------------------------------------------ */
/*  Status helpers                                                      */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<Status, string> = {
  online: "Online",
  ausente: "Ausente",
  offline: "Offline",
};

const STATUS_COLOR: Record<Status, string> = {
  online: ACCENTS.good.hex,
  ausente: ACCENTS.amber.hex,
  offline: "#2a3b58",
};

function StatusDot({ status, pulse }: { status: Status; pulse?: boolean }) {
  const color = STATUS_COLOR[status];
  return (
    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {pulse && status === "online" && (
        <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: color }} />
      )}
    </span>
  );
}

function PingBar({ ms }: { ms: number }) {
  const quality = ms < 60 ? ACCENTS.good : ms < 120 ? ACCENTS.amber : ACCENTS.danger;
  return (
    <span className="flex items-end gap-[2px]">
      {[3, 5, 7].map((h, i) => (
        <span key={i} className="w-[3px] rounded-[1px]" style={{ height: h, background: i === 0 ? quality.hex : i === 1 && ms < 150 ? quality.hex : i === 2 && ms < 80 ? quality.hex : "#16233a" }} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Row + detail                                                        */
/* ------------------------------------------------------------------ */

function ParticipantRow({ p, selected, onClick }: { p: Participant; selected: boolean; onClick: () => void }) {
  const accent = p.status === "online" ? p.accent : ACCENTS.slate;
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 rounded-[2px] px-3 py-3 text-left transition-colors"
      style={{
        border: `1px solid ${selected ? accent.hex + "77" : "#16233a"}`,
        background: selected ? accent.soft : "transparent",
      }}
    >
      {selected && <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-[1px]" style={{ background: accent.hex }} />}

      {/* avatar */}
      <div className="relative">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] font-display text-[11px] font-700"
          style={{
            color: p.status === "online" ? accent.hex : "#4f6285",
            border: `1px solid ${p.status === "online" ? accent.hex + "55" : "#1c2b45"}`,
            background: p.status === "online" ? accent.soft : "transparent",
          }}
        >
          {p.initials}
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b1424]" style={{ background: STATUS_COLOR[p.status] }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`truncate font-display text-[12px] font-700 uppercase tracking-[0.06em] ${p.status === "offline" ? "text-ink-faint" : "text-ink"}`}>{p.playerName}</span>
          {p.role === "Narrador" && (
            <span className="rounded-[2px] px-1.5 py-[1px] font-display text-[7.5px] font-700 uppercase tracking-[0.1em]" style={{ color: ACCENTS.amber.hex, border: `1px solid ${ACCENTS.amber.hex}44` }}>GM</span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">
          {p.characterName} · {p.status === "online" && p.ping ? `${p.ping} ms` : p.lastSeen ?? "—"}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {p.status === "online" && p.ping && <PingBar ms={p.ping} />}
        <StatusDot status={p.status} pulse />
      </div>
    </button>
  );
}

function DetailPanel({ p }: { p: Participant }) {
  const accent = p.status === "online" ? p.accent : ACCENTS.slate;
  return (
    <div
      className="relative flex h-full flex-col rounded-[2px] overflow-hidden"
      style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: `1px solid ${accent.hex}44` }}
    >
      <Brackets color={accent.hex} size={13} inset={8} />

      {/* spine */}
      <div className="absolute bottom-0 left-0 top-0 flex w-9 flex-col items-center justify-between py-4" style={{ borderRight: "1px solid #16233a", background: "rgba(255,255,255,0.013)" }}>
        <span className="font-mono text-[9px] font-700 tracking-widest" style={{ color: accent.hex }}>{p.initials}</span>
        <span className="font-display text-[8px] font-700 uppercase tracking-[0.3em]" style={{ color: accent.hex, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: 0.85 }}>PLAYER</span>
        <StatusDot status={p.status} pulse />
      </div>

      <div className="flex min-w-0 flex-1 flex-col pl-9">
        {/* header */}
        <div className="flex items-center gap-4 px-4 pb-3 pt-4" style={{ borderBottom: "1px solid #16233a" }}>
          <div className="flex-1">
            <h3 className="font-display text-[18px] font-700 uppercase tracking-[0.1em] leading-none text-ink">{p.playerName}</h3>
            <div className="mt-1.5 flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.12em]">
              <span className="h-1 w-1 rounded-full" style={{ background: STATUS_COLOR[p.status] }} />
              <span style={{ color: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status]}</span>
              {p.ping && <span className="text-ink-faint">· {p.ping} ms</span>}
              {p.lastSeen && <span className="text-ink-faint">· {p.lastSeen}</span>}
            </div>
          </div>
          {p.role === "Narrador" && (
            <span className="rounded-[2px] px-2.5 py-1 font-display text-[10px] font-700 uppercase tracking-[0.14em]" style={{ color: ACCENTS.amber.hex, border: `1px solid ${ACCENTS.amber.hex}66`, background: ACCENTS.amber.soft }}>Narrador</span>
          )}
        </div>

        <div className="rup-scroll flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-5">
            {/* character link */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">01</span>
                <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">Personagem</span>
                <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
              </div>
              <div className="flex items-center gap-3 rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-[2px] font-display text-[13px] font-700"
                  style={{ color: accent.hex, border: `1px solid ${accent.hex}55`, background: accent.soft }}
                >
                  {p.characterName.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="font-display text-[13px] font-700 uppercase tracking-[0.08em] text-ink">{p.characterName}</div>
                  <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{p.role} · Mesa Teste v0.58</div>
                </div>
              </div>
            </section>

            {/* connection */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">02</span>
                <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">Conexão</span>
                <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Status", value: STATUS_LABEL[p.status], color: STATUS_COLOR[p.status] },
                  { label: "Latência", value: p.ping ? `${p.ping} ms` : "—", color: p.ping && p.ping < 80 ? ACCENTS.good.hex : ACCENTS.amber.hex },
                  { label: "Última atividade", value: p.lastSeen ?? "agora", color: "#6f83a3" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-[2px] px-3 py-2.5 text-center" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                    <div className="font-mono text-[13px] font-700" style={{ color: stat.color }}>{stat.value}</div>
                    <div className="mt-0.5 font-display text-[7.5px] font-600 uppercase tracking-[0.12em] text-ink-faint">{stat.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* notes */}
            {p.notes && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">03</span>
                  <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">Notas</span>
                  <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
                </div>
                <div className="rounded-[2px] px-3 py-2.5" style={{ border: "1px solid #16233a", background: "#0c1420", borderLeftWidth: 2, borderLeftColor: accent.hex }}>
                  <span className="text-[11px] text-ink-dim">{p.notes}</span>
                </div>
              </section>
            )}

            {/* actions */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">04</span>
                <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">Ações</span>
                <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["Enviar Mensagem", "Ver Ficha", "Mover Token", "Silenciar"].map((a) => (
                  <button key={a} className="rounded-[2px] px-3 py-2 font-display text-[10px] font-600 uppercase tracking-[0.08em] text-left" style={{ border: "1px solid #16233a", color: "#8496b4" }}>
                    <span style={{ opacity: 0.5 }}>▹ </span>{a}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary header                                                      */
/* ------------------------------------------------------------------ */

function SummaryBar() {
  const online = PARTICIPANTS.filter((p) => p.status === "online").length;
  const ausente = PARTICIPANTS.filter((p) => p.status === "ausente").length;
  const offline = PARTICIPANTS.filter((p) => p.status === "offline").length;
  return (
    <div className="mb-4 flex items-center gap-6 rounded-[2px] px-4 py-2.5" style={{ background: "#0c1420", border: "1px solid #16233a" }}>
      {[
        { label: "Online", count: online, color: ACCENTS.good.hex },
        { label: "Ausente", count: ausente, color: ACCENTS.amber.hex },
        { label: "Offline", count: offline, color: "#2a3b58" },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: s.color }}>{s.count} {s.label}</span>
        </div>
      ))}
      <span className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-faint">Sessão 12 · 2h 14m decorridas</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                         */
/* ------------------------------------------------------------------ */

export default function Participantes() {
  const [selected, setSelected] = useState<string>("gm");
  const participant = PARTICIPANTS.find((p) => p.id === selected) ?? PARTICIPANTS[0];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SummaryBar />
      <div className="flex min-h-0 flex-1 gap-4">
        {/* list */}
        <div className="flex w-[270px] shrink-0 flex-col overflow-hidden rounded-[2px]" style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: "1px solid #18263f" }}>
          <div className="px-4 pb-2.5 pt-3.5" style={{ borderBottom: "1px solid #16233a" }}>
            <div className="font-display text-[11px] font-700 uppercase tracking-[0.2em] text-ink">Participantes</div>
            <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">{PARTICIPANTS.length} pessoas na campanha</div>
          </div>
          <div className="rup-scroll flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {PARTICIPANTS.map((p) => (
              <ParticipantRow key={p.id} p={p} selected={selected === p.id} onClick={() => setSelected(p.id)} />
            ))}
          </div>
        </div>

        {/* detail */}
        <div className="min-w-0 flex-1">
          <DetailPanel p={participant} />
        </div>
      </div>
    </div>
  );
}
