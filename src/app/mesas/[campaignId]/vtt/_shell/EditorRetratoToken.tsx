"use client";

/**
 * Editor de retrato de token — COMPARTILHADO entre dois donos.
 *
 * Existe porque o backend novo, sozinho, não entregava nada ao jogador:
 * `edit_vtt_token` (0076) é narrador-only e o gerenciador de token
 * inteiro também é — no menu contextual, quem controla o token sem ser
 * narrador recebe rotação e mais nada. Uma RPC estreita
 * (`set_vtt_token_portrait_image`, 0101) sem um lugar de onde chamá-la
 * seria backend sem porta.
 *
 * Então este componente é montado nos DOIS caminhos:
 *   • `SelectedTokenHud`, na ação "Alterar retrato", quando a pessoa
 *     controla o token — é por aqui que o jogador entra;
 *   • `GerenciadorToken`, no lugar do antigo campo de URL solto — é por
 *     aqui que o narrador entra.
 *
 * O gerenciador completo NÃO é aberto para jogador: ele tem lado,
 * vertente, visibilidade e PV, que continuam decisão do narrador.
 * Compartilhar o editor pequeno é o que dá acesso ao retrato sem dar
 * acesso ao resto.
 *
 * ── UM RETRATO, UMA ORIGEM ──────────────────────────────────────────
 * As duas abas são MUTUAMENTE EXCLUSIVAS, e isso é regra do banco, não
 * cortesia da interface: salvar arquivo limpa o endereço, salvar
 * endereço limpa o arquivo. Guardar os dois com precedência silenciosa
 * faria a pessoa não saber qual está valendo — e o dia em que o
 * endereço externo saísse do ar, o retrato "voltaria" sozinho para uma
 * imagem antiga.
 *
 * Componente de APRESENTAÇÃO + chamada de ação: ele conhece o fluxo de
 * upload (que é dele), mas nenhuma regra de token.
 */

import { useEffect, useRef, useState } from "react";
import { ImageUp, Link2, Loader2, Trash2, TriangleAlert } from "lucide-react";
import {
  BYTES_MAXIMO_RETRATO,
  ImagemRecusadaError,
  enviarParaUrlAssinada,
  prepararImagem,
  type ImagemPreparada,
} from "../../../../../lib/vtt/imagePreparation";
import {
  definirRetratoImagemAction,
  definirRetratoUrlAction,
  finalizarUploadRetratoAction,
  reservarUploadAction,
} from "../_acoes/imageActions";

export interface PropsEditorRetratoToken {
  campaignId: string;
  tokenId: string;
  /** Revisão lida — vai como `expected_revision` e é o que impede sobrescrita silenciosa. */
  revision: number;
  retratoUrlAtual: string | null;
  /** URL JÁ ASSINADA do retrato de arquivo, quando houver (o componente não assina nada sozinho). */
  previewAtual: string | null;
  temImagemPropria: boolean;
  onConcluido: () => void;
  onCancelar: () => void;
}

type Aba = "arquivo" | "endereco";

export function EditorRetratoToken({
  campaignId, tokenId, revision, retratoUrlAtual, previewAtual,
  temImagemPropria, onConcluido, onCancelar,
}: PropsEditorRetratoToken) {
  const [aba, setAba] = useState<Aba>(temImagemPropria || !retratoUrlAtual ? "arquivo" : "endereco");
  const [url, setUrl] = useState(retratoUrlAtual ?? "");
  const [preparada, setPreparada] = useState<ImagemPreparada | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  // O preview é um object URL: sem revoke, cada arquivo escolhido
  // vazaria um blob pelo tempo de vida da aba.
  useEffect(() => {
    return () => { if (preparada) URL.revokeObjectURL(preparada.previewUrl); };
  }, [preparada]);

  async function escolherArquivo(arquivo: File | null | undefined) {
    if (!arquivo) return;
    setErro(null);
    try {
      // Prepara em MEMÓRIA e mostra. Nada foi enviado ainda — é isso
      // que faz "Cancelar" não deixar resíduo nenhum para coletar.
      const nova = await prepararImagem(arquivo, BYTES_MAXIMO_RETRATO);
      setPreparada((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior.previewUrl);
        return nova;
      });
    } catch (e) {
      setErro(e instanceof ImagemRecusadaError ? e.message : "Não foi possível ler esta imagem.");
    }
  }

  async function salvarArquivo() {
    if (!preparada) return;
    setOcupado(true);
    setErro(null);
    try {
      // Passo 1: autoriza pela intenção e reserva quota. É aqui que o
      // servidor decide se ESTA pessoa pode mexer neste token.
      const reserva = await reservarUploadAction(campaignId, preparada.sha256, "retrato", tokenId);
      if (!reserva.ok || !reserva.dados) throw new Error(reserva.erro ?? "Não foi possível preparar o envio.");

      // Conteúdo repetido já está lá: liga direto, sem subir de novo.
      if (reserva.dados.reutilizado) {
        const r = await definirRetratoImagemAction(campaignId, tokenId, reserva.dados.assetId, revision);
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível definir o retrato.");
        onConcluido();
        return;
      }

      // Passo 2: `PUT` na capability. O browser não usa credencial
      // própria em momento nenhum.
      await enviarParaUrlAssinada(reserva.dados.uploadUrl!, preparada.blob);

      // Passo 3: o servidor decodifica o que chegou e, na mesma
      // transação, promove o arquivo e liga ao token.
      const fim = await finalizarUploadRetratoAction(
        campaignId, reserva.dados.reservaId!, preparada.sha256, tokenId, revision,
      );
      if (!fim.ok) throw new Error(fim.erro ?? "Não foi possível concluir o envio.");
      onConcluido();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar a imagem.");
    } finally {
      setOcupado(false);
    }
  }

  async function salvarUrl() {
    setOcupado(true);
    setErro(null);
    const r = await definirRetratoUrlAction(campaignId, tokenId, url.trim() || null, revision);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro ?? "Não foi possível salvar o endereço."); return; }
    onConcluido();
  }

  async function remover() {
    setOcupado(true);
    setErro(null);
    const r = await definirRetratoImagemAction(campaignId, tokenId, null, revision);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro ?? "Não foi possível remover o retrato."); return; }
    onConcluido();
  }

  const previewMostrado = preparada?.previewUrl ?? previewAtual;

  return (
    <div className="rv-editor-retrato">
      <div className="rv-editor-retrato__abas" role="tablist" aria-label="Origem do retrato">
        <button type="button" role="tab" aria-selected={aba === "arquivo"}
          className={aba === "arquivo" ? "is-ativa" : undefined}
          onClick={() => setAba("arquivo")}>
          <ImageUp size={14} aria-hidden /> Enviar arquivo
        </button>
        <button type="button" role="tab" aria-selected={aba === "endereco"}
          className={aba === "endereco" ? "is-ativa" : undefined}
          onClick={() => setAba("endereco")}>
          <Link2 size={14} aria-hidden /> Endereço
        </button>
      </div>

      {/* Dito uma vez, no lugar onde a escolha acontece: as duas origens
          não convivem. */}
      <p className="rv-editor-retrato__nota">
        Um retrato tem uma origem só — salvar por aqui substitui a outra.
      </p>

      {aba === "arquivo" ? (
        <>
          <input
            ref={inputArquivo} type="file" accept="image/png,image/jpeg,image/webp"
            hidden onChange={(e) => void escolherArquivo(e.target.files?.[0])}
          />
          <div className="rv-editor-retrato__preview">
            {previewMostrado
              ? <img src={previewMostrado} alt="" width={96} height={96} />
              : <span>sem retrato</span>}
          </div>
          <button type="button" onClick={() => inputArquivo.current?.click()} disabled={ocupado}>
            {preparada ? "Escolher outra…" : "Escolher imagem…"}
          </button>
          {preparada && (
            <p className="rv-editor-retrato__medida">
              {preparada.widthPx}×{preparada.heightPx} px · {(preparada.blob.size / 1024).toFixed(0)} KB
            </p>
          )}
          <div className="rv-editor-retrato__acoes">
            <button type="button" onClick={() => void salvarArquivo()} disabled={!preparada || ocupado}>
              {ocupado ? <><Loader2 size={14} className="rv-girando" aria-hidden /> Enviando…</> : "Salvar retrato"}
            </button>
            <button type="button" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <label>
            Endereço da imagem
            <input type="text" value={url} placeholder="https://…" disabled={ocupado}
              onChange={(e) => setUrl(e.target.value)} />
          </label>
          <div className="rv-editor-retrato__acoes">
            <button type="button" onClick={() => void salvarUrl()} disabled={ocupado}>
              {ocupado ? <><Loader2 size={14} className="rv-girando" aria-hidden /> Salvando…</> : "Salvar endereço"}
            </button>
            <button type="button" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
          </div>
        </>
      )}

      {(temImagemPropria || retratoUrlAtual) && (
        <button type="button" className="rv-editor-retrato__remover" onClick={() => void remover()} disabled={ocupado}>
          <Trash2 size={14} aria-hidden /> Remover retrato
        </button>
      )}

      {erro && (
        <p className="rv-editor-retrato__erro" role="alert">
          <TriangleAlert size={14} aria-hidden /> {erro}
        </p>
      )}
    </div>
  );
}
