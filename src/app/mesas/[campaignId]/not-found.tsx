import Link from "next/link";

/**
 * `notFound()` disparado DENTRO da campanha (ex.: capítulo inexistente
 * no Livro). A campanha em si continua acessível — a casca segue
 * montada em volta —, então a saída natural é a Mesa desta campanha,
 * não o dashboard. Ver nota em `loading.tsx` sobre não reusar os
 * `Section*` globais.
 */
export default function CampaignNotFound() {
  return (
    <main className="rm-boundary">
      <h1 className="rm-page-title">Não encontrado</h1>
      <p className="rm-boundary-msg">
        Este conteúdo não existe nesta campanha, foi removido, ou você não tem acesso a ele.
      </p>
      <div className="rm-boundary-acoes">
        <Link href="/mesas" className="rm-btn rm-btn-ghost rv-focusable">Minhas Campanhas</Link>
      </div>
    </main>
  );
}
