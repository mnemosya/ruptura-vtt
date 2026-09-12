import { useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ACCENTS, type Accent } from "./ui";
import { Brackets, Section } from "./tools";
import { SpellCardB, WeaponCardB, ConditionCardB, EffectCardB, ItemCardB, TalentCardB } from "./cardsB";
import { DiceTray } from "./dice";
import {
  Note, Swords, Shield, Book, UserPlus,
  Check, X, Plus, Minus, Chevron,
} from "../lib/icons";
import type { ComponentType, SVGProps } from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/* ================================================================== */
/*  Data                                                               */
/* ================================================================== */

type Status = "online" | "ausente" | "offline";
type InventoryItemId = "estimulante" | "rifle" | "kit" | "armadura" | "explosivo";

interface InventoryItem {
  id: InventoryItemId;
  name: string;
  type: string;
  qty: number;
  accent: Accent;
  stackable: boolean;
}

interface BandoCharacter {
  id: string;
  initials: string;
  name: string;
  accent: Accent;
}

const BANDO_CHARS: BandoCharacter[] = [
  { id: "mv", initials: "MV", name: "Mara Venn", accent: ACCENTS.cyan },
  { id: "kd", initials: "KD", name: "Kael Dorn", accent: ACCENTS.magenta },
  { id: "lx", initials: "LX", name: "Loïca «Lox» Voss", accent: ACCENTS.good },
];

const INITIAL_INVENTORY: InventoryItem[] = [
  { id: "estimulante", name: "Estimulante Rápido", type: "Consumível · Médico", qty: 3, accent: ACCENTS.good, stackable: true },
  { id: "rifle", name: "Rifle de Campo Mod.", type: "Arma · Alcance", qty: 1, accent: ACCENTS.danger, stackable: false },
  { id: "kit", name: "Kit de Arrombamento", type: "Ferramenta · Furtivo", qty: 2, accent: ACCENTS.amber, stackable: true },
  { id: "armadura", name: "Armadura Leve", type: "Equipamento · Proteção", qty: 1, accent: ACCENTS.cyan, stackable: false },
  { id: "explosivo", name: "Explosivo de Impacto", type: "Consumível · Área", qty: 2, accent: ACCENTS.danger, stackable: true },
];

const PARTICIPANTS = [
  { id: "gm", initials: "VT", playerName: "Voss Tamblyn", characterName: "Narrador", role: "GM" as const, status: "online" as Status, ping: 24, accent: ACCENTS.amber },
  { id: "p1", initials: "IS", playerName: "Irana Solis", characterName: "Mara Venn", role: "PJ" as const, status: "online" as Status, ping: 41, accent: ACCENTS.cyan },
  { id: "p2", initials: "TM", playerName: "Theo Marceau", characterName: "Kael Dorn", role: "PJ" as const, status: "online" as Status, ping: 78, accent: ACCENTS.magenta },
  { id: "p3", initials: "FA", playerName: "Fen Ashby", characterName: "Dex Carrow", role: "PJ" as const, status: "ausente" as Status, ping: undefined, accent: ACCENTS.slate, lastSeen: "há 8 min", notes: "retorna em 5 min" },
  { id: "p4", initials: "LB", playerName: "Loïc Beaumont", characterName: "Sienna Valk", role: "PJ" as const, status: "offline" as Status, ping: undefined, accent: ACCENTS.slate, lastSeen: "há 2 h" },
];

const CHARACTERS = [
  { id: "mv", initials: "MV", name: "Mara Venn", role: "Agente · Cinética", side: "PJ" as const, accent: ACCENTS.cyan, hpCur: 14, hpMax: 18, pd: 3, pdMax: 4, stats: [["Reflexos","3"],["Força","2"],["Percepção","2"],["Vontade","1"],["Influência","1"]], conditions: [] as {label:string;accent:Accent}[] },
  { id: "kd", initials: "KD", name: "Kael Dorn", role: "Infiltrador · Sináptico", side: "PJ" as const, accent: ACCENTS.magenta, hpCur: 9, hpMax: 16, pd: 2, pdMax: 3, stats: [["Reflexos","2"],["Força","1"],["Percepção","3"],["Vontade","2"],["Influência","2"]], conditions: [{ label: "Atordoado", accent: ACCENTS.amber }] },
  { id: "lx", initials: "LX", name: "Loïca «Lox» Voss", role: "Especialista · Material", side: "PJ" as const, accent: ACCENTS.good, hpCur: 16, hpMax: 16, pd: 4, pdMax: 4, stats: [["Reflexos","1"],["Força","3"],["Percepção","1"],["Vontade","3"],["Influência","2"]], conditions: [{ label: "Armadura Ativa", accent: ACCENTS.good }] },
  { id: "s2", initials: "#2", name: "Sentinela da Doca", role: "Combatente", side: "PN" as const, accent: ACCENTS.danger, hpCur: 12, hpMax: 12, pd: 2, pdMax: 2, stats: [["Reflexos","1"],["Força","2"],["Percepção","1"],["Vontade","1"],["Influência","0"]], conditions: [] },
  { id: "s3", initials: "#3", name: "Contrabandista", role: "Espião", side: "PN" as const, accent: ACCENTS.danger, hpCur: 5, hpMax: 10, pd: 1, pdMax: 2, stats: [["Reflexos","2"],["Força","1"],["Percepção","2"],["Vontade","0"],["Influência","2"]], conditions: [{ label: "Ferido", accent: ACCENTS.danger }] },
];

const COMPENDIO_CATS = [
  { key: "magias", label: "Magias", accent: ACCENTS.arcane },
  { key: "condicoes", label: "Condições", accent: ACCENTS.amber },
  { key: "criaturas", label: "Criaturas", accent: ACCENTS.danger },
  { key: "itens", label: "Itens", accent: ACCENTS.cyan },
  { key: "regras", label: "Regras", accent: ACCENTS.slate },
];

const COMPENDIO_ENTRIES = [
  { id: "rajada", cat: "magias", name: "Rajada Cinética", sub: "Ataque · Cinética · Nível 2", tags: [{ label: "Cinética", accent: ACCENTS.cyan }, { label: "Dano 1d8", accent: ACCENTS.danger }], body: "Você lança uma onda de força comprimida contra um alvo. Em resultado crítico, o alvo é empurrado 2 m e fica Atordoado por 1 rodada.", stats: [["Alcance","8 m"],["Dano","1d8 + Ref."],["Custo PD","1"],["Ação","Padrão"]], mechanic: "Crítico: alvo é empurrado 2 m e fica Atordoado por 1 rodada." },
  { id: "pulso", cat: "magias", name: "Pulso Sináptico", sub: "Controle · Sináptica · Nível 1", tags: [{ label: "Sináptica", accent: ACCENTS.magenta }, { label: "Controle", accent: ACCENTS.arcane }], body: "Sinal elétrico ao sistema nervoso causa interrupção motora temporária. Teste de Vontade dif. 13.", stats: [["Alcance","6 m"],["Duração","1 rodada"],["Custo PD","1"],["Ação","Padrão"]], mechanic: "Falha no teste: Atordoado. Sucesso limitado: perde próxima ação bônus." },
  { id: "barricada", cat: "magias", name: "Barricada Material", sub: "Proteção · Material · Nível 3", tags: [{ label: "Material", accent: ACCENTS.slate }, { label: "Área", accent: ACCENTS.good }], body: "Solidifica partículas ao redor de aliados próximos criando camada protetora temporária.", stats: [["Raio","3 m"],["Red. Dano","3"],["Custo PD","2"],["Duração","Fim do turno"]], mechanic: "Aliados no raio recebem redução de dano 3 até o início do próximo turno." },
  { id: "atordoado", cat: "condicoes", name: "Atordoado", sub: "Condição Negativa · Temporária", tags: [{ label: "Negativa", accent: ACCENTS.danger }, { label: "Temporária", accent: ACCENTS.amber }], body: "Desorientado. Penalidade de Reflexos −2, sem ações bônus.", stats: [["Ref.","−2"],["Ações bônus","Bloqueada"]], mechanic: "Gaste 1 PD no início do turno para remover imediatamente." },
  { id: "ferido", cat: "condicoes", name: "Ferido", sub: "Condição Negativa · Persistente", tags: [{ label: "Negativa", accent: ACCENTS.danger }, { label: "Persistente", accent: ACCENTS.slate }], body: "Dano grave reduz desempenho. Penalidade de Força e Reflexos −1.", stats: [["Força","−1"],["Reflexos","−1"]], mechanic: "Requer 8h de descanso ou tratamento médico dif. 12." },
  { id: "sentinela", cat: "criaturas", name: "Sentinela da Doca", sub: "Combatente · Ameaça 1", tags: [{ label: "Humanoide", accent: ACCENTS.slate }, { label: "Armado", accent: ACCENTS.danger }], body: "Guarda contratado. Reage com agressividade quando surpreendido.", stats: [["PV","12"],["Reflexos","1"],["Força","2"],["Percepção","1"]], mechanic: "Alertar (bônus): em 1d4 rodadas, 1d3 sentinelas chegam." },
  { id: "estimulante", cat: "itens", name: "Estimulante Rápido", sub: "Consumível · Médico · Uso único", tags: [{ label: "Consumível", accent: ACCENTS.cyan }, { label: "Médico", accent: ACCENTS.good }], body: "Seringa autoaplicável. Coagulação acelerada e supressão de dor temporária.", stats: [["Cura","1d6+2 PV"],["Duração","3 rodadas"],["Ação","Bônus"],["Custo","80 cr"]], mechanic: "Após expirar: Fatigado por 2 rodadas. Máximo 1 por combate." },
  { id: "rifle", cat: "itens", name: "Rifle de Campo Mod.", sub: "Arma · Alcance Longo", tags: [{ label: "Arma", accent: ACCENTS.danger }, { label: "Alcance", accent: ACCENTS.slate }], body: "Rifle modificado com mira holográfica e supressor parcial. Exige duas mãos.", stats: [["Alcance","30 m"],["Dano","1d10"],["Ação","Padrão"],["Custo","450 cr"]], mechanic: "Se o portador não se moveu no turno: +1d4 de dano adicional." },
];

/* ================================================================== */
/*  Primitives                                                          */
/* ================================================================== */

function HpBar({ cur, max, accent }: { cur: number; max: number; accent: Accent }) {
  const pct = Math.max(0, Math.min(1, cur / max));
  const color = pct < 0.35 ? ACCENTS.danger.hex : accent.hex;
  return (
    <div className="relative h-1 overflow-hidden rounded-[1px]" style={{ background: "#16233a" }}>
      <div className="h-full" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  );
}

function StatusDot({ status }: { status: Status }) {
  const color = status === "online" ? ACCENTS.good.hex : status === "ausente" ? ACCENTS.amber.hex : "#2a3b58";
  return (
    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {status === "online" && <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: color }} />}
    </span>
  );
}

function SectionDivider({ n, title, right }: { n: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="font-mono text-[8px] font-700 tracking-widest text-cyan/60">{n}</span>
      <span className="font-display text-[8px] font-600 uppercase tracking-[0.2em] text-ink-faint">{title}</span>
      <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
      {right}
    </div>
  );
}

/* ================================================================== */
/*  Modal system                                                        */
/* ================================================================== */

type ModalPayload =
  | { type: "character"; id: string }
  | { type: "player"; id: string }
  | { type: "entry"; id: string }
  | { type: "transfer"; itemId: string | "credits" }
  | null;

function ModalShell({ title, sub, accent, onClose, children }: { title: string; sub?: string; accent: Accent; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(4,8,16,0.82)" }}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-[580px] max-h-[85vh] flex-col overflow-hidden rounded-[2px]"
        style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: `1px solid ${accent.hex}55`, boxShadow: `0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px ${accent.hex}22` }}
        onClick={(e) => e.stopPropagation()}
      >
        <Brackets color={accent.hex} size={12} inset={7} />
        {/* spine */}
        <div className="absolute bottom-0 left-0 top-0 flex w-8 flex-col items-center justify-between py-3" style={{ borderRight: "1px solid #16233a", background: "rgba(255,255,255,0.012)" }}>
          <span className="font-mono text-[8px] font-700 tracking-widest" style={{ color: accent.hex }}>§</span>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent.hex, boxShadow: `0 0 6px ${accent.hex}` }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col pl-8 overflow-hidden">
          <div className="flex items-center gap-3 px-4 pb-3 pt-3.5" style={{ borderBottom: "1px solid #16233a" }}>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-[16px] font-700 uppercase tracking-[0.1em] leading-none text-ink truncate">{title}</h2>
              {sub && <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">{sub}</div>}
            </div>
            <button onClick={onClose} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:text-ink" style={{ border: "1px solid #1c2b45" }}>
              <X width={12} height={12} />
            </button>
          </div>
          <div className="rup-scroll flex-1 overflow-y-auto px-4 py-4">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ——— Character modal ——— */
function CharacterModal({ id, onClose }: { id: string; onClose: () => void }) {
  const char = CHARACTERS.find((c) => c.id === id);
  if (!char) return null;
  return (
    <ModalShell title={char.name} sub={char.role} accent={char.accent} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[8px] font-600 uppercase tracking-[0.14em] text-ink-faint">Pontos de Vida</span>
              <span className="font-mono text-[10px]" style={{ color: char.hpCur / char.hpMax < 0.35 ? ACCENTS.danger.hex : char.accent.hex }}>{char.hpCur}/{char.hpMax}</span>
            </div>
            <div className="mt-2"><HpBar cur={char.hpCur} max={char.hpMax} accent={char.accent} /></div>
          </div>
          <div className="rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[8px] font-600 uppercase tracking-[0.14em] text-ink-faint">Pontos de Dado</span>
              <span className="font-mono text-[10px]" style={{ color: char.accent.hex }}>{char.pd}/{char.pdMax}</span>
            </div>
            <div className="mt-2 flex gap-1">{Array.from({ length: char.pdMax }).map((_, i) => <span key={i} className="h-2 flex-1 rounded-[1px]" style={{ background: i < char.pd ? char.accent.hex : "#16233a" }} />)}</div>
          </div>
        </div>
        <section>
          <SectionDivider n="01" title="Atributos" />
          <div className="grid grid-cols-5 gap-1.5">
            {char.stats.map(([label, value]) => (
              <div key={label} className="flex flex-col items-center gap-1 rounded-[2px] py-2.5" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                <span className="font-mono text-[17px] font-700 leading-none text-ink">{value}</span>
                <span className="font-mono text-[7px] uppercase tracking-[0.08em] text-ink-faint">{label}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <SectionDivider n="02" title="Condições" />
          {char.conditions.length === 0 ? (
            <div className="flex items-center gap-2 rounded-[2px] px-3 py-2" style={{ border: "1px solid #16233a" }}>
              <Check width={12} height={12} style={{ color: ACCENTS.good.hex }} />
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">Sem condições ativas</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {char.conditions.map((c) => (
                <span key={c.label} className="rounded-[2px] px-2 py-1 font-display text-[9px] font-600 uppercase tracking-[0.1em]" style={{ color: c.accent.hex, border: `1px solid ${c.accent.hex}44`, background: c.accent.soft }}>{c.label}</span>
              ))}
            </div>
          )}
        </section>
      </div>
    </ModalShell>
  );
}

/* ——— Player modal ——— */
function PlayerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const p = PARTICIPANTS.find((x) => x.id === id);
  if (!p) return null;
  const statusColor = p.status === "online" ? ACCENTS.good.hex : p.status === "ausente" ? ACCENTS.amber.hex : "#2a3b58";
  const statusLabel = p.status === "online" ? "Online" : p.status === "ausente" ? "Ausente" : "Offline";
  return (
    <ModalShell title={p.playerName} sub={`${p.characterName} · ${p.role}`} accent={p.accent} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Status", value: statusLabel, color: statusColor },
            { label: "Latência", value: p.ping ? `${p.ping} ms` : "—", color: p.ping && p.ping < 80 ? ACCENTS.good.hex : ACCENTS.amber.hex },
            { label: "Última atividade", value: (p as any).lastSeen ?? "agora", color: "#6f83a3" },
          ].map((s) => (
            <div key={s.label} className="rounded-[2px] px-3 py-3 text-center" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
              <div className="font-mono text-[14px] font-700" style={{ color: s.color }}>{s.value}</div>
              <div className="mt-0.5 font-display text-[7.5px] font-600 uppercase tracking-[0.12em] text-ink-faint">{s.label}</div>
            </div>
          ))}
        </div>
        <section>
          <SectionDivider n="01" title="Personagem" />
          <div className="flex items-center gap-3 rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-[2px] font-display text-[13px] font-700" style={{ color: p.accent.hex, border: `1px solid ${p.accent.hex}55`, background: p.accent.soft }}>{p.characterName.slice(0, 2).toUpperCase()}</span>
            <div>
              <div className="font-display text-[13px] font-700 uppercase tracking-[0.08em] text-ink">{p.characterName}</div>
              <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{p.role} · Mesa Teste v0.58</div>
            </div>
          </div>
        </section>
        {(p as any).notes && (
          <section>
            <SectionDivider n="02" title="Notas" />
            <div className="rounded-[2px] px-3 py-2.5" style={{ border: "1px solid #16233a", background: "#0c1420", borderLeftWidth: 2, borderLeftColor: p.accent.hex }}>
              <span className="text-[11px] text-ink-dim">{(p as any).notes}</span>
            </div>
          </section>
        )}
      </div>
    </ModalShell>
  );
}

/* ——— Entry modal ——— */
function EntryModal({ id, onClose }: { id: string; onClose: () => void }) {
  const entry = COMPENDIO_ENTRIES.find((e) => e.id === id);
  const cat = COMPENDIO_CATS.find((c) => c.key === entry?.cat);
  if (!entry || !cat) return null;
  return (
    <ModalShell title={entry.name} sub={entry.sub} accent={cat.accent} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((t) => (
            <span key={t.label} className="rounded-[2px] px-1.5 py-[2px] font-display text-[8.5px] font-600 uppercase tracking-[0.1em]" style={{ color: t.accent.hex, border: `1px solid ${t.accent.hex}44`, background: t.accent.soft }}>{t.label}</span>
          ))}
        </div>
        <section>
          <SectionDivider n="01" title="Descrição" />
          <p className="text-[12px] leading-relaxed text-ink-dim">{entry.body}</p>
        </section>
        <section>
          <SectionDivider n="02" title="Estatísticas" />
          <div className="grid grid-cols-2 gap-1.5">
            {entry.stats.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-[2px] px-3 py-2" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                <span className="font-display text-[9px] font-600 uppercase tracking-[0.1em] text-ink-faint">{label}</span>
                <span className="font-mono text-[11px] font-700" style={{ color: cat.accent.hex }}>{value}</span>
              </div>
            ))}
          </div>
        </section>
        {entry.mechanic && (
          <section>
            <SectionDivider n="03" title="Mecânica" />
            <div className="rounded-[2px] px-3 py-3" style={{ border: `1px solid ${cat.accent.hex}33`, background: cat.accent.soft, borderLeftWidth: 2, borderLeftColor: cat.accent.hex }}>
              <p className="text-[11.5px] leading-relaxed text-ink-dim">{entry.mechanic}</p>
            </div>
          </section>
        )}
      </div>
    </ModalShell>
  );
}

/* ——— Transfer modal ——— */
function TransferModal({
  itemId,
  inventory,
  credits,
  onClose,
  onConfirm,
}: {
  itemId: string | "credits";
  inventory: InventoryItem[];
  credits: number;
  onClose: () => void;
  onConfirm: (itemId: string | "credits", qty: number, targetId: string) => void;
}) {
  const item = itemId !== "credits" ? inventory.find((i) => i.id === itemId) : null;
  const maxQty = itemId === "credits" ? credits : item?.qty ?? 1;
  const [qty, setQty] = useState(1);
  const [creditAmount, setCreditAmount] = useState(100);
  const [targetId, setTargetId] = useState(BANDO_CHARS[0].id);
  const [done, setDone] = useState(false);

  const target = BANDO_CHARS.find((c) => c.id === targetId)!;
  const isCredits = itemId === "credits";

  function handleConfirm() {
    onConfirm(itemId, isCredits ? creditAmount : qty, targetId);
    setDone(true);
  }

  return (
    <ModalShell title={isCredits ? "Transferir Créditos" : `Transferir · ${item?.name}`} sub={isCredits ? "Do caixa do bando" : item?.type} accent={ACCENTS.amber} onClose={onClose}>
      {done ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-[2px]" style={{ background: ACCENTS.good.soft, border: `1px solid ${ACCENTS.good.hex}66` }}>
            <Check width={24} height={24} style={{ color: ACCENTS.good.hex }} />
          </span>
          <div className="text-center">
            <div className="font-display text-[14px] font-700 uppercase tracking-[0.1em] text-ink">Transferência concluída</div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">
              {isCredits ? `${creditAmount} cr` : `${qty}× ${item?.name}`} → {target.name}
            </div>
          </div>
          <button onClick={onClose} className="mt-2 rounded-[2px] px-6 py-2 font-display text-[10px] font-700 uppercase tracking-[0.18em] transition-colors" style={{ color: ACCENTS.amber.hex, border: `1px solid ${ACCENTS.amber.hex}88`, background: ACCENTS.amber.soft }}>
            Fechar
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* item preview */}
          <div className="flex items-center gap-3 rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-[2px] font-display text-[13px] font-700" style={{ color: ACCENTS.amber.hex, border: `1px solid ${ACCENTS.amber.hex}55`, background: ACCENTS.amber.soft }}>
              {isCredits ? "₡" : item?.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex-1">
              <div className="font-display text-[12px] font-700 uppercase tracking-[0.08em] text-ink">{isCredits ? "Créditos do Bando" : item?.name}</div>
              <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">
                {isCredits ? `${credits.toLocaleString()} cr disponíveis` : `${item?.qty} unidades disponíveis`}
              </div>
            </div>
          </div>

          {/* amount */}
          <section>
            <SectionDivider n="01" title={isCredits ? "Valor (cr)" : "Quantidade"} />
            {isCredits ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setCreditAmount((v) => Math.max(10, v - 100))} className="flex h-9 w-9 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:text-ink" style={{ border: "1px solid #16233a" }}><Minus width={14} height={14} /></button>
                  <div className="flex flex-1 items-center justify-center rounded-[2px] py-2" style={{ border: `1px solid ${ACCENTS.amber.hex}66`, background: "#0c1420" }}>
                    <span className="font-mono text-[20px] font-700" style={{ color: ACCENTS.amber.hex }}>{creditAmount.toLocaleString()}</span>
                    <span className="ml-1 font-mono text-[10px] text-ink-faint">cr</span>
                  </div>
                  <button onClick={() => setCreditAmount((v) => Math.min(credits, v + 100))} className="flex h-9 w-9 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:text-ink" style={{ border: "1px solid #16233a" }}><Plus width={14} height={14} /></button>
                </div>
                <div className="flex gap-1.5">
                  {[50, 100, 250, 500].map((v) => (
                    <button key={v} onClick={() => setCreditAmount(Math.min(credits, v))} className="flex-1 rounded-[2px] py-1.5 font-mono text-[9px] transition-colors" style={{ border: `1px solid ${creditAmount === v ? ACCENTS.amber.hex : "#16233a"}`, background: creditAmount === v ? ACCENTS.amber.soft : "transparent", color: creditAmount === v ? ACCENTS.amber.hex : "#4f6285" }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setQty((v) => Math.max(1, v - 1))} className="flex h-9 w-9 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:text-ink" style={{ border: "1px solid #16233a" }}><Minus width={14} height={14} /></button>
                <div className="flex flex-1 items-center justify-center rounded-[2px] py-2" style={{ border: `1px solid ${ACCENTS.amber.hex}66`, background: "#0c1420" }}>
                  <span className="font-mono text-[24px] font-700" style={{ color: ACCENTS.amber.hex }}>{qty}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-ink-faint">/ {maxQty}</span>
                </div>
                <button onClick={() => setQty((v) => Math.min(maxQty, v + 1))} className="flex h-9 w-9 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:text-ink" style={{ border: "1px solid #16233a" }}><Plus width={14} height={14} /></button>
              </div>
            )}
          </section>

          {/* target */}
          <section>
            <SectionDivider n="02" title="Destinatário" />
            <div className="grid grid-cols-3 gap-1.5">
              {BANDO_CHARS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTargetId(c.id)}
                  className="flex flex-col items-center gap-2 rounded-[2px] px-2 py-3 transition-colors"
                  style={{ border: `1px solid ${targetId === c.id ? c.accent.hex + "77" : "#16233a"}`, background: targetId === c.id ? c.accent.soft : "transparent" }}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-[2px] font-display text-[11px] font-700" style={{ color: c.accent.hex, border: `1px solid ${c.accent.hex}55`, background: c.accent.soft }}>{c.initials}</span>
                  <span className="font-display text-[8.5px] font-600 uppercase tracking-[0.06em]" style={{ color: targetId === c.id ? c.accent.hex : "#8496b4" }}>{c.name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </section>

          {/* confirm */}
          <button
            onClick={handleConfirm}
            className="flex w-full items-center justify-center gap-2 rounded-[2px] px-5 py-2.5 font-display text-[11px] font-700 uppercase tracking-[0.22em] transition-colors"
            style={{ color: ACCENTS.amber.hex, background: ACCENTS.amber.soft, border: `1px solid ${ACCENTS.amber.hex}88` }}
          >
            <span style={{ opacity: 0.7 }}>▹</span>
            Confirmar Transferência
          </button>
        </div>
      )}
    </ModalShell>
  );
}

/* ================================================================== */
/*  Tab panels                                                          */
/* ================================================================== */

/* ——— Chat panel ——— */
function ChatPanel() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="rup-scroll flex-1 space-y-2 overflow-y-auto p-3">
        <SpellCardB cast />
        <WeaponCardB rolled result="critico" />
        <ConditionCardB />
        <EffectCardB />
        <ItemCardB used />
        <TalentCardB />
      </div>
      <div className="px-3 pt-2">
        <DiceTray />
      </div>
      <div className="flex items-center gap-2 p-3" style={{ borderTop: "1px solid #182338" }}>
        <div className="flex flex-1 items-center gap-2 rounded-[2px] px-3 py-2" style={{ background: "#0c1420", border: "1px solid #182338" }}>
          <span className="font-mono text-[10px] text-cyan">›</span>
          <span className="font-mono text-[10px] text-ink-faint">Enviar mensagem ou /rolar…</span>
        </div>
        <button className="flex h-8 w-8 items-center justify-center rounded-[2px] text-cyan" style={{ border: "1px solid #1c4a52", background: "rgba(69,184,201,0.07)" }}>➤</button>
      </div>
    </div>
  );
}

/* ——— Personagens panel ——— */
function PersonagensPanel({ onSelect }: { onSelect: (id: string) => void }) {
  const pjs = CHARACTERS.filter((c) => c.side === "PJ");
  const pns = CHARACTERS.filter((c) => c.side === "PN");
  return (
    <div className="rup-scroll h-full space-y-4 overflow-y-auto p-3">
      {[{ label: "PJ", chars: pjs, code: "PJ" }, { label: "PN", chars: pns, code: "PN" }].map(({ label, chars, code }) => (
        <div key={label}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-mono text-[8px] font-700 tracking-widest" style={{ color: code === "PJ" ? ACCENTS.cyan.hex + "aa" : ACCENTS.danger.hex + "aa" }}>{code}</span>
            <span className="font-display text-[8px] font-600 uppercase tracking-[0.18em] text-ink-faint">{code === "PJ" ? "Jogadores" : "Narrador"}</span>
            <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
          </div>
          <div className="space-y-1">
            {chars.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="group flex w-full items-center gap-2.5 rounded-[2px] px-2.5 py-2 text-left transition-colors hover:border-opacity-60"
                style={{ border: "1px solid #16233a" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.accent.hex + "55"; e.currentTarget.style.background = c.accent.soft; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#16233a"; e.currentTarget.style.background = "transparent"; }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] font-display text-[10px] font-700" style={{ color: c.accent.hex, border: `1px solid ${c.accent.hex}44`, background: c.accent.soft }}>{c.initials}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate font-display text-[11px] font-700 uppercase tracking-[0.06em] text-ink">{c.name}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.06em] text-ink-faint">{c.role}</div>
                  <div className="mt-1"><HpBar cur={c.hpCur} max={c.hpMax} accent={c.accent} /></div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[9px]" style={{ color: c.hpCur / c.hpMax < 0.35 ? ACCENTS.danger.hex : "#4f6285" }}>{c.hpCur}/{c.hpMax}</div>
                  {c.conditions.length > 0 && <div className="mt-0.5 font-mono text-[7px] uppercase" style={{ color: ACCENTS.amber.hex }}>{c.conditions.length} cond.</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ——— Participantes panel ——— */
function ParticipantesPanel({ onSelect }: { onSelect: (id: string) => void }) {
  const counts = { online: PARTICIPANTS.filter(p => p.status === "online").length, ausente: PARTICIPANTS.filter(p => p.status === "ausente").length, offline: PARTICIPANTS.filter(p => p.status === "offline").length };
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-4 px-3 py-2.5" style={{ borderBottom: "1px solid #16233a" }}>
        {[{ label: "Online", count: counts.online, color: ACCENTS.good.hex }, { label: "Ausente", count: counts.ausente, color: ACCENTS.amber.hex }, { label: "Offline", count: counts.offline, color: "#2a3b58" }].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            <span className="font-mono text-[8.5px] uppercase tracking-[0.08em]" style={{ color: s.color }}>{s.count} {s.label}</span>
          </div>
        ))}
      </div>
      <div className="rup-scroll flex-1 space-y-1 overflow-y-auto p-3">
        {PARTICIPANTS.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="flex w-full items-center gap-2.5 rounded-[2px] px-2.5 py-2.5 text-left transition-colors"
            style={{ border: "1px solid #16233a" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent.hex + "55"; e.currentTarget.style.background = p.accent.soft; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#16233a"; e.currentTarget.style.background = "transparent"; }}
          >
            <div className="relative">
              <span className="flex h-8 w-8 items-center justify-center rounded-[2px] font-display text-[10px] font-700" style={{ color: p.status === "online" ? p.accent.hex : "#4f6285", border: `1px solid ${p.status === "online" ? p.accent.hex + "44" : "#1c2b45"}`, background: p.status === "online" ? p.accent.soft : "transparent" }}>{p.initials}</span>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b1424]" style={{ background: p.status === "online" ? ACCENTS.good.hex : p.status === "ausente" ? ACCENTS.amber.hex : "#2a3b58" }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`truncate font-display text-[11px] font-700 uppercase tracking-[0.06em] ${p.status === "offline" ? "text-ink-faint" : "text-ink"}`}>{p.playerName}</span>
                {p.role === "GM" && <span className="rounded-[2px] px-1 py-[1px] font-display text-[7px] font-700 uppercase tracking-[0.1em]" style={{ color: ACCENTS.amber.hex, border: `1px solid ${ACCENTS.amber.hex}44` }}>GM</span>}
              </div>
              <div className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.06em] text-ink-faint">{p.characterName} · {p.ping ? `${p.ping}ms` : (p as any).lastSeen ?? "—"}</div>
            </div>
            <StatusDot status={p.status} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ——— Bando panel ——— */
type BandoTab = "missoes" | "faccoes" | "inventario";

function BandoPanel({ onTransfer }: { onTransfer: (itemId: string | "credits") => void }) {
  const [tab, setTab] = useState<BandoTab>("inventario");
  const [inventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [credits] = useState(1_840);

  const TABS_DEF: { key: BandoTab; label: string }[] = [
    { key: "inventario", label: "Inventário" },
    { key: "missoes", label: "Missões" },
    { key: "faccoes", label: "Facções" },
  ];

  const MISSIONS = [
    { title: "Recuperação na Doca 7", client: "Anônimo", status: "ativa" as const, reward: 600 },
    { title: "Extração · Torre Lenz", client: "Guilda dos Corretores", status: "ativa" as const, reward: 1200 },
    { title: "Escolta até Zona Cinza", client: "Siris Vaun", status: "concluída" as const, reward: 400 },
    { title: "Infiltração Porto Norte", client: "Anônimo", status: "concluída" as const, reward: 900 },
  ];

  const FACTIONS = [
    { name: "Guilda dos Corretores", label: "Aliados", color: ACCENTS.good.hex, val: 2 },
    { name: "Contrabandistas", label: "Amistoso", color: ACCENTS.cyan.hex, val: 1 },
    { name: "Culto da Fratura", label: "Neutro", color: "#4f6285", val: 0 },
    { name: "Conselho de Vosek", label: "Suspeita", color: ACCENTS.danger.hex, val: -1 },
    { name: "Enforcers Municipais", label: "Hostil", color: ACCENTS.danger.hex, val: -2 },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* group header */}
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: "1px solid #16233a" }}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center font-display text-[12px] font-700" style={{ color: ACCENTS.amber.hex, background: ACCENTS.amber.soft, border: `1px solid ${ACCENTS.amber.hex}66`, clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)" }}>FRG</div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[12px] font-700 uppercase tracking-[0.1em] text-ink">Os Fragmentos</div>
          <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">Tier 2 · Rep. 3/5 · {credits.toLocaleString()} cr</div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex" style={{ borderBottom: "1px solid #16233a" }}>
        {TABS_DEF.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 px-2 py-2.5 font-display text-[9px] font-600 uppercase tracking-[0.12em] transition-colors" style={{ color: tab === t.key ? ACCENTS.amber.hex : "#4f6285", borderBottom: `2px solid ${tab === t.key ? ACCENTS.amber.hex : "transparent"}` }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rup-scroll flex-1 overflow-y-auto">
        {tab === "inventario" && (
          <div className="space-y-1 p-3">
            {/* credits row */}
            <div className="flex items-center gap-2.5 rounded-[2px] px-2.5 py-2.5" style={{ border: "1px solid #16233a" }}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] font-display text-[13px] font-700" style={{ color: ACCENTS.amber.hex, border: `1px solid ${ACCENTS.amber.hex}44`, background: ACCENTS.amber.soft }}>₡</span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[11px] font-700 uppercase tracking-[0.06em] text-ink">Créditos</div>
                <div className="font-mono text-[8px] uppercase tracking-[0.06em]" style={{ color: ACCENTS.amber.hex }}>{credits.toLocaleString()} cr</div>
              </div>
              <button
                onClick={() => onTransfer("credits")}
                className="rounded-[2px] px-2.5 py-1.5 font-display text-[8.5px] font-600 uppercase tracking-[0.1em] transition-colors"
                style={{ color: ACCENTS.amber.hex, border: `1px solid ${ACCENTS.amber.hex}66`, background: ACCENTS.amber.soft }}
              >
                Transferir
              </button>
            </div>
            {/* items */}
            {inventory.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5 rounded-[2px] px-2.5 py-2.5" style={{ border: "1px solid #16233a" }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] font-display text-[10px] font-700" style={{ color: item.accent.hex, border: `1px solid ${item.accent.hex}44`, background: item.accent.soft }}>{item.name.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[11px] font-700 uppercase tracking-[0.06em] text-ink">{item.name}</div>
                  <div className="font-mono text-[7.5px] uppercase tracking-[0.06em] text-ink-faint">{item.type}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[11px] font-700 text-ink-faint">×{item.qty}</span>
                  <button
                    onClick={() => onTransfer(item.id)}
                    className="rounded-[2px] px-2 py-1 font-display text-[8px] font-600 uppercase tracking-[0.1em] transition-colors"
                    style={{ color: item.accent.hex, border: `1px solid ${item.accent.hex}55`, background: item.accent.soft }}
                  >
                    ▹
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "missoes" && (
          <div className="space-y-1 p-3">
            {MISSIONS.map((m) => {
              const sc = m.status === "ativa" ? ACCENTS.amber.hex : ACCENTS.good.hex;
              return (
                <div key={m.title} className="rounded-[2px] px-2.5 py-2.5" style={{ border: "1px solid #16233a" }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-[11px] font-700 uppercase tracking-[0.06em] text-ink leading-tight">{m.title}</span>
                    <span className="shrink-0 rounded-[2px] px-1.5 py-[2px] font-mono text-[7.5px] uppercase tracking-[0.08em]" style={{ color: sc, border: `1px solid ${sc}44` }}>{m.status}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-[7.5px] uppercase tracking-[0.06em] text-ink-faint">{m.client}</span>
                    {m.reward > 0 && <span className="font-mono text-[9px]" style={{ color: ACCENTS.amber.hex }}>{m.reward.toLocaleString()} cr</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "faccoes" && (
          <div className="space-y-1 p-3">
            {FACTIONS.map((f) => (
              <div key={f.name} className="flex items-center gap-2.5 rounded-[2px] px-2.5 py-2.5" style={{ border: "1px solid #16233a" }}>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[11px] font-700 uppercase tracking-[0.06em] text-ink">{f.name}</div>
                  <div className="font-mono text-[7.5px] uppercase tracking-[0.06em]" style={{ color: f.color }}>{f.label}</div>
                </div>
                <div className="flex gap-1">
                  {[-2,-1,0,1,2].map((s) => (
                    <span key={s} className="h-2 w-2 rounded-[1px]" style={{
                      background: s === 0 ? "#2a3b58" : (f.val > 0 && s > 0 && s <= f.val) ? f.color : (f.val < 0 && s < 0 && s >= f.val) ? f.color : "#16233a",
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ——— Compêndio panel ——— */
function CompendioPanel({ onSelect }: { onSelect: (id: string) => void }) {
  const [activeCat, setActiveCat] = useState("magias");
  const [search, setSearch] = useState("");
  const cat = COMPENDIO_CATS.find((c) => c.key === activeCat)!;
  const entries = COMPENDIO_ENTRIES.filter((e) => e.cat === activeCat && (search === "" || e.name.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* categories */}
      <div className="flex gap-0.5 overflow-x-auto px-3 pt-3 pb-2" style={{ borderBottom: "1px solid #16233a" }}>
        {COMPENDIO_CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => { setActiveCat(c.key); setSearch(""); }}
            className="shrink-0 rounded-[2px] px-2.5 py-1.5 font-display text-[8.5px] font-600 uppercase tracking-[0.1em] transition-colors"
            style={{ color: activeCat === c.key ? c.accent.hex : "#4f6285", border: `1px solid ${activeCat === c.key ? c.accent.hex + "66" : "transparent"}`, background: activeCat === c.key ? c.accent.soft : "transparent" }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* search */}
      <div className="px-3 py-2" style={{ borderBottom: "1px solid #16233a" }}>
        <div className="flex items-center gap-2 rounded-[2px] px-2.5 py-1.5" style={{ background: "#0c1420", border: "1px solid #16233a" }}>
          <span className="font-mono text-[10px]" style={{ color: cat.accent.hex }}>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${cat.label.toLowerCase()}…`} className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-ink placeholder:text-ink-faint focus:outline-none" />
        </div>
      </div>

      {/* list */}
      <div className="rup-scroll flex-1 space-y-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="py-6 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">Nenhum resultado</div>
        ) : (
          entries.map((e) => (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              className="flex w-full flex-col rounded-[2px] px-2.5 py-2.5 text-left transition-colors"
              style={{ border: "1px solid #16233a" }}
              onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = cat.accent.hex + "55"; ev.currentTarget.style.background = cat.accent.soft; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = "#16233a"; ev.currentTarget.style.background = "transparent"; }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[11px] font-700 uppercase tracking-[0.06em] text-ink">{e.name}</span>
                <span className="font-mono text-[9px]" style={{ color: cat.accent.hex }}>→</span>
              </div>
              <div className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.06em] text-ink-faint">{e.sub}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Sidebar shell                                                       */
/* ================================================================== */

type SidebarTab = "chat" | "personagens" | "participantes" | "bando" | "compendio";

const TABS_CONFIG: { key: SidebarTab; icon: Icon; label: string }[] = [
  { key: "chat", icon: Note, label: "Chat" },
  { key: "personagens", icon: Swords, label: "Personagens" },
  { key: "participantes", icon: UserPlus, label: "Participantes" },
  { key: "bando", icon: Shield, label: "Bando" },
  { key: "compendio", icon: Book, label: "Compêndio" },
];

const TAB_TITLES: Record<SidebarTab, string> = {
  chat: "Chat Log",
  personagens: "Personagens",
  participantes: "Participantes",
  bando: "Bando",
  compendio: "Compêndio",
};

const TAB_SUBS: Record<SidebarTab, string> = {
  chat: "Mesa Teste v0.58 · Rodada 2",
  personagens: "5 fichas · 3 PJ, 2 PN",
  participantes: `${PARTICIPANTS.filter(p=>p.status==="online").length} online · sessão 12`,
  bando: "Os Fragmentos · Tier 2",
  compendio: "Ruptura v0.58 · referência",
};

export default function Sidebar() {
  const [tab, setTab] = useState<SidebarTab>("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<ModalPayload>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [credits, setCredits] = useState(1_840);

  function handleTransferConfirm(itemId: string | "credits", qty: number, targetId: string) {
    if (itemId === "credits") {
      setCredits((v) => Math.max(0, v - qty));
    } else {
      setInventory((inv) =>
        inv.map((i) => i.id === itemId ? { ...i, qty: Math.max(0, i.qty - qty) } : i).filter((i) => i.qty > 0),
      );
    }
  }

  return (
    <>
      <div
        className="relative flex h-full flex-col overflow-hidden transition-all duration-200"
        style={{
          width: collapsed ? 56 : 320,
          background: "linear-gradient(180deg,#080e19,#060b14)",
          borderLeft: "1px solid #182338",
          flexShrink: 0,
        }}
      >
        {/* tab bar */}
        <div className="flex shrink-0 items-center justify-between px-2 py-2" style={{ borderBottom: "1px solid #182338" }}>
          {!collapsed && (
            <div className="flex gap-0.5">
              {TABS_CONFIG.map((t) => {
                const active = tab === t.key;
                const Ic = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    title={t.label}
                    className="relative flex h-9 w-9 items-center justify-center rounded-[2px] transition-colors"
                    style={{
                      color: active ? ACCENTS.cyan.hex : "#5b6f8f",
                      background: active ? ACCENTS.cyan.soft : "transparent",
                      border: `1px solid ${active ? ACCENTS.cyan.hex + "66" : "transparent"}`,
                    }}
                  >
                    {active && <span className="absolute bottom-0 left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-t-[1px]" style={{ background: ACCENTS.cyan.hex }} />}
                    <Ic width={16} height={16} />
                  </button>
                );
              })}
            </div>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:text-ink ${collapsed ? "mx-auto" : "ml-auto"}`}
            style={{ border: "1px solid #1c2b45" }}
            title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
          >
            <Chevron width={14} height={14} style={{ transform: collapsed ? "rotate(90deg)" : "rotate(270deg)" }} />
          </button>
        </div>

        {!collapsed && (
          <>
            {/* panel header */}
            <div className="shrink-0 px-4 pb-2.5 pt-2.5" style={{ borderBottom: "1px solid #182338" }}>
              <div className="font-display text-[11px] font-700 uppercase tracking-[0.18em] text-ink">{TAB_TITLES[tab]}</div>
              <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-faint">{TAB_SUBS[tab]}</div>
            </div>

            {/* panel content */}
            <div className="min-h-0 flex-1 overflow-hidden">
              {tab === "chat" && <ChatPanel />}
              {tab === "personagens" && <PersonagensPanel onSelect={(id) => setModal({ type: "character", id })} />}
              {tab === "participantes" && <ParticipantesPanel onSelect={(id) => setModal({ type: "player", id })} />}
              {tab === "bando" && (
                <BandoPanel
                  onTransfer={(itemId) => setModal({ type: "transfer", itemId })}
                />
              )}
              {tab === "compendio" && <CompendioPanel onSelect={(id) => setModal({ type: "entry", id })} />}
            </div>
          </>
        )}

        {collapsed && (
          <div className="flex flex-1 flex-col items-center gap-1 py-3">
            {TABS_CONFIG.map((t) => {
              const Ic = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setCollapsed(false); }}
                  title={t.label}
                  className="flex h-9 w-9 items-center justify-center rounded-[2px] transition-colors"
                  style={{ color: active ? ACCENTS.cyan.hex : "#5b6f8f", background: active ? ACCENTS.cyan.soft : "transparent" }}
                >
                  <Ic width={16} height={16} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* modals */}
      {modal?.type === "character" && <CharacterModal id={modal.id} onClose={() => setModal(null)} />}
      {modal?.type === "player" && <PlayerModal id={modal.id} onClose={() => setModal(null)} />}
      {modal?.type === "entry" && <EntryModal id={modal.id} onClose={() => setModal(null)} />}
      {modal?.type === "transfer" && (
        <TransferModal
          itemId={modal.itemId}
          inventory={inventory}
          credits={credits}
          onClose={() => setModal(null)}
          onConfirm={(itemId, qty, targetId) => { handleTransferConfirm(itemId, qty, targetId); }}
        />
      )}
    </>
  );
}
