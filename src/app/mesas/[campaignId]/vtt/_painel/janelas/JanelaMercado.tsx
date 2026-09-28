"use client";

/**
 * O MERCADO — que nunca foi uma tela.
 *
 * A loja sempre viveu DENTRO da ficha, na aba Inventário ("Loja do
 * Mercado Noturno"), operando sobre o inventário e a carteira de um
 * personagem por vez. A rota `/mercado` era só um seletor na frente
 * dela: escolha de quem é a carteira, e siga.
 *
 * Aqui é o mesmo seletor, e ele abre o Console na aba Inventário — sem
 * navegar, sem sair da mesa. Por isso esta janela some assim que a
 * escolha é feita: ela não tem conteúdo próprio, e ficar aberta atrás
 * da ficha seria uma porta encostada sem cômodo do outro lado.
 */

import { useEffect, useState } from "react";
import { Loader2, Store } from "lucide-react";
import { JanelaInterna } from "../ui/JanelaInterna";
import { listarPersonagensDaMesaAction, type PersonagemDaMesa } from "../../_acoes/campanhaActions";

export function JanelaMercado({
  campaignId,
  ehNarrador,
  onAbrirFicha,
  onFechar,
}: {
  campaignId: string;
  ehNarrador: boolean;
  /** Abre o Console naquele personagem, na aba Inventário. */
  onAbrirFicha: (characterId: string) => void;
  onFechar: () => void;
}) {
  const [personagens, setPersonagens] = useState<PersonagemDaMesa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarPersonagensDaMesaAction(campaignId).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro ?? "Falha ao listar os personagens."); return; }
      setPersonagens(r.dados ?? []);
    });
    return () => { vivo = false; };
  }, [campaignId]);

  return (
    <JanelaInterna
      aberta
      titulo="Mercado"
      largura={480}
      altura={420}
      onFechar={onFechar}
      testId="painel-janela-mercado"
    >
      <div className="rv-mercado">
        <p className="rv-mercado-nota">
          A loja é operada pela ficha de cada personagem. Escolha de quem é a carteira.
        </p>

        {erro && <p className="rv-cena-estado" data-tipo="erro" role="alert">{erro}</p>}

        {personagens === null && !erro && (
          <p className="rv-cena-estado"><Loader2 size={14} className="rv-girando" aria-hidden="true" /> Carregando…</p>
        )}

        {personagens !== null && personagens.length === 0 && (
          <p className="rv-cena-estado" data-testid="mercado-vazio">
            {ehNarrador
              ? "Nenhum personagem nesta campanha ainda."
              : "Você ainda não controla um personagem nesta campanha."}
          </p>
        )}

        <ul className="rv-mercado-lista">
          {(personagens ?? []).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="rv-mercado-item"
                data-testid="mercado-abrir"
                onClick={() => { onAbrirFicha(p.id); onFechar(); }}
              >
                <Store size={15} aria-hidden="true" />
                <span className="rv-mercado-nome">{p.nome}</span>
                <span className="rv-mercado-acao">Abrir Mercado</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </JanelaInterna>
  );
}
