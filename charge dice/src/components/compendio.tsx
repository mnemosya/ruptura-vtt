import { useState } from "react";
import { ACCENTS, type Accent } from "./ui";
import { Brackets } from "./tools";

/* ------------------------------------------------------------------ */
/*  Types & mock data                                                   */
/* ------------------------------------------------------------------ */

type Category = { key: string; label: string; count: number; accent: Accent };

const CATEGORIES: Category[] = [
  { key: "magias", label: "Magias", count: 12, accent: ACCENTS.arcane },
  { key: "condicoes", label: "Condições", count: 8, accent: ACCENTS.amber },
  { key: "criaturas", label: "Criaturas", count: 24, accent: ACCENTS.danger },
  { key: "itens", label: "Itens", count: 16, accent: ACCENTS.cyan },
  { key: "regras", label: "Regras", count: 45, accent: ACCENTS.slate },
];

type Tag = { label: string; accent: Accent };
type StatLine = { label: string; value: string };

type Entry = {
  id: string;
  category: string;
  name: string;
  subtitle: string;
  tags: Tag[];
  body: string;
  stats?: StatLine[];
  mechanicTitle?: string;
  mechanic?: string;
  seeAlso?: string[];
};

const ENTRIES: Entry[] = [
  /* ——— Magias ——— */
  {
    id: "rajada-cinetica",
    category: "magias",
    name: "Rajada Cinética",
    subtitle: "Magia de Ataque · Vertente Cinética · Nível 2",
    tags: [{ label: "Cinética", accent: ACCENTS.cyan }, { label: "Ataque", accent: ACCENTS.danger }, { label: "Alcance 8 m", accent: ACCENTS.slate }],
    body: "Você lança uma onda de força comprimida contra um alvo. A rajada pode atingir múltiplos alvos em linha se o narrador julgar apropriado.",
    stats: [
      { label: "Alcance", value: "8 m" },
      { label: "Dano", value: "1d8 + Reflexos" },
      { label: "Custo de PD", value: "1" },
      { label: "Ação", value: "Padrão" },
    ],
    mechanicTitle: "Efeito Secundário",
    mechanic: "Em resultado crítico, o alvo é empurrado 2 m na direção da rajada e fica Atordoado por 1 rodada.",
    seeAlso: ["Onda de Impacto", "Reflexos Aumentados"],
  },
  {
    id: "pulso-sinaptico",
    category: "magias",
    name: "Pulso Sináptico",
    subtitle: "Magia de Controle · Vertente Sináptica · Nível 1",
    tags: [{ label: "Sináptica", accent: ACCENTS.magenta }, { label: "Controle", accent: ACCENTS.arcane }, { label: "Alcance 6 m", accent: ACCENTS.slate }],
    body: "Você envia um sinal elétrico diretamente ao sistema nervoso do alvo, causando uma breve interrupção das funções motoras.",
    stats: [
      { label: "Alcance", value: "6 m" },
      { label: "Duração", value: "1 rodada" },
      { label: "Custo de PD", value: "1" },
      { label: "Ação", value: "Padrão" },
    ],
    mechanicTitle: "Teste de Resistência",
    mechanic: "O alvo realiza teste de Vontade dificuldade 13. Falha: fica Atordoado. Sucesso limitado: perde a próxima ação bônus.",
    seeAlso: ["Atordoado", "Controle Mental"],
  },
  {
    id: "barricada-material",
    category: "magias",
    name: "Barricada Material",
    subtitle: "Magia de Proteção · Vertente Material · Nível 3",
    tags: [{ label: "Material", accent: ACCENTS.slate }, { label: "Proteção", accent: ACCENTS.good }, { label: "Área", accent: ACCENTS.cyan }],
    body: "Você solidifica partículas ao redor de aliados próximos, criando uma camada protetora temporária de matéria condensada.",
    stats: [
      { label: "Raio", value: "3 m" },
      { label: "Redução de dano", value: "3" },
      { label: "Custo de PD", value: "2" },
      { label: "Duração", value: "Fim do turno" },
    ],
    mechanic: "Cada aliado na área recebe redução de dano 3 até o início do próximo turno do conjurador.",
    seeAlso: ["Armadura Cinética", "Armadura Ativa"],
  },
  /* ——— Condições ——— */
  {
    id: "atordoado",
    category: "condicoes",
    name: "Atordoado",
    subtitle: "Condição Negativa · Temporária",
    tags: [{ label: "Negativa", accent: ACCENTS.danger }, { label: "Temporária", accent: ACCENTS.amber }],
    body: "O personagem está desorientado, com reações prejudicadas por um golpe, sobrecarga elétrica ou outro choque ao sistema nervoso.",
    stats: [
      { label: "Penalidade de Reflexos", value: "-2" },
      { label: "Ações", value: "Nenhuma ação bônus" },
    ],
    mechanicTitle: "Remoção",
    mechanic: "A condição dura o número de rodadas indicado pela fonte. O personagem pode gastar 1 PD no início do seu turno para removê-la imediatamente.",
    seeAlso: ["Pulso Sináptico", "Rajada Cinética"],
  },
  {
    id: "ferido",
    category: "condicoes",
    name: "Ferido",
    subtitle: "Condição Negativa · Persistente",
    tags: [{ label: "Negativa", accent: ACCENTS.danger }, { label: "Persistente", accent: ACCENTS.slate }],
    body: "O personagem sofreu dano grave que ainda interfere em suas funções. Hemorragia, fratura ou trauma interno reduzem seu desempenho.",
    stats: [
      { label: "Penalidade em testes de Força", value: "-1" },
      { label: "Penalidade em Reflexos", value: "-1" },
    ],
    mechanicTitle: "Remoção",
    mechanic: "Requer 8 horas de descanso ou tratamento médico bem-sucedido (teste de Percepção/Medicina dificuldade 12).",
    seeAlso: ["Armadura Ativa", "Contato: Dra. Lira"],
  },
  /* ——— Criaturas ——— */
  {
    id: "sentinela",
    category: "criaturas",
    name: "Sentinela da Doca",
    subtitle: "Criatura PN · Combatente · Ameaça 1",
    tags: [{ label: "Humanoide", accent: ACCENTS.slate }, { label: "Armado", accent: ACCENTS.danger }, { label: "Ameaça 1", accent: ACCENTS.amber }],
    body: "Guarda contratado pelos contrabandistas da Doca 7. Treinamento básico, leal ao pagador. Reage com agressividade quando surpreendido.",
    stats: [
      { label: "PV", value: "12" },
      { label: "Reflexos", value: "1" },
      { label: "Força", value: "2" },
      { label: "Percepção", value: "1" },
    ],
    mechanicTitle: "Ação especial",
    mechanic: "Alertar (bônus): chama reforços se não incapacitado. Em 1d4 rodadas, 1d3 sentinelas adicionais chegam à cena.",
    seeAlso: ["Contrabandista", "Guardas da Doca"],
  },
  /* ——— Itens ——— */
  {
    id: "estimulante-rapido",
    category: "itens",
    name: "Estimulante Rápido",
    subtitle: "Item Consumível · Médico · Uso único",
    tags: [{ label: "Consumível", accent: ACCENTS.cyan }, { label: "Médico", accent: ACCENTS.good }, { label: "Uso único", accent: ACCENTS.slate }],
    body: "Seringa autoaplicável com coquetel de estimulantes que acelera a coagulação e suprime a dor por um curto período.",
    stats: [
      { label: "Cura", value: "1d6 + 2 PV" },
      { label: "Duração efeito", value: "3 rodadas" },
      { label: "Ação", value: "Bônus" },
      { label: "Custo", value: "80 cr" },
    ],
    mechanicTitle: "Efeito colateral",
    mechanic: "Após o efeito expirar, o personagem fica Fatigado por 2 rodadas. Não pode ser aplicado mais de uma vez por combate.",
    seeAlso: ["Ferido", "Dra. Lira"],
  },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function EntryTag({ label, accent }: { label: string; accent: Accent }) {
  return (
    <span className="inline-flex items-center rounded-[2px] px-1.5 py-[2px] font-display text-[8.5px] font-600 uppercase tracking-[0.1em]" style={{ color: accent.hex, border: `1px solid ${accent.hex}44`, background: accent.soft }}>
      {label}
    </span>
  );
}

function EntryRow({ entry, selected, accent, onClick }: { entry: Entry; selected: boolean; accent: Accent; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full items-start gap-3 rounded-[2px] px-3 py-2.5 text-left transition-colors"
      style={{
        border: `1px solid ${selected ? accent.hex + "77" : "#16233a"}`,
        background: selected ? accent.soft : "transparent",
      }}
    >
      {selected && <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-[1px]" style={{ background: accent.hex }} />}
      <div className="min-w-0 flex-1">
        <div className="font-display text-[12px] font-700 uppercase tracking-[0.06em]" style={{ color: selected ? accent.hex : "#c3d2e8" }}>{entry.name}</div>
        <div className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{entry.subtitle}</div>
      </div>
    </button>
  );
}

function DetailPanel({ entry, accent }: { entry: Entry; accent: Accent }) {
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-[2px]"
      style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: `1px solid ${accent.hex}44` }}
    >
      <Brackets color={accent.hex} size={13} inset={8} />

      {/* spine */}
      <div className="absolute bottom-0 left-0 top-0 flex w-9 flex-col items-center justify-between py-4" style={{ borderRight: "1px solid #16233a", background: "rgba(255,255,255,0.013)" }}>
        <span className="font-mono text-[9px] font-700 tracking-widest" style={{ color: accent.hex }}>§</span>
        <span className="font-display text-[8px] font-700 uppercase tracking-[0.3em]" style={{ color: accent.hex, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: 0.85 }}>VERBETE</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent.hex, boxShadow: `0 0 6px ${accent.hex}` }} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col pl-9">
        {/* header */}
        <div className="px-4 pb-3 pt-4" style={{ borderBottom: "1px solid #16233a" }}>
          <h3 className="font-display text-[19px] font-700 uppercase tracking-[0.08em] leading-none text-ink">{entry.name}</h3>
          <div className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-faint">{entry.subtitle}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.tags.map((t) => <EntryTag key={t.label} {...t} />)}
          </div>
        </div>

        <div className="rup-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* description */}
          <section>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">01</span>
              <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">Descrição</span>
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
            </div>
            <p className="text-[12px] leading-relaxed text-ink-dim">{entry.body}</p>
          </section>

          {/* stats */}
          {entry.stats && entry.stats.length > 0 && (
            <section>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">02</span>
                <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">Estatísticas</span>
                <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {entry.stats.map((s) => (
                  <div key={s.label} className="flex items-center justify-between rounded-[2px] px-3 py-2" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                    <span className="font-display text-[9px] font-600 uppercase tracking-[0.1em] text-ink-faint">{s.label}</span>
                    <span className="font-mono text-[11px] font-700" style={{ color: accent.hex }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* mechanic */}
          {entry.mechanic && (
            <section>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">03</span>
                <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">{entry.mechanicTitle ?? "Mecânica"}</span>
                <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
              </div>
              <div className="rounded-[2px] px-3 py-3" style={{ border: `1px solid ${accent.hex}33`, background: accent.soft, borderLeftWidth: 2, borderLeftColor: accent.hex }}>
                <p className="text-[11.5px] leading-relaxed text-ink-dim">{entry.mechanic}</p>
              </div>
            </section>
          )}

          {/* see also */}
          {entry.seeAlso && entry.seeAlso.length > 0 && (
            <section>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">→</span>
                <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">Ver Também</span>
                <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entry.seeAlso.map((s) => (
                  <button key={s} className="rounded-[2px] px-2.5 py-1.5 font-display text-[10px] font-600 uppercase tracking-[0.1em] transition-colors" style={{ border: "1px solid #1c2b45", color: "#8496b4" }}>
                    {s}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                         */
/* ------------------------------------------------------------------ */

export default function Compendio() {
  const [activeCategory, setActiveCategory] = useState<string>("magias");
  const [selectedEntry, setSelectedEntry] = useState<string>("rajada-cinetica");
  const [search, setSearch] = useState("");

  const cat = CATEGORIES.find((c) => c.key === activeCategory) ?? CATEGORIES[0];

  const filtered = ENTRIES.filter(
    (e) =>
      e.category === activeCategory &&
      (search === "" || e.name.toLowerCase().includes(search.toLowerCase())),
  );

  const entry = filtered.find((e) => e.id === selectedEntry) ?? filtered[0];

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      {/* category sidebar */}
      <div className="flex w-[190px] shrink-0 flex-col overflow-hidden rounded-[2px]" style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: "1px solid #18263f" }}>
        <div className="px-4 pb-2.5 pt-3.5" style={{ borderBottom: "1px solid #16233a" }}>
          <div className="font-display text-[11px] font-700 uppercase tracking-[0.2em] text-ink">Compêndio</div>
          <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">Ruptura · Sistema v0.58</div>
        </div>
        <div className="flex-1 space-y-0.5 px-2 py-2">
          {CATEGORIES.map((c) => {
            const active = c.key === activeCategory;
            return (
              <button
                key={c.key}
                onClick={() => { setActiveCategory(c.key); setSelectedEntry(""); }}
                className="flex w-full items-center justify-between rounded-[2px] px-3 py-2.5 transition-colors"
                style={{
                  border: `1px solid ${active ? c.accent.hex + "66" : "transparent"}`,
                  background: active ? c.accent.soft : "transparent",
                }}
              >
                <span className="font-display text-[11px] font-600 uppercase tracking-[0.1em]" style={{ color: active ? c.accent.hex : "#8496b4" }}>{c.label}</span>
                <span className="font-mono text-[9px]" style={{ color: active ? c.accent.hex : "#4f6285" }}>{c.count}</span>
              </button>
            );
          })}
        </div>

        {/* bottom decoration */}
        <div className="px-4 py-3" style={{ borderTop: "1px solid #16233a" }}>
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">
            {CATEGORIES.reduce((a, c) => a + c.count, 0)} entradas no total
          </div>
        </div>
      </div>

      {/* entry list */}
      <div className="flex w-[220px] shrink-0 flex-col overflow-hidden rounded-[2px]" style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: "1px solid #18263f" }}>
        {/* search */}
        <div className="px-3 pt-3 pb-2" style={{ borderBottom: "1px solid #16233a" }}>
          <div className="flex items-center gap-2 rounded-[2px] px-3 py-1.5" style={{ background: "#0c1420", border: "1px solid #16233a" }}>
            <span className="font-mono text-[10px]" style={{ color: cat.accent.hex }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar ${cat.label.toLowerCase()}…`}
              className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="font-display text-[9px] font-600 uppercase tracking-[0.12em]" style={{ color: cat.accent.hex }}>{cat.label}</span>
            <span className="font-mono text-[8px] text-ink-faint">{filtered.length} entrada{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        <div className="rup-scroll flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">Nenhum resultado</div>
          ) : (
            filtered.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                selected={entry?.id === e.id}
                accent={cat.accent}
                onClick={() => setSelectedEntry(e.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* detail */}
      <div className="min-w-0 flex-1">
        {entry ? (
          <DetailPanel entry={entry} accent={cat.accent} />
        ) : (
          <div
            className="relative flex h-full flex-col items-center justify-center gap-3 rounded-[2px]"
            style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: "1px solid #18263f" }}
          >
            <Brackets color={cat.accent.hex} size={13} inset={8} />
            <div className="text-center">
              <div className="font-display text-[12px] font-600 uppercase tracking-[0.2em] text-ink">Selecione uma entrada</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">Escolha um verbete para ver detalhes</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
