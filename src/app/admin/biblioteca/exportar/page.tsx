import { CONTENT_TYPE_REGISTRY } from "../../../../lib/contentSchema";
import { ExportarClient } from "./ExportarClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ contentType?: string; slug?: string }>;
}

export default async function ExportarPage({ searchParams }: PageProps) {
  const tipos = Object.entries(CONTENT_TYPE_REGISTRY).map(([id, def]) => ({ id, label: def.label }));
  const { contentType, slug } = await searchParams;
  const inicial = contentType && slug ? { contentType, slug } : undefined;

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <a href="/admin/biblioteca" style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar para a lista
        </a>
      </p>
      <h2 style={{ fontSize: 22, marginBottom: 6 }}>Exportar conteúdo</h2>
      <p style={{ fontSize: 13, color: "#a8a8b3", marginBottom: 20 }}>
        Gera um pacote JSON versionado (<code>ruptura-content-package</code>) com o conteúdo PUBLICADO selecionado. Nunca exporta a
        Biblioteca inteira num único clique — a seleção é sempre explícita.
      </p>
      <ExportarClient tipos={tipos} inicial={inicial} />
    </div>
  );
}
