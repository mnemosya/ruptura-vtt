import { diagnosticarEfeitoEditavel } from "../../../../../lib/contentSchema/effectDiagnostics";
import { formatarFormulaCura, formatarFormulaDano, type EfeitoEditavel } from "../../../../../lib/contentSchema/effectDraftTypes";
import { MODO_AUTOMACAO_COR, MODO_AUTOMACAO_SIMBOLO } from "../../labels";
import { LABEL_TIPO } from "./EffectsEditorSection";

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
    case "modificar_margem":
      return `${efeito.campos.operacao} ${efeito.campos.faixaOrigem ?? "?"} → ${efeito.campos.faixaDestino ?? "?"} (${efeito.campos.pericias.join(", ") || "sem perícia"})`;
    case "alterar_dano_recebido":
      return `${efeito.campos.operacao} ${efeito.campos.valorFixo ?? efeito.campos.multiplicador ?? "?"} · ${efeito.campos.momento}`;
    case "teste_resistencia":
      return `${efeito.campos.modo} (${efeito.campos.pericia ?? efeito.campos.atributo ?? "?"}) — ${efeito.campos.resultados.length} resultado(s)`;
    case "efeito_temporario": {
      const d = efeito.campos.duracao;
      const duracaoTexto = d.tipo === "rounds" ? `${d.rodadas ?? 1} rodada(s)` : d.tipo === "scene" ? "cena" : d.tipo === "rest" ? "descanso longo" : "manual";
      return `${efeito.campos.modificadores.length} modificador(es) · ${duracaoTexto}${efeito.campos.acumulavel ? ` · até ${efeito.campos.maximoPilhas ?? "?"} pilha(s)` : ""}`;
    }
    case "acao_reacao_adicional":
      return `${efeito.campos.tipo} adicional × ${efeito.campos.quantidade}${efeito.campos.gratuito ? " · gratuito" : ""}`;
    case "modificar_instancia":
      return `${efeito.campos.operacao}${efeito.campos.valor != null ? ` ${efeito.campos.valor}` : ""}`;
    case "conceder_item":
      return `${efeito.campos.itemSlug || "(sem item)"} × ${efeito.campos.quantidade} → ${efeito.campos.destino}`;
    case "consumir_item":
      return `${efeito.campos.itemSlug || "(própria instância)"} × ${efeito.campos.quantidade} (${efeito.campos.comportamentoPilha})`;
    case "alterar_preco":
      return `${efeito.campos.operacao}${efeito.campos.percentual != null ? ` ${efeito.campos.percentual}%` : ""}`;
    case "alterar_disponibilidade":
      return `${efeito.campos.operacao}${efeito.campos.quantidade != null ? ` (${efeito.campos.quantidade})` : ""}`;
  }
}

/** Preview compacto dos efeitos editáveis, na mesma ordem persistida — usado no bloco "Preview" do rascunho. */
export function EffectsPreviewList({ efeitos }: { efeitos: EfeitoEditavel[] }) {
  if (efeitos.length === 0) return <p style={{ fontSize: 12, color: "#7d7d8a" }}>Nenhum efeito configurado.</p>;

  return (
    <ol data-testid="efeitos-preview-lista" style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 13 }}>
      {[...efeitos]
        .sort((a, b) => a.ordem - b.ordem)
        .map((efeito) => {
          const diagnostico = diagnosticarEfeitoEditavel(efeito);
          return (
            <li key={efeito.id} data-testid="efeito-preview-item" data-effect-id={efeito.id} style={{ marginBottom: 4, opacity: efeito.habilitado ? 1 : 0.5 }}>
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
