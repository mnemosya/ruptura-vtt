import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PreviewAcoes } from "./PreviewAcoes";
import "../../_design/console.css";

export const metadata = { title: "Ações · Prévia Ruptura" };
export default function Page() {
  assertDevRouteAllowed();
  return <PreviewAcoes />;
}
