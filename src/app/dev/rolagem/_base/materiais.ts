/**
 * MATERIAIS DOS DADOS — cópia estendida de `_dados3d/estilosDado.ts`.
 *
 * O original pinta TODOS os dados de uma rolagem com um acento só e não
 * tem luz própria. Aqui cada dado traz a sua `Aparencia`: corpo (metal,
 * aço, vidro, brasa), tinta, cor do algarismo, LUZ animável (emissivo +
 * aura + halo no chão) e ajustes de física. É o que deixa o Dado Normal
 * e o Dado de Sobrecarga caírem juntos sendo coisas diferentes.
 *
 * Mudanças em relação ao original (para o porte):
 *   · receitas `aco` e `brasa` novas; `metal` e `vidro` iguais às de lá;
 *   · `valorDaFace` — os rótulos aceitam uma permutação, para o modo
 *     forçado da bancada (a face que vai ficar pra cima recebe o número
 *     pedido ANTES do lançamento; nada troca depois que assenta);
 *   · luz própria (`definirLuz`) e números esmaecíveis (`definirNumeros`);
 *   · aura (sprite aditivo) e o ambiente em cache por renderer.
 */
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type Corpo = "metal" | "aco" | "vidro" | "brasa";

export interface Aparencia {
  corpo: Corpo;
  /** Tinta do material (face e quina). */
  acento: string;
  /** Cor do algarismo. Sem ela, a da receita. */
  numero?: string;
  /**
   * Luz própria, 0–1, animada pela arena: `lancamento` é o brilho na
   * saída da mão (escalado pela força), `repouso` o de quando assenta,
   * `respiracao` (Hz) faz a luz pulsar devagar enquanto o dado fica na mesa.
   */
  luz?: { cor: string; repouso: number; lancamento: number; respiracao?: number };
  /** Halo no chão (sem luz própria). */
  halo?: { cor: string; forca: number };
  fisica?: {
    /** Massa relativa (1 = igual ao dado padrão). */
    massa?: number;
    /** Multiplicador do giro inicial. */
    giro?: number;
    /** Soma à restituição (quique) contra a mesa. */
    quique?: number;
    /** Multiplicador do amortecimento (linear e angular). */
    amortecimento?: number;
  };
}

/* ---- faces do sólido original (cópia de `facesDoSolido`) ---------- */

type Face = {
  indice: number;
  centroide: THREE.Vector3;
  normal: THREE.Vector3;
  vertices: THREE.Vector3[];
  inraio: number;
};

const mesmoPonto = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceToSquared(b) < 1e-6;

function facesDoSolido(geo: THREE.BufferGeometry, trisPorFace: number): Face[] {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const total = pos.count / 3 / trisPorFace;
  const faces: Face[] = [];
  for (let f = 0; f < total; f++) {
    const pontos: THREE.Vector3[] = [];
    for (let k = 0; k < trisPorFace * 3; k++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, f * trisPorFace * 3 + k);
      if (!pontos.some((q) => mesmoPonto(q, p))) pontos.push(p);
    }
    const centro = pontos.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pontos.length);
    const a = new THREE.Vector3().fromBufferAttribute(pos, f * trisPorFace * 3);
    const b = new THREE.Vector3().fromBufferAttribute(pos, f * trisPorFace * 3 + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, f * trisPorFace * 3 + 2);
    const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    if (normal.dot(centro) < 0) normal.negate();
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
    faces.push({ indice: f, centroide: centro, normal, vertices, inraio });
  }
  return faces;
}

/* ---- bisel (cópia de `geometriaChanfrada`) ------------------------ */

function geometriaChanfrada(faces: Face[], quanto: number): THREE.BufferGeometry {
  const pontos: THREE.Vector3[] = [];
  for (const face of faces) for (const p of face.vertices) pontos.push(p.clone().lerp(face.centroide, quanto));
  const casco = new ConvexGeometry(pontos);
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
  geo.computeVertexNormals();
  geo.addGroup(0, daFace.length * 3, 0);
  geo.addGroup(daFace.length * 3, doBisel.length * 3, 1);
  return geo;
}

/* ---- algarismo (cópia de `texturaNumero`) ------------------------- */

const cacheNumeros = new Map<string, THREE.CanvasTexture>();

function texturaNumero(texto: string, sublinhar: boolean): THREE.CanvasTexture {
  const chave = `${texto}|${sublinhar ? 1 : 0}`;
  const pronta = cacheNumeros.get(chave);
  if (pronta) return pronta;
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext("2d")!;
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

/* ---- receitas ------------------------------------------------------ */

const mistura = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

type Materiais = {
  face: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  bisel: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  corNumero: THREE.Color;
  bisel_t: number;
  aresta: THREE.LineBasicMaterial | null;
  /** Como a luz própria (0–1) entra no material. */
  aplicarLuz: (i: number) => void;
};

function receita(ap: Aparencia): Materiais {
  const luzCor = new THREE.Color(ap.luz?.cor ?? ap.acento);
  switch (ap.corpo) {
    case "vidro": {
      // Igual ao `vidro` de `estilosDado`, com o emissivo virando luz.
      const face = new THREE.MeshPhysicalMaterial({
        color: mistura("#0a1626", ap.acento, 0.42),
        roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.35,
        transparent: true, opacity: 0.5,
        emissive: luzCor, emissiveIntensity: 0.16,
        envMapIntensity: 0.9,
      });
      const aresta = new THREE.LineBasicMaterial({ color: mistura(ap.luz?.cor ?? ap.acento, "#ffffff", 0.35), transparent: true, opacity: 0.9 });
      const base = aresta.color.clone();
      return {
        face, bisel: face, aresta, bisel_t: 0.07,
        corNumero: new THREE.Color(ap.numero ?? "#ffffff"),
        aplicarLuz: (i) => {
          face.emissiveIntensity = 0.16 + i * 1.1;
          face.opacity = 0.5 + i * 0.18;
          aresta.color.copy(base).lerp(new THREE.Color("#ffffff"), Math.min(1, i * 0.6));
        },
      };
    }
    case "brasa": {
      // Aço enfumaçado com a quina em brasa: a luz mora no BISEL, que é
      // por onde o conduto aquecido "vaza"; a face, onde o número mora,
      // fica escura para o algarismo seguir legível.
      const face = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#17120f"), roughness: 0.6, metalness: 0.75,
        emissive: luzCor, emissiveIntensity: 0.05, envMapIntensity: 0.7,
      });
      const bisel = new THREE.MeshStandardMaterial({
        color: mistura("#3b2a1f", ap.acento, 0.2), roughness: 0.3, metalness: 0.9,
        emissive: luzCor, emissiveIntensity: 0.3, envMapIntensity: 1.2,
      });
      return {
        face, bisel, aresta: null, bisel_t: 0.14,
        corNumero: new THREE.Color(ap.numero ?? mistura(ap.acento, "#ffffff", 0.45).getStyle()),
        aplicarLuz: (i) => {
          face.emissiveIntensity = 0.04 + i * 0.22;
          bisel.emissiveIntensity = 0.22 + i * 1.6;
        },
      };
    }
    case "aco": {
      // Aço sem tinta: a peça de "capacidade própria", sem luz e sem cor.
      const face = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#22282f"), roughness: 0.62, metalness: 0.9, envMapIntensity: 0.85,
      });
      const bisel = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#b3bdc8"), roughness: 0.26, metalness: 1, envMapIntensity: 1.45,
      });
      return {
        face, bisel, aresta: null, bisel_t: 0.13,
        corNumero: new THREE.Color(ap.numero ?? "#e3edf3"),
        aplicarLuz: (i) => { bisel.emissive = luzCor; bisel.emissiveIntensity = i * 0.8; },
      };
    }
    case "metal":
    default: {
      // Igual ao `metal` de `estilosDado` (o padrão do VTT hoje).
      const face = new THREE.MeshStandardMaterial({
        color: mistura("#1b2129", ap.acento, 0.1), roughness: 0.66, metalness: 0.88, envMapIntensity: 0.85,
      });
      const bisel = new THREE.MeshStandardMaterial({
        color: mistura("#9aa6b6", ap.acento, 0.28), roughness: 0.24, metalness: 1, envMapIntensity: 1.5,
      });
      return {
        face, bisel, aresta: null, bisel_t: 0.13,
        corNumero: new THREE.Color(ap.numero ?? mistura(ap.acento, "#ffffff", 0.18).getStyle()),
        aplicarLuz: (i) => { bisel.emissive = luzCor; bisel.emissiveIntensity = i * 0.9; },
      };
    }
  }
}

/* ---- visual de um dado ------------------------------------------- */

export type VisualDado = {
  group: THREE.Group;
  /** Luz própria, 0–1. */
  definirLuz: (i: number) => void;
  /** Opacidade dos algarismos; `destaque` acende um valor e recua os outros. */
  definirNumeros: (opacidade: number, destaque?: number | null) => void;
  descartar: () => void;
};

export function criarVisualDado(
  geoOriginal: THREE.BufferGeometry,
  lados: number,
  trisPorFace: number,
  ap: Aparencia,
  /** Valor escrito em cada face (índice da face → número). */
  valorDaFace: (indice: number) => number,
): VisualDado {
  const m = receita(ap);
  const faces = facesDoSolido(geoOriginal, trisPorFace);
  const group = new THREE.Group();
  const descartaveis: { dispose: () => void }[] = [];

  const geo = geometriaChanfrada(faces, m.bisel_t);
  const mesh = new THREE.Mesh(geo, [m.face, m.bisel]);
  mesh.castShadow = true;
  group.add(mesh);
  descartaveis.push(geo, m.face);
  if (m.bisel !== m.face) descartaveis.push(m.bisel);

  if (m.aresta) {
    const arestaGeo = new THREE.EdgesGeometry(geoOriginal, 12);
    group.add(new THREE.LineSegments(arestaGeo, m.aresta));
    descartaveis.push(arestaGeo, m.aresta);
  }

  const rotulos: { mat: THREE.MeshBasicMaterial; valor: number }[] = [];
  const planoGeo = new THREE.PlaneGeometry(1, 1);
  descartaveis.push(planoGeo);
  const ambiguo = (valor: number) => lados >= 10 && lados !== 100 && (valor === 6 || valor === 9);

  const rotular = (valor: number, centro: THREE.Vector3, normal: THREE.Vector3, cima: THREE.Vector3, lado: number) => {
    const mat = new THREE.MeshBasicMaterial({
      map: texturaNumero(lados === 100 ? String(valor).padStart(2, "0") : String(valor), ambiguo(valor)),
      color: m.corNumero.clone(),
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

  if (lados === 4) {
    faces.forEach((face, f) => {
      for (const vertice of face.vertices) {
        const oposta = faces.findIndex((outra, g) => g !== f && !outra.vertices.some((p) => mesmoPonto(p, vertice)));
        rotular(valorDaFace(oposta), face.centroide.clone().lerp(vertice, 0.46), face.normal, vertice.clone().sub(face.centroide), face.inraio * 0.86);
      }
    });
  } else {
    for (const face of faces) {
      const distancias = face.vertices.map((p) => p.distanceTo(face.centroide));
      const quadrado = face.vertices.length === 4 && Math.max(...distancias) - Math.min(...distancias) < 1e-3;
      const cima = quadrado
        ? face.vertices[0].clone().add(face.vertices[1]).multiplyScalar(0.5).sub(face.centroide)
        : face.vertices[distancias.indexOf(Math.max(...distancias))].clone().sub(face.centroide);
      const lado = face.inraio * (quadrado ? 1.35 : face.vertices.length === 3 ? 1.6 : face.vertices.length === 5 ? 1.3 : 1.5);
      rotular(valorDaFace(face.indice), face.centroide, face.normal, cima, lado);
    }
  }

  const corBase = m.corNumero.clone();
  return {
    group,
    definirLuz: (i) => m.aplicarLuz(Math.max(0, Math.min(1.4, i))),
    definirNumeros: (opacidade, destaque) => {
      for (const { mat, valor } of rotulos) {
        if (destaque != null && valor === destaque) {
          mat.color.set("#ffffff");
          mat.opacity = opacidade;
        } else {
          mat.color.copy(corBase);
          mat.opacity = destaque != null ? opacidade * 0.3 : opacidade;
        }
      }
    },
    descartar: () => descartaveis.forEach((d) => d.dispose()),
  };
}

/* ---- aura (brilho em volta do dado) -------------------------------- */

let texturaRadial: THREE.CanvasTexture | null = null;

function radial(): THREE.CanvasTexture {
  if (texturaRadial) return texturaRadial;
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.32)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  texturaRadial = new THREE.CanvasTexture(cv);
  return texturaRadial;
}

export type Aura = { sprite: THREE.Sprite; definir: (i: number) => void; descartar: () => void };

/** Sprite aditivo voltado pra câmera: o "bloom" barato da luz própria. */
export function criarAura(cor: string, diametro: number): Aura {
  const mat = new THREE.SpriteMaterial({
    map: radial(), color: new THREE.Color(cor), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(diametro);
  sprite.renderOrder = -1;
  return {
    sprite,
    definir: (i) => { mat.opacity = Math.max(0, Math.min(1, i)) * 0.62; },
    descartar: () => mat.dispose(),
  };
}

/* ---- halo no chão (cópia de `criarHalo`, com força variável) ------ */

export type Halo = { mesh: THREE.Mesh; seguir: (x: number, y: number, z: number, forca: number) => void; descartar: () => void };

export function criarHalo(cor: string, diametro: number): Halo {
  const geo = new THREE.PlaneGeometry(diametro, diametro);
  const mat = new THREE.MeshBasicMaterial({
    map: radial(), color: new THREE.Color(cor), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  return {
    mesh,
    seguir: (x, y, z, forca) => {
      mesh.position.x = x; mesh.position.z = z;
      mat.opacity = forca * Math.max(0, Math.min(1, 1 - (y - 1) / 3.2));
    },
    descartar: () => { geo.dispose(); mat.dispose(); },
  };
}

/* ---- luz, ambiente e sombra (cópia de `montarCenarioEstilizado`) -- */

/**
 * O ambiente (PMREM da sala) custava um quadro inteiro a cada rolagem.
 * Aqui ele fica em cache por renderer — a arena desta pasta reaproveita
 * o renderer entre rolagens (ver `ArenaDupla`).
 */
const cacheAmbiente = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export function montarCenario(renderer: THREE.WebGLRenderer, scene: THREE.Scene, corRecorte: string) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  let ambiente = cacheAmbiente.get(renderer);
  if (!ambiente) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const sala = new RoomEnvironment();
    ambiente = pmrem.fromScene(sala, 0.9).texture;
    sala.dispose();
    pmrem.dispose();
    cacheAmbiente.set(renderer, ambiente);
  }
  scene.environment = ambiente;
  scene.environmentRotation.set(Math.PI * 0.42, 0.6, 0);
  scene.environmentIntensity = 0.38;

  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
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
  const recorte = new THREE.DirectionalLight(corRecorte, 0.9);
  recorte.position.set(6, 4, 5);
  scene.add(recorte);
  return {
    ajustar: (metadeX: number, metadeZ: number) => {
      const lado = Math.max(metadeX, metadeZ) * 1.15 + 2;
      const cam = principal.shadow.camera;
      cam.left = -lado; cam.right = lado; cam.top = lado; cam.bottom = -lado;
      cam.updateProjectionMatrix();
    },
  };
}
