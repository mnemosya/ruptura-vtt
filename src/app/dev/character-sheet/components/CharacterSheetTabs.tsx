export const TABS = ["geral", "atributos", "pericias", "recursos", "rolagens", "log", "mesa", "personagens", "debug"] as const;
export type TabId = (typeof TABS)[number];

export const TAB_LABELS: Record<TabId, string> = {
  geral: "Geral",
  atributos: "Atributos",
  pericias: "Perícias",
  recursos: "Recursos",
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
}: {
  activeTab: TabId;
  personagensCount: number;
  onChange: (tab: TabId) => void;
}) {
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
      {TABS.map((tab) => (
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
