import { useState, type ReactNode, type ComponentType, type SVGProps } from "react";
import {
  Accent,
  ACCENTS,
  VERTENTES,
  Badge,
  SectionLabel,
  CommandButton,
  GhostButton,
  ResultStrip,
  ResultKey,
  StatRow,
  StatCell,
  DurationPill,
  MetaLine,
  Chevron,
} from "./ui";
import {
  Flame,
  Bolt,
  Drop,
  Blade,
  Syringe,
  Sigil,
  Book,
  Eye,
  Check,
} from "../lib/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/* ------------------------------------------------------------------ */
/*  Speaker                                                            */
/* ------------------------------------------------------------------ */

function Speaker({
  name,
  role,
  time,
  category,
  accent,
}: {
  name: string;
  role?: string;
  time: string;
  category: string;
  accent: Accent;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate font-display text-[11px] font-600 uppercase tracking-[0.12em] text-ink-dim">
          {name}
        </div>
        {role && (
          <div className="truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-faint">
            {role}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="font-display text-[8.5px] font-600 uppercase tracking-[0.14em]"
          style={{ color: accent.hex }}
        >
          {category}
        </span>
        <span className="font-mono text-[8.5px] tracking-wide text-ink-faint">{time}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card shell — flat, matte, single accent                            */
/* ------------------------------------------------------------------ */

function CardShell({
  accent,
  icon: IconC,
  title,
  subtitle,
  tags,
  speaker,
  expanded,
  onToggle,
  compact,
  expandedContent,
  actions,
  dimmed = false,
}: {
  accent: Accent;
  icon: Icon;
  title: string;
  subtitle: ReactNode;
  tags?: ReactNode;
  speaker: { name: string; role?: string; time: string; category: string };
  expanded: boolean;
  onToggle: () => void;
  compact: ReactNode;
  expandedContent?: ReactNode;
  actions: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <article
      className="group relative overflow-hidden rounded-[3px] transition-colors"
      style={{
        background: "#0c1420",
        border: "1px solid #182338",
        opacity: dimmed ? 0.6 : 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#243352")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#182338")}
    >
      <span className="absolute left-0 top-0 h-full w-[2px]" style={{ background: accent.hex }} />

      <div className="pl-3.5 pr-3 py-2.5">
        <Speaker {...speaker} accent={accent} />

        {/* title */}
        <div className="mt-2.5 flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px]"
            style={{ color: accent.hex, background: accent.soft }}
          >
            <IconC width={18} height={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-[15px] font-700 uppercase tracking-[0.04em] leading-tight text-ink">
              {title}
            </h3>
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">
              {subtitle}
            </div>
          </div>
          <button
            onClick={onToggle}
            aria-label={expanded ? "Recolher" : "Expandir"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:text-ink-dim"
          >
            <Chevron
              width={14}
              height={14}
              style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}
            />
          </button>
        </div>

        {tags && <div className="mt-2 flex flex-wrap gap-1">{tags}</div>}

        <div className="mt-2.5 space-y-2">{compact}</div>

        {expanded && expandedContent && (
          <div className="mt-2.5 space-y-2 border-t border-line/70 pt-2.5">{expandedContent}</div>
        )}

        <div className="mt-2.5 flex items-center gap-2">{actions}</div>
      </div>
    </article>
  );
}

function useCard(initial = false) {
  const [expanded, setExpanded] = useState(initial);
  return { expanded, onToggle: () => setExpanded((v) => !v) };
}

function Description({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] leading-relaxed text-ink-dim">{children}</p>;
}

/* Small key/value block used for single mechanical facts */
function KeyStat({ label, value, accent }: { label: string; value: ReactNode; accent: Accent }) {
  return (
    <div className="flex items-baseline justify-between rounded-[2px] px-2.5 py-1.5" style={{ background: "#0f1929" }}>
      <span className="font-display text-[9px] uppercase tracking-[0.14em] text-ink-faint">{label}</span>
      <span className="font-mono text-[12px] font-700" style={{ color: accent.hex }}>
        {value}
      </span>
    </div>
  );
}

/* ================================================================== */
/*  1. MAGIA                                                           */
/* ================================================================== */

export function SpellCard({
  vertente = "Energética",
  cast = false,
  defaultExpanded = false,
}: {
  vertente?: keyof typeof VERTENTES;
  cast?: boolean;
  defaultExpanded?: boolean;
}) {
  const card = useCard(defaultExpanded);
  const accent = VERTENTES[vertente];
  return (
    <CardShell
      accent={accent}
      icon={Flame}
      title="Bola de Fogo"
      subtitle={`${vertente} • Nível 3 • Ataque`}
      speaker={{ name: "Mara Venn", role: "Combatente • Acrobata", time: "há 2s", category: "Magia" }}
      expanded={card.expanded}
      onToggle={card.onToggle}
      tags={
        <>
          <Badge accent={accent}>{vertente}</Badge>
          <Badge>Área ⊙ 3m</Badge>
        </>
      }
      compact={
        <>
          <StatRow>
            <StatCell label="Mana" value="6" accent={accent} />
            <StatCell label="PA" value="2" accent={accent} />
            <StatCell label="Alcance" value="25" sub="m" accent={ACCENTS.cyan} />
            <StatCell label="Dano" value="3d6" accent={ACCENTS.cyan} />
          </StatRow>
          <ResultStrip
            result="padrao"
            detail="Graveknight • Desviar CD 14"
            roll={cast ? "17" : undefined}
          />
        </>
      }
      expandedContent={
        <>
          <Description>
            Você condensa energia em um ponto dentro do alcance e detona em chamas. Criaturas na área
            reagem com <span className="text-cyan">Desviar</span> contra sua CD de Energética. Em falha
            sofrem <span className="font-mono font-700 text-ink">3d6</span> de dano ígneo e ficam
            Queimando. Em sucesso, metade.
          </Description>
          <div>
            <MetaLine label="Alvo">Esfera ⊙ 3 m</MetaLine>
            <MetaLine label="Duração">Instantânea</MetaLine>
            <MetaLine label="Pré-req.">Precisão 3</MetaLine>
          </div>
        </>
      }
      actions={
        <>
          <CommandButton accent={accent}>
            {cast ? "Aplicar Efeito" : "Conjurar"}
          </CommandButton>
          <GhostButton>Detalhes</GhostButton>
        </>
      }
    />
  );
}

/* ================================================================== */
/*  2. CONDIÇÃO                                                        */
/* ================================================================== */

export function ConditionCard({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  const card = useCard(defaultExpanded);
  const accent = ACCENTS.danger;
  return (
    <CardShell
      accent={accent}
      icon={Drop}
      title="Sangrando"
      subtitle="Condição • Contínua"
      speaker={{ name: "Graveknight", time: "há 12s", category: "Condição" }}
      expanded={card.expanded}
      onToggle={card.onToggle}
      tags={
        <>
          <Badge accent={accent}>Negativa</Badge>
          <Badge>Intensidade 2</Badge>
        </>
      }
      compact={
        <>
          <div className="grid grid-cols-2 gap-2">
            <KeyStat label="Dano / rodada" value="1d8" accent={accent} />
            <div className="flex items-center rounded-[2px] px-2.5 py-1.5" style={{ background: "#0f1929" }}>
              <DurationPill accent={accent}>2 rodadas restantes</DurationPill>
            </div>
          </div>
          <Description>Sofre dano no início de cada turno conforme a regra da condição.</Description>
        </>
      }
      expandedContent={
        <div>
          <MetaLine label="Alvo">Graveknight</MetaLine>
          <MetaLine label="Origem">Lâmina Cinética</MetaLine>
          <MetaLine label="Cura">Teste de Vigor CD 12</MetaLine>
        </div>
      }
      actions={
        <>
          <CommandButton accent={ACCENTS.good}>
            <Check width={13} height={13} /> Remover
          </CommandButton>
          <GhostButton>Ver Condição</GhostButton>
        </>
      }
    />
  );
}

/* ================================================================== */
/*  3. EFEITO                                                          */
/* ================================================================== */

export function EffectCard({
  expired = false,
  defaultExpanded = false,
}: {
  expired?: boolean;
  defaultExpanded?: boolean;
}) {
  const card = useCard(defaultExpanded);
  const accent = expired ? ACCENTS.slate : ACCENTS.arcane;
  return (
    <CardShell
      accent={accent}
      icon={Sigil}
      title="Campo Cinético"
      subtitle="Efeito • Modificação"
      dimmed={expired}
      speaker={{ name: "Mara Venn", time: "há 40s", category: "Efeito" }}
      expanded={card.expanded}
      onToggle={card.onToggle}
      tags={
        <>
          <Badge accent={ACCENTS.cyan}>Buff</Badge>
          <Badge>Monitorado</Badge>
        </>
      }
      compact={
        <>
          <div className="flex items-center justify-between rounded-[2px] px-2.5 py-1.5" style={{ background: "#0f1929" }}>
            <span className="font-display text-[10px] uppercase tracking-[0.1em]" style={{ color: accent.hex }}>
              +1 Vantagem · Mobilidade
            </span>
            {expired ? (
              <DurationPill expired>Expirado</DurationPill>
            ) : (
              <DurationPill accent={accent}>Início do turno</DurationPill>
            )}
          </div>
          <Description>Campo telecinético reduz o atrito ao redor do alvo, acelerando movimentos precisos.</Description>
        </>
      }
      expandedContent={
        <div>
          <MetaLine label="Origem">Telecinese</MetaLine>
          <MetaLine label="Alvo">Mara Venn</MetaLine>
          <MetaLine label="Vertente">Cinética</MetaLine>
        </div>
      }
      actions={
        expired ? (
          <GhostButton>Ver Origem</GhostButton>
        ) : (
          <>
            <CommandButton accent={accent}>Remover</CommandButton>
            <GhostButton>Ver Origem</GhostButton>
          </>
        )
      }
    />
  );
}

/* ================================================================== */
/*  4. ITEM                                                            */
/* ================================================================== */

export function ItemCard({
  used = false,
  defaultExpanded = false,
}: {
  used?: boolean;
  defaultExpanded?: boolean;
}) {
  const card = useCard(defaultExpanded);
  const accent = ACCENTS.good;
  return (
    <CardShell
      accent={accent}
      icon={Syringe}
      title="Injetor de Emergência"
      subtitle="Consumível • Médico"
      dimmed={used}
      speaker={{ name: "Assis", time: "há 1min", category: "Item" }}
      expanded={card.expanded}
      onToggle={card.onToggle}
      tags={
        <>
          <Badge accent={ACCENTS.cyan}>Incomum</Badge>
          {used && <Badge accent={ACCENTS.slate}>Utilizado</Badge>}
        </>
      }
      compact={
        <>
          <StatRow>
            <StatCell label="Qtd." value={used ? "1" : "2"} accent={accent} />
            <StatCell label="Uso" value="1" sub="PA" accent={ACCENTS.cyan} />
            <StatCell label="Cura" value="2d6+2" accent={accent} />
          </StatRow>
          <Description>Restaura Pontos de Vida e remove a condição Sangrando de um alvo adjacente.</Description>
        </>
      }
      expandedContent={
        <div>
          <MetaLine label="Alcance">Toque</MetaLine>
          <MetaLine label="Fabricante">VOSEK Med</MetaLine>
          <MetaLine label="Valor">40 créditos</MetaLine>
        </div>
      }
      actions={
        used ? (
          <>
            <CommandButton disabled>Utilizado</CommandButton>
            <GhostButton>Ver Item</GhostButton>
          </>
        ) : (
          <>
            <CommandButton accent={accent}>Usar</CommandButton>
            <GhostButton>Ver Item</GhostButton>
          </>
        )
      }
    />
  );
}

/* ================================================================== */
/*  5. ARMA                                                            */
/* ================================================================== */

export function WeaponCard({
  rolled = true,
  result = "critico" as ResultKey,
  defaultExpanded = false,
}: {
  rolled?: boolean;
  result?: ResultKey;
  defaultExpanded?: boolean;
}) {
  const card = useCard(defaultExpanded);
  const accent = ACCENTS.amber;
  return (
    <CardShell
      accent={accent}
      icon={Blade}
      title="Lâmina Cinética"
      subtitle="Corpo a corpo • Precisão"
      speaker={{ name: "Assis", role: "Operador de Campo", time: "há 3min", category: "Arma" }}
      expanded={card.expanded}
      onToggle={card.onToggle}
      tags={
        <>
          <Badge>Corpo a Corpo</Badge>
          <Badge>Cortante</Badge>
          <Badge>Uma Mão</Badge>
        </>
      }
      compact={
        <>
          <StatRow>
            <StatCell label="Ataque" value="14" sub="vs DEF" accent={ACCENTS.cyan} />
            <StatCell label="Dano" value="2d6+3" accent={accent} />
          </StatRow>
          {rolled && <ResultStrip result={result} detail="Graveknight • Margem 6" roll="21" />}
        </>
      }
      expandedContent={
        <div>
          <MetaLine label="Perícia">Luta · Corpo</MetaLine>
          <MetaLine label="Alcance">1,5 m · Cortante</MetaLine>
          <MetaLine label="Propr.">Vibro-fio · Recarga cinética</MetaLine>
        </div>
      }
      actions={
        <>
          <CommandButton accent={accent}>{rolled ? "Aplicar Dano" : "Atacar"}</CommandButton>
          <GhostButton>Detalhes</GhostButton>
        </>
      }
    />
  );
}

/* ================================================================== */
/*  6. TALENTO                                                         */
/* ================================================================== */

export function TalentCard({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  const card = useCard(defaultExpanded);
  const accent = ACCENTS.cyan;
  return (
    <CardShell
      accent={accent}
      icon={Bolt}
      title="Correção do Golpe"
      subtitle="Talento • Manobra"
      speaker={{ name: "Assis", time: "há 5min", category: "Talento" }}
      expanded={card.expanded}
      onToggle={card.onToggle}
      tags={
        <>
          <Badge accent={accent}>Manobra</Badge>
          <Badge>Reação</Badge>
        </>
      }
      compact={
        <>
          <KeyStat label="Custo" value="1 Dado de Manobra" accent={accent} />
          <div>
            <SectionLabel>Gatilho</SectionLabel>
            <Description>Depois de realizar um teste de acerto e antes de saber o resultado.</Description>
          </div>
        </>
      }
      expandedContent={
        <div>
          <SectionLabel>Efeito</SectionLabel>
          <div className="mt-1">
            <Description>
              Adicione o resultado do Dado de Manobra à sua jogada de ataque. Se isso transformar uma
              falha em sucesso, o alvo fica Contundido até o fim do seu próximo turno.
            </Description>
          </div>
        </div>
      }
      actions={
        <>
          <CommandButton accent={accent}>
            <Bolt width={13} height={13} /> Ativar
          </CommandButton>
          <GhostButton>
            <Book width={12} height={12} /> Ver Talento
          </GhostButton>
        </>
      }
    />
  );
}

export { ACCENTS, VERTENTES, Badge, CommandButton, GhostButton, ResultStrip, DurationPill };
export type { ResultKey };
export { Eye };
