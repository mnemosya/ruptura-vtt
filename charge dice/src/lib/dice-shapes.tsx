/* ================================================================== */
/*  Polyhedral dice                                                     */
/*  - rolling=true  → Die3D: Three.js WebGL with face numbers          */
/*  - static/landed → PolyDie SVG flat icon                            */
/* ================================================================== */

import { useEffect, useRef } from "react";
import * as THREE from "three";

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

/* ---- 3D spinning die (WebGL) ------------------------------------ */

export function Die3D({
  sides,
  accent = "#45b8c9",
  size = 46,
  rollIndex = 0,
  scale = 3,
}: {
  sides: number;
  accent?: string;
  size?: number;
  rollIndex?: number;
  scale?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderSize = Math.round(size * scale);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(renderSize, renderSize);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 3.2);

    /* dramatic lighting — low ambient, strong directional */
    scene.add(new THREE.AmbientLight(0xffffff, 0.06));
    const keyLight = new THREE.DirectionalLight(accent, 5.0);
    keyLight.position.set(3, 4, 3);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(accent, 1.0);
    rimLight.position.set(-3, -2, -1);
    scene.add(rimLight);

    const geo = makeGeo(sides);

    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color("#070e1a"),
      emissive: new THREE.Color(accent),
      emissiveIntensity: 0.05,
      specular: new THREE.Color(accent),
      shininess: 100,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const edgeGeo = new THREE.EdgesGeometry(geo, 12);
    const edges = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: new THREE.Color(accent) }),
    );

    const group = new THREE.Group();
    group.add(mesh);
    group.add(edges);

    /* face number labels */
    addFaceLabels(geo, group, sides, accent);

    scene.add(group);

    const rx = 1.3 + (rollIndex % 3) * 0.7;
    const ry = 2.0 + (rollIndex % 5) * 0.5;
    const rz = 0.7 + (rollIndex % 4) * 0.4;

    let raf: number;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      group.rotation.x += dt * rx;
      group.rotation.y += dt * ry;
      group.rotation.z += dt * rz;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      geo.dispose();
      edgeGeo.dispose();
      mat.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sides, accent, renderSize, rollIndex]);

  const offset = (renderSize - size) / 2;
  return (
    <div style={{ width: size, height: size, flexShrink: 0, position: "relative", overflow: "visible" }}>
      <div
        ref={containerRef}
        title={`d${sides}`}
        style={{
          position: "absolute",
          top: -offset,
          left: -offset,
          width: renderSize,
          height: renderSize,
          zIndex: 20,
          pointerEvents: "none",
        }}
      />
    </div>
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
