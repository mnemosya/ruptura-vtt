import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import "../../mesas/[campaignId]/vtt/vtt.css";
import "../../mesas/[campaignId]/vtt/_painel/painel.css";
import "../../_design/console.css";
import { PreviewBando } from "./PreviewBando";
export default function Page() { assertDevRouteAllowed(); return <PreviewBando />; }
