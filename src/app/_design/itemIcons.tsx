import type { ComponentType } from "react";
import { AmmoIcon } from "./AmmoIcon";
import { ArmorIcon } from "./ArmorIcon";
import { WeaponIcon } from "./WeaponIcon";
import { weaponIconForName } from "./weaponIconMapping";
import { Bike, Bomb, Bot, CircuitBoard, Cpu, Cross, Droplet, Footprints, Hand, Headphones, Package, Pill, Puzzle, Syringe,  ShieldHalf, Shirt, Swords, UserRound, Wrench, type LucideProps } from "lucide-react";

/** Identidade visual compartilhada entre mercado, inventário e equipamentos. */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  arma: Swords, armas: Swords,
  armadura: ArmorIcon, armaduras: ArmorIcon, armaduras_e_escudos: ArmorIcon,
  escudo: ShieldHalf, escudos: ShieldHalf,
  acessorio: Headphones, acessorios: Headphones,
  dispositivo: CircuitBoard, dispositivos_tecnologicos: CircuitBoard,
  drones_e_robos: Bot, drone: Bot,
  escalpo: Cpu, escalpos: Cpu, modulo_escalpo: Puzzle,
  veneno: Droplet, farmacia: Pill,
  ferramenta: Wrench, ferramentas_e_utilidades: Wrench,
  municao: AmmoIcon, explosivo: Bomb, explosivos: Bomb,
  veiculo: Bike, mobilidade: Bike, modulo_veicular: Wrench,
  traje: Shirt, trajes: Shirt, vertina: Syringe, vertinas: Syringe,
  acesso_rapido: Cross,
  cabeca: UserRound, tronco: Shirt, membro_superior: Hand, membro_inferior: Footprints,
};
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");

export function ItemCategoryIcon({ category, group, weaponName, ...props }: LucideProps & { category: string; group?: string; weaponName?: string }) {
  const weapon = ["arma", "armas"].includes(key(category)) || group && key(group) === "armas" ? weaponIconForName(weaponName) : null;
  if (weapon) return <WeaponIcon weapon={weapon} {...props} />;
  const Icon = ICONS[key(category)] ?? (group ? ICONS[key(group)] : undefined) ?? Package;
  return <Icon aria-hidden="true" focusable="false" {...props} />;
}
