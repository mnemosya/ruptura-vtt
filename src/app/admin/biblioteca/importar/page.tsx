import { ImportarClient } from "./ImportarClient";

export const dynamic = "force-dynamic";

export default function ImportarPage() {
  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <a href="/admin/biblioteca" style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar para a lista
        </a>
      </p>
      <h2 style={{ fontSize: 22, marginBottom: 6 }}>Importar conteúdo</h2>
      <p style={{ fontSize: 13, color: "#a8a8b3", marginBottom: 20 }}>
        Cria rascunhos a partir de um pacote JSON exportado. Esta ação <strong>nunca publica</strong> — o conteúdo só entra na Biblioteca
        pública depois de revisado e publicado no fluxo normal de rascunhos.
      </p>
      <ImportarClient />
      <p style={{ marginTop: 24, fontSize: 13 }}>
        <a href="/admin/biblioteca/importacoes" style={{ color: "#8fd6a0" }}>
          Ver histórico de importações →
        </a>
      </p>
    </div>
  );
}
