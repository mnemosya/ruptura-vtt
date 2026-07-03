export const TABS = ["geral", "atributos", "pericias", "recursos", "condicoes", "talentos", "acoes", "rolagens", "log", "mesa", "personagens", "debug"] as const;
export type TabId = (typeof TABS)[number];

export const TAB_LABELS: Record<TabId, string> = {
  geral: "Geral",
  atributos: "Atributos",
  pericias: "Perícias",
  recursos: "Recursos",
  condicoes: "Condições",
  talentos: "Talentos",
  acoes: "Ações",
  rolagens: "Rolagens",
  log: "Log",
  mesa: "Mesa",
  personagens: "Personagens salvos",
  debug: "Debug",
};

export function CharacterSheetTabs({
  activeTab,
  personagensCount,
  onChange,
  hiddenTabs,
}: {
  activeTab: TabId;
  personagensCount: number;
  onChange: (tab: TabId) => void;
  /** Abas a esconder (ex.: "personagens"/"debug" na rota de produto /ficha, checkpoint v0.24). */
  hiddenTabs?: readonly TabId[];
}) {
  const visibleTabs = hiddenTabs ? TABS.filter((tab) => !hiddenTabs.includes(tab)) : TABS;
  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 24,
        borderBottom: "1px solid #333",
        flexWrap: "wrap",
      }}
    >
      {visibleTabs.map((tab) => (
        <button
          key={tab}
          data-testid={`tab-${tab}`}
          onClick={() => onChange(tab)}
          style={{
            background: "transparent",
            color: activeTab === tab ? "inherit" : "#888",
            border: "none",
            borderBottom: activeTab === tab ? "2px solid #4caf50" : "2px solid transparent",
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: activeTab === tab ? 700 : 400,
            cursor: "pointer",
          }}
        >
          {TAB_LABELS[tab]}
          {tab === "personagens" ? ` (${personagensCount})` : ""}
        </button>
      ))}
    </nav>
  );
}
