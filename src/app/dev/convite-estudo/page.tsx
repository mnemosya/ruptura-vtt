/** ESTUDO da confirmação do convite. Só visual; a tela real é /join/[token]. */

import { ConviteEstudo } from "../_login-estudos/ConviteEstudo";
import { assertDevRouteAllowed } from "../../../lib/dev/guard";

export default function Page() {
  assertDevRouteAllowed();
  return <ConviteEstudo />;
}
