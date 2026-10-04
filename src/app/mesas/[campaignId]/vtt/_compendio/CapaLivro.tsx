import Image from "next/image";
import { MarcaRuptura } from "../../../../_design/Marca";
import cidadeVosek from "../../../../../../content/v12/capas/sylvain-sarrailh-g2-esports.jpg";

/** Abertura editorial local: os capítulos continuam vindo do Notion. */
export function CapaLivro({
  retomar,
  onRetomar,
}: {
  retomar: { titulo: string; ultimoLido: boolean } | null;
  onRetomar: () => void;
}) {
  return (
    <article className="fj-capa" data-testid="compendio-capa">
      <header className="fj-capa__cidade">
        <Image src={cidadeVosek} alt="Vista panorâmica de Vosek" fill sizes="(min-width: 1280px) 1028px, (min-width: 768px) calc(100vw - 320px), 100vw" className="fj-capa__imagem" priority />
        <div className="fj-capa__sombra" aria-hidden="true" />
        <div className="fj-capa__marca">
          <span className="fj-mono fj-mono--cy fj-capa__frase">A ORDEM É UMA FACHADA.</span>
          <MarcaRuptura className="fj-capa__logo" />
        </div>
        <div className="fj-capa__passarela" aria-hidden="true" />
        <div className="fj-capa__cidade-nome">
          <strong>VOSEK</strong>
          <span>CAPITAL DO IMPÉRIO CENTRAL</span>
        </div>
        <div className="fj-capa__subsolo"><span>ACIMA, O CONTROLE.</span><span>ABAIXO, A FAGULHA.</span></div>
      </header>

      <div className="fj-capa__leitura">
        {retomar && (
          <button type="button" className="fj-capa__retomar" onClick={onRetomar} data-testid="compendio-retomar">
            <span>{retomar.ultimoLido ? "Retomar leitura" : "Começar a ler"}<small>{retomar.titulo}</small></span>
            <span aria-hidden="true">↗</span>
          </button>
        )}
        <div className="fj-capa__secao"><span>00</span><span>INTRODUÇÃO</span><i aria-hidden="true" /></div>
        <h2>Neste mundo,<br />o arcano <em>não é lenda.</em></h2>
        <div className="fj-capa__texto">
          <p>Há milênios ele molda a vida em Braxus. Derrubou cidades, alimentou máquinas, acendeu guerras e ergueu impérios. O maior deles, o Império Central, nasceu quando o poder dos magistas saiu do controle e o planeta quase rachou. Durante séculos, esse regime manteve as Casas-Vertente sob uma única bandeira, centralizando o controle do arcano na ponta de uma só lança. Só que nada dura para sempre, e o que parecia inquebrável começa a se desfazer no silêncio das disputas internas.</p>
          <p>Foi o sumiço do Imperador Aretzal que abriu espaço pra essa desordem. Seu nome, um dia, já foi suficiente pra calar qualquer confronto. Hoje, as Casas-Vertente expandem seus próprios domínios sem pensar no todo, enquanto blocos corporativos crescem de dentro delas, transvertendo controle por lucro. A promessa de estabilidade ainda ecoa nos corredores do poder, mas soa vazia. O brasão imperial ainda tremula, só que ao lado das logos que de fato sustentam distritos, fábricas e sistemas inteiros.</p>
          <p>No submundo e nas zonas periféricas, refratários se aproveitam das frestas abertas por essa disputa pra desafiar o protocolo, seja por sobrevivência, seja por ambição. Vosek, a capital, é a vitrine dessa transição. Erguida pra ser o coração do controle, opera sobre uma malha de sensores, catracas, drones e vigilância constante. Mas por baixo das megatorres e avenidas monitoradas de Vosek, circulam rumores e barganhas. Alianças feitas à base da desconfiança que ligam refratários, gangues e corporações em operações que nunca aparecem nos registros oficiais. Cada empreitada sutil, cada quebra no protocolo, vai esburacando o que ainda resta da fachada do controle imperial.</p>
          <p>O Império Central já não governa por convicção, mas por inércia. É nesse espaço de dúvida que você existe. Você é um magista refratário. Um erro fora dos planos do Império. Uma fagulha que não deveria existir. E agora a escolha está diante de você: se esconda, se venda ou incendeie o que ainda resta da ordem Imperial.</p>
          <p>Este livro te dá a munição, o terreno e as escolhas. O que vai restar, e quem você vai ser quando tudo desabar, depende de quais marcas você decidir cravar.</p>
        </div>
        <div className="fj-capa__fecho">UMA FAGULHA QUE NÃO DEVERIA EXISTIR.<span aria-hidden="true">///</span></div>
      </div>
    </article>
  );
}
