"use client";

import { useId, useRef, useState } from "react";
import { ZoomIn } from "lucide-react";
import { User, X } from "../_design/icons";

export function PerfilAvatar({ userId, versao, nome }: { userId: string; versao?: string | null; nome: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const src = `/api/usuarios/${userId}/avatar${versao ? `?v=${encodeURIComponent(versao)}` : ""}`;
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const available = loaded === src && failed !== src;

  return <>
    <button type="button" className="rv-perfil-face rv-avatar-trigger" disabled={!available}
      aria-label={`Ampliar avatar de ${nome}`} aria-haspopup="dialog" title={available ? "Ampliar avatar" : "Sem avatar disponível"}
      onClick={() => dialog.current?.showModal()}>
      {failed !== src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onLoad={() => setLoaded(src)} onError={() => setFailed(src)} />
      ) : <User size={22} strokeWidth={1.3} />}
      {available && <span className="rv-avatar-zoom" aria-hidden="true"><ZoomIn size={14} strokeWidth={1.8} /></span>}
    </button>
    <dialog ref={dialog} className="rv-avatar-dialog" aria-labelledby={titleId}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
        }
      }}>
      <header className="rv-avatar-heading">
        <div><span className="rv-avatar-eyebrow">Retrato do operador</span><h2 id={titleId}>{nome}</h2></div>
        <button type="button" autoFocus aria-label="Fechar avatar ampliado" onClick={() => dialog.current?.close()}><X size={18} /></button>
      </header>
      <div className="rv-avatar-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Avatar de ${nome}`} />
      </div>
      <footer className="rv-avatar-footer"><span>Imagem de perfil</span><span>ESC para fechar</span></footer>
    </dialog>
  </>;
}
