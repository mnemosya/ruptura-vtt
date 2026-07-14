import type { CampoDesconhecido, Referencia, ResultadoValidacao } from "../../../../../lib/contentSchema";
import { formatarValor } from "../../labels";

function ValidationList({ validacao }: { validacao: ResultadoValidacao }) {
  if (validacao.erros.length === 0 && validacao.avisos.length === 0 && validacao.infos.length === 0) {
    return <p style={{ fontSize: 13, color: "#7fd39a" }}>Sem erros, avisos ou informações — validação limpa.</p>;
  }
  return (
    <div style={{ fontSize: 13 }}>
      {validacao.erros.map((e, i) => (
        <div key={`erro-${i}`} style={{ color: "#e08a8a", marginBottom: 4 }}>
          ✕ {e}
        </div>
      ))}
      {validacao.avisos.map((a, i) => (
        <div key={`aviso-${i}`} style={{ color: "#e0c56b", marginBottom: 4 }}>
          ⚠ {a}
        </div>
      ))}
      {validacao.infos.map((info, i) => (
        <div key={`info-${i}`} style={{ color: "#8fb3e0", marginBottom: 4 }}>
          ℹ {info}
        </div>
      ))}
    </div>
  );
}

function ReferencesList({ referencias }: { referencias: Referencia[] }) {
  if (referencias.length === 0) return <p style={{ fontSize: 13, color: "#7d7d8a" }}>Nenhuma referência encontrada.</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
      {referencias.map((ref, i) => (
        <li key={i}>
          {ref.papel ? `${ref.papel}: ` : ""}
          {ref.tipoConteudo === "desconhecido" ? (
            <span style={{ color: "#a8a8b3" }}>
              {ref.slug} (tipo não resolvido)
            </span>
          ) : (
            <a href={`/admin/biblioteca/${ref.tipoConteudo}/${ref.slug}`} style={{ color: "#8fd6a0" }}>
              {ref.tipoConteudo}:{ref.slug}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function UnknownFieldsList({ campos }: { campos: CampoDesconhecido[] }) {
  if (campos.length === 0) return <p style={{ fontSize: 13, color: "#7d7d8a" }}>Nenhum campo desconhecido — payload totalmente mapeado.</p>;
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", color: "#a8a8b3" }}>
          <th style={{ padding: "4px 8px 4px 0" }}>Caminho</th>
          <th style={{ padding: "4px 8px 4px 0" }}>Valor</th>
          <th style={{ padding: "4px 8px 4px 0" }}>Motivo</th>
        </tr>
      </thead>
      <tbody>
        {campos.map((campo, i) => (
          <tr key={i} style={{ borderTop: "1px solid #26262e" }}>
            <td style={{ padding: "6px 8px 6px 0", fontFamily: "monospace", color: "#e0c56b" }}>{campo.caminho}</td>
            <td style={{ padding: "6px 8px 6px 0", maxWidth: 320, overflowWrap: "break-word" }}>{formatarValor(campo.valor)}</td>
            <td style={{ padding: "6px 8px 6px 0", color: "#7d7d8a" }}>{campo.motivo}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DiagnosticsPanel({
  validacao,
  referencias,
  camposDesconhecidos,
}: {
  validacao: ResultadoValidacao;
  referencias: Referencia[];
  camposDesconhecidos: CampoDesconhecido[];
}) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section>
        <h3 style={{ fontSize: 14, color: "#a8a8b3", marginBottom: 6 }}>Validação</h3>
        <ValidationList validacao={validacao} />
      </section>
      <section>
        <h3 style={{ fontSize: 14, color: "#a8a8b3", marginBottom: 6 }}>Referências encontradas</h3>
        <ReferencesList referencias={referencias} />
      </section>
      <section>
        <h3 style={{ fontSize: 14, color: "#a8a8b3", marginBottom: 6 }}>Campos desconhecidos / somente leitura</h3>
        <UnknownFieldsList campos={camposDesconhecidos} />
      </section>
    </div>
  );
}
