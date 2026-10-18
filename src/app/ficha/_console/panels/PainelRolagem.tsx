"use client";

/**
 * PAINEL "ROLAR DADOS" DO CONSOLE.
 *
 * É a ferramenta do VTT, não uma parecida — na linha F: a casca é a
 * `JanelaFerramenta` (id "dados"), e a vitrine, as listas próprias de
 * atributo/perícia (`SeletorToken`), o pool de d8 (`TestPool`), Mod./CD
 * (`AjusteMod`/`AjusteCD`), "Quem vê" (`QuemVe`) e o botão
 * (`RollButton variante="f"`) vêm de `_dados3d/RoladorDados.tsx` e
 * `_dados3d/ResultadoRolagem.tsx`, os mesmos da `PainelDados` do VTT.
 * O que muda é só de onde vem a ficha, quem resolve a regra e onde a
 * janela mora (centrada no Console, sem posição lembrada).
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

import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterAttributes } from "../../../../lib/character";
import type { RupturaRollResult } from "../../../../lib/dice/types";
import { getRupturaPool } from "../../../../lib/dice";
import type { TableLogVisibility } from "../../../../lib/table";
import type { PhysicsDieSpec } from "../../../mesas/[campaignId]/vtt/_dados3d/ArenaDados";
import { useRolarNaMesa } from "../../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import { lerContextoRolagemAction } from "../../../mesas/[campaignId]/vtt/_painel/acoes/rolagemPainel";
import { Dices } from "lucide-react";
import {
  ACCENTS, BODY, FaixaResultado, MONO, RollButton, VISIBILIDADES, useArrastoJanela,
  type ResultKey,
} from "../../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import {
  AjusteCD, AjusteMod, AvatarIdentidade, QuemVe, SeletorToken, TestPool,
  type Identidade, type Roll,
} from "../../../mesas/[campaignId]/vtt/_dados3d/RoladorDados";
import { JanelaFerramenta } from "../../../mesas/[campaignId]/vtt/_shell/JanelaFerramenta";
// A janela F vive fora do palco do VTT (e em `/ficha`, fora da rota do
// VTT): as folhas dela vêm junto, e `rolagem-f.css` cobre o esqueleto
// que `vtt.css` dá lá dentro.
import "../../../mesas/[campaignId]/vtt/_tema/janelas-f.css";
import "../../../mesas/[campaignId]/vtt/_tema/janela-dados.css";
import "./rolagem-f.css";
import type { ConsoleApi } from "../types";
import { useCentroDoConsole } from "../useCentroDoConsole";

const SEM_PERICIA = "";

/** O que o clique no Console pediu — o estado inicial do painel. */
export type PrefillRolagem =
  | { tipo: "atributo"; atributoId: keyof CharacterAttributes }
  | { tipo: "pericia"; periciaId: string }
  | { tipo: "colapso"; atributoId: keyof CharacterAttributes; cd: number }
  /**
   * `acao` é o NOME da ação defensiva escolhida — "Aparar",
   * "Esquivar", "Bloquear", "Resistir". Sem ele a rolagem chega na
   * mesa como a perícia que ela usa por baixo, e "Aparar" vira um
   * "teste de Luta" igual a qualquer outro: o feed perde exatamente a
   * informação pela qual a pessoa clicou.
   */
  | { tipo: "defesa"; periciaId: string; acao: string }
  /** Ação da aba Ações (Agarrar, Investigar, Sondar…): o feed mostra o nome da ação, não só a perícia. */
  | { tipo: "acao"; periciaId: string; acao: string };

export function PainelRolagem({ api, prefill, onFechar, acaoToken }: {
  api: ConsoleApi;
  prefill: PrefillRolagem;
  onFechar: () => void;
  acaoToken?: {
    nome: string;
    visibilidade: "public" | "gm";
    penalidadeAlcance?: number;
    /**
     * Ataque CONTESTADO (com alvo): chamado com a rolagem pronta, para
     * abrir o cartão de ataque no chat (`declararAtaqueAction`). As faces
     * são as mesmas que acabaram de ser gravadas na rolagem.
     */
    onRolado?: (entrada: { atributoId: string; periciaId: string | null; modificador: number; dados: number[] }) => void;
  };
}) {
  const mesa = api.mesa;
  // "Narrador" no seletor de visibilidade só existe pra quem é
  // narrador — e quem sabe isso é o servidor, a mesma fonte que a
  // ferramenta do VTT consulta. Sem mesa, nem se pergunta.
  const [ehNarrador, setEhNarrador] = useState(false);
  const [identidade, setIdentidade] = useState<{ nome: string; avatarUrl: string | null; tipo: "jogador" | "pn" } | null>(null);
  useEffect(() => {
    if (!mesa) return;
    let vivo = true;
    lerContextoRolagemAction(mesa.campaignId, mesa.characterId)
      .then((r) => {
        if (!vivo || !r.ok || !r.dados) return;
        setEhNarrador(!!r.dados.ehNarrador);
        const eu = r.dados.personagens?.find((p) => p.id === mesa.characterId);
        if (eu) setIdentidade({ nome: eu.nome, avatarUrl: eu.avatarUrl ?? null, tipo: eu.tipo === "pn" ? "pn" : "jogador" });
      })
      .catch(() => { /* sem resposta, segue sem a opção de narrador */ });
    return () => { vivo = false; };
  }, [mesa]);
  const atributos = api.regras?.atributos ?? [];
  const pericias = api.regras?.pericias ?? [];

  const testeColapso = prefill.tipo === "colapso";
  const atributoInicial: keyof CharacterAttributes =
    prefill.tipo === "atributo" || prefill.tipo === "colapso" ? prefill.atributoId : api.atributoDaPericia(prefill.periciaId);
  const periciaInicial = prefill.tipo === "atributo" || prefill.tipo === "colapso" ? SEM_PERICIA : prefill.periciaId;

  const [atributoId, setAtributoId] = useState<string>(atributoInicial);
  const [periciaId, setPericiaId] = useState<string>(periciaInicial);
  const [mods, setMods] = useState(0);
  const [cdInput, setCdInput] = useState(prefill.tipo === "colapso" ? String(prefill.cd) : "");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>(acaoToken?.visibilidade ?? "public");
  const [carga, setCarga] = useState(0);
  const [rolando, setRolando] = useState(false);
  const [landed, setLanded] = useState(false);
  const [resultado, setResultado] = useState<RupturaRollResult | null>(null);
  const [defesa, setDefesa] = useState<{ usouReacao: boolean; penalidade: number; defesasSemReacao: number } | null>(null);

  const rolarNaMesa = useRolarNaMesa();
  const centro = useCentroDoConsole();
  const posicao = centro
    ? { position: "absolute" as const, left: centro.x, top: centro.y, transform: "translate(-50%, -50%)", maxHeight: "100%" }
    : { position: "absolute" as const, inset: 0, display: "grid", placeItems: "center", padding: 24 };

  const valorAtributo = api.character.atributos[atributoId as keyof CharacterAttributes] ?? 0;
  const pool = getRupturaPool(valorAtributo);
  const nd8 = pool.quantidadeDados;
  const podeRolar = !rolando && !!rolarNaMesa && !((testeColapso || acaoToken) && resultado);

  const opcoesAtributo = atributos.map((a) => {
    const definicao = getRupturaPool(api.character.atributos[a.id as keyof CharacterAttributes] ?? 0);
    return {
      id: a.id,
      rotulo: a.nome,
      valor: `${definicao.quantidadeDados}d8 ${definicao.modoSelecao === "lowest" ? "↓" : "↑"}`,
    };
  });
  // A perícia é escolhível SEMPRE — inclusive num teste que nasceu de
  // um clique em atributo. Era a única coisa que o clique fechava sem
  // ter por quê: rolar Corpo e decidir no meio que aquilo é Atletismo
  // é o caso normal, não a exceção.
  const opcoesPericia = [
    { id: SEM_PERICIA, rotulo: "Sem perícia" },
    ...pericias.map((p) => ({ id: p.id, rotulo: p.nome, valor: `+${api.character.pericias[p.id] ?? 0}` })),
  ];

  const doRoll = useCallback(async (forca: number) => {
    if (rolando || !rolarNaMesa || (acaoToken && resultado)) return;
    setRolando(true);
    setLanded(false);
    setResultado(null);

    // A física primeiro: as faces do teste são as que os corpos
    // mostrarem quando pararem — nunca sorteadas antes.
    const pedido: PhysicsDieSpec[] = Array.from({ length: nd8 }, (_, i) => ({ id: `teste-${i}`, sides: 8 }));
    const fisicos = await rolarNaMesa(pedido, "#00d4ff", forca);
    const dados = fisicos.map((d) => d.value);

    // A Reação da defesa é gasta AQUI, junto da rolagem que ela paga.
    const info = prefill.tipo === "defesa" ? api.prepararDefesa() : null;
    setDefesa(info);

    const cdNum = cdInput.trim() === "" ? null : Number.parseInt(cdInput, 10);
    const r = api.rolarTeste({
      atributoId: atributoId as keyof CharacterAttributes,
      periciaId: periciaId === SEM_PERICIA ? null : periciaId,
      modificador: mods + (info?.penalidade ?? 0) + (acaoToken?.penalidadeAlcance ?? 0),
      cd: cdNum != null && Number.isFinite(cdNum) ? cdNum : null,
      dados,
      visibilidade,
      intencao: acaoToken ? { tipo: "ATAQUE", nome: acaoToken.nome } : prefill.tipo === "defesa"
        ? { tipo: "DEFESA", nome: prefill.acao }
        : prefill.tipo === "acao" ? { tipo: "AÇÃO", nome: prefill.acao }
        : prefill.tipo === "colapso" ? { tipo: "COLAPSO", nome: "Teste decisivo" } : null,
      // Ataque contestado: os dados vão para o cartão do ataque, não
      // para um cartão de rolagem à parte.
      publicar: acaoToken?.onRolado ? false : undefined,
    });

    setResultado(r);
    acaoToken?.onRolado?.({
      atributoId,
      periciaId: periciaId === SEM_PERICIA ? null : periciaId,
      modificador: mods + (info?.penalidade ?? 0),
      dados: r.dados,
    });
    if (testeColapso) api.aplicarTesteDecisivoColapso(r.dados);
    setRolando(false);
    setLanded(true);
    setTimeout(() => setLanded(false), 500);
  }, [api, atributoId, cdInput, mods, nd8, periciaId, prefill, rolando, rolarNaMesa, testeColapso, visibilidade, acaoToken, resultado]);

  /* Rolagem de uma AÇÃO DO TOKEN (depois de confirmar o ataque) fecha
     só pelo X: fechar no clique fora derrubava a rolagem quando a pessoa
     trocava de aba (chat, Console) no meio do ataque. */
  const janelaRef = useRef<HTMLDivElement>(null);
  const { desloc, iniciarArrasto, refJanela } = useArrastoJanela();

  // Sem cabeçalho de regra (como na ferramenta do VTT), a linha de modo
  // só aparece quando a rolagem tem algo que NÃO pode passar batido:
  // defesa gasta Reação, e o colapso é o teste decisivo.
  const modo = prefill.tipo === "colapso"
    ? "colapso · teste decisivo"
    : prefill.tipo === "defesa"
    ? "defesa · gasta 1 reação ao rolar"
    : undefined;

  // O resultado do Console no formato do `TestPool` da ferramenta.
  const rolagemPool: Roll | null = resultado ? {
    dados: resultado.dados,
    maiorDado: resultado.maiorDado,
    quantidadeDados: resultado.quantidadeDados,
    modoSelecao: resultado.modoSelecao,
    atributo: resultado.atributoNome,
    atributoValor: resultado.atributoValor,
    pericia: resultado.periciaNome ?? null,
    periciaValor: resultado.periciaValor,
    modificador: resultado.modificador,
    total: resultado.total,
    cd: resultado.cd ?? null,
    sucesso: resultado.sucesso ?? null,
    classificacao: (resultado.classificacaoMargem as ResultKey | undefined) ?? null,
  } : null;

  const tagAtributo = `${nd8}d8 ${pool.modoSelecao === "lowest" ? "↓" : "↑"}`;
  const periciaAtual = pericias.find((p) => p.id === periciaId);
  const rotuloAtributo = opcoesAtributo.find((item) => item.id === atributoId)?.rotulo ?? atributoId;
  const rotulo = rolando ? "Rolando…" : testeColapso && resultado ? "Resultado aplicado" : resultado ? "Rolar de novo" : `Rolar ${nd8}d8`;
  const dica = VISIBILIDADES.find((v) => v.v === visibilidade)?.dica;
  const nota = carga > 0
    ? `Força ${Math.round(carga * 100)}%${carga >= 0.995 ? " · máxima" : ""}`
    : `Segure pra carregar força${mesa && dica ? ` · ${dica}` : ""}`;
  const identPool: Identidade | null = identidade && mesa
    ? { id: mesa.characterId, nome: identidade.nome, avatarUrl: identidade.avatarUrl, tipo: identidade.tipo }
    : null;

  return (
    <div style={CAMADA} data-testid="console-rolagem-camada">
      {/* Sem Console pra centralizar (ação do token), `posicao` é a TELA
          INTEIRA (`inset: 0` + grid centrado) — com `pointer-events:
          auto` ali, a caixa engolia todo clique no mapa. Quem ocupa a
          tela deixa passar; só a janela em si recebe clique. */}
      <div style={{ ...posicao, pointerEvents: centro ? "auto" : "none" }}>
      <div ref={janelaRef} style={{ pointerEvents: "auto" }}>
      {/* A MESMA janela da ferramenta Rolar Dados do VTT (linha F). Só a
          posição é do Console: centrada nele e arrastada pelo cabeçalho,
          sem a posição lembrada da ferramenta. `rv-moldura-rolagem` é a
          raiz dos tokens do chassi/Forja para quem mora fora do palco. */}
      <JanelaFerramenta
        id="dados"
        icone={<Dices size={16} />}
        titulo="Rolar Dados"
        tecla={null}
        modo={modo}
        rotulo="Rolar Dados"
        rotuloFechar="Fechar rolagem"
        aoFechar={onFechar}
        className="rv-dados-painel rv-moldura-rolagem rc-rolagem-f"
        testId="console-painel-rolagem"
        atributos={{ "data-design": "ferramenta-flutuante" }}
        estiloExterno={{ position: "relative", left: "auto", top: "auto", transform: `translate(${desloc.x}px, ${desloc.y}px)` }}
        aoPressionarCabecalhoExterno={iniciarArrasto}
        refExterna={(el) => { refJanela.current = el; }}
      >
        <div className="rv-dados-corpo jf-corpo rup-scroll">
          {/* Sem abas: o Console só rola Atributo & Perícia — não há modo Livre aqui. */}
          <div className="rv-rf">
            <div className="jf-hero rv-rf-hero">
              {/* "Rolando como" — fixo: quem rola é a ficha aberta, sem lista pra trocar. */}
              {identPool && (
                <span className="rv-rf-sel">
                  <span className="rv-rf-token rv-rf-ident is-fixo" data-testid="rolador-identidade">
                    <span className="rv-sr-only">Rolando como: </span>
                    <AvatarIdentidade p={identPool} />
                    <span className="rv-rf-token-nome">{identPool.nome}</span>
                  </span>
                </span>
              )}

              <div className="rv-rf-dados" data-testid="console-roll-dados">
                <TestPool r={rolagemPool} count={nd8} rolling={rolando} landed={landed} carga={carga} />
              </div>

              <div className="rv-rf-frase">
                {testeColapso ? (
                  /* Colapso: atributo e perícia são os da regra, não escolha. */
                  <>
                    <span className="rv-rf-sel"><span className="rv-rf-token is-fixo">
                      <span className="rv-sr-only">Atributo: </span>
                      <span className="rv-rf-token-nome">{rotuloAtributo}</span>
                      <span className="rv-rf-tag">{tagAtributo}</span>
                    </span></span>
                    <span className="rv-rf-mais" aria-hidden="true">+</span>
                    <span className="rv-rf-sel"><span className="rv-rf-token is-fixo">
                      <span className="rv-sr-only">Perícia: </span>
                      <span className="rv-rf-token-nome">Sem perícia</span>
                    </span></span>
                  </>
                ) : (
                  <>
                    <SeletorToken titulo="Atributo" valor={atributoId} opcoes={opcoesAtributo} onEscolher={setAtributoId}
                      desabilitado={rolando} preferirCima tag={tagAtributo} />
                    <span className="rv-rf-mais" aria-hidden="true">+</span>
                    {/* A perícia é escolhível SEMPRE — inclusive num teste que nasceu de um clique em atributo. */}
                    <SeletorToken titulo="Perícia" valor={periciaId} opcoes={opcoesPericia} onEscolher={setPericiaId}
                      desabilitado={rolando} preferirCima direita
                      tag={periciaAtual ? `+${api.character.pericias[periciaAtual.id] ?? 0}` : undefined} />
                  </>
                )}
              </div>

              {valorAtributo === 0 && <p className="rv-rf-aviso">Atributo 0: role 2d8 e use o menor resultado.</p>}

              {resultado && !rolando && (
                <div className="rup-reveal rv-rf-faixa">
                  <FaixaResultado
                    testIdTotal="console-roll-total"
                    r={{
                      maiorDado: resultado.maiorDado,
                      modoSelecao: resultado.modoSelecao,
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
            </div>

            {defesa && !defesa.usouReacao && (
              <p role="status" style={{
                margin: 0, borderRadius: 0, border: `1px solid ${ACCENTS.amber.hex}55`, background: ACCENTS.amber.soft,
                padding: "8px 10px", fontFamily: BODY, fontSize: 11.5, lineHeight: 1.45, color: "#e5c187",
              }}>
                Sem Reação disponível — {defesa.defesasSemReacao}ª defesa sem Reação nesta rodada, penalidade cumulativa
                de <strong style={{ color: ACCENTS.amber.hex }}>{defesa.penalidade}</strong> já aplicada acima.
              </p>
            )}

            <div className="jf-ajustes rv-rf-ajustes">
              <AjusteMod valor={mods} onChange={setMods} />
              {testeColapso ? (
                /* CD do colapso é fixa: a da regra, sem − e +. */
                <div className="jf-ajuste">
                  <span className="jf-l">CD</span>
                  <span className="jf-ajuste-ctl"><span className="jf-ajuste-v" aria-label="Classe de dificuldade">{cdInput}</span></span>
                </div>
              ) : (
                <AjusteCD valor={cdInput} onChange={setCdInput} />
              )}
            </div>

            {mesa && <QuemVe valor={visibilidade} onChange={setVisibilidade} ehNarrador={ehNarrador} />}

            {acaoToken && (
              <p className="jf-leg" style={{ margin: 0 }}>
                {acaoToken.nome}{acaoToken.penalidadeAlcance ? ` · Alcance: ${acaoToken.penalidadeAlcance}` : ""}
              </p>
            )}

            <RollButton variante="f" label={rotulo} disabled={!podeRolar} onRoll={doRoll} onChargeChange={setCarga} />
            <p className="jf-nota">{nota}</p>
          </div>
        </div>
      </JanelaFerramenta>
      </div>
      </div>
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
