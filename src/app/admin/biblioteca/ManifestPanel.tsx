import { CONTENT_TYPE_REGISTRY, type DiagnosticoManifesto } from "../../../lib/contentSchema";

/** Painel de diagnóstico de divergência manifesto × dados reais — inclui o caso já conhecido (item: 119 vs 120), sem corrigi-lo. */
export function ManifestPanel({ diagnostico }: { diagnostico: DiagnosticoManifesto }) {
  const divergentes = diagnostico.divergencias.filter((d) => d.divergente);
  if (divergentes.length === 0 && diagnostico.contentTypesForaDoManifesto.length === 0) return null;

  return (
    <div style={{ border: "1px solid #5a4a24", background: "#241f14", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
      <strong style={{ color: "#e0c56b" }}>Diagnóstico: divergência manifesto × dados</strong>
      {divergentes.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {divergentes.map((d) => (
            <li key={d.manifestId}>
              {CONTENT_TYPE_REGISTRY[d.contentType].label} ({d.manifestId}): manifesto declara <strong>{d.contagemManifesto}</strong>, banco tem{" "}
              <strong>{d.contagemReal}</strong>.
            </li>
          ))}
        </ul>
      )}
      {diagnostico.contentTypesForaDoManifesto.length > 0 && (
        <p style={{ margin: "8px 0 0", color: "#a8a8b3" }}>
          Fora do manifesto: {diagnostico.contentTypesForaDoManifesto.map((ct) => CONTENT_TYPE_REGISTRY[ct].label).join(", ")}.
        </p>
      )}
    </div>
  );
}
