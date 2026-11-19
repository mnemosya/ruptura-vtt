"use client";

/**
 * ARENA DE DOIS DADOS — cópia alterada de `_dados3d/ArenaDados.tsx`.
 *
 * O que muda em relação à arena real (e o porte precisaria levar):
 *
 *  1. APARÊNCIA POR DADO. A real pinta o punhado inteiro com um acento;
 *     aqui cada dado traz a sua (`Aparencia`, em `materiais.ts`): corpo,
 *     tinta, luz própria e física.
 *
 *  2. FÍSICA PRÉ-SIMULADA E TOCADA. A real integra a física quadro a
 *     quadro. Aqui o lançamento é simulado inteiro antes do primeiro
 *     quadro (passo fixo de 1/120 s, as MESMAS condições iniciais e os
 *     MESMOS parâmetros de `parametrosDeLancamento`) e a gravação é
 *     tocada em tempo real. Ganhos:
 *       · o valor continua lido da face que fica pra cima — mas já se
 *         sabe QUANDO cada dado assenta, e o Normal avisa antes do
 *         Sobrecarga (a janela mostra o veredito sem esperar o segundo);
 *       · o modo forçado da bancada escreve o número pedido na face que
 *         VAI ficar pra cima, antes do lançamento (nada troca depois);
 *       · a mesma gravação serviria para mostrar a rolagem a quem
 *         observa (a exibição remota que ainda não existe);
 *       · movimento reduzido: pula direto para a pose final.
 *
 *  3. EFEITOS DEPOIS DE ASSENTAR. Cada dado tem um estado visual
 *     (`neutro`, `usado`, `reserva`, `apagado`) que a proposta muda pela
 *     `controleRef` — é como a mesa reage à troca enquanto os dados
 *     ainda estão nela.
 *
 *  4. RENDERER REAPROVEITADO. A real cria um `WebGLRenderer` (e o
 *     ambiente PMREM) a cada rolagem; aqui é um só, em cache.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { buildDieModel } from "../../../mesas/[campaignId]/vtt/_dados3d/ArenaDados";
import { parametrosDeLancamento } from "../../../mesas/[campaignId]/vtt/_dados3d/lancamento";
import { criarAura, criarHalo, criarVisualDado, montarCenario, type Aparencia, type Aura, type Halo, type VisualDado } from "./materiais";

const TRIS_PER_FACE: Record<number, number> = { 4: 1, 6: 2, 8: 1, 10: 2, 100: 2, 12: 3, 20: 1 };
const CIRCUNRAIO_ALVO = 0.88;
const PASSO = 1 / 120;
const MAX_PASSOS = Math.round(7 / PASSO);
/** 0,3 s sem se mexer = parado de vez (o fim da gravação). */
const PASSOS_ESTAVEL = 36;
/**
 * "Assentou" para quem olha: a face de cima já não muda até o fim E o
 * dado está calmo (deslizando/balançando pouco) por 0,1 s. A arena real
 * esperava o repouso TOTAL de todos os dados (≈ 1,5 s a mais de
 * balanço que o olho não lê). Aqui o resultado sai quando está
 * decidido — a gravação continua tocando até o fim, sem pressa.
 */
const VEL_CALMA = 2.25;
const GIRO_CALMO = 4;
const PASSOS_CALMO = 15;
const PASSOS_LEITURA = 6;

export type DadoArena = {
  id: string;
  lados: number;
  aparencia: Aparencia;
  /** Valor pedido pela bancada (modo forçado). `null`/ausente: o que a física der. */
  forcado?: number | null;
};

export type Pose = { p: [number, number, number]; q: [number, number, number, number] };

export type ResultadoDado = {
  id: string;
  lados: number;
  valor: number;
  pose: Pose;
  /** Número escrito em cada face (índice → valor) — para reencenar a mesma peça. */
  rotulos: number[];
  /** Ms entre a saída da mão e o assentar. */
  assentouMs: number;
};

export type EstadoDado = "rolando" | "neutro" | "usado" | "reserva" | "apagado";

export interface ControleArena {
  marcar: (id: string, estado: EstadoDado) => void;
}

export interface MedidaArena {
  /** Tempo gasto simulando antes do primeiro quadro. */
  preSimMs: number;
  /** Quadros desenhados durante a queda. */
  quadros: number;
  fpsMedio: number;
  /** Pior quadro da queda, em fps (1000 / maior intervalo). */
  fpsMinimo: number;
  /** Quanto durou a queda inteira (até o último dado assentar). */
  quedaMs: number;
  /** Custo de CPU de um quadro (tocar a gravação + desenhar): média e pior, em ms. */
  custoMedioMs: number;
  custoPiorMs: number;
  /** A aba não pintou quadros (painel oculto): o relógio de reserva tocou a queda. */
  semPintura: boolean;
}

export type Projecao = { id: string; x: number; y: number };

/* ---- renderer compartilhado --------------------------------------- */

let rendererCompartilhado: THREE.WebGLRenderer | null = null;
function obterRenderer(): THREE.WebGLRenderer {
  if (rendererCompartilhado && !rendererCompartilhado.getContext().isContextLost()) return rendererCompartilhado;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setClearColor(0x000000, 0);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  Object.assign(r.domElement.style, { display: "block", width: "100%", height: "100%" });
  rendererCompartilhado = r;
  return r;
}

/* ---- utilidades ---------------------------------------------------- */

function aleatorio() {
  const v = new Uint32Array(1);
  crypto.getRandomValues(v);
  return v[0] / 0x100000000;
}
const entre = (min: number, max: number) => min + (max - min) * aleatorio();

type Modelo = ReturnType<typeof buildDieModel>;

/** Índice da face lida: a de cima; no d4, a do chão. */
function faceLida(modelo: Modelo, q: CANNON.Quaternion | THREE.Quaternion, lados: number): number {
  const rot = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  const sinal = lados === 4 ? -1 : 1;
  let melhor = 0;
  let maior = -Infinity;
  modelo.faces.forEach((f, i) => {
    const y = sinal * f.normal.clone().applyQuaternion(rot).y;
    if (y > maior) { maior = y; melhor = i; }
  });
  return melhor;
}

/** Brilho durante o voo: sai da mão carregado (pela força) e esfria até o repouso. */
function luzEmVoo(ap: Aparencia, forca: number, t: number) {
  if (!ap.luz) return 0;
  const pico = ap.luz.lancamento * (0.4 + 0.6 * forca);
  return ap.luz.repouso + (pico - ap.luz.repouso) * Math.exp(-t / 0.7);
}

/* ---- simulação ------------------------------------------------------ */

type Geometria = { halfX: number; halfZ: number; folga: number; escala: number };

type Gravacao = {
  quadros: Float32Array[];
  fim: number;
  assenta: number[];
  rotulos: number[][];
  valores: number[];
};

/**
 * FREIO DE ASSENTAMENTO. O d10 da arena é quase esférico (todas as
 * pontas na mesma esfera, ver `createD10`) e, com o amortecimento de
 * sempre, rola devagar pela mesa por 2–3 s depois do último quique —
 * a queda inteira passava de 4 s. Quando o dado já está baixo e lento,
 * o amortecimento sobe; o voo, os quiques e a força ficam iguais.
 */
export type Freio = {
  altura: number;
  /** Estágio 1: já baixo e abaixo desta velocidade² — o rolar longo perde fôlego. */
  vel2: number; linear: number; angular: number;
  /** Estágio 2: quase parando — a quina "pega" na mesa, como num dado de arestas vivas. */
  vel2Fim: number; linearFim: number; angularFim: number;
} | null;
export const FREIO_PADRAO: Freio = { altura: 1.6, vel2: 25, linear: 0.85, angular: 0.93, vel2Fim: 4, linearFim: 0.93, angularFim: 0.98 };

function simular(geo: Geometria, dados: DadoArena[], modelos: Modelo[], forca: number, freio: Freio = FREIO_PADRAO): Gravacao {
  const lanc = parametrosDeLancamento(forca);
  const { halfX, halfZ, folga, escala } = geo;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12.5, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  const solver = new CANNON.GSSolver();
  solver.iterations = 16;
  world.solver = solver;

  const mesa = new CANNON.Material("mesa");
  const mats = dados.map((_, i) => new CANNON.Material(`dado-${i}`));
  dados.forEach((d, i) => {
    world.addContactMaterial(new CANNON.ContactMaterial(mats[i], mesa, {
      friction: 0.52, restitution: 0.28 + (d.aparencia.fisica?.quique ?? 0),
    }));
    for (let j = i; j < dados.length; j++) {
      const q = ((d.aparencia.fisica?.quique ?? 0) + (dados[j].aparencia.fisica?.quique ?? 0)) / 2;
      world.addContactMaterial(new CANNON.ContactMaterial(mats[i], mats[j], { friction: 0.38, restitution: 0.34 + q }));
    }
  });

  const chao = new CANNON.Body({ mass: 0, material: mesa });
  chao.addShape(new CANNON.Plane());
  chao.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(chao);
  const parede = (x: number, z: number, normal: CANNON.Vec3) => {
    const b = new CANNON.Body({ mass: 0, material: mesa });
    b.addShape(new CANNON.Plane());
    b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal);
    b.position.set(x, 0, z);
    world.addBody(b);
  };
  parede(-halfX + folga, 0, new CANNON.Vec3(1, 0, 0));
  parede(halfX - folga, 0, new CANNON.Vec3(-1, 0, 0));
  parede(0, -halfZ + folga, new CANNON.Vec3(0, 0, 1));
  parede(0, halfZ - folga, new CANNON.Vec3(0, 0, -1));

  // Condições iniciais: as MESMAS de `ArenaDados` — punhado compacto,
  // direção sorteada, a força só como módulo de impulso e giro.
  const n = dados.length;
  const colunas = Math.ceil(Math.sqrt(n));
  const linhas = Math.ceil(n / colunas);
  const margem = CIRCUNRAIO_ALVO * escala + 0.15;
  const dentro = (v: number, metade: number) => Math.max(-Math.max(0, metade - margem), Math.min(Math.max(0, metade - margem), v));
  const angulo = entre(0, Math.PI * 2);
  const dirX = Math.cos(angulo), dirZ = Math.sin(angulo);
  const passo = (CIRCUNRAIO_ALVO * 2 + lanc.jitterPosicao * 2 + 0.05) * escala;
  const meioX = ((colunas - 1) * passo) / 2;
  const meioZ = ((linhas - 1) * passo) / 2;
  const recuo = (metade: number, meio: number) => Math.min(metade * 0.35, Math.max(0, metade - margem - meio));
  const origemX = -dirX * recuo(halfX, meioX);
  const origemZ = -dirZ * recuo(halfZ, meioZ);

  const corpos = dados.map((d, i) => {
    const f = d.aparencia.fisica ?? {};
    const amort = f.amortecimento ?? 1;
    const body = new CANNON.Body({
      mass: f.massa ?? 1, material: mats[i],
      linearDamping: 0.22 * amort, angularDamping: 0.24 * amort,
      allowSleep: true, sleepSpeedLimit: 0.14, sleepTimeLimit: 0.55,
    });
    body.addShape(modelos[i].shape);
    const col = i % colunas, lin = Math.floor(i / colunas);
    const jx = entre(-lanc.jitterPosicao, lanc.jitterPosicao);
    const jz = entre(-lanc.jitterPosicao, lanc.jitterPosicao);
    body.position.set(
      dentro(origemX + col * passo - meioX + jx * escala, halfX - folga),
      4.4 + entre(0, 0.8),
      dentro(origemZ + lin * passo - meioZ + jz * escala, halfZ - folga),
    );
    body.quaternion.setFromEuler(entre(0, Math.PI * 2), entre(0, Math.PI * 2), entre(0, Math.PI * 2));
    const anguloH = angulo + entre(-0.22, 0.22);
    const modulo = lanc.velocidadeHorizontal * entre(0.88, 1.12);
    body.velocity.set(Math.cos(anguloH) * modulo, lanc.velocidadeVertical + entre(-0.6, 0.6), Math.sin(anguloH) * modulo);
    const giro = lanc.velocidadeAngularMax * 0.65 * (f.giro ?? 1);
    body.angularVelocity.set(entre(-giro, giro), entre(-giro, giro), entre(-giro, giro));
    world.addBody(body);
    return body;
  });

  const quadros = dados.map(() => new Float32Array((MAX_PASSOS + 1) * 7));
  const rapidez = dados.map(() => new Float32Array((MAX_PASSOS + 1) * 2));
  const gravar = (s: number) => {
    corpos.forEach((b, i) => {
      const o = s * 7, q = quadros[i];
      q[o] = b.position.x; q[o + 1] = b.position.y; q[o + 2] = b.position.z;
      q[o + 3] = b.quaternion.x; q[o + 4] = b.quaternion.y; q[o + 5] = b.quaternion.z; q[o + 6] = b.quaternion.w;
      rapidez[i][s * 2] = b.velocity.lengthSquared();
      rapidez[i][s * 2 + 1] = b.angularVelocity.lengthSquared();
    });
  };
  gravar(0);

  const desde = new Array<number>(n).fill(-1);
  let fim = MAX_PASSOS;
  const amortBase = corpos.map((b) => [b.linearDamping, b.angularDamping] as const);
  for (let s = 1; s <= MAX_PASSOS; s++) {
    if (freio) {
      corpos.forEach((b, i) => {
        const baixo = b.position.y < freio.altura * escala;
        const v2 = b.velocity.lengthSquared();
        const fim = baixo && v2 < freio.vel2Fim;
        const lento = baixo && v2 < freio.vel2;
        b.linearDamping = Math.max(amortBase[i][0], fim ? freio.linearFim : lento ? freio.linear : 0);
        b.angularDamping = Math.max(amortBase[i][1], fim ? freio.angularFim : lento ? freio.angular : 0);
      });
    }
    world.step(PASSO);
    gravar(s);
    let todos = true;
    corpos.forEach((b, i) => {
      const parado = b.sleepState === CANNON.Body.SLEEPING
        || (b.velocity.lengthSquared() < 0.018 && b.angularVelocity.lengthSquared() < 0.025);
      if (parado) { if (desde[i] < 0) desde[i] = s; } else desde[i] = -1;
      if (desde[i] < 0 || s - desde[i] < PASSOS_ESTAVEL) todos = false;
    });
    if (todos) { fim = s; break; }
  }
  const quat = new THREE.Quaternion();
  const faceNo = (i: number, s: number) => {
    const o = s * 7, q = quadros[i];
    quat.set(q[o + 3], q[o + 4], q[o + 5], q[o + 6]);
    return faceLida(modelos[i], quat, dados[i].lados);
  };
  // Para cada dado: a última vez que a face de cima mudou (inclusive por
  // um esbarrão do outro dado depois de parado) e, dali em diante, o
  // primeiro trecho calmo. É ali que o resultado está decidido.
  const assenta = dados.map((_, i) => {
    const final = faceNo(i, fim);
    let mudou = 0;
    for (let s = fim; s >= 0; s--) if (faceNo(i, s) !== final) { mudou = s + 1; break; }
    let calmo = fim, seguidos = 0;
    for (let s = mudou; s <= fim; s++) {
      const quieto = rapidez[i][s * 2] < VEL_CALMA && rapidez[i][s * 2 + 1] < GIRO_CALMO;
      seguidos = quieto ? seguidos + 1 : 0;
      if (seguidos >= PASSOS_CALMO) { calmo = s; break; }
    }
    return Math.min(fim, Math.max(mudou + PASSOS_CALMO, calmo) + PASSOS_LEITURA);
  });

  const rotulos: number[][] = [];
  const valores: number[] = [];
  dados.forEach((d, i) => {
    const modelo = modelos[i];
    const r = modelo.faces.map((f) => f.value);
    const o = fim * 7, q = quadros[i];
    const lida = faceLida(modelo, new THREE.Quaternion(q[o + 3], q[o + 4], q[o + 5], q[o + 6]), d.lados);
    if (d.forcado != null) {
      const alvo = r.indexOf(d.forcado);
      if (alvo >= 0 && alvo !== lida) [r[lida], r[alvo]] = [r[alvo], r[lida]];
    }
    rotulos.push(r);
    valores.push(r[lida]);
  });
  return { quadros, fim, assenta, rotulos, valores };
}

/**
 * Compila os shaders dos materiais ANTES do primeiro lance. Sem isto o
 * primeiro quadro de cada tipo de material custava ~30 ms (um quadro
 * perdido no começo da queda). Mesma luz e mesma sombra da arena, para
 * o programa compilado ser o mesmo; o renderer é o compartilhado.
 */
export function aquecerArena(pecas: { lados: number; aparencia: Aparencia }[]) {
  if (typeof window === "undefined") return;
  const renderer = obterRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 200);
  camera.position.set(0, 100, 10);
  camera.lookAt(0, 0, 0);
  montarCenario(renderer, scene, "#00d4ff");
  const chaoGeo = new THREE.PlaneGeometry(2, 2);
  const chaoMat = new THREE.ShadowMaterial({ opacity: 0.42 });
  const chao = new THREE.Mesh(chaoGeo, chaoMat);
  chao.receiveShadow = true;
  scene.add(chao);
  const lixo: { dispose?: () => void; descartar?: () => void }[] = [chaoGeo, chaoMat];
  for (const { lados, aparencia } of pecas) {
    const modelo = buildDieModel(lados, 1.3);
    const visual = criarVisualDado(modelo.geo, lados, TRIS_PER_FACE[lados] ?? 1, aparencia, (f) => modelo.faces[f]?.value ?? f + 1);
    scene.add(visual.group);
    lixo.push(modelo.geo, visual);
    if (aparencia.luz) {
      const aura = criarAura(aparencia.luz.cor, 3);
      const halo = criarHalo(aparencia.luz.cor, 3);
      scene.add(aura.sprite, halo.mesh);
      lixo.push(aura, halo);
    }
  }
  renderer.compile(scene, camera);
  // As texturas dos algarismos sobem para a GPU agora, não no meio da queda.
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      const mapa = (mat as THREE.MeshBasicMaterial).map;
      if (mapa) renderer.initTexture(mapa);
    }
  });
  // NÃO descarta: `material.dispose()` faz o three liberar o programa
  // compilado quando ninguém mais o usa — o aquecimento seria perdido.
  // São três peças pequenas; ficam vivas enquanto a página existir.
  aquecidas.push(...lixo);
  renderer.renderLists.dispose();
}
const aquecidas: unknown[] = [];

/** Só para o diagnóstico em node (`scripts` da pasta); não é API. */
export const __diagnostico = { simular, faceLida, PASSO };

/* ---- componente ----------------------------------------------------- */

export function ArenaDupla({
  dados, token, forca, reduzido = false, cena, estadoAoAssentar, controleRef,
  aoAssentarDado, aoAssentar, aoProjetar, corRecorte = "#00d4ff",
}: {
  dados: DadoArena[];
  token: number;
  forca: number;
  /** `prefers-reduced-motion` (ou a simulação da bancada): pula a queda. */
  reduzido?: boolean;
  /** Reencenação: os dados reaparecem parados nestas poses, sem física. */
  cena?: { poses: Record<string, Pose>; rotulos: Record<string, number[]>; estados: Record<string, EstadoDado> };
  /** Estado visual de cada dado ao assentar (padrão `neutro`). */
  estadoAoAssentar?: Record<string, EstadoDado>;
  controleRef?: MutableRefObject<ControleArena | null>;
  aoAssentarDado?: (r: ResultadoDado) => void;
  aoAssentar?: (r: ResultadoDado[], medida: MedidaArena) => void;
  /** Posição de cada dado na tela, a cada quadro (para rótulos no DOM). */
  aoProjetar?: (p: Projecao[]) => void;
  corRecorte?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ aoAssentarDado, aoAssentar, aoProjetar });
  cb.current = { aoAssentarDado, aoAssentar, aoProjetar };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || token === 0 || dados.length === 0) return;
    const renderer = obterRenderer();
    el.appendChild(renderer.domElement);

    const escala = 1.3;
    const inclinacao = THREE.MathUtils.degToRad(15);
    const ppuAlvo = 54;
    const medir = () => {
      const w = Math.max(el.clientWidth, 1), h = Math.max(el.clientHeight, 1);
      const ppu = Math.min(ppuAlvo, Math.min(w, h) / 8);
      const metadeV = h / (2 * ppu);
      return { w, h, ppu, halfX: w / (2 * ppu), metadeV, halfZ: metadeV / Math.cos(inclinacao) };
    };
    let m = medir();

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-m.halfX, m.halfX, m.metadeV, -m.metadeV, 0.1, 200);
    camera.up.set(0, 0, -1);
    camera.position.set(0, 100 * Math.cos(inclinacao), 100 * Math.sin(inclinacao));
    camera.lookAt(0, 0, 0);
    const cenario = montarCenario(renderer, scene, corRecorte);

    const chaoMat = new THREE.ShadowMaterial({ opacity: 0.42 });
    const chaoGeo = new THREE.PlaneGeometry(2, 2);
    const chao = new THREE.Mesh(chaoGeo, chaoMat);
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    scene.add(chao);

    const modelos = dados.map((d) => buildDieModel(d.lados, escala));
    const t0Sim = performance.now();
    const grav: Gravacao = cena
      ? (() => {
          // Reencenação: um único quadro, a pose de repouso de cada dado.
          const quadros = dados.map((d) => {
            const a = new Float32Array(7);
            const p = cena.poses[d.id];
            a.set([...p.p, ...p.q]);
            return a;
          });
          return { quadros, fim: 0, assenta: dados.map(() => 0), rotulos: dados.map((d) => cena.rotulos[d.id]), valores: dados.map((d, i) => cena.rotulos[d.id][faceLida(modelos[i], new THREE.Quaternion(...cena.poses[d.id].q), d.lados)]) };
        })()
      : simular({ halfX: m.halfX, halfZ: m.halfZ, folga: 4 / m.ppu, escala }, dados, modelos, forca);
    const preSimMs = performance.now() - t0Sim;

    type Peca = {
      dado: DadoArena; visual: VisualDado; aura: Aura | null; halo: Halo | null;
      estado: EstadoDado; luz: number; num: number; escala: number; mudou: number;
    };
    const pecas: Peca[] = dados.map((d, i) => {
      const visual = criarVisualDado(modelos[i].geo, d.lados, TRIS_PER_FACE[d.lados] ?? 1, d.aparencia, (f) => grav.rotulos[i][f]);
      scene.add(visual.group);
      const corLuz = d.aparencia.luz?.cor;
      const aura = corLuz ? criarAura(corLuz, CIRCUNRAIO_ALVO * escala * 3.6) : null;
      if (aura) scene.add(aura.sprite);
      const corHalo = d.aparencia.halo?.cor ?? corLuz;
      const halo = corHalo ? criarHalo(corHalo, CIRCUNRAIO_ALVO * escala * 3.4) : null;
      if (halo) scene.add(halo.mesh);
      const estado: EstadoDado = cena ? cena.estados[d.id] ?? "neutro" : "rolando";
      return { dado: d, visual, aura, halo, estado, luz: cena ? 0 : luzEmVoo(d.aparencia, forca, 0), num: 1, escala: 1, mudou: 0 };
    });

    const ajustar = () => {
      m = medir();
      renderer.setSize(m.w, m.h, false);
      camera.left = -m.halfX; camera.right = m.halfX; camera.top = m.metadeV; camera.bottom = -m.metadeV;
      camera.updateProjectionMatrix();
      cenario.ajustar(m.halfX, m.halfZ);
      chao.scale.set(m.halfX, m.halfZ, 1);
    };
    ajustar();
    const observer = new ResizeObserver(ajustar);
    observer.observe(el);

    const marcar = (id: string, estado: EstadoDado) => {
      const p = pecas.find((x) => x.dado.id === id);
      if (!p || p.estado === estado) return;
      p.estado = estado;
      p.mudou = performance.now();
      if (estado === "usado") p.escala = 1.09; // o pulso da troca nasce aqui e assenta sozinho
    };
    if (controleRef) controleRef.current = { marcar };

    const resultados: (ResultadoDado | null)[] = dados.map(() => null);
    const posA = new THREE.Vector3(), posB = new THREE.Vector3();
    const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
    const projetado = new THREE.Vector3();

    const fimSeg = grav.fim * PASSO;
    // Movimento reduzido (e reencenação): começa no fim da gravação.
    const inicio = performance.now() - (reduzido || cena ? fimSeg * 1000 : 0);
    let ultimo = performance.now();
    let quadros = 0, maiorIntervalo = 0, somaIntervalos = 0, avisouTodos = false;
    let custoSoma = 0, custoPior = 0, semPintura = false;
    let raf = 0;
    let reserva: ReturnType<typeof setTimeout> | undefined;
    // Relógio de reserva: se a aba parar de pintar (em segundo plano,
    // painel oculto), a queda continua andando a 4 Hz — o resultado
    // chega na hora certa em vez de esperar a aba voltar.
    const agendar = () => {
      raf = requestAnimationFrame(loop);
      clearTimeout(reserva);
      reserva = setTimeout(() => { cancelAnimationFrame(raf); semPintura = true; loop(performance.now()); }, 250);
    };

    const loop = (agora: number) => {
      const t0Quadro = performance.now();
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      const intervalo = agora - ultimo;
      ultimo = agora;
      const t = (agora - inicio) / 1000;
      const k = Math.min(grav.fim, t / PASSO);
      const i0 = Math.floor(k), a = k - i0, i1 = Math.min(grav.fim, i0 + 1);
      const caindo = !avisouTodos;
      if (caindo && quadros > 0) { maiorIntervalo = Math.max(maiorIntervalo, intervalo); somaIntervalos += intervalo; }
      if (caindo) quadros++;

      pecas.forEach((p, i) => {
        const q = grav.quadros[i];
        const o0 = i0 * 7, o1 = i1 * 7;
        posA.set(q[o0], q[o0 + 1], q[o0 + 2]); posB.set(q[o1], q[o1 + 1], q[o1 + 2]);
        qA.set(q[o0 + 3], q[o0 + 4], q[o0 + 5], q[o0 + 6]); qB.set(q[o1 + 3], q[o1 + 4], q[o1 + 5], q[o1 + 6]);
        p.visual.group.position.copy(posA.lerp(posB, a));
        p.visual.group.quaternion.copy(qA.slerp(qB, a));

        // Assentou?
        if (!resultados[i] && k >= grav.assenta[i]) {
          const pos = p.visual.group.position, rot = p.visual.group.quaternion;
          const fq = grav.quadros[i], of = grav.fim * 7;
          resultados[i] = {
            id: p.dado.id, lados: p.dado.lados, valor: grav.valores[i], rotulos: grav.rotulos[i],
            pose: { p: [fq[of], fq[of + 1], fq[of + 2]], q: [fq[of + 3], fq[of + 4], fq[of + 5], fq[of + 6]] },
            assentouMs: Math.round(grav.assenta[i] * PASSO * 1000),
          };
          void pos; void rot;
          if (!cena) {
            p.estado = estadoAoAssentar?.[p.dado.id] ?? "neutro";
            p.mudou = agora;
          }
          cb.current.aoAssentarDado?.(resultados[i]!);
        }

        // Alvos do estado visual — perseguidos com suavização exponencial
        // (curva de saída, interrompível a qualquer quadro).
        const ap = p.dado.aparencia;
        const repouso = ap.luz?.repouso ?? 0;
        let luzAlvo = 0, numAlvo = 1, destaque: number | null = null;
        switch (p.estado) {
          case "rolando": luzAlvo = luzEmVoo(ap, forca, t); break;
          case "neutro": luzAlvo = repouso; destaque = grav.valores[i]; break;
          case "usado": luzAlvo = Math.max(repouso, 0.95) + (agora - p.mudou < 160 ? 0.45 : 0); destaque = grav.valores[i]; break;
          case "reserva": {
            const resp = ap.luz?.respiracao ?? 0;
            luzAlvo = repouso * 0.75 * (resp ? 0.82 + 0.18 * Math.sin((agora / 1000) * Math.PI * 2 * resp) : 1);
            numAlvo = 0.62; destaque = grav.valores[i];
            break;
          }
          case "apagado": luzAlvo = 0.04; numAlvo = 0.32; break;
        }
        const s = 1 - Math.exp(-dt / (p.estado === "rolando" ? 0.03 : 0.085));
        p.luz += (luzAlvo - p.luz) * s;
        p.num += (numAlvo - p.num) * s;
        p.escala += (1 - p.escala) * (1 - Math.exp(-dt / 0.11));
        p.visual.definirLuz(p.luz);
        p.visual.definirNumeros(p.num, p.estado === "rolando" ? null : destaque);
        p.visual.group.scale.setScalar(p.escala);
        const { x, y, z } = p.visual.group.position;
        p.aura?.sprite.position.set(x, y, z);
        p.aura?.definir(p.luz);
        p.halo?.seguir(x, y, z, ap.halo ? ap.halo.forca : 0.34 * Math.min(1, p.luz + 0.15));
      });

      if (!avisouTodos && resultados.every(Boolean)) {
        avisouTodos = true;
        const media = quadros > 1 ? somaIntervalos / (quadros - 1) : 16.7;
        cb.current.aoAssentar?.(resultados as ResultadoDado[], {
          preSimMs: Math.round(preSimMs),
          quadros,
          fpsMedio: Math.round(1000 / media),
          fpsMinimo: Math.round(1000 / Math.max(maiorIntervalo, media)),
          quedaMs: Math.round(Math.max(...grav.assenta) * PASSO * 1000),
          custoMedioMs: Math.round((custoSoma / Math.max(1, quadros - 1)) * 10) / 10,
          custoPiorMs: Math.round(custoPior * 10) / 10,
          semPintura,
        });
      }

      if (cb.current.aoProjetar) {
        const proj = pecas.map((p) => {
          projetado.copy(p.visual.group.position).project(camera);
          return { id: p.dado.id, x: ((projetado.x + 1) / 2) * m.w, y: ((1 - projetado.y) / 2) * m.h };
        });
        cb.current.aoProjetar(proj);
      }

      renderer.render(scene, camera);
      if (caindo && quadros > 1) {
        // O primeiro quadro paga a compilação dos shaders: fica fora da conta.
        const custo = performance.now() - t0Quadro;
        custoSoma += custo;
        custoPior = Math.max(custoPior, custo);
      }
      agendar();
    };
    agendar();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(reserva);
      observer.disconnect();
      if (controleRef && controleRef.current?.marcar === marcar) controleRef.current = null;
      pecas.forEach((p) => { p.visual.descartar(); p.aura?.descartar(); p.halo?.descartar(); });
      modelos.forEach((mo) => mo.geo.dispose());
      chaoGeo.dispose();
      chaoMat.dispose();
      renderer.renderLists.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
    // A arena roda uma vez por pedido (`token`); o resto é lido no início.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return <div ref={containerRef} data-testid="arena-dupla" style={{ position: "absolute", inset: 0, overflow: "hidden" }} />;
}
