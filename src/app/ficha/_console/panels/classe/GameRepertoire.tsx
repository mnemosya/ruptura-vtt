"use client";

import { Check, Plus, ChevronRight, Crosshair, Shield, Footprints, Backpack, Radio, RotateCcw, Swords, ScanEye, Wrench, Zap, Network, MessageSquare } from "lucide-react";
import { TextoComRegras } from "../../TextoComRegras";

export type RepertoireEntry = { id: string; name: string; description: string; category?: string };
function entryIcon(name: string) {
  if (/DEFESA|SAÍDA|ESTABILIZAÇÃO|DERIVAÇÃO/.test(name)) return Shield;
  if (/REPOSICIONAMENTO|INVESTIDA/.test(name)) return Footprints;
  if (/EQUIPAMENTO/.test(name)) return Backpack;
  if (/SINAL|MONITORAMENTO/.test(name)) return Radio;
  if (/PLANO|RESTAUR/.test(name)) return RotateCcw;
  if (/DIAGNÓSTICO|EXPOR/.test(name)) return ScanEye;
  if (/MANUTENÇÃO/.test(name)) return Wrench;
  if (/AMPLIFICAÇÃO|DESREGULAÇÃO/.test(name)) return Zap;
  if (/INTERFACE|RELÉ/.test(name)) return Network;
  if (/CALCULADA/.test(name)) return Crosshair;
  if (/CORTAR|DEMOLIÇÃO|GUARDA|FINTA/.test(name)) return Swords;
  return MessageSquare;
}
/** Rule cards keep consultation separate from changing the player's loadout. */
export function GameRepertoire({ entries, selected, onToggle, readOnly, max, compact = false }: {
  entries: RepertoireEntry[]; selected?: string[]; onToggle?: (id: string) => void;
  readOnly?: boolean; max?: number; compact?: boolean;
}) {
  return <div className={`hc-repertoire${compact ? " hc-repertoire--compact" : ""}`}>{entries.map((entry, index) => {
    const equipped = selected?.includes(entry.id);
    const Icon = entryIcon(entry.name.toUpperCase());
    const preview = entry.description.split(/\n\n/)[0].replace(/[*_]/g, "");
    return <article key={entry.id} className="hc-rule-card" data-equipped={equipped}>
      <div className="hc-rule-card-top"><span className="hc-rule-seal"><Icon size={22}/></span><span>{entry.category ?? "REPERTÓRIO"}</span><small>{String(index + 1).padStart(2, "0")}</small></div>
      <h4>{entry.name}</h4><p className="hc-rule-preview">{preview.length > 180 ? `${preview.slice(0, 177)}…` : preview}</p>
      <details><summary>Consultar efeito <ChevronRight size={14}/></summary><div className="hc-rule-description"><TextoComRegras glossario={[]} texto={entry.description}/></div></details>
      {onToggle && <button type="button" disabled={readOnly || (!equipped && max != null && (selected?.length ?? 0) >= max)} aria-pressed={!!equipped} onClick={() => onToggle(entry.id)}>{equipped ? <Check size={15}/> : <Plus size={15}/>} {equipped ? "Selecionado · retirar" : "Selecionar"}<span className="sr-only"> {entry.name}</span></button>}
    </article>;
  })}</div>;
}
