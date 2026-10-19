"use client";

import { useState } from "react";
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
type Props = {
  entries: RepertoireEntry[]; selected?: string[]; onToggle?: (id: string) => void;
  readOnly?: boolean; max?: number; compact?: boolean;
};
/** Each effect is rendered once. Expanding reveals the remainder in place. */
export function GameRepertoire({ entries, compact = false, ...props }: Props) {
  return <div className={`hc-repertoire${compact ? " hc-repertoire--compact" : ""}`}>
    {entries.map(entry => <RepertoireCard key={entry.id} entry={entry} {...props} />)}
  </div>;
}
function RepertoireCard({ entry, selected, onToggle, readOnly, max }: Omit<Props, "entries" | "compact"> & { entry: RepertoireEntry }) {
  const [expanded, setExpanded] = useState(false);
  const equipped = selected?.includes(entry.id) ?? false;
  const Icon = entryIcon(entry.name.toUpperCase());
  const description = entry.description.replace(/\p{L}/u, letter => letter.toLocaleUpperCase("pt-BR"));
  const long = description.length > 240 || description.includes("\n");
  const preview = description.split(/\n\n/)[0].replace(/[*_]/g, "");
  return <article className="hc-rule-card" data-equipped={equipped} data-open={expanded} data-expanded={expanded || !long}>
    <header className="hc-rule-card-heading"><span className="hc-rule-seal"><Icon size={22} aria-hidden="true" /></span>
      <div><span className="hc-rule-category">{entry.category ?? "Repertório"}</span><h4>{entry.name}</h4></div>
      {equipped && <Check className="hc-rule-equipped" size={16} aria-label="Selecionado" />}
    </header>
    <div className="hc-rule-description">{long && !expanded ? <p>{preview.length > 190 ? `${preview.slice(0, 187).trimEnd()}…` : preview}</p> : <TextoComRegras glossario={[]} texto={description} />}</div>
    {(long || onToggle) && <footer className="hc-rule-actions">
      {long && <button type="button" className="hc-rule-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Recolher" : "Ver efeito completo"}<ChevronRight size={14}/><span className="sr-only"> {entry.name}</span></button>}
      {onToggle && <button type="button" className="hc-rule-select" disabled={readOnly || (!equipped && max != null && (selected?.length ?? 0) >= max)} aria-pressed={equipped} onClick={() => onToggle(entry.id)}>{equipped ? <Check size={15}/> : <Plus size={15}/>} {equipped ? "Equipado" : "Equipar"}<span className="sr-only"> {entry.name}</span></button>}
    </footer>}
  </article>;
}
