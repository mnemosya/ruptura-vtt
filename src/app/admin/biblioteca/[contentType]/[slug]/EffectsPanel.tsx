import { getEfeitoTipoDefinition, type EfeitoCanonico } from "../../../../../lib/contentSchema";
import { formatarValor, MODO_AUTOMACAO_COR, MODO_AUTOMACAO_LABEL, MODO_AUTOMACAO_SIMBOLO } from "../../labels";

function EffectCard({ efeito }: { efeito: EfeitoCanonico }) {
  const definicao = getEfeitoTipoDefinition(efeito.tipo);
  const cor = MODO_AUTOMACAO_COR[efeito.modoAutomacao];

  const campos = Object.entries(efeito.payloadEspecifico).filter(([, v]) => v != null);

  return (
    <div style={{ border: "1px solid #2c2c36", borderRadius: 8, padding: "12px 14px", marginBottom: 10, background: "#181920" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <strong>{definicao.label}</strong>
        <span style={{ color: cor, fontSize: 13 }}>
          {MODO_AUTOMACAO_SIMBOLO[efeito.modoAutomacao]} {MODO_AUTOMACAO_LABEL[efeito.modoAutomacao]}
        </span>
      </div>
      {efeito.gatilho && <div style={{ fontSize: 13, color: "#a8a8b3" }}>Gatilho: {efeito.gatilho}</div>}
      {efeito.duracao && (
        <div style={{ fontSize: 13, color: "#a8a8b3" }}>
          Duração: {efeito.duracao.texto ?? `${efeito.duracao.valor ?? ""} ${efeito.duracao.unidade ?? efeito.duracao.tipo}`.trim()}
        </div>
      )}
      {campos.length > 0 && (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 2, marginTop: 8, fontSize: 13 }}>
          {campos.map(([chave, valor]) => (
            <div key={chave} style={{ display: "contents" }}>
              <dt style={{ color: "#7d7d8a" }}>{chave}</dt>
              <dd style={{ margin: 0 }}>{formatarValor(valor)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div style={{ fontSize: 12, color: "#7d7d8a", marginTop: 8, fontStyle: "italic" }}>{efeito.diagnostico}</div>
      {definicao.executor.modulo && <div style={{ fontSize: 12, color: "#5f6070", marginTop: 2 }}>Executor conhecido: {definicao.executor.modulo}</div>}
    </div>
  );
}

export function EffectsPanel({ efeitos }: { efeitos: EfeitoCanonico[] }) {
  if (efeitos.length === 0) {
    return <p style={{ color: "#7d7d8a", fontSize: 13 }}>Nenhum efeito canonicalizado para este conteúdo.</p>;
  }
  return (
    <div>
      {[...efeitos]
        .sort((a, b) => a.ordem - b.ordem)
        .map((efeito) => (
          <EffectCard key={efeito.id} efeito={efeito} />
        ))}
    </div>
  );
}
