/**
 * Recusa compartilhada por toda página exclusiva do narrador
 * (Conteúdo da campanha, Jogadores e convites, Configurações) quando
 * uma conta sem esse papel acessa a rota diretamente pela URL —
 * aditivo §5.3 "rotas administrativas não devem ser exibidas nem
 * acessíveis a jogadores". A checagem real já aconteceu antes de
 * renderizar isto (`requireNarratorAccess`); este componente é só a
 * mensagem.
 *
 * Renderiza DENTRO da casca da campanha (é o retorno de uma página, não
 * de um layout), então os tokens `rm-*` já resolvem aqui — sem
 * necessidade do `.rm-root` explícito que as telas de erro do
 * `layout.tsx` precisam ter.
 */
import Link from "next/link";

export function NarratorOnlyDenied({ campaignId }: { campaignId: string }) {
  return (
    <main className="rm-boundary" role="alert" data-testid="narrator-only-denied">
      <h1 className="rm-page-title">Área exclusiva do narrador</h1>
      <p className="rm-boundary-msg">Esta área só está disponível para quem narra esta campanha.</p>
      <div className="rm-boundary-acoes">
        <Link href={`/mesas/${campaignId}`} className="rm-btn rm-btn-primary rv-focusable">
          Ir para a Mesa
        </Link>
      </div>
    </main>
  );
}
