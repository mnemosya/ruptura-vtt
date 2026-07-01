"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCampaign } from "../../lib/table/storage";
import { signOut } from "../../lib/auth/actions";
import type { Campaign } from "../../lib/table";

const buttonStyle: React.CSSProperties = {
  background: "#1d1e24",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "8px 10px",
  fontSize: 13,
};

interface Props {
  userEmail: string;
  mesasIniciais: Campaign[];
  errorInicial: string | null;
}

export default function MesasDashboardClient({ userEmail, mesasIniciais, errorInicial }: Props) {
  const router = useRouter();
  const [mesas, setMesas] = useState<Campaign[]>(mesasIniciais);
  const [novoNome, setNovoNome] = useState("");
  const [error, setError] = useState<string | null>(errorInicial);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!novoNome.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const mesa = await createCampaign(novoNome);
      setNovoNome("");
      setMesas((prev) => [mesa, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar mesa.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22 }}>Minhas mesas</h1>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {userEmail} · <button onClick={handleLogout} style={{ ...buttonStyle, padding: "4px 10px" }}>Sair</button>
        </div>
      </div>

      {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {error}</p>}

      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            data-testid="dash-nova-mesa"
            type="text"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome da nova mesa"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button data-testid="dash-criar-mesa" onClick={handleCreate} disabled={busy || !novoNome.trim()} style={buttonStyle}>
            {busy ? "…" : "Criar mesa"}
          </button>
        </div>
      </section>

      {mesas.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Você ainda não tem mesas. Crie a primeira acima.</p>
      )}
      <div data-testid="dash-mesas-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {mesas.map((mesa) => (
          <div
            key={mesa.id}
            data-testid="dash-mesa-item"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background: "#1d1e24",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{mesa.name}</div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>{mesa.id}</div>
            </div>
            <Link href={`/mesas/${mesa.id}`} data-testid={`dash-abrir-${mesa.id}`} style={{ ...buttonStyle, textDecoration: "none" }}>
              Abrir
            </Link>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, opacity: 0.6 }}>
        Console de diagnóstico dev: <Link href="/dev/table" style={{ color: "#5ec8ff" }}>/dev/table</Link>
      </p>
    </main>
  );
}
