"use client";

import { useState, type ReactNode } from "react";

/**
 * Avatar de conta de qualquer pessoa, servido por /api/usuarios/<id>/avatar
 * (que só responde se houver campanha em comum). Sem avatar, ou sem
 * acesso, a rota dá 404 e o `fallback` de sempre volta para o lugar.
 *
 * `versao` (o caminho do arquivo, quando quem desenha já o conhece) vira
 * chave de cache: a troca aparece na hora em vez de esperar o cache vencer.
 */
export function AvatarUsuario({ userId, versao, fallback }: {
  userId: string;
  versao?: string | null;
  fallback: ReactNode;
}) {
  const src = `/api/usuarios/${userId}/avatar${versao ? `?v=${encodeURIComponent(versao)}` : ""}`;
  const [falhou, setFalhou] = useState<string | null>(null);
  if (falhou === src) return <>{fallback}</>;
  return (
    // O `ref` cobre o 404 que chega ANTES da hidratação: nesse caso o
    // `onError` já disparou sem ninguém ouvindo e a imagem quebrada ficava.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setFalhou(src)}
      ref={(img) => { if (img && img.complete && img.naturalWidth === 0) setFalhou(src); }}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
  );
}
