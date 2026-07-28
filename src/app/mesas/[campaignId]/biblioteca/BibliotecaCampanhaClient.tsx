"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftContentType } from "../../../../lib/contentSchema";
import type { CampaignContentDraftRow, ConteudoEfetivo } from "../../../../lib/campaignContent";
import {
  arquivarHomebrewCampanha,
  criarRascunhoCopiaHomebrew,
  criarRascunhoHomebrewNovo,
  criarRascunhoOverride,
  excluirRascunhoCampanha,
  previewImpactoRemocao,
  removerOverrideCampanha,
} from "../../../../lib/campaignContent/campaignContentServerActions";

const IMPACTO_LABEL: Record<string, string> = {
  sem_impacto_detectado: "Sem impacto detectado",
  impacto_informativo: "Impacto informativo — possíveis referências detectadas",
  remocao_bloqueada: "Remoção bloqueada — referência obrigatória ativa",
  impacto_nao_determinavel: "Impacto não determinável — não foi possível varrer todas as fontes",
};

const ORIGEM_LABEL: Record<ConteudoEfetivo["origem"], string> = {
  oficial: "Oficial",
  modificado_pela_mesa: "Modificado pela mesa",
  homebrew_da_mesa: "Homebrew da mesa",
};
const ORIGEM_COR: Record<ConteudoEfetivo["origem"], string> = {
  oficial: "#a8a8b3",
  modificado_pela_mesa: "#e0c56b",
  homebrew_da_mesa: "#7fd39a",
};
const ATUALIZACAO_LABEL: Record<NonNullable<ConteudoEfetivo["estadoAtualizacao"]>, string> = {
  atualizado: "Atualizado",
  oficial_alterado: "Oficial alterado — revisão pendente",
  oficial_arquivado: "Oficial arquivado",
  base_ausente: "Base ausente",
};

interface Props {
  campaignId: string;
  tipos: { id: DraftContentType; label: string }[];
  efetivos: ConteudoEfetivo[];
  rascunhos: CampaignContentDraftRow[];
}

export function BibliotecaCampanhaClient({ campaignId, tipos, efetivos, rascunhos }: Props) {
  const router = useRouter();
  const [filtroTipo, setFiltroTipo] = useState<DraftContentType | "todos">("todos");
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoTipo, setNovoTipo] = useState<DraftContentType>("spell");
  const [novoNome, setNovoNome] = useState("");
  const [mostrarNovo, setMostrarNovo] = useState(false);

  const lista = filtroTipo === "todos" ? efetivos : efetivos.filter((e) => e.contentType === filtroTipo);

  async function rodar(chave: string, acao: () => Promise<{ ok: boolean; erro?: string; draftId?: string }>) {
    setErro(null);
    setCarregando(chave);
    try {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.erro ?? "Falha na operação.");
        return;
      }
      if (resultado.draftId) router.push(`/mesas/${campaignId}/biblioteca/rascunho/${resultado.draftId}`);
      else router.refresh();
    } finally {
      setCarregando(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as DraftContentType | "todos")} style={selectStyle}>
          <option value="todos">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button onClick={() => setMostrarNovo((v) => !v)} style={primaryButtonStyle}>+ Novo conteúdo da campanha</button>
      </div>

      {mostrarNovo && (
        <div style={{ border: "1px solid #26262e", borderRadius: 8, padding: 14, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as DraftContentType)} style={selectStyle}>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome" style={inputStyle} />
          <button
            disabled={carregando !== null || !novoNome.trim()}
            onClick={() => rodar("novo", () => criarRascunhoHomebrewNovo(campaignId, novoTipo, novoNome))}
            style={primaryButtonStyle}
          >
            Criar rascunho
          </button>
        </div>
      )}

      {erro && <p style={{ color: "#e08a8a", fontSize: 13 }}>{erro}</p>}

      {rascunhos.length > 0 && (
        <div style={{ marginBottom: 20, border: "1px solid #26262e", borderRadius: 8, padding: 14 }}>
          <h3 style={{ fontSize: 14, marginTop: 0 }}>Rascunhos abertos ({rascunhos.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {rascunhos.map((d) => (
              <li key={d.id} style={{ marginBottom: 4 }}>
                <a href={`/mesas/${campaignId}/biblioteca/rascunho/${d.id}`} style={{ color: "#5ec8ff" }}>
                  {d.content_type}:{d.slug} — {d.operation}
                </a>{" "}
                <button
                  disabled={carregando !== null}
                  onClick={() => rodar(`excluir-${d.id}`, () => excluirRascunhoCampanha(d.id))}
                  style={{ background: "none", border: "none", color: "#e08a8a", cursor: "pointer", fontSize: 12 }}
                >
                  excluir
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#7d7d8a", borderBottom: "1px solid #26262e" }}>
            <th style={{ padding: "6px 8px" }}>Tipo</th>
            <th style={{ padding: "6px 8px" }}>Nome</th>
            <th style={{ padding: "6px 8px" }}>Origem</th>
            <th style={{ padding: "6px 8px" }}>Atualização</th>
            <th style={{ padding: "6px 8px" }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((e) => {
            const chave = `${e.contentType}:${e.slug}`;
            return (
              <tr key={chave} style={{ borderBottom: "1px solid #1c1c22" }}>
                <td style={{ padding: "6px 8px" }}>{e.contentType}</td>
                <td style={{ padding: "6px 8px" }}>{e.nome ?? e.slug}</td>
                <td style={{ padding: "6px 8px", color: ORIGEM_COR[e.origem] }}>{ORIGEM_LABEL[e.origem]}</td>
                <td style={{ padding: "6px 8px" }}>{e.estadoAtualizacao ? ATUALIZACAO_LABEL[e.estadoAtualizacao] : "—"}</td>
                <td style={{ padding: "6px 8px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {e.origem === "oficial" && (
                    <>
                      <button disabled={carregando !== null} onClick={() => rodar(chave, () => criarRascunhoOverride(campaignId, e.contentType as DraftContentType, e.slug))} style={linkButtonStyle}>
                        Criar override
                      </button>
                      <button
                        disabled={carregando !== null}
                        onClick={() => {
                          const novoSlug = prompt("Slug local para a cópia homebrew:", `${e.slug}_mesa`);
                          const novoNomeCopia = prompt("Nome da cópia:", e.nome ?? e.slug);
                          if (novoSlug && novoNomeCopia) rodar(chave, () => criarRascunhoCopiaHomebrew(campaignId, e.contentType as DraftContentType, e.slug, novoSlug, novoNomeCopia));
                        }}
                        style={linkButtonStyle}
                      >
                        Criar cópia homebrew
                      </button>
                    </>
                  )}
                  {e.origem === "modificado_pela_mesa" && e.campaignContentDocumentId && (
                    <>
                      {e.estadoAtualizacao && e.estadoAtualizacao !== "atualizado" && (
                        <a href={`/mesas/${campaignId}/biblioteca/comparar/${e.campaignContentDocumentId}`} style={linkButtonStyle}>
                          Comparar com oficial
                        </a>
                      )}
                      <button
                        disabled={carregando !== null}
                        onClick={() => {
                          const motivo = prompt("Motivo da remoção do override (restaura o oficial):", "") ?? "";
                          rodar(chave, () => removerOverrideCampanha(e.campaignContentDocumentId!, e.localVersion ?? 1, motivo));
                        }}
                        style={dangerButtonStyle}
                      >
                        Remover override
                      </button>
                    </>
                  )}
                  {e.origem === "homebrew_da_mesa" && e.campaignContentDocumentId && (
                    <button
                      disabled={carregando !== null}
                      onClick={async () => {
                        setCarregando(chave);
                        const preview = await previewImpactoRemocao(e.campaignContentDocumentId!);
                        setCarregando(null);
                        const diagnostico = preview.diagnostico;
                        const rotulo = diagnostico ? (IMPACTO_LABEL[diagnostico.classificacao] ?? diagnostico.classificacao) : "diagnóstico indisponível";
                        const detalhes = diagnostico && diagnostico.motivos.length > 0 ? `\n\n${diagnostico.motivos.join("\n")}` : "";
                        if (diagnostico?.classificacao === "remocao_bloqueada") {
                          alert(`${rotulo}${detalhes}\n\nArquivamento bloqueado — resolva as referências antes.`);
                          return;
                        }
                        if (!confirm(`Diagnóstico de impacto: ${rotulo}${detalhes}\n\nConfirmar arquivamento?`)) return;
                        const motivo = prompt("Motivo do arquivamento:", "") ?? "";
                        rodar(chave, () => arquivarHomebrewCampanha(e.campaignContentDocumentId!, e.localVersion ?? 1, motivo));
                      }}
                      style={dangerButtonStyle}
                    >
                      Arquivar
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const selectStyle: React.CSSProperties = { background: "#111116", color: "#e4e4ea", border: "1px solid #26262e", borderRadius: 6, padding: "6px 8px" };
const inputStyle: React.CSSProperties = { background: "#111116", color: "#e4e4ea", border: "1px solid #26262e", borderRadius: 6, padding: "6px 8px", flex: 1 };
const primaryButtonStyle: React.CSSProperties = { background: "#2a5a3a", color: "#e4e4ea", border: "1px solid #3d7a4f", borderRadius: 6, padding: "6px 12px", cursor: "pointer" };
const linkButtonStyle: React.CSSProperties = { background: "none", border: "1px solid #26262e", color: "#5ec8ff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 };
const dangerButtonStyle: React.CSSProperties = { background: "none", border: "1px solid #5c2626", color: "#e08a8a", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 };
