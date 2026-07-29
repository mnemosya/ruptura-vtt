/**
 * Recusa compartilhada por toda página exclusiva do narrador
 * (Jogadores e convites, Configurações) quando uma conta sem esse
 * papel acessa a rota diretamente pela URL — aditivo §5.3 "rotas
 * administrativas não devem ser exibidas nem acessíveis a jogadores".
 * A checagem real já aconteceu antes de renderizar isto
 * (`requireNarratorAccess`); este componente é só a mensagem.
 */
import Link from "next/link";
import { text } from "./theme";

export function NarratorOnlyDenied({ campaignId }: { campaignId: string }) {
  return (
    <main style={{ maxWidth: 480, margin: "60px auto", padding: "0 20px", textAlign: "center" }} role="alert">
      <h1 style={{ ...text.h1, marginBottom: 12 }}>Área exclusiva do narrador</h1>
      <p style={{ ...text.muted, marginBottom: 20 }}>
        Esta área só está disponível para quem narra esta campanha.
      </p>
      <Link href={`/mesas/${campaignId}`} style={{ color: "#5ec8ff", fontSize: 13 }}>← Voltar à mesa</Link>
    </main>
  );
}
