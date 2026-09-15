"use client";

/**
 * CONTEÚDO DA CAMPANHA — o que eram três rotas, numa janela só.
 *
 * Eram `/biblioteca` (a lista efetiva), `/biblioteca/rascunho/[id]` (o
 * editor) e `/biblioteca/comparar/[id]` (o diff de três vias). Cada
 * salto entre elas era uma navegação: a mesa fechava, o mapa
 * descarregava, e voltar era recomeçar.
 *
 * Aqui são três VISTAS da mesma janela, e "voltar" é soltar um estado.
 * Os componentes são os mesmos de antes — só perderam o `router`.
 *
 * Do narrador, como a rota era (a ação confere de novo no servidor: o
 * menu esconder não é autorização).
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { JanelaInterna } from "../ui/JanelaInterna";
import { TabelaConteudo } from "./conteudo/TabelaConteudo";
import { ComparacaoTresViasVista } from "./conteudo/ComparacaoTresVias";
import { EditorDeRascunho } from "./conteudo/EditorDeRascunho";
import {
  lerComparacaoAction,
  lerConteudoDaCampanhaAction,
  lerRascunhoAction,
  type ComparacaoAberta,
  type ConteudoDaCampanha,
  type RascunhoAberto,
} from "../../_acoes/campanhaActions";
import { TIPOS_DE_CONTEUDO } from "../../_acoes/tiposDeConteudo";

type Vista =
  | { tipo: "lista" }
  | { tipo: "rascunho"; dados: RascunhoAberto }
  | { tipo: "comparar"; dados: ComparacaoAberta };

export function JanelaConteudo({ campaignId, onFechar }: { campaignId: string; onFechar: () => void }) {
  const [conteudo, setConteudo] = useState<ConteudoDaCampanha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>({ tipo: "lista" });
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async () => {
    const r = await lerConteudoDaCampanhaAction(campaignId);
    if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao carregar o conteúdo."); return; }
    setErro(null);
    setConteudo(r.dados);
  }, [campaignId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const abrirRascunho = useCallback(async (draftId: string) => {
    setOcupado(true);
    const r = await lerRascunhoAction(campaignId, draftId);
    setOcupado(false);
    if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao abrir o rascunho."); return; }
    setErro(null);
    setVista({ tipo: "rascunho", dados: r.dados });
  }, [campaignId]);

  const abrirComparacao = useCallback(async (docId: string) => {
    setOcupado(true);
    const r = await lerComparacaoAction(campaignId, docId);
    setOcupado(false);
    if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao comparar com o oficial."); return; }
    setErro(null);
    setVista({ tipo: "comparar", dados: r.dados });
  }, [campaignId]);

  /* Voltar à lista sempre relê: o que foi feito na vista de dentro
     (publicar, excluir, remover override) muda a lista de fora. */
  const voltar = useCallback(() => {
    setVista({ tipo: "lista" });
    void recarregar();
  }, [recarregar]);

  const subtitulo = vista.tipo === "rascunho"
    ? "Rascunho"
    : vista.tipo === "comparar"
      ? "Comparação com o oficial"
      : undefined;

  return (
    <JanelaInterna
      aberta
      titulo="Conteúdo da campanha"
      subtitulo={subtitulo}
      largura={860}
      altura={660}
      onFechar={onFechar}
      testId="painel-janela-conteudo"
    >
      <div className="rv-conteudo rm-root">
        {erro && (
          <p className="rv-cena-estado" data-tipo="erro" role="alert">
            <AlertTriangle size={14} aria-hidden="true" /> {erro}
          </p>
        )}
        {ocupado && (
          <p className="rv-cena-estado"><Loader2 size={14} className="rv-girando" aria-hidden="true" /> Abrindo…</p>
        )}

        {vista.tipo === "lista" && (
          <>
            <p className="rv-conteudo-nota">
              Conteúdo efetivo desta mesa: oficial, modificado (override) ou homebrew.
              Alterar aqui nunca modifica o catálogo oficial nem outras mesas.
            </p>
            {conteudo === null && !erro && (
              <p className="rv-cena-estado"><Loader2 size={14} className="rv-girando" aria-hidden="true" /> Carregando…</p>
            )}
            {conteudo && (
              <TabelaConteudo
                campaignId={campaignId}
                tipos={TIPOS_DE_CONTEUDO}
                efetivos={conteudo.efetivos}
                rascunhos={conteudo.rascunhos}
                rascunhosErro={conteudo.rascunhosErro}
                onAbrirRascunho={(id) => void abrirRascunho(id)}
                onComparar={(id) => void abrirComparacao(id)}
                onRecarregar={recarregar}
              />
            )}
          </>
        )}

        {vista.tipo === "rascunho" && (
          <EditorDeRascunho
            campaignId={campaignId}
            draft={vista.dados.draft}
            efeitosPreservados={vista.dados.efeitosPreservados}
            baseDocumentoStatus={vista.dados.baseDocumentoStatus}
            opcoes={vista.dados.opcoes}
            condicoesDisponiveis={vista.dados.condicoesDisponiveis}
            onVoltar={voltar}
            onRecarregar={() => abrirRascunho(vista.dados.draft.id)}
          />
        )}

        {vista.tipo === "comparar" && (
          <>
            <button type="button" className="rv-conteudo-link" onClick={voltar}>← Conteúdo da campanha</button>
            <h3 className="rv-conteudo-titulo">
              Comparação de três vias — {vista.dados.doc.nome ?? vista.dados.doc.slug}
            </h3>
            <div className="rv-conteudo-versoes">
              <span>oficial-base: {vista.dados.doc.official_version_base ?? "—"}</span>
              <span>oficial atual: {vista.dados.oficialVersaoAtual ?? "ausente/arquivado"}</span>
              <span>versão local: {vista.dados.doc.local_version}</span>
              <span>hash-base: {(vista.dados.doc.official_hash_base ?? "—").slice(0, 12)}</span>
            </div>
            <ComparacaoTresViasVista
              campaignId={campaignId}
              doc={vista.dados.doc}
              comparacao={vista.dados.comparacao}
              oficialExiste={vista.dados.oficialExiste}
              onVoltar={voltar}
              onAbrirRascunho={(id) => void abrirRascunho(id)}
            />
          </>
        )}
      </div>
    </JanelaInterna>
  );
}
