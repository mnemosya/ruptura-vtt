import { useState, type ReactNode, type ComponentType, type SVGProps } from "react";
import { Accent, ACCENTS, VERTENTES, type ResultKey } from "./ui";
import { Flame, Bolt, Drop, Blade, Syringe, Sigil, Check, DoubleCheck, Cross, Half, Warn } from "../lib/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/* ------------------------------------------------------------------ */
/*  Shared B primitives — "field dossier" language                     */
/* ------------------------------------------------------------------ */

function Brackets({ color }: { color: string }) {
  const s: React.CSSProperties = { position: "absolute", width: 9, height: 9, opacity: 0.55 };
  return (
    <>
      <span style={{ ...s, top: 4, left: 4, borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` }} />
      <span style={{ ...s, top: 4, right: 4, borderTop: `1px solid ${color}`, borderRight: `1px solid ${color}` }} />
      <span style={{ ...s, bottom: 4, left: 4, borderBottom: `1px solid ${color}`, borderLeft: `1px solid ${color}` }} />
      <span style={{ ...s, bottom: 4, right: 4, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` }} />
    </>
  );
}

function InlineStats({ items }: { items: { label: string; value: string; accent?: Accent }[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline gap-1.5">
          <span className="font-display text-[8.5px] font-600 uppercase tracking-[0.16em] text-ink-faint">
            {it.label}
          </span>
          <span className="font-mono text-[14px] font-700 leading-none" style={{ color: (it.accent ?? ACCENTS.cyan).hex }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const RES: Record<ResultKey, { label: string; accent: Accent; Icon: typeof Check }> = {
  critico: { label: "Sucesso Crítico", accent: ACCENTS.cyan, Icon: DoubleCheck },
  padrao: { label: "Sucesso Padrão", accent: ACCENTS.good, Icon: Check },
  limitado: { label: "Sucesso Limitado", accent: ACCENTS.amber, Icon: Half },
  "falha-limitada": { label: "Falha Limitada", accent: ACCENTS.magenta, Icon: Warn },
  falha: { label: "Falha", accent: ACCENTS.danger, Icon: Cross },
};

function ResultBanner({ result, detail, roll }: { result: ResultKey; detail?: string; roll?: string }) {
  const r = RES[result];
  const Icon = r.Icon;
  return (
    <div
      className="relative flex items-center gap-2.5 overflow-hidden py-2 pl-3 pr-2.5"
      style={{ background: `${r.accent.hex}12` }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{
          background: `repeating-linear-gradient(-45deg, ${r.accent.hex} 0 2px, transparent 2px 5px)`,
        }}
      />
      <Icon width={15} height={15} style={{ color: r.accent.hex, flexShrink: 0, marginLeft: 4 }} />
      <div className="min-w-0 flex-1">
        <div className="font-display text-[12.5px] font-700 uppercase tracking-[0.1em] leading-none" style={{ color: r.accent.hex }}>
          {r.label}
        </div>
        {detail && (
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-dim">{detail}</div>
        )}
      </div>
      {roll && (
        <span className="font-mono text-[9px] tracking-widest" style={{ color: r.accent.hex }}>
          [ <span className="text-[15px] font-700">{roll}</span> ]
        </span>
      )}
    </div>
  );
}

function CommandB({
  children,
  accent = ACCENTS.cyan,
  disabled,
}: {
  children: ReactNode;
  accent?: Accent;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      className="flex flex-1 items-center justify-center gap-2 py-2 font-display text-[11px] font-700 uppercase tracking-[0.22em] transition-colors disabled:cursor-not-allowed"
      style={{
        color: disabled ? "#4a5a78" : accent.hex,
        borderTop: `1px solid ${disabled ? "#182338" : accent.hex + "66"}`,
        borderBottom: `1px solid ${disabled ? "#182338" : accent.hex + "66"}`,
        background: disabled ? "transparent" : `${accent.hex}0d`,
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = `${accent.hex}1c`)}
      onMouseLeave={(e) => !disabled && (e.currentTarget.style.background = `${accent.hex}0d`)}
    >
      <span style={{ opacity: disabled ? 0.4 : 0.7 }}>▹</span>
      {children}
    </button>
  );
}

function GhostB({ children }: { children: ReactNode }) {
  return (
    <button className="px-2.5 py-2 font-display text-[10px] font-500 uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink-dim">
      {children}
    </button>
  );
}

function TagB({ children, accent }: { children: ReactNode; accent?: Accent }) {
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-[0.1em]"
      style={{ color: accent ? accent.hex : "#6f83a3" }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell B                                                            */
/* ------------------------------------------------------------------ */

function ShellB({
  accent,
  icon: IconC,
  category,
  title,
  subtitle,
  speaker,
  tags,
  compact,
  expandedContent,
  actions,
  expanded,
  onToggle,
  dimmed,
}: {
  accent: Accent;
  icon: Icon;
  category: string;
  title: string;
  subtitle: string;
  speaker: { name: string; time: string };
  tags?: { label: string; accent?: Accent }[];
  compact: ReactNode;
  expandedContent?: ReactNode;
  actions: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  dimmed?: boolean;
}) {
  return (
    <article
      className="relative rounded-[2px] transition-colors"
      style={{
        background: "linear-gradient(180deg,#0b1322,#080e19)",
        border: "1px solid #16233a",
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      <Brackets color={accent.hex} />
      <div className="flex">
        {/* spine */}
        <div
          className="flex w-9 shrink-0 flex-col items-center justify-between py-3"
          style={{ borderRight: "1px solid #16233a" }}
        >
          <span style={{ color: accent.hex }}>
            <IconC width={17} height={17} />
          </span>
          <span
            className="font-display text-[8.5px] font-600 uppercase tracking-[0.24em]"
            style={{ color: accent.hex, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {category}
          </span>
        </div>

        {/* body */}
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <div className="flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-faint">
            <span className="truncate">{speaker.name}</span>
            <span className="shrink-0">{speaker.time}</span>
          </div>

          <h3 className="mt-1.5 font-display text-[17px] font-700 uppercase tracking-[0.03em] leading-none text-ink">
            {title}
          </h3>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dim">{subtitle}</div>

          {tags && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {tags.map((t, i) => (
                <TagB key={i} accent={t.accent}>
                  {t.label}
                </TagB>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2.5">{compact}</div>

          {expanded && expandedContent && (
            <div className="mt-2.5 border-t border-dashed border-line pt-2.5">{expandedContent}</div>
          )}

          <div className="mt-3 flex items-stretch gap-2">
            {actions}
            <button
              onClick={onToggle}
              className="font-mono text-[10px] tracking-widest text-ink-faint transition-colors hover:text-ink-dim"
              aria-label={expanded ? "Recolher" : "Expandir"}
            >
              {expanded ? "[ − ]" : "[ + ]"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function useCard(i = false) {
  const [expanded, setExpanded] = useState(i);
  return { expanded, onToggle: () => setExpanded((v) => !v) };
}

function Desc({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] leading-relaxed text-ink-dim">{children}</p>;
}

function MetaB({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline gap-1.5 border-b border-line/50 pb-1">
          <span className="font-display text-[8px] uppercase tracking-[0.14em] text-ink-faint">{k}</span>
          <span className="ml-auto font-mono text-[10px] text-ink-dim">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Six cards — B                                                      */
/* ================================================================== */

export function SpellCardB({ cast = false, defaultExpanded = false }: { cast?: boolean; defaultExpanded?: boolean }) {
  const c = useCard(defaultExpanded);
  const accent = VERTENTES.Energética;
  return (
    <ShellB
      accent={accent}
      icon={Flame}
      category="Magia"
      title="Bola de Fogo"
      subtitle="Energética · Nível 3 · Ataque"
      speaker={{ name: "Mara Venn", time: "há 2s" }}
      tags={[{ label: "Energética", accent }, { label: "Área ⊙ 3m" }]}
      expanded={c.expanded}
      onToggle={c.onToggle}
      compact={
        <>
          <InlineStats
            items={[
              { label: "MANA", value: "6", accent },
              { label: "PA", value: "2", accent },
              { label: "ALC", value: "25m" },
              { label: "DANO", value: "3d6" },
            ]}
          />
          <ResultBanner result="padrao" detail="Graveknight · Desviar CD 14" roll={cast ? "17" : undefined} />
        </>
      }
      expandedContent={
        <div className="space-y-2.5">
          <Desc>
            Você condensa energia em um ponto dentro do alcance e detona em chamas. Criaturas na área reagem
            com <span className="text-cyan">Desviar</span>. Em falha sofrem <span className="font-mono font-700 text-ink">3d6</span> de dano ígneo e ficam Queimando.
          </Desc>
          <MetaB rows={[["ALVO", "Esfera ⊙ 3m"], ["DURAÇÃO", "Instantânea"], ["PRÉ-REQ", "Precisão 3"], ["VERTENTE", "Energética"]]} />
        </div>
      }
      actions={<CommandB accent={accent}>{cast ? "Aplicar Efeito" : "Conjurar"}</CommandB>}
    />
  );
}

export function ConditionCardB({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  const c = useCard(defaultExpanded);
  const accent = ACCENTS.danger;
  return (
    <ShellB
      accent={accent}
      icon={Drop}
      category="Condição"
      title="Sangrando"
      subtitle="Condição · Contínua"
      speaker={{ name: "Graveknight", time: "há 12s" }}
      tags={[{ label: "Negativa", accent }, { label: "Intensidade 2" }]}
      expanded={c.expanded}
      onToggle={c.onToggle}
      compact={
        <>
          <InlineStats items={[{ label: "DANO/RD", value: "1d8", accent }, { label: "RESTA", value: "2 rd", accent }]} />
          <Desc>Sofre dano no início de cada turno conforme a regra da condição.</Desc>
        </>
      }
      expandedContent={<MetaB rows={[["ALVO", "Graveknight"], ["ORIGEM", "Lâmina Cinética"], ["CURA", "Vigor CD 12"], ["APLIC.", "Rd 2 · Assis"]]} />}
      actions={<CommandB accent={ACCENTS.good}>Remover</CommandB>}
    />
  );
}

export function EffectCardB({ expired = false, defaultExpanded = false }: { expired?: boolean; defaultExpanded?: boolean }) {
  const c = useCard(defaultExpanded);
  const accent = expired ? ACCENTS.slate : ACCENTS.arcane;
  return (
    <ShellB
      accent={accent}
      icon={Sigil}
      category="Efeito"
      title="Campo Cinético"
      subtitle="Efeito · Modificação"
      dimmed={expired}
      speaker={{ name: "Mara Venn", time: "há 40s" }}
      tags={[{ label: "Buff", accent: ACCENTS.cyan }, { label: expired ? "Expirado" : "Início do turno", accent }]}
      expanded={c.expanded}
      onToggle={c.onToggle}
      compact={
        <>
          <div className="font-display text-[11px] uppercase tracking-[0.1em]" style={{ color: accent.hex }}>
            +1 Vantagem · Mobilidade
          </div>
          <Desc>Campo telecinético reduz o atrito ao redor do alvo, acelerando movimentos precisos.</Desc>
        </>
      }
      expandedContent={<MetaB rows={[["ORIGEM", "Telecinese"], ["ALVO", "Mara Venn"], ["VERTENTE", "Cinética"], ["DURAÇÃO", "1 rodada"]]} />}
      actions={expired ? <GhostB>Ver Origem</GhostB> : <CommandB accent={accent}>Remover</CommandB>}
    />
  );
}

export function ItemCardB({ used = false, defaultExpanded = false }: { used?: boolean; defaultExpanded?: boolean }) {
  const c = useCard(defaultExpanded);
  const accent = ACCENTS.good;
  return (
    <ShellB
      accent={accent}
      icon={Syringe}
      category="Item"
      title="Injetor de Emergência"
      subtitle="Consumível · Médico"
      dimmed={used}
      speaker={{ name: "Assis", time: "há 1min" }}
      tags={[{ label: "Incomum", accent: ACCENTS.cyan }, ...(used ? [{ label: "Utilizado", accent: ACCENTS.slate }] : [])]}
      expanded={c.expanded}
      onToggle={c.onToggle}
      compact={
        <>
          <InlineStats items={[{ label: "QTD", value: used ? "1" : "2", accent }, { label: "USO", value: "1 PA" }, { label: "CURA", value: "2d6+2", accent }]} />
          <Desc>Restaura Pontos de Vida e remove a condição Sangrando de um alvo adjacente.</Desc>
        </>
      }
      expandedContent={<MetaB rows={[["ALCANCE", "Toque"], ["FABRIC.", "VOSEK Med"], ["VALOR", "40 créd."], ["PESO", "0,2 kg"]]} />}
      actions={used ? <CommandB disabled>Utilizado</CommandB> : <CommandB accent={accent}>Usar</CommandB>}
    />
  );
}

export function WeaponCardB({ rolled = true, result = "critico" as ResultKey, defaultExpanded = false }: { rolled?: boolean; result?: ResultKey; defaultExpanded?: boolean }) {
  const c = useCard(defaultExpanded);
  const accent = ACCENTS.amber;
  return (
    <ShellB
      accent={accent}
      icon={Blade}
      category="Arma"
      title="Lâmina Cinética"
      subtitle="Corpo a corpo · Precisão"
      speaker={{ name: "Assis", time: "há 3min" }}
      tags={[{ label: "Corpo a Corpo" }, { label: "Cortante" }, { label: "Uma Mão" }]}
      expanded={c.expanded}
      onToggle={c.onToggle}
      compact={
        <>
          <InlineStats items={[{ label: "ATAQUE", value: "14", accent: ACCENTS.cyan }, { label: "DANO", value: "2d6+3", accent }]} />
          {rolled && <ResultBanner result={result} detail="Graveknight · Margem 6" roll="21" />}
        </>
      }
      expandedContent={<MetaB rows={[["PERÍCIA", "Luta · Corpo"], ["ALCANCE", "1,5m"], ["TIPO", "Cortante"], ["PROPR.", "Vibro-fio"]]} />}
      actions={<CommandB accent={accent}>{rolled ? "Aplicar Dano" : "Atacar"}</CommandB>}
    />
  );
}

export function TalentCardB({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  const c = useCard(defaultExpanded);
  const accent = ACCENTS.cyan;
  return (
    <ShellB
      accent={accent}
      icon={Bolt}
      category="Talento"
      title="Correção do Golpe"
      subtitle="Talento · Manobra"
      speaker={{ name: "Assis", time: "há 5min" }}
      tags={[{ label: "Manobra", accent }, { label: "Reação" }]}
      expanded={c.expanded}
      onToggle={c.onToggle}
      compact={
        <>
          <InlineStats items={[{ label: "CUSTO", value: "1 Dado de Manobra", accent }]} />
          <div>
            <div className="font-display text-[8.5px] uppercase tracking-[0.18em] text-ink-faint">Gatilho</div>
            <Desc>Depois de realizar um teste de acerto e antes de saber o resultado.</Desc>
          </div>
        </>
      }
      expandedContent={
        <div>
          <div className="font-display text-[8.5px] uppercase tracking-[0.18em] text-ink-faint">Efeito</div>
          <Desc>
            Adicione o resultado do Dado de Manobra à sua jogada de ataque. Se transformar uma falha em sucesso,
            o alvo fica Contundido até o fim do seu próximo turno.
          </Desc>
        </div>
      }
      actions={<CommandB accent={accent}>Ativar</CommandB>}
    />
  );
}
