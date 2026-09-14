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
import { PolyDie } from "./PolyDie";
import {
  ACCENTS, BODY, CampoCD, DISPLAY, aoPassarMouse, DadosRolados, FaixaResultado, FaixaSoma, GroupLabel, INK, INK_DIM, INK_FAINT, MONO,
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

/* Tokens do design, faixas de margem e as peças de RESULTADO moram em
   `ResultadoRolagem.tsx` — o Console do Personagem desenha o resultado
   dele com as MESMAS, e uma cópia aqui viraria duas versões da mesma
   faixa pra divergirem com o tempo. */

const LOOSE = [4, 6, 8, 10, 12, 20, 100];

/** Como o conjunto livre conta: somando tudo, ou pegando o maior. */
type CountMode = "sum" | "high";

function ModeToggle({ value, onChange }: { value: CountMode; onChange: (m: CountMode) => void }) {
  const opts: { k: CountMode; label: string }[] = [
    { k: "sum", label: "Somar" },
    { k: "high", label: "Maior" },
  ];
  return (
    <div style={{ display: "inline-flex", borderRadius: 2, border: "1px solid #1c2b45" }}>
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

function FreePool({
  size = 46, solidRoll = false, initial = { 8: 1 } as Record<number, number>, defaultMode = "sum" as CountMode,
  campaignId = null, characterId = null, visibilidade = "public" as TableLogVisibility,
}: {
  size?: number; solidRoll?: boolean; initial?: Record<number, number>; defaultMode?: CountMode;
  campaignId?: string | null; characterId?: string | null; visibilidade?: TableLogVisibility;
}) {
  const [counts, setCounts] = useState<Record<number, number>>(initial);
  const [mods, setMods] = useState(0);
  const [cdInput, setCdInput] = useState("");
  const [cdAberto, setCdAberto] = useState(false);
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

  const diceBase = results ? (mode === "high" ? Math.max(...results.map((d) => d.value)) : results.reduce((a, b) => a + b.value, 0)) : 0;
  const bestIdx = results && mode === "high" ? results.reduce((bi, d, i, arr) => (d.value > arr[bi].value ? i : bi), 0) : -1;
  const finalSum = diceBase + mods;

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

      <RollButton label={total === 0 ? "Escolha dados" : rolling ? "Rolando…" : `Rolar ${total} dado${total !== 1 ? "s" : ""}`} disabled={total === 0 || rolling || !rolarNaMesa} solid={solidRoll} onRoll={roll} onChargeChange={setLiveCharge} />

      {/* Mesma CD do teste de Ruptura, mesma gaveta. Aqui ela decide
          só SUCESSO (total ≥ CD): faixa de margem é regra do teste de
          d8, não de uma soma qualquer de dados. */}
      <div>
        <button type="button" onClick={() => setCdAberto((v) => !v)}
          {...aoPassarMouse({ opacity: "1" })}
          style={{ display: "flex", width: "100%", alignItems: "center", border: 0, padding: 0, background: "transparent", cursor: "pointer", opacity: .82, transition: "opacity .14s" }}>
          <GroupLabel right={<Chevron width={13} height={13} style={{ color: INK_FAINT, transform: cdAberto ? "rotate(180deg)" : "none" }} />}>
            Definir CD
          </GroupLabel>
        </button>
        {cdAberto && <div style={{ paddingTop: 4 }}><CampoCD value={cdInput} onChange={setCdInput} /></div>}
      </div>
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
  const podeRolar = !!campaignId && !!ficha && !!atributo && atributo.valor > 0 && !!rolarNaMesa;

  const doRoll = async (forca: number) => {
    if (rolling || !podeRolar || !ficha || !atributo || !rolarNaMesa || !campaignId) return;
    setRolling(true);
    setLanded(false);
    setRoll(null);
    setErro(null);

    // A física primeiro: as faces do teste são as que os corpos
    // mostrarem quando pararem — nunca sorteadas antes.
    const pedido: PhysicsDieSpec[] = Array.from({ length: atributo.valor }, (_, i) => ({ id: `teste-${i}`, sides: 8 }));
    const fisicos = await rolarNaMesa(pedido, "#35c7d8", forca);
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
      maiorDado: num("maiorDado") ?? Math.max(...dados),
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
            <div key={i} style={{
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
    <div style={{ borderRadius: 2, border: "1px solid #1c2b45", background: "#0a1220", padding: "14px 12px", textAlign: "center" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_DIM }}>Sem personagem</div>
      <p style={{ margin: "8px 0 0", fontFamily: BODY, fontSize: 12, lineHeight: 1.5, color: INK_FAINT }}>{motivo}</p>
    </div>
  );
}

function RupturaTest({ s }: { s: ReturnType<typeof useTest> }) {
  const [adv, setAdv] = useState(false);
  const { ficha, atributo } = s;

  if (!ficha) {
    return <SemFicha motivo="Selecione no mapa um token ligado a um personagem que você controla — o teste usa os atributos e perícias da ficha dele." />;
  }

  const opcoesAtributo = ficha.atributos.map((a) => ({ id: a.id, rotulo: `${a.nome} · ${a.valor}d8` }));
  const opcoesPericia = [
    { id: SEM_PERICIA, rotulo: "Sem perícia" },
    ...ficha.pericias.map((p) => ({ id: p.id, rotulo: `${p.nome} · +${p.valor}` })),
  ];
  const nd8 = atributo?.valor ?? 0;

  return (
    <>
      {/* Atributo · Perícia · Modificadores na MESMA grade. O cabeçalho
          "Teste de Ruptura" saiu: o título da janela já diz o que é, e
          o nome da ficha ali repetia o que o "Rolando como" acima
          mostra. A perícia leva mais espaço que o atributo porque os
          nomes dela são mais longos (Balística, Engenharia…) — se
          alguma coluna tiver que apertar, que seja a menor. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.35fr) auto", gap: 12, alignItems: "end" }}>
        <Select label="Atributo" value={s.atributoId} onChange={s.setAtributoId} options={opcoesAtributo} />
        <Select label="Perícia" value={s.periciaId} onChange={s.setPericiaId} options={opcoesPericia} />
        <div>
          <span style={{ display: "block", fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>Mod.</span>
          <div style={{ marginTop: 4 }}><Stepper value={s.mods} onChange={s.setMods} /></div>
        </div>
      </div>

      <div style={{ borderRadius: 2, padding: 14, background: "#0a1220", border: "1px solid #16233a" }}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: INK_FAINT }}>
            Pool · <span style={{ color: "#35c7d8" }}>{nd8}d8</span> · maior dado
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>
            {s.cdInput.trim() === "" ? "sem CD definida" : `cd ${s.cdInput}`}
          </span>
        </div>
        <TestPool r={s.roll} count={nd8} rolling={s.rolling} landed={s.landed} carga={s.carga} />
        {s.roll && !s.rolling && <div className="rup-reveal" style={{ marginTop: 14 }}><ResultBanner r={s.roll} /></div>}
        {nd8 === 0 && (
          <p style={{ margin: "10px 0 0", fontFamily: BODY, fontSize: 11.5, color: INK_FAINT }}>
            Este atributo está em 0 na ficha — sem dado pra rolar.
          </p>
        )}
      </div>

      {s.erro && <ErroRolagem texto={s.erro} />}

      <RollButton
        label={s.rolling ? "Rolando…" : s.roll ? "Rolar de novo" : `Rolar ${nd8}d8`}
        disabled={s.rolling || !s.podeRolar}
        onRoll={s.doRoll}
        onChargeChange={s.setCarga}
      />

      <div>
        <button type="button" onClick={() => setAdv((v) => !v)} style={{ display: "flex", width: "100%", alignItems: "center", border: 0, padding: 0, background: "transparent", cursor: "pointer" }}>
          <GroupLabel right={<Chevron width={13} height={13} style={{ color: INK_FAINT, transform: adv ? "rotate(180deg)" : "none" }} />}>Definir CD</GroupLabel>
        </button>
        {adv && <div style={{ paddingTop: 4 }}><CampoCD value={s.cdInput} onChange={s.setCdInput} /></div>}
      </div>
    </>
  );
}

/** Erro de gravação — a rolagem aconteceu na mesa, mas não virou registro. */
function ErroRolagem({ texto }: { texto: string }) {
  return (
    <p role="alert" style={{
      margin: 0, borderRadius: 2, border: `1px solid ${ACCENTS.danger.hex}55`, background: ACCENTS.danger.soft,
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
    { k: "test", label: "Atributo & Perícia", hint: "Nd8 · maior" },
    { k: "free", label: "Livre", hint: "d4 a d100" },
  ];
  return (
    <div role="tablist" aria-label="Tipo de rolagem" style={{ display: "flex", gap: 4, borderRadius: 2, padding: 4, background: "#0a1220", border: "1px solid #16233a" }}>
      {tabs.map((t) => {
        const on = t.k === tab;
        return (
          <button key={t.k} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.k)}
            style={{
              display: "flex", flex: 1, flexDirection: "column", alignItems: "center", gap: 5, borderRadius: 2, padding: "8px 8px", cursor: "pointer",
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
  }, [campaignId, characterId]);

  return { ctx, carregando, erro };
}

/**
 * Rolador completo — é o corpo do painel flutuante “Rolar Dados”.
 *
 * `campaignId`/`personagemSugerido` vêm da mesa: o segundo é o
 * personagem do token selecionado, só uma SUGESTÃO — quem decide se a
 * conta pode rolar por ele é o servidor, que revalida a cada rolagem.
 */
export function RoladorDados({ size = 46, campaignId = null, personagemSugerido = null }: {
  size?: number;
  campaignId?: string | null;
  personagemSugerido?: PersonagemSugerido | null;
}) {
  const [tab, setTab] = useState<"test" | "free">("test");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const characterId = escolhido ?? personagemSugerido?.id ?? null;
  const { ctx, carregando, erro } = useContextoRolagem(campaignId, characterId);
  const s = useTest(campaignId, ctx?.ficha ?? null, visibilidade);

  // O token selecionado mudou: volta a seguir a sugestão da mesa, em
  // vez de ficar preso no personagem escolhido à mão da vez passada.
  useEffect(() => { setEscolhido(null); }, [personagemSugerido?.id]);

  const identidades = ctx?.personagens ?? [];

  // Sem token selecionado (nem escolha manual), o dropdown "Rolando
  // como" já cai visualmente no primeiro personagem controlável
  // (`identidades[0]`) — mas isso era só decoração: `characterId`
  // continuava `null`, a ficha nunca era buscada, e o painel mostrava
  // "Sem personagem" por baixo de um dropdown que parecia ter alguém
  // selecionado. Aqui a escolha visual vira a escolha de verdade,
  // pra qualquer quantidade de identidades — é exatamente o que o
  // dropdown já estava mostrando como "selecionado". Selecionar um
  // token no mapa continua tendo prioridade (o efeito acima zera
  // `escolhido` quando a sugestão da mesa muda).
  useEffect(() => {
    if (!characterId && identidades.length > 0) setEscolhido(identidades[0].id);
  }, [characterId, identidades]);
  return (
    <Stack gap={16}>
      <DiceTabs tab={tab} onChange={setTab} />

      {campaignId && identidades.length > 0 && (
        <Select
          label="Rolando como"
          value={characterId ?? identidades[0]?.id ?? ""}
          onChange={setEscolhido}
          options={identidades.map((p) => ({ id: p.id, rotulo: p.nome }))}
          disabled={s.rolling}
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
    <div {...aoPassarMouse({ "border-color": "#2a3b58" })}
      style={{ borderRadius: 2, background: "linear-gradient(160deg,#0b1322,#080e19)", border: "1px solid #16233a", transition: "border-color .14s" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="painel-bandeja-dados"
        {...aoPassarMouse({ background: "rgba(255,255,255,.015)" })}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "10px 14px", border: 0, background: "transparent", cursor: "pointer", transition: "background .14s" }}>
        <Dice width={15} height={15} style={{ color: "#35c7d8", flexShrink: 0 }} />
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
