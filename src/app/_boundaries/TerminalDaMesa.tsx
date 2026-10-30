/**
 * "TERMINAL DA MESA" — o loading antigo de entrada na campanha, guardado.
 *
 * Era o `loading.tsx` de `/mesas/[campaignId]` ("Carregando mesa") e a
 * espera de cena do `VttClient` ("Carregando cena"): o `BootPanel` na
 * variante `campaign-terminal`, sobre o palco `mo-boot-stage--campaign`.
 * Saiu de cena em 29/10/2026, quando a entrada na mesa passou a usar a
 * cortina da V1 (`mesas/_global/CortinaDaMesa.tsx`).
 *
 * Fica aqui, sem uso, para poder voltar: basta renderizar
 * `<TerminalDaMesa />` onde a cortina está (ou recriar o `loading.tsx`
 * da campanha devolvendo este componente). O CSS continua em
 * `_design/motion.css` (`.mo-boot-stage--campaign`) e no `BootPanel`.
 */
import { BootPanel } from "./BootPanel";

export function TerminalDaMesa({ label = "Carregando mesa" }: { label?: string }) {
  return (
    <main className="mo-boot-stage mo-boot-stage--campaign mo-scope" aria-busy="true" data-testid="campaign-loading">
      <BootPanel label={label} variante="campaign-terminal" />
    </main>
  );
}
