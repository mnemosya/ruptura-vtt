"use client";

/**
 * Prévia de `ficha/_console/panels/hud/MercadoHud.tsx` (opção Catálogo)
 * com o catálogo de exemplo do protótipo — o MESMO componente que o
 * Inventário do Console abre no botão Mercado.
 */

import { useState } from "react";
import { MercadoHud as Mercado, type ProdutoHud } from "../../../ficha/_console/panels/hud/MercadoHud";

type Raridade = "comum" | "incomum" | "raro";
type Cat = { id: string; nome: string; c: string; g: string };
const CATS: Cat[] = [
  { id: "acess", nome: "Acessórios", c: "#b8d8e8", g: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4v-6Zm13 0h3v6h-3v-6Z" },
  { id: "armas", nome: "Armas", c: "#e0455f", g: "M3 21 14 10m0 0 3-7 4 4-7 3Zm-9 7 3 3M6 15l3 3" },
  { id: "armad", nome: "Armaduras e escudos", c: "#f5a200", g: "M12 2 4 5v7c0 5 3.5 8 8 10 4.5-2 8-5 8-10V5l-8-3Z" },
  { id: "disp", nome: "Dispositivos tecnológicos", c: "#35c7d8", g: "M3 8h18v10H3V8Zm4-4h10M7 13h2m3 0h5" },
  { id: "drones", nome: "Drones e robôs", c: "#35c7d8", g: "M7 8h10v9H7V8Zm3-4h4v4h-4V4Zm-6 8h3m10 0h3M10 12h.01M14 12h.01M9 20h6" },
  { id: "escalpos", nome: "Escalpos", c: "#8b5cf6", g: "M9 3h6l-1 6h4l-6 12V13H8l1-10Zm-5 18h16" },
  { id: "explos", nome: "Explosivos", c: "#f07a1f", g: "M11 9a6 6 0 1 0 2 0V6h-2v3Zm5-5 2-2m-1 4h3M15 2v2" },
  { id: "farm", nome: "Farmácia", c: "#2f9e56", g: "M5 15 15 5a3.5 3.5 0 0 1 5 5L10 20a3.5 3.5 0 0 1-5-5Zm5-5 5 5" },
  { id: "ferr", nome: "Ferramentas e utilidades", c: "#35c7d8", g: "M14 5a5 5 0 0 0 5 6l-9 10-4-4 10-9a5 5 0 0 1-2-3Z" },
  { id: "mob", nome: "Mobilidade", c: "#c4a6ff", g: "M5 17a3 3 0 1 0 0-.01M19 17a3 3 0 1 0 0-.01M5 17l4-7h5l3 7m-5-7 2-4h3" },
  { id: "trajes", nome: "Trajes", c: "#e8c39e", g: "M8 3 4 6l2 5 2-1v11h8V10l2 1 2-5-4-3c-1 2-2 3-4 3S9 5 8 3Z" },
  { id: "vert", nome: "Vertinas", c: "#8b5cf6", g: "M12 1 19 12 12 23 5 12 12 1Zm0 6-3 5 3 5 3-5-3-5Z" },
];
type Item = {
  id: string; m: string; nome: string; preco: number; espacos: number; desc: string; raridade: Raridade;
  destaque?: [string, string, string]; props?: string[]; meta?: [string, string][]; municao?: number; cargas?: number; pa?: number;
  consumivel?: boolean; pilha?: boolean; estoque?: number; selo?: "novo" | "oferta"; sub?: string;
};
const mk = (m: string, id: string, nome: string, preco: number, espacos: number, desc: string, x: Partial<Item> = {}): Item =>
  ({ m, id, nome, preco, espacos, desc, raridade: "comum", ...x });
const CATALOGO: Item[] = [
  mk("acess", "fone", "Fone de malha", 220, 1, "Comunicação criptografada em até 2 km. Discreto, cabe na orelha.", { meta: [["Alcance", "2 km"], ["Ocultável", "Sim"]] }),
  mk("acess", "oculos", "Óculos térmicos", 640, 1, "Enxerga calor através de fumaça e escuridão.", { raridade: "incomum", props: ["Visão térmica"], meta: [["Duração", "8 h de bateria"]] }),
  mk("acess", "luvas", "Luvas aderentes", 300, 1, "Microventosas na palma. Escalar vira rotina.", { meta: [["Bônus", "+2 em Mobilidade (escalar)"]] }),
  mk("armas", "adaga", "Adaga", 120, 1, "Projetada para matar, com lâmina dupla e ponta reforçada que otimiza cortes e estocadas rápidas.", { destaque: ["Dano", "1d6", "cortante ou perfurante"], props: ["Sangramento"], meta: [["Alcance", "Adjacente"], ["Ocultável", "Sim"]], sub: "Armas corpo a corpo" }),
  mk("armas", "pistola", "Pistola 9mm", 680, 1, "Confiável, barata, barulhenta.", { destaque: ["Dano", "1d10", "perfurante"], municao: 12, pa: 1, props: ["Barulhento"], meta: [["Alcance", "18 m"], ["Ocultável", "Sim"]], sub: "Armas de fogo" }),
  mk("armas", "arco", "Arco curto", 260, 2, "Arco de fibra laminada. Silencioso e fácil de desmontar.", { destaque: ["Dano", "1d8", "perfurante"], municao: 20, pa: 2, props: ["Duas mãos", "Silencioso"], meta: [["Alcance", "24 m"]], sub: "Armas de arremesso e disparo" }),
  mk("armas", "flechas", "Flechas (10)", 40, 1, "Haste de carbono, ponta trilobada.", { consumivel: true, pilha: true, meta: [["Pilha", "20 por espaço"]], sub: "Armas de arremesso e disparo" }),
  mk("armas", "rifle", "Rifle de ferrolho", 2600, 3, "Antigo, preciso, impossível de esconder.", { raridade: "raro", destaque: ["Dano", "2d10", "perfurante"], municao: 5, pa: 3, props: ["Duas mãos", "Letal", "Barulhento"], meta: [["Alcance", "120 m"]], estoque: 1, sub: "Armas de fogo" }),
  mk("armas", "pulso", "Pistola de pulso", 1900, 1, "Descarga de plasma comprimido. Esquenta rápido.", { raridade: "incomum", destaque: ["Dano", "2d6", "energia"], cargas: 6, pa: 1, meta: [["Alcance", "15 m"]], sub: "Armas de energia" }),
  mk("armad", "colete", "Colete balístico", 900, 3, "Placas cerâmicas em aramida. Pesado, mas segura.", { raridade: "incomum", destaque: ["Defesa", "+3", "balístico"], props: ["Barulhento"], sub: "Armaduras" }),
  mk("armad", "capacete", "Capacete tático", 380, 1, "Visor rebatível, rádio embutido.", { destaque: ["Defesa", "+1", "cabeça"], sub: "Armaduras" }),
  mk("armad", "escudo", "Escudo compacto", 450, 2, "Retrátil, cabe no antebraço. Abre em meio segundo.", { destaque: ["Bloqueio", "+2", "reação"], pa: 1, props: ["Retrátil"], sub: "Escudos" }),
  mk("disp", "bloq", "Bloqueador de sinal", 1400, 2, "Bolha de silêncio eletromagnético. Câmeras piscam, drones caem.", { raridade: "raro", cargas: 3, pa: 2, props: ["Área", "Sustentado"], meta: [["Área", "Raio 6 m"], ["Duração", "3 rodadas"]] }),
  mk("disp", "scanner", "Scanner de malha", 520, 1, "Lê assinaturas de RPI num raio curto.", { cargas: 5, pa: 1, meta: [["Alcance", "10 m"]], selo: "novo" }),
  mk("disp", "clonador", "Clonador de crachá", 780, 1, "Copia credenciais por aproximação.", { raridade: "incomum", pa: 2, meta: [["Ocultável", "Sim"]] }),
  mk("drones", "mosca", "Drone mosca", 1200, 1, "Câmera do tamanho de um inseto. 20 minutos de voo.", { raridade: "incomum", cargas: 1, meta: [["Alcance", "300 m"], ["Autonomia", "20 min"]], sub: "Drones" }),
  mk("drones", "cao", "Unidade canina K-4", 4800, 3, "Quadrúpede de patrulha. Leal ao primeiro rosto que vê.", { raridade: "raro", destaque: ["PV", "18", "estrutura"], estoque: 1, sub: "Robôs" }),
  mk("escalpos", "reflexo", "Escalpo de reflexos", 3200, 1, "Implante cortical que encurta o tempo de reação.", { raridade: "raro", props: ["Permanente"], meta: [["Bônus", "+2 em Reflexos"], ["Custo", "1 Integridade"]], selo: "novo", sub: "Escalpos neurais" }),
  mk("escalpos", "idioma", "Escalpo linguístico", 1100, 1, "Tradução simultânea de 14 idiomas.", { raridade: "incomum", props: ["Permanente"], sub: "Escalpos auditivos" }),
  mk("escalpos", "olho", "Olho de rapina", 2400, 1, "Zoom óptico 12× e marcação de alvos.", { raridade: "raro", props: ["Permanente"], meta: [["Bônus", "+2 em Percepção"]], sub: "Escalpos ópticos" }),
  mk("escalpos", "braco", "Braço hidráulico", 3900, 1, "Pistões no antebraço. Aperto de prensa.", { raridade: "raro", props: ["Permanente"], meta: [["Bônus", "+2 em Força"]], sub: "Escalpos de braço" }),
  mk("escalpos", "tattoo", "Tatuagem luminescente", 260, 1, "Pele que acende no ritmo do pulso.", { props: ["Estético"], selo: "novo", sub: "Escalpos de moda" }),
  mk("escalpos", "perna", "Prótese de corrida", 2900, 1, "Lâmina de carbono com amortecimento ativo.", { raridade: "incomum", meta: [["Deslocamento", "+3 m"]], sub: "Próteses" }),
  mk("explos", "fumaca", "Granada de fumaça", 260, 1, "Nuvem densa por três rodadas.", { consumivel: true, pa: 1, meta: [["Área", "Raio 4 m"]] }),
  mk("explos", "frag", "Granada de fragmentação", 540, 1, "Simples e eficaz. Ninguém fica perto pra reclamar.", { consumivel: true, destaque: ["Dano", "3d6", "perfurante"], pa: 1, props: ["Área", "Letal"], meta: [["Área", "Raio 5 m"]] }),
  mk("explos", "c4", "Carga plástica", 900, 1, "Moldável, detonação remota.", { raridade: "incomum", consumivel: true, destaque: ["Dano", "5d6", "impacto"], props: ["Área", "Remoto"] }),
  mk("farm", "bandagem", "Bandagem", 35, 1, "Estanca sangramento. Não faz milagre.", { consumivel: true, pa: 1, selo: "oferta" }),
  mk("farm", "antidoto", "Antídoto", 80, 1, "Neutraliza toxinas comuns em até uma rodada.", { consumivel: true, pa: 1, meta: [["Efeito", "Remove Envenenado"]] }),
  mk("farm", "estim", "Estimulante", 190, 1, "Ignora a dor por uma cena. Cobra depois.", { consumivel: true, destaque: ["Cura", "1d8", "PV temporário"], pa: 1, props: ["Exaustão leve"] }),
  mk("ferr", "kit", "Kit de arrombamento", 200, 1, "Gazuas, tensores e chave de impacto.", { meta: [["Bônus", "+2 em Infiltração"]] }),
  mk("ferr", "corda", "Corda com gancho", 90, 2, "20 metros de fibra trançada.", { meta: [["Comprimento", "20 m"]] }),
  mk("ferr", "lanterna", "Lanterna tática", 60, 1, "Feixe focado com modo estroboscópico.", { selo: "oferta" }),
  mk("mob", "patins", "Patins magnéticos", 1500, 2, "Deslize sobre trilhos e superfícies metálicas.", { raridade: "incomum", meta: [["Deslocamento", "+6 m"]], sub: "Equipamentos de mobilidade" }),
  mk("mob", "moto", "Moto elétrica", 6200, 0, "Fica na garagem do abrigo. Silenciosa até 80 km/h.", { raridade: "raro", meta: [["Velocidade", "140 km/h"], ["Guarda", "Somente abrigo"]], estoque: 1, sub: "Veículos" }),
  mk("trajes", "manto", "Manto óptico", 2800, 2, "Tecido que copia o fundo. Imperfeito em movimento.", { raridade: "raro", props: ["Camuflagem"], meta: [["Bônus", "+3 em Furtividade (parado)"]] }),
  mk("trajes", "social", "Traje social", 420, 1, "Para entrar onde armas não entram.", { meta: [["Bônus", "+1 em Influência"]] }),
  mk("vert", "azulzinha", "Azulzinha", 340, 1, "Ampola de vertina refinada. Reacende o fluxo — e cobra depois.", { raridade: "incomum", consumivel: true, destaque: ["Restaura", "2d4", "pontos de fluxo"], pa: 1, props: ["Exaustão leve"] }),
  mk("vert", "rubra", "Rubra", 900, 1, "Vertina bruta. Potente, instável, ilegal em três distritos.", { raridade: "raro", consumivel: true, destaque: ["Restaura", "4d4", "pontos de fluxo"], props: ["Instável"], estoque: 3 }),
];

/* categoria do protótipo → categoria do conteúdo publicado (glifo e vertente) */
const CATEGORIA: Record<string, [string, string]> = {
  acess: ["ferramenta", "nenhuma"], armas: ["arma", "cinetica"], armad: ["armadura", "material"], disp: ["dispositivo", "sinaptica"],
  drones: ["dispositivo", "sinaptica"], escalpos: ["dispositivo", "cognitiva"], explos: ["explosivo", "energetica"], farm: ["farmacia", "biotica"],
  ferr: ["ferramenta", "sinaptica"], mob: ["veiculo", "nenhuma"], trajes: ["armadura", "nenhuma"], vert: ["vertina", "cognitiva"],
};
const PRODUTOS: ProdutoHud[] = CATALOGO.map((i) => ({
  slug: i.id, nome: i.nome, categoria: i.m, glifo: CATS.find((c) => c.id === i.m)!.g, categoriaRotulo: CATS.find((c) => c.id === i.m)!.nome, vertente: CATEGORIA[i.m][1],
  preco: i.preco, espacos: Math.max(i.espacos, 1), raridade: i.raridade, descricao: i.desc,
  destaque: i.destaque ? { rotulo: i.destaque[0], valor: i.destaque[1], sufixo: i.destaque[2] } : null,
  propriedades: i.props, linhas: i.meta?.map(([rotulo, valor]) => ({ rotulo, valor })), pa: i.pa ?? null, municao: i.municao ?? null, cargas: i.cargas ?? null,
}));

export function MercadoHud({ onFechar }: { onFechar?: () => void } = {}) {
  const [saldo, setSaldo] = useState(3000);
  const [usados, setUsados] = useState(6);
  return (
    <div className="hx" style={{ padding: 24 }}>
      <div style={{ height: 760, maxWidth: 1100, margin: "0 auto" }}>
        <Mercado produtos={PRODUTOS} saldo={saldo} usados={usados} capacidade={10} onFechar={onFechar}
          onComprar={(slug, n) => {
            const p = PRODUTOS.find((x) => x.slug === slug)!;
            setSaldo((v) => v - p.preco * n);
            setUsados((u) => u + p.espacos * n);
          }} />
      </div>
    </div>
  );
}
