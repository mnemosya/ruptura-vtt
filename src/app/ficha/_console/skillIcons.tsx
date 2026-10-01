/**
 * Ícone por perícia — 22 IDs reais de `regras_personagem.pericias`
 * (não nomes bonitos inventados). Cada ícone é a melhor correspondência
 * semântica disponível no Lucide ou o SVG original do design.
 */

import type { ComponentType } from "react";
import {
  Sparkles,
  Palette,
  Dna,
  Smile,
  Cog,
  MessagesSquare,
  Angry,
  Eye,
  Crosshair,
  Brain,
  Bot,
  Users,
  Heart,
  Stethoscope,
} from "lucide-react";
import {
  BalisticaFigmaIcon,
  FurtividadeFigmaIcon,
  LogicaFigmaIcon,
  LutaFigmaIcon,
  MobilidadeFigmaIcon,
  ReflexosFigmaIcon,
  TecnomagiaFigmaIcon,
  VigorFigmaIcon,
} from "./figmaSkillIcons";

type SkillIcon = ComponentType<{ size?: number; strokeWidth?: number }>;

export const SKILL_ICONS: Record<string, SkillIcon> = {
  arcanismo: Sparkles,
  artes: Palette,
  balistica: BalisticaFigmaIcon,
  biologia: Dna,
  carisma: Smile,
  engenharia: Cog,
  furtividade: FurtividadeFigmaIcon,
  influencia: MessagesSquare,
  intimidacao: Angry,
  logica: LogicaFigmaIcon,
  luta: LutaFigmaIcon,
  medicina: Stethoscope,
  mobilidade: MobilidadeFigmaIcon,
  percepcao: Eye,
  precisao: Crosshair,
  psicologia: Brain,
  reflexos: ReflexosFigmaIcon,
  robotica: Bot,
  sociedade: Users,
  tecnomagia: TecnomagiaFigmaIcon,
  vigor: VigorFigmaIcon,
  vontade: Heart,
};
