"use client";

/**
 * A aba INVENTÁRIO na estrutura do desenho e nas cores do Console.
 *
 * Mesma geometria da cópia fiel (`GaleriaInventarioFigma`) — gerada do
 * MESMO nó, pelo mesmo conversor —, com uma única diferença: as cores
 * passam por uma TABELA DE TRADUÇÃO antes de entrar. O arquivo do Figma
 * está na paleta ANTIGA do Console, aposentada no commit `3d6a9c6`
 * quando o Console foi alinhado ao VTT; a tabela segue os pares
 * daquele commit onde eles existem e completa o resto pelo PAPEL da
 * cor — superfície vira superfície, fio vira fio, âmbar vira âmbar.
 *
 * As duas ficam lado a lado na galeria de propósito: a fiel é a régua,
 * esta é a leitura. Divergência entre elas que não seja cor é erro.
 *
 * Ainda ESTÁTICA: o conteúdo é o do desenho. Ligar inventário de
 * verdade é o próximo passo, e é ele que vai trocar os nós fixos por
 * dados — a estrutura não precisa mudar pra isso.
 */

const imgSvg = "/figma/inventario/imgSvg.svg";
const imgSvg1 = "/figma/inventario/imgSvg1.svg";
const imgSvg2 = "/figma/inventario/imgSvg2.svg";
const imgSearch = "/figma/inventario/imgSearch.svg";
const imgFilter = "/figma/inventario/imgFilter.svg";
const imgPlus = "/figma/inventario/imgPlus.svg";
const imgVector = "/figma/inventario/imgVector.svg";
const imgVector1 = "/figma/inventario/imgVector1.svg";
const imgVector2 = "/figma/inventario/imgVector2.svg";
const imgVector3 = "/figma/inventario/imgVector3.svg";
const imgVector4 = "/figma/inventario/imgVector4.svg";
const imgVector5 = "/figma/inventario/imgVector5.svg";
const img06Katana = "/figma/inventario/img06Katana.svg";
const imgText = "/figma/inventario/imgText.svg";
const imgFrame205 = "/figma/inventario/imgFrame205.svg";
const imgMinus = "/figma/inventario/imgMinus.svg";
const imgPlus1 = "/figma/inventario/imgPlus1.svg";

export function InventarioFiel() {
  return (
    <div style={{ borderWidth: "1px", borderColor: "rgba(0,212,255,0.3)", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "1px", position: "relative", boxShadow: "0px 30px 90px 0px rgba(0,0,0,0.72)", width: "100%", height: "100%" }} data-node-id="159:40520" data-name="Dialog">
      <div aria-hidden style={{ position: "absolute", background: "rgba(12,20,32,0.96)", inset: "0", pointerEvents: "none" }} />
      <div style={{ position: "absolute", background: "#070c16", height: "1000px", left: "0", opacity: ".7", overflow: "clip", top: "0", width: "1920px" }} data-node-id="159:40521" data-name="Bg console">
        <div style={{ position: "absolute", background: "#111d31", height: "821px", left: "0", top: "0", width: "1px" }} data-node-id="159:40522" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "656px", top: "0", width: "1px" }} data-node-id="159:40523" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "41px", top: "0", width: "1px" }} data-node-id="159:40524" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "697px", top: "0", width: "1px" }} data-node-id="159:40525" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "82px", top: "0", width: "1px" }} data-node-id="159:40526" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "738px", top: "0", width: "1px" }} data-node-id="159:40527" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "123px", top: "0", width: "1px" }} data-node-id="159:40528" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "779px", top: "0", width: "1px" }} data-node-id="159:40529" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "164px", top: "0", width: "1px" }} data-node-id="159:40530" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "820px", top: "0", width: "1px" }} data-node-id="159:40531" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "205px", top: "0", width: "1px" }} data-node-id="159:40532" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "861px", top: "0", width: "1px" }} data-node-id="159:40533" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "246px", top: "0", width: "1px" }} data-node-id="159:40534" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "902px", top: "0", width: "1px" }} data-node-id="159:40535" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1312px", top: "0", width: "1px" }} data-node-id="159:40536" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "287px", top: "0", width: "1px" }} data-node-id="159:40537" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "943px", top: "0", width: "1px" }} data-node-id="159:40538" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1353px", top: "0", width: "1px" }} data-node-id="159:40539" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "328px", top: "0", width: "1px" }} data-node-id="159:40540" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "984px", top: "0", width: "1px" }} data-node-id="159:40541" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1394px", top: "0", width: "1px" }} data-node-id="159:40542" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "369px", top: "0", width: "1px" }} data-node-id="159:40543" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1025px", top: "0", width: "1px" }} data-node-id="159:40544" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1435px", top: "0", width: "1px" }} data-node-id="159:40545" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "410px", top: "0", width: "1px" }} data-node-id="159:40546" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1066px", top: "0", width: "1px" }} data-node-id="159:40547" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1476px", top: "0", width: "1px" }} data-node-id="159:40548" />
        <div style={{ position: "absolute", background: "#111d31", height: "1000px", left: "1722px", top: "0", width: "1px" }} data-node-id="159:40549" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "451px", top: "0", width: "1px" }} data-node-id="159:40550" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1107px", top: "0", width: "1px" }} data-node-id="159:40551" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1517px", top: "0", width: "1px" }} data-node-id="159:40552" />
        <div style={{ position: "absolute", background: "#111d31", height: "1000px", left: "1763px", top: "0", width: "1px" }} data-node-id="159:40553" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "492px", top: "0", width: "1px" }} data-node-id="159:40554" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1148px", top: "0", width: "1px" }} data-node-id="159:40555" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1558px", top: "0", width: "1px" }} data-node-id="159:40556" />
        <div style={{ position: "absolute", background: "#111d31", height: "1000px", left: "1804px", top: "0", width: "1px" }} data-node-id="159:40557" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "533px", top: "0", width: "1px" }} data-node-id="159:40558" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1189px", top: "0", width: "1px" }} data-node-id="159:40559" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1599px", top: "0", width: "1px" }} data-node-id="159:40560" />
        <div style={{ position: "absolute", background: "#111d31", height: "1000px", left: "1845px", top: "0", width: "1px" }} data-node-id="159:40561" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "574px", top: "0", width: "1px" }} data-node-id="159:40562" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1230px", top: "0", width: "1px" }} data-node-id="159:40563" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1640px", top: "0", width: "1px" }} data-node-id="159:40564" />
        <div style={{ position: "absolute", background: "#111d31", height: "1000px", left: "1886px", top: "0", width: "1px" }} data-node-id="159:40565" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "615px", top: "0", width: "1px" }} data-node-id="159:40566" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1271px", top: "0", width: "1px" }} data-node-id="159:40567" />
        <div style={{ position: "absolute", background: "#111d31", height: "1025px", left: "1681px", top: "0", width: "1px" }} data-node-id="159:40568" />
        <div style={{ position: "absolute", background: "#111d31", height: "1000px", left: "1927px", top: "0", width: "1px" }} data-node-id="159:40569" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "0", width: "1920px" }} data-node-id="159:40570" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "41px", width: "1920px" }} data-node-id="159:40571" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "82px", width: "1920px" }} data-node-id="159:40572" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "123px", width: "1920px" }} data-node-id="159:40573" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "164px", width: "1920px" }} data-node-id="159:40574" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "205px", width: "1920px" }} data-node-id="159:40575" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "246px", width: "1920px" }} data-node-id="159:40576" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "287px", width: "1920px" }} data-node-id="159:40577" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "328px", width: "1920px" }} data-node-id="159:40578" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "369px", width: "1920px" }} data-node-id="159:40579" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "410px", width: "1920px" }} data-node-id="159:40580" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "451px", width: "1920px" }} data-node-id="159:40581" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "492px", width: "1920px" }} data-node-id="159:40582" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "533px", width: "1920px" }} data-node-id="159:40583" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "574px", width: "1920px" }} data-node-id="159:40584" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "615px", width: "1920px" }} data-node-id="159:40585" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "656px", width: "1920px" }} data-node-id="159:40586" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "697px", width: "1920px" }} data-node-id="159:40587" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "738px", width: "1920px" }} data-node-id="159:40588" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "861px", width: "1920px" }} data-node-id="159:40589" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "984px", width: "1920px" }} data-node-id="159:40590" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "779px", width: "1920px" }} data-node-id="159:40591" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "902px", width: "1920px" }} data-node-id="159:40592" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "1025px", width: "1920px" }} data-node-id="159:40593" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "820px", width: "1920px" }} data-node-id="159:40594" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "943px", width: "1920px" }} data-node-id="159:40595" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "0", top: "1066px", width: "1920px" }} data-node-id="159:40596" />
        <div style={{ position: "absolute", background: "#111d31", height: "1px", left: "-2494px", top: "1666px", width: "1682px" }} data-node-id="159:40597" />
      </div>
      <div style={{ borderColor: "rgba(0,212,255,0.3)", borderBottomWidth: "1px", borderStyle: "solid", alignContent: "stretch", display: "flex", height: "44px", alignItems: "center", justifyContent: "space-between", paddingBottom: "1px", paddingLeft: "20px", paddingRight: "12px", position: "relative", flexShrink: "0", width: "100%", backgroundImage: "linear-gradient(91.1713177824472deg, rgb(18, 54, 64) 0%, rgb(12, 30, 40) 100%)"}} data-node-id="159:40598"  data-name="Background+HorizontalBorder">
        <div style={{ position: "relative", flexShrink: "0" }} data-node-id="159:40599" data-name="Container">
          <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", position: "relative", width: "100%", height: "100%" }}>
            <div style={{ wordBreak: "break-word", display: "flex", flexDirection: "column", fontWeight: "700", justifyContent: "center", lineHeight: "0", position: "relative", flexShrink: "0", color: "#d6e4f5", fontSize: "12px", letterSpacing: "1.98px", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="159:40600">
              <p style={{ lineHeight: "normal" }}>CONSOLE DO PERSONAGEM</p>
            </div>
          </div>
        </div>
        <div style={{ position: "relative", flexShrink: "0" }} data-node-id="159:40601" data-name="Container">
          <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", gap: "5px", alignItems: "center", position: "relative", width: "100%", height: "100%" }}>
            <div style={{ borderWidth: "1px", borderColor: "rgba(0,212,255,0.3)", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", paddingLeft: "7px", paddingRight: "6px", paddingTop: "6.5px", paddingBottom: "6.5px", position: "relative", flexShrink: "0", width: "28px", height: "28px" }} data-node-id="159:40602" data-name="Button - Minimizar console">
              <div style={{ position: "relative", flexShrink: "0", width: "15px", height: "15px" }} data-node-id="159:40603" data-name="SVG">
                <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgSvg} />
              </div>
            </div>
            <div style={{ borderWidth: "1px", borderColor: "rgba(0,212,255,0.3)", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", paddingLeft: "7px", paddingRight: "7px", paddingTop: "7.5px", paddingBottom: "7.5px", position: "relative", flexShrink: "0", width: "28px", height: "28px" }} data-node-id="159:40605" data-name="Button - Maximizar console">
              <div style={{ position: "relative", flexShrink: "0", width: "13px", height: "13px" }} data-node-id="159:40606" data-name="SVG">
                <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgSvg1} />
              </div>
            </div>
            <div style={{ borderWidth: "1px", borderColor: "rgba(209,80,104,0.6)", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", paddingLeft: "7px", paddingRight: "5px", paddingTop: "6px", paddingBottom: "6px", position: "relative", flexShrink: "0", width: "28px", height: "28px" }} data-node-id="159:40608" data-name="Button - Fechar console">
              <div style={{ position: "relative", flexShrink: "0", width: "16px", height: "16px" }} data-node-id="159:40609" data-name="SVG">
                <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgSvg2} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ alignContent: "stretch", display: "flex", flexDirection: "column", height: "680px", alignItems: "flex-start", overflow: "auto", padding: "24px", position: "relative", flexShrink: "0" }} data-node-id="159:40612" data-name="Container">
        <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", alignItems: "flex-start", minHeight: "1px", position: "relative", width: "100%" }} data-node-id="159:40613">
          <div style={{ alignContent: "stretch", display: "flex", height: "100%", alignItems: "flex-start", position: "relative", flexShrink: "0", width: "768px" }} data-node-id="159:40614" data-name="Container">
            <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", height: "100%", alignItems: "center", minWidth: "1px", position: "relative" }} data-node-id="159:40615">
              <div style={{ alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", paddingLeft: "8px", paddingRight: "5px", position: "relative", flexShrink: "0" }} data-node-id="159:40616">
                <div style={{ background: "rgba(17,29,49,0.5)", borderColor: "rgba(0,212,255,0.14)", borderLeftWidth: "1px", borderRightWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", alignContent: "stretch", display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: "8px", paddingRight: "8px", paddingTop: "4px", paddingBottom: "4px", position: "relative", flexShrink: "0" }} data-node-id="159:40617">
                  <div style={{ wordBreak: "break-word", display: "flex", flexDirection: "column", fontWeight: "500", justifyContent: "center", lineHeight: "0", position: "relative", flexShrink: "0", fontSize: "11px", color: "rgba(0,212,255,0.72)", letterSpacing: "1.6px", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="159:40618">
                    <p style={{ lineHeight: "normal" }}>inventário</p>
                  </div>
                </div>
              </div>
              <div style={{ background: "rgba(16,26,38,0.7)", borderWidth: "1px", borderColor: "rgba(0,212,255,0.14)", borderStyle: "solid", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", alignItems: "flex-start", minHeight: "1px", position: "relative", width: "100%" }} data-node-id="159:40619">
                <div style={{ background: "rgba(16,26,38,0.7)", borderColor: "#1c2b45", borderBottomWidth: "1px", borderRightWidth: "1px", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", paddingBottom: "9px", paddingLeft: "8px", paddingRight: "9px", paddingTop: "8px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="166:43180" data-name="Tablist - Seções do console">
                  <div style={{ position: "relative", flexShrink: "0", width: "100%" }} data-node-id="166:43350">
                    <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", gap: "6px", alignItems: "center", position: "relative", width: "100%", height: "100%" }}>
                      <div style={{ background: "#1c2b45", borderWidth: "1px", borderColor: "#108bac", borderStyle: "solid", alignContent: "stretch", filter: "drop-shadow(0px 0px 4.5px rgba(0,212,255,0.25))", display: "flex", flex: "1 0 0", flexDirection: "column", alignItems: "center", minWidth: "1px", paddingLeft: "9px", paddingRight: "9px", paddingTop: "5px", paddingBottom: "5px", position: "relative" }} data-node-id="166:43181" data-name="Tab - Visão Geral">
                        <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "18px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.83)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:43182">
                          Mochila
                        </p>
                      </div>
                      <div style={{ background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(0,212,255,0.15)", borderStyle: "solid", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", alignItems: "center", minWidth: "1px", paddingLeft: "9px", paddingRight: "9px", paddingTop: "5px", paddingBottom: "5px", position: "relative" }} data-node-id="166:43183" data-name="Tab - Visão Geral">
                        <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "18px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:43184">
                          Equipado
                        </p>
                      </div>
                      <div style={{ background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(0,212,255,0.15)", borderStyle: "solid", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", alignItems: "center", minWidth: "1px", paddingLeft: "9px", paddingRight: "9px", paddingTop: "5px", paddingBottom: "5px", position: "relative" }} data-node-id="166:43185" data-name="Tab - Visão Geral">
                        <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "18px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:43186">
                          Abrigo
                        </p>
                      </div>
                      <div style={{ background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(0,212,255,0.15)", borderStyle: "solid", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", alignItems: "center", minWidth: "1px", paddingLeft: "9px", paddingRight: "9px", paddingTop: "5px", paddingBottom: "5px", position: "relative" }} data-node-id="166:43187" data-name="Tab - Visão Geral">
                        <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "18px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:43188">
                          Todos
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", alignItems: "flex-start", minHeight: "1px", position: "relative", width: "100%" }} data-node-id="159:40635">
                  <div style={{ background: "#0c1420", borderWidth: "0", borderColor: "#1c2b45", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", height: "100%", alignItems: "flex-start", overflow: "clip", position: "relative", flexShrink: "0", width: "380px" }} data-node-id="159:40636">
                    <div style={{ background: "rgba(12,20,32,0.7)", borderColor: "rgba(0,212,255,0.15)", borderBottomWidth: "1px", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", paddingBottom: "9px", paddingTop: "8px", paddingLeft: "12px", paddingRight: "12px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40637" data-name="Tab - Visão Geral">
                      <div style={{ position: "relative", flexShrink: "0", width: "100%" }} data-node-id="166:43212">
                        <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", gap: "8px", alignItems: "flex-start", position: "relative", width: "100%", height: "100%" }}>
                          <div style={{ background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "#1c2b45", borderStyle: "solid", alignContent: "stretch", display: "flex", flex: "1 0 0", gap: "8px", alignItems: "center", minWidth: "1px", overflow: "clip", paddingLeft: "9px", paddingRight: "9px", paddingTop: "5px", paddingBottom: "5px", position: "relative", borderRadius: "1px" }} data-node-id="159:40639" data-name="Input">
                            <div style={{ position: "relative", flexShrink: "0" }} data-node-id="159:40640" data-name="Icon">
                              <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", alignItems: "flex-start", position: "relative", width: "100%", height: "100%" }}>
                                <div style={{ position: "relative", flexShrink: "0", width: "13px", height: "13px" }} data-node-id="159:40641" data-name="search">
                                  <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgSearch} />
                                </div>
                              </div>
                            </div>
                            <p style={{ wordBreak: "break-word", flex: "1 0 0", fontWeight: "500", lineHeight: "18px", minWidth: "1px", fontStyle: "normal", position: "relative", fontSize: "13px", color: "rgba(214,228,245,0.45)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:40642">
                              Buscar item...
                            </p>
                          </div>
                          <div style={{ background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "#1c2b45", borderStyle: "solid", alignContent: "stretch", display: "flex", gap: "8px", alignItems: "center", justifyContent: "center", overflow: "clip", padding: "1px", position: "relative", borderRadius: "1px", flexShrink: "0", width: "28px", height: "28px" }} data-node-id="166:43205" data-name="Input">
                            <div style={{ position: "relative", flexShrink: "0", width: "13px", height: "13px" }} data-node-id="166:43207" data-name="filter">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgFilter} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ alignContent: "stretch", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", padding: "8px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40656">
                      <div style={{ alignContent: "stretch", display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start", position: "relative", flexShrink: "0", width: "364px" }} data-node-id="166:43235">
                        <div style={{ wordBreak: "break-word", alignContent: "stretch", display: "flex", gap: "4px", height: "18px", alignItems: "flex-start", position: "relative", flexShrink: "0", color: "rgba(214,228,245,0.65)", width: "100%" }} data-node-id="166:43231">
                          <p style={{ flex: "1 0 0", fontWeight: "600", lineHeight: "18px", minWidth: "1px", fontStyle: "normal", position: "relative", fontSize: "13px", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:43228">
                            Capacidade
                          </p>
                          <div style={{ alignContent: "stretch", display: "flex", gap: "4px", alignItems: "center", position: "relative", flexShrink: "0", whiteSpace: "nowrap" }} data-node-id="494:1248">
                            <p style={{ fontWeight: "700", lineHeight: "0", position: "relative", flexShrink: "0", fontSize: "0px", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="166:43230">
                              <span style={{ lineHeight: "18px", fontSize: "12px", color: "rgba(214,228,245,0.8)" }}>12</span>
                              <span style={{ lineHeight: "18px", fontSize: "12px" }}>/15</span>
                            </p>
                            <p style={{ fontWeight: "400", lineHeight: "18px", position: "relative", flexShrink: "0", fontSize: "12px", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="494:1247">
                              espaços
                            </p>
                          </div>
                        </div>
                        <div style={{ background: "#261b09", borderColor: "#846021", borderWidth: "1px", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "12px", height: "12px", alignItems: "center", overflow: "clip", paddingLeft: "11px", paddingRight: "11px", position: "relative", borderRadius: "1px", flexShrink: "0", width: "100%" }} data-node-id="166:43236">
                          <div style={{ position: "absolute", background: "#453211", height: "12px", left: "-1px", top: "-1px", width: "293px" }} data-node-id="166:43248" />
                          <div style={{ position: "absolute", left: "-2px", opacity: ".44", top: "0", width: "343px" }} data-node-id="166:43308">
                            <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", width: "100%", height: "100%" }}>
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43309" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43310" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43311" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43312" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43313" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43314" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43315" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43316" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43317" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43318" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43319" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43320" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43321" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43322" />
                              <div style={{ borderWidth: "1px", borderColor: "#846021", borderStyle: "solid", height: "10px", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43323" />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ columnGap: "8px", rowGap: "9px", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gridTemplateRows: "repeat(3,minmax(0,1fr))", height: "406px", position: "relative", flexShrink: "0", width: "364px" }} data-node-id="166:43229">
                        <div style={{ position: "absolute", background: "rgba(17,29,49,0.35)", borderWidth: "1px", borderColor: "rgba(0,212,255,0.12)", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", left: "124px", opacity: "0", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", borderRadius: "1px", width: "116px", height: "116px", top: "276px" }} data-node-id="161:42389" data-name="Container">
                          <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", alignItems: "center", justifyContent: "center", minHeight: "1px", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", width: "100%" }} data-node-id="161:42390" data-name="Text">
                            <div style={{ position: "relative", flexShrink: "0", width: "32px", height: "32px" }} data-node-id="161:42391" data-name="plus">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgPlus} />
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "linear-gradient(rgba(207,154,62,0.10),rgba(207,154,62,0.10)), rgba(17,29,49,0.7)", borderColor: "#1c2b45", borderWidth: "1px", borderStyle: "solid", gridColumn: "1", alignContent: "stretch", filter: "drop-shadow(0px 16px 2.5px rgba(6,12,19,0.01),0px 10px 2px rgba(6,12,19,0.05),0px 6px 2px rgba(6,12,19,0.17),0px 3px 1.5px rgba(6,12,19,0.3),0px 1px 0.5px rgba(6,12,19,0.34))", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", justifySelf: "stretch", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", position: "relative", borderRadius: "1px", gridRow: "1", alignSelf: "stretch", flexShrink: "0" }} data-node-id="161:42250" data-name="Container">
                          <div style={{ borderWidth: "1px", borderColor: "#16233a", borderStyle: "solid", alignContent: "stretch", display: "flex", height: "64px", alignItems: "center", justifyContent: "center", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="161:42251" data-name="Text">
                            <div aria-hidden style={{ position: "absolute", background: "rgba(31,13,10,0.43)", inset: "0", pointerEvents: "none" }} />
                            <div style={{ display: "flex", height: "36.175px", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: "0", width: "35.003px" }} data-node-id="177:43604">
                              <div style={{ flex: "none", transform: "rotate(-30deg)" }}>
                                <div style={{ height: "27.653px", position: "relative", width: "24.453px" }} data-name="Vector">
                                  <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgVector} />
                                </div>
                              </div>
                            </div>
                            <div style={{ position: "absolute", inset: "0", pointerEvents: "none", borderRadius: "inherit", boxShadow: "inset 0px 0px 13.1px 6px rgba(8,14,24,0.3)" }} />
                          </div>
                          <div style={{ wordBreak: "break-word", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", textAlign: "center", width: "100%", whiteSpace: "nowrap" }} data-node-id="161:42476">
                            <p style={{ fontWeight: "600", minWidth: "100%", overflow: "hidden", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", textOverflow: "ellipsis", width: "min-content", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42477">
                              Granada de choque
                            </p>
                            <p style={{ fontWeight: "500", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.45)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42478">
                              Explosivo
                            </p>
                          </div>
                          <div style={{ position: "absolute", borderColor: "#16233a", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", bottom: "51.33px", overflow: "clip", right: "10px", width: "24px", height: "24px" }} data-node-id="161:42457">
                            <div style={{ position: "absolute", background: "linear-gradient(rgba(207,154,62,0.10),rgba(207,154,62,0.10)), rgba(17,29,49,0.7)", borderWidth: "1px", borderColor: "rgba(207,154,62,0.10)", borderStyle: "solid", bottom: "0", alignContent: "stretch", filter: "drop-shadow(-10px -10px 2px rgba(0,0,0,0),-7px -7px 2px rgba(0,0,0,0.03),-4px -4px 1.5px rgba(0,0,0,0.11),-2px -2px 1px rgba(0,0,0,0.19),0px 0px 0.5px rgba(0,0,0,0.21))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px", right: "0", width: "24px" }} data-node-id="161:42458" data-name="Tab - Ações">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textAlign: "center", width: "100%", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42459">
                                x1
                              </p>
                            </div>
                          </div>
                          <div style={{ position: "absolute", background: "#cf9a3e", height: "128px", left: "-1px", top: "-1px", width: "2px" }} data-node-id="161:42441" />
                        </div>
                        <div style={{ background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderWidth: "1px", borderStyle: "solid", gridColumn: "2", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", justifySelf: "stretch", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", position: "relative", borderRadius: "1px", gridRow: "1", alignSelf: "stretch", flexShrink: "0" }} data-node-id="159:41097" data-name="Container">
                          <div style={{ borderWidth: "1px", borderColor: "#16233a", borderStyle: "solid", alignContent: "stretch", display: "flex", height: "64px", alignItems: "center", justifyContent: "center", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:41098" data-name="Text">
                            <div aria-hidden style={{ position: "absolute", background: "rgba(36,8,8,0.43)", inset: "0", pointerEvents: "none" }} />
                            <div style={{ height: "24px", position: "relative", flexShrink: "0", width: "28px" }} data-node-id="177:43568" data-name="Vector">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgVector1} />
                            </div>
                            <div style={{ position: "absolute", inset: "0", pointerEvents: "none", borderRadius: "inherit", boxShadow: "inset 0px 0px 13.1px 6px rgba(8,14,24,0.3)" }} />
                          </div>
                          <div style={{ wordBreak: "break-word", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", textAlign: "center", whiteSpace: "nowrap" }} data-node-id="161:42480">
                            <p style={{ fontWeight: "600", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42483">
                              Halfling X8-1
                            </p>
                            <p style={{ fontWeight: "500", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.45)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42482">
                              Espada curta
                            </p>
                          </div>
                          <div style={{ position: "absolute", borderColor: "#16233a", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", bottom: "51.33px", overflow: "clip", right: "10px", width: "24px", height: "24px" }} data-node-id="159:41253">
                            <div style={{ position: "absolute", background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(17,29,49,0.45)", borderStyle: "solid", bottom: "0", alignContent: "stretch", filter: "drop-shadow(-10px -10px 2px rgba(0,0,0,0),-7px -7px 2px rgba(0,0,0,0.03),-4px -4px 1.5px rgba(0,0,0,0.11),-2px -2px 1px rgba(0,0,0,0.19),0px 0px 0.5px rgba(0,0,0,0.21))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px", right: "0", width: "24px" }} data-node-id="159:41101" data-name="Tab - Ações">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textAlign: "center", width: "100%", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:41102">
                                x1
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderWidth: "1px", borderStyle: "solid", gridColumn: "3", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", justifySelf: "stretch", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", position: "relative", borderRadius: "1px", gridRow: "1", alignSelf: "stretch", flexShrink: "0" }} data-node-id="161:42320" data-name="Container">
                          <div style={{ borderWidth: "1px", borderColor: "#16233a", borderStyle: "solid", alignContent: "stretch", display: "flex", height: "64px", alignItems: "center", justifyContent: "center", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="161:42321" data-name="Text">
                            <div aria-hidden style={{ position: "absolute", background: "rgba(12,20,32,0.66)", inset: "0", pointerEvents: "none" }} />
                            <div style={{ position: "relative", flexShrink: "0", width: "26px", height: "26px" }} data-node-id="177:43652" data-name="Vector">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgVector2} />
                            </div>
                            <div style={{ position: "absolute", inset: "0", pointerEvents: "none", borderRadius: "inherit", boxShadow: "inset 0px 0px 13.1px 6px rgba(8,14,24,0.3)" }} />
                          </div>
                          <div style={{ wordBreak: "break-word", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", textAlign: "center", whiteSpace: "nowrap" }} data-node-id="161:42485">
                            <p style={{ fontWeight: "600", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42488">
                              Beijo de bruxa
                            </p>
                            <p style={{ fontWeight: "500", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.45)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42487">
                              Vertina
                            </p>
                          </div>
                          <div style={{ position: "absolute", borderColor: "#16233a", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", bottom: "51.33px", overflow: "clip", right: "10px", width: "24px", height: "24px" }} data-node-id="161:42325">
                            <div style={{ position: "absolute", background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(17,29,49,0.45)", borderStyle: "solid", bottom: "0", alignContent: "stretch", filter: "drop-shadow(-10px -10px 2px rgba(0,0,0,0),-7px -7px 2px rgba(0,0,0,0.03),-4px -4px 1.5px rgba(0,0,0,0.11),-2px -2px 1px rgba(0,0,0,0.19),0px 0px 0.5px rgba(0,0,0,0.21))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px", right: "0", width: "24px" }} data-node-id="161:42326" data-name="Tab - Ações">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textAlign: "center", width: "100%", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42327">
                                x2
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderWidth: "1px", borderStyle: "solid", gridColumn: "1", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", justifySelf: "stretch", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", position: "relative", borderRadius: "1px", gridRow: "2", alignSelf: "stretch", flexShrink: "0" }} data-node-id="159:41325" data-name="Container">
                          <div style={{ borderWidth: "1px", borderColor: "#16233a", borderStyle: "solid", alignContent: "stretch", display: "flex", height: "64px", alignItems: "center", justifyContent: "center", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:41326" data-name="Text">
                            <div aria-hidden style={{ position: "absolute", background: "rgba(18,15,6,0.43)", inset: "0", pointerEvents: "none" }} />
                            <div style={{ height: "27px", position: "relative", flexShrink: "0", width: "23px" }} data-node-id="177:43550" data-name="Vector">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgVector3} />
                            </div>
                            <div style={{ position: "absolute", inset: "0", pointerEvents: "none", borderRadius: "inherit", boxShadow: "inset 0px 0px 13.1px 6px rgba(8,14,24,0.3)" }} />
                          </div>
                          <div style={{ wordBreak: "break-word", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", textAlign: "center", whiteSpace: "nowrap" }} data-node-id="161:42490">
                            <p style={{ fontWeight: "600", overflow: "hidden", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", textOverflow: "ellipsis", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42499">
                              Escudo balístico
                            </p>
                            <p style={{ fontWeight: "500", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.45)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42492">
                              Escudo
                            </p>
                          </div>
                          <div style={{ position: "absolute", borderColor: "#16233a", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", bottom: "51.33px", overflow: "clip", right: "10px", width: "24px", height: "24px" }} data-node-id="159:41331">
                            <div style={{ position: "absolute", background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(17,29,49,0.45)", borderStyle: "solid", bottom: "0", alignContent: "stretch", filter: "drop-shadow(-10px -10px 2px rgba(0,0,0,0),-7px -7px 2px rgba(0,0,0,0.03),-4px -4px 1.5px rgba(0,0,0,0.11),-2px -2px 1px rgba(0,0,0,0.19),0px 0px 0.5px rgba(0,0,0,0.21))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px", right: "0", width: "24px" }} data-node-id="159:41332" data-name="Tab - Ações">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textAlign: "center", width: "100%", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:41333">
                                x1
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderWidth: "1px", borderStyle: "solid", gridColumn: "2", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", justifySelf: "stretch", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", position: "relative", borderRadius: "1px", gridRow: "2", alignSelf: "stretch", flexShrink: "0" }} data-node-id="159:41314" data-name="Container">
                          <div style={{ borderWidth: "1px", borderColor: "#16233a", borderStyle: "solid", alignContent: "stretch", display: "flex", height: "64px", alignItems: "center", justifyContent: "center", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:41315" data-name="Text">
                            <div aria-hidden style={{ position: "absolute", background: "rgba(8,20,32,0.76)", inset: "0", pointerEvents: "none" }} />
                            <div style={{ height: "23px", position: "relative", flexShrink: "0", width: "26px" }} data-node-id="177:43661" data-name="Vector">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgVector4} />
                            </div>
                            <div style={{ position: "absolute", inset: "0", pointerEvents: "none", borderRadius: "inherit", boxShadow: "inset 0px 0px 13.1px 6px rgba(8,14,24,0.3)" }} />
                          </div>
                          <div style={{ wordBreak: "break-word", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", textAlign: "center", whiteSpace: "nowrap" }} data-node-id="161:42493">
                            <p style={{ fontWeight: "600", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42501">
                              Med-kit
                            </p>
                            <p style={{ fontWeight: "500", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.45)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42495">
                              Farmácia
                            </p>
                          </div>
                          <div style={{ position: "absolute", borderColor: "#16233a", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", bottom: "51.33px", overflow: "clip", right: "10px", width: "24px", height: "24px" }} data-node-id="159:41320">
                            <div style={{ position: "absolute", background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(17,29,49,0.45)", borderStyle: "solid", bottom: "0", alignContent: "stretch", filter: "drop-shadow(-10px -10px 2px rgba(0,0,0,0),-7px -7px 2px rgba(0,0,0,0.03),-4px -4px 1.5px rgba(0,0,0,0.11),-2px -2px 1px rgba(0,0,0,0.19),0px 0px 0.5px rgba(0,0,0,0.21))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px", right: "0", width: "24px" }} data-node-id="159:41321" data-name="Tab - Ações">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textAlign: "center", width: "100%", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:41322">
                                x3
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderWidth: "1px", borderStyle: "solid", gridColumn: "3", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", justifySelf: "stretch", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", position: "relative", borderRadius: "1px", gridRow: "2", alignSelf: "stretch", flexShrink: "0" }} data-node-id="161:42237" data-name="Container">
                          <div style={{ borderWidth: "1px", borderColor: "#16233a", borderStyle: "solid", alignContent: "stretch", display: "flex", height: "64px", alignItems: "center", justifyContent: "center", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="161:42238" data-name="Text">
                            <div aria-hidden style={{ position: "absolute", background: "rgba(8,14,24,0.8)", inset: "0", pointerEvents: "none" }} />
                            <div style={{ height: "21px", position: "relative", flexShrink: "0", width: "26px" }} data-node-id="177:43685" data-name="Vector">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgVector5} />
                            </div>
                            <div style={{ position: "absolute", inset: "0", pointerEvents: "none", borderRadius: "inherit", boxShadow: "inset 0px 0px 13.1px 6px rgba(8,14,24,0.3)" }} />
                          </div>
                          <div style={{ wordBreak: "break-word", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", textAlign: "center", whiteSpace: "nowrap" }} data-node-id="161:42496">
                            <p style={{ fontWeight: "600", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42503">
                              Chip de dados
                            </p>
                            <p style={{ fontWeight: "500", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.45)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42498">
                              Utilitário
                            </p>
                          </div>
                          <div style={{ position: "absolute", borderColor: "#16233a", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", bottom: "51.33px", overflow: "clip", right: "10px", width: "24px", height: "24px" }} data-node-id="161:42243">
                            <div style={{ position: "absolute", background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(17,29,49,0.45)", borderStyle: "solid", bottom: "0", alignContent: "stretch", filter: "drop-shadow(-10px -10px 2px rgba(0,0,0,0),-7px -7px 2px rgba(0,0,0,0.03),-4px -4px 1.5px rgba(0,0,0,0.11),-2px -2px 1px rgba(0,0,0,0.19),0px 0px 0.5px rgba(0,0,0,0.21))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px", right: "0", width: "24px" }} data-node-id="161:42244" data-name="Tab - Ações">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textAlign: "center", width: "100%", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42245">
                                x2
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderWidth: "1px", borderStyle: "solid", gridColumn: "1/span 2", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", justifySelf: "stretch", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", position: "relative", borderRadius: "1px", gridRow: "3", alignSelf: "stretch", flexShrink: "0" }} data-node-id="161:42505" data-name="Container">
                          <div style={{ borderWidth: "1px", borderColor: "#16233a", borderStyle: "solid", alignContent: "stretch", display: "flex", height: "64px", alignItems: "center", justifyContent: "center", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="161:42506" data-name="Text">
                            <div aria-hidden style={{ position: "absolute", background: "rgba(36,8,8,0.43)", inset: "0", pointerEvents: "none" }} />
                            <div style={{ display: "flex", height: "43.926px", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: "0", width: "40.258px" }} data-node-id="176:43534">
                              <div style={{ flex: "none", transform: "rotate(15deg)" }}>
                                <div style={{ height: "36.961px", position: "relative", width: "31.775px" }} data-name="06- Katana">
                                  <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={img06Katana} />
                                </div>
                              </div>
                            </div>
                            <div style={{ position: "absolute", inset: "0", pointerEvents: "none", borderRadius: "inherit", boxShadow: "inset 0px 0px 13.1px 6px rgba(8,14,24,0.3)" }} />
                          </div>
                          <div style={{ wordBreak: "break-word", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", textAlign: "center", whiteSpace: "nowrap" }} data-node-id="161:42508">
                            <p style={{ fontWeight: "600", position: "relative", flexShrink: "0", fontSize: "13px", color: "rgba(214,228,245,0.65)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42509">
                              Edgelord KS-4
                            </p>
                            <p style={{ fontWeight: "500", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.45)", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42510">
                              Espada longa
                            </p>
                          </div>
                          <div style={{ position: "absolute", borderColor: "#16233a", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", bottom: "51.33px", overflow: "clip", right: "10px", width: "24px", height: "24px" }} data-node-id="161:42511">
                            <div style={{ position: "absolute", background: "rgba(17,29,49,0.45)", borderWidth: "1px", borderColor: "rgba(17,29,49,0.45)", borderStyle: "solid", bottom: "-1px", alignContent: "stretch", filter: "drop-shadow(-10px -10px 2px rgba(0,0,0,0),-7px -7px 2px rgba(0,0,0,0.03),-4px -4px 1.5px rgba(0,0,0,0.11),-2px -2px 1px rgba(0,0,0,0.19),0px 0px 0.5px rgba(0,0,0,0.21))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px", right: "0", width: "24px" }} data-node-id="161:42512" data-name="Tab - Ações">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textAlign: "center", width: "100%", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="161:42513">
                                x1
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(17,29,49,0.35)", borderColor: "#16233a", borderWidth: "1px", borderStyle: "solid", gridColumn: "3", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", justifySelf: "stretch", paddingLeft: "10px", paddingRight: "10px", paddingTop: "12px", paddingBottom: "12px", position: "relative", borderRadius: "1px", gridRow: "3", alignSelf: "stretch", flexShrink: "0" }} data-node-id="161:42393" data-name="Container">
                          <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", alignItems: "center", justifyContent: "center", minHeight: "1px", overflow: "clip", paddingLeft: "4px", paddingRight: "4px", paddingTop: "12px", paddingBottom: "12px", position: "relative", width: "100%" }} data-node-id="161:42394" data-name="Text">
                            <div style={{ position: "relative", flexShrink: "0", width: "32px", height: "32px" }} data-node-id="161:42395" data-name="plus">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgPlus} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ background: "rgba(12,20,32,0.7)", borderColor: "#1c2b45", borderLeftWidth: "1px", borderStyle: "solid", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", height: "100%", alignItems: "flex-start", minWidth: "1px", overflow: "clip", position: "relative" }} data-node-id="159:40716">
                    <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", gap: "16px", alignItems: "flex-start", minHeight: "1px", padding: "12px", position: "relative", width: "100%" }} data-node-id="159:40717">
                      <div style={{ alignContent: "stretch", display: "flex", gap: "12px", alignItems: "center", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40718">
                        <div style={{ position: "relative", flexShrink: "0", width: "56px", height: "56px" }} data-node-id="159:40719" data-name="Text">
                          <div style={{ position: "absolute", inset: "-1.79%" }}>
                            <img alt="" style={{ display: "block", maxWidth: "none", width: "100%", height: "100%" }} src={imgText} />
                          </div>
                        </div>
                        <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", gap: "2px", alignItems: "flex-start", minWidth: "1px", position: "relative" }} data-node-id="159:40721" data-name="Container">
                          <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "24px", minWidth: "100%", fontStyle: "normal", overflow: "hidden", position: "relative", flexShrink: "0", fontSize: "20px", color: "rgba(214,228,245,0.8)", textOverflow: "ellipsis", width: "min-content", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:40722">
                            Granada de choque
                          </p>
                          <div style={{ alignContent: "stretch", display: "flex", gap: "4px", alignItems: "flex-start", position: "relative", flexShrink: "0" }} data-node-id="159:40723">
                            <div style={{ background: "rgba(207,154,62,0.12)", borderWidth: "1px", borderColor: "rgba(207,154,62,0.35)", borderStyle: "solid", alignContent: "stretch", display: "flex", gap: "6px", alignItems: "center", overflow: "clip", paddingLeft: "5px", paddingRight: "5px", paddingTop: "3px", paddingBottom: "3px", position: "relative", flexShrink: "0" }} data-node-id="159:40724" data-name="Button Primary">
                              <div style={{ position: "relative", flexShrink: "0" }} data-node-id="159:40727">
                                <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", alignItems: "center", position: "relative", width: "100%", height: "100%" }}>
                                  <div style={{ wordBreak: "break-word", display: "flex", flexDirection: "column", fontWeight: "400", justifyContent: "center", lineHeight: "0", position: "relative", flexShrink: "0", color: "#cf9a3e", fontSize: "10px", letterSpacing: "0.8px", whiteSpace: "nowrap", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="159:40728">
                                    <p style={{ lineHeight: "normal" }}>Explosivo</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div style={{ background: "rgba(207,154,62,0.12)", borderWidth: "1px", borderColor: "rgba(207,154,62,0.35)", borderStyle: "solid", alignContent: "stretch", display: "flex", gap: "6px", alignItems: "center", overflow: "clip", paddingLeft: "5px", paddingRight: "5px", paddingTop: "3px", paddingBottom: "3px", position: "relative", flexShrink: "0" }} data-node-id="166:42639" data-name="Button Primary">
                              <div style={{ position: "relative", flexShrink: "0" }} data-node-id="166:42642">
                                <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", alignItems: "center", position: "relative", width: "100%", height: "100%" }}>
                                  <div style={{ wordBreak: "break-word", display: "flex", flexDirection: "column", fontWeight: "400", justifyContent: "center", lineHeight: "0", position: "relative", flexShrink: "0", color: "#cf9a3e", fontSize: "10px", letterSpacing: "0.8px", whiteSpace: "nowrap", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="166:42643">
                                    <p style={{ lineHeight: "normal" }}>Incomum</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p style={{ wordBreak: "break-word", fontWeight: "500", lineHeight: "16px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "14px", color: "rgba(214,228,245,0.65)", width: "100%", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:40786">
                        Modelo de granada compacta que libera descarga elétrica radial. Muito usada para conter grupos rapidamente.
                      </p>
                      <div style={{ alignContent: "stretch", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40742">
                        <div style={{ borderWidth: "1px", borderColor: "#1c2b45", borderStyle: "solid", alignContent: "stretch", display: "flex", alignItems: "center", position: "relative", borderRadius: "1px", flexShrink: "0", width: "100%" }} data-node-id="159:40743">
                          <div style={{ background: "rgba(17,29,49,0.45)", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", gap: "4px", alignItems: "flex-start", minWidth: "1px", padding: "10px", position: "relative", borderRadius: "1px" }} data-node-id="166:42654">
                            <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "16px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "14px", color: "rgba(214,228,245,0.65)", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:42655">
                              PA
                            </p>
                            <div style={{ alignContent: "stretch", display: "flex", gap: "6px", alignItems: "center", position: "relative", flexShrink: "0" }} data-node-id="166:42658">
                              <p style={{ wordBreak: "break-word", fontWeight: "400", lineHeight: "24px", position: "relative", flexShrink: "0", fontSize: "16px", color: "rgba(214,228,245,0.8)", textAlign: "center", width: "7px", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="166:42659">
                                2
                              </p>
                              <div style={{ height: "16px", position: "relative", flexShrink: "0", width: "36px" }} data-node-id="166:42660">
                                <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgFrame205} />
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", flex: "1 0 0", flexDirection: "row", alignItems: "center", alignSelf: "stretch" }} data-node-id="166:43407">
                            <div style={{ borderColor: "#1c2b45", borderLeftWidth: "1px", borderRightWidth: "1px", borderStyle: "solid", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", height: "100%", alignItems: "center", minWidth: "1px", position: "relative", borderRadius: "1px" }}>
                              <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", alignItems: "center", minHeight: "1px", position: "relative", width: "100%" }} data-node-id="166:43418">
                                <div style={{ background: "rgba(17,29,49,0.45)", alignContent: "stretch", display: "flex", flexDirection: "column", height: "100%", alignItems: "flex-start", justifyContent: "center", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px", flexShrink: "0", width: "110px" }} data-node-id="166:43419">
                                  <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:43420">
                                    ESPAÇOS/item
                                  </p>
                                </div>
                                <div style={{ background: "#1c2b45", height: "100%", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43421" data-name="div vertical" />
                                <div style={{ background: "rgba(12,20,32,0.6)", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", height: "100%", alignItems: "flex-start", justifyContent: "center", minWidth: "1px", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px" }} data-node-id="166:43422">
                                  <p style={{ wordBreak: "break-word", fontWeight: "500", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.8)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:43423">
                                    1
                                  </p>
                                </div>
                              </div>
                              <div style={{ background: "#1c2b45", height: "1px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="166:43424" data-name="div horizontal" />
                              <div style={{ alignContent: "stretch", display: "flex", flex: "1 0 0", alignItems: "center", minHeight: "1px", position: "relative", width: "100%" }} data-node-id="166:43425">
                                <div style={{ background: "rgba(17,29,49,0.45)", alignContent: "stretch", display: "flex", flexDirection: "column", height: "100%", alignItems: "flex-start", justifyContent: "center", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px", flexShrink: "0", width: "110px" }} data-node-id="166:43426">
                                  <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:43427">
                                    preço base
                                  </p>
                                </div>
                                <div style={{ background: "#1c2b45", height: "100%", position: "relative", flexShrink: "0", width: "1px" }} data-node-id="166:43428" data-name="div vertical" />
                                <div style={{ background: "rgba(12,20,32,0.6)", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", height: "100%", alignItems: "flex-start", justifyContent: "center", minWidth: "1px", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px" }} data-node-id="166:43429">
                                  <p style={{ wordBreak: "break-word", fontWeight: "500", lineHeight: "14px", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.8)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif", fontVariationSettings: '"CTGR" 0, "wdth" 100'}} data-node-id="166:43430" >
                                    Ⱥ 250
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={{ borderWidth: "1px", borderColor: "#1c2b45", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", borderRadius: "1px", flexShrink: "0", width: "100%" }} data-node-id="159:40757">
                          <div style={{ alignContent: "stretch", display: "flex", alignItems: "center", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40758">
                            <div style={{ background: "rgba(17,29,49,0.45)", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px", flexShrink: "0", width: "110px" }} data-node-id="159:40759">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:40760">
                                Alcance
                              </p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", alignSelf: "stretch" }} data-node-id="159:40761">
                              <div style={{ background: "#1c2b45", height: "100%", position: "relative", flexShrink: "0", width: "1px" }} data-name="div vertical" />
                            </div>
                            <div style={{ background: "rgba(12,20,32,0.6)", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", alignItems: "flex-start", minWidth: "1px", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px" }} data-node-id="159:40762">
                              <p style={{ wordBreak: "break-word", fontWeight: "500", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.8)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:40763">
                                10 metros
                              </p>
                            </div>
                          </div>
                          <div style={{ background: "#1c2b45", height: "1px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40764" data-name="div horizontal" />
                          <div style={{ alignContent: "stretch", display: "flex", alignItems: "center", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40765">
                            <div style={{ background: "rgba(17,29,49,0.45)", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px", flexShrink: "0", width: "110px" }} data-node-id="159:40766">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:40767">
                                Alvo
                              </p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", alignSelf: "stretch" }} data-node-id="159:40768">
                              <div style={{ background: "#1c2b45", height: "100%", position: "relative", flexShrink: "0", width: "1px" }} data-name="div vertical" />
                            </div>
                            <div style={{ background: "rgba(12,20,32,0.6)", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", alignItems: "flex-start", minWidth: "1px", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px" }} data-node-id="159:40769">
                              <p style={{ wordBreak: "break-word", fontWeight: "500", lineHeight: "14px", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.8)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif", fontVariationSettings: '"CTGR" 0, "wdth" 100'}} data-node-id="159:40770" >
                                Esfera ◎, 2 m de raio
                              </p>
                            </div>
                          </div>
                          <div style={{ background: "#1c2b45", height: "1px", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40771" data-name="div horizontal" />
                          <div style={{ alignContent: "stretch", display: "flex", alignItems: "center", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="159:40772">
                            <div style={{ background: "rgba(17,29,49,0.45)", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px", flexShrink: "0", width: "110px" }} data-node-id="159:40773">
                              <p style={{ wordBreak: "break-word", fontWeight: "600", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.65)", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:40774">
                                Duração
                              </p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", alignSelf: "stretch" }} data-node-id="159:40775">
                              <div style={{ background: "#1c2b45", height: "100%", position: "relative", flexShrink: "0", width: "1px" }} data-name="div vertical" />
                            </div>
                            <div style={{ background: "rgba(12,20,32,0.6)", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", alignItems: "flex-start", minWidth: "1px", paddingLeft: "10px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", position: "relative", borderRadius: "1px" }} data-node-id="159:40776">
                              <p style={{ wordBreak: "break-word", fontWeight: "500", lineHeight: "14px", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "12px", color: "rgba(214,228,245,0.8)", whiteSpace: "nowrap", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="159:40777">
                                Instantâneo
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "flex-start", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="166:42645">
                          <div style={{ borderWidth: "1px", borderColor: "#1c2b45", borderStyle: "solid", alignContent: "stretch", display: "flex", alignItems: "center", position: "relative", borderRadius: "1px", flexShrink: "0", width: "100%" }} data-node-id="166:42646">
                            <div style={{ background: "rgba(17,29,49,0.45)", alignContent: "stretch", display: "flex", flex: "1 0 0", flexDirection: "column", gap: "4px", alignItems: "flex-start", minWidth: "1px", padding: "10px", position: "relative", borderRadius: "1px" }} data-node-id="166:42647">
                              {/* AÇÃO e CONDIÇÃO são estilos DO TEXTO, não caixas
                                  por cima dele. No Figma as duas eram `position:
                                  absolute` em left/top fixos — funcionava só
                                  naquela quebra de linha, e cobria a frase (que
                                  por isso estava embaralhada por baixo: "Reistiir",
                                  "AtordioLdo"). Aqui são <span> na própria frase:
                                  acompanham a quebra, o tamanho e a seleção do
                                  texto. A marca é peso + cor + um pontilhado
                                  discreto — ciano para a ação, vermelho para a
                                  condição, as mesmas cores do Console. */}
                              <p style={{ wordBreak: "break-word", fontWeight: "500", lineHeight: "16px", minWidth: "100%", fontStyle: "normal", position: "relative", flexShrink: "0", fontSize: "14px", color: "rgba(214,228,245,0.65)", width: "min-content", fontFamily: "var(--font-rajdhani), sans-serif" }} data-node-id="166:42648">
                                Todos em um raio de 3 m fazem teste de{" "}
                                <span style={{ fontWeight: "600", color: "#00d4ff", textDecoration: "underline dotted", textUnderlineOffset: "2px", textDecorationColor: "rgba(0,212,255,0.45)" }} data-termo="acao">Resistir</span>{" "}
                                CD 8; em falha, ficam{" "}
                                <span style={{ fontWeight: "600", color: "#d15068", textDecoration: "underline dotted", textUnderlineOffset: "2px", textDecorationColor: "rgba(209,80,104,0.45)" }} data-termo="condicao">Atordoados</span>{" "}
                                até o fim do próximo turno deles.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ position: "absolute", background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderStyle: "solid", borderTopWidth: "1px", bottom: "0", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", left: "0", padding: "10px", borderRadius: "1px", width: "385px" }} data-node-id="159:40796">
                      <div style={{ alignContent: "stretch", display: "flex", alignItems: "center", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="161:42610">
                        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", alignSelf: "stretch" }} data-node-id="161:42611">
                          <div style={{ background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderBottomWidth: "1px", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", alignContent: "stretch", display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "10px", position: "relative", flexShrink: "0" }}>
                            <div style={{ position: "relative", flexShrink: "0", width: "12px", height: "12px" }} data-node-id="161:42612" data-name="minus">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgMinus} />
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(8,20,32,0.7)", borderColor: "#1c2b45", borderBottomWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", alignContent: "stretch", display: "flex", flex: "1 0 0", alignItems: "center", justifyContent: "center", minWidth: "1px", padding: "10px", position: "relative" }} data-node-id="161:42613">
                          <p style={{ wordBreak: "break-word", fontWeight: "700", lineHeight: "16px", position: "relative", flexShrink: "0", fontSize: "11px", color: "rgba(214,228,245,0.65)", textAlign: "center", width: "30px", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="161:42614">
                            1
                          </p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", alignSelf: "stretch" }} data-node-id="161:42615">
                          <div style={{ background: "rgba(17,29,49,0.45)", borderColor: "#1c2b45", borderBottomWidth: "1px", borderLeftWidth: "1px", borderStyle: "solid", borderTopWidth: "1px", alignContent: "stretch", display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "10px", position: "relative", flexShrink: "0" }}>
                            <div style={{ position: "relative", flexShrink: "0", width: "12px", height: "12px" }} data-node-id="161:42616" data-name="plus">
                              <img alt="" style={{ position: "absolute", display: "block", inset: "0", maxWidth: "none", width: "100%", height: "100%" }} src={imgPlus1} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ alignContent: "stretch", display: "flex", gap: "8px", alignItems: "center", position: "relative", flexShrink: "0", width: "100%" }} data-node-id="161:42557">
                        <div style={{ borderColor: "rgba(0,212,255,0.45)", borderWidth: "1px", borderStyle: "solid", alignContent: "stretch", display: "flex", gap: "10px", alignItems: "center", justifyContent: "center", overflow: "clip", paddingLeft: "17px", paddingRight: "17px", paddingTop: "13px", paddingBottom: "13px", position: "relative", borderRadius: "1px", flexShrink: "0", width: "230px", backgroundImage: "linear-gradient(94.89062837330503deg, rgba(0, 212, 255, 0.1) 0.13675%, rgba(0,212,255,0.10) 100.14%)"}} data-node-id="159:40797"  data-name="Button Primary">
                          <div style={{ position: "relative", flexShrink: "0" }} data-node-id="I159:40797;56:3954" data-name="Text">
                            <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", width: "100%", height: "100%" }}>
                              <p style={{ wordBreak: "break-word", fontWeight: "700", lineHeight: "16px", position: "relative", flexShrink: "0", fontSize: "11px", color: "rgba(214,228,245,0.88)", letterSpacing: "2.42px", textTransform: "uppercase", width: "100%", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="I159:40797;56:3955">
                                USAR
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(12,20,32,0.6)", borderWidth: "1px", borderColor: "rgba(0,212,255,0.42)", borderStyle: "solid", alignContent: "stretch", display: "flex", flex: "1 0 0", gap: "10px", alignItems: "center", justifyContent: "center", minWidth: "1px", overflow: "clip", paddingLeft: "17px", paddingRight: "17px", paddingTop: "13px", paddingBottom: "13px", position: "relative", borderRadius: "1px" }} data-node-id="161:42538" data-name="Button Primary">
                          <div style={{ position: "relative", flexShrink: "0" }} data-node-id="I161:42538;56:3954" data-name="Text">
                            <div style={{ backgroundClip: "padding-box", borderWidth: "0", borderColor: "transparent", borderStyle: "solid", alignContent: "stretch", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", width: "100%", height: "100%" }}>
                              <p style={{ wordBreak: "break-word", fontWeight: "700", lineHeight: "16px", position: "relative", flexShrink: "0", fontSize: "11px", color: "rgba(214,228,245,0.68)", letterSpacing: "2.42px", textTransform: "uppercase", width: "100%", fontFamily: "var(--font-mono), sans-serif" }} data-node-id="I161:42538;56:3955">
                                mover
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: "-1px", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "1px", alignItems: "center", left: "50%", overflow: "clip", width: "850px", transform: "translateX(-50%)" }} data-node-id="159:40798" data-name="Container decoration">
        <div style={{ height: "1px", opacity: ".89", position: "relative", flexShrink: "0", width: "100%", backgroundImage: "linear-gradient(to right, rgba(0,0,0,0), rgba(0,212,255,0.35) 50%, rgba(0,0,0,0))" }} data-node-id="I159:40798;62:718" data-name="Text" />
        <div style={{ height: "1px", position: "relative", flexShrink: "0", width: "348px", backgroundImage: "linear-gradient(to right, rgba(0,0,0,0), rgba(0,212,255,0.6) 50%, rgba(0,0,0,0))" }} data-node-id="I159:40798;62:719" data-name="Text" />
      </div>
      <div style={{ position: "absolute", alignContent: "stretch", display: "flex", flexDirection: "column", gap: "1px", alignItems: "center", left: "-1px", overflow: "clip", top: "43px", width: "850px" }} data-node-id="159:40799" data-name="Container decoration">
        <div style={{ height: "1px", position: "relative", flexShrink: "0", width: "348px", backgroundImage: "linear-gradient(to right, rgba(0,0,0,0), rgba(0,212,255,0.6) 50%, rgba(0,0,0,0))" }} data-node-id="I159:40799;62:721" data-name="Text" />
        <div style={{ height: "1px", opacity: ".89", position: "relative", flexShrink: "0", width: "100%", backgroundImage: "linear-gradient(to right, rgba(0,0,0,0), rgba(0,212,255,0.35) 50%, rgba(0,0,0,0))" }} data-node-id="I159:40799;62:722" data-name="Text" />
      </div>
      <div style={{ position: "absolute", inset: "0", pointerEvents: "none", borderRadius: "inherit", boxShadow: "inset 0px 0px 60px 1px rgba(0,212,255,0.08)" }} />
    </div>
  );
}