"use client";

/**
 * ROLADOR DE DADOS — controles no visual literal do design em
 * `chat % dice tray/src/components/dice.tsx`, MAS a física não mora
 * mais aqui dentro. Antes cada pool (teste, conjunto livre) montava
 * sua própria `PhysicsDiceArena` numa caixinha do painel — a bandeja
 * do estudo de origem. A mesa real segue o Foundry: rolar joga os
 * dados sobre o PALCO inteiro (`MesaDadosOverlay`, montado uma vez por
 * mesa), e este componente só pede a rolagem via `useRolarNaMesa` e
 * espera o resultado. Enquanto a física roda lá fora, o ícone chato
 * (`PolyDie`) do conjunto pulsa aqui — é só o retrato do pedido, não
 * mais o palco dele.
 *
 * Como o projeto não usa Tailwind, cada utilitário do arquivo original
 * virou estilo inline com o MESMO valor — tamanho, tracking, cor e peso
 * são os do design, não uma aproximação.
 *
 * ROLAGEM DE VERDADE (não mais maquete): os atributos e perícias vêm da
 * FICHA do personagem, lidos no servidor (`_painel/acoes/rolagemPainel`),
 * a regra é a do sistema (`lib/dice` — maior de Nd8 + perícia + mod, e
 * as seis faixas de margem), e o resultado é GRAVADO no `table_logs`
 * como `rolagem_pericia`/`rolagem_expressao` — o mesmo tipo que a aba
 * Rolagens do Console grava e que o Chat da mesa já sabe desenhar.
 *
 * O que este rolador NÃO faz, de propósito: talentos que mexem na
 * rolagem (dado de gatilho, promoção de margem, tokens de aliado) e a
 * automação de condições continuam no Console — aqui é o teste puro.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Eye, Lock, Minus, Plus, Users } from "lucide-react";
import { createPortal } from "react-dom";
import { PolyDie } from "./PolyDie";
import {
  ACCENTS, BODY, CampoCD, DISPLAY, aoPassarMouse, DadosLivres, DadosRolados, FaixaResultado, FaixaSoma, GroupLabel, INK, INK_DIM, INK_FAINT, MONO,
  RESULTS, RollButton, Select, SeletorVisibilidade, Stack, Stepper, VISIBILIDADES,
  type Accent, type ResultKey,
} from "./ResultadoRolagem";
import type { PhysicsDieSpec } from "./ArenaDados";
import { useRolarNaMesa } from "./ContextoMesaDados";
import { CARGA_MAX_MS } from "./lancamento";
import { Chevron, Dice } from "./icones";
import {
  lerContextoRolagemAction,
  registrarRolagemLivreAction,
  registrarRolagemPericiaAction,
  type ContextoRolagem,
  type FichaRolagem,
} from "../_painel/acoes/rolagemPainel";
import type { TableLogVisibility } from "../../../../../lib/table";
import { getRupturaPool, type RupturaSelectionMode } from "../../../../../lib/dice";

/* Tokens do design, faixas de margem e as peças de RESULTADO moram em
   `ResultadoRolagem.tsx` — o Console do Personagem desenha o resultado
   dele com as MESMAS, e uma cópia aqui viraria duas versões da mesma
   faixa pra divergirem com o tempo. */

const LOOSE = [4, 6, 8, 10, 12, 20, 100];

/** Como o conjunto livre conta: somando tudo, ou pegando o maior ou o menor. */
type CountMode = "sum" | "high" | "low";

function ModeToggle({ value, onChange }: { value: CountMode; onChange: (m: CountMode) => void }) {
  const opts: { k: CountMode; label: string }[] = [
    { k: "sum", label: "Somar" },
    { k: "high", label: "Maior" },
    { k: "low", label: "Menor" },
  ];
  return (
    <div className="rv-dados-modo" style={{ display: "inline-flex", borderRadius: 0, border: "1px solid var(--fj-fundo-7, #1c2b45)" }}>
      {opts.map((o) => {
        const on = o.k === value;
        return (
          <button key={o.k} type="button" onClick={() => onChange(o.k)} aria-pressed={on}
            style={{
              padding: "6px 10px", border: 0, cursor: "pointer",
              fontFamily: DISPLAY, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em",
              color: on ? ACCENTS.arcane.hex : "#6f83a3", background: on ? ACCENTS.arcane.soft : "transparent",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---- conjunto livre ---------------------------------------------- */

/**
 * Estado + rolagem do conjunto livre, separado do desenho: a bandeja do
 * chat (`FreePool`) e a janela da linha F (`RoladorDadosF`) mostram o
 * mesmo conjunto de jeitos diferentes, e a regra (d100 = dois d10,
 * registro no log) não pode ter duas cópias.
 */
function useLivre({
  initial = { 8: 1 } as Record<number, number>, defaultMode = "sum" as CountMode,
  campaignId = null, characterId = null, visibilidade = "public" as TableLogVisibility,
}: {
  initial?: Record<number, number>; defaultMode?: CountMode;
  campaignId?: string | null; characterId?: string | null; visibilidade?: TableLogVisibility;
}) {
  const [counts, setCounts] = useState<Record<number, number>>(initial);
  const [mods, setMods] = useState(0);
  const [cdInput, setCdInput] = useState("");
  const [mode, setMode] = useState<CountMode>(defaultMode);
  const [results, setResults] = useState<{ sides: number; value: number }[] | null>(null);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState(false);
  const [liveCharge, setLiveCharge] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const rolarNaMesa = useRolarNaMesa();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const add = (s: number) => { if (rolling) return; setResults(null); setCounts((c) => ({ ...c, [s]: (c[s] || 0) + 1 })); };
  const dec = (s: number) => { if (rolling) return; setResults(null); setCounts((c) => { const n = { ...c }; if ((n[s] || 0) > 1) n[s]--; else delete n[s]; return n; }); };
  const clear = () => { if (rolling) return; setResults(null); setCounts({}); setMods(0); setCdInput(""); };

  /** CD digitada, ou `null` enquanto o campo estiver vazio/ilegível. */
  const cdNumero = (() => {
    if (cdInput.trim() === "") return null;
    const n = Number.parseInt(cdInput, 10);
    return Number.isFinite(n) ? n : null;
  })();

  /* conjunto achatado, derivado das contagens */
  const pool = LOOSE.flatMap((s) => Array.from({ length: counts[s] || 0 }, () => s));

  const roll = async (forca: number) => {
    if (rolling || pool.length === 0 || !rolarNaMesa) return;
    setRolling(true);
    setLanded(false);
    setResults(null);
    setErro(null);
    /**
     * UM d100 SÃO DOIS d10 na mesa — dezena e unidade.
     *
     * Não existe peça de cem faces: percentil se rola com um d10 de
     * dezenas (00, 10, … 90) e um d10 comum (1 a 10), e a soma das
     * duas faces dá 1 a 100 sem caso especial — 00+1 é 1, 90+10 é 100,
     * e cada valor sai de exatamente uma combinação, então a
     * distribuição é uniforme de verdade.
     *
     * Por isso a MESA recebe dois corpos por d100, mas o conjunto na
     * janela continua mostrando UMA peça com o total: quem pediu um
     * d100 pediu um número de 1 a 100, não dois números pra somar de
     * cabeça. `mapa` liga o que foi pedido ao que caiu.
     */
    const dice: PhysicsDieSpec[] = [];
    const mapa: number[][] = [];
    pool.forEach((sides, index) => {
      if (sides === 100) {
        mapa[index] = [dice.length, dice.length + 1];
        dice.push({ id: `free-${index}-dez`, sides: 100 }, { id: `free-${index}-uni`, sides: 10 });
      } else {
        mapa[index] = [dice.length];
        dice.push({ id: `free-${index}`, sides });
      }
    });
    const final = await rolarNaMesa(dice, ACCENTS.arcane.hex, forca);
    const juntados = pool.map((sides, index) => ({
      sides,
      value: mapa[index].reduce((t, j) => t + (final[j]?.value ?? 0), 0),
    }));
    setResults(juntados);
    setRolling(false);
    setLanded(true);
    setTimeout(() => setLanded(false), 500);

    // Fora de uma mesa (harness `/dev/dados`) a rolagem é só ensaio —
    // não existe log pra gravar. Dentro dela, vira registro.
    if (!campaignId) return;
    const r = await registrarRolagemLivreAction({
      campaignId,
      characterId,
      // O log guarda o que foi PEDIDO: um d100 é uma linha de 1–100,
      // não as duas peças que a física usou pra chegar nela (a de
      // dezenas chega a sair 0, que o servidor recusa — e com razão,
      // porque 0 não é resultado de dado nenhum).
      dados: juntados.map((d) => ({ faces: d.sides, valor: d.value })),
      modificador: mods,
      modo: mode,
      cd: cdNumero,
      visibilidade,
    });
    if (!r.ok) setErro(r.erro ?? "Falha ao registrar a rolagem.");
  };

  const valores = results?.map((d) => d.value) ?? [];
  const diceBase = results ? (mode === "high" ? Math.max(...valores) : mode === "low" ? Math.min(...valores) : valores.reduce((a, b) => a + b, 0)) : 0;
  const bestIdx = results && mode !== "sum" ? valores.indexOf(diceBase) : -1;
  const finalSum = diceBase + mods;

  return {
    counts, mods, setMods, cdInput, setCdInput, mode, setMode, results, rolling, landed, liveCharge, setLiveCharge,
    erro, total, pool, add, dec, clear, roll, cdNumero, diceBase, bestIdx, finalSum, podeRolar: !!rolarNaMesa,
  };
}

function FreePool({
  size = 46, solidRoll = false, initial = { 8: 1 } as Record<number, number>, defaultMode = "sum" as CountMode,
  campaignId = null, characterId = null, visibilidade = "public" as TableLogVisibility,
}: {
  size?: number; solidRoll?: boolean; initial?: Record<number, number>; defaultMode?: CountMode;
  campaignId?: string | null; characterId?: string | null; visibilidade?: TableLogVisibility;
}) {
  const {
    counts, mods, setMods, cdInput, setCdInput, mode, setMode, results, rolling, landed, liveCharge, setLiveCharge,
    erro, total, pool, add, dec, clear, roll, cdNumero, diceBase, bestIdx, finalSum, podeRolar,
  } = useLivre({ initial, defaultMode, campaignId, characterId, visibilidade });
  const dieSize = size - 4;

  return (
    // `gap` igual ao do teste de Ruptura (`<Stack gap={20}>`): as duas
    // abas são a mesma janela e estavam respirando diferente.
    <Stack gap={20}>
      {/* paleta — clique adiciona, botão direito remove */}
      <div>
        <GroupLabel>Dados</GroupLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {LOOSE.map((s) => {
            const n = counts[s] || 0;
            return (
              <button key={s} type="button" onClick={() => add(s)} onContextMenu={(e) => { e.preventDefault(); dec(s); }}
                title={`d${s} — clique adiciona · direito remove`} aria-label={`Adicionar d${s}`}
                style={{ position: "relative", border: 0, padding: 0, background: "transparent", cursor: "pointer", transition: "transform .15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}>
                {/* Silhueta limpa + nome EMBAIXO. Dentro do dado o
                    número lia como face sorteada, que é o que ele
                    significa no conjunto logo abaixo — duas coisas
                    diferentes com a mesma cara. E "100" não cabia
                    dentro sem encolher a tipografia dos outros. */}
                <PolyDie sides={s} semValor active={n > 0} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={size} />
                <span style={{ display: "block", marginTop: 5, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: n > 0 ? ACCENTS.arcane.hex : INK_DIM }}>
                  d{s}
                </span>
                {n > 0 && (
                  <span style={{ position: "absolute", right: -4, top: -4, display: "flex", height: 16, minWidth: 16, alignItems: "center", justifyContent: "center", padding: "0 4px", borderRadius: 999, background: ACCENTS.arcane.hex, color: "#08111c", fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* conjunto — ícones individuais (sem chips). Enquanto a mesa
          rola, os mesmos ícones pulsam: o espetáculo está lá fora, não
          aqui — este é só o retrato do pedido. */}
      {/* Sem `minHeight` fixo: com o conjunto vazio a faixa reservada
          virava uma tira em branco entre a paleta e o modo. O espaço
          aparece junto com a primeira peça escolhida. */}
      <div style={{ minHeight: 36, display: total === 0 ? "none" : undefined }}>
        {total === 0 ? null : (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            {pool.map((s, i) => {
              // Tremor durante a CARGA — porte literal de `charge
              // dice/src/components/dice.tsx` (`FreePool`).
              const tremendo = liveCharge > 0 && !rolling;
              return (
                <button key={i} type="button" onClick={() => dec(s)} disabled={rolling} title="clique para remover"
                  style={{
                    border: 0, padding: 0, background: "transparent", cursor: rolling ? "default" : "pointer", transition: "transform .15s",
                    ...(tremendo ? {
                      animation: `rup-charge-shake ${(0.15 - liveCharge * 0.08).toFixed(3)}s ${i * 0.022}s linear infinite`,
                      opacity: 0.55 + liveCharge * 0.45,
                      ["--shake-x" as string]: `${(0.5 + liveCharge * 3.5).toFixed(1)}px`,
                      ["--shake-r" as string]: `${(0.2 + liveCharge * 1.4).toFixed(2)}deg`,
                    } : undefined),
                  }}
                  onMouseEnter={(e) => { if (!rolling) e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}>
                  {rolling ? (
                    <span className="rv-dados-rolando" style={{ animationDelay: `${(i % 6) * 0.06}s` }}>
                      <PolyDie sides={s} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={dieSize} />
                    </span>
                  ) : results ? (
                    <PolyDie sides={s} value={results[i]?.value} active={i === bestIdx} landed={landed} rollIndex={i} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={dieSize} />
                  ) : (
                    <PolyDie sides={s} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={dieSize} />
                  )}
                </button>
              );
            })}
            <button type="button" onClick={clear} disabled={rolling}
              {...(rolling ? {} : aoPassarMouse({ color: ACCENTS.danger.hex }))}
              style={{ marginLeft: 4, border: 0, background: "transparent", cursor: rolling ? "default" : "pointer", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT, transition: "color .14s" }}>limpar</button>
          </div>
        )}
      </div>

      {/* contagem + modificador — mesma linha, mesma altura */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
        <ModeToggle value={mode} onChange={setMode} />
        <Stepper value={mods} onChange={setMods} />
      </div>

      {rolling && <span className="rv-dados-status">rolando na mesa…</span>}

      {/* total */}
      {results && !rolling && (
        <div className="rup-reveal">
          {/* Mesmo componente que o card do chat desenha
              (`FaixaSoma`) — o desenho desta faixa saiu daqui de
              dentro justamente pra que os dois não divirjam. */}
          <FaixaSoma base={diceBase} modificador={mods} total={finalSum} cd={cdNumero} modo={mode} testId="resultado-dados" />
        </div>
      )}

      {erro && <ErroRolagem texto={erro} />}

      {/* Mesma CD do teste de Ruptura. Aqui ela decide
          só SUCESSO (total ≥ CD): faixa de margem é regra do teste de
          d8, não de uma soma qualquer de dados. */}
      <CampoCD value={cdInput} onChange={setCdInput} />

      <RollButton label={total === 0 ? "Escolha dados" : rolling ? "Rolando…" : `Rolar ${total} dado${total !== 1 ? "s" : ""}`} disabled={total === 0 || rolling || !podeRolar} solid={solidRoll} onRoll={roll} onChargeChange={setLiveCharge} />
    </Stack>
  );
}

/* ================================================================== */
/*  Leitura do teste de Ruptura                                        */
/* ================================================================== */

/**
 * Resultado JÁ RESOLVIDO PELO SERVIDOR. O cliente não recalcula nada:
 * ele manda as faces que a física produziu e recebe de volta o teste
 * fechado (total, sucesso, margem), do mesmo jeito que o Console
 * resolve. Assim não existem duas versões da regra pra divergir.
 */
type Roll = {
  dados: number[];
  maiorDado: number;
  quantidadeDados: number;
  modoSelecao: RupturaSelectionMode;
  atributo: string;
  atributoValor: number;
  pericia: string | null;
  periciaValor: number;
  modificador: number;
  total: number;
  cd: number | null;
  sucesso: boolean | null;
  classificacao: ResultKey | null;
};

const SEM_PERICIA = "";

/**
 * Estado do teste de Ruptura, agora amarrado à FICHA de verdade.
 *
 * `ficha` chega do servidor (`lerContextoRolagemAction`); sem ela não
 * há teste — o rolador mostra o motivo em vez de inventar atributos.
 */
function useTest(campaignId: string | null, ficha: FichaRolagem | null, visibilidade: TableLogVisibility) {
  const [atributoId, setAtributoId] = useState("");
  const [periciaId, setPericiaId] = useState(SEM_PERICIA);
  const [mods, setMods] = useState(0);
  const [cdInput, setCdInput] = useState("");
  const [roll, setRoll] = useState<Roll | null>(null);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState(false);
  const [carga, setCarga] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const rolarNaMesa = useRolarNaMesa();

  // Troca de personagem zera a escolha: um atributo do personagem
  // anterior não faz sentido no novo, e um resultado velho embaixo de
  // outra ficha é pior que nenhum.
  useEffect(() => {
    setAtributoId(ficha?.atributos[0]?.id ?? "");
    setPericiaId(SEM_PERICIA);
    setRoll(null);
    setErro(null);
  }, [ficha?.characterId, ficha?.atributos]);

  const atributo = ficha?.atributos.find((a) => a.id === atributoId) ?? null;
  const pericia = periciaId ? ficha?.pericias.find((p) => p.id === periciaId) ?? null : null;
  const pool = getRupturaPool(atributo?.valor ?? 0);
  const podeRolar = !!campaignId && !!ficha && !!atributo && !!rolarNaMesa;

  const doRoll = async (forca: number) => {
    if (rolling || !podeRolar || !ficha || !atributo || !rolarNaMesa || !campaignId) return;
    setRolling(true);
    setLanded(false);
    setRoll(null);
    setErro(null);

    // A física primeiro: as faces do teste são as que os corpos
    // mostrarem quando pararem — nunca sorteadas antes.
    const pedido: PhysicsDieSpec[] = Array.from({ length: pool.quantidadeDados }, (_, i) => ({ id: `teste-${i}`, sides: 8 }));
    const fisicos = await rolarNaMesa(pedido, "#00d4ff", forca);
    const dados = fisicos.map((d) => d.value);

    const cd = cdInput.trim() === "" ? null : Number.parseInt(cdInput, 10);
    const r = await registrarRolagemPericiaAction({
      campaignId,
      characterId: ficha.characterId,
      atributoId: atributo.id,
      periciaId: pericia?.id ?? null,
      modificador: mods,
      cd: Number.isFinite(cd) ? cd : null,
      dados,
      visibilidade,
    });

    setRolling(false);
    if (!r.ok || !r.dados) {
      setErro(r.erro ?? "Falha ao registrar a rolagem.");
      return;
    }
    const p = r.dados.payload as Record<string, unknown>;
    const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
    setRoll({
      dados: Array.isArray(p.dados) ? (p.dados as number[]) : dados,
      maiorDado: num("dadoEscolhido") ?? num("maiorDado") ?? (pool.modoSelecao === "lowest" ? Math.min(...dados) : Math.max(...dados)),
      quantidadeDados: num("quantidadeDados") ?? pool.quantidadeDados,
      modoSelecao: p.modoSelecao === "lowest" ? "lowest" : "highest",
      atributo: typeof p.atributo === "string" ? p.atributo : atributo.nome,
      atributoValor: num("atributoValor") ?? atributo.valor,
      pericia: typeof p.pericia === "string" ? p.pericia : null,
      periciaValor: num("periciaValor") ?? 0,
      modificador: num("modificador") ?? mods,
      total: num("total") ?? 0,
      cd: num("cd"),
      sucesso: typeof p.sucesso === "boolean" ? p.sucesso : null,
      classificacao: typeof p.classificacaoMargem === "string" ? (p.classificacaoMargem as ResultKey) : null,
    });
    setLanded(true);
    setTimeout(() => setLanded(false), 500);
  };

  return {
    ficha, atributoId, setAtributoId, periciaId, setPericiaId, atributo, pericia,
    mods, setMods, cdInput, setCdInput, roll, doRoll, rolling, landed, carga, setCarga,
    erro, podeRolar,
  };
}

/**
 * Retrato do pool — os ícones do atributo. A física acontece na mesa,
 * fora daqui: enquanto ela roda, os mesmos ícones pulsam em vez de
 * virar uma segunda arena; assim que assenta, mostram a face lida.
 *
 * Enquanto CARREGA (antes de soltar), os ícones tremem — porte literal
 * de `charge dice/src/components/dice.tsx` (`TestPool`).
 */
function TestPool({
  r, count, size = 46, rolling = false, landed = false, carga = 0,
}: {
  r: Roll | null; count: number; size?: number; rolling?: boolean; landed?: boolean; carga?: number;
}) {
  const tremendo = carga > 0 && !rolling;
  const n = rolling ? count : r ? r.dados.length : count;
  const maiorIdx = r ? r.dados.indexOf(r.maiorDado) : -1;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {/* Parado (rolou, ou nem rolou ainda) é a MESMA fileira que o
          Console desenha — `DadosRolados`. Só os dois estados
          animados, que existem só aqui (rolando na mesa, tremendo sob
          carga), continuam montados dado a dado. */}
      {rolling || tremendo ? (
        Array.from({ length: n }, (_, i) => (
          rolling ? (
            <span key={i} className="rv-dados-rolando" style={{ animationDelay: `${(i % 6) * 0.06}s` }}>
              <PolyDie sides={8} dim size={size} />
            </span>
          ) : (
            <div key={i} className="rv-dados-treme" style={{
              animation: `rup-charge-shake ${(0.15 - carga * 0.08).toFixed(3)}s ${i * 0.018}s linear infinite`,
              opacity: 0.55 + carga * 0.45,
              ["--shake-x" as string]: `${(0.5 + carga * 3.5).toFixed(1)}px`,
              ["--shake-r" as string]: `${(0.2 + carga * 1.4).toFixed(2)}deg`,
            }}>
              <PolyDie sides={8} value={r ? r.dados[i] : undefined} active={!!r && i === maiorIdx} size={size} />
            </div>
          )
        ))
      ) : (
        <DadosRolados
          dados={r ? r.dados : Array.from({ length: n }, () => 0)}
          maiorDado={r ? r.maiorDado : -1}
          size={size}
          landed={landed}
          dim={!r}
          acento={r?.classificacao ? RESULTS[r.classificacao].accent : undefined}
        />
      )}
      {rolling && <span className="rv-dados-status" style={{ marginLeft: 2 }}>rolando na mesa…</span>}
    </div>
  );
}

/** Faixa de resultado — a compartilhada, sem tradução: `Roll` já usa os mesmos nomes. */
function ResultBanner({ r }: { r: Roll }) {
  return <FaixaResultado r={r} />;
}

/** Aviso curto quando o teste não tem ficha pra rolar. */
function SemFicha({ motivo }: { motivo: string }) {
  return (
    <div style={{ borderRadius: 0, border: "1px solid var(--fj-fundo-7, #1c2b45)", background: "var(--fj-fundo-3, #0a1220)", padding: "14px 12px", textAlign: "center" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_DIM }}>Sem personagem</div>
      <p style={{ margin: "8px 0 0", fontFamily: BODY, fontSize: 12, lineHeight: 1.5, color: INK_FAINT }}>{motivo}</p>
    </div>
  );
}

function RupturaTest({ s }: { s: ReturnType<typeof useTest> }) {
  const { ficha, atributo } = s;

  if (!ficha) {
    return <SemFicha motivo="Selecione no mapa um token ligado a um personagem que você controla — o teste usa os atributos e perícias da ficha dele." />;
  }

  const opcoesAtributo = ficha.atributos.map((a) => {
    const definicao = getRupturaPool(a.valor);
    return {
      id: a.id,
      rotulo: a.nome,
      valor: `${definicao.quantidadeDados}d8 ${definicao.modoSelecao === "lowest" ? "↓" : "↑"}`,
    };
  });
  const opcoesPericia = [
    { id: SEM_PERICIA, rotulo: "Sem perícia" },
    ...ficha.pericias.map((p) => ({ id: p.id, rotulo: p.nome, valor: `+${p.valor}` })),
  ];
  const pool = getRupturaPool(atributo?.valor ?? 0);
  const nd8 = pool.quantidadeDados;
  const rotuloSelecao = pool.modoSelecao === "lowest" ? "menor dado" : "maior dado";

  return (
    <>
      {/* Atributo · Perícia · Modificadores na MESMA grade. O cabeçalho
          "Teste de Ruptura" saiu: o título da janela já diz o que é, e
          o nome da ficha ali repetia o que o "Rolando como" acima
          mostra. A perícia leva mais espaço que o atributo porque os
          nomes dela são mais longos (Balística, Engenharia…). O pool do
          atributo vai em seta (`3d8 ↑` maior, `3d8 ↓` menor): por extenso
          ele empurrava o nome do atributo pra fora do campo. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.35fr) auto", gap: 8, alignItems: "end" }}>
        <Select label="Atributo" value={s.atributoId} onChange={s.setAtributoId} options={opcoesAtributo} />
        <Select label="Perícia" value={s.periciaId} onChange={s.setPericiaId} options={opcoesPericia} />
        <div>
          <span style={{ display: "block", fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>Mod.</span>
          <div style={{ marginTop: 4 }}><Stepper value={s.mods} onChange={s.setMods} /></div>
        </div>
      </div>

      <div style={{ borderRadius: 0, padding: 14, background: "var(--fj-fundo-3, #0a1220)", border: "1px solid var(--fj-fundo-6, #16233a)" }}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: INK_FAINT }}>
            Pool · <span style={{ color: "#00d4ff" }}>{nd8}d8</span> · {rotuloSelecao}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>
            {s.cdInput.trim() === "" ? "sem CD definida" : `cd ${s.cdInput}`}
          </span>
        </div>
        <TestPool r={s.roll} count={nd8} rolling={s.rolling} landed={s.landed} carga={s.carga} />
        {s.roll && !s.rolling && <div className="rup-reveal" style={{ marginTop: 14 }}><ResultBanner r={s.roll} /></div>}
        {atributo?.valor === 0 && (
          <p style={{ margin: "10px 0 0", fontFamily: BODY, fontSize: 11.5, color: INK_FAINT }}>
            Atributo 0: role 2d8 e use o menor resultado.
          </p>
        )}
      </div>

      {s.erro && <ErroRolagem texto={s.erro} />}

      <CampoCD value={s.cdInput} onChange={s.setCdInput} />

      <RollButton
        label={s.rolling ? "Rolando…" : s.roll ? "Rolar de novo" : `Rolar ${nd8}d8`}
        disabled={s.rolling || !s.podeRolar}
        onRoll={s.doRoll}
        onChargeChange={s.setCarga}
      />

    </>
  );
}

/** Erro de gravação — a rolagem aconteceu na mesa, mas não virou registro. */
function ErroRolagem({ texto }: { texto: string }) {
  return (
    <p role="alert" style={{
      margin: 0, borderRadius: 0, border: `1px solid ${ACCENTS.danger.hex}55`, background: ACCENTS.danger.soft,
      padding: "8px 10px", fontFamily: BODY, fontSize: 11.5, lineHeight: 1.45, color: "#ffd7dc",
    }}>
      {texto}
    </p>
  );
}

/* ================================================================== */
/*  Rolador com abas — Atributo & Perícia | Livre                      */
/* ================================================================== */

function DiceTabs({ tab, onChange }: { tab: "test" | "free"; onChange: (t: "test" | "free") => void }) {
  const tabs: { k: "test" | "free"; label: string; hint: string }[] = [
    { k: "test", label: "Atributo & Perícia", hint: "Nd8 · maior/menor" },
    { k: "free", label: "Livre", hint: "d4 a d100" },
  ];
  return (
    <div className="rv-dados-tabs" role="tablist" aria-label="Tipo de rolagem" style={{ display: "flex", gap: 4, borderRadius: 0, padding: 4, background: "var(--fj-fundo-3, #0a1220)", border: "1px solid var(--fj-fundo-6, #16233a)" }}>
      {tabs.map((t) => {
        const on = t.k === tab;
        return (
          <button key={t.k} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.k)}
            style={{
              display: "flex", flex: 1, flexDirection: "column", alignItems: "center", gap: 5, borderRadius: 0, padding: "8px 8px", cursor: "pointer",
              color: on ? ACCENTS.cyan.hex : "#6f83a3", background: on ? ACCENTS.cyan.soft : "transparent",
              border: `1px solid ${on ? ACCENTS.cyan.hex + "88" : "transparent"}`,
            }}>
            {/* 11px, não 10: com o piso de 10 a dica subiu de 7,5 pra
                10 e empatou com o rótulo. Um passo acima devolve a
                hierarquia sem furar o piso. */}
            <span style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em" }}>{t.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: INK_FAINT }}>{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Contexto da mesa — quem rola, com que ficha, e quem enxerga         */
/* ================================================================== */

export interface PersonagemSugerido {
  id: string;
  nome: string;
}

/**
 * Carrega do SERVIDOR as identidades disponíveis e a ficha do
 * personagem escolhido. Refaz a cada troca de personagem — a ficha
 * pode ter mudado entre uma rolagem e outra, e o rolador não pode
 * trabalhar com um retrato velho de atributo.
 */
function useContextoRolagem(campaignId: string | null, characterId: string | null) {
  const [ctx, setCtx] = useState<ContextoRolagem | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [revisao, setRevisao] = useState(0);
  const recarregar = useCallback(() => setRevisao((n) => n + 1), []);

  useEffect(() => {
    if (!campaignId) { setCtx(null); return; }
    let cancelado = false;
    setCarregando(true);
    lerContextoRolagemAction(campaignId, characterId)
      .then((r) => {
        if (cancelado) return;
        if (r.ok && r.dados) { setCtx(r.dados); setErro(null); }
        else setErro(r.erro ?? "Falha ao carregar o contexto da rolagem.");
      })
      .catch(() => { if (!cancelado) setErro("Falha ao carregar o contexto da rolagem."); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [campaignId, characterId, revisao]);

  return { ctx, carregando, erro, recarregar };
}

type Identidade = { id: string; nome: string; avatarUrl: string | null; tipo: "jogador" | "pn" };

/** O rosto + nome no formato do cartão de alvo — usado no gatilho e em cada linha da lista. */
function CartaoIdentidade({ p, onFalhaAvatar }: { p: Identidade; onFalhaAvatar?: (p: Identidade) => void }) {
  const [avatarFalhou, setAvatarFalhou] = useState(false);
  useEffect(() => { setAvatarFalhou(false); }, [p.avatarUrl]);
  return (
    <>
      <span className="rv-ident-face" aria-hidden="true">
        {p.avatarUrl && !avatarFalhou
          ? <img src={p.avatarUrl} alt="" onError={() => { setAvatarFalhou(true); onFalhaAvatar?.(p); }} />
          : p.nome.slice(0, 3).toUpperCase()}
      </span>
      <span className="rv-ident-nome">{p.nome}</span>
    </>
  );
}

/**
 * "ROLANDO COMO" — não é o `<select>` do navegador: o gatilho é o cartão
 * do personagem atual e abre uma LISTA de cartões (rosto, nome em mono,
 * cor do lado), a mesma linguagem da lista de alvos da ação do token.
 * A lista vai por portal pro `body` (a janela da ferramenta rola e
 * recortaria) e fecha com clique fora ou Esc.
 */
function SeletorIdentidade({ identidades, valor, onEscolher, desabilitado, onFalhaAvatar }: {
  identidades: Identidade[]; valor: string; onEscolher: (id: string) => void; desabilitado: boolean;
  onFalhaAvatar?: (p: Identidade) => void;
}) {
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const atual = identidades.find((p) => p.id === valor) ?? identidades[0];
  const fechar = useCallback(() => setPos(null), []);
  const abrir = () => {
    const r = gatilho.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 6, width: r.width });
  };
  useEffect(() => {
    if (!pos) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!lista.current?.contains(alvo) && !gatilho.current?.contains(alvo)) fechar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); gatilho.current?.focus(); } };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [pos, fechar]);
  if (!atual) return null;
  return (
    <div>
      <span style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>Rolando como</span>
      <button
        ref={gatilho}
        type="button"
        className="rv-ident-cartao rv-ident-gatilho"
        data-lado={atual.tipo === "pn" ? "pn" : "pj"}
        aria-haspopup="listbox"
        aria-expanded={pos !== null}
        disabled={desabilitado}
        onClick={() => (pos ? fechar() : abrir())}
        data-testid="rolador-identidade"
      >
        <CartaoIdentidade p={atual} onFalhaAvatar={onFalhaAvatar} />
        <Chevron width={13} height={13} className="rv-ident-seta" style={{ transform: pos ? "rotate(180deg)" : "none" }} />
      </button>
      {pos && typeof document !== "undefined" && createPortal(
        <div
          ref={lista}
          className="rv-ident-lista"
          role="listbox"
          aria-label="Rolando como"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
          {identidades.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={p.id === atual.id}
              className="rv-ident-cartao"
              data-lado={p.tipo === "pn" ? "pn" : "pj"}
              onClick={() => { onEscolher(p.id); fechar(); gatilho.current?.focus(); }}
            >
              <CartaoIdentidade p={p} onFalhaAvatar={onFalhaAvatar} />
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Rolador completo — é o corpo do painel flutuante “Rolar Dados”.
 *
 * `campaignId`/`personagemSugerido` vêm da mesa: o segundo é o
 * personagem do token selecionado, só uma SUGESTÃO — quem decide se a
 * conta pode rolar por ele é o servidor, que revalida a cada rolagem.
 */
/**
 * Quem rola + com que ficha + quem vê — o estado de topo do rolador,
 * igual nas duas peles (`classica` e `f`).
 */
function useRolador(campaignId: string | null, personagemSugerido: PersonagemSugerido | null) {
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const characterId = escolhido ?? personagemSugerido?.id ?? null;
  const { ctx, carregando, erro, recarregar } = useContextoRolagem(campaignId, characterId);
  const avataresRenovados = useRef(new Set<string>());
  const s = useTest(campaignId, ctx?.ficha ?? null, visibilidade);

  // O token selecionado mudou: volta a seguir a sugestão da mesa, em
  // vez de ficar preso no personagem escolhido à mão da vez passada.
  useEffect(() => { setEscolhido(null); }, [personagemSugerido?.id]);
  useEffect(() => { avataresRenovados.current.clear(); }, [campaignId]);

  const renovarAvatarComFalha = useCallback((p: Identidade) => {
    if (avataresRenovados.current.has(p.id)) return;
    avataresRenovados.current.add(p.id);
    recarregar();
  }, [recarregar]);

  const identidades = ctx?.personagens ?? [];

  // Sem token selecionado (nem escolha manual), o dropdown "Rolando
  // como" já cai visualmente no primeiro personagem controlável
  // (`identidades[0]`) — mas isso era só decoração: `characterId`
  // continuava `null`, a ficha nunca era buscada, e o painel mostrava
  // "Sem personagem" por baixo de um dropdown que parecia ter alguém
  // selecionado. Aqui a escolha visual vira a escolha de verdade,
  // pra qualquer quantidade de identidades. Selecionar um token no
  // mapa continua tendo prioridade (o efeito acima zera `escolhido`).
  useEffect(() => {
    if (!characterId && identidades.length > 0) setEscolhido(identidades[0].id);
  }, [characterId, identidades]);

  return { visibilidade, setVisibilidade, setEscolhido, characterId, ctx, carregando, erro, s, identidades, renovarAvatarComFalha };
}

/**
 * Rolador completo — é o corpo do painel flutuante “Rolar Dados”.
 *
 * `campaignId`/`personagemSugerido` vêm da mesa: o segundo é o
 * personagem do token selecionado, só uma SUGESTÃO — quem decide se a
 * conta pode rolar por ele é o servidor, que revalida a cada rolagem.
 *
 * `variante="f"` é a pele da linha F (janela do VTT, `janela-dados.css`).
 * A clássica fica como padrão porque o harness `/dev/dados` e a galeria
 * de estilos montam o rolador SOLTO, fora da `.rv-fp--f`, onde as
 * folhas da linha F não são carregadas.
 */
export function RoladorDados({ size = 46, campaignId = null, personagemSugerido = null, variante = "classica" }: {
  size?: number;
  campaignId?: string | null;
  personagemSugerido?: PersonagemSugerido | null;
  variante?: "classica" | "f";
}) {
  if (variante === "f") return <RoladorDadosF campaignId={campaignId} personagemSugerido={personagemSugerido} />;
  return <RoladorClassico size={size} campaignId={campaignId} personagemSugerido={personagemSugerido} />;
}

function RoladorClassico({ size, campaignId, personagemSugerido }: {
  size: number; campaignId: string | null; personagemSugerido: PersonagemSugerido | null;
}) {
  const [tab, setTab] = useState<"test" | "free">("test");
  const { visibilidade, setVisibilidade, setEscolhido, characterId, ctx, carregando, erro, s, identidades, renovarAvatarComFalha } = useRolador(campaignId, personagemSugerido);
  return (
    <Stack gap={16}>
      <DiceTabs tab={tab} onChange={setTab} />

      {campaignId && identidades.length > 0 && (
        <SeletorIdentidade
          identidades={identidades}
          valor={characterId ?? identidades[0]?.id ?? ""}
          onEscolher={setEscolhido}
          desabilitado={s.rolling}
          onFalhaAvatar={renovarAvatarComFalha}
        />
      )}

      {carregando && !ctx && (
        <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: INK_FAINT }}>
          carregando ficha…
        </span>
      )}
      {erro && <ErroRolagem texto={erro} />}

      {tab === "test"
        ? <Stack gap={20}><RupturaTest s={s} /></Stack>
        : <FreePool size={size} campaignId={campaignId} characterId={characterId} visibilidade={visibilidade} />}

      {campaignId && <SeletorVisibilidade valor={visibilidade} onChange={setVisibilidade} ehNarrador={!!ctx?.ehNarrador} />}
    </Stack>
  );
}

/* ================================================================== */
/*  Bandeja do chat — livre, simples, recolhida por padrão             */
/* ================================================================== */

export function BandejaDados({ campaignId = null, personagemSugerido = null }: {
  campaignId?: string | null;
  personagemSugerido?: PersonagemSugerido | null;
}) {
  const [open, setOpen] = useState(false);
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const { ctx } = useContextoRolagem(open ? campaignId : null, personagemSugerido?.id ?? null);
  return (
    /* A CAIXA responde ao mouse como os cartões do feed: o peso na
       borda, o fundo só um sopro. Ela é o vizinho deles na coluna. */
    /* `className` e não só estilo inline: encostada no composer (no
       Chat) ela perde os cantos de baixo, e isso é decisão de LAYOUT de
       quem a hospeda — o raio sai daqui pra que a folha possa mandar. */
    /* Borda em LONGHANDS, não `border: 1px solid var(...)`: com `var()`
       no atalho, `style.getPropertyValue("border-color")` volta vazio,
       e o `aoPassarMouse` "restaurava" a cor para nada — a borda caía
       em `currentColor` e ficava clara depois do primeiro hover. */
    <div className="rv-bandeja-casca" {...aoPassarMouse({ "border-color": "var(--fj-fundo-7, #2a3b58)" })}
      style={{ background: "linear-gradient(160deg,var(--fj-fundo-3, #0b1322),var(--fj-fundo-2, #080e19))", borderWidth: 1, borderStyle: "solid", borderColor: "var(--fj-fundo-6, #16233a)", transition: "border-color .14s" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="painel-bandeja-dados"
        {...aoPassarMouse({ background: "rgba(255,255,255,.015)" })}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "10px 14px", border: 0, background: "transparent", cursor: "pointer", transition: "background .14s" }}>
        <Dice width={15} height={15} style={{ color: "#00d4ff", flexShrink: 0 }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: INK }}>Bandeja de Dados</span>
        <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>livre · d4 a d100</span>
        <Chevron width={13} height={13} style={{ marginLeft: "auto", color: INK_FAINT, transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          <FreePool size={40} initial={{}} campaignId={campaignId} characterId={personagemSugerido?.id ?? null} visibilidade={visibilidade} />
          {campaignId && <SeletorVisibilidade valor={visibilidade} onChange={setVisibilidade} ehNarrador={!!ctx?.ehNarrador} />}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  LINHA F — a janela "Rolar Dados" do redesign                       */
/*                                                                     */
/*  Mesmas regras, mesmos hooks (`useTest`, `useLivre`, `useRolador`)  */
/*  e mesmas peças de resultado (`DadosRolados`/`DadosLivres`,          */
/*  `FaixaResultado`/`FaixaSoma`) da pele clássica — muda só o         */
/*  desenho. Estilo em `_tema/janela-dados.css`, escopado em           */
/*  `.rv-fp--f`, porque é ali que `janelas-f.css` dá as peças `jf-`.   */
/* ================================================================== */

/** Acento da janela Rolar Dados (`ESPINHA.dados`) — o PolyDie quer hex, não `var()`. */
const ACENTO_F = "#00d4ff";
const ACENTO_F_SOFT = "rgba(0,212,255,0.14)";

type OpcaoLista = { id: string; rotulo: string; valor?: string; lado?: "pj" | "pn"; frente?: ReactNode };

/**
 * Seletor em "token" (sublinhado tracejado) com LISTA PRÓPRIA — não o
 * `<select>` do navegador. A lista mora dentro da vitrine (posição
 * absoluta), e não por portal: o chanfro da `jf-hero` está num
 * `::before` justamente pra ela poder sair da caixa, e assim ela
 * acompanha a janela quando arrasta ou rola. Abre pra cima quando
 * pedido e couber no corpo da janela; senão abre pra baixo.
 * Fecha com clique fora, Esc ou escolha; ↑/↓ andam pela lista.
 */
function SeletorToken({ titulo, valor, opcoes, onEscolher, desabilitado = false, preferirCima = false, direita = false, frente, tag, classe, testId }: {
  titulo: string; valor: string; opcoes: OpcaoLista[]; onEscolher: (id: string) => void;
  desabilitado?: boolean; preferirCima?: boolean; direita?: boolean;
  /** Avatar (ou outro adorno) antes do nome, no gatilho. */
  frente?: ReactNode;
  /** Etiqueta mono no gatilho (pool do atributo, bônus da perícia). */
  tag?: string;
  classe?: string;
  testId?: string;
}) {
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [aberta, setAberta] = useState<null | { cima: boolean }>(null);
  const atual = opcoes.find((o) => o.id === valor) ?? opcoes[0];
  const fechar = useCallback((devolverFoco = false) => { setAberta(null); if (devolverFoco) gatilho.current?.focus(); }, []);
  const alternar = () => {
    if (aberta) { fechar(); return; }
    const r = gatilho.current?.getBoundingClientRect();
    const caixa = gatilho.current?.closest(".rup-scroll")?.getBoundingClientRect();
    const altura = Math.min(opcoes.length * 36 + 34, 220);
    const topo = caixa?.top ?? 0;
    const fundo = caixa?.bottom ?? (typeof window !== "undefined" ? window.innerHeight : 0);
    const cabeCima = !!r && r.top - topo >= altura + 8;
    const cabeBaixo = !r || fundo - r.bottom >= altura + 8;
    setAberta({ cima: preferirCima ? cabeCima || !cabeBaixo : !cabeBaixo && cabeCima });
  };
  useEffect(() => {
    if (!aberta) return;
    requestAnimationFrame(() => lista.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true }));
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!lista.current?.contains(alvo) && !gatilho.current?.contains(alvo)) fechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const itens = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const i = itens.indexOf(document.activeElement as HTMLButtonElement);
      itens[e.key === "ArrowDown" ? Math.min(itens.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
    };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [aberta, fechar]);
  // Rolagem começou com a lista aberta: fecha, o gatilho ficou desabilitado.
  useEffect(() => { if (desabilitado) setAberta(null); }, [desabilitado]);
  if (!atual) return null;
  return (
    <span className="rv-rf-sel">
      <button
        ref={gatilho}
        type="button"
        className={`rv-rf-token${classe ? ` ${classe}` : ""}`}
        aria-haspopup="listbox"
        aria-expanded={aberta !== null}
        disabled={desabilitado}
        onClick={alternar}
        data-testid={testId}
      >
        <span className="rv-sr-only">{titulo}: </span>
        {frente}
        <span className="rv-rf-token-nome">{atual.rotulo}</span>
        {tag && <span className="rv-rf-tag">{tag}</span>}
        <Chevron width={14} height={14} strokeWidth={2} />
      </button>
      {aberta && (
        <div ref={lista} role="listbox" aria-label={titulo}
          className={`rv-rf-pop${aberta.cima ? " is-cima" : ""}${direita ? " is-direita" : ""}`}>
          <span className="rv-rf-pop-rot" aria-hidden="true">{titulo}</span>
          {opcoes.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === atual.id}
              className="rv-rf-opt" data-lado={o.lado}
              onClick={() => { onEscolher(o.id); fechar(true); }}>
              {o.frente}
              <span className="rv-rf-opt-nome">{o.rotulo}</span>
              {o.valor && <span className="rv-rf-opt-v">{o.valor}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Rosto redondo com anel na cor do lado — o `avatarUrl` real; sem ele (ou se falhar), a sigla. */
function AvatarIdentidade({ p, onFalha }: { p: Identidade; onFalha?: (p: Identidade) => void }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [p.avatarUrl]);
  return (
    <span className="rv-rf-av" data-lado={p.tipo === "pn" ? "pn" : "pj"} aria-hidden="true">
      {p.avatarUrl && !falhou
        ? <img src={p.avatarUrl} alt="" onError={() => { setFalhou(true); onFalha?.(p); }} />
        : p.nome.slice(0, 3).toUpperCase()}
    </span>
  );
}

/** Modificador: − valor + — o valor continua digitável, como no `Stepper`. */
function AjusteMod({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  const fmt = valor > 0 ? `+${valor}` : `${valor}`;
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(fmt);
  useEffect(() => { if (!editando) setRascunho(fmt); }, [editando, fmt]);
  return (
    <div className="jf-ajuste">
      <span className="jf-l">Mod.</span>
      <span className="jf-ajuste-ctl">
        <button type="button" aria-label="Diminuir modificador" onClick={() => onChange(valor - 1)}><Minus size={11} strokeWidth={2.8} /></button>
        <input
          className="jf-ajuste-v rv-rf-num" type="text" inputMode="numeric" aria-label="Modificador"
          value={editando ? rascunho : fmt}
          onFocus={(e) => { setEditando(true); setRascunho(fmt); e.currentTarget.select(); }}
          onChange={(e) => {
            const proximo = e.target.value.replace(/[^0-9+-]/g, "");
            if (!/^[+-]?\d*$/.test(proximo)) return;
            setRascunho(proximo);
            if (/^[+-]?\d+$/.test(proximo)) onChange(Number(proximo));
          }}
          onBlur={() => setEditando(false)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
        <button type="button" aria-label="Aumentar modificador" onClick={() => onChange(valor + 1)}><Plus size={11} strokeWidth={2.8} /></button>
      </span>
    </div>
  );
}

/**
 * CD: − valor + com vazio = "—" (sem CD). O "Remover CD" da caixa
 * antiga virou o próprio −: abaixo de 1 a CD some — e apagar o campo
 * também tira. Mesmos limites do `CampoCD` (1–99).
 */
function AjusteCD({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const vazia = valor.trim() === "";
  const atual = Number.parseInt(valor, 10);
  return (
    <div className="jf-ajuste">
      <span className="jf-l">CD</span>
      <span className="jf-ajuste-ctl">
        <button type="button" aria-label={!vazia && atual <= 1 ? "Remover CD" : "Diminuir CD"} disabled={vazia}
          onClick={() => onChange(!Number.isFinite(atual) || atual <= 1 ? "" : String(Math.min(99, atual - 1)))}>
          <Minus size={11} strokeWidth={2.8} />
        </button>
        <input
          className={`jf-ajuste-v rv-rf-num${vazia ? " is-vazio" : ""}`} type="text" inputMode="numeric" pattern="[0-9]*"
          placeholder="—" aria-label="Classe de dificuldade" value={valor}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, "").slice(0, 2);
            onChange(digitos === "" ? "" : String(Math.min(99, Math.max(1, Number(digitos)))));
          }}
        />
        <button type="button" aria-label="Aumentar CD"
          onClick={() => onChange(String(Math.min(99, Math.max(1, (Number.isFinite(atual) ? atual : 0) + 1))))}>
          <Plus size={11} strokeWidth={2.8} />
        </button>
      </span>
    </div>
  );
}

const ICONE_VISIB: Record<TableLogVisibility, ReactNode> = {
  public: <Users size={15} strokeWidth={1.8} />,
  private: <Lock size={15} strokeWidth={1.8} />,
  gm: <Eye size={15} strokeWidth={1.8} />,
};

/** "Quem vê" em blocos — a visibilidade real; `gm` só aparece pro narrador (o servidor revalida). */
function QuemVe({ valor, onChange, ehNarrador }: { valor: TableLogVisibility; onChange: (v: TableLogVisibility) => void; ehNarrador: boolean }) {
  const opcoes = VISIBILIDADES.filter((o) => o.v !== "gm" || ehNarrador);
  return (
    <div className="jf-grupo">
      <span className="jf-rot">Quem vê</span>
      <div className="jf-tiles rv-rf-visib" role="group" aria-label="Quem vê esta rolagem" style={{ ["--jf-n" as string]: opcoes.length }}>
        {opcoes.map((o) => (
          <button key={o.v} type="button" className="jf-tile" aria-pressed={o.v === valor} title={o.dica} onClick={() => onChange(o.v)}>
            {ICONE_VISIB[o.v]}<span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tremor da carga — mesma curva do `TestPool`/`FreePool`. */
function estiloTremor(carga: number, i: number): CSSProperties {
  return {
    animation: `rup-charge-shake ${(0.15 - carga * 0.08).toFixed(3)}s ${i * 0.022}s linear infinite`,
    opacity: 0.55 + carga * 0.45,
    ["--shake-x" as string]: `${(0.5 + carga * 3.5).toFixed(1)}px`,
    ["--shake-r" as string]: `${(0.2 + carga * 1.4).toFixed(2)}deg`,
  };
}

function HeroTeste({ s }: { s: ReturnType<typeof useTest> }) {
  const { ficha, atributo } = s;
  if (!ficha) {
    return (
      <div className="rv-rf-semficha">
        <b>Sem personagem</b>
        <p>Selecione no mapa um token ligado a um personagem que você controla — o teste usa os atributos e perícias da ficha dele.</p>
      </div>
    );
  }
  const opcoesAtributo = ficha.atributos.map((a) => {
    const d = getRupturaPool(a.valor);
    return { id: a.id, rotulo: a.nome, valor: `${d.quantidadeDados}d8 ${d.modoSelecao === "lowest" ? "↓" : "↑"}` };
  });
  const opcoesPericia: OpcaoLista[] = [
    { id: SEM_PERICIA, rotulo: "Sem perícia" },
    ...ficha.pericias.map((p) => ({ id: p.id, rotulo: p.nome, valor: `+${p.valor}` })),
  ];
  const pool = getRupturaPool(atributo?.valor ?? 0);
  const tagAtributo = `${pool.quantidadeDados}d8 ${pool.modoSelecao === "lowest" ? "↓" : "↑"}`;
  return (
    <>
      <div className="rv-rf-dados">
        <TestPool r={s.roll} count={pool.quantidadeDados} rolling={s.rolling} landed={s.landed} carga={s.carga} />
      </div>
      <div className="rv-rf-frase">
        <SeletorToken titulo="Atributo" valor={s.atributoId} opcoes={opcoesAtributo} onEscolher={s.setAtributoId}
          desabilitado={s.rolling} preferirCima tag={tagAtributo} />
        <span className="rv-rf-mais" aria-hidden="true">+</span>
        <SeletorToken titulo="Perícia" valor={s.periciaId} opcoes={opcoesPericia} onEscolher={s.setPericiaId}
          desabilitado={s.rolling} preferirCima direita tag={s.pericia ? `+${s.pericia.valor}` : undefined} />
      </div>
      {atributo?.valor === 0 && <p className="rv-rf-aviso">Atributo 0: role 2d8 e use o menor resultado.</p>}
      {s.roll && !s.rolling && <div className="rup-reveal rv-rf-faixa"><FaixaResultado r={s.roll} /></div>}
    </>
  );
}

function HeroLivre({ l }: { l: ReturnType<typeof useLivre> }) {
  const tremendo = l.liveCharge > 0 && !l.rolling;
  const passou = l.cdNumero == null ? null : l.finalSum >= l.cdNumero;
  return (
    <>
      <div className="rv-rf-paleta">
        {LOOSE.map((f) => {
          const n = l.counts[f] || 0;
          return (
            <button key={f} type="button" className={`rv-rf-face${n > 0 ? " is-on" : ""}`}
              onClick={() => l.add(f)} onContextMenu={(e) => { e.preventDefault(); l.dec(f); }}
              title={`d${f} — clique adiciona · direito remove`} aria-label={`Adicionar d${f}`}>
              <PolyDie sides={f} semValor active={n > 0} accent={ACENTO_F} soft={ACENTO_F_SOFT} size={38} />
              <span className="rv-rf-face-nome">d{f}</span>
              {n > 0 && <i>{n}</i>}
            </button>
          );
        })}
      </div>
      <div className="rv-rf-pool">
        {l.total === 0 ? (
          <span className="rv-rf-vazio-pool">Clique nos dados pra montar a rolagem</span>
        ) : (
          <>
            {l.results && !l.rolling ? (
              /* Parado com resultado: a fileira compartilhada (a mesma do
                 card do Chat), com o que valeu no acento da faixa. */
              <DadosLivres
                termos={l.results.map((d) => ({ faces: d.sides, valor: d.value }))}
                maior={l.mode === "sum" ? null : l.diceBase}
                size={34}
                landed={l.landed}
                acento={passou == null ? undefined : passou ? ACCENTS.cyan : ACCENTS.danger}
              />
            ) : (
              <span className="rv-rf-pool-itens">
                {l.pool.map((f, i) => (
                  <button key={i} type="button" className="rv-rf-pool-dado" onClick={() => l.dec(f)} disabled={l.rolling}
                    aria-label={`Tirar um d${f}`} title="clique para remover">
                    {l.rolling ? (
                      <span className="rv-dados-rolando" style={{ animationDelay: `${(i % 6) * 0.06}s` }}>
                        <PolyDie sides={f} accent={ACENTO_F} soft={ACENTO_F_SOFT} size={30} semValor />
                      </span>
                    ) : (
                      <span className={tremendo ? "rv-dados-treme" : undefined} style={{ display: "block", ...(tremendo ? estiloTremor(l.liveCharge, i) : null) }}>
                        <PolyDie sides={f} active accent={ACENTO_F} soft={ACENTO_F_SOFT} size={30} semValor />
                      </span>
                    )}
                  </button>
                ))}
              </span>
            )}
            <button type="button" className="rv-rf-limpar" onClick={l.clear} disabled={l.rolling}>Limpar</button>
          </>
        )}
      </div>
      {l.rolling && <span className="rv-dados-status rv-rf-status">rolando na mesa…</span>}
      {l.results && !l.rolling && (
        <div className="rup-reveal rv-rf-faixa">
          <FaixaSoma base={l.diceBase} modificador={l.mods} total={l.finalSum} cd={l.cdNumero} modo={l.mode} testId="resultado-dados" />
        </div>
      )}
    </>
  );
}

function RoladorDadosF({ campaignId, personagemSugerido }: { campaignId: string | null; personagemSugerido: PersonagemSugerido | null }) {
  const [tab, setTab] = useState<"test" | "free">("test");
  const { visibilidade, setVisibilidade, setEscolhido, characterId, ctx, carregando, erro, s, identidades, renovarAvatarComFalha } = useRolador(campaignId, personagemSugerido);
  const l = useLivre({ campaignId, characterId, visibilidade });
  const rolando = s.rolling || l.rolling;
  const teste = tab === "test";

  const nd8 = getRupturaPool(s.atributo?.valor ?? 0).quantidadeDados;
  const partes = LOOSE.filter((f) => l.counts[f]).map((f) => `${l.counts[f]}d${f}`);
  // Até três grupos a fórmula cabe no botão; acima disso ela empurraria
  // o rótulo pra fora, e a contagem diz o mesmo sem quebrar.
  const formula = partes.length <= 3 ? partes.join(" + ") : `${l.total} dados`;
  const semDados = !teste && l.total === 0;
  const rotulo = teste
    ? (s.rolling ? "Rolando…" : s.roll ? "Rolar de novo" : `Rolar ${nd8}d8`)
    : (semDados ? "Escolha dados" : l.rolling ? "Rolando…" : l.results ? "Rolar de novo" : `Rolar ${formula}`);
  const desabilitado = teste ? s.rolling || !s.podeRolar : semDados || l.rolling || !l.podeRolar;
  const carga = teste ? s.carga : l.liveCharge;
  const dica = VISIBILIDADES.find((v) => v.v === visibilidade)?.dica;
  const nota = semDados
    ? "Clique nos dados acima pra montar a rolagem"
    : carga > 0
      ? `Força ${Math.round(carga * 100)}%${carga >= 0.995 ? " · máxima" : ""}`
      : `Segure pra carregar força${campaignId && dica ? ` · ${dica}` : ""}`;
  const erroRolagem = teste ? s.erro : l.erro;

  const opcoesIdent: OpcaoLista[] = identidades.map((p) => ({
    id: p.id, rotulo: p.nome, lado: p.tipo === "pn" ? "pn" : "pj", valor: p.tipo === "pn" ? "PN" : "PJ",
    frente: <AvatarIdentidade p={p} onFalha={renovarAvatarComFalha} />,
  }));
  const identAtual = identidades.find((p) => p.id === characterId) ?? identidades[0];

  return (
    <div className="rv-rf">
      <div className="jf-abas rv-rf-abas" role="tablist" aria-label="Tipo de rolagem">
        {([["test", "Atributo & Perícia"], ["free", "Livre"]] as const).map(([k, nome]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="jf-aba" onClick={() => setTab(k)}>{nome}</button>
        ))}
      </div>

      <div className="jf-hero rv-rf-hero">
        {campaignId && identAtual && (
          <SeletorToken titulo="Rolando como" valor={identAtual.id} opcoes={opcoesIdent} onEscolher={setEscolhido}
            desabilitado={rolando} classe="rv-rf-ident" testId="rolador-identidade"
            frente={<AvatarIdentidade p={identAtual} onFalha={renovarAvatarComFalha} />} />
        )}
        {carregando && !ctx && <span className="jf-leg rv-rf-carregando">carregando ficha…</span>}
        {teste ? <HeroTeste s={s} /> : <HeroLivre l={l} />}
      </div>

      {erro && <ErroRolagem texto={erro} />}
      {erroRolagem && <ErroRolagem texto={erroRolagem} />}

      {!teste && (
        <div className="jf-grupo">
          <span className="jf-rot">Combinar</span>
          <div className="jf-tiles rv-rf-comb" role="group" aria-label="Como combinar os dados" style={{ ["--jf-n" as string]: 3 }}>
            {([["sum", "Somar"], ["high", "Maior"], ["low", "Menor"]] as const).map(([k, nome]) => (
              <button key={k} type="button" className="jf-tile" aria-pressed={l.mode === k} onClick={() => l.setMode(k)}>{nome}</button>
            ))}
          </div>
        </div>
      )}

      <div className="jf-ajustes rv-rf-ajustes">
        <AjusteMod valor={teste ? s.mods : l.mods} onChange={teste ? s.setMods : l.setMods} />
        <AjusteCD valor={teste ? s.cdInput : l.cdInput} onChange={teste ? s.setCdInput : l.setCdInput} />
      </div>

      {campaignId && <QuemVe valor={visibilidade} onChange={setVisibilidade} ehNarrador={!!ctx?.ehNarrador} />}

      <RollButton variante="f" label={rotulo} disabled={desabilitado}
        onRoll={teste ? s.doRoll : l.roll} onChargeChange={teste ? s.setCarga : l.setLiveCharge} />
      <p className="jf-nota">{nota}</p>
    </div>
  );
}
