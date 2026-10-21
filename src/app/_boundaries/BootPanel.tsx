import { CampaignBootVisual } from "./CampaignBootVisual";

/** Shared loading panel. Campaign routes use the holographic loading screen. */
export function BootPanel({
  label,
  continuacao = false,
  variante = "padrao",
}: {
  label: string;
  continuacao?: boolean;
  variante?: "padrao" | "campaign-terminal";
}) {
  if (variante === "campaign-terminal") {
    return <CampaignBootVisual label={label} />;
  }

  return (
    <div
      className="mo-boot-in"
      style={continuacao ? { animationDelay: "0ms", animationDuration: "0.01ms" } : undefined}
    >
      <div className="mo-boot" role="status">
        <span className="mo-boot-label">
          {label}
          <span className="mo-boot-caret" aria-hidden="true" />
        </span>
        <span className="mo-boot-bar" aria-hidden="true" />
      </div>
    </div>
  );
}
