import { NovoConteudoForm } from "./NovoConteudoForm";

export const dynamic = "force-dynamic";

export default function NovoConteudoPage() {
  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <a href="/admin/biblioteca/rascunhos" style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar para rascunhos
        </a>
      </p>
      <h2 style={{ fontSize: 22, marginBottom: 16 }}>Adicionar conteúdo</h2>
      <NovoConteudoForm />
    </div>
  );
}
