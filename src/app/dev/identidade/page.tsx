import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PreviewIdentidade } from "./PreviewIdentidade";
import "../../_design/console.css";
export default function Page() { assertDevRouteAllowed(); return <PreviewIdentidade />; }
