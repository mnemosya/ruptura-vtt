/**
 * Tela do Técnico: Unidades de Campo, Função da rodada, Protocolo, Registro
 * e Operação Sincronizada. As Unidades continuam nas entidades `unit-N` do
 * estado de classe (o mesmo formato que o resto do Console lê); o que é só
 * desta tela fica em `estado.tecnico`.
 *
 * Nada aqui gasta PA: como nas telas da Face e do Infiltrador, o custo fica
 * escrito no botão e o jogador desconta. Cada comando entra na pilha do
 * DESFAZER (ver `applyClassCommand`), então tudo volta passo a passo.
 */
import type { ClassEntity, ClassPlayState } from "./classManagement";

export type ProtocoloUnidade = { gatilho: string; resposta: string };
export type FuncaoDaRodada = { id: string; cena: number; rodada: number };

export type TecnicoEstado = {
  /** Função executada por Unidade nesta rodada (vale só na cena e rodada gravadas). */
  fn?: Record<string, FuncaoDaRodada>;
  prot?: Record<string, ProtocoloUnidade>;
  /** Registro salvo por Unidade (ranking B). */
  reg?: Record<string, boolean>;
  /** PD de quem foi recolhida: volta com eles ao instalar de novo. */
  pdGuardado?: Record<string, number>;
  /** Roboticista: estado de cada máquina vinculada (chave = id do drone/robô). */
  maqs?: Record<string, EstadoMaquina>;
  /** Roboticista: comunicação com as máquinas interrompida. */
  semCom?: boolean;
  /** Tecelão: conectado à Trama e a posição de cada Unidade nela. */
  conectado?: boolean;
  trama?: Record<string, { doca: DocaTrama; comando?: ComandoTrama | null }>;
};

export const DOCAS_TRAMA = ["avatar", "acesso", "no", "bloqueio"] as const;
export type DocaTrama = (typeof DOCAS_TRAMA)[number];
export const COMANDOS_TRAMA = ["sistema", "unidade", "travar"] as const;
export type ComandoTrama = (typeof COMANDOS_TRAMA)[number];

/** PA e ações da rodada valem só na cena e rodada gravadas. */
export type EstadoMaquina = {
  pd?: number;
  pa?: { n: number; feitas: string[]; cena: number; rodada: number };
  /** Reconfiguração Modular: Sistema recebido de outra máquina. */
  extra?: { sistema: string; de: string } | null;
  /** Reconfiguração de Emergência: [ativo, reserva]. */
  troca?: [string, string] | null;
};

export type TecnicoAcao =
  | { op: "instalar"; unidade: number; forma: "posicionada" | "acoplada"; alvo?: string }
  | { op: "recolher"; unidade: number }
  | { op: "alvo"; unidade: number; alvo: string }
  | { op: "pd"; unidade: number; valor: number }
  | { op: "reparar"; unidade: number }
  | { op: "funcao"; unidade: number; funcao: string | null }
  | { op: "protocolo"; unidade: number; protocolo: ProtocoloUnidade | null }
  | { op: "registro"; unidade: number }
  | { op: "maquina"; id: string; pd?: number; acao?: string; custo?: number; pa?: number; extra?: { sistema: string; de: string } | null; troca?: [string, string] | null; alternar?: boolean }
  | { op: "novaRodada" }
  | { op: "comunicacao"; interrompida: boolean }
  | { op: "intrusao"; efeito: "acionar" | "interromper" | null }
  | { op: "conectar"; conectado: boolean }
  | { op: "trama"; unidade: number; doca: DocaTrama }
  | { op: "comando"; unidade: number; comando: ComandoTrama | null };

export const PD_UNIDADE = 10;
export const idUnidade = (j: number) => `unit-${j}`;

export function unidade(s: ClassPlayState, j: number): ClassEntity | undefined {
  return s.entities.find(e => e.id === idUnidade(j));
}

/** Função que a Unidade executou nesta rodada (ou null). */
export function funcaoDaRodada(s: ClassPlayState, j: number): string | null {
  const f = s.tecnico?.fn?.[j];
  return f && f.cena === s.scene && f.rodada === s.round ? f.id : null;
}

/** PA gastos pela máquina nesta rodada e as ações feitas. */
export function paDaMaquina(s: ClassPlayState, id: string): { n: number; feitas: string[] } {
  const p = s.tecnico?.maqs?.[id]?.pa;
  return p && p.cena === s.scene && p.rodada === s.round ? { n: p.n, feitas: p.feitas } : { n: 0, feitas: [] };
}

/** Intrusão Mecânica marcada nesta rodada. */
export const INTRUSAO = ["acionar", "interromper"] as const;

function aplicarMaquinas(s: ClassPlayState, t: TecnicoEstado, a: Extract<TecnicoAcao, { op: "maquina" | "novaRodada" | "comunicacao" | "intrusao" }>): string | null {
  switch (a.op) {
    case "comunicacao": t.semCom = a.interrompida || undefined; return null;
    case "intrusao":
      if (a.efeito === null) delete s.uses["round:intrusao"];
      else s.uses["round:intrusao"] = INTRUSAO.indexOf(a.efeito) + 1;
      return null;
    case "novaRodada":
      for (const m of Object.values(t.maqs ?? {})) delete m.pa;
      return null;
    case "maquina": {
      if (!a.id) return "Máquina inválida";
      const m: EstadoMaquina = ((t.maqs ??= {})[a.id] ??= {});
      if (a.pd !== undefined) { if (!Number.isInteger(a.pd) || a.pd < 0) return "PD inválido"; m.pd = a.pd; }
      if (a.pa !== undefined || a.acao !== undefined) {
        const atual = paDaMaquina(s, a.id);
        const n = a.pa ?? atual.n + (a.custo ?? 0);
        if (!Number.isInteger(n) || n < 0) return "PA inválido";
        const feitas = a.acao ? [...atual.feitas, a.acao] : n < atual.n ? atual.feitas.slice(0, Math.max(0, atual.feitas.length - (atual.n - n))) : atual.feitas;
        m.pa = { n, feitas, cena: s.scene, rodada: s.round };
      }
      if (a.extra !== undefined) m.extra = a.extra;
      if (a.troca !== undefined) m.troca = a.troca;
      if (a.alternar) s.uses["round:alternar"] = 1;
      return null;
    }
  }
}

/** Aplica a ação no estado (muta `s`). Devolve a mensagem de erro, se houver. */
export function aplicarTecnico(s: ClassPlayState, a: TecnicoAcao, maxUnidades: number): string | null {
  const t: TecnicoEstado = (s.tecnico ??= {});
  if (a.op === "maquina" || a.op === "novaRodada" || a.op === "comunicacao" || a.op === "intrusao") return aplicarMaquinas(s, t, a);
  // Olho de Botão: a primeira conexão da cena revela 2 níveis (fica marcado na cena).
  if (a.op === "conectar") { t.conectado = a.conectado || undefined; if (a.conectado && !s.uses["scene:olho"]) s.uses["scene:olho"] = 1; return null; }
  if (!Number.isInteger(a.unidade) || a.unidade < 0 || a.unidade >= maxUnidades) return "Unidade inválida";
  const k = String(a.unidade), u = unidade(s, a.unidade);
  const limpar = () => { delete t.fn?.[k]; delete t.reg?.[k]; delete t.trama?.[k]; };
  switch (a.op) {
    case "instalar": {
      if (u) return "Unidade já instalada";
      const alvo = a.alvo?.trim() ?? "";
      if (a.forma === "acoplada" && !alvo) return "Escolha onde acoplar";
      const pd = t.pdGuardado?.[k] ?? PD_UNIDADE;
      delete t.pdGuardado?.[k];
      s.entities.push({ id: idUnidade(a.unidade), name: `Unidade ${a.unidade + 1}`, kind: "unidade", value: pd, max: PD_UNIDADE,
        installation: a.forma === "acoplada" ? "attached" : "positioned", ...(a.forma === "acoplada" ? { attachment: alvo } : {}) });
      return null;
    }
    case "recolher":
      if (!u) return "Unidade não instalada";
      (t.pdGuardado ??= {})[k] = u.value ?? PD_UNIDADE;
      s.entities = s.entities.filter(e => e.id !== u.id);
      limpar();
      return null;
    case "alvo": {
      const alvo = a.alvo.trim();
      if (!u || u.installation !== "attached") return "Unidade não acoplada";
      if (!alvo) return "Escolha onde acoplar";
      u.attachment = alvo;
      return null;
    }
    case "pd":
      if (!u) return "Unidade não instalada";
      if (!Number.isInteger(a.valor) || a.valor < 0 || a.valor > PD_UNIDADE) return "PD inválido";
      u.value = a.valor;
      // Registro some se a Unidade ficar Inativa.
      if (a.valor <= 0) { delete t.reg?.[k]; if (t.trama?.[k]) t.trama[k].comando = null; }
      return null;
    case "reparar":
      if (!u) return "Unidade não instalada";
      u.value = PD_UNIDADE;
      return null;
    case "funcao":
      if (a.funcao === null) { delete t.fn?.[k]; return null; }
      if (!u) return "Unidade não instalada";
      if ((u.value ?? 0) <= 0) return "Unidade inativa";
      (t.fn ??= {})[k] = { id: a.funcao, cena: s.scene, rodada: s.round };
      return null;
    case "protocolo":
      if (a.protocolo === null) { delete t.prot?.[k]; return null; }
      if (!a.protocolo.gatilho.trim() || !a.protocolo.resposta) return "Protocolo incompleto";
      (t.prot ??= {})[k] = { gatilho: a.protocolo.gatilho.trim(), resposta: a.protocolo.resposta };
      return null;
    case "trama": {
      if (!DOCAS_TRAMA.includes(a.doca)) return "Posição inválida";
      const antes = t.trama?.[k];
      if (!u) {
        const pd = t.pdGuardado?.[k] ?? PD_UNIDADE;
        delete t.pdGuardado?.[k];
        s.entities.push({ id: idUnidade(a.unidade), name: `Unidade ${a.unidade + 1}`, kind: "unidade", value: pd, max: PD_UNIDADE, installation: "positioned" });
      }
      (t.trama ??= {})[k] = { doca: a.doca, comando: antes?.doca === a.doca ? antes.comando ?? null : null };
      delete t.fn?.[k];
      return null;
    }
    case "comando":
      if (!t.trama?.[k]) return "Unidade fora da Trama";
      if (a.comando !== null && !COMANDOS_TRAMA.includes(a.comando)) return "Comando inválido";
      t.trama[k].comando = a.comando;
      return null;
    case "registro":
      if (!u) return "Unidade não instalada";
      if (t.reg?.[k]) delete t.reg[k];
      else (t.reg ??= {})[k] = true;
      return null;
  }
}
