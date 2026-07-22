"use client";

/**
 * Vínculos editoriais (Etapa 11) — entidade da Biblioteca ↔ citação de
 * capítulo/seção/âncora do livro. IMPORTANTE (ver checkpoint): não existe
 * renderizador de Livro em código ainda (só markdown de origem em
 * docs/fontes/, explicitamente fora de runtime) — por isso não há um
 * link real de "Ver no livro" clicável aqui, só a citação estruturada
 * como texto. Implementar um link de fato exigiria construir um
 * renderizador de livro, fora do escopo desta etapa (documentado como
 * limitação formal, não fingido).
 */

import { useState } from "react";
import { criarVinculoEditorialAction, removerVinculoEditorialAction } from "../../../../../lib/contentSchema/bookLinkServerActions";
import type { ContentBookLinkRow, TipoVinculoEditorial } from "../../../../../lib/contentSchema/bookLinksQueries";

// Duplicado (não importado em runtime de bookLinksQueries.ts) de propósito: esse módulo
// também traz getScopedTableClient/next-headers no seu import de topo, o que quebraria o
// bundle de client component se importássemos o valor (só tipos são seguros de importar aqui).
const TIPOS_VINCULO_EDITORIAL: TipoVinculoEditorial[] = ["origem_editorial", "regra_principal", "referencia", "exemplo", "conteudo_relacionado"];

const TIPO_LABEL: Record<TipoVinculoEditorial, string> = {
  origem_editorial: "Origem editorial",
  regra_principal: "Regra principal",
  referencia: "Referência",
  exemplo: "Exemplo",
  conteudo_relacionado: "Conteúdo relacionado",
};

interface Props {
  documentId: string;
  vinculosIniciais: ContentBookLinkRow[];
  caminhoRevalidar: string;
}

export function VinculosEditoriaisPanel({ documentId, vinculosIniciais, caminhoRevalidar }: Props) {
  const [vinculos, setVinculos] = useState(vinculosIniciais);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [capitulo, setCapitulo] = useState("");
  const [secao, setSecao] = useState("");
  const [ancora, setAncora] = useState("");
  const [rotulo, setRotulo] = useState("");
  const [tipoVinculo, setTipoVinculo] = useState<TipoVinculoEditorial>("origem_editorial");
  const [principal, setPrincipal] = useState(vinculos.every((v) => !v.principal));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    setErro(null);
    if (!capitulo.trim()) {
      setErro("Capítulo é obrigatório.");
      return;
    }
    setSalvando(true);
    try {
      const resultado = await criarVinculoEditorialAction(
        { documentId, capitulo: capitulo.trim(), secao: secao.trim() || undefined, ancora: ancora.trim() || undefined, rotulo: rotulo.trim() || undefined, tipoVinculo, principal, ordem: vinculos.length },
        caminhoRevalidar,
      );
      if (!resultado.ok || !resultado.id) {
        setErro(resultado.erro ?? "Falha ao criar vínculo.");
        return;
      }
      setVinculos((atual) => [
        ...atual,
        { id: resultado.id as string, document_id: documentId, capitulo: capitulo.trim(), secao: secao.trim() || null, ancora: ancora.trim() || null, rotulo: rotulo.trim() || null, tipo_vinculo: tipoVinculo, principal, url_externa: null, ordem: atual.length, created_by: null, created_at: new Date().toISOString() },
      ]);
      setCapitulo("");
      setSecao("");
      setAncora("");
      setRotulo("");
      setPrincipal(false);
      setMostrarForm(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    setErro(null);
    setSalvando(true);
    try {
      const resultado = await removerVinculoEditorialAction(id, caminhoRevalidar);
      if (!resultado.ok) {
        setErro(resultado.erro ?? "Falha ao remover vínculo.");
        return;
      }
      setVinculos((atual) => atual.filter((v) => v.id !== id));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section style={{ border: "1px solid #26262e", borderRadius: 10, padding: 18, marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, marginTop: 0 }}>Vínculos editoriais (Livro)</h3>
      <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: -6, marginBottom: 12 }}>
        Citação estruturada de capítulo/seção/âncora — não existe renderizador de Livro em runtime ainda, então não há link clicável
        real; é um registro estrutural para preparar a integração futura.
      </p>

      {vinculos.length === 0 ? (
        <p style={{ fontSize: 13, color: "#a8a8b3" }}>Nenhum vínculo registrado.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#7d7d8a", borderBottom: "1px solid #26262e" }}>
              <th style={{ padding: "6px 8px" }}>Capítulo</th>
              <th style={{ padding: "6px 8px" }}>Seção</th>
              <th style={{ padding: "6px 8px" }}>Âncora</th>
              <th style={{ padding: "6px 8px" }}>Tipo</th>
              <th style={{ padding: "6px 8px" }}>Principal</th>
              <th style={{ padding: "6px 8px" }} />
            </tr>
          </thead>
          <tbody>
            {vinculos.map((v) => (
              <tr key={v.id} style={{ borderBottom: "1px solid #1c1c22" }}>
                <td style={{ padding: "6px 8px" }}>{v.capitulo}</td>
                <td style={{ padding: "6px 8px" }}>{v.secao ?? "—"}</td>
                <td style={{ padding: "6px 8px" }}>{v.ancora ?? "—"}</td>
                <td style={{ padding: "6px 8px" }}>{TIPO_LABEL[v.tipo_vinculo]}</td>
                <td style={{ padding: "6px 8px" }}>{v.principal ? "✓" : ""}</td>
                <td style={{ padding: "6px 8px" }}>
                  <button onClick={() => remover(v.id)} disabled={salvando} style={{ background: "none", border: "none", color: "#e08a8a", cursor: "pointer", fontSize: 12 }}>
                    remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {erro && <p style={{ fontSize: 12, color: "#e08a8a" }}>{erro}</p>}

      {mostrarForm ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
          <input value={capitulo} onChange={(e) => setCapitulo(e.target.value)} placeholder="Capítulo (obrigatório)" style={campoStyle} />
          <input value={secao} onChange={(e) => setSecao(e.target.value)} placeholder="Seção (opcional)" style={campoStyle} />
          <input value={ancora} onChange={(e) => setAncora(e.target.value)} placeholder="Âncora (opcional)" style={campoStyle} />
          <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Rótulo (opcional)" style={campoStyle} />
          <select value={tipoVinculo} onChange={(e) => setTipoVinculo(e.target.value as TipoVinculoEditorial)} style={campoStyle}>
            {TIPOS_VINCULO_EDITORIAL.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: "#a8a8b3", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} />
            Vínculo principal (no máximo 1 por documento)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={adicionar} disabled={salvando} style={{ background: "#2a5a3a", color: "#e4e4ea", border: "1px solid #3d7a4f", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
              Salvar vínculo
            </button>
            <button onClick={() => setMostrarForm(false)} style={{ background: "none", border: "1px solid #26262e", color: "#a8a8b3", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setMostrarForm(true)} style={{ fontSize: 13, color: "#8fd6a0", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          + adicionar vínculo
        </button>
      )}
    </section>
  );
}

const campoStyle: React.CSSProperties = { background: "#111116", color: "#e4e4ea", border: "1px solid #26262e", borderRadius: 6, padding: "6px 8px" };
