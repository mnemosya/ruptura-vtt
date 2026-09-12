"use client";

/**
 * CONFIGURAÇÕES DA CENA — a janela que faltava.
 *
 * O botão dela existia na barra de ferramentas desde sempre, SEM
 * `onClick`: nem janela, nem caminho de escrita. Agora tem os dois
 * (`salvarConfigCenaAction` → `set_vtt_scene_config`, migration 0097).
 *
 * Só o que a cena de fato modela: nome, local, resumo e o tamanho da
 * grade. Ficaram DE FORA, de propósito:
 *
 *   · escala — 1 célula = 1 m é constante do sistema, não configuração;
 *     mostrar um campo editável ali prometeria uma regra que não existe;
 *   · as duas permissões da maquete ("jogadores podem criar áreas",
 *     "bloquear movimento fora do turno") — não existem no schema.
 *
 * Este componente é PURAMENTE APRESENTACIONAL: recebe os valores e
 * devolve intenções. Quem salva é `VttClient`, que tem a revisão da
 * cena e sabe reconciliar conflito.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, Settings } from "lucide-react";
import { JanelaFerramenta } from "./JanelaFerramenta";

export interface ValoresCena {
  nome: string;
  local: string;
  resumo: string;
  largura: number;
  altura: number;
}

export interface PropsPainelCena {
  valoresIniciais: ValoresCena;
  /** Quantos tokens e objetos ficariam fora da grade com o tamanho em edição. */
  foraDaGrade: number;
  salvando: boolean;
  erro: string | null;
  onSalvar: (v: ValoresCena) => void;
  onMudarTamanho: (largura: number, altura: number) => void;
  onFechar: () => void;
}

const LIMITE_CELULAS = { min: 1, max: 200 };

function inteiroNaFaixa(bruto: string, atual: number): number {
  const n = Number.parseInt(bruto, 10);
  if (!Number.isFinite(n)) return atual;
  return Math.min(LIMITE_CELULAS.max, Math.max(LIMITE_CELULAS.min, n));
}

export function PainelCena(p: PropsPainelCena) {
  const [v, setV] = useState<ValoresCena>(p.valoresIniciais);

  // Adota o que o SERVIDOR gravou quando ele responde diferente do
  // enviado (nome em branco volta pro anterior, campos vazios viram
  // nulo). Sem isto o formulário seguiria mostrando o que a pessoa
  // digitou, e não o que a mesa passou a ter.
  useEffect(() => { setV(p.valoresIniciais); }, [p.valoresIniciais]);

  const mudou =
    v.nome !== p.valoresIniciais.nome || v.local !== p.valoresIniciais.local ||
    v.resumo !== p.valoresIniciais.resumo || v.largura !== p.valoresIniciais.largura ||
    v.altura !== p.valoresIniciais.altura;

  function definirTamanho(patch: Partial<Pick<ValoresCena, "largura" | "altura">>) {
    const novo = { ...v, ...patch };
    setV(novo);
    p.onMudarTamanho(novo.largura, novo.altura);
  }

  return (
    <JanelaFerramenta
      id="cena"
      indice="10"
      icone={<Settings size={16} />}
      titulo="Configurações da Cena"
      modo={mudou ? "Alterações não salvas" : "Alterações persistentes"}
      rotulo="Configurações da cena"
      rotuloFechar="Fechar configurações da cena"
      aoFechar={p.onFechar}
    >
      <div className="rv-fp-corpo">
        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Identidade</span>
          <label className="rv-fp-campo">
            <span>Nome da cena</span>
            <input
              type="text" value={v.nome} maxLength={120}
              data-testid="cena-campo-nome"
              onChange={(e) => setV({ ...v, nome: e.target.value })}
            />
          </label>
          <label className="rv-fp-campo">
            <span>Local</span>
            <input
              type="text" value={v.local} maxLength={120} placeholder="Pátio de carga · Submundo de Vosek"
              data-testid="cena-campo-local"
              onChange={(e) => setV({ ...v, local: e.target.value })}
            />
          </label>
          <label className="rv-fp-campo">
            <span>Resumo</span>
            <textarea
              value={v.resumo} rows={3} maxLength={600}
              placeholder="O que a mesa precisa saber ao chegar aqui."
              data-testid="cena-campo-resumo"
              onChange={(e) => setV({ ...v, resumo: e.target.value })}
            />
          </label>
        </div>

        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Grade</span>
          <div className="rv-fp-campos-lado">
            <label className="rv-fp-campo">
              <span>Largura</span>
              <input
                type="number" inputMode="numeric" value={v.largura}
                min={LIMITE_CELULAS.min} max={LIMITE_CELULAS.max}
                data-testid="cena-campo-largura"
                onChange={(e) => definirTamanho({ largura: inteiroNaFaixa(e.target.value, v.largura) })}
              />
              <em>células</em>
            </label>
            <label className="rv-fp-campo">
              <span>Altura</span>
              <input
                type="number" inputMode="numeric" value={v.altura}
                min={LIMITE_CELULAS.min} max={LIMITE_CELULAS.max}
                data-testid="cena-campo-altura"
                onChange={(e) => definirTamanho({ altura: inteiroNaFaixa(e.target.value, v.altura) })}
              />
              <em>células</em>
            </label>
          </div>
          {/* Escala não é campo: 1 célula = 1 m é constante do sistema.
              Aparece como informação pra ninguém procurar onde muda. */}
          <p className="rv-fp-nota">1 célula = 1 metro · medida do sistema, não configurável</p>
        </div>

        {p.foraDaGrade > 0 && (
          <p className="rv-fp-medida-aviso" data-grave="true" data-testid="cena-aviso-fora-da-grade">
            <AlertTriangle size={13} />
            <span>
              {p.foraDaGrade} {p.foraDaGrade === 1 ? "peça fica" : "peças ficam"} fora da grade com este tamanho.
              Nada é apagado — {p.foraDaGrade === 1 ? "ela volta" : "elas voltam"} a aparecer se você aumentar de novo.
            </span>
          </p>
        )}
        {p.erro && (
          <p className="rv-fp-medida-aviso" data-grave="true" role="alert" data-testid="cena-erro">
            <AlertTriangle size={13} />
            <span>{p.erro}</span>
          </p>
        )}
      </div>

      <div className="rv-fp-rodape">
        <button
          type="button" className="rv-fp-secundaria"
          onClick={() => setV(p.valoresIniciais)}
          disabled={!mudou || p.salvando}
          data-testid="cena-descartar"
        >
          Descartar
        </button>
        <button
          type="button" className="rv-btn rv-fp-primaria"
          onClick={() => p.onSalvar(v)}
          disabled={!mudou || p.salvando}
          data-testid="cena-salvar"
        >
          {p.salvando ? <Loader2 size={14} className="rv-spin" /> : <Save size={14} />}
          Salvar cena
        </button>
      </div>
    </JanelaFerramenta>
  );
}
