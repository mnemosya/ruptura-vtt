"use client";

/**
 * PAINEL "ROLAR DADOS" DO CONSOLE.
 *
 * É a ferramenta do VTT, não uma parecida: a casca
 * (`MolduraRolagem`), as primitivas (`Select`, `Stepper`, `CampoCD`,
 * `RollButton`, `SeletorVisibilidade`) e as peças de resultado
 * (`DadosRolados`, `FaixaResultado`) vêm todas de
 * `_dados3d/ResultadoRolagem.tsx`, o mesmo módulo que
 * `_dados3d/RoladorDados.tsx` usa. O que muda é só de onde vem a ficha
 * e quem resolve a regra.
 *
 * O clique num atributo, numa perícia ou numa defesa não rola mais
 * sozinho: ABRE este painel já preenchido. Quem rola é o botão — e até
 * lá dá pra trocar a perícia (inclusive num teste que começou como
 * atributo puro), mexer nos modificadores, pôr uma CD e escolher quem
 * enxerga o resultado.
 *
 * DADOS 3D: rolam NA MESA, exatamente como na ferramenta — o painel
 * pede (`useRolarNaMesa`) e espera as faces que os corpos rígidos
 * mostrarem quando pararem. Nunca um número sorteado antes com uma
 * animação por cima, e nunca uma bandeja dentro da própria janela: o
 * provedor da mesa envolve a campanha inteira (`CampaignShell`), então
 * o Console alcança o mesmo palco de onde estiver aberto.
 *
 * Não é modal: sem backdrop, sem trava. O Console segue clicável por
 * baixo, e clicar noutra perícia troca o que está preenchido aqui.
 *
 * A DEFESA gasta a Reação no momento de ROLAR, nunca ao abrir: abrir o
 * painel e desistir não pode consumir recurso. A penalidade cumulativa
 * (quando não há Reação sobrando) entra somada ao modificador da mesma
 * rolagem, e o aviso aparece junto do resultado.
 */

import { useCallback, useEffect, useState } from "react";
import type { CharacterAttributes } from "../../../../lib/character";
import type { RupturaRollResult } from "../../../../lib/dice/types";
import type { TableLogVisibility } from "../../../../lib/table";
import type { PhysicsDieSpec } from "../../../mesas/[campaignId]/vtt/_dados3d/ArenaDados";
import { useRolarNaMesa } from "../../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import { Chevron } from "../../../mesas/[campaignId]/vtt/_dados3d/icones";
import { lerContextoRolagemAction } from "../../../mesas/[campaignId]/vtt/_painel/acoes/rolagemPainel";
import {
  ACCENTS, BODY, CampoCD, DISPLAY, DadosRolados, FaixaResultado, GroupLabel, INK, INK_FAINT, MONO,
  MolduraRolagem, RESULTS, RollButton, Select, SeletorVisibilidade, Stack, Stepper,
  type ResultKey,
} from "../../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import type { ConsoleApi } from "../types";

const SEM_PERICIA = "";

/** O que o clique no Console pediu — o estado inicial do painel. */
export type PrefillRolagem =
  | { tipo: "atributo"; atributoId: keyof CharacterAttributes }
  | { tipo: "pericia"; periciaId: string }
  /**
   * `acao` é o NOME da ação defensiva escolhida — "Aparar",
   * "Esquivar", "Bloquear", "Resistir". Sem ele a rolagem chega na
   * mesa como a perícia que ela usa por baixo, e "Aparar" vira um
   * "teste de Luta" igual a qualquer outro: o feed perde exatamente a
   * informação pela qual a pessoa clicou.
   */
  | { tipo: "defesa"; periciaId: string; acao: string };

export function PainelRolagem({ api, prefill, onFechar }: {
  api: ConsoleApi;
  prefill: PrefillRolagem;
  onFechar: () => void;
}) {
  const mesa = api.mesa;
  // "Narrador" no seletor de visibilidade só existe pra quem é
  // narrador — e quem sabe isso é o servidor, a mesma fonte que a
  // ferramenta do VTT consulta. Sem mesa, nem se pergunta.
  const [ehNarrador, setEhNarrador] = useState(false);
  useEffect(() => {
    if (!mesa) return;
    let vivo = true;
    lerContextoRolagemAction(mesa.campaignId, mesa.characterId)
      .then((r) => { if (vivo && r.ok && r.dados) setEhNarrador(!!r.dados.ehNarrador); })
      .catch(() => { /* sem resposta, segue sem a opção de narrador */ });
    return () => { vivo = false; };
  }, [mesa]);
  const atributos = api.regras?.atributos ?? [];
  const pericias = api.regras?.pericias ?? [];

  const atributoInicial: keyof CharacterAttributes =
    prefill.tipo === "atributo" ? prefill.atributoId : api.atributoDaPericia(prefill.periciaId);
  const periciaInicial = prefill.tipo === "atributo" ? SEM_PERICIA : prefill.periciaId;

  const [atributoId, setAtributoId] = useState<string>(atributoInicial);
  const [periciaId, setPericiaId] = useState<string>(periciaInicial);
  const [mods, setMods] = useState(0);
  const [cdInput, setCdInput] = useState("");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [adv, setAdv] = useState(false);
  const [carga, setCarga] = useState(0);
  const [rolando, setRolando] = useState(false);
  const [landed, setLanded] = useState(false);
  const [resultado, setResultado] = useState<RupturaRollResult | null>(null);
  const [defesa, setDefesa] = useState<{ usouReacao: boolean; penalidade: number; defesasSemReacao: number } | null>(null);

  const rolarNaMesa = useRolarNaMesa();
  const centro = useCentroDoConsole();

  const valorAtributo = api.character.atributos[atributoId as keyof CharacterAttributes] ?? 0;
  const nd8 = valorAtributo;
  const podeRolar = nd8 > 0 && !rolando && !!rolarNaMesa;

  const opcoesAtributo = atributos.map((a) => ({
    id: a.id,
    rotulo: `${a.nome} · ${api.character.atributos[a.id as keyof CharacterAttributes] ?? 0}d8`,
  }));
  // A perícia é escolhível SEMPRE — inclusive num teste que nasceu de
  // um clique em atributo. Era a única coisa que o clique fechava sem
  // ter por quê: rolar Corpo e decidir no meio que aquilo é Atletismo
  // é o caso normal, não a exceção.
  const opcoesPericia = [
    { id: SEM_PERICIA, rotulo: "Sem perícia" },
    ...pericias.map((p) => ({ id: p.id, rotulo: `${p.nome} · +${api.character.pericias[p.id] ?? 0}` })),
  ];

  const doRoll = useCallback(async (forca: number) => {
    if (rolando || nd8 <= 0 || !rolarNaMesa) return;
    setRolando(true);
    setLanded(false);
    setResultado(null);

    // A física primeiro: as faces do teste são as que os corpos
    // mostrarem quando pararem — nunca sorteadas antes.
    const pedido: PhysicsDieSpec[] = Array.from({ length: nd8 }, (_, i) => ({ id: `teste-${i}`, sides: 8 }));
    const fisicos = await rolarNaMesa(pedido, "#35c7d8", forca);
    const dados = fisicos.map((d) => d.value);

    // A Reação da defesa é gasta AQUI, junto da rolagem que ela paga.
    const info = prefill.tipo === "defesa" ? api.prepararDefesa() : null;
    setDefesa(info);

    const cdNum = cdInput.trim() === "" ? null : Number.parseInt(cdInput, 10);
    const r = api.rolarTeste({
      atributoId: atributoId as keyof CharacterAttributes,
      periciaId: periciaId === SEM_PERICIA ? null : periciaId,
      modificador: mods + (info?.penalidade ?? 0),
      cd: cdNum != null && Number.isFinite(cdNum) ? cdNum : null,
      dados,
      visibilidade,
      intencao: prefill.tipo === "defesa" ? { tipo: "DEFESA", nome: prefill.acao } : null,
    });

    setResultado(r);
    setRolando(false);
    setLanded(true);
    setTimeout(() => setLanded(false), 500);
  }, [api, atributoId, cdInput, mods, nd8, periciaId, prefill, rolando, rolarNaMesa, visibilidade]);

  // Com o cabeçalho fora, é a linha de modo da janela que diz quando a
  // rolagem é uma DEFESA — e isso não pode sumir: defesa gasta Reação.
  const modo = prefill.tipo === "defesa"
    ? "defesa · gasta 1 reação ao rolar"
    : "d8 · maior dado + perícia + modificadores";

  return (
    <div style={CAMADA} data-testid="console-rolagem-camada">
      <div style={{ ...centro, pointerEvents: "auto" }}>
      <MolduraRolagem
        indice="01"
        codigo="Rolagem"
        titulo="Rolar Dados"
        modo={modo}
        aoFechar={onFechar}
        rotuloFechar="Fechar rolagem"
        testId="console-painel-rolagem"
      >
        <Stack gap={16}>
          {/* Uma grade só: Atributo · Perícia · Modificadores. A perícia
              leva mais espaço — os nomes dela são mais longos. */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.35fr) auto", gap: 12, alignItems: "end" }}>
            <Select label="Atributo" value={atributoId} onChange={setAtributoId} options={opcoesAtributo} disabled={rolando} />
            <Select label="Perícia" value={periciaId} onChange={setPericiaId} options={opcoesPericia} disabled={rolando} />
            <div>
              <span style={{ display: "block", fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>Mod.</span>
              <div style={{ marginTop: 4 }}><Stepper value={mods} onChange={setMods} /></div>
            </div>
          </div>

          <div style={{ borderRadius: 2, padding: 14, background: "#0c1420", border: "1px solid #16233a" }}>
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: INK_FAINT }}>
                Pool · <span style={{ color: "#35c7d8" }}>{nd8}d8</span> · maior dado
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>
                {cdInput.trim() === "" ? "sem CD definida" : `cd ${cdInput}`}
              </span>
            </div>

            <div data-testid="console-roll-dados">
              <DadosRolados
                dados={resultado ? resultado.dados : Array.from({ length: nd8 }, () => 0)}
                maiorDado={resultado ? resultado.maiorDado : -1}
                size={40}
                landed={landed}
                dim={!resultado}
                acento={resultado?.classificacaoMargem ? RESULTS[resultado.classificacaoMargem as ResultKey].accent : undefined}
              />
            </div>

            {resultado && !rolando && (
              <div className="rup-reveal" style={{ marginTop: 14 }}>
                <FaixaResultado
                  testIdTotal="console-roll-total"
                  r={{
                    maiorDado: resultado.maiorDado,
                    pericia: resultado.periciaNome ?? null,
                    periciaValor: resultado.periciaValor,
                    modificador: resultado.modificador,
                    total: resultado.total,
                    cd: resultado.cd ?? null,
                    classificacao: (resultado.classificacaoMargem as ResultKey | undefined) ?? null,
                  }}
                  nota={resultado.promocaoAplicada ? (
                    <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: ACCENTS.arcane.hex }}>
                      margem promovida por {resultado.promocaoAplicada}
                    </div>
                  ) : undefined}
                />
              </div>
            )}

            {nd8 === 0 && (
              <p style={{ margin: "10px 0 0", fontFamily: BODY, fontSize: 11.5, color: INK_FAINT }}>
                Este atributo está em 0 na ficha — sem dado pra rolar.
              </p>
            )}
          </div>

          {defesa && !defesa.usouReacao && (
            <p role="status" style={{
              margin: 0, borderRadius: 2, border: `1px solid ${ACCENTS.amber.hex}55`, background: ACCENTS.amber.soft,
              padding: "8px 10px", fontFamily: BODY, fontSize: 11.5, lineHeight: 1.45, color: "#e5c187",
            }}>
              Sem Reação disponível — {defesa.defesasSemReacao}ª defesa sem Reação nesta rodada, penalidade cumulativa
              de <strong style={{ color: ACCENTS.amber.hex }}>{defesa.penalidade}</strong> já aplicada acima.
            </p>
          )}

          <RollButton
            label={rolando ? "Rolando…" : resultado ? "Rolar de novo" : `Rolar ${nd8}d8`}
            disabled={!podeRolar}
            onRoll={doRoll}
            onChargeChange={setCarga}
          />

          <div>
            <button
              type="button"
              onClick={() => setAdv((v) => !v)}
              style={{ display: "flex", width: "100%", alignItems: "center", border: 0, padding: 0, background: "transparent", cursor: "pointer" }}
            >
              <GroupLabel right={<Chevron width={13} height={13} style={{ color: INK_FAINT, transform: adv ? "rotate(180deg)" : "none" }} />}>
                Definir CD
              </GroupLabel>
            </button>
            {adv && <div style={{ paddingTop: 4 }}><CampoCD value={cdInput} onChange={setCdInput} /></div>}
          </div>

          {mesa && <SeletorVisibilidade valor={visibilidade} onChange={setVisibilidade} ehNarrador={ehNarrador} />}
        </Stack>
      </MolduraRolagem>
      </div>
      {/* `carga` alimenta só o tremor dos dados no botão; nada a mostrar aqui. */}
      <span hidden>{carga}</span>
    </div>
  );
}

/**
 * SEM BACKDROP — é uma janela flutuante, não um modal.
 *
 * A ferramenta do VTT nunca escureceu o mapa nem bloqueou o clique
 * atrás dela, e esta é a mesma ferramenta: com a rolagem aberta dá pra
 * continuar mexendo no Console (marcar uma condição, gastar um PA,
 * clicar noutra perícia) sem fechar nada. A camada existe só pra
 * POSICIONAR a janela em coordenada de tela; `pointer-events: none`
 * garante que ela não intercepte nada — só a própria janela recebe
 * clique (`pointer-events: auto`, logo acima).
 *
 * Por consequência, fechar é pelo X. Não existe "clicar fora": fora
 * dela a pessoa está clicando no Console, e isso tem que funcionar.
 */
const CAMADA: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 520,
  pointerEvents: "none",
};

/** Centro do Console, seguido enquanto ele mudar de tamanho ou lugar. */
function useCentroDoConsole(): React.CSSProperties {
  const [centro, setCentro] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const alvo = document.querySelector<HTMLElement>(".rc-window");
    if (!alvo) return;
    const medir = () => {
      const r = alvo.getBoundingClientRect();
      setCentro({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    medir();
    const obs = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    obs?.observe(alvo);
    window.addEventListener("resize", medir);
    return () => { obs?.disconnect(); window.removeEventListener("resize", medir); };
  }, []);
  // Sem Console por perto (não deveria acontecer — este painel é dele),
  // cai no centro da tela em vez de sumir num canto.
  return centro
    ? { position: "absolute", left: centro.x, top: centro.y, transform: "translate(-50%, -50%)", maxHeight: "100%" }
    : { position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24 };
}
