import {
  Archive, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, AudioWaveform, Ban, Bot, Bug, ChevronsRight, CircleSlash, Copy,
  Crosshair, Dices, Download, Eraser, Eye, EyeOff, FileX, Fingerprint, Flame, Footprints, GitBranch, Grab, Hammer, Hand,
  HandHelping, IdCard, KeyRound, Link, Lock, LockOpen, Mountain, MoveRight, Network, Package, Plug, Power, Radar, RefreshCcw,
  Route, ScanEye, ScanSearch, Search, Settings, Shield, ShieldHalf, Shuffle, Sword, Swords, Target, Timer, Unlink, Unplug, Wind, Zap,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";

/** O mesmo ícone da ação no Console e na busca de comandos do chat. */
const ICONES: Record<string, ComponentType<LucideProps>> = {
  deslocar: Footprints, levantar: ArrowUpFromLine, escapar: Unlink, esconder_se: EyeOff, interagir: Hand, sacar_guardar_trocar: ArrowLeftRight,
  recarregar: RefreshCcw, atacar: Sword, agarrar: Grab, estrangular: CircleSlash, derrubar: ArrowDownToLine, empurrar: MoveRight, desarmar: Ban,
  fintar: Shuffle, aparar: Swords, bloquear: Shield, esquivar: Wind, resistir: Mountain, mirar: Crosshair, acessar_trama: Network,
  preparar_turno: Timer, usar_pericia: Dices, postura_defensiva: ShieldHalf, postura_ofensiva: Flame, falar: Hand, gestos_rapidos: Hand,
  investigar: Search, vasculhar: ScanSearch, preservar: Archive, correlacionar: Link, acessar: KeyRound, arrombar: Hammer, auxiliar: HandHelping,
  utilizar_recurso: Package, conectar: Plug, avancar: ChevronsRight, sondar: Radar, examinar: ScanEye, monitorar: Eye, forcar_rota: Route,
  criar_ruido: AudioWaveform, desligar: Power, desplugar: Unplug, despistar: Shuffle, ofuscar: EyeOff, expor_nucleo: Target, pulso_sinaptico: Zap,
  controlar_sistema: Settings, controlar_unidade: Bot, quebrar_bloqueio: LockOpen, travar_acesso: Lock, extrair_dados: Download,
  corromper_dados: FileX, instalar_virus: Bug, forjar_credencial: IdCard, modificar_assinatura: Fingerprint, apagar_rastros: Eraser,
};

export function iconeDaAcao(slug: string, classe = false): ComponentType<LucideProps> {
  return ICONES[slug] ?? (classe ? GitBranch : Copy);
}
