"use client";

/**
 * Estados REUTILIZÁVEIS de aba — carregando, vazio, erro com retry,
 * conectando e indisponível.
 *
 * Cinco abas com cinco jeitos diferentes de dizer "deu erro" é como se
 * chega num painel onde metade das falhas parece lista vazia. Aqui
 * eles são um componente cada, e a distinção entre "vazio de verdade"
 * e "não deu pra ler" fica impossível de apagar por descuido: um usa
 * `EstadoVazio`, o outro `EstadoErro` (com `role="alert"` e botão de
 * tentar de novo).
 *
 * `EstadoErro` aceita `children` — quando a releitura falha mas ainda
 * há dado antigo na tela, a aba mostra o aviso ACIMA do conteúdo
 * preservado, nunca no lugar dele.
 */

import { AlertTriangle, Loader2, PlugZap, Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function EstadoCarregando({ rotulo = "Carregando…", testId }: { rotulo?: string; testId?: string }) {
  return (
    <p className="rv-pn-estado" role="status" aria-live="polite" data-testid={testId}>
      <Loader2 size={14} className="rv-spin" aria-hidden="true" />
      {rotulo}
    </p>
  );
}

export function EstadoVazio({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="rv-pn-estado rv-pn-estado--vazio" data-testid={testId}>
      <Inbox size={14} aria-hidden="true" />
      {children}
    </p>
  );
}

export function EstadoErro({
  mensagem,
  onTentarDeNovo,
  testId,
}: {
  mensagem: string;
  onTentarDeNovo?: () => void;
  testId?: string;
}) {
  return (
    <p className="rv-pn-estado rv-pn-estado--erro" role="alert" data-testid={testId}>
      <AlertTriangle size={14} aria-hidden="true" />
      <span className="rv-pn-estado-texto">{mensagem}</span>
      {onTentarDeNovo && (
        <button type="button" className="rv-pn-retry" onClick={onTentarDeNovo}>
          Tentar de novo
        </button>
      )}
    </p>
  );
}

/** Canal ainda subindo — nunca use isto pra afirmar ausência de dado. */
export function EstadoConectando({ rotulo = "Conectando…", testId }: { rotulo?: string; testId?: string }) {
  return (
    <p className="rv-pn-estado" role="status" aria-live="polite" data-testid={testId}>
      <PlugZap size={14} aria-hidden="true" />
      {rotulo}
    </p>
  );
}

/** Recurso existe mas não pode ser lido agora (canal caído, permissão) — diferente de vazio e de erro de leitura pontual. */
export function EstadoIndisponivel({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="rv-pn-estado rv-pn-estado--indisponivel" role="status" data-testid={testId}>
      <PlugZap size={14} aria-hidden="true" />
      {children}
    </p>
  );
}
