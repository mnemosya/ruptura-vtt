import { useState } from "react";
import { ACCENTS } from "./ui";
import { Brackets, Section } from "./tools";

/* ------------------------------------------------------------------ */
/*  Mock data                                                           */
/* ------------------------------------------------------------------ */

const BANDO = {
  name: "Os Fragmentos",
  tagline: "«Nós somos o que sobrou.»",
  code: "FRG-07",
  base: "Armazém 14-C · Porto Seco de Vosek",
  founded: "Ciclo 4, Ano 1112",
  reputation: 3,
  reputationMax: 5,
  credits: 1_840,
  heat: 2,
  heatMax: 5,
  members: 5,
  membersMax: 8,
  missionsComplete: 12,
  missionsActive: 2,
  tier: 2,
  description:
    "Grupo de operativos de aluguel sem afiliação oficial. Atuam nas zonas cinzentas da cidade-estado de Vosek, aceitando contratos que outras facções recusam por risco ou ambiguidade moral.",
};

type FactionStanding = {
  name: string;
  standing: number;
  label: string;
  color: string;
};

const FACTIONS: FactionStanding[] = [
  { name: "Conselho de Vosek", standing: -1, label: "Suspeita", color: ACCENTS.danger.hex },
  { name: "Guilda dos Corretores", standing: 2, label: "Aliados", color: ACCENTS.good.hex },
  { name: "Culto da Fratura", standing: 0, label: "Neutro", color: "#4f6285" },
  { name: "Contrabandistas da Doca", standing: 1, label: "Amistoso", color: ACCENTS.cyan.hex },
  { name: "Enforcers Municipais", standing: -2, label: "Hostil", color: ACCENTS.danger.hex },
];

type Mission = {
  id: string;
  title: string;
  client: string;
  status: "ativa" | "concluída" | "falha";
  reward: number;
  accent: typeof ACCENTS.cyan;
};

const MISSIONS: Mission[] = [
  { id: "m1", title: "Recuperação na Doca 7", client: "Anônimo", status: "ativa", reward: 600, accent: ACCENTS.amber },
  { id: "m2", title: "Extração de Dados · Torre Lenz", client: "Guilda dos Corretores", status: "ativa", reward: 1_200, accent: ACCENTS.cyan },
  { id: "m3", title: "Escolta até a Zona Cinza", client: "Siris Vaun", status: "concluída", reward: 400, accent: ACCENTS.good },
  { id: "m4", title: "Infiltração no Porto Norte", client: "Anônimo", status: "concluída", reward: 900, accent: ACCENTS.good },
  { id: "m5", title: "Resgate em Margens Leste", client: "Família Dorn", status: "falha", reward: 0, accent: ACCENTS.danger },
];

type Asset = { label: string; desc: string; accent: typeof ACCENTS.cyan };

const ASSETS: Asset[] = [
  { label: "Armazém 14-C", desc: "Base segura · Porto Seco", accent: ACCENTS.cyan },
  { label: "Contato: Dra. Lira", desc: "Médica de campo · triage", accent: ACCENTS.good },
  { label: "Furgão blindado mod.", desc: "Transporte · 6 pessoas", accent: ACCENTS.slate },
  { label: "Acesso à Rede Cinza", desc: "Comunicação encriptada", accent: ACCENTS.arcane },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function BarMeter({ value, max, color, bg = "#16233a" }: { value: number; max: number; color: string; bg?: string }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-[1px]" style={{ background: bg }}>
        <div className="h-full rounded-[1px]" style={{ width: `${pct * 100}%`, background: color, boxShadow: `0 0 6px ${color}88` }} />
      </div>
      <span className="font-mono text-[9px]" style={{ color }}>{value}/{max}</span>
    </div>
  );
}

function PipBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: i < value ? color : "#16233a", boxShadow: i < value ? `0 0 4px ${color}66` : undefined }} />
      ))}
    </div>
  );
}

function StatTile({ label, value, sub, color = ACCENTS.cyan.hex }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="relative overflow-hidden rounded-[2px] px-3 py-3" style={{ background: "#0c1420", border: "1px solid #16233a" }}>
      <span className="absolute left-0 top-0 h-full w-[2px]" style={{ background: color }} />
      <div className="pl-2">
        <div className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">{label}</div>
        <div className="font-mono text-[22px] font-700 leading-tight" style={{ color }}>{value}</div>
        {sub && <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{sub}</div>}
      </div>
    </div>
  );
}

function MissionRow({ m }: { m: Mission }) {
  const statusColor = m.status === "ativa" ? ACCENTS.amber.hex : m.status === "concluída" ? ACCENTS.good.hex : ACCENTS.danger.hex;
  const statusLabel = m.status.toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-[2px] px-3 py-2.5" style={{ border: "1px solid #16233a" }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[11.5px] font-600 uppercase tracking-[0.06em] text-ink">{m.title}</div>
        <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{m.client}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {m.reward > 0 && <span className="font-mono text-[9px]" style={{ color: ACCENTS.amber.hex }}>{m.reward.toLocaleString()} cr</span>}
        <span className="rounded-[2px] px-2 py-[2px] font-mono text-[8px] uppercase tracking-[0.1em]" style={{ color: statusColor, border: `1px solid ${statusColor}44` }}>{statusLabel}</span>
      </div>
    </div>
  );
}

function FactionRow({ f }: { f: FactionStanding }) {
  const steps = [-3, -2, -1, 0, 1, 2, 3];
  return (
    <div className="flex items-center gap-3 rounded-[2px] px-3 py-2.5" style={{ border: "1px solid #16233a" }}>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[11.5px] font-600 uppercase tracking-[0.06em] text-ink">{f.name}</div>
        <div className="font-mono text-[8px] uppercase tracking-[0.06em]" style={{ color: f.color }}>{f.label}</div>
      </div>
      <div className="flex gap-1 shrink-0">
        {steps.map((s) => (
          <span
            key={s}
            className="h-2 w-2 rounded-[1px]"
            style={{
              background: s === 0 ? "#2a3b58" : (f.standing > 0 && s > 0 && s <= f.standing) ? f.color : (f.standing < 0 && s < 0 && s >= f.standing) ? f.color : "#16233a",
              boxShadow: ((f.standing > 0 && s > 0 && s <= f.standing) || (f.standing < 0 && s < 0 && s >= f.standing)) ? `0 0 4px ${f.color}88` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tabs                                                                */
/* ------------------------------------------------------------------ */

type BandoTab = "visão-geral" | "missões" | "facções" | "ativos";
const TABS: { key: BandoTab; label: string }[] = [
  { key: "visão-geral", label: "Visão Geral" },
  { key: "missões", label: "Missões" },
  { key: "facções", label: "Facções" },
  { key: "ativos", label: "Ativos" },
];

/* ------------------------------------------------------------------ */
/*  Main export                                                         */
/* ------------------------------------------------------------------ */

export default function Bando() {
  const [tab, setTab] = useState<BandoTab>("visão-geral");

  return (
    <div className="flex h-full overflow-hidden gap-4">
      {/* profile card */}
      <div
        className="relative flex w-[260px] shrink-0 flex-col overflow-hidden rounded-[2px]"
        style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: `1px solid ${ACCENTS.amber.hex}44` }}
      >
        <Brackets color={ACCENTS.amber.hex} size={11} inset={6} />

        {/* spine */}
        <div className="absolute bottom-0 left-0 top-0 flex w-9 flex-col items-center justify-between py-4" style={{ borderRight: "1px solid #16233a", background: "rgba(255,255,255,0.013)" }}>
          <span className="font-mono text-[9px] font-700 tracking-widest" style={{ color: ACCENTS.amber.hex }}>07</span>
          <span className="font-display text-[8px] font-700 uppercase tracking-[0.3em]" style={{ color: ACCENTS.amber.hex, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: 0.85 }}>BANDO</span>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENTS.amber.hex, boxShadow: `0 0 6px ${ACCENTS.amber.hex}` }} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col pl-9 overflow-hidden">
          {/* emblem area */}
          <div className="flex flex-col items-center py-6 px-4" style={{ borderBottom: "1px solid #16233a" }}>
            {/* hexagonal emblem */}
            <div
              className="flex h-16 w-16 items-center justify-center font-display text-[22px] font-700"
              style={{
                color: ACCENTS.amber.hex,
                background: ACCENTS.amber.soft,
                border: `1px solid ${ACCENTS.amber.hex}66`,
                clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)",
              }}
            >
              FRG
            </div>
            <div className="mt-3 text-center">
              <div className="font-display text-[15px] font-700 uppercase tracking-[0.16em] text-ink">{BANDO.name}</div>
              <div className="mt-1 font-mono text-[8.5px] italic tracking-[0.06em] text-ink-faint">{BANDO.tagline}</div>
            </div>
          </div>

          <div className="rup-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="space-y-1.5">
              {[
                { label: "Código", value: BANDO.code },
                { label: "Base", value: BANDO.base },
                { label: "Fundado", value: BANDO.founded },
                { label: "Tier", value: `Tier ${BANDO.tier}` },
              ].map((r) => (
                <div key={r.label} className="flex items-start justify-between gap-2 py-1" style={{ borderBottom: "1px solid #0e1c30" }}>
                  <span className="font-display text-[8.5px] font-600 uppercase tracking-[0.12em] text-ink-faint">{r.label}</span>
                  <span className="text-right font-mono text-[9px] text-ink-dim">{r.value}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">Reputação</span>
              <PipBar value={BANDO.reputation} max={BANDO.reputationMax} color={ACCENTS.amber.hex} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">Calor</span>
                <span className="font-mono text-[8px]" style={{ color: BANDO.heat >= 4 ? ACCENTS.danger.hex : "#4f6285" }}>{BANDO.heat >= 4 ? "⚠ Alto" : "Contido"}</span>
              </div>
              <BarMeter value={BANDO.heat} max={BANDO.heatMax} color={BANDO.heat >= 4 ? ACCENTS.danger.hex : ACCENTS.amber.hex} />
            </div>

            <div className="pt-1">
              <p className="text-[10px] leading-relaxed text-ink-dim">{BANDO.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* content panel */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[2px]" style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: "1px solid #18263f" }}>
        <Brackets color={ACCENTS.amber.hex} size={11} inset={6} />

        {/* tab bar */}
        <div className="flex items-end gap-0.5 px-4 pt-3" style={{ borderBottom: "1px solid #16233a" }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 pb-2.5 pt-2 font-display text-[10px] font-600 uppercase tracking-[0.14em] transition-colors"
                style={{
                  color: active ? ACCENTS.amber.hex : "#4f6285",
                  borderBottom: `2px solid ${active ? ACCENTS.amber.hex : "transparent"}`,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="rup-scroll flex-1 overflow-y-auto px-5 py-5">
          {tab === "visão-geral" && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-3">
                <StatTile label="Créditos" value={`${(BANDO.credits).toLocaleString()}`} sub="cr disponíveis" color={ACCENTS.amber.hex} />
                <StatTile label="Membros" value={`${BANDO.members}/${BANDO.membersMax}`} sub="slots preenchidos" color={ACCENTS.cyan.hex} />
                <StatTile label="Missões" value={BANDO.missionsComplete} sub="concluídas" color={ACCENTS.good.hex} />
                <StatTile label="Ativas" value={BANDO.missionsActive} sub="em andamento" color={ACCENTS.amber.hex} />
              </div>

              <Section n="01" title="Missões em Andamento">
                <div className="space-y-1.5">
                  {MISSIONS.filter((m) => m.status === "ativa").map((m) => <MissionRow key={m.id} m={m} />)}
                </div>
              </Section>

              <Section n="02" title="Relações · resumo">
                <div className="space-y-1.5">
                  {FACTIONS.slice(0, 3).map((f) => <FactionRow key={f.name} f={f} />)}
                </div>
              </Section>
            </div>
          )}

          {tab === "missões" && (
            <div className="space-y-5">
              <Section n="01" title={`Ativas · ${MISSIONS.filter(m => m.status === "ativa").length}`}>
                <div className="space-y-1.5">
                  {MISSIONS.filter((m) => m.status === "ativa").map((m) => <MissionRow key={m.id} m={m} />)}
                </div>
              </Section>
              <Section n="02" title={`Histórico · ${MISSIONS.filter(m => m.status !== "ativa").length}`}>
                <div className="space-y-1.5">
                  {MISSIONS.filter((m) => m.status !== "ativa").map((m) => <MissionRow key={m.id} m={m} />)}
                </div>
              </Section>
            </div>
          )}

          {tab === "facções" && (
            <div className="space-y-5">
              <Section n="01" title={`${FACTIONS.length} facções rastreadas`}>
                <div className="space-y-1.5">
                  {FACTIONS.map((f) => <FactionRow key={f.name} f={f} />)}
                </div>
              </Section>
              <div className="rounded-[2px] px-4 py-3 text-[10px] text-ink-dim" style={{ border: "1px solid #16233a", borderLeftWidth: 2, borderLeftColor: ACCENTS.cyan.hex }}>
                A relação com o <strong className="text-ink-dim">Conselho de Vosek</strong> caiu após o incidente na Doca 7. Considere missões discretas para recuperar reputação antes da sessão 14.
              </div>
            </div>
          )}

          {tab === "ativos" && (
            <div className="space-y-5">
              <Section n="01" title={`${ASSETS.length} ativos do bando`}>
                <div className="grid grid-cols-2 gap-2">
                  {ASSETS.map((a) => (
                    <div key={a.label} className="flex items-start gap-2.5 rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.accent.hex }} />
                      <div>
                        <div className="font-display text-[11px] font-600 uppercase tracking-[0.08em] text-ink">{a.label}</div>
                        <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{a.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section n="02" title="Finanças">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                    <div className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">Caixa</div>
                    <div className="font-mono text-[20px] font-700" style={{ color: ACCENTS.amber.hex }}>1.840 cr</div>
                    <BarMeter value={1840} max={5000} color={ACCENTS.amber.hex} />
                  </div>
                  <div className="rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                    <div className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">A Receber</div>
                    <div className="font-mono text-[20px] font-700" style={{ color: ACCENTS.good.hex }}>1.800 cr</div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">2 missões ativas</div>
                  </div>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
