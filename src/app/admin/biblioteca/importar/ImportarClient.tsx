"use client";

import { useState } from "react";
import type { ContentPackage } from "../../../../lib/contentSchema";
import { confirmarImportacao, gerarPreviewImportacao, validarPacoteBruto, type DecisaoImportacao } from "../../../../lib/contentSchema/packageImport";
import type { ClassificacaoDocumentoImportado, PreviewDocumentoImportado } from "../../../../lib/contentSchema/importPreview";

const CLASSIFICACAO_LABEL: Record<ClassificacaoDocumentoImportado, string> = {
  novo: "Novo",
  identico: "Idêntico ao publicado",
  atualizacao: "Atualização de conteúdo publicado",
  conflito_com_publicado: "Conflito — publicado mudou desde a exportação",
  conflito_com_rascunho: "Conflito — já existe rascunho",
  referencia_ausente: "Referência obrigatória ausente",
  schema_invalido: "Inválido contra o schema oficial",
  tipo_nao_editavel: "Tipo ainda não editável (inspeção apenas)",
  versao_nao_suportada: "Versão de formato não suportada",
  incompativel: "Incompatível / corrompido",
  bloqueado: "Bloqueado",
};

const CLASSIFICACAO_COR: Record<ClassificacaoDocumentoImportado, string> = {
  novo: "#7fd39a",
  identico: "#a8a8b3",
  atualizacao: "#e0c56b",
  conflito_com_publicado: "#e0a06b",
  conflito_com_rascunho: "#e0a06b",
  referencia_ausente: "#e08a8a",
  schema_invalido: "#e08a8a",
  tipo_nao_editavel: "#8fb3e0",
  versao_nao_suportada: "#e08a8a",
  incompativel: "#e08a8a",
  bloqueado: "#e08a8a",
};

const LIMITE_TAMANHO_ARQUIVO_BYTES = 5 * 1024 * 1024;

export function ImportarClient() {
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [pacote, setPacote] = useState<ContentPackage | null>(null);
  const [previews, setPreviews] = useState<PreviewDocumentoImportado[] | null>(null);
  const [avisosManifest, setAvisosManifest] = useState<string[]>([]);
  const [decisoes, setDecisoes] = useState<Record<string, DecisaoImportacao>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{ sessionId: string; draftIds: string[] } | null>(null);

  async function onArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro(null);
    setResultado(null);
    setPreviews(null);
    setPacote(null);
    setNomeArquivo(arquivo.name);

    if (!arquivo.name.toLowerCase().endsWith(".json")) {
      setErro("Só arquivos .json são aceitos.");
      return;
    }
    if (arquivo.size > LIMITE_TAMANHO_ARQUIVO_BYTES) {
      setErro(`Arquivo excede o limite de ${LIMITE_TAMANHO_ARQUIVO_BYTES / (1024 * 1024)} MB.`);
      return;
    }

    setCarregando(true);
    try {
      const texto = await arquivo.text();
      let raw: unknown;
      try {
        raw = JSON.parse(texto);
      } catch {
        setErro("O arquivo não é um JSON válido.");
        return;
      }

      const validacao = await validarPacoteBruto(raw, arquivo.size);
      if (!validacao.ok) {
        setErro(validacao.erros.map((er) => `${er.caminho}: ${er.mensagem}`).join(" | "));
        return;
      }
      setPacote(validacao.pacote);

      const preview = await gerarPreviewImportacao(validacao.pacote);
      if (!preview.ok || !preview.previews) {
        setErro(preview.erro ?? "Falha ao gerar preview.");
        return;
      }
      setPreviews(preview.previews);
      setAvisosManifest(preview.avisosManifest ?? []);
      const decisoesIniciais: Record<string, DecisaoImportacao> = {};
      for (const p of preview.previews) {
        decisoesIniciais[`${p.contentType}:${p.slug}`] = p.podeConfirmar ? "confirmar" : "ignorar";
      }
      setDecisoes(decisoesIniciais);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido ao processar o arquivo.");
    } finally {
      setCarregando(false);
    }
  }

  function alternarDecisao(chave: string, podeConfirmar: boolean) {
    if (!podeConfirmar) return;
    setDecisoes((atual) => ({ ...atual, [chave]: atual[chave] === "confirmar" ? "ignorar" : "confirmar" }));
  }

  async function confirmar() {
    if (!pacote || !nomeArquivo) return;
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await confirmarImportacao(pacote, decisoes, nomeArquivo);
      if (!resposta.ok || !resposta.sessionId) {
        setErro(resposta.erro ?? "Falha ao confirmar importação.");
        return;
      }
      setResultado({ sessionId: resposta.sessionId, draftIds: resposta.draftIds ?? [] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setCarregando(false);
    }
  }

  const algumaConfirmacao = Object.values(decisoes).some((d) => d === "confirmar");

  return (
    <div>
      <div style={{ border: "1px solid #26262e", borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "#a8a8b3", display: "block", marginBottom: 8 }}>Selecione o arquivo .json exportado</label>
        <input type="file" accept="application/json,.json" onChange={onArquivoSelecionado} disabled={carregando} />
      </div>

      {erro && (
        <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, background: "#2a1818", border: "1px solid #5c2626", fontSize: 13, color: "#e08a8a" }}>{erro}</div>
      )}

      {avisosManifest.length > 0 && (
        <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, background: "#2a2818", border: "1px solid #5c5426", fontSize: 13, color: "#e0c56b" }}>
          <strong>Avisos do pacote:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {avisosManifest.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {previews && previews.length > 0 && !resultado && (
        <div style={{ border: "1px solid #26262e", borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>
            Preview — {previews.length} documento(s)
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#7d7d8a", borderBottom: "1px solid #26262e" }}>
                <th style={{ padding: "6px 8px" }}>Tipo</th>
                <th style={{ padding: "6px 8px" }}>Slug</th>
                <th style={{ padding: "6px 8px" }}>Classificação</th>
                <th style={{ padding: "6px 8px" }}>Detalhe</th>
                <th style={{ padding: "6px 8px" }}>Decisão</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((p) => {
                const chave = `${p.contentType}:${p.slug}`;
                const decisao = decisoes[chave] ?? "ignorar";
                return (
                  <tr key={chave} style={{ borderBottom: "1px solid #1c1c22" }}>
                    <td style={{ padding: "6px 8px" }}>{p.contentType}</td>
                    <td style={{ padding: "6px 8px" }}>{p.slug}</td>
                    <td style={{ padding: "6px 8px", color: CLASSIFICACAO_COR[p.classificacao] }}>{CLASSIFICACAO_LABEL[p.classificacao]}</td>
                    <td style={{ padding: "6px 8px", color: "#a8a8b3", maxWidth: 360 }}>{p.motivo}</td>
                    <td style={{ padding: "6px 8px" }}>
                      {p.podeConfirmar ? (
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input type="checkbox" checked={decisao === "confirmar"} onChange={() => alternarDecisao(chave, true)} />
                          {decisao === "confirmar" ? "Criar rascunho" : "Ignorar"}
                        </label>
                      ) : (
                        <span style={{ color: "#7d7d8a" }}>não disponível</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            onClick={confirmar}
            disabled={carregando || !algumaConfirmacao}
            style={{ marginTop: 16, background: "#2a5a3a", color: "#e4e4ea", border: "1px solid #3d7a4f", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}
          >
            {carregando ? "Criando rascunhos..." : "Criar rascunhos"}
          </button>
        </div>
      )}

      {resultado && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#182a1e", border: "1px solid #26542f", fontSize: 13, color: "#8fd6a0" }}>
          Importação confirmada — {resultado.draftIds.length} rascunho(s) criado(s).{" "}
          <a href={`/admin/biblioteca/importacoes/${resultado.sessionId}`} style={{ color: "#8fd6a0", textDecoration: "underline" }}>
            Ver detalhes da importação →
          </a>
        </div>
      )}
    </div>
  );
}
