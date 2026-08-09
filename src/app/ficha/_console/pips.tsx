"use client";

/**
 * Pip losangular compartilhado (PA/Reações e trilhas de MIT/PD dos
 * Equipamentos) — MESMA geometria e paleta cyan nos dois lugares,
 * padronizado a pedido do usuário. Um único path (não dois, como as
 * versões antigas em `IdentityAside`/`EquipmentPanel`) para que
 * default→hover seja SEMPRE uma transição de cor pura via CSS —
 * misturar "2 paths no preenchido" com "1 path no vazio" foi o que
 * causou o bug do "efeito duplo" no hover dos atributos; aqui evita-se
 * o mesmo problema de origem.
 *
 * Estados via `data-on`/`data-preview` + CSS, nunca inline style.
 * Hover em preenchido = "remover" (fica avermelhado); hover em vazio =
 * "adicionar" (fica cyan mais forte). O botão pai precisa da classe
 * `rc-pip-btn` pro CSS de hover (efeito de UM pip) achar o pip.
 *
 * `preview` é para o efeito de TRILHA (vários pips ficando vermelhos
 * de uma vez ao passar o mouse num deles, igual a Integridade) — quem
 * usa isso calcula qual pip recebe "empty"/"fill" e passa como prop;
 * não dá pra fazer só com `:hover` porque afeta pips que NÃO estão
 * sob o cursor.
 */
export function DiamondPip({
  cheio,
  size = 19,
  preview,
}: {
  cheio: boolean;
  size?: number;
  preview?: "fill" | "empty";
}) {
  return (
    <svg className="rc-diapip" data-on={cheio} data-preview={preview} viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <path d="M11.293 6L6 11.293L0.707031 6L6 0.707031L11.293 6Z" />
    </svg>
  );
}
