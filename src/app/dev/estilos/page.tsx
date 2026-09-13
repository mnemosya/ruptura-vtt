import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { GaleriaEstilos } from "./GaleriaEstilos";
import "../../mesas/[campaignId]/vtt/vtt.css";
// Os cards do feed são desenhados por `painel.css` — sem ela a estante
// de cards sai crua (sem espinha, sem clip de canto, sem padding).
import "../../mesas/[campaignId]/vtt/_painel/painel.css";
// O HUD do token entra reaproveitando o harness de `/dev/vtt-hud`, que
// traz a própria folha de estilo do palco de mentira dele.
import "../../_design/console.css";
// NÃO importar mesa.css / app.css / auth.css aqui. Cada uma dessas
// folhas assume que é DONA do documento — `.rv-seg-btn` é `flex: 1`,
// `.auth-submit-btn` é `width: 100%`, e auth.css ainda ancora
// decorações em `position: fixed`. Importadas juntas, elas se
// atropelaram e a galeria inteira desmontou. A família "Repetidos"
// isola cada sistema num iframe próprio (`especime/*`), que é a única
// forma honesta de pôr quatro sistemas de design na mesma tela.
import "./galeria.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Estilos · Ruptura VTT" };

/**
 * `?campaignId=<uuid>` — mesma convenção de `/dev/vtt`.
 *
 * A maior parte da galeria não precisa dele: as peças montam com estado
 * fabricado. As poucas que são SUPERFÍCIE DE INTEGRAÇÃO (as janelas
 * internas e a mesa inteira) leem autorização do servidor, e sem uma
 * campanha real caíam em "Você não tem acesso a esta campanha" — uma
 * falha de autorização exibida como se fosse um estado de design, que é
 * o pior tipo de exemplo: parece uma tela e não é.
 *
 * Com o parâmetro elas mostram dados de verdade; sem ele, dizem o que
 * falta e como passar.
 */
export default async function EstilosPage({ searchParams }: { searchParams: Promise<{ campaignId?: string }> }) {
  assertDevRouteAllowed();
  const { campaignId } = await searchParams;
  return <GaleriaEstilos campaignId={campaignId ?? null} />;
}
