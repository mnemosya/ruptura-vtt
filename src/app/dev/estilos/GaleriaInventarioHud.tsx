"use client";

/**
 * Prévia do inventário HUD (`ficha/_console/panels/inventario/InventarioHud.tsx`)
 * com os itens de exemplo do protótipo e estado LOCAL — usar, mover,
 * somar e descartar funcionam aqui sem tocar em ficha nenhuma.
 */

import { useState } from "react";
import { MercadoHud } from "./hud/MercadoHud";
import { InventarioHud, type DestinoHud, type ItemHud, type LocalHud } from "../../ficha/_console/panels/inventario/InventarioHud";

const SEMENTE: ItemHud[] = [
  { id: "adaga", nome: "Adaga", categoria: "arma", categoriaRotulo: "Arma", vertente: "cinetica", raridade: "comum",
    quantidade: 1, local: "mochila", espacosPorItem: 1, ocupa: 1, preco: 120, usavel: false,
    descricao: "Projetada para matar, com lâmina dupla e ponta reforçada que otimiza cortes e estocadas rápidas.",
    destaque: { rotulo: "Dano", valor: "1d6", sufixo: "cortante ou perfurante" }, propriedades: ["Sangramento"],
    linhas: [{ rotulo: "Alcance", valor: "Adjacente" }, { rotulo: "Ocultável", valor: "Sim" }] },
  { id: "arco", nome: "Arco curto", categoria: "arma", categoriaRotulo: "Arma", vertente: "cinetica", raridade: "comum",
    quantidade: 1, local: "mochila", espacosPorItem: 2, ocupa: 2, preco: 260, usavel: false, municao: [14, 20], pa: 2,
    descricao: "Arco de fibra laminada. Silencioso, leve e fácil de desmontar entre missões.",
    destaque: { rotulo: "Dano", valor: "1d8", sufixo: "perfurante" }, propriedades: ["Duas mãos", "Silencioso"],
    linhas: [{ rotulo: "Alcance", valor: "24 m" }, { rotulo: "Recarga", valor: "1 PA" }] },
  { id: "flechas", nome: "Flechas", categoria: "municao", categoriaRotulo: "Munição", vertente: "nenhuma", raridade: "comum",
    quantidade: 14, local: "mochila", espacosPorItem: 1, ocupa: 1, preco: 4, usavel: false,
    descricao: "Haste de carbono, ponta trilobada. Recuperáveis em metade dos casos.",
    linhas: [{ rotulo: "Compatível", valor: "Arco curto" }, { rotulo: "Pilha", valor: "20 por espaço" }] },
  { id: "antidoto", nome: "Antídoto", categoria: "farmacia", categoriaRotulo: "Farmácia", vertente: "biotica", raridade: "comum",
    quantidade: 2, local: "mochila", espacosPorItem: 1, ocupa: 2, preco: 80, usavel: true, pa: 1,
    descricao: "Neutraliza toxinas comuns em até uma rodada. Gosto metálico persistente.",
    linhas: [{ rotulo: "Efeito", valor: "Remove Envenenado" }, { rotulo: "Aplicação", valor: "Si ou adjacente" }] },
  { id: "azulzinha", nome: "Azulzinha", categoria: "vertina", categoriaRotulo: "Vertina", vertente: "cognitiva", raridade: "incomum",
    quantidade: 1, local: "mochila", espacosPorItem: 1, ocupa: 1, preco: 340, usavel: true, pa: 1, cargas: [1, 1],
    descricao: "Ampola de vertina refinada. Reacende o fluxo por alguns instantes — e cobra depois.",
    destaque: { rotulo: "Restaura", valor: "2d4", sufixo: "pontos de fluxo" }, propriedades: ["Exaustão leve"] },
  { id: "bloq", nome: "Bloqueador de sinal", categoria: "dispositivo", categoriaRotulo: "Dispositivo", vertente: "sinaptica", raridade: "raro",
    quantidade: 1, local: "mochila", espacosPorItem: 2, ocupa: 2, preco: 1400, usavel: true, pa: 2, cargas: [2, 3],
    descricao: "Cria uma bolha de silêncio eletromagnético. Câmeras piscam, rádios morrem, drones caem.",
    propriedades: ["Área", "Sustentado"],
    linhas: [{ rotulo: "Área", valor: "Raio 6 m" }, { rotulo: "Duração", valor: "3 rodadas" }, { rotulo: "Recarga", valor: "Descanso longo" }] },
  { id: "colete", nome: "Colete balístico", categoria: "armadura", categoriaRotulo: "Armadura", vertente: "material", raridade: "incomum",
    quantidade: 1, local: "equipado", espacosPorItem: 3, ocupa: 3, preco: 900, usavel: false,
    descricao: "Placas cerâmicas em tecido de aramida. Pesado, mas segura o que precisa segurar.",
    destaque: { rotulo: "Defesa", valor: "+3", sufixo: "contra balístico" }, propriedades: ["Barulhento"] },
  { id: "kit", nome: "Kit de arrombamento", categoria: "ferramenta", categoriaRotulo: "Ferramenta", vertente: "sinaptica", raridade: "comum",
    quantidade: 1, local: "equipado", localRotulo: "Acesso rápido", espacosPorItem: 1, ocupa: 1, preco: 200, usavel: false,
    descricao: "Gazuas, tensores e uma chave de impacto improvisada.", linhas: [{ rotulo: "Bônus", valor: "+2 em Infiltração" }] },
  { id: "escudo", nome: "Escudo compacto", categoria: "escudo", categoriaRotulo: "Escudo", vertente: "material", raridade: "comum",
    quantidade: 1, local: "abrigo", espacosPorItem: 2, ocupa: 2, preco: 450, usavel: false, pa: 1,
    descricao: "Retrátil, cabe no antebraço. Abre em meio segundo.", destaque: { rotulo: "Bloqueio", valor: "+2", sufixo: "reação" } },
  { id: "racao", nome: "Ração selada", categoria: "farmacia", categoriaRotulo: "Farmácia", vertente: "biotica", raridade: "comum",
    quantidade: 6, local: "abrigo", espacosPorItem: 1, ocupa: 6, preco: 15, usavel: true,
    descricao: "Sete dias de validade depois de aberta. Ninguém abre por gosto." },
];

const LOCAIS: { id: LocalHud; rotulo: string }[] = [
  { id: "mochila", rotulo: "Mochila" }, { id: "equipado", rotulo: "Equipado" }, { id: "abrigo", rotulo: "Abrigo" },
];

export function InventarioHudGaleria() {
  const [itens, setItens] = useState(SEMENTE);
  const [mercado, setMercado] = useState(false);
  const capacidade = 10;
  const ocupados = itens.filter((i) => i.local === "mochila").reduce((a, i) => a + i.ocupa, 0);

  const ajustar = (id: string, delta: number) => setItens((xs) => xs.map((x) => {
    if (x.id !== id) return x;
    const quantidade = Math.max(1, x.quantidade + delta);
    const ocupa = x.categoria === "municao" ? x.espacosPorItem * Math.ceil(quantidade / 20) : x.espacosPorItem * quantidade;
    return { ...x, quantidade, ocupa };
  }));
  const remover = (id: string) => setItens((xs) => xs.filter((x) => x.id !== id));

  return (
    <div style={{ position: "relative", height: 720, border: "1px solid #12303a" }}>
      {mercado && (
        <MercadoHud onFechar={() => setMercado(false)} />
      )}
      <InventarioHud
        itens={itens}
        capacidade={capacidade}
        aretz={3000}
        destinosDe={(it): DestinoHud[] => LOCAIS.map((l) => ({
          id: l.id, rotulo: l.rotulo,
          motivo: it.local === l.id ? "O item já está aqui."
            : l.id === "mochila" && ocupados + it.ocupa > capacidade ? "Sem espaço na mochila." : null,
        }))}
        onUsar={(id) => { const it = itens.find((x) => x.id === id); if (it && it.quantidade > 1) ajustar(id, -1); else remover(id); }}
        onAjustar={ajustar}
        onMover={(id, destino) => setItens((xs) => xs.map((x) => x.id === id ? { ...x, local: destino as LocalHud, localRotulo: undefined } : x))}
        onDescartar={remover}
        onAbrirMercado={() => setMercado(true)}
        rodape={<button type="button" onClick={() => setItens(SEMENTE)} style={{ background: "none", border: 0, color: "#ff8a1fb3", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", cursor: "pointer" }}>[prévia] restaurar itens</button>}
      />
    </div>
  );
}
