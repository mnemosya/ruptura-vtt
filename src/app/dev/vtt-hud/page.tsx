import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { VttHudVisualHarness } from "./VttHudVisualHarness";
import "../../mesas/[campaignId]/vtt/vtt.css";
import "../../_design/console.css";
import "./visual-harness.css";

export const dynamic = "force-dynamic";

export default function VttHudVisualPage() {
  assertDevRouteAllowed();
  return <VttHudVisualHarness />;
}
