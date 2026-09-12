"use client";

/**
 * ARENA FÍSICA DOS DADOS — porte literal de
 * `chat % dice tray/src/lib/dice-shapes.tsx` (Three.js + cannon-es).
 *
 * O valor NÃO é sorteado antes: é lido da normal da face que ficou mais
 * voltada para cima depois que os corpos entraram em repouso.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { parametrosDeLancamento } from "./lancamento";

/* ---- triangles per face (non-indexed geometry) ------------------- */
const TRIS_PER_FACE: Record<number, number> = {
  4: 1,   // tetrahedron: 4 tri faces
  6: 2,   // box: 2 tris per quad face
  8: 1,   // octahedron: 8 tri faces
  10: 2,  // custom d10: 2 tris per kite face
  100: 2, // percentil: é o MESMO d10, lido em dezenas
  12: 3,  // dodecahedron: 3 tris per pentagon face
  20: 1,  // icosahedron: 20 tri faces
};

/* ---- canvas texture with face number ----------------------------- */
function makeFaceLabel(n: number, accent: string): THREE.CanvasTexture {
  // 256px, não 128 — na tela o triângulo/losango da face é pequeno;
  // uma textura maior é o que evita a bidimensional escalar pra baixo
  // e embaçar o algarismo justo no tamanho em que ele é lido.
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 256);

  // Emblema: disco ESCURO SÓLIDO, sem brilho nenhum atrás do número.
  // A tentativa anterior (contorno + `shadowBlur` colorido) ainda
  // deixava o algarismo "sujo" — o halo do brilho borra exatamente a
  // borda da letra, que é a parte que faz ela ser lida como número.
  // Um fundo opaco resolve contraste em QUALQUER ângulo de luz sem
  // precisar borrar nada.
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(3,7,13,0.92)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.stroke();

  // `next/font` gera um nome de família próprio; canvas não lê var(),
  // então resolvemos a variável antes de montar a string da fonte.
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  ctx.font = `bold 148px ${mono || '"JetBrains Mono"'}, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(n), 128, 134);

  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

/* ---- place number planes on each face ---------------------------- */
function addFaceLabels(
  geo: THREE.BufferGeometry,
  parent: THREE.Group,
  sides: number,
  accent: string,
  escala = 1,
) {
  const tpf = TRIS_PER_FACE[sides] ?? 1;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const totalTris = pos.count / 3;
  const faceCount = Math.round(totalTris / tpf);

  for (let f = 0; f < faceCount; f++) {
    const centroid = new THREE.Vector3();
    let a0 = new THREE.Vector3(), b0 = new THREE.Vector3(), c0 = new THREE.Vector3();

    for (let t = 0; t < tpf; t++) {
      const base = (f * tpf + t) * 3;
      const a = new THREE.Vector3(pos.getX(base), pos.getY(base), pos.getZ(base));
      const b = new THREE.Vector3(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1));
      const c = new THREE.Vector3(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2));
      centroid.add(a).add(b).add(c);
      if (t === 0) { a0 = a; b0 = b; c0 = c; }
    }
    centroid.divideScalar(tpf * 3);

    const normal = new THREE.Vector3()
      .crossVectors(new THREE.Vector3().subVectors(b0, a0), new THREE.Vector3().subVectors(c0, a0))
      .normalize();
    if (normal.dot(centroid) < 0) normal.negate();

    // d100: as dez faces são 00, 10, 20… 90 — não 1 a 10.
    const texture = makeFaceLabel(sides === 100 ? f * 10 : f + 1, accent);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.42 * escala, 0.42 * escala), mat);
    plane.position.copy(centroid).addScaledVector(normal, 0.06 * escala);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    parent.add(plane);
  }
}

/* ---- Three.js geometry per die type ----------------------------- */

function createD10(escala = 1): THREE.BufferGeometry {
  // Trapezoedro pentagonal construído como o dual polar de um antiprisma
  // pentagonal: o dual de cada face-triângulo do antiprisma é o ponto
  // normal/distância dessa face, então dois triângulos vizinhos que
  // compartilham uma aresta no antiprisma viram dois pontos EXATAMENTE
  // coplanares no dual — a face "pipa" resultante é plana por construção,
  // não por ajuste visual (ao contrário da versão anterior, que tinha
  // uma dobra real de ~40° em cada face).
  const n = 5;
  const R = 1, H = 0.6; // proporções do antiprisma gerador
  const vec = (a: number, h: number) => new THREE.Vector3(R * Math.cos(a), h, R * Math.sin(a));
  const T = Array.from({ length: n }, (_, i) => vec((2 * Math.PI * i) / n, H));
  const B = Array.from({ length: n }, (_, i) => vec((2 * Math.PI * i) / n + Math.PI / n, -H));

  const dualDaFace = (pts: THREE.Vector3[]) => {
    const normal = new THREE.Vector3()
      .crossVectors(new THREE.Vector3().subVectors(pts[1], pts[0]), new THREE.Vector3().subVectors(pts[2], pts[0]))
      .normalize();
    const d = normal.dot(pts[0]);
    return normal.multiplyScalar(1 / d);
  };
  const triCima = (i: number) => [T[i], T[(i + 1) % n], B[i]];
  const triBaixo = (i: number) => [B[i], B[(i + 1) % n], T[(i + 1) % n]];

  const norte = dualDaFace(T);
  const sul = dualDaFace([...B].reverse());
  const eqCima = Array.from({ length: n }, (_, i) => dualDaFace(triCima(i)));
  const eqBaixo = Array.from({ length: n }, (_, i) => dualDaFace(triBaixo(i)));

  // Reescala para o raio equatorial ficar no mesmo porte visual dos outros dados.
  const fator = (0.85 * escala) / eqCima[0].length();
  const s = (p: THREE.Vector3) => p.clone().multiplyScalar(fator);

  const v: number[] = [];
  const push = (p: THREE.Vector3) => v.push(p.x, p.y, p.z);
  // Garante que cada triângulo aponte pra fora (winding CCW visto de fora):
  // sem isso, metade das faces fica com a normal invertida e o backface
  // culling padrão do MeshPhongMaterial some com elas (pareciam "transparentes").
  const triExterna = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b, a),
      new THREE.Vector3().subVectors(c, a),
    );
    const centro = new THREE.Vector3().add(a).add(b).add(c);
    if (normal.dot(centro) < 0) {
      push(a); push(c); push(b);
    } else {
      push(a); push(b); push(c);
    }
  };
  const pipa = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    triExterna(a, b, c);
    triExterna(a, c, d);
  };
  for (let i = 0; i < n; i++) {
    const ant = (i - 1 + n) % n;
    pipa(s(norte), s(eqCima[i]), s(eqBaixo[ant]), s(eqCima[ant]));
    pipa(s(sul), s(eqBaixo[i]), s(eqCima[i]), s(eqBaixo[ant]));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeGeo(sides: number, escala = 1): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  switch (sides) {
    case 4:  geo = new THREE.TetrahedronGeometry(0.85 * escala, 0); break;
    case 6:  geo = new THREE.BoxGeometry(1.1 * escala, 1.1 * escala, 1.1 * escala); break;
    case 8:  geo = new THREE.OctahedronGeometry(0.9 * escala, 0); break;
    case 10: geo = createD10(escala); break;
    // Percentil não é um sólido de 100 faces: na mesa é o d10 lido em
    // dezenas. Mesma geometria, e só o ROTULAGEM muda (00…90).
    case 100: geo = createD10(escala); break;
    case 12: geo = new THREE.DodecahedronGeometry(0.82 * escala, 0); break;
    case 20:
    default: geo = new THREE.IcosahedronGeometry(0.88 * escala, 0); break;
  }
  if ((geo as THREE.BufferGeometry & { index: unknown }).index) return geo.toNonIndexed();
  return geo;
}

/* ---- physical dice arena (Three.js + cannon-es) ----------------- */

type FaceInfo = {
  value: number;
  normal: THREE.Vector3;
};

export type PhysicsDieSpec = {
  id: string;
  sides: number;
};

export type PhysicsDieResult = PhysicsDieSpec & {
  value: number;
};

type DieModel = {
  geo: THREE.BufferGeometry;
  faces: FaceInfo[];
  shape: CANNON.ConvexPolyhedron;
};

export function buildDieModel(sides: number, escala = 1): DieModel {
  const geo = makeGeo(sides, escala);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const tpf = TRIS_PER_FACE[sides] ?? 1;
  const triangleCount = pos.count / 3;
  const faces: FaceInfo[] = [];

  for (let f = 0; f < triangleCount / tpf; f++) {
    const centroid = new THREE.Vector3();
    let a0 = new THREE.Vector3();
    let b0 = new THREE.Vector3();
    let c0 = new THREE.Vector3();

    for (let t = 0; t < tpf; t++) {
      const base = (f * tpf + t) * 3;
      const a = new THREE.Vector3(pos.getX(base), pos.getY(base), pos.getZ(base));
      const b = new THREE.Vector3(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1));
      const c = new THREE.Vector3(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2));
      centroid.add(a).add(b).add(c);
      if (t === 0) {
        a0 = a;
        b0 = b;
        c0 = c;
      }
    }

    centroid.divideScalar(tpf * 3);
    const normal = new THREE.Vector3()
      .crossVectors(new THREE.Vector3().subVectors(b0, a0), new THREE.Vector3().subVectors(c0, a0))
      .normalize();
    if (normal.dot(centroid) < 0) normal.negate();
    // Percentil: mesmas dez faces do d10, valendo 00…90.
    faces.push({ value: sides === 100 ? f * 10 : f + 1, normal });
  }

  const vertices: CANNON.Vec3[] = [];
  const vertexLookup = new Map<string, number>();
  const physicsFaces: number[][] = [];
  const vertexIndex = (x: number, y: number, z: number) => {
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
    const previous = vertexLookup.get(key);
    if (previous !== undefined) return previous;
    const next = vertices.length;
    vertices.push(new CANNON.Vec3(x, y, z));
    vertexLookup.set(key, next);
    return next;
  };

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 3;
    let tri = [
      vertexIndex(pos.getX(base), pos.getY(base), pos.getZ(base)),
      vertexIndex(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1)),
      vertexIndex(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2)),
    ];
    const a = vertices[tri[0]];
    const b = vertices[tri[1]];
    const c = vertices[tri[2]];
    const ab = b.vsub(a);
    const ac = c.vsub(a);
    const normal = ab.cross(ac);
    const center = new CANNON.Vec3(
      (a.x + b.x + c.x) / 3,
      (a.y + b.y + c.y) / 3,
      (a.z + b.z + c.z) / 3,
    );
    if (normal.dot(center) < 0) tri = [tri[0], tri[2], tri[1]];
    physicsFaces.push(tri);
  }

  return {
    geo,
    faces,
    shape: new CANNON.ConvexPolyhedron({ vertices, faces: physicsFaces }),
  };
}

export function topFaceValue(faces: FaceInfo[], quaternion: CANNON.Quaternion) {
  const rotation = new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  let best = faces[0];
  let bestUp = -Infinity;
  for (const face of faces) {
    const up = face.normal.clone().applyQuaternion(rotation).y;
    if (up > bestUp) {
      best = face;
      bestUp = up;
    }
  }
  return best.value;
}

function random01() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 0x100000000;
}

function randomBetween(min: number, max: number) {
  return min + (max - min) * random01();
}

export type PerfilArena = "bandeja" | "mesa";

export function PhysicsDiceArena({
  dice,
  rollToken,
  onSettled,
  accent = "#45b8c9",
  height,
  className,
  perfil = "bandeja",
  forca,
  zoomMapa,
}: {
  dice: PhysicsDieSpec[];
  rollToken: number;
  onSettled: (results: PhysicsDieResult[]) => void;
  accent?: string;
  /** Só o modo `bandeja` usa altura fixa; `mesa` preenche o pai (o `.rv-palco`). */
  height?: number;
  className?: string;
  /** `bandeja`: caixa pequena de tamanho fixo (o desenho original do estudo).
   *  `mesa`: os dados caem sobre o PALCO inteiro — dados maiores, piso
   *  invisível (só sombra, o mapa real fica visível por baixo), sem grade
   *  própria (a mesa já tem a dela). */
  perfil?: PerfilArena;
  /** 0–1: quanto o botão "Rolar" foi carregado. Só afeta as condições
   *  INICIAIS do lançamento (impulso, giro) — nunca a face lida no fim. */
  forca?: number;
  /** Zoom ATUAL do mapa (`VttClient`, 0.5–2.4, padrão 1). Só em modo
   *  `mesa`: escala o TAMANHO do dado — mapa mais zoomado, dado maior,
   *  pra continuar do tamanho de hexágono/token que está na tela. Não
   *  mexe na área/câmera, só na geometria. */
  zoomMapa?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const diceSignature = dice.map((die) => `${die.id}:${die.sides}`).join("|");

  useEffect(() => {
    const el = containerRef.current;
    if (!el || rollToken === 0 || dice.length === 0) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);

    const mesa = perfil === "mesa";
    // Única ponte entre "quanto tempo seguraram o botão" e a física —
    // aqui, não espalhado pelos pontos abaixo, pra continuar sendo UMA
    // conversão, testável isolada de `three`/`cannon-es`.
    const lancamento = parametrosDeLancamento(forca ?? 0);
    // Na mesa os dados precisam se LER a distância — um pouco maiores
    // que na bandeja, mas sem exagero: a câmera segue a MESMA razão
    // distância/extensão da bandeja (só a extensão cresce), então o
    // enquadramento não fecha em cima de um dado só.
    //
    // Zoom do MAPA entra aqui, só na mesa: dado maior com o mapa mais
    // zoomado (acompanha o hexágono/token que cresceu na tela), menor
    // com o mapa mais afastado. Faixa deliberadamente comprimida
    // (0,8×–1,56× em cima da base 1.3, não o 0,5–2,4 cru do zoom) —
    // um dado 2,4× maior escaparia da folga de parede medida pra
    // escala 1.3 (ver `espessuraParede` abaixo).
    const zoomClampado = Math.max(0.5, Math.min(2.4, zoomMapa ?? 1));
    const fatorZoom = mesa ? 0.6 + zoomClampado * 0.4 : 1;
    const escala = mesa ? 1.3 * fatorZoom : 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

    const columns = Math.max(2, Math.ceil(Math.sqrt(dice.length)));
    const rows = Math.max(1, Math.ceil(dice.length / columns));
    const arenaHalfZ = mesa ? Math.max(5.5, rows * 1.7) : Math.max(2.25, Math.ceil(dice.length / columns) * 0.9);
    // Na mesa a largura da arena segue a PROPORÇÃO real do contêiner
    // (agora só a faixa direita do palco, não mais o palco inteiro) —
    // um valor fixo assumia um contêiner largo e cortava dado na borda
    // assim que o espaço ficou mais estreito. `1.29` vem da própria
    // geometria da câmera (FOV vertical 34°, distância proporcional a
    // `arenaHalfZ`): é quanto de meia-largura do mundo cabe no quadro
    // por unidade de proporção largura/altura do contêiner, com uma
    // margem de 15% pra não colar dado na borda.
    const proporcaoContainer = el.clientWidth / Math.max(el.clientHeight, 1);
    const arenaHalfX = mesa
      ? Math.max(4.5, Math.min(arenaHalfZ * proporcaoContainer * 1.29 * 0.85, columns * 2.6))
      : Math.max(3.2, columns * 0.92);
    // TESTE — câmera vertical (vista de cima pra baixo), só pra
    // comparar com o ângulo atual. `false` volta pro ângulo original.
    const CAMERA_DE_CIMA = true;
    if (CAMERA_DE_CIMA) {
      // Olhando reto pra baixo, o `up` padrão (0,1,0) fica paralelo à
      // direção do olhar — degenerado, a câmera não sabe pra onde é
      // "topo da tela". Trocar o `up` pra um eixo do PLANO resolve.
      camera.up.set(0, 0, -1);
      camera.position.set(0, arenaHalfZ * 4.965, 0);
    } else {
      camera.position.set(0, arenaHalfZ * 4.1, arenaHalfZ * 2.8);
    }
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
    const keyLight = new THREE.DirectionalLight(accent, 4.2);
    // A posição da luz era pensada pro ângulo ANTERIOR da câmera — de
    // cima pra baixo, ela jogava a sombra pra cima-ESQUERDA da tela
    // (luz vindo de +X/+Z, sombra na direção oposta), tampando
    // exatamente o lado que a mesa precisa livre. Vista de cima, a luz
    // vem de cima-esquerda do MUNDO — sombra cai pra baixo-direita.
    keyLight.position.set(CAMERA_DE_CIMA ? -3 : 4, CAMERA_DE_CIMA ? 9 : 8, CAMERA_DE_CIMA ? -4 : 5);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(-4, 3, -2);
    scene.add(rimLight);

    // Na mesa o "piso" não pode ser um retângulo opaco: ele tamparia o
    // mapa de verdade por baixo dos dados. `ShadowMaterial` desenha SÓ a
    // sombra de contato — o resto do plano fica transparente — então o
    // mapa continua visível, com os dados ancorados nele por sombra.
    const floorMaterial: THREE.Material = mesa
      ? new THREE.ShadowMaterial({ opacity: 0.32 })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color("#07101d"), roughness: 0.88, metalness: 0.08 });
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(arenaHalfX * 2, arenaHalfZ * 2),
      floorMaterial,
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // A grade é o desenho do TABULEIRO da bandeja — na mesa o mapa já
    // tem a dele, uma segunda por cima só faria ruído.
    let gridMaterials: THREE.Material[] = [];
    if (!mesa) {
      const grid = new THREE.GridHelper(
        Math.max(arenaHalfX, arenaHalfZ) * 2,
        12,
        new THREE.Color(accent),
        new THREE.Color(accent),
      );
      gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
      gridMaterials.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.13;
      });
      grid.position.y = 0.006;
      scene.add(grid);
    }

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12.5, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.SAPBroadphase(world);
    const solver = new CANNON.GSSolver();
    solver.iterations = 16;
    world.solver = solver;

    const diceMaterial = new CANNON.Material("dice");
    const trayMaterial = new CANNON.Material("tray");
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, trayMaterial, {
      friction: 0.52,
      restitution: 0.28,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, {
      friction: 0.38,
      restitution: 0.34,
    }));

    const floorBody = new CANNON.Body({ mass: 0, material: trayMaterial });
    floorBody.addShape(new CANNON.Plane());
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floorBody);

    // Espessura da parede: achada por medição, não por estética (ela é
    // invisível). Com 0.12 um dado maior (escala > 1), vindo rápido,
    // atravessava — o `world.step` de um frame mais pesado dá conta de
    // cruzar uma parede fina antes de registrar a colisão.
    const espessuraParede = 0.5;
    const addWall = (x: number, z: number, halfX: number, halfZ: number) => {
      const wall = new CANNON.Body({ mass: 0, material: trayMaterial });
      wall.addShape(new CANNON.Box(new CANNON.Vec3(halfX, 6, halfZ)));
      wall.position.set(x, 5.5, z);
      world.addBody(wall);
    };
    addWall(-arenaHalfX - espessuraParede, 0, espessuraParede, arenaHalfZ + espessuraParede * 2);
    addWall(arenaHalfX + espessuraParede, 0, espessuraParede, arenaHalfZ + espessuraParede * 2);
    addWall(0, -arenaHalfZ - espessuraParede, arenaHalfX + espessuraParede * 2, espessuraParede);
    addWall(0, arenaHalfZ + espessuraParede, arenaHalfX + espessuraParede * 2, espessuraParede);

    const physicalDice = dice.map((die, index) => {
      const model = buildDieModel(die.sides, escala);
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color("#07101d"),
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.055,
        specular: new THREE.Color(accent),
        shininess: 105,
      });
      const mesh = new THREE.Mesh(model.geo, material);
      mesh.castShadow = true;
      const edgeGeo = new THREE.EdgesGeometry(model.geo, 12);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(accent) });
      const edges = new THREE.LineSegments(edgeGeo, edgeMaterial);
      const group = new THREE.Group();
      group.add(mesh, edges);
      addFaceLabels(model.geo, group, die.sides, accent, escala);
      scene.add(group);

      // Na mesa a massa não muda (`mass: 1`, sempre), mas o dado é
      // FISICAMENTE maior — mais inércia de rotação pra dissipar com o
      // mesmo amortecimento faria a rolagem se arrastar. Compensa aqui.
      const body = new CANNON.Body({
        mass: 1,
        material: diceMaterial,
        linearDamping: mesa ? 0.22 : 0.13,
        angularDamping: mesa ? 0.24 : 0.12,
        allowSleep: true,
        sleepSpeedLimit: 0.14,
        sleepTimeLimit: 0.55,
      });
      body.addShape(model.shape);
      const column = index % columns;
      const row = Math.floor(index / columns);
      // ATENÇÃO: 0.73×arenaHalf é o ponto da coluna/linha mais externa
      // (nascença em `-arenaHalf*0.72 + step`). Passar de ~0.85 nasce o
      // dado DENTRO da parede — o solver então o ejeta com um impulso
      // violento (medido: um dado saindo a x≈35, arena com metade 8).
      const xStep = (arenaHalfX * 1.45) / Math.max(columns - 1, 1);
      const zStep = (arenaHalfZ * 1.18) / Math.max(rows - 1, 1);
      // O jitter de posição soma o textural de sempre com um pouco a
      // mais vindo da força — carregar o lançamento também baralha
      // ONDE ele nasce, não só a velocidade.
      const jx = randomBetween(-lancamento.jitterPosicao, lancamento.jitterPosicao);
      const jz = randomBetween(-lancamento.jitterPosicao, lancamento.jitterPosicao);
      body.position.set(
        columns === 1 ? 0 : -arenaHalfX * 0.72 + column * xStep + jx * escala,
        (mesa ? 4.4 : 3.1) + row * 0.45 * escala + randomBetween(0, 1.2),
        rows === 1 ? 0 : -arenaHalfZ * 0.59 + row * zStep + jz * escala,
      );
      body.quaternion.setFromEuler(
        randomBetween(0, Math.PI * 2),
        randomBetween(0, Math.PI * 2),
        randomBetween(0, Math.PI * 2),
      );
      // Direção sempre aleatória — a FORÇA só entra como MÓDULO
      // (`lancamento.velocidadeHorizontal`/`velocidadeVertical`), nunca
      // decidindo o ângulo. Quem decide o número final é a face que
      // fica pra cima depois que o corpo dorme (`topFaceValue`,
      // adiante), nunca a força.
      const anguloH = randomBetween(0, Math.PI * 2);
      body.velocity.set(
        Math.cos(anguloH) * lancamento.velocidadeHorizontal,
        lancamento.velocidadeVertical + randomBetween(-0.6, 0.6),
        Math.sin(anguloH) * lancamento.velocidadeHorizontal,
      );
      // Giro inicial menor na mesa: um dado maior guarda mais energia
      // de rotação no mesmo giro (rad/s), e essa energia extra é
      // exatamente o que fazia a rolagem demorar demais pra assentar.
      const giro = lancamento.velocidadeAngularMax * (mesa ? 0.65 : 1);
      body.angularVelocity.set(
        randomBetween(-giro, giro),
        randomBetween(-giro, giro),
        randomBetween(-giro, giro),
      );
      world.addBody(body);
      return { die, model, group, body, material, edgeGeo, edgeMaterial };
    });

    const resize = () => {
      const width = Math.max(el.clientWidth, 1);
      const nextHeight = Math.max(el.clientHeight, 1);
      renderer.setSize(width, nextHeight, false);
      camera.aspect = width / nextHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    let raf: number;
    let last = performance.now();
    let elapsed = 0;
    let stableFrames = 0;
    let reported = false;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      world.step(1 / 60, dt, 4);

      physicalDice.forEach(({ body, group }) => {
        group.position.set(body.position.x, body.position.y, body.position.z);
        group.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      });

      const stable = physicalDice.every(({ body }) =>
        body.velocity.lengthSquared() < 0.018 && body.angularVelocity.lengthSquared() < 0.025,
      );
      stableFrames = stable ? stableFrames + 1 : 0;

      if (!reported && (stableFrames > 20 || elapsed > 7)) {
        reported = true;
        physicalDice.forEach(({ body }) => body.sleep());
        const results = physicalDice.map(({ die, model, body }) => ({
          ...die,
          value: topFaceValue(model.faces, body.quaternion),
        }));
        onSettledRef.current(results);
      }

      renderer.render(scene, camera);
      if (!reported) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.dispose();
      floorMesh.geometry.dispose();
      floorMaterial.dispose();
      gridMaterials.forEach((material) => material.dispose());
      physicalDice.forEach(({ model, group, material, edgeGeo, edgeMaterial }) => {
        model.geo.dispose();
        material.dispose();
        edgeGeo.dispose();
        edgeMaterial.dispose();
        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
            child.material.map?.dispose();
            child.material.dispose();
            child.geometry.dispose();
          }
        });
      });
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent, diceSignature, height, rollToken, perfil, forca, zoomMapa]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="physics-dice-arena"
      data-perfil={perfil}
      style={{ width: "100%", height: height ?? "100%", position: "relative", overflow: "hidden" }}
    />
  );
}
