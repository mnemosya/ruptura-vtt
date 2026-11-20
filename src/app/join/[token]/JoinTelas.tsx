/**
 * Telas de `/join/[token]` no design system da tela de acesso
 * (`auth.css`): mesma moldura do login (`AuthMoldura`), com o convite
 * como assunto do painel. Puramente visuais — a página decide qual
 * mostrar; a galeria (`/dev/estilos`, família "Convite") monta as
 * mesmas peças com dados fabricados.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { AuthMoldura, Decodifica, LoginForm } from "../../LoginForm";
import { ConfirmarEntrada } from "./ConfirmarEntrada";

/**
 * Mesmo cabeçalho do login, sem selo nem divisor: título e, abaixo, a
 * linha de contexto que decodifica ao entrar (como o "VIRTUAL TABLETOP").
 */
function Cabecalho({ badge, titulo, subtitulo }: { badge: string; titulo: ReactNode; subtitulo?: ReactNode }) {
  return (
    <div className="rv-header">
      <div className="rv-brand">
        <h1 className="rv-join-titulo">{titulo}</h1>
        <p className="rv-subtitle"><Decodifica texto={badge} atraso={250} /></p>
        {subtitulo && <p className="rv-join-sub">{subtitulo}</p>}
      </div>
    </div>
  );
}

/** Cartão com o nome da campanha — o "assunto" do convite. */
function CartaoCampanha({ nome, papel = "Jogador" }: { nome: string; papel?: string }) {
  return (
    <div className="rv-join-campanha">
      <span className="rv-label">CAMPANHA</span>
      <strong className="rv-join-campanha-nome">{nome}</strong>
      <span className="rv-join-papel">ACESSO: <span className="rv-val--amber">{papel.toUpperCase()}</span></span>
    </div>
  );
}

function VoltarMesas() {
  return <Link href="/mesas" className="rv-join-voltar">← MINHAS CAMPANHAS</Link>;
}

/** Convite inválido/revogado/expirado, ou falha ao ler o convite. */
export function TelaJoinMensagem({ titulo, texto, dica, tom = "erro" }: {
  titulo: string; texto: string; dica?: string; tom?: "erro" | "info";
}) {
  return (
    <AuthMoldura>
      <Cabecalho badge={tom === "erro" ? "LINK INDISPONÍVEL" : "AVISO"} titulo={titulo} />
      <div className="rv-form">
        <div className={`rv-alert rv-alert--${tom === "erro" ? "error" : "info"}`} role="alert" data-testid="invite-invalido">
          <span>{texto}</span>
        </div>
        {dica && <p className="rv-join-texto">{dica}</p>}
        <VoltarMesas />
      </div>
    </AuthMoldura>
  );
}

/** Sem sessão: o login de sempre, com o convite no topo do painel. */
export function TelaJoinLogin({ token, campanha, emailTravado }: { token: string; campanha: string; emailTravado?: string }) {
  return (
    <LoginForm
      redirectTo={`/join/${token}`}
      context="prod"
      lockedEmail={emailTravado}
      faixa={
        <div className="rv-join-faixa">
          <CartaoCampanha nome={campanha} />
          {/* Com e-mail travado, o aviso já vem embaixo do campo de e-mail. */}
          {!emailTravado && (
            <p className="rv-join-texto">Entre ou crie uma conta. Depois disso você volta para este convite.</p>
          )}
        </div>
      }
    />
  );
}

/** Credencial do convite: campanha em destaque e os dados em linhas. */
function CartaoCredencial({ nome, email, papel = "Jogador" }: { nome: string; email: string | null; papel?: string }) {
  return (
    <div className="rv-join-credencial-cartao">
      <span className="rv-label">CAMPANHA</span>
      <strong className="rv-join-campanha-nome">{nome}</strong>
      <dl className="rv-join-credencial-linhas">
        <div><dt>ACESSO</dt><dd className="rv-val--amber">{papel.toUpperCase()}</dd></div>
        {email && <div><dt>ENTRAR COMO</dt><dd>{email}</dd></div>}
      </dl>
    </div>
  );
}

/** Logado e ainda fora da campanha: confirma antes de entrar. */
export function TelaJoinConfirmar({ token, campanha, email, demo }: {
  token: string; campanha: string; email: string | null; demo?: boolean;
}) {
  return (
    <AuthMoldura>
      <Cabecalho badge="CONVITE RECEBIDO" titulo="Entrar na campanha?" />
      <div className="rv-form" data-testid="join-confirmacao">
        <ConfirmarEntrada token={token} demo={demo} cartao={<CartaoCredencial nome={campanha} email={email} />} />
      </div>
    </AuthMoldura>
  );
}
