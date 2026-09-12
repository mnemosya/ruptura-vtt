/* ================================================================== */
/*  Polyhedral dice                                                     */
/*  - rolling/landed → PhysicsDiceArena: Three.js + cannon-es          */
/*  - static          → PolyDie SVG flat icon                          */
/* ================================================================== */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";

/* ---- triangles per face (non-indexed geometry) ------------------- */
const TRIS_PER_FACE: Record<number, number> = {
  4: 1,   // tetrahedron: 4 tri faces
  6: 2,   // box: 2 tris per quad face
  8: 1,   // octahedron: 8 tri faces
  10: 2,  // custom d10: 2 tris per kite face
  12: 3,  // dodecahedron: 3 tris per pentagon face
  20: 1,  // icosahedron: 20 tri faces
};

/* ---- canvas texture with face number ----------------------------- */
function makeFaceLabel(n: number, accent: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.fillStyle = accent;
  ctx.font = 'bold 60px "JetBrains Mono", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 64, 66);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

/* ---- place number planes on each face ---------------------------- */
function addFaceLabels(
  geo: THREE.BufferGeometry,
  parent: THREE.Group,
  sides: number,
  accent: string,
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

    const texture = makeFaceLabel(f + 1, accent);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
    plane.position.copy(centroid).addScaledVector(normal, 0.06);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    parent.add(plane);
  }
}

/* ---- Three.js geometry per die type ----------------------------- */

function createD10(): THREE.BufferGeometry {
  const n = 5;
  const r = 0.82, upperY = 0.28, lowerY = -0.28, topY = 0.98, botY = -0.98;
  const upper = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new THREE.Vector3(r * Math.cos(a), upperY, r * Math.sin(a));
  });
  const lower = Array.from({ length: n }, (_, i) => {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    return new THREE.Vector3(r * Math.cos(a), lowerY, r * Math.sin(a));
  });
  const top = new THREE.Vector3(0, topY, 0);
  const bot = new THREE.Vector3(0, botY, 0);
  const v: number[] = [];
  const push = (p: THREE.Vector3) => v.push(p.x, p.y, p.z);
  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    push(top); push(upper[i]);  push(lower[i]);
    push(top); push(lower[i]);  push(upper[ni]);
    push(bot); push(lower[i]);  push(upper[ni]);
    push(bot); push(upper[ni]); push(lower[ni]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeGeo(sides: number): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  switch (sides) {
    case 4:  geo = new THREE.TetrahedronGeometry(0.85, 0); break;
    case 6:  geo = new THREE.BoxGeometry(1.1, 1.1, 1.1); break;
    case 8:  geo = new THREE.OctahedronGeometry(0.9, 0); break;
    case 10: geo = createD10(); break;
    case 12: geo = new THREE.DodecahedronGeometry(0.82, 0); break;
    case 20:
    default: geo = new THREE.IcosahedronGeometry(0.88, 0); break;
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

export function buildDieModel(sides: number): DieModel {
  const geo = makeGeo(sides);
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
    faces.push({ value: f + 1, normal });
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

export function PhysicsDiceArena({
  dice,
  rollToken,
  onSettled,
  accent = "#45b8c9",
  height = 170,
  className,
}: {
  dice: PhysicsDieSpec[];
  rollToken: number;
  onSettled: (results: PhysicsDieResult[]) => void;
  accent?: string;
  height?: number;
  className?: string;
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

    const columns = Math.max(2, Math.ceil(Math.sqrt(dice.length)));
    const rows = Math.max(1, Math.ceil(dice.length / columns));
    const arenaHalfX = Math.max(3.2, columns * 0.92);
    const arenaHalfZ = Math.max(2.25, Math.ceil(dice.length / columns) * 0.9);
    camera.position.set(0, arenaHalfZ * 4.1, arenaHalfZ * 2.8);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
    const keyLight = new THREE.DirectionalLight(accent, 4.2);
    keyLight.position.set(4, 8, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(-4, 3, -2);
    scene.add(rimLight);

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#07101d"),
      roughness: 0.88,
      metalness: 0.08,
    });
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(arenaHalfX * 2, arenaHalfZ * 2),
      floorMaterial,
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const grid = new THREE.GridHelper(
      Math.max(arenaHalfX, arenaHalfZ) * 2,
      12,
      new THREE.Color(accent),
      new THREE.Color(accent),
    );
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.13;
    });
    grid.position.y = 0.006;
    scene.add(grid);

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

    const addWall = (x: number, z: number, halfX: number, halfZ: number) => {
      const wall = new CANNON.Body({ mass: 0, material: trayMaterial });
      wall.addShape(new CANNON.Box(new CANNON.Vec3(halfX, 6, halfZ)));
      wall.position.set(x, 5.5, z);
      world.addBody(wall);
    };
    addWall(-arenaHalfX - 0.12, 0, 0.12, arenaHalfZ);
    addWall(arenaHalfX + 0.12, 0, 0.12, arenaHalfZ);
    addWall(0, -arenaHalfZ - 0.12, arenaHalfX, 0.12);
    addWall(0, arenaHalfZ + 0.12, arenaHalfX, 0.12);

    const physicalDice = dice.map((die, index) => {
      const model = buildDieModel(die.sides);
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
      addFaceLabels(model.geo, group, die.sides, accent);
      scene.add(group);

      const body = new CANNON.Body({
        mass: 1,
        material: diceMaterial,
        linearDamping: 0.13,
        angularDamping: 0.12,
        allowSleep: true,
        sleepSpeedLimit: 0.14,
        sleepTimeLimit: 0.55,
      });
      body.addShape(model.shape);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const xStep = (arenaHalfX * 1.45) / Math.max(columns - 1, 1);
      const zStep = (arenaHalfZ * 1.18) / Math.max(rows - 1, 1);
      body.position.set(
        columns === 1 ? 0 : -arenaHalfX * 0.72 + column * xStep + randomBetween(-0.18, 0.18),
        3.1 + row * 0.45 + randomBetween(0, 1.2),
        rows === 1 ? 0 : -arenaHalfZ * 0.59 + row * zStep + randomBetween(-0.2, 0.2),
      );
      body.quaternion.setFromEuler(
        randomBetween(0, Math.PI * 2),
        randomBetween(0, Math.PI * 2),
        randomBetween(0, Math.PI * 2),
      );
      body.velocity.set(randomBetween(-2.4, 2.4), randomBetween(1.4, 3.6), randomBetween(1.2, 4.0));
      body.angularVelocity.set(
        randomBetween(-13, 13),
        randomBetween(-13, 13),
        randomBetween(-13, 13),
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
  }, [accent, diceSignature, height, rollToken]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="physics-dice-arena"
      style={{ width: "100%", height, position: "relative", overflow: "hidden" }}
    />
  );
}

/* ---- SVG flat icon (static + landed states) --------------------- */

type Shape = { outer: React.ReactNode; facets: React.ReactNode; ty: number };

function shapeFor(sides: number): Shape {
  switch (sides) {
    case 4:
      return {
        outer: <polygon points="50,10 91,84 9,84" />,
        facets: <polygon points="31,49 69,49 50,84" fill="none" />,
        ty: 66,
      };
    case 6:
      return {
        outer: <rect x="21" y="21" width="58" height="58" rx="7" />,
        facets: <rect x="34" y="34" width="32" height="32" rx="3" fill="none" />,
        ty: 52,
      };
    case 8:
      return {
        outer: <polygon points="50,6 86,50 50,94 14,50" />,
        facets: <path d="M14 50 H86 M50 6 L36 50 L50 94 M50 6 L64 50 L50 94" fill="none" />,
        ty: 51,
      };
    case 10:
      return {
        outer: <polygon points="50,6 86,42 50,94 14,42" />,
        facets: <path d="M14 42 H86 M50 6 L34 42 L50 58 L66 42 M50 58 L50 94" fill="none" />,
        ty: 40,
      };
    case 12:
      return {
        outer: <polygon points="50,6 90,37 73,89 27,89 10,37" />,
        facets: (
          <>
            <polygon points="50,30 70,44 63,70 37,70 30,44" fill="none" />
            <path d="M50 6 L50 30 M90 37 L70 44 M73 89 L63 70 M27 89 L37 70 M10 37 L30 44" fill="none" />
          </>
        ),
        ty: 55,
      };
    case 20:
    default:
      return {
        outer: <polygon points="50,5 88,27 88,73 50,95 12,73 12,27" />,
        facets: (
          <>
            <polygon points="50,30 76,70 24,70" fill="none" />
            <path d="M50 30 L50 5 M76 70 L88 73 M24 70 L12 73 M50 95 L76 70 M50 95 L24 70 M88 27 L50 30 M12 27 L50 30" fill="none" />
          </>
        ),
        ty: 57,
      };
  }
}

export function PolyDie({
  sides,
  value,
  active = false,
  dim = false,
  landed = false,
  rollIndex = 0,
  accent = "#45b8c9",
  soft = "rgba(69,184,201,0.14)",
  size = 40,
  label,
}: {
  sides: number;
  value?: number | string;
  active?: boolean;
  dim?: boolean;
  landed?: boolean;
  rollIndex?: number;
  accent?: string;
  soft?: string;
  size?: number;
  label?: string;
}) {
  const s = shapeFor(sides);
  const stroke = active ? accent : dim ? "#2a3b58" : "#43597c";
  const fill = active ? soft : "transparent";
  const textColor = active ? accent : dim ? "#42597c" : "#a9b9d4";
  const landAnim = landed ? { animationDelay: `${Math.min(rollIndex, 6) * 0.04}s` } : undefined;
  /* default face value = max face (sides number) */
  const displayValue = value ?? sides;

  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      className={landed ? "rup-land" : undefined}
      style={{
        ...landAnim,
        filter: active ? `drop-shadow(0 0 5px ${accent}aa)` : undefined,
        display: "block",
      }}
    >
      <g fill={fill} stroke={stroke} strokeWidth={4.5} strokeLinejoin="round">{s.outer}</g>
      <g fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.45}>{s.facets}</g>
      <text x="50" y={s.ty} textAnchor="middle" dominantBaseline="central" fontFamily="'JetBrains Mono', monospace" fontSize="30" fontWeight="700" fill={textColor}>
        {displayValue}
      </text>
      {label && (
        <text x="50" y="99" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="14" fontWeight="700" fill={stroke} opacity="0.9">
          {label}
        </text>
      )}
    </svg>
  );
}
