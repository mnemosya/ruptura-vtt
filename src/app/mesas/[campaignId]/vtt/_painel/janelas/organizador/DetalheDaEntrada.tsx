"use client";

/**
 * Detalhe de uma entrada do organizador (CONT-03): editar, revelar,
 * relacionar, arquivar e excluir.
 *
 * Salvamento explícito, não automático: o organizador é escrito durante
 * a sessão, com a mesa esperando, e um autosave que dispara no meio de
 * uma frase produz versões que ninguém pediu. O botão fica desabilitado
 * quando nada mudou, para não parecer que há trabalho pendente.
 */

import { useEffect, useMemo, useState } from "react";
import { Archive, Eye, EyeOff, Link2, Trash2, Undo2, Users } from "lucide-react";
import { BotaoTecnico, Caption } from "../../ui/primitivas";
import type { NarrativeEntry, NarrativeEstado } from "../../../../../../../lib/campaign/narrativeActions";
import { lerJogadoresConvitesAction, type ParticipanteAdmin } from "../../acoes/administracaoPainel";
import { rotuloDoTipo, tituloVisivel } from "./tipos";

interface Props {
  campaignId: string;
  entrada: NarrativeEntry;
  todas: NarrativeEntry[];
  ocupado: boolean;
  onSalvar: (campos: { titulo?: string | null; corpo?: string | null; etiquetas?: string[]; acontecidaEm?: string | null }) => void;
  onEstado: (estado: NarrativeEstado) => void;
  onVisibilidade: (userIds: string[] | null) => void;
  onRelacionar: (outro: string, ligar: boolean) => void;
  onExcluir: () => void;
}

export function DetalheDaEntrada({
  campaignId, entrada, todas, ocupado, onSalvar, onEstado, onVisibilidade, onRelacionar, onExcluir,
}: Props) {
  const [titulo, setTitulo] = useState(entrada.titulo ?? "");
  const [corpo, setCorpo] = useState(entrada.corpo ?? "");
  const [etiquetas, setEtiquetas] = useState(entrada.etiquetas.join(", "));
  const [quando, setQuando] = useState(entrada.acontecida_em?.slice(0, 16) ?? "");
  const [participantes, setParticipantes] = useState<{ userId: string; displayName: string }[]>([]);
  const [escolhidos, setEscolhidos] = useState<string[] | null>(null);

  // Só busca o elenco quando ele é necessário — a janela abre muitas
  // vezes por sessão, e revelar para pessoas escolhidas é o caso raro.
  useEffect(() => {
    let vivo = true;
    void lerJogadoresConvitesAction(campaignId).then((r) => {
      if (!vivo || !r.ok || !r.dados) return;
      setParticipantes(r.dados.participantes
        .filter((p: ParticipanteAdmin) => p.role === "player")
        .map((p: ParticipanteAdmin) => ({ userId: p.userId, displayName: p.displayName })));
    });
    return () => { vivo = false; };
  }, [campaignId]);

  const sujo = useMemo(() =>
    titulo !== (entrada.titulo ?? "")
    || corpo !== (entrada.corpo ?? "")
    || etiquetas !== entrada.etiquetas.join(", ")
    || quando !== (entrada.acontecida_em?.slice(0, 16) ?? ""),
  [titulo, corpo, etiquetas, quando, entrada]);

  const relacionadas = useMemo(() => todas.filter((e) => e.id !== entrada.id), [todas, entrada.id]);
  const publicada = entrada.estado === "publicado";

  return (
    <div className="rv-org-det" data-testid="organizador-detalhe">
      <header className="rv-org-det-cab">
        <span className="rv-org-det-tipo">{rotuloDoTipo(entrada.tipo)}</span>
        <h3 className="rv-org-det-titulo">{tituloVisivel(entrada)}</h3>
      </header>

      <label className="rv-org-campo">
        <span>Título{entrada.tipo === "handout" ? " (opcional)" : ""}</span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} data-testid="organizador-titulo" />
      </label>

      {entrada.tipo === "sessao" && (
        <label className="rv-org-campo">
          <span>Quando</span>
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)}
            data-testid="organizador-quando" />
        </label>
      )}

      <label className="rv-org-campo">
        <span>Texto</span>
        <textarea rows={7} value={corpo} onChange={(e) => setCorpo(e.target.value)} data-testid="organizador-corpo" />
      </label>

      <label className="rv-org-campo">
        {/* Etiqueta é o que substitui o tipo "outros" — por isso tem
            lugar de campo, e não de detalhe escondido. */}
        <span>Etiquetas, separadas por vírgula</span>
        <input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)}
          placeholder="regra-caseira, nomes, trilha" data-testid="organizador-etiquetas" />
      </label>

      <div className="rv-org-det-acoes">
        <BotaoTecnico primario desabilitado={!sujo || ocupado} testId="organizador-salvar"
          onClick={() => onSalvar({
            titulo: titulo.trim() || null,
            corpo,
            etiquetas: etiquetas.split(",").map((t) => t.trim()).filter(Boolean),
            ...(entrada.tipo === "sessao" ? { acontecidaEm: quando ? new Date(quando).toISOString() : null } : {}),
          })}>
          {sujo ? "Salvar" : "Salvo"}
        </BotaoTecnico>
      </div>

      <Caption>Visibilidade</Caption>
      <div className="rv-org-vis">
        <div className="rv-org-det-acoes">
          {entrada.estado !== "publicado" && (
            <BotaoTecnico onClick={() => onEstado("publicado")} desabilitado={ocupado}
              icone={<Eye size={12} />} testId="organizador-revelar">Revelar à mesa</BotaoTecnico>
          )}
          {entrada.estado === "publicado" && (
            <BotaoTecnico onClick={() => onEstado("rascunho")} desabilitado={ocupado}
              icone={<EyeOff size={12} />} testId="organizador-ocultar">Voltar a rascunho</BotaoTecnico>
          )}
          {entrada.estado !== "arquivado" ? (
            <BotaoTecnico onClick={() => onEstado("arquivado")} desabilitado={ocupado}
              icone={<Archive size={12} />} testId="organizador-arquivar">Arquivar</BotaoTecnico>
          ) : (
            <BotaoTecnico onClick={() => onEstado("rascunho")} desabilitado={ocupado}
              icone={<Undo2 size={12} />} testId="organizador-desarquivar">Desarquivar</BotaoTecnico>
          )}
        </div>
        <p className="rv-org-nota">
          {entrada.estado === "rascunho" ? "Rascunho: só você vê, sempre."
            : entrada.estado === "arquivado" ? "Arquivada: fora das listas, e volta quando você quiser."
            : escolhidos && escolhidos.length > 0
              ? "Publicada para quem você escolheu abaixo."
              : "Publicada para a mesa toda."}
        </p>

        {publicada && participantes.length > 0 && (
          <details className="rv-org-segredo">
            <summary><Users size={12} aria-hidden="true" /> Revelar só para algumas pessoas</summary>
            <ul className="rv-org-pessoas">
              {participantes.map((p) => (
                <li key={p.userId}>
                  <label>
                    <input type="checkbox" checked={escolhidos?.includes(p.userId) ?? false}
                      data-testid="organizador-pessoa"
                      onChange={(e) => setEscolhidos((atual) => {
                        const base = atual ?? [];
                        return e.target.checked ? [...base, p.userId] : base.filter((x) => x !== p.userId);
                      })} />
                    {p.displayName}
                  </label>
                </li>
              ))}
            </ul>
            <div className="rv-org-det-acoes">
              <BotaoTecnico desabilitado={ocupado} testId="organizador-aplicar-segredo"
                onClick={() => onVisibilidade(escolhidos && escolhidos.length > 0 ? escolhidos : null)}>
                Aplicar
              </BotaoTecnico>
              <BotaoTecnico desabilitado={ocupado} testId="organizador-revelar-todos"
                onClick={() => { setEscolhidos(null); onVisibilidade(null); }}>
                Voltar a revelar para todos
              </BotaoTecnico>
            </div>
            {/* Ninguém escolhido significa "a mesa toda" — o mesmo que
                a lista vazia no banco. Dizer isso aqui evita o engano de
                achar que desmarcar todos esconde de todos. */}
            <p className="rv-org-nota">Sem ninguém marcado, a entrada volta a valer para a mesa toda.</p>
          </details>
        )}
      </div>

      {relacionadas.length > 0 && (
        <>
          <Caption>Relações</Caption>
          <ul className="rv-org-relacoes" data-testid="organizador-relacoes">
            {relacionadas.slice(0, 40).map((e) => (
              <li key={e.id}>
                <button type="button" className="rv-org-relacao" disabled={ocupado}
                  onClick={() => onRelacionar(e.id, true)} data-testid="organizador-relacionar">
                  <Link2 size={11} aria-hidden="true" />
                  <span className="rv-org-item-tipo">{rotuloDoTipo(e.tipo)}</span>
                  {tituloVisivel(e)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="rv-org-det-acoes rv-org-det-acoes--fim">
        <BotaoTecnico acento="perigo" onClick={onExcluir} desabilitado={ocupado}
          icone={<Trash2 size={12} />} testId="organizador-excluir">Excluir</BotaoTecnico>
      </div>
    </div>
  );
}
