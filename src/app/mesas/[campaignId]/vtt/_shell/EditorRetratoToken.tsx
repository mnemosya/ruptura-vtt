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
 *   • o menu contextual do token, em "Alterar retrato", quando a pessoa
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
import { ImageUp, Link2, Loader2, Trash2, TriangleAlert, UserRound } from "lucide-react";
import {
  enviarParaUrlAssinada,
  prepararRecorteQuadrado,
} from "../../../../../lib/vtt/imagePreparation";
import { JanelaRecorte } from "../../../../ficha/_console/RecorteImagem";
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
  /** URL JÁ ASSINADA do que está sendo desenhado (o componente não assina nada sozinho). */
  previewAtual: string | null;
  /**
   * De onde vem a cara atual. `herdado` é o caso que faltava: a imagem
   * na tela é o avatar da FICHA, e este editor não manda nela — oferecer
   * "Remover" ali removeria o nada e deixaria a imagem no lugar, que foi
   * exatamente o que confundiu na mesa.
   */
  origem: "arquivo" | "endereco" | "herdado" | "nenhum";
  /** Nome do personagem, para dizer de onde a herança vem. */
  nomePersonagem: string | null;
  onConcluido: (opcoes?: { manterAberto?: boolean }) => void;
  onCancelar: () => void;
}

type Aba = "arquivo" | "endereco";

export function EditorRetratoToken({
  campaignId, tokenId, revision, retratoUrlAtual, previewAtual,
  origem, nomePersonagem, onConcluido, onCancelar,
}: PropsEditorRetratoToken) {
  const [aba, setAba] = useState<Aba>(origem === "endereco" ? "endereco" : "arquivo");
  const [url, setUrl] = useState(retratoUrlAtual ?? "");
  /** Arquivo escolhido, esperando enquadramento. Nada subiu ainda. */
  const [arquivoParaRecortar, setArquivoParaRecortar] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  // Não há object URL de longa vida aqui: o blob do recorte é criado e
  // consumido dentro de `recortarEEnviar`, e o preview do arquivo
  // escolhido pertence ao `RecorteImagem`, que o revoga sozinho.

  function escolherArquivo(arquivo: File | null | undefined) {
    if (!arquivo) return;
    setErro(null);
    // NÃO prepara aqui: o enquadramento é que decide qual pedaço da
    // imagem vira o arquivo. Preparar antes geraria um blob (e um
    // `sha256`) que seria descartado no passo seguinte.
    setArquivoParaRecortar(arquivo);
  }

  async function recortarEEnviar(recorte: { x: number; y: number; tamanho: number }) {
    const arquivo = arquivoParaRecortar;
    if (!arquivo) return;
    setOcupado(true);
    setErro(null);
    try {
      // O recorte acontece ANTES do hash: o arquivo que sobe já é o
      // círculo que o mapa desenha. Ver `prepararRecorteQuadrado`.
      const preparada = await prepararRecorteQuadrado(arquivo, recorte);

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

  /**
   * Remove o retrato PRÓPRIO do token. Não fecha a janela: remover é um
   * ajuste, não um fim de tarefa — e fechar escondia o resultado
   * justamente de quem acabou de pedir a mudança. Quem fecha é "Fechar".
   *
   * Se o token for de um personagem com avatar, a cara NÃO some: a
   * herança volta a valer. A janela diz isso antes de a pessoa clicar,
   * para o resultado não parecer uma imagem antiga ressuscitando.
   */
  async function remover() {
    setOcupado(true);
    setErro(null);
    const r = await definirRetratoImagemAction(campaignId, tokenId, null, revision);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro ?? "Não foi possível remover o retrato."); return; }
    onConcluido({ manterAberto: true });
  }

  const previewMostrado = previewAtual;
    // Só há o que remover quando o retrato é DESTE token.
  const temProprio = origem === "arquivo" || origem === "endereco";
  /**
   * O token tem ficha, então remover o retrato próprio pode não deixar
   * vazio — a herança volta a valer SE a ficha tiver avatar. Este
   * componente não sabe se tem (o id do avatar é coluna de
   * `characters`, fora da projeção do HUD), e por isso o aviso diz
   * "se houver" em vez de prometer o que não pode conferir.
   */
  const origemHerdavel = nomePersonagem !== null;

  // O enquadramento roda ANTES de qualquer envio, sobre o arquivo
  // escolhido. Enquanto ele está aberto, o resto do editor sai de cena:
  // são dois passos de uma coisa só, não duas coisas ao mesmo tempo.
  if (arquivoParaRecortar) {
    return (
      <JanelaRecorte
        erro={erro}
        arquivo={arquivoParaRecortar}
        ocupado={ocupado}
        onConfirmar={(r) => { void recortarEEnviar(r); }}
        onCancelar={() => { setArquivoParaRecortar(null); setErro(null); }}
      />
    );
  }

  return (
    <div className="rv-editor-retrato">
      <div className="rv-editor-retrato__abas" role="tablist" aria-label="Origem do retrato">
        <button type="button" role="tab" aria-selected={aba === "arquivo"}
          className={aba === "arquivo" ? "is-ativa" : undefined}
          onClick={() => setAba("arquivo")}>
          <ImageUp size={13} aria-hidden /> Arquivo
        </button>
        <button type="button" role="tab" aria-selected={aba === "endereco"}
          className={aba === "endereco" ? "is-ativa" : undefined}
          onClick={() => setAba("endereco")}>
          <Link2 size={13} aria-hidden /> Endereço
        </button>
      </div>

      {aba === "arquivo" ? (
        <>
          <input
            ref={inputArquivo} type="file" accept="image/png,image/jpeg,image/webp"
            hidden onChange={(e) => void escolherArquivo(e.target.files?.[0])}
          />
          {/* O preview é REDONDO porque o token é redondo. Um quadrado
              aqui esconderia o corte que o mapa vai fazer — o mesmo
              erro que o enquadramento existe para resolver. Clicar nele
              troca a imagem: é o alvo maior e o mais óbvio. */}
          <button
            type="button" className="rv-editor-retrato__disco"
            onClick={() => inputArquivo.current?.click()} disabled={ocupado}
            aria-label={previewAtual ? "Trocar a imagem do retrato" : "Escolher uma imagem"}
          >
            {previewMostrado
              ? <img src={previewMostrado} alt="" />
              : <ImageUp size={20} aria-hidden />}
            <span className="rv-editor-retrato__disco-acao">
              {previewAtual ? "Trocar" : "Escolher"}
            </span>
          </button>
          {/* Dizer de onde a cara vem é o que impede o mal-entendido:
              sem isto, remover o retrato do token faz o avatar da ficha
              aparecer e parece que uma imagem antiga voltou. */}
          {origem === "herdado" ? (
            <p className="rv-editor-retrato__origem">
              <UserRound size={12} aria-hidden />
              <span>
                Vem da ficha{nomePersonagem ? <> de <strong>{nomePersonagem}</strong></> : null}.
                Enviar um arquivo aqui vale só para este token.
              </span>
            </p>
          ) : (
            <p className="rv-editor-retrato__nota">PNG, JPEG ou WebP · até 2 MB</p>
          )}
          {/* Avisado ANTES do clique, não descoberto depois dele. */}
          {temProprio && origemHerdavel && (
            <p className="rv-editor-retrato__nota">
              Ao remover, o token volta ao avatar da ficha, se houver.
            </p>
          )}
        </>
      ) : (
        <>
          <label className="rv-field">
            <span>Endereço da imagem</span>
            <input type="text" value={url} placeholder="https://…" disabled={ocupado}
              onChange={(e) => setUrl(e.target.value)} />
          </label>
          {/* Dito só na aba em que a troca de origem acontece — na aba
              de arquivo o enquadramento já ocupa a atenção. */}
          <p className="rv-editor-retrato__nota">
            Um retrato tem uma origem só: salvar aqui apaga o arquivo enviado.
          </p>
          <div className="rv-editor-retrato__acoes">
            {temProprio && (
              <button type="button" className="rv-btn rv-btn--ghost rv-editor-retrato__remover"
                onClick={() => void remover()} disabled={ocupado}>
                <Trash2 size={13} aria-hidden /> Remover
              </button>
            )}
            <button type="button" className="rv-btn" onClick={onCancelar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="button" className="rv-btn rv-btn--pri"
              onClick={() => void salvarUrl()} disabled={ocupado || !url.trim()}>
              {ocupado ? <Loader2 size={13} className="rv-girando" aria-hidden /> : null}
              {ocupado ? "Salvando" : "Salvar"}
            </button>
          </div>
        </>
      )}

      {/* Na aba de arquivo as ações são só sair e remover: quem salva é
          o passo de enquadramento, e um "Salvar" aqui que não salvasse
          nada seria pior que nenhum. */}
      {aba === "arquivo" && (
        <div className="rv-editor-retrato__acoes">
          {temProprio && (
            <button type="button" className="rv-btn rv-btn--ghost rv-editor-retrato__remover"
              onClick={() => void remover()} disabled={ocupado}>
              <Trash2 size={13} aria-hidden /> Remover
            </button>
          )}
          <button type="button" className="rv-btn" onClick={onCancelar} disabled={ocupado}>
            Fechar
          </button>
        </div>
      )}

      {erro && (
        <p className="rv-editor-retrato__erro" role="alert">
          <TriangleAlert size={13} aria-hidden /> {erro}
        </p>
      )}
    </div>
  );
}
