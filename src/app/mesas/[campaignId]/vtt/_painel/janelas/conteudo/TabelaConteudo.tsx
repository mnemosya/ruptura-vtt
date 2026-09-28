"use client";

import { useState } from "react";
import type { DraftContentType } from "../../../../../../../lib/contentSchema";
import type { CampaignContentDraftRow, ConteudoEfetivo } from "../../../../../../../lib/campaignContent";
import {
  arquivarHomebrewCampanha,
  criarRascunhoCopiaHomebrew,
  criarRascunhoHomebrewNovo,
  criarRascunhoOverride,
  excluirRascunhoCampanha,
  previewImpactoRemocao,
  removerOverrideCampanha,
} from "../../../../../../../lib/campaignContent/campaignContentServerActions";

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
/** Classe, não hex: as três cores de origem moram em `mesa.css` (critério da Fase 5). */
const ORIGEM_CLASSE: Record<ConteudoEfetivo["origem"], string> = {
  oficial: "rm-origem-oficial",
  modificado_pela_mesa: "rm-origem-modificado",
  homebrew_da_mesa: "rm-origem-homebrew",
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
  /** Falha REAL ao ler os rascunhos — distinta de "nenhum rascunho aberto" (auditoria da Fase 5). */
  rascunhosErro: string | null;
  /**
   * O que eram LINKS pra sub-rotas (`/rascunho/[id]`, `/comparar/[id]`)
   * viraram trocas de vista DENTRO da janela. `onRecarregar` substitui
   * o `router.refresh()`: sem rota, não há Server Component pra
   * remontar — quem relê é a ação.
   */
  onAbrirRascunho: (draftId: string) => void;
  onComparar: (docId: string) => void;
  onRecarregar: () => Promise<void> | void;
}

export function TabelaConteudo({ campaignId, tipos, efetivos, rascunhos, rascunhosErro, onAbrirRascunho, onComparar, onRecarregar }: Props) {
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
      if (resultado.draftId) onAbrirRascunho(resultado.draftId);
      else void onRecarregar();
    } finally {
      setCarregando(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <select
          aria-label="Filtrar por tipo de conteúdo"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as DraftContentType | "todos")}
          className="rm-select rv-focusable"
        >
          <option value="todos">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button onClick={() => setMostrarNovo((v) => !v)} className="rm-btn rm-btn-primary rv-focusable" aria-expanded={mostrarNovo} data-testid="biblioteca-toggle-novo">
          + Novo conteúdo da campanha
        </button>
      </div>

      {mostrarNovo && (
        <div className="rm-card" style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select aria-label="Tipo do novo conteúdo" value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as DraftContentType)} className="rm-select rv-focusable">
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input
            aria-label="Nome do novo conteúdo"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome"
            className="rm-input rv-focusable"
            style={{ flex: 1 }}
          />
          <button
            disabled={carregando !== null || !novoNome.trim()}
            onClick={() => rodar("novo", () => criarRascunhoHomebrewNovo(campaignId, novoTipo, novoNome))}
            className="rm-btn rm-btn-primary rv-focusable"
          >
            Criar rascunho
          </button>
        </div>
      )}

      {erro && <p role="alert" className="rm-erro" style={{ marginBottom: 12 }}>{erro}</p>}

      {/* A ausência da seção de rascunhos comunica "nenhum rascunho
          aberto". Com a leitura falha isso seria mentira, então o banner
          toma o lugar dela — `router.refresh()` refaz a leitura do
          servidor, que é onde ela acontece. */}
      {rascunhosErro && (
        <div className="rm-note rm-note--danger" role="alert" data-testid="biblioteca-erro-rascunhos" style={{ marginBottom: 16 }}>
          Não foi possível carregar os rascunhos abertos: {rascunhosErro}{" "}
          <button type="button" onClick={() => void onRecarregar()} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable" style={{ marginLeft: 6 }}>
            Tentar de novo
          </button>
        </div>
      )}

      {!rascunhosErro && rascunhos.length > 0 && (
        <div className="rm-card" style={{ marginBottom: 20 }}>
          <h3 className="rm-section-title">Rascunhos abertos ({rascunhos.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
            {rascunhos.map((d) => (
              <li key={d.id} style={{ marginBottom: 4 }}>
                <button type="button" className="rv-conteudo-link" onClick={() => onAbrirRascunho(d.id)}>
                  {d.content_type}:{d.slug} — {d.operation}
                </button>{" "}
                <button
                  disabled={carregando !== null}
                  onClick={() => rodar(`excluir-${d.id}`, () => excluirRascunhoCampanha(d.id))}
                  className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable"
                  style={{ marginLeft: 4 }}
                >
                  excluir
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rm-table-wrap">
        <table className="rm-table" data-testid="biblioteca-tabela">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Nome</th>
              <th>Origem</th>
              <th>Atualização</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => {
              const chave = `${e.contentType}:${e.slug}`;
              return (
                <tr key={chave}>
                  <td>{e.contentType}</td>
                  <td>{e.nome ?? e.slug}</td>
                  <td className={ORIGEM_CLASSE[e.origem]}>{ORIGEM_LABEL[e.origem]}</td>
                  <td>{e.estadoAtualizacao ? ATUALIZACAO_LABEL[e.estadoAtualizacao] : "—"}</td>
                  <td>
                    <div className="rm-table-acoes">
                  {e.origem === "oficial" && (
                    <>
                      <button disabled={carregando !== null} onClick={() => rodar(chave, () => criarRascunhoOverride(campaignId, e.contentType as DraftContentType, e.slug))} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">
                        Criar override
                      </button>
                      <button
                        disabled={carregando !== null}
                        onClick={() => {
                          const novoSlug = prompt("Slug local para a cópia homebrew:", `${e.slug}_mesa`);
                          const novoNomeCopia = prompt("Nome da cópia:", e.nome ?? e.slug);
                          if (novoSlug && novoNomeCopia) rodar(chave, () => criarRascunhoCopiaHomebrew(campaignId, e.contentType as DraftContentType, e.slug, novoSlug, novoNomeCopia));
                        }}
                        className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable"
                      >
                        Criar cópia homebrew
                      </button>
                    </>
                  )}
                  {e.origem === "modificado_pela_mesa" && e.campaignContentDocumentId && (
                    <>
                      {e.estadoAtualizacao && e.estadoAtualizacao !== "atualizado" && (
                        <button type="button" className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable" onClick={() => onComparar(e.campaignContentDocumentId!)}>
                          Comparar com oficial
                        </button>
                      )}
                      <button
                        disabled={carregando !== null}
                        onClick={() => {
                          const motivo = prompt("Motivo da remoção do override (restaura o oficial):", "") ?? "";
                          rodar(chave, () => removerOverrideCampanha(e.campaignContentDocumentId!, e.localVersion ?? 1, motivo));
                        }}
                        className="rm-btn rm-btn-danger rm-btn-sm rv-focusable"
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
                      className="rm-btn rm-btn-danger rm-btn-sm rv-focusable"
                    >
                      Arquivar
                    </button>
                  )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
