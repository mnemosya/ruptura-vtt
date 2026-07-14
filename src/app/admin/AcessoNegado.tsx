export function AcessoNegado({ titulo, motivo, mostrarLinkLogin }: { titulo: string; motivo: string; mostrarLinkLogin?: boolean }) {
  return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>{titulo}</h1>
      <p style={{ color: "#a8a8b3", lineHeight: 1.6 }}>{motivo}</p>
      {mostrarLinkLogin ? (
        <p style={{ marginTop: 20 }}>
          <a href="/login" style={{ color: "#8fd6a0" }}>
            Ir para o login
          </a>
        </p>
      ) : null}
    </div>
  );
}
