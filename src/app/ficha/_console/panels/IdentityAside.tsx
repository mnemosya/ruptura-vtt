"use client";

/**
 * Painel lateral esquerdo do Console, na ordem do wireframe: avatar,
 * bloco decorado de identidade (nome + ranking de Cobalto), atributos,
 * Integridade, Sobrecarga, Deslocamento, PA e Reações.
 *
 * Avatar e atributos usam borda poligonal REAL (SVG com `stroke`), não
 * `clip-path` sobre um retângulo com `border` — essa combinação é o
 * que produzia os "nubs" quadrados nos cantos. O avatar guarda a
 * imagem/placeholder numa camada separada (clip-path só para recortar
 * a foto, sem borda própria); os atributos usam um único polígono SVG
 * com fill+stroke (sem foto para recortar, então uma camada basta).
 *
 * O estado do avatar (preview local + erro) vem de fora — o console
 * minimizado (`MinimizedDockContent`) precisa mostrar a MESMA imagem,
 * então o estado não pode viver só aqui.
 *
 * Nenhum valor é calculado aqui — tudo vem de `api` (derivados já
 * resolvidos e ações que a ficha já implementa).
 */

import { useState } from "react";
import { Hand, Brain, Heart, User } from "lucide-react";
import { MAX_OVERLOAD_SURGES_PER_DAY, type CharacterAttributes } from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
import type { ConsoleApi } from "../types";

const ATRIBUTOS: { id: keyof CharacterAttributes; nome: string; Icone: typeof Hand }[] = [
  { id: "corpo", nome: "Corpo", Icone: Hand },
  { id: "mente", nome: "Mente", Icone: Brain },
  { id: "animo", nome: "Ânimo", Icone: Heart },
];

/** Pontos hexagonais do avatar/atributos — ponta em cima e embaixo, como no desenho. */
const HEX_AVATAR = "50,2 98,27 98,79 50,104 2,79 2,27";
const HEX_ATTR = "50,2 98,32 98,84 50,114 2,84 2,32";

/** Trilha de pontos losangulares (PA / Reações): clicar alterna cada ponto. */
function PontosAlternaveis({
  rotulo,
  disponivel,
  max,
  onAlternar,
}: {
  rotulo: string;
  disponivel: number;
  max: number;
  onAlternar: (delta: number) => void;
}) {
  const guard = useClickGuard();
  const total = Math.max(0, Math.round(max));
  return (
    <div className="rc-panel">
      <div className="rc-track-head">
        <span className="rc-label">{rotulo}</span>
      </div>
      <div className="rc-points">
        <div className="rc-point-row">
          {total === 0 ? (
            <span className="rc-vazio">—</span>
          ) : (
            Array.from({ length: total }, (_, i) => {
              const cheio = i < disponivel;
              return (
                <button
                  key={i}
                  type="button"
                  className="rc-point"
                  data-on={cheio}
                  // Cheio → gastar (delta +1 no "gasto"); vazado → devolver.
                  onClick={() => guard(() => onAlternar(cheio ? 1 : -1))}
                  aria-label={`${rotulo} ${i + 1} de ${total}: ${cheio ? "disponível" : "gasto"}`}
                  aria-pressed={cheio}
                />
              );
            })
          )}
        </div>
        <span className="rc-point-tag">
          {disponivel}/{total}
        </span>
      </div>
    </div>
  );
}

/**
 * Trilha de Integridade: segmentos contíguos (flex:1, sem sobra de
 * espaço), clicáveis, com prévia discreta no hover. Clicar num
 * segmento VAZIO aumenta até ali; clicar num PREENCHIDO reduz para o
 * ponto anterior a ele.
 */
function TrilhaIntegridade({
  atual,
  max,
  onDefinir,
}: {
  atual: number;
  max: number;
  onDefinir: (valor: number) => void;
}) {
  const guard = useClickGuard();
  const [hover, setHover] = useState<number | null>(null);
  const total = Math.max(0, Math.round(max));

  // Resultado se o segmento sob o mouse (hover) fosse clicado agora.
  const previewValor = hover == null ? null : hover < atual ? hover : hover + 1;

  return (
    <div>
      <div className="rc-track-head">
        <span className="rc-label">Integridade</span>
        <span className="rc-num">
          {atual}/{total}
        </span>
      </div>
      <div className="rc-pips" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: total }, (_, i) => {
          const cheio = i < atual;
          let preview: "fill" | "empty" | undefined;
          if (previewValor != null) {
            if (previewValor > atual && i >= atual && i < previewValor) preview = "fill";
            else if (previewValor < atual && i >= previewValor && i < atual) preview = "empty";
          }
          return (
            <button
              key={i}
              type="button"
              className="rc-pip"
              data-on={cheio}
              data-preview={preview}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => guard(() => onDefinir(cheio ? i : i + 1))}
              aria-label={`Integridade — segmento ${i + 1} de ${total}: ${cheio ? "preenchido" : "vazio"}. Clique para ajustar até aqui.`}
            />
          );
        })}
      </div>
    </div>
  );
}

export function IdentityAside({
  api,
  avatarUrl,
  avatarErro,
  onAvatarChange,
  onRolarAtributo,
  onEscolherSurto,
}: {
  api: ConsoleApi;
  avatarUrl: string | null;
  avatarErro: string | null;
  onAvatarChange: (file: File) => void;
  onRolarAtributo: (id: keyof CharacterAttributes) => void;
  onEscolherSurto: () => void;
}) {
  const { character, derivados } = api;
  const guard = useClickGuard();

  const integridade = character.recursos_atuais?.integridade ?? derivados.integridade_max;
  const paDisponivel = Math.max(0, derivados.pa_max - (character.estado_jogo?.pa_gastos ?? 0));
  const reacoesDisponiveis = Math.max(0, derivados.reacoes_por_rodada - (character.estado_jogo?.reacoes_usadas ?? 0));
  const sobrecarga = character.sobrecarga_usada_dia ?? 0;
  const ranking = (character.metadados?.ranking_cobalto as string | undefined) ?? null;

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onAvatarChange(file);
    e.target.value = "";
  }

  return (
    <aside className="rc-aside">
      <label className="rc-avatar" data-no-drag>
        <span className="rc-avatar-fill">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <User size={52} strokeWidth={1.2} aria-hidden="true" />}
        </span>
        <svg className="rc-avatar-poly" viewBox="0 0 100 106" preserveAspectRatio="none" aria-hidden="true">
          <polygon points={HEX_AVATAR} />
        </svg>
        <span className="rc-avatar-hint">trocar</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={aoEscolherArquivo}
          hidden
          aria-label="Trocar avatar do personagem"
        />
      </label>
      {avatarErro && (
        <p className="rc-vazio" role="alert" style={{ color: "#ffc4cf" }}>
          {avatarErro}
        </p>
      )}

      <div className="rc-ident">
        <div className="rc-ident-row">
          <span className="rc-ident-name" title={character.nome || "Sem nome"}>
            {character.nome || "Sem nome"}
          </span>
          <span
            className="rc-rank"
            data-vazio={!ranking}
            title={ranking ? `Ranking de Cobalto ${ranking}` : "Ranking de Cobalto não definido"}
          >
            {ranking ?? "—"}
          </span>
        </div>

        <div className="rc-attrs">
          {ATRIBUTOS.map(({ id, nome, Icone }) => (
            <button
              key={id}
              type="button"
              className="rc-attr"
              onClick={() => onRolarAtributo(id)}
              data-testid={`console-attr-${id}`}
              aria-label={`Rolar ${nome}: ${character.atributos[id]}d8`}
            >
              <svg className="rc-attr-poly" viewBox="0 0 100 116" preserveAspectRatio="none" aria-hidden="true">
                <polygon points={HEX_ATTR} />
              </svg>
              <span className="rc-attr-content">
                <Icone size={14} className="rc-attr-ico" aria-hidden="true" />
                <span className="rc-attr-nome">{nome}</span>
                <span className="rc-attr-val">{character.atributos[id]}</span>
              </span>
            </button>
          ))}
        </div>

        <TrilhaIntegridade atual={integridade} max={derivados.integridade_max} onDefinir={api.editarIntegridade} />

        <div>
          <div className="rc-track-head">
            <span className="rc-label rc-label--am">Sobrecarga</span>
            <span className="rc-num">
              {sobrecarga}/{MAX_OVERLOAD_SURGES_PER_DAY}
            </span>
          </div>
          <div className="rc-surges">
            {Array.from({ length: MAX_OVERLOAD_SURGES_PER_DAY }, (_, i) => {
              const usada = i < sobrecarga;
              return (
                <button
                  key={i}
                  type="button"
                  className="rc-surge"
                  data-on={usada}
                  disabled={usada || !api.podeUsarSobrecarga}
                  onClick={() => guard(onEscolherSurto)}
                  data-testid={`console-surto-${i + 1}`}
                  aria-label={`Sobrecarga ${i + 1} de ${MAX_OVERLOAD_SURGES_PER_DAY}${usada ? " (usada)" : ""}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="rc-panel">
        <div className="rc-readout">
          <span className="rc-label">Deslocamento</span>
          <span className="rc-readout-val">
            {derivados.andar_m}m<small>/{derivados.correr_m}m</small>
          </span>
        </div>
      </div>

      <PontosAlternaveis rotulo="PA" disponivel={paDisponivel} max={derivados.pa_max} onAlternar={api.ajustarPa} />
      <PontosAlternaveis
        rotulo="Reações"
        disponivel={reacoesDisponiveis}
        max={derivados.reacoes_por_rodada}
        onAlternar={api.ajustarReacoes}
      />
    </aside>
  );
}
