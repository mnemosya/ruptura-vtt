import { diagnosticarEfeitoEditavel } from "../../../../../lib/contentSchema/effectDiagnostics";
import { formatarFormulaCura, formatarFormulaDano, type EfeitoEditavel } from "../../../../../lib/contentSchema/effectDraftTypes";
import { MODO_AUTOMACAO_COR, MODO_AUTOMACAO_SIMBOLO } from "../../labels";

const LABEL_TIPO: Record<EfeitoEditavel["tipo"], string> = {
  dano: "Dano",
  cura: "Cura",
  aplicar_condicao: "Aplicar condição",
  remover_condicao: "Remover condição",
  modificar_teste: "Modificar teste",
  alterar_recurso: "Alterar recurso",
};

function resumoEfeito(efeito: EfeitoEditavel): string {
  switch (efeito.tipo) {
    case "dano":
      return `${formatarFormulaDano(efeito.campos)} ${efeito.campos.tipoDano || "(sem tipo)"}`;
    case "cura":
      return `${formatarFormulaCura(efeito.campos)} ${efeito.campos.recurso.toUpperCase()}`;
    case "aplicar_condicao":
      return efeito.campos.condicaoSlug || "(sem condição)";
    case "remover_condicao":
      return efeito.campos.removerTodas ? "remove todas" : efeito.campos.condicaoSlug || (efeito.campos.selecaoManual ? "seleção manual" : "(sem condição)");
    case "modificar_teste":
      return `${efeito.campos.modo}${efeito.campos.valor != null ? ` ${efeito.campos.valor > 0 ? "+" : ""}${efeito.campos.valor}` : ""} — ${efeito.campos.pericia ?? (efeito.campos.tags.join(", ") || "(sem alvo de teste)")}`;
    case "alterar_recurso":
      return `${efeito.campos.operacao} ${efeito.campos.valorFixo ?? efeito.campos.formula ?? "?"} ${efeito.campos.recurso}`;
  }
}

/** Preview compacto dos efeitos editáveis, na mesma ordem persistida — usado no bloco "Preview" do rascunho. */
export function EffectsPreviewList({ efeitos }: { efeitos: EfeitoEditavel[] }) {
  if (efeitos.length === 0) return <p style={{ fontSize: 12, color: "#7d7d8a" }}>Nenhum efeito configurado.</p>;

  return (
    <ol style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 13 }}>
      {[...efeitos]
        .sort((a, b) => a.ordem - b.ordem)
        .map((efeito) => {
          const diagnostico = diagnosticarEfeitoEditavel(efeito);
          return (
            <li key={efeito.id} style={{ marginBottom: 4, opacity: efeito.habilitado ? 1 : 0.5 }}>
              <strong>{LABEL_TIPO[efeito.tipo]}</strong> — {resumoEfeito(efeito)}
              {efeito.gatilho ? ` · ${efeito.gatilho}` : ""}
              {efeito.alvo ? ` · ${efeito.alvo}` : ""}
              {" · "}
              <span style={{ color: MODO_AUTOMACAO_COR[diagnostico.modoAutomacao] }}>
                {MODO_AUTOMACAO_SIMBOLO[diagnostico.modoAutomacao]} {diagnostico.modoAutomacao}
              </span>
              {!efeito.habilitado && " · desabilitado"}
            </li>
          );
        })}
    </ol>
  );
}
