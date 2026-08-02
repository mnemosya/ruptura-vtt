"use client";

/**
 * Só existe para injetar `router.back()` como "fechar o Console" via
 * `ConsoleCloseProvider` — a única razão de ser "use client" aqui,
 * separado de `page.tsx` (Server Component, para poder renderizar
 * `FichaPageContent` async por dentro).
 */

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ConsoleCloseProvider } from "../../../ficha/_console/ConsoleCloseContext";

export function ConsoleModalWrapper({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <ConsoleCloseProvider onClose={() => router.back()}>{children}</ConsoleCloseProvider>;
}
