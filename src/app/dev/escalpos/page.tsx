import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PreviewEscalpos } from "./PreviewEscalpos";
import "../../_design/console.css";

export const metadata = { title: "Escalpos · Prévia Ruptura" };
export default function Page() {
  assertDevRouteAllowed();
  return <PreviewEscalpos />;
}
