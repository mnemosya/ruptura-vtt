import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PreviewTecnico } from "./PreviewTecnico";
import "../../_design/console.css";

export const metadata = { title: "Técnico · Prévia Ruptura" };
export default function Page() {
  assertDevRouteAllowed();
  return <PreviewTecnico />;
}
