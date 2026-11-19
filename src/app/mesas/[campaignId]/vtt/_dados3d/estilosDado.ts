/**
 * ESTILOS VISUAIS DOS DADOS.
 *
 * O padrão é o `metal` (`ESTILO_PADRAO`). O estilo `atual` é o desenho
 * antigo e NÃO passa por este arquivo: `ArenaDados` desenha ele como
 * sempre desenhou. Aqui moram os estilos novos (`resina`, `vidro`,
 * `metal`), que mudam quatro coisas ao mesmo tempo:
 *
 *   · quina chanfrada (um bisel pequeno em toda aresta e vértice);
 *   · número grande direto na face, sem o disco escuro atrás;
 *   · material físico com um ambiente de reflexo discreto;
 *   · sombra de contato suave + um halo da cor no chão.
 *
 * Nada aqui toca física nem leitura de face: o corpo de colisão e a
 * face lida continuam vindo do sólido ORIGINAL (`buildDieModel`). O
 * bisel é só a malha que se vê.
 */
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type EstiloDado = "atual" | "resina" | "vidro" | "metal";

export const ESTILOS_DADO: { id: EstiloDado; nome: string; resumo: string }[] = [
  { id: "atual", nome: "Clássico", resumo: "Corpo escuro, aresta de 1px, número em disco" },
  { id: "resina", nome: "Resina gravada", resumo: "Resina escura envernizada, número gravado na cor" },
  { id: "vidro", nome: "Vidro HUD", resumo: "Corpo translúcido, aresta de luz, número branco" },
  { id: "metal", nome: "Metal fosco", resumo: "Aço escovado, bisel que pega luz, número na cor" },
];

/** Estilo das rolagens quando nada foi escolhido em `/dev/dados`. */
export const ESTILO_PADRAO: EstiloDado = "metal";

const CHAVE_ESTILO = "rv-dados-estilo";

/** Estilo escolhido no harness (`/dev/dados`). Sem escolha, o padrão. */
export function lerEstiloDado(): EstiloDado {
  if (typeof window === "undefined") return ESTILO_PADRAO;
  try {
    const v = window.localStorage.getItem(CHAVE_ESTILO);
    return ESTILOS_DADO.some((e) => e.id === v) ? (v as EstiloDado) : ESTILO_PADRAO;
  } catch {
    return ESTILO_PADRAO;
  }
}

export function gravarEstiloDado(estilo: EstiloDado) {
  try {
    if (estilo === ESTILO_PADRAO) window.localStorage.removeItem(CHAVE_ESTILO);
    else window.localStorage.setItem(CHAVE_ESTILO, estilo);
  } catch { /* armazenamento indisponível: o estilo vale só nesta página */ }
}

/* ---- faces do sólido original ------------------------------------ */

type Face = {
  valor: number;
  centroide: THREE.Vector3;
  normal: THREE.Vector3;
  /** Vértices únicos, em volta do centróide (ordem angular). */
  vertices: THREE.Vector3[];
  /** Raio do maior círculo que cabe na face. */
  inraio: number;
};

const mesmoPonto = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceToSquared(b) < 1e-6;

function facesDoSolido(geo: THREE.BufferGeometry, sides: number, trisPorFace: number): Face[] {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const total = pos.count / 3 / trisPorFace;
  const faces: Face[] = [];
  for (let f = 0; f < total; f++) {
    const pontos: THREE.Vector3[] = [];
    const centroide = new THREE.Vector3();
    for (let k = 0; k < trisPorFace * 3; k++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, f * trisPorFace * 3 + k);
      centroide.add(p);
      if (!pontos.some((q) => mesmoPonto(q, p))) pontos.push(p);
    }
    centroide.divideScalar(trisPorFace * 3);
    // O centróide dos TRIÂNGULOS pesa vértices repetidos; o da face é a
    // média dos vértices únicos.
    const centro = pontos.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pontos.length);
    const a = new THREE.Vector3().fromBufferAttribute(pos, f * trisPorFace * 3);
    const b = new THREE.Vector3().fromBufferAttribute(pos, f * trisPorFace * 3 + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, f * trisPorFace * 3 + 2);
    const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    if (normal.dot(centro) < 0) normal.negate();

    // Ordena em volta do centro, no plano da face.
    const u = pontos[0].clone().sub(centro).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u);
    const angulo = (p: THREE.Vector3) => {
      const d = p.clone().sub(centro);
      return Math.atan2(d.dot(v), d.dot(u));
    };
    const vertices = [...pontos].sort((p, q) => angulo(p) - angulo(q));

    let inraio = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      const p = vertices[i], q = vertices[(i + 1) % vertices.length];
      const aresta = q.clone().sub(p);
      const t = Math.max(0, Math.min(1, centro.clone().sub(p).dot(aresta) / aresta.lengthSq()));
      inraio = Math.min(inraio, p.clone().addScaledVector(aresta, t).distanceTo(centro));
    }
    faces.push({ valor: sides === 100 ? f * 10 : f + 1, centroide: centro, normal, vertices, inraio });
  }
  return faces;
}

/* ---- bisel -------------------------------------------------------- */

/**
 * Cada face encolhe em direção ao próprio centro, sem sair do plano
 * dela; o casco convexo desses pontos devolve o mesmo sólido com as
 * arestas viradas em faixas e os vértices em pequenas facetas.
 */
function geometriaChanfrada(faces: Face[], quanto: number): THREE.BufferGeometry {
  const pontos: THREE.Vector3[] = [];
  for (const face of faces) {
    for (const p of face.vertices) pontos.push(p.clone().lerp(face.centroide, quanto));
  }
  const casco = new ConvexGeometry(pontos);

  // Dois grupos de material: os triângulos que ficam no plano de uma
  // face original (grupo 0) e os do bisel (grupo 1). É o que deixa o
  // metal ter face fosca e quina polida na mesma peça.
  const pos = casco.attributes.position as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const daFace: number[] = [], doBisel: number[] = [];
  for (let t = 0; t < pos.count / 3; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    (faces.some((f) => f.normal.dot(n) > 0.9995) ? daFace : doBisel).push(t);
  }
  const ordenada = new Float32Array(pos.count * 3);
  [...daFace, ...doBisel].forEach((t, i) => {
    for (let k = 0; k < 9; k++) ordenada[i * 9 + k] = pos.array[t * 9 + k];
  });
  casco.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(ordenada, 3));
  geo.computeVertexNormals(); // não indexada: normal por triângulo, face plana
  geo.addGroup(0, daFace.length * 3, 0);
  geo.addGroup(daFace.length * 3, doBisel.length * 3, 1);
  return geo;
}

/* ---- número ------------------------------------------------------- */

const cacheNumeros = new Map<string, THREE.CanvasTexture>();

/**
 * Algarismo branco com um contorno escuro fino: a COR vem do material
 * (que multiplica a textura), então a mesma textura serve a todo estilo
 * e ao destaque do resultado. O contorno segura a leitura quando a face
 * está clara de luz.
 */
function texturaNumero(texto: string, sublinhar: boolean): THREE.CanvasTexture {
  const chave = `${texto}|${sublinhar ? 1 : 0}`;
  const pronta = cacheNumeros.get(chave);
  if (pronta) return pronta;

  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext("2d")!;
  // `next/font` dá um nome interno à família: resolve a variável antes.
  const raiz = getComputedStyle(document.documentElement);
  const familia = raiz.getPropertyValue("--font-oxanium").trim() || raiz.getPropertyValue("--font-mono").trim();
  const tamanho = texto.length > 1 ? 150 : 190;
  ctx.font = `800 ${tamanho}px ${familia ? `${familia}, ` : ""}sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 14;
  ctx.strokeStyle = "rgba(2,6,12,0.7)";
  ctx.strokeText(texto, 128, 134);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(texto, 128, 134);
  if (sublinhar) {
    const largura = ctx.measureText(texto).width * 0.62;
    ctx.fillRect(128 - largura / 2, 222, largura, 14);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cacheNumeros.set(chave, tex);
  return tex;
}

/* ---- receita de cada estilo --------------------------------------- */

const mistura = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

type Receita = {
  bisel: number;
  material: (accent: string) => THREE.Material;
  /** Material só das quinas; sem ele, o bisel usa o do corpo. */
  materialBisel?: (accent: string) => THREE.Material;
  corNumero: (accent: string) => THREE.Color;
  /** Aresta de luz por cima do corpo (só o vidro). */
  aresta: boolean;
};

const RECEITAS: Record<Exclude<EstiloDado, "atual">, Receita> = {
  resina: {
    bisel: 0.1,
    material: (accent) => new THREE.MeshPhysicalMaterial({
      color: mistura("#070d18", accent, 0.1),
      roughness: 0.5, metalness: 0,
      // Verniz baixo e áspero: face plana com brilho especular forte acende
      // INTEIRA de uma vez, e vira a chapa lavada que se quer evitar.
      clearcoat: 0.35, clearcoatRoughness: 0.6,
      emissive: new THREE.Color(accent), emissiveIntensity: 0.06,
      envMapIntensity: 0.45,
    }),
    corNumero: (accent) => mistura(accent, "#ffffff", 0.3),
    aresta: false,
  },
  vidro: {
    bisel: 0.07,
    material: (accent) => new THREE.MeshPhysicalMaterial({
      color: mistura("#0a1626", accent, 0.42),
      roughness: 0.3, metalness: 0,
      clearcoat: 0.6, clearcoatRoughness: 0.35,
      transparent: true, opacity: 0.46,
      emissive: new THREE.Color(accent), emissiveIntensity: 0.16,
      envMapIntensity: 0.9,
    }),
    corNumero: () => new THREE.Color("#ffffff"),
    aresta: true,
  },
  metal: {
    bisel: 0.13,
    // Face FOSCA e escura: é onde o número mora, e metal polido ali
    // refletiria a sala inteira por trás do algarismo.
    material: (accent) => new THREE.MeshStandardMaterial({
      color: mistura("#1b2129", accent, 0.1),
      roughness: 0.66, metalness: 0.88,
      envMapIntensity: 0.85,
    }),
    // Quina POLIDA e clara: o fio de luz que desenha a peça, como a
    // aresta usinada de uma ferramenta.
    materialBisel: (accent) => new THREE.MeshStandardMaterial({
      color: mistura("#9aa6b6", accent, 0.28),
      roughness: 0.24, metalness: 1,
      envMapIntensity: 1.5,
    }),
    corNumero: (accent) => mistura(accent, "#ffffff", 0.18),
    aresta: false,
  },
};

/* ---- visual de um dado -------------------------------------------- */

export type VisualDado = {
  group: THREE.Group;
  /** Acende a face do resultado e recua as outras. */
  destacar: (valor: number) => void;
  descartar: () => void;
};

export function criarVisualEstilizado(
  geoOriginal: THREE.BufferGeometry,
  sides: number,
  trisPorFace: number,
  accent: string,
  estilo: Exclude<EstiloDado, "atual">,
): VisualDado {
  const receita = RECEITAS[estilo];
  const faces = facesDoSolido(geoOriginal, sides, trisPorFace);
  const group = new THREE.Group();
  const descartaveis: { dispose: () => void }[] = [];

  const geo = geometriaChanfrada(faces, receita.bisel);
  const material = receita.material(accent);
  const materialBisel = receita.materialBisel?.(accent) ?? material;
  const mesh = new THREE.Mesh(geo, [material, materialBisel]);
  mesh.castShadow = true;
  group.add(mesh);
  descartaveis.push(geo, material);
  if (materialBisel !== material) descartaveis.push(materialBisel);

  if (receita.aresta) {
    const arestaGeo = new THREE.EdgesGeometry(geoOriginal, 12);
    const arestaMat = new THREE.LineBasicMaterial({ color: mistura(accent, "#ffffff", 0.35), transparent: true, opacity: 0.9 });
    group.add(new THREE.LineSegments(arestaGeo, arestaMat));
    descartaveis.push(arestaGeo, arestaMat);
  }

  const cor = receita.corNumero(accent);
  const rotulos: { mat: THREE.MeshBasicMaterial; valor: number }[] = [];
  const planoGeo = new THREE.PlaneGeometry(1, 1);
  descartaveis.push(planoGeo);
  // 6 e 9 só se confundem onde os dois existem.
  const ambiguo = (valor: number) => sides >= 10 && sides !== 100 && (valor === 6 || valor === 9);

  const rotular = (valor: number, centro: THREE.Vector3, normal: THREE.Vector3, cima: THREE.Vector3, lado: number) => {
    const mat = new THREE.MeshBasicMaterial({
      // O percentil mostra a dezena com dois dígitos: 00, 10 … 90.
      map: texturaNumero(sides === 100 ? String(valor).padStart(2, "0") : String(valor), ambiguo(valor)), color: cor.clone(),
      transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false,
    });
    const plano = new THREE.Mesh(planoGeo, mat);
    plano.scale.setScalar(lado);
    const eixoY = cima.clone().addScaledVector(normal, -cima.dot(normal)).normalize();
    const eixoX = new THREE.Vector3().crossVectors(eixoY, normal);
    plano.position.copy(centro).addScaledVector(normal, 0.012);
    plano.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(eixoX, eixoY, normal));
    group.add(plano);
    rotulos.push({ mat, valor });
    descartaveis.push(mat);
  };

  if (sides === 4) {
    // Numerado nos vértices, como o d4 físico: cada canto mostra o
    // número da face OPOSTA a ele (ver `addD4VertexLabels`).
    faces.forEach((face, f) => {
      for (const vertice of face.vertices) {
        const oposta = faces.findIndex((outra, g) => g !== f && !outra.vertices.some((p) => mesmoPonto(p, vertice)));
        rotular(oposta + 1, face.centroide.clone().lerp(vertice, 0.46), face.normal, vertice.clone().sub(face.centroide), face.inraio * 0.86);
      }
    });
  } else {
    for (const face of faces) {
      // O topo do algarismo aponta para o vértice mais distante (a ponta
      // do triângulo ou da pipa); no quadrado, para o meio de um lado —
      // senão o número sairia na diagonal.
      const distancias = face.vertices.map((p) => p.distanceTo(face.centroide));
      const quadrado = face.vertices.length === 4 && Math.max(...distancias) - Math.min(...distancias) < 1e-3;
      const cima = quadrado
        ? face.vertices[0].clone().add(face.vertices[1]).multiplyScalar(0.5).sub(face.centroide)
        : face.vertices[distancias.indexOf(Math.max(...distancias))].clone().sub(face.centroide);
      const lado = face.inraio * (quadrado ? 1.35 : face.vertices.length === 3 ? 1.6 : face.vertices.length === 5 ? 1.3 : 1.5);
      rotular(face.valor, face.centroide, face.normal, cima, lado);
    }
  }

  return {
    group,
    destacar: (valor) => {
      for (const { mat, valor: v } of rotulos) {
        if (v === valor) mat.color.set("#ffffff");
        else mat.opacity = 0.3;
      }
    },
    descartar: () => descartaveis.forEach((d) => d.dispose()),
  };
}

/* ---- luz, ambiente e sombra --------------------------------------- */

export type CenarioEstilizado = {
  /** Reajusta a área de sombra ao tamanho da arena. */
  ajustar: (metadeX: number, metadeZ: number) => void;
  descartar: () => void;
};

export function montarCenarioEstilizado(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  accent: string,
): CenarioEstilizado {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const sala = new RoomEnvironment();
  // Bem desfocado: a sala nítida tem painéis de luz que estouravam em
  // branco a face que calhasse de refleti-los. Borrado, vira um degradê.
  const ambiente = pmrem.fromScene(sala, 0.9);
  scene.environment = ambiente.texture;
  // A câmera olha quase de cima: sem girar o ambiente, a face do topo
  // refletiria direto os painéis de luz do teto da sala e sairia lavada
  // — o mesmo defeito do desenho atual por outro caminho.
  scene.environmentRotation.set(Math.PI * 0.42, 0.6, 0);
  scene.environmentIntensity = 0.38;

  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  // Luz principal BRANCA e mais de cima: a colorida, forte, era o que
  // chapava a face de cima numa cor só. A cor entra pela luz de recorte.
  const principal = new THREE.DirectionalLight(0xffffff, 1.35);
  principal.position.set(-5, 20, -7);
  principal.castShadow = true;
  principal.shadow.mapSize.set(2048, 2048);
  principal.shadow.radius = 5;
  principal.shadow.bias = -0.0004;
  principal.shadow.normalBias = 0.03;
  principal.shadow.camera.near = 0.5;
  principal.shadow.camera.far = 60;
  scene.add(principal);
  const recorte = new THREE.DirectionalLight(accent, 0.9);
  recorte.position.set(6, 4, 5);
  scene.add(recorte);

  return {
    ajustar: (metadeX, metadeZ) => {
      const m = Math.max(metadeX, metadeZ) * 1.15 + 2;
      const cam = principal.shadow.camera;
      cam.left = -m; cam.right = m; cam.top = m; cam.bottom = -m;
      cam.updateProjectionMatrix();
    },
    descartar: () => {
      ambiente.dispose();
      pmrem.dispose();
      sala.dispose();
    },
  };
}

/* ---- halo de cor no chão ------------------------------------------ */

let texturaHalo: THREE.CanvasTexture | null = null;

function texturaDoHalo(): THREE.CanvasTexture {
  if (texturaHalo) return texturaHalo;
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.32)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  texturaHalo = new THREE.CanvasTexture(cv);
  return texturaHalo;
}

export type HaloDado = {
  mesh: THREE.Mesh;
  /** Segue o dado no chão; some conforme ele sobe. */
  seguir: (x: number, y: number, z: number) => void;
  descartar: () => void;
};

export function criarHalo(accent: string, diametro: number): HaloDado {
  const geo = new THREE.PlaneGeometry(diametro, diametro);
  const mat = new THREE.MeshBasicMaterial({
    map: texturaDoHalo(), color: new THREE.Color(accent),
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  return {
    mesh,
    seguir: (x, y, z) => {
      mesh.position.x = x; mesh.position.z = z;
      mat.opacity = 0.3 * Math.max(0, Math.min(1, 1 - (y - 1) / 3.2));
    },
    descartar: () => { geo.dispose(); mat.dispose(); },
  };
}
