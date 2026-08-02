"use client";

/**
 * Isola erros de render dentro do CONTEÚDO do Console (painéis) da
 * página /ficha inteira.
 *
 * Até agora o Console só montava de verdade depois de um clique manual
 * em "Abrir Console" — nenhum painel (IdentityAside, EquipmentPanel
 * etc.) tinha rodado ainda com dado real de personagem salvo, só com o
 * personagem em branco de `/dev/character-sheet`. Abrir o Console
 * automaticamente na rota real expôs esse código a formas de dado que
 * nunca foram exercitadas — e sem boundary, qualquer exceção ali sobe
 * até o `error.tsx` da ROTA e derruba a página toda (o "Algo deu
 * errado" que aparecia ao clicar num personagem).
 *
 * A janela (topbar/controles) continua funcionando mesmo se o
 * conteúdo quebrar — o usuário consegue fechar/minimizar e ver a ficha
 * clássica por baixo, em vez de ficar preso numa tela de erro.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
}

export class ConsoleErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Console do Personagem — erro de render isolado:", erro, info.componentStack);
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="rc-tab-vazio" role="alert" style={{ minHeight: 200 }}>
          <span>Não foi possível mostrar esta parte do Console.</span>
          <span className="rc-vazio">{this.state.erro.message}</span>
          <button type="button" className="rc-ghost" onClick={() => this.setState({ erro: null })}>
            Tentar de novo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
