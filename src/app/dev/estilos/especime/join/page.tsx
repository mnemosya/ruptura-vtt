/**
 * Telas de `/join/[token]` com dados fabricados, num documento só
 * delas — `auth.css` assume que é dona da página (fundo fixo, painel
 * centralizado), então a galeria as abre em `<iframe>` (família
 * "Convite"). `?tela=` escolhe qual.
 */

import { assertDevRouteAllowed } from "../../../../../lib/dev/guard";
import { TelaJoinConfirmar, TelaJoinLogin, TelaJoinMensagem } from "../../../../join/[token]/JoinTelas";
import "../../../../_design/auth.css";

export const dynamic = "force-dynamic";

const CAMPANHA = "Os Ecos de Vosek";

export default async function Page({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  assertDevRouteAllowed();
  const { tela } = await searchParams;
  switch (tela) {
    case "login":
      return <TelaJoinLogin token="demo" campanha={CAMPANHA} />;
    case "login-email":
      return <TelaJoinLogin token="demo" campanha={CAMPANHA} emailTravado="jogadora@exemplo.com" />;
    case "confirmar":
      return <TelaJoinConfirmar token="demo" campanha={CAMPANHA} email="jogadora@exemplo.com" demo />;
    case "erro":
      return <TelaJoinMensagem titulo="Erro ao abrir o convite" texto="Falha de rede ao consultar o convite." dica="Tente abrir o link de novo em instantes." />;
    default:
      return <TelaJoinMensagem titulo="Convite indisponível" texto="Este convite foi revogado." dica="Peça um novo link ao narrador da mesa." />;
  }
}
