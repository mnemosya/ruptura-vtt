/**
 * Ícone por perícia — 21 IDs reais de `regras_personagem.pericias`
 * (não nomes bonitos inventados). Cada ícone é a melhor correspondência
 * semântica disponível no Lucide para o glifo do design; não é uma
 * cópia pixel-a-pixel do ícone original do Figma (não temos acesso ao
 * arquivo fonte dos ícones, só ao render) — trocável depois sem mexer
 * em mais nada.
 */

import {
  Sparkles,
  Palette,
  Target,
  Dna,
  Smile,
  Cog,
  Feather,
  MessagesSquare,
  Frown,
  Sigma,
  Swords,
  Footprints,
  Eye,
  Crosshair,
  Brain,
  Zap,
  Bot,
  Users,
  Atom,
  Dumbbell,
  Heart,
  type LucideIcon,
} from "lucide-react";

export const SKILL_ICONS: Record<string, LucideIcon> = {
  arcanismo: Sparkles,
  artes: Palette,
  balistica: Target,
  biologia: Dna,
  carisma: Smile,
  engenharia: Cog,
  furtividade: Feather,
  influencia: MessagesSquare,
  intimidacao: Frown,
  logica: Sigma,
  luta: Swords,
  mobilidade: Footprints,
  percepcao: Eye,
  precisao: Crosshair,
  psicologia: Brain,
  reflexos: Zap,
  robotica: Bot,
  sociedade: Users,
  tecnomagia: Atom,
  vigor: Dumbbell,
  vontade: Heart,
};
