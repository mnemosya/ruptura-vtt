"use client";

/**
 * Limite de erro POR ABA — uma exceção de render no Bando não pode
 * derrubar o Chat, os Personagens nem a mesa inteira.
 *
 * Precisa ser componente de CLASSE: `componentDidCatch`/
 * `getDerivedStateFromError` não têm equivalente em hook (React 19
 * inclusive). É o único componente de classe do painel, e existe só
 * por isso.
 *
 * `chaveReset` é a aba ativa: trocar de aba e voltar zera o erro e
 * tenta renderizar de novo, sem exigir recarregar a página. E como
 * cada aba tem o SEU limite, o erro fica visualmente contido no corpo
 * do painel — a moldura (abas, cabeçalho, botão de recolher) continua
 * viva e navegável.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { EstadoErro } from "./Estados";

interface Props {
  chaveReset: string;
  rotuloAba: string;
  children: ReactNode;
}

interface State {
  erro: Error | null;
  chave: string;
}

export class LimiteErroAba extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { erro: null, chave: props.chaveReset };
  }

  static getDerivedStateFromError(erro: Error): Partial<State> {
    return { erro };
  }

  /** Reset ao trocar de aba — derivado do prop, sem efeito nem `setState` fora de ciclo. */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.chaveReset !== state.chave) return { chave: props.chaveReset, erro: null };
    return null;
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Console é o canal certo aqui: a mesa não tem coletor de erro
    // próprio, e engolir em silêncio esconderia o bug de quem está
    // desenvolvendo. Os browser checks do VTT verificam console limpo,
    // então um erro aqui APARECE nos testes em vez de passar batido.
    console.error(`[painel/${this.props.rotuloAba}] falhou ao renderizar:`, erro, info.componentStack);
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="rv-pn-corpo-erro" data-testid={`painel-aba-quebrada-${this.props.rotuloAba}`}>
          <EstadoErro
            mensagem={`A aba ${this.props.rotuloAba} falhou: ${this.state.erro.message}`}
            onTentarDeNovo={() => this.setState({ erro: null })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
