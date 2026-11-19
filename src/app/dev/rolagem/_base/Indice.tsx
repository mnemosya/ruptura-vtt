/**
 * ÍNDICE — liga as três propostas e traz as fichas, a base comum, a
 * recomendação e o que fica em aberto. Página estática (sem estado).
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { oxanium } from "../../../_design/oxanium";
import { EIXOS, FICHAS } from "./fichas";

export function Indice() {
  return (
    <div className={`ri ${oxanium.variable}`}>
      <header className="ri-cab">
        <span className="ri-olho">Protótipos · rolagem com Sobrecarga</span>
        <h1>Dado Normal + Dado de Sobrecarga</h1>
        <p>
          Cinco propostas sobre a mesma base: a regra dos capítulos 13 e 18, a mesma física, a mesma bancada e o mesmo
          chat de mentira. A, B e C partem da janela Rolar Dados; D e E desenham a superfície do zero, sem janela.
          Nada aqui grava nem lê o banco.
        </p>
      </header>

      <section className="ri-cartoes" aria-label="Propostas">
        {FICHAS.map((f) => (
          <Link key={f.letra} href={f.rota} className="ri-cartao" data-letra={f.letra}>
            <span className="ri-cartao-topo">
              <b className="ri-letra">{f.letra}</b>
              <span className="ri-nome">{f.nome}</span>
              {f.rodada === 2 && <span className="ri-rodada">sem janela</span>}
              <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="ri-ideia">{f.ideia}</span>
            <span className="ri-rota">{f.rota}</span>
          </Link>
        ))}
      </section>

      <section className="ri-bloco" aria-labelledby="ri-comparacao">
        <h2 id="ri-comparacao">Comparação</h2>
        <div className="ri-tabela" role="table">
          <div className="ri-linha ri-linha--cab" role="row">
            <span role="columnheader" />
            {FICHAS.map((f) => <span key={f.letra} role="columnheader">{f.letra} · {f.nome}</span>)}
          </div>
          {EIXOS.map((e) => (
            <div key={e.chave} className="ri-linha" role="row">
              <span role="rowheader">{e.rotulo}</span>
              {FICHAS.map((f) => <span key={f.letra} role="cell">{f.eixos[e.chave]}</span>)}
            </div>
          ))}
          <div className="ri-linha" role="row">
            <span role="rowheader">Ponto fraco</span>
            {FICHAS.map((f) => <span key={f.letra} role="cell">{f.pontoFraco}</span>)}
          </div>
        </div>
      </section>

      <section className="ri-bloco ri-tres" aria-label="Referências e tempos">
        {FICHAS.map((f) => (
          <article key={f.letra} className="ri-detalhe">
            <h3>{f.letra} · {f.nome}</h3>
            <h4>Referências</h4>
            <ul>{f.referencias.map((r) => <li key={r}>{r}</li>)}</ul>
            <h4>Linha do tempo</h4>
            <ul>{f.linhaDoTempo.map((r) => <li key={r}>{r}</li>)}</ul>
          </article>
        ))}
      </section>

      <section className="ri-bloco" aria-labelledby="ri-base">
        <h2 id="ri-base">Base comum (igual nas três)</h2>
        <ul className="ri-lista">
          <li><b>Regra:</b> <code>_base/regra.ts</code>, só os capítulos 13 e 18: 1d10 + Atributo + Perícia + modificadores, as seis faixas, contestado, custo da troca nas três situações, Última Vontade e desfazer. Teste: <code>node --import tsx --test src/app/dev/rolagem/_base/regra.test.ts</code> (exemplo da Ilya incluso).</li>
          <li><b>Mesa 3D:</b> cópia da arena real com aparência por dado. A física é pré-simulada com as mesmas condições e o mesmo <code>parametrosDeLancamento</code>, e tocada em tempo real; o valor continua vindo da face de cima. No modo forçado, o número pedido é escrito na face que vai ficar pra cima antes do lançamento.</li>
          <li><b>Tempo:</b> um freio de assentamento corta a cauda em que o d10 (quase esférico) rolava devagar. O resultado fica legível em ~1,5–2,4 s, contra ~3,2–4,6 s na arena atual, e a justiça das faces se mantém (χ² 5,4 e 12,7 em dois lotes de 3.000 lances; limite 16,9). A queda roda a 60 fps, com menos de 1 ms de CPU por quadro.</li>
          <li><b>Janela:</b> a pele F real, com o <code>RollButton</code> e a <code>JanelaFerramenta</code> reais. Duas peças novas: o modo contestado (“VS” no lugar da CD e “Iniciou”) e o rodapé fixo do botão de rolar, porque a janela tem teto de 660 px.</li>
          <li><b>Bancada:</b> personagem (magista ou não, nome longo), Sobrecarga, limite, Integridade, Rupturas sofridas, “já houve substituição nesta ação”, valores forçados, cenários prontos, “ver como” quem rola ou quem observa, e medidas de cada lance.</li>
        </ul>
      </section>

      <section className="ri-bloco" aria-labelledby="ri-rec">
        <h2 id="ri-rec">Recomendação</h2>
        <p className="ri-texto">
          <b>Segunda rodada: D (Régua), com o selo da E.</b> A régua mostra a chance antes do lance e a margem como
          distância, faz da troca um gesto que se entende sem ler (a luz anda até a casa do Sobrecarga) e tem altura
          fixa, sem crescer com o resultado. Da E vem o selo do preço, que diz o que se perde. A E é o momento mais
          forte, mas disputa o centro do palco com os dados.
        </p>
        <p className="ri-texto" style={{ marginTop: 12 }}>
          <b>Primeira rodada: A (Reserva), com duas peças da B.</b> A decisão fica onde o olho de quem rolou já está, a um clique, com o
          preço escrito no botão; não depende do chat aberto e serve igual no Console. Da B: a luz do Dado de Sobrecarga
          segue o preço (a brasa esquenta de âmbar para magenta e vermelho conforme o limite se aproxima), para a mesa
          inteira ler o risco no próprio dado; e a perda de Integridade acima do limite cai na mesa como d4, em duas fases.
          O custo da A é a decisão sobre a paleta: as faixas limitadas saem do âmbar.
        </p>
      </section>
    </div>
  );
}
