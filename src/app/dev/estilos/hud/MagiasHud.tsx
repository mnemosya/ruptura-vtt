"use client";

/**
 * Prévia de `ficha/_console/panels/hud/MagiasHud.tsx` com os dados de
 * exemplo do protótipo — o MESMO componente que a aba Magias do
 * Console usa, numa moldura do tamanho do Console (860 × 760).
 */

import { useState, type ReactNode } from "react";
import { MagiasHud as Magias, type MagiaHud } from "../../../ficha/_console/panels/hud/MagiasHud";

const rico = (t: string): ReactNode => t.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i} style={{ color: "#cfeff4" }}>{p}</b> : p));
const m = (slug: string, nome: string, vertente: string, nivel: number, tipo: string, mana: number | null, pa: number, alcance: string, duracao: string, descricao: string, efeito: string, x: Partial<MagiaHud> = {}): MagiaHud =>
  ({ slug, nome, vertente, nivel, tipo, mana, pa, alcance, duracao, descricao, efeito: rico(efeito), bloqueada: false, ...x });

const MAGIAS: MagiaHud[] = [
  m("sentidos", "Aguçar sentidos", "biotica", 1, "suporte", null, 2, "Toque", "1 minuto", "Você regula temporariamente a sensibilidade dos órgãos sensoriais do alvo, ampliando sua capacidade de perceber sons, cheiros, luzes ou movimentos sutis.", "O alvo recebe **+1 de vantagem** em testes de **Percepção** enquanto a magia durar."),
  m("socorros", "Primeiros socorros", "biotica", 1, "suporte", 2, 2, "Toque", "Instantânea", "Você acelera a coagulação e fecha tecidos superficiais.", "Estabiliza um alvo **morrendo** e cura **1d6** PV.", { cura: "1d6", preRequisito: "Medicina 2" }),
  m("adrenalina", "Adrenalina", "biotica", 2, "suporte", 3, 1, "Pessoal", "3 turnos", "Uma descarga glandular controlada empurra o corpo além do limite.", "Ganha **+1 PA** por turno; ao fim, sofre **1 nível de exaustão**."),
  m("pele", "Pele rígida", "biotica", 2, "suporte", 3, 2, "Toque", "10 minutos", "Queratina se compacta sob a pele formando placas finas.", "O alvo recebe **+1 MIT Físico** em todas as regiões."),
  m("empurrao", "Empurrão", "cinetica", 1, "controle", 1, 1, "6 m", "Instantânea", "Uma onda de força bruta parte da palma da sua mão.", "Empurra o alvo **3 m**. Se colidir, sofre **1d6** de impacto.", { dano: "1d6" }),
  m("telecinese", "Telecinese", "cinetica", 2, "controle", 2, 2, "Variável", "Concentração", "Você agarra um corpo com força invisível, deslocando-o pelo espaço sem contato físico.", "Ao conjurar, escolha qualquer nível entre 1 e seu nível atual em Cinética.", {
    efeitoDepois: rico("Escolha uma criatura ou objeto dentro do alcance cuja massa não ultrapasse a **carga máxima**."),
    escolha: { tipo: "nivel", colunas: ["Carga máxima", "Alcance", "Deslocamento"], linhas: [
      { nivel: 1, celulas: ["50 kg", "10 metros", "5 metros"], mana: 2, bloqueada: false },
      { nivel: 2, celulas: ["250 kg", "15 metros", "10 metros"], mana: 4, bloqueada: false },
      { nivel: 3, celulas: ["1 tonelada", "20 metros", "15 metros"], mana: 6, bloqueada: true },
      { nivel: 4, celulas: ["5 toneladas", "35 metros", "20 metros"], mana: 8, bloqueada: true },
      { nivel: 5, celulas: ["20 toneladas", "40 metros", "25 metros"], mana: 10, bloqueada: true },
    ] },
  }),
  m("esferas", "Esferas de impacto", "cinetica", 2, "ataque", 3, 2, "20 m", "Instantânea", "Você condensa o ar em esferas densas.", "Gaste de **3 a 6** de mana; cada ponto acima de 3 cria uma esfera a mais.", { escolha: { tipo: "valor", min: 3, max: 6 } }),
  m("salto", "Salto vetorial", "cinetica", 2, "movimento", 2, 1, "Pessoal", "Instantânea", "Você redireciona o próprio momento num único impulso.", "Salta até **9 m** em qualquer direção sem teste."),
  m("choque", "Arco voltaico", "energetica", 1, "ataque", 2, 2, "12 m", "Instantânea", "Um arco elétrico salta entre seus dedos até o alvo.", "Causa **2d6 energético**; salta para um segundo alvo a 3 m.", { dano: "2d6", preRequisito: "Eletrônica 2" }),
  m("sobrecarga", "Sobrecarga de rede", "energetica", 3, "controle", 5, 2, "18 m", "1 minuto", "Você satura um dispositivo com pulso eletromagnético.", "Desativa **drones e implantes** num raio de 4 m.", { bloqueada: false }),
  m("molde", "Moldar metal", "material", 2, "controle", 3, 2, "Toque", "Concentração", "A estrutura cristalina cede sob seu toque.", "Dobra, abre ou sela até **1 m²** de metal."),
  m("barreira", "Barreira de entulho", "material", 4, "suporte", 4, 2, "9 m", "1 minuto", "Destroços próximos se erguem e travam no lugar.", "Cria **cobertura total** de 3 m de largura.", { bloqueada: true }),
  m("eco", "Eco neural", "sinaptica", 2, "controle", 3, 2, "12 m", "2 turnos", "Você repete no alvo o último impulso que ele sentiu.", "O alvo perde **1 PA** no próximo turno.", { resistencia: "Vontade · CD 8" }),
];
const NIVEIS = { cinetica: 2, energetica: 3, material: 3, biotica: 2, sinaptica: 2, cognitiva: 0 };

export function MagiasHud() {
  const [mana, setMana] = useState(9);
  const custo = (slug: string) => MAGIAS.find((x) => x.slug === slug)?.mana ?? 0;
  return (
    <div className="hx hx-hexgrid" style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
      <div className="hx-console">
        <div className="hx-console-cab"><span className="hx-tag" style={{ color: "#cfeff4", opacity: .5 }}>id://magias</span><span className="hx-tag" style={{ color: "rgba(0,212,255,.4)" }}>mod.arc // 07</span></div>
        <div className="hx-console-corpo">
          <Magias magias={MAGIAS} niveis={NIVEIS} primaria="energetica" mana={{ atual: mana, max: 12 }}
            onConjurar={(s, c) => setMana((v) => Math.max(0, v - (c ?? custo(s))))}
            onSurtoDeEnergia={() => setMana((v) => v + 5)}
            onRolarDano={() => {}}
            onRolarCura={() => {}} />
        </div>
      </div>
    </div>
  );
}
