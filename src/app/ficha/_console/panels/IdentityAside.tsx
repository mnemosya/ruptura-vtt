"use client";

/**
 * Painel lateral esquerdo do Console, na ordem do wireframe: avatar,
 * bloco decorado de identidade (nome + ranking de Cobalto), atributos,
 * Integridade, Sobrecarga, Deslocamento, PA e Reações.
 *
 * Nenhum valor é calculado aqui — tudo vem de `api` (derivados já
 * resolvidos e ações que a ficha já implementa).
 */

import { useRef, useState } from "react";
import { Hand, Brain, Heart, User } from "lucide-react";
import { MAX_OVERLOAD_SURGES_PER_DAY, type CharacterAttributes } from "../../../../lib/character";
import type { ConsoleApi } from "../types";

const ATRIBUTOS: { id: keyof CharacterAttributes; nome: string; Icone: typeof Hand }[] = [
  { id: "corpo", nome: "Corpo", Icone: Hand },
  { id: "mente", nome: "Mente", Icone: Brain },
  { id: "animo", nome: "Ânimo", Icone: Heart },
];

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
                  onClick={() => onAlternar(cheio ? 1 : -1)}
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

export function IdentityAside({
  api,
  onRolarAtributo,
  onEscolherSurto,
}: {
  api: ConsoleApi;
  onRolarAtributo: (id: keyof CharacterAttributes) => void;
  onEscolherSurto: () => void;
}) {
  const { character, derivados } = api;
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarErro, setAvatarErro] = useState<string | null>(null);

  const integridade = character.recursos_atuais?.integridade ?? derivados.integridade_max;
  const paDisponivel = Math.max(0, derivados.pa_max - (character.estado_jogo?.pa_gastos ?? 0));
  const reacoesDisponiveis = Math.max(0, derivados.reacoes_por_rodada - (character.estado_jogo?.reacoes_usadas ?? 0));
  const sobrecarga = character.sobrecarga_usada_dia ?? 0;
  const ranking = (character.metadados?.ranking_cobalto as string | undefined) ?? null;

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarErro(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setAvatarErro("Formato inválido — use PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarErro("Imagem acima de 2 MB.");
      return;
    }
    // Preview local. O projeto ainda não tem fluxo de upload (nenhum uso
    // de Supabase Storage) — criar um storage paralelo aqui seria pior
    // que assumir a limitação. Ver "limitações" na entrega.
    setAvatarPreview(URL.createObjectURL(file));
  }

  return (
    <aside className="rc-aside">
      <button
        type="button"
        className="rc-avatar"
        onClick={() => inputArquivo.current?.click()}
        aria-label="Trocar avatar do personagem"
      >
        {avatarPreview ? <img src={avatarPreview} alt="" /> : <User size={54} strokeWidth={1.2} aria-hidden="true" />}
        <span className="rc-avatar-hint">trocar</span>
      </button>
      <input
        ref={inputArquivo}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={aoEscolherArquivo}
        hidden
      />
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
              <Icone size={13} className="rc-attr-ico" aria-hidden="true" />
              <span className="rc-attr-nome">{nome}</span>
              <span className="rc-attr-val">{character.atributos[id]}</span>
            </button>
          ))}
        </div>

        <div>
          <div className="rc-track-head">
            <span className="rc-label">Integridade</span>
            <span className="rc-num">
              {integridade}/{derivados.integridade_max}
            </span>
          </div>
          <div className="rc-pips" role="img" aria-label={`Integridade ${integridade} de ${derivados.integridade_max}`}>
            {Array.from({ length: Math.max(0, Math.round(derivados.integridade_max)) }, (_, i) => (
              <span key={i} className="rc-pip" data-on={i < integridade} />
            ))}
          </div>
        </div>

        <div>
          <div className="rc-track-head">
            <span className="rc-label rc-label--danger">Sobrecarga</span>
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
                  onClick={onEscolherSurto}
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
