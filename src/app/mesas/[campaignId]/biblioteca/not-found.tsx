import Link from "next/link";

export default function BibliotecaNotFound() {
  return (
    <main className="rm-boundary">
      <h1 className="rm-page-title">Conteúdo não encontrado</h1>
      <p className="rm-boundary-msg">Este documento ou rascunho não existe nesta campanha, ou foi removido.</p>
      <div className="rm-boundary-acoes">
        <Link href="/mesas" className="rm-btn rm-btn-ghost rv-focusable">Minhas Campanhas</Link>
      </div>
    </main>
  );
}
