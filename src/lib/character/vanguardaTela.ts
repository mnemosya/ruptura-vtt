/**
 * Tela de classe da Vanguarda (pranchetas aprovadas: A1 Núcleo, BK2, CC1/CC4, CL2, GD2).
 *
 * O Ímpeto vive em `ClassPlayState.resource`; aqui ficam o registro da cena e os
 * estados das subclasses. Limites "1× por rodada/cena" só ficam marcados em
 * `uses` e nunca bloqueiam. Efeitos "até o início do seu próximo turno" guardam a
 * rodada em que começaram e valem só nela (Limite Rompido: até o fim do próximo turno).
 */
import type { ClassPlayState } from "./classManagement";

export type RegistroImpeto = { tipo: "recebeu" | "usou" | "perdeu"; nome: string; det: string; rodada: number };
export type VanguardaEstado = {
  registro: RegistroImpeto[];
  /** Berserker: em Fúria até o final da cena. */
  furia?: boolean;
  /** Rodada em que começou: Limite Rompido, Centro da Batalha, Ninguém Fica Para Trás. */
  limite?: number;
  centro?: number;
  ninguem?: number;
  /** Guardião: escudo transformado em Abrigo Móvel e a rodada. */
  abrigo?: { escudo: string; rodada: number };
};
export type VanguardaAcao =
  | { op: "receber"; fonte: "adjacente" | "dor" }
  | { op: "gastar"; uso: "avancar" | "pressionar"; n: number }
  | { op: "perder" }
  | { op: "irrefreavel" }
  | { op: "furia"; via: "pv" | "impeto" | "sair" }
  | { op: "contra" }
  | { op: "negar" }
  | { op: "limite" }
  | { op: "absorver" }
  | { op: "abrirCaminho"; manobra: "Empurrar" | "Derrubar" }
  | { op: "centro"; valor: boolean }
  | { op: "interceptar" }
  | { op: "bloqueio"; escudo: string; ok: boolean }
  | { op: "abrigo"; escudo: string }
  | { op: "guarda" }
  | { op: "ninguem"; valor: boolean };
export type ContextoVanguarda = { max: number; rank: string; sub?: string; corpo: number };

const RANKS = ["F", "E", "D", "C", "B", "A", "S", "S+"];
const chegou = (rank: string, alvo: string) => RANKS.indexOf(rank) >= RANKS.indexOf(alvo);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const impetos = (n: number) => plural(n, "Ímpeto", "Ímpetos");

export function estadoVanguarda(s: Pick<ClassPlayState, "vanguarda">): VanguardaEstado {
  return s.vanguarda ?? { registro: [] };
}
/** Efeito ativo "até o início do seu próximo turno" (rodada em que começou). */
export const ativoNaRodada = (inicio: number | undefined, rodada: number) => inicio !== undefined && inicio === rodada;
/** Limite Rompido: até o final do seu próximo turno. */
export const limiteAtivo = (v: VanguardaEstado, rodada: number) => v.limite !== undefined && rodada <= v.limite + 1;

/** Aplica um passo da tela; devolve o erro ou null. */
export function aplicarVanguarda(s: ClassPlayState, a: VanguardaAcao, ctx: ContextoVanguarda): string | null {
  const v: VanguardaEstado = structuredClone(estadoVanguarda(s));
  const sub = (slug: string, rank: string) => ctx.sub === slug && chegou(ctx.rank, rank);
  const reg = (tipo: RegistroImpeto["tipo"], nome: string, det: string) => { v.registro = [...v.registro, { tipo, nome, det, rodada: s.round }]; };
  const gastar = (n: number) => { s.resource -= n; };
  const centro = ativoNaRodada(v.centro, s.round), ninguem = ativoNaRodada(v.ninguem, s.round);

  switch (a.op) {
    case "receber": {
      if (a.fonte === "dor") {
        if (!sub("berserker", "E")) return "Dor é Combustível indisponível";
        const ganha = s.resource < ctx.max;
        if (ganha) s.resource++;
        s.uses["round:dor"] = 1;
        reg("recebeu", "Dor é Combustível", ganha ? "Recebeu 1 Ímpeto pela perda de PV · pode se deslocar 2 m em direção à criatura." : "Perda de PV · pode se deslocar 2 m em direção à criatura.");
        break;
      }
      if (s.resource >= ctx.max) return "Ímpeto no limite";
      s.resource++;
      s.uses["round:adjacente"] = 1;
      reg("recebeu", "Ponta de Lança", "Recebeu 1 Ímpeto adjacente a uma criatura hostil.");
      break;
    }
    case "gastar": {
      if (!Number.isInteger(a.n) || a.n < 1 || a.n > s.resource) return "Ímpeto insuficiente";
      if (a.uso === "pressionar" && !chegou(ctx.rank, "D")) return "Pressionar disponível no ranking D";
      const terreno = sub("colosso", "C") ? ", ignorando terreno difícil" : "";
      gastar(a.n);
      if (a.uso === "pressionar") reg("usou", "Pressionar", `Gastou ${impetos(a.n)} · +${a.n} de margem de sucesso.`);
      else reg("usou", chegou(ctx.rank, "D") ? "Avançar" : "Deslocamento", `Gastou ${impetos(a.n)} · ${a.n * 2} m sem gastar PA${terreno}.`);
      break;
    }
    case "perder": {
      if (!s.resource) return "Sem Ímpeto";
      reg("perdeu", "Ímpetos perdidos", `Perdeu ${impetos(s.resource)}.`);
      s.resource = 0;
      break;
    }
    case "irrefreavel": {
      if (!chegou(ctx.rank, "S")) return "Avanço Irrefreável disponível no ranking S";
      if (s.resource < 1 || s.resource >= ctx.max) return "Sem Ímpeto para recuperar";
      s.resource++;
      s.uses["round:irrefreavel"] = 1;
      reg("recebeu", "Avanço Irrefreável", "Recuperou 1 Ímpeto depois do gasto.");
      break;
    }
    case "furia": {
      if (!sub("berserker", "E")) return "Fúria indisponível";
      if (a.via === "sair") { v.furia = false; reg("perdeu", "Fúria encerrada", "Saiu da Fúria."); break; }
      if (a.via === "impeto") {
        if (s.resource < 2) return "Ímpeto insuficiente";
        gastar(2);
        reg("usou", "Fúria", "Gastou 2 Ímpetos depois de Dor é Combustível · em Fúria até o final da cena.");
      } else reg("recebeu", "Fúria", "PV à metade ou menos · em Fúria até o final da cena.");
      v.furia = true;
      break;
    }
    case "contra": {
      if (!sub("berserker", "C")) return "Contra-Ataque indisponível";
      if (s.resource < 2) return "Ímpeto insuficiente";
      gastar(2);
      s.uses["round:contra"] = 1;
      reg("usou", "Contra-Ataque", `Gastou 2 Ímpetos e uma Reação · ataque corpo a corpo imediato${v.furia ? " com +1 de vantagem" : ""}.`);
      break;
    }
    case "negar": {
      if (!sub("berserker", "C") || !v.furia) return "Negar a Dor só em Fúria";
      if (s.resource < 2) return "Ímpeto insuficiente";
      gastar(2);
      s.uses["scene:negar"] = 1;
      reg("usou", "Negar a Dor", "Gastou 2 Ímpetos · sofreu metade da perda de PV, arredondada para cima.");
      break;
    }
    case "limite": {
      if (!sub("berserker", "A") || !v.furia) return "Limite Rompido só em Fúria";
      s.resource = ctx.max;
      s.uses["scene:limite"] = 1;
      v.limite = s.round;
      reg("recebeu", "Limite Rompido", "Recebeu Ímpeto até o limite · até o final do seu próximo turno.");
      break;
    }
    case "absorver": {
      if (!sub("colosso", "E")) return "Absorver Impacto indisponível";
      if (centro) { reg("usou", "Absorver Impacto", `Centro da Batalha · reduziu a perda de PV em ${ctx.corpo} sem gastar Ímpeto.`); break; }
      if (s.resource < 1) return "Ímpeto insuficiente";
      gastar(1);
      s.uses["round:absorver"] = 1;
      reg("usou", "Absorver Impacto", `Gastou 1 Ímpeto · reduziu a perda de PV em ${ctx.corpo} (Corpo).`);
      break;
    }
    case "abrirCaminho": {
      if (!sub("colosso", "C")) return "Abrir Caminho indisponível";
      s.uses["round:abrir"] = 1;
      reg("usou", `Abrir Caminho · ${a.manobra}`, `${a.manobra} sem gastar PA antes de entrar no espaço da criatura.`);
      break;
    }
    case "centro": {
      if (!sub("colosso", "A")) return "Centro da Batalha indisponível";
      if (a.valor) {
        s.uses["scene:centro"] = 1;
        v.centro = s.round;
        reg("recebeu", "Centro da Batalha", "Até o início do seu próximo turno: Absorver Impacto sem gastar Ímpeto, não pode ser movido nem ficar Caído, um ataque corpo a corpo por turno estendido a uma segunda criatura.");
      } else { delete v.centro; reg("perdeu", "Centro da Batalha encerrado", "Início do seu próximo turno."); }
      break;
    }
    case "interceptar": {
      if (!sub("guardiao", "E")) return "Interceptar indisponível";
      if (ninguem) { reg("usou", "Interceptar", "Ninguém Fica Para Trás · deslocou-se até 4 m sem gastar Ímpeto para Bloquear."); break; }
      if (s.resource < 1) return "Ímpeto insuficiente";
      gastar(1);
      s.uses["round:interceptar"] = 1;
      reg("usou", "Interceptar", "Gastou 1 Ímpeto · deslocou-se até 2 m, adjacente ao aliado, antes da resolução do ataque.");
      break;
    }
    case "bloqueio": {
      if (!sub("guardiao", "E")) return "Bloqueio indisponível";
      if (!a.ok) { reg("perdeu", `Bloquear · ${a.escudo}`, "O ataque não foi interceptado."); break; }
      const ganha = !s.uses["round:protetor"] && s.resource < ctx.max;
      if (ganha) { s.resource++; s.uses["round:protetor"] = 1; }
      reg("recebeu", `Bloquear · ${a.escudo}`, ganha ? "Ataque interceptado · Ímpeto Protetor: recebeu 1 Ímpeto." : "Ataque interceptado.");
      break;
    }
    case "abrigo": {
      if (!sub("guardiao", "C")) return "Abrigo Móvel indisponível";
      if (s.resource < 1) return "Ímpeto insuficiente";
      gastar(1);
      v.abrigo = { escudo: a.escudo, rodada: s.round };
      reg("usou", `Abrigo Móvel · ${a.escudo}`, "Gastou 1 Ímpeto · aliados adjacentes recebem a cobertura do escudo até o início do seu próximo turno.");
      break;
    }
    case "guarda": {
      if (!sub("guardiao", "E")) return "Posição de Guarda indisponível";
      s.uses["scene:guarda"] = 1;
      reg("recebeu", "Posição de Guarda", "Assumiu Postura Defensiva sem gastar PA.");
      break;
    }
    case "ninguem": {
      if (!sub("guardiao", "A")) return "Ninguém Fica Para Trás indisponível";
      if (a.valor) {
        s.uses["scene:ninguem"] = 1;
        v.ninguem = s.round;
        reg("recebeu", "Ninguém Fica Para Trás", "Até o início do seu próximo turno: Interceptar a até 4 m, sem limite por rodada e sem gastar Ímpeto.");
      } else { delete v.ninguem; reg("perdeu", "Ninguém Fica Para Trás encerrado", "Início do seu próximo turno."); }
      break;
    }
  }
  s.vanguarda = v;
  return null;
}
