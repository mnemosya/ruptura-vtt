/**
 * Rota REAL do perfil: /perfil?userId=… — é onde se cai ao colar o
 * link, recarregar, ou navegar de fora de /mesas. Dentro de /mesas a
 * navegação é interceptada e o mesmo conteúdo abre em modal, sem
 * substituir a página de baixo.
 */

import { PerfilPageContent, type PerfilPageContentParams } from "./PerfilPageContent";
import { oxanium } from "../_design/oxanium";
import { teko } from "../_design/teko";

export const dynamic = "force-dynamic";

export default function PerfilPage({ searchParams }: { searchParams: Promise<PerfilPageContentParams> }) {
  return <div className={`rv-perfil-pagina ${teko.variable} ${oxanium.variable}`}><PerfilPageContent searchParams={searchParams} /></div>;
}
