import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PreviewVanguarda } from "./PreviewVanguarda";
import "../../_design/console.css";

export const metadata = { title: "Vanguarda · Prévia Ruptura" };
export default function Page() {
  assertDevRouteAllowed();
  return <PreviewVanguarda />;
}
