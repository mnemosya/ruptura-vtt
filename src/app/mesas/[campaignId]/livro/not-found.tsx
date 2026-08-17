import Link from "next/link";

export default function LivroNotFound() {
  return (
    <main className="rm-boundary">
      <h1 className="rm-page-title">Capítulo não encontrado</h1>
      <p className="rm-boundary-msg">Este capítulo não existe no Livro desta campanha, ou foi removido.</p>
      <div className="rm-boundary-acoes">
        <Link href="/mesas" className="rm-btn rm-btn-ghost rv-focusable">Minhas Campanhas</Link>
      </div>
    </main>
  );
}
