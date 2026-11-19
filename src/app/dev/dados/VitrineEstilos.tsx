"use client";

/**
 * VITRINE DE ESTILOS — os dados parados, lado a lado, um cartão por
 * variação visual em estudo (`_dados3d/estilosDado`).
 *
 * Clicar num cartão escolhe o estilo das ROLAGENS desta máquina (fica
 * em `localStorage`); o padrão, sem escolha, é o `ESTILO_PADRAO` (metal).
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { criarDadoDeVitrine } from "../../mesas/[campaignId]/vtt/_dados3d/ArenaDados";
import {
  ESTILO_PADRAO, ESTILOS_DADO, gravarEstiloDado, lerEstiloDado, montarCenarioEstilizado, type EstiloDado,
} from "../../mesas/[campaignId]/vtt/_dados3d/estilosDado";

const LADOS = [4, 6, 8, 10, 12, 20];
const CORES = [
  { nome: "Livre", hex: "#8878d6" },
  { nome: "Teste", hex: "#00d4ff" },
  { nome: "Dano", hex: "#ff5f74" },
  { nome: "Forja", hex: "#ff8a1f" },
];
const LARGURA = 640, ALTURA = 168, PX_POR_UNIDADE = 54;

function Cena({ estilo, accent, aceso }: { estilo: EstiloDado; accent: string; aceso: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let vivo = true;
    let raf = 0;
    let limpar = () => {};
    // O número é desenhado em canvas com a fonte do app: espera ela.
    void document.fonts.ready.then(() => {
      if (!vivo) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(LARGURA, ALTURA, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const metadeX = LARGURA / (2 * PX_POR_UNIDADE), metadeV = ALTURA / (2 * PX_POR_UNIDADE);
      const inclinacao = THREE.MathUtils.degToRad(15);
      const camera = new THREE.OrthographicCamera(-metadeX, metadeX, metadeV, -metadeV, 0.1, 200);
      camera.up.set(0, 0, -1);
      camera.position.set(0, 100 * Math.cos(inclinacao), 100 * Math.sin(inclinacao));
      camera.lookAt(0, 0, 0);

      // Mesma luz da arena, em cada caso.
      const cenario = estilo === "atual" ? null : montarCenarioEstilizado(renderer, scene, accent);
      cenario?.ajustar(metadeX, metadeV);
      if (!cenario) {
        scene.add(new THREE.AmbientLight(0xffffff, 0.32));
        const key = new THREE.DirectionalLight(accent, 4.2);
        key.position.set(-3, 9, -4);
        key.castShadow = true;
        key.shadow.camera.left = -metadeX; key.shadow.camera.right = metadeX;
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 0.8);
        rim.position.set(-4, 3, -2);
        scene.add(rim);
      }

      const chaoMat = new THREE.ShadowMaterial({ opacity: cenario ? 0.42 : 0.32 });
      const chaoGeo = new THREE.PlaneGeometry(metadeX * 2, metadeV * 4);
      const chao = new THREE.Mesh(chaoGeo, chaoMat);
      chao.rotation.x = -Math.PI / 2;
      chao.receiveShadow = true;
      scene.add(chao);

      const passo = (metadeX * 2) / LADOS.length;
      const dados = LADOS.map((lados, i) => {
        const dado = criarDadoDeVitrine(lados, accent, estilo);
        dado.group.position.x = -metadeX + passo * (i + 0.5);
        if (aceso) dado.destacar(dado.valor);
        scene.add(dado.group);
        return dado;
      });

      const inicio = performance.now();
      const giro = new THREE.Quaternion();
      const eixo = new THREE.Vector3(0, 1, 0);
      const quadro = (agora: number) => {
        // Gira devagar em torno do eixo vertical: é o que mostra o bisel
        // pegando luz, sem tirar a face de cima do lugar.
        giro.setFromAxisAngle(eixo, ((agora - inicio) / 1000) * 0.35);
        dados.forEach((d) => d.group.quaternion.copy(giro).multiply(d.pose));
        renderer.render(scene, camera);
        raf = requestAnimationFrame(quadro);
      };
      raf = requestAnimationFrame(quadro);

      limpar = () => {
        cancelAnimationFrame(raf);
        dados.forEach((d) => d.descartar());
        cenario?.descartar();
        chaoGeo.dispose(); chaoMat.dispose();
        renderer.dispose();
        if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      };
    });
    return () => { vivo = false; limpar(); };
  }, [estilo, accent, aceso]);
  return <div ref={ref} style={{ width: LARGURA, height: ALTURA, maxWidth: "100%" }} />;
}

export function VitrineEstilos() {
  const [escolhido, setEscolhido] = useState<EstiloDado>(ESTILO_PADRAO);
  const [accent, setAccent] = useState(CORES[0].hex);
  const [aceso, setAceso] = useState(false);
  useEffect(() => { setEscolhido(lerEstiloDado()); }, []);

  const mono = "var(--font-mono), monospace";
  const chip = (ativo: boolean): React.CSSProperties => ({
    cursor: "pointer", padding: "5px 10px", border: `1px solid ${ativo ? "#00d4ff" : "#18263f"}`,
    background: ativo ? "rgba(0,212,255,0.12)" : "transparent", color: ativo ? "#cfeff4" : "#7f95b3",
    font: `700 10px ${mono}`, letterSpacing: "0.14em", textTransform: "uppercase",
  });

  return (
    <section data-testid="vitrine-estilos" style={{ width: 1344, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ font: `700 11px ${mono}`, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4f6285", marginRight: 6 }}>
          Estilos em estudo
        </span>
        {CORES.map((c) => (
          <button key={c.hex} type="button" style={chip(accent === c.hex)} onClick={() => setAccent(c.hex)}>
            <span style={{ display: "inline-block", width: 8, height: 8, marginRight: 6, background: c.hex }} />{c.nome}
          </button>
        ))}
        <button type="button" style={chip(aceso)} onClick={() => setAceso((v) => !v)} aria-pressed={aceso}>
          Resultado aceso
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(640px, 1fr))", gap: 16 }}>
        {ESTILOS_DADO.map((e) => {
          const ativo = escolhido === e.id;
          return (
            <button
              key={e.id} type="button" data-testid={`vitrine-${e.id}`} aria-pressed={ativo}
              onClick={() => { gravarEstiloDado(e.id); setEscolhido(e.id); }}
              style={{
                cursor: "pointer", padding: 0, textAlign: "left", overflow: "hidden",
                border: `1px solid ${ativo ? "#00d4ff" : "#18263f"}`,
                background: "radial-gradient(circle at 50% 40%, #0d1a2c 0%, #070c16 75%)",
                boxShadow: ativo ? "0 0 0 1px rgba(0,212,255,0.35), 0 0 24px rgba(0,212,255,0.12)" : "none",
              }}
            >
              <span style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "10px 14px 0" }}>
                <b style={{ font: "800 14px var(--font-oxanium), sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: ativo ? "#00d4ff" : "#cfeff4" }}>{e.nome}</b>
                <span style={{ font: `400 10px ${mono}`, letterSpacing: "0.06em", color: "#7f95b3" }}>{e.resumo}</span>
                {e.id === ESTILO_PADRAO && <span style={{ font: `700 10px ${mono}`, letterSpacing: "0.14em", color: "#7f95b3" }}>PADRÃO</span>}
                {ativo && <span style={{ marginLeft: "auto", font: `700 10px ${mono}`, letterSpacing: "0.14em", color: "#00d4ff" }}>NAS ROLAGENS</span>}
              </span>
              <Cena estilo={e.id} accent={accent} aceso={aceso && e.id !== "atual"} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
