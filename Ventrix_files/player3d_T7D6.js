import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const stage = document.getElementById("playerStage");
const canvas3d = document.getElementById("player3d");
const canvas2d = document.getElementById("esp2d");
if (!stage || !canvas3d || !canvas2d) throw new Error("player stage missing");

const ctx = canvas2d.getContext("2d");
const pageVisual = document.getElementById("page-visual");

const preview = {
  box: true,
  skeleton: true,
  name: true,
  health: true,
  distance: true,
  kd: false,
  rank: false,
  prestige: false,
  platform: false,
  input: false,
  teamid: false,
  thick: 2,
  skelTh: 2,
  iconSize: 20,
  fontMain: 14,
  fontSmall: 11,
  boxStyle: 1,
  vis: "visible"
};

// Posiciones de cada bloque del ESP (slots 0..7). La web las guarda aquí y el
// C++ las actualiza vía state.esppos*. El preview 3D las replica en tiempo real.
// Sólo inicializa si aún no existe (command.js puede haber setloaded el estado).
window.espPositions = window.espPositions || { name: 1, dist: 0, info: 0, icons: 1, health: 2 };
window.espOffx = window.espOffx || { icons: 0, name: 0, dist: 0, info: 0 };
// Color del nombre (llega desde C++ vía state.coltext).
window.espColors = window.espColors || { name: "#ffffff", text: "#ffffff", textSmall: "#cfcfd4", visible: "#3b82f6", hidden: "#ef4444", outline: "#111111" };

const JOINTS = [
  { p: [0, 1, 170], parent: -1 },
  { p: [0, 5, 155], parent: 0 },
  { p: [26, 10, 148], parent: 1 },
  { p: [-26, 10, 148], parent: 1 },
  { p: [33, 11, 120], parent: 2 },
  { p: [-33, 11, 120], parent: 3 },
  { p: [48, -5, 95], parent: 4 },
  { p: [-48, -5, 95], parent: 5 },
  { p: [0, 2, 100], parent: 1 },
  { p: [15, 1, 90], parent: 8 },
  { p: [-15, 1, 90], parent: 8 },
  { p: [17, 3, 50], parent: 9 },
  { p: [-17, 3, 50], parent: 10 },
  { p: [20, 8, 5], parent: 11 },
  { p: [-20, 8, 5], parent: 12 }
];

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40);
const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

// El fondo del escenario sigue el TONO del accent de Settings (misma
// claridad y saturacion que el 0x454556 original): asi el preview nunca
// queda azul cuando el menu es de otro color. setAccent() avisa por el
// evento vtxaccent cada vez que cambia el color.
const STAGE_S = 0.111, STAGE_L = 0.304;   // HSL de 0x454556
function tintHue() {
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tint-h"));
  return isFinite(n) ? n : 240;
}
function hslHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const seg = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return "#" + seg.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
function applyStageTint() {
  const col = new THREE.Color(hslHex(tintHue(), STAGE_S, STAGE_L));
  scene.background = col;
  renderer.setClearColor(col, 1);
}
applyStageTint();
window.addEventListener("vtxaccent", applyStageTint);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(3, 5, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0x6e84ff, 0.5);
fill.position.set(-4, 2, -3);
scene.add(fill);

const previewRoot = new THREE.Group();
scene.add(previewRoot);

const skelGroup = new THREE.Group();
previewRoot.add(skelGroup);

const tmp = new THREE.Vector3();
const corners = [];
let modelSize = new THREE.Vector3(1, 1, 1);
let modelScale = 1;
let jointsWorld = [];

const CAM0 = new THREE.Vector3(0.72, 0.02, 3.55);
const target = new THREE.Vector3(0, -0.01, 0);
const spherical = new THREE.Spherical().setFromVector3(CAM0.clone().sub(target));
const SPHERE0 = spherical.clone();
const MIN_DIST = 3.4;
const MAX_DIST = 5.0;
const MIN_PHI = 0.4;
const MAX_PHI = Math.PI - 0.4;

const orbit = { dragging: false, lastX: 0, lastY: 0 };

// Rectángulos de cada bloque del ESP arrastrable (en coordenadas del stage).
// Se recalcula en cada drawEsp() y se usa para el hit-testing del arrastre.
const hitBoxes = [];
// Estado del arrastre de un bloque ESP (null = sin arrastre).
let drag = null;

// Mapeos para sincronizar los <select> de posición y el comando hacia el C++.
const ESP_SELECT = {
  name: "espPosName", dist: "espPosDist", info: "espPosInfo",
  icons: "espPosIcons", health: "espPosHealth"
};
const ESP_CMD = {
  name: "espposname", dist: "espposdist", info: "espposinfo",
  icons: "espposicons", health: "espposhealth"
};

// Mapeos de ORDEN (posición arriba/abajo dentro del mismo slot)
const ESP_ORDER_CMD = {
  name: "espposordern", dist: "espposorderd", info: "espposorderi", icons: "espposorderc"
};
const ESP_ORDER_SEL = {
  name: "espPosOrderName", dist: "espPosOrderDist", info: "espPosOrderInfo", icons: "espPosOrderIcons"
};
const BLOCK_KEYS = ["icons", "name", "dist", "info"];
const BLOCK_DEF_SLOT = { name: 1, dist: 0, info: 0, icons: 1, health: 2 };

// Mapeos de desplazamiento horizontal (mover el bloque dentro de su misma línea).
const ESP_OFFX_CMD = {
  name: "offxname", dist: "offxdist", info: "offxinfo", icons: "offxicons"
};
const ESP_OFFX_MAX = 300;   // mismo rango que usa el C++

// --- Iconos reales de plataforma / input (assets/ingame) ---
const ICON_PATHS = {
  steam: "assets/ingame/steam.png",
  battlenet: "assets/ingame/battlenet.png",
  xbox: "assets/ingame/xbox.png",
  playstation: "assets/ingame/playstation.png",
  keyboard: "assets/ingame/keyboard.png",
  gamepad: "assets/ingame/gamepad.png"
};
const iconCache = {};
function loadIcon(name) {
  if (!iconCache[name]) {
    const img = new Image();
    img.src = ICON_PATHS[name];
    iconCache[name] = img;
  }
  return iconCache[name];
}

function resize() {
  const w = stage.clientWidth || 1;
  const h = stage.clientHeight || 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  canvas2d.width = w * pr;
  canvas2d.height = h * pr;
  canvas2d.style.width = w + "px";
  canvas2d.style.height = h + "px";
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
}

function project(vec) {
  tmp.copy(vec).project(camera);
  return {
    x: (tmp.x * 0.5 + 0.5) * stage.clientWidth,
    y: (-tmp.y * 0.5 + 0.5) * stage.clientHeight
  };
}

function mapJoints(size) {
  const xs = JOINTS.map((j) => Math.abs(j.p[0]));
  const ys = JOINTS.map((j) => j.p[1]);
  const zs = JOINTS.map((j) => j.p[2]);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const yMid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xMax = Math.max(...xs) || 1;
  const o = 0.84 * size.y / (zMax - zMin || 1);
  const l = -o;
  const u = size.x / 2 * 0.92 / xMax;
  return JOINTS.map((j) => {
    const [x, y, z] = j.p;
    return new THREE.Vector3(
      x * u,
      -0.46 * size.y + (z - zMin) * o,
      (y - yMid) * l
    );
  });
}

function buildSkeleton(size, thickness, color) {
  skelGroup.clear();
  const pts = mapJoints(size);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color || 0xffffff),
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  skelMat = mat;
  const th = (thickness == null) ? 2 : thickness;
  const radius = 0.005 * size.y * (th / 2.0);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  JOINTS.forEach((j, i) => {
    if (j.parent < 0) return;
    const a = pts[j.parent];
    const b = pts[i];
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-5) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    mesh.renderOrder = 20;
    skelGroup.add(mesh);
  });
  jointsWorld = pts;
}

// material del esqueleto (para recolorear sin reconstruir) + estilo aplicado
let skelMat = null;
let skelThApplied = -1;
let skelColorApplied = null;

function visColor() {
  const c = window.espColors || {};
  return preview.vis === "visible"
    ? (c.visible || "#3b82f6")
    : (c.hidden || "#ef4444");
}

// actualiza grosor/color del esqueleto (reconstruye solo si cambió)
function applySkel() {
  if (!skelGroup || skelGroup.children.length === 0) return;
  const th = preview.skelTh || 2;
  const col = visColor();
  if (th !== skelThApplied || col !== skelColorApplied) {
    skelThApplied = th;
    skelColorApplied = col;
    buildSkeleton(modelSize, th, col);
  }
}

// aristas del volumen 3D (índices de corners[0..7])
const BOX_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

// caja según boxStyle: 0=corner, 1=2D, 2=3D (wireframe del volumen)
function drawBox(b, style, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, preview.thick);
  if (style === 0) {
    const cl = Math.max(6, Math.min(b.w, b.h) * 0.22);
    ctx.beginPath();
    const segs = [
      [b.x, b.y + cl, b.x, b.y, b.x + cl, b.y],
      [b.x + b.w - cl, b.y, b.x + b.w, b.y, b.x + b.w, b.y + cl],
      [b.x, b.y + b.h - cl, b.x, b.y + b.h, b.x + cl, b.y + b.h],
      [b.x + b.w - cl, b.y + b.h, b.x + b.w, b.y + b.h, b.x + b.w, b.y + b.h - cl]
    ];
    for (const s of segs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.lineTo(s[4], s[5]); }
    ctx.stroke();
  } else if (style === 2 && corners.length >= 8) {
    const p = corners.map((c) => project(c));
    ctx.beginPath();
    for (const e of BOX_EDGES) { ctx.moveTo(p[e[0]].x, p[e[0]].y); ctx.lineTo(p[e[1]].x, p[e[1]].y); }
    ctx.stroke();
  } else {
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
}

function loadDirectModel() {
  const loader = new GLTFLoader();
  loader.load("assets/models/direct.glb", (gltf) => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    modelScale = 1.62 / (size.y || 1);
    modelSize.copy(size);
    previewRoot.scale.setScalar(modelScale);
    model.position.copy(center).multiplyScalar(-1);
    model.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = false;
        n.receiveShadow = false;
      }
    });
    previewRoot.add(model);
    buildSkeleton(size);

    const hx = size.x * modelScale / 2;
    const hy = size.y * modelScale / 2;
    const hz = size.z * modelScale / 2;
    corners.length = 0;
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1])
          corners.push(new THREE.Vector3(x * hx, y * hy, z * hz));
  });
}

function figureBox() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  corners.forEach((c) => {
    const p = project(c);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// El preview es POR PESTANA: muestra siempre la config de la pestana que estas
// viendo (General / Objetivos / Amigos), que son tres configs distintas del
// usuario. Activar algo en General NO debe verse en el preview de
// Objetivos/Amigos, ni al reves.
// ---------------------------------------------------------------------------
const PREVIEW_TABS = ["players", "targets", "friends"];
// Claves que el preview sabe dibujar: son las que llevan data-preview y las tres
// pestanas tienen el mismo juego, asi que al limpiarlas en cada frame nunca
// queda un valor heredado de la pestana anterior.
const PREVIEW_KEYS = ["box", "skeleton", "name", "distance", "health",
  "kd", "rank", "prestige", "platform", "input", "teamid"];

function activeEspTab() {
  for (const k of PREVIEW_TABS) {
    const p = document.getElementById("esp-pane-" + k);
    if (p && p.classList.contains("on")) return k;
  }
  return "players";
}
window.activeEspTab = activeEspTab;

function readPreview() {
  for (const k of PREVIEW_KEYS) preview[k] = false;
  const pane = document.getElementById("esp-pane-" + activeEspTab());
  (pane || pageVisual).querySelectorAll("[data-preview]").forEach((btn) => {
    preview[btn.dataset.preview] = btn.classList.contains("on");
  });
  const thick = document.getElementById("espThick");
  if (thick) preview.thick = Number(thick.value) || 2;
  const skel = document.getElementById("skelThick");
  if (skel) preview.skelTh = Number(skel.value) || 2;
  const ic = document.getElementById("iconSizeRange");
  if (ic) preview.iconSize = Number(ic.value) || 20;
  const fm = document.getElementById("fontSizeRange");
  if (fm) preview.fontMain = Number(fm.value) || 14;
  const fs = document.getElementById("fontSmallRange");
  if (fs) preview.fontSmall = Number(fs.value) || 11;
  const bs = document.getElementById("boxStyleSel");
  if (bs) preview.boxStyle = bs.selectedIndex;
  const vis = document.querySelector("[data-vis].on");
  preview.vis = vis ? vis.dataset.vis : "visible";
  skelGroup.visible = preview.skeleton;
}

function espPos(key, def) {
  const p = window.espPositions || {};
  const v = p[key];
  return v == null ? def : (Number(v) || 0);
}

// Devuelve la posición {x,y} de un bloque según su slot (0..7).
function slotXY(slot, box, textW, textH) {
  switch (slot) {
    case 0: return { x: box.x + box.w / 2, y: box.y + box.h + 18 };
    case 1: return { x: box.x + box.w / 2, y: box.y - 10 };
    case 2: return { x: box.x - 10, y: box.y + box.h / 2 };
    case 3: return { x: box.x + box.w + 10, y: box.y + box.h / 2 };
    case 4: return { x: box.x - 10, y: box.y - 10 };
    case 5: return { x: box.x + box.w + 10, y: box.y - 10 };
    case 6: return { x: box.x - 10, y: box.y + box.h + 10 };
    case 7: return { x: box.x + box.w + 10, y: box.y + box.h + 10 };
    default: return { x: box.x + box.w / 2, y: box.y + box.h + 18 };
  }
}

// Alineación de texto según el slot. Cada bloque queda SIEMPRE FUERA de la
// caja: el borde que mira hacia la caja es el ancla y el texto crece hacia
// afuera. (laterales: right=texto termina a la izq. de la caja, left=empieza
// a la der.; esquinas combinan horizontal + vertical hacia afuera.)
function slotStyle(slot) {
  switch (slot) {
    case 0: return { align: "center", base: "top" };       // bottom
    case 1: return { align: "center", base: "bottom" };    // top
    case 2: return { align: "right", base: "middle" };     // left (centrado)
    case 3: return { align: "left", base: "middle" };      // right (centrado)
    case 4: return { align: "right", base: "top" };        // topleft (bajo la esquina)
    case 5: return { align: "left", base: "top" };         // topright (bajo la esquina)
    case 6: return { align: "right", base: "bottom" };     // botleft (sobre el borde)
    case 7: return { align: "left", base: "bottom" };      // botright (sobre el borde)
    default: return { align: "center", base: "top" };
  }
}

// Rectángulo (con padding) de un bloque de texto/iconos anclado a un slot.
function blockRect(box, slot, textW, textH) {
  const p = slotXY(slot, box, 0, 0);
  const st = slotStyle(slot);
  let x;
  if (st.align === "left") x = p.x;
  else if (st.align === "right") x = p.x - textW;
  else x = p.x - textW / 2;
  let y;
  if (st.base === "middle") y = p.y - textH / 2;
  else if (st.base === "top") y = p.y;
  else y = p.y - textH; // bottom / alphabetic
  const pad = 6;
  return { x: x - pad, y: y - pad, w: textW + pad * 2, h: textH + pad * 2 };
}

// Devuelve el slot (0..7) cuyo punto de ancla está más cerca del cursor.
function nearestSlot(box, cx, cy, currentSlot) {
  const margin = 80;
  if (cx < box.x - margin || cx > box.x + box.w + margin ||
      cy < box.y - margin || cy > box.y + box.h + margin) {
    return currentSlot;
  }
  let best = currentSlot;
  let bestDist = Infinity;
  for (let s = 0; s <= 7; s++) {
    const p = slotXY(s, box, 0, 0);
    const dx = cx - p.x;
    const dy = cy - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

// Aplica un slot a un bloque: actualiza window.espPositions, el <select> y el C++.
function setEspSlot(key, slot) {
  window.espPositions = window.espPositions || {};
  window.espPositions[key] = slot;
  const sel = document.getElementById(ESP_SELECT[key]);
  if (sel) {
    sel.value = String(slot);
    sel.selectedIndex = Number(slot) || 0;
  }
  if (typeof nativeSend === "function") nativeSend(ESP_CMD[key] + "|" + slot);
}

function drawEsp() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  ctx.clearRect(0, 0, w, h);
  hitBoxes.length = 0;
  if (!corners.length) return;

  const b = figureBox();
  const boxColor = visColor();
  const hpColor = "#22c55e";                 // la barra de vida NO cambia con invisible
  const espCol = window.espColors || {};
  const nameColor = (espCol.text || espCol.name) || "#ffffff";
  const distColor = espCol.textSmall || "#cfcfd4";

  const GAP = 6;      // separación entre bloques apilados
  const HB_TH = 5;    // grosor de la barra de vida
  const PAD = 6;      // padding de hitbox
  const EASE = 0.22;  // factor de interpolación (animación al arrastrar)

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (preview.box) drawBox(b, preview.boxStyle, boxColor);

  if (!window.__espAnimPos) window.__espAnimPos = {};
  const animPos = window.__espAnimPos;

  // --- barra de vida: tamaño completo; reserva hueco para el texto ---
  const hslot = espPos("health", 2);
  const healthTop    = hslot === 1 || hslot === 4 || hslot === 5;
  const healthBottom = hslot === 0 || hslot === 6 || hslot === 7;
  const healthSide   = hslot === 2 || hslot === 3;
  const topClear = healthTop    ? (HB_TH + GAP) : 0;
  const botClear = healthBottom ? (HB_TH + GAP) : 0;
  const sideClear= healthSide   ? (HB_TH + GAP) : 0;

  // --- orden de apilado: cuál va arriba/cuál abajo al compartir slot ---
  if (!window.espOrder) window.espOrder = { icons: 0, name: 1, dist: 2, info: 3 };
  const order = window.espOrder;

  // --- x del bloque (borde que mira a la caja) ---
  const slotX = (slot, bw) => {
    if (slot === 0 || slot === 1) return b.x + b.w / 2 - bw / 2;             // center
    if (slot === 2 || slot === 4 || slot === 6) return (b.x - 10 - sideClear) - bw; // izquierda
    if (slot === 3 || slot === 5 || slot === 7) return b.x + b.w + 10 + sideClear;  // derecha
    return b.x + b.w / 2 - bw / 2;
  };

  // --- recolectar bloques (iconos + nombre + distancia + info) ---
  const iconSize = preview.iconSize || 20, iconGap = 4;
  const fName = "600 " + (preview.fontMain || 14) + "px Poppins, sans-serif";
  const fSmall = "500 " + (preview.fontSmall || 11) + "px Poppins, sans-serif";
  let iconCount = 0;
  if (preview.platform) iconCount++;
  if (preview.input) iconCount++;
  const blocks = [];
  if (iconCount) blocks.push({ key: "icons", slot: espPos("icons", 1), text: "", font: "", color: "", w: iconCount * iconSize + (iconCount - 1) * iconGap, h: iconSize, order: (order.icons != null ? order.icons : 0), special: "icons" });
  if (preview.name) {
    ctx.font = fName;
    blocks.push({ key: "name", slot: espPos("name", 1), text: "Username", font: fName, color: nameColor, w: ctx.measureText("Username").width, h: (preview.fontMain || 14) + 2, order: (order.name != null ? order.name : 1), special: "name" });
  }
  if (preview.distance) {
    ctx.font = fSmall;
    blocks.push({ key: "dist", slot: espPos("dist", 0), text: "123m", font: fSmall, color: distColor, w: ctx.measureText("123m").width, h: (preview.fontSmall || 11) + 1, order: (order.dist != null ? order.dist : 2) });
  }
  const infoParts = [];
  if (preview.kd) infoParts.push("KD: 1.5");
  if (preview.rank) infoParts.push("Rank: Oro 2");
  if (preview.prestige) infoParts.push("Prest: 3");
  if (infoParts.length) {
    ctx.font = fSmall;
    const t = infoParts.join(" | ");
    blocks.push({ key: "info", slot: espPos("info", 0), text: t, font: fSmall, color: distColor, w: ctx.measureText(t).width, h: (preview.fontSmall || 11) + 1, order: (order.info != null ? order.info : 3) });
  }

  // --- layout por slot y "order": bloques con el MISMO order van en la MISMA
  // línea (uno al lado del otro); order distintos se apilan. ---
  const bySlot = {};
  for (const bl of blocks) (bySlot[bl.slot] = bySlot[bl.slot] || []).push(bl);
  const placed = {};
  const ROW_GAP = 6;
  for (const s in bySlot) {
    const slot = Number(s);
    const list = bySlot[slot];
    const st = slotStyle(slot);
    const edge = 6;

    // Agrupar por order (línea). Mismo order = misma fila.
    const rowsMap = new Map();
    for (const bl of list) {
      const o = (bl.order != null) ? bl.order : 0;
      if (!rowsMap.has(o)) rowsMap.set(o, []);
      rowsMap.get(o).push(bl);
    }
    const rowOrders = Array.from(rowsMap.keys()).sort((a, b) => a - b);
    const rows = rowOrders.map((o) => rowsMap.get(o));
    const totalH = rows.reduce((acc, row, i) => acc + Math.max(...row.map((bl) => bl.h)) + (i > 0 ? GAP : 0), 0);

    const isTop = slot === 1;
    const isBottom = slot === 0;
    const isSide = slot === 2 || slot === 3;
    const isTopCorner = slot === 4 || slot === 5;

    let ty;
    let dir = 1; // 1 = hacia abajo, -1 = hacia arriba
    if (isTop) { ty = b.y - 8 - topClear; dir = -1; }
    else if (isBottom) { ty = b.y + b.h + 8 + botClear; dir = 1; }
    else if (isSide) { ty = b.y + b.h / 2 - totalH / 2; dir = 1; }
    else if (isTopCorner) { ty = b.y + edge; dir = 1; }
    else { ty = b.y + b.h - edge; dir = -1; } // esquinas inferiores

    rows.forEach((row) => {
      const rowH = Math.max(...row.map((bl) => bl.h));
      const rowW = row.reduce((a, bl) => a + bl.w, 0) + ROW_GAP * (row.length - 1);
      let rx;
      if (slot === 0 || slot === 1) rx = b.x + b.w / 2 - rowW / 2;                          // center
      else if (slot === 2 || slot === 4 || slot === 6) rx = (b.x - 10 - sideClear) - rowW;  // izquierda
      else rx = b.x + b.w + 10 + sideClear;                                                  // derecha

      let y0;
      if (dir < 0) { ty -= rowH; y0 = ty; }
      else y0 = ty;

      let bx = rx;
      for (const bl of row) {
        placed[bl.key] = { tx: bx, ty: y0, st, w: bl.w, h: bl.h, slot };
        bx += bl.w + ROW_GAP;
      }
      if (dir < 0) ty -= GAP;
      else ty += rowH + GAP;
    });
  }

  // --- dibujar con easing ---
  const anchorFrom = (tl, bw, bh, st) => {
    let x;
    if (st.align === "left") x = tl.x;
    else if (st.align === "right") x = tl.x + bw;
    else x = tl.x + bw / 2;
    let y;
    if (st.base === "middle") y = tl.y + bh / 2;
    else if (st.base === "top") y = tl.y;
    else y = tl.y + bh;
    return { x, y };
  };
  const drawIcon = (name, x, y, dw, dh) => {
    const img = loadIcon(name);
    if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, x, y, dw, dh);
    else { ctx.fillStyle = name === "steam" ? "#3b82f6" : "#22c55e"; ctx.fillRect(x, y, dw, dh); }
  };
  const drawBlock = (bl) => {
    const t = placed[bl.key];
    if (!t) return;
    const a = animPos[bl.key] || (animPos[bl.key] = { x: t.tx, y: t.ty });
    a.x += (t.tx - a.x) * EASE;
    a.y += (t.ty - a.y) * EASE;
    const anchor = anchorFrom(a, t.w, t.h, t.st);
    // Desplazamiento X del bloque (Dash: "X offset") — se mueve en su misma línea
    const offx = (window.espOffx && window.espOffx[bl.key]) || 0;
    anchor.x += offx;

    if (bl.special === "icons") {
      let x = anchor.x;
      if (t.st.align === "right") x -= t.w;
      else if (t.st.align === "center") x -= t.w / 2;
      let y = anchor.y;
      if (t.st.base === "middle") y -= t.h / 2;
      else if (t.st.base === "bottom") y -= t.h;
      hitBoxes.push({ key: "icons", slot: bl.slot, x: a.x + offx - PAD, y: a.y - PAD, w: t.w + PAD * 2, h: t.h + PAD * 2 });
      if (preview.platform) { drawIcon("steam", x, y, iconSize, iconSize); x += iconSize + iconGap; }
      if (preview.input)    { drawIcon("keyboard", x, y, iconSize, iconSize); }
      return;
    }

    ctx.font = bl.font;
    ctx.fillStyle = bl.color;
    ctx.textAlign = t.st.align;
    ctx.textBaseline = t.st.base;
    ctx.fillText(bl.text, anchor.x, anchor.y);
    hitBoxes.push({ key: bl.key, slot: bl.slot, x: a.x + offx - PAD, y: a.y - PAD, w: t.w + PAD * 2, h: t.h + PAD * 2 });
    if (bl.special === "name" && preview.teamid) {
      ctx.font = "500 " + Math.max(8, (preview.fontSmall || 11) - 2) + "px Poppins, sans-serif";
      ctx.fillStyle = distColor;
      const tx = t.st.align === "right" ? anchor.x - t.w - 6
               : t.st.align === "left" ? anchor.x + t.w + 6
               : anchor.x + t.w / 2 + 6;
      ctx.textAlign = t.st.align === "center" ? "left" : t.st.align;
      ctx.fillText("T:3", tx, anchor.y);
    }
  };
  const drawHealth = () => {
    const slot = espPos("health", 2);
    let bw, bh, rx, ry;
    if (slot === 2 || slot === 3) {               // vertical: alto completo
      bw = HB_TH; bh = b.h;
      rx = slot === 2 ? b.x - HB_TH - 4 : b.x + b.w + 4;
      ry = b.y;
    } else if (slot === 1 || slot === 4 || slot === 5) {  // top: ancho completo
      bw = b.w; bh = HB_TH;
      rx = b.x; ry = b.y - HB_TH - 4;
    } else {                                       // bottom: ancho completo
      bw = b.w; bh = HB_TH;
      rx = b.x; ry = b.y + b.h + 4;
    }
    ctx.fillStyle = hpColor;
    const a = animPos["health"] || (animPos["health"] = { x: rx, y: ry, bw, bh });
    a.x += (rx - a.x) * EASE;
    a.y += (ry - a.y) * EASE;
    a.bw += (bw - a.bw) * EASE;
    a.bh += (bh - a.bh) * EASE;
    ctx.fillRect(a.x, a.y, a.bw, a.bh);
    hitBoxes.push({ key: "health", slot, x: a.x - PAD, y: a.y - PAD, w: a.bw + PAD * 2, h: a.bh + PAD * 2 });
  };

  for (const bl of blocks) drawBlock(bl);   // icons, name, dist, info
  if (preview.health) drawHealth();
}

function updateCamera() {
  camera.position.setFromSpherical(spherical).add(target);
  camera.lookAt(target);
}

let running = false;

function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  updateCamera();
  renderer.render(scene, camera);
  readPreview();
  applySkel();
  drawEsp();
}

function startLoop() {
  if (running) return;
  window.__espAnimPos = {}; // reinicia la animación de bloques al entrar a Visuales
  running = true;
  resize();
  tick();
}

function stopLoop() {
  running = false;
}

function resetOrbit() {
  spherical.copy(SPHERE0);
}

function orbitDown(ev) {
  if (ev.button !== 0 && ev.pointerType !== "touch") return;
  if (ev.target.closest && ev.target.closest(".stage-bar")) return;
  const rect = stage.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  const hit = hitBoxes.find((hb) =>
    mx >= hb.x && mx <= hb.x + hb.w && my >= hb.y && my <= hb.y + hb.h
  );
  if (hit) {
    // Arrastrar un bloque del ESP (no orbita la cámara)
    drag = { key: hit.key, box: figureBox(), moved: false, slotChanged: false, horiz: false, offxChanged: false, sx: mx, sy: my, cy: my };
    stage.classList.add("grabbing");
    try { if (ev.pointerId != null) stage.setPointerCapture(ev.pointerId); } catch (_) {}
    ev.preventDefault();
    return;
  }
  orbit.dragging = true;
  orbit.lastX = ev.clientX;
  orbit.lastY = ev.clientY;
  stage.classList.add("grabbing");
  try { if (ev.pointerId != null) stage.setPointerCapture(ev.pointerId); } catch (_) {}
  ev.preventDefault();
}
function orbitMove(ev) {
  if (drag) {
    const rect = stage.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    drag.cy = cy;
    const dx = cx - drag.sx;
    const dy = cy - drag.sy;
    if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) drag.moved = true;

    // Shift + arrastre = X offset (ajuste fino en la misma línea).
    // Sin Shift = mover el bloque a la ranura más cercana (laterales incluidas).
    if (ev.shiftKey) {
      drag.horiz = true;
      const val = Math.max(-ESP_OFFX_MAX, Math.min(ESP_OFFX_MAX, Math.round(dx)));
      window.espOffx = window.espOffx || { icons: 0, name: 0, dist: 0, info: 0 };
      window.espOffx[drag.key] = val;
      drag.offxChanged = true;
      // Enviar al C++ en vivo (throttle ~80ms) para verlo en el juego mientras arrastrás
      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (!drag.lastSend || now - drag.lastSend > 80) {
        drag.lastSend = now;
        const cmd = ESP_OFFX_CMD[drag.key];
        if (cmd && typeof nativeSend === "function") nativeSend(cmd + "|" + val);
      }
      return;
    }
    drag.horiz = false;

    const cur = espPos(drag.key, BLOCK_DEF_SLOT[drag.key] || 0);
    const slot = nearestSlot(drag.box, cx, cy, cur);
    if (cur !== slot) {
      window.espPositions = window.espPositions || {};
      window.espPositions[drag.key] = slot;
      drag.slotChanged = true;
    }
    return;
  }
  if (!orbit.dragging) return;
  const dx = ev.clientX - orbit.lastX;
  const dy = ev.clientY - orbit.lastY;
  if (!dx && !dy) return;
  orbit.lastX = ev.clientX;
  orbit.lastY = ev.clientY;
  spherical.theta -= dx * 0.012;
  spherical.phi = Math.max(MIN_PHI, Math.min(MAX_PHI, spherical.phi - dy * 0.012));
}

// Reordena un bloque dentro de su slot según dónde se soltó (arriba/abajo).
function reorderOnDrop(key, slot, cy) {
  if (!window.espOrder) window.espOrder = { icons: 0, name: 1, dist: 2, info: 3 };
  const others = BLOCK_KEYS.filter((k) => k !== key && espPos(k, BLOCK_DEF_SLOT[k] || 0) === slot);
  if (!others.length) return;
  // desc = el bloque más pegado a la caja tiene el y más grande (top pleno y esquinas inferiores)
  const descSlot = slot === 1 || slot === 6 || slot === 7;
  const items = others.map((k) => {
    const hb = hitBoxes.find((x) => x.key === k);
    return { k, yc: hb ? hb.y + hb.h / 2 : 0 };
  });
  items.push({ k: key, yc: cy });
  items.sort((a, b) => (descSlot ? b.yc - a.yc : a.yc - b.yc));
  let changed = false;
  items.forEach((it, i) => {
    if ((window.espOrder[it.k] || 0) !== i) { window.espOrder[it.k] = i; changed = true; }
  });
  if (!changed) return;
  items.forEach((it) => {
    if (typeof nativeSend === "function") nativeSend(ESP_ORDER_CMD[it.k] + "|" + window.espOrder[it.k]);
    const sel = document.getElementById(ESP_ORDER_SEL[it.k]);
    if (sel) sel.value = String(window.espOrder[it.k]);
  });
}

function orbitUp(ev) {
  if (drag) {
    const d = drag;
    drag = null;
    stage.classList.remove("grabbing");
    try { if (ev && ev.pointerId != null) stage.releasePointerCapture(ev.pointerId); } catch (_) {}
    if (d.slotChanged) setEspSlot(d.key, window.espPositions[d.key]);
    if (d.offxChanged) {
      // Enviar el X offset final al C++ (los sliders ya no existen: el preview
      // es el que mueve la posición del bloque).
      const cmd = ESP_OFFX_CMD[d.key];
      const val = (window.espOffx && window.espOffx[d.key]) || 0;
      if (cmd && typeof nativeSend === "function") nativeSend(cmd + "|" + val);
    }
    // Reordenar dentro del mismo slot según la altura donde se soltó: así se
    // puede poner, por ejemplo, el nombre abajo y los iconos encima.
    if (d.moved && !d.horiz) reorderOnDrop(d.key, espPos(d.key, BLOCK_DEF_SLOT[d.key] || 0), d.cy);
    return;
  }
  if (!orbit.dragging) return;
  orbit.dragging = false;
  stage.classList.remove("grabbing");
  try { if (ev && ev.pointerId != null) stage.releasePointerCapture(ev.pointerId); } catch (_) {}
}

stage.addEventListener("pointerdown", orbitDown);
window.addEventListener("pointermove", orbitMove);
window.addEventListener("pointerup", orbitUp);
window.addEventListener("pointercancel", orbitUp);
stage.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  spherical.radius += ev.deltaY * 0.004;
  spherical.radius = Math.max(MIN_DIST, Math.min(MAX_DIST, spherical.radius));
}, { passive: false });

const resetBtn = document.getElementById("resetLayout");
if (resetBtn) resetBtn.onclick = () => {
  if (typeof resetOrbit === "function") resetOrbit();
  // Reset del layout ESP: slots por defecto y X offsets a 0 (el preview manda).
  window.espPositions = { name: 1, dist: 0, info: 0, icons: 1, health: 2 };
  window.espOffx = { icons: 0, name: 0, dist: 0, info: 0 };
  if (typeof nativeSend === "function") {
    Object.keys(ESP_CMD).forEach((k) => nativeSend(ESP_CMD[k] + "|" + window.espPositions[k]));
    Object.keys(ESP_OFFX_CMD).forEach((k) => nativeSend(ESP_OFFX_CMD[k] + "|0"));
  }
  Object.keys(ESP_SELECT).forEach((k) => {
    const el = document.getElementById(ESP_SELECT[k]);
    if (el) el.value = String(window.espPositions[k]);
  });
};

document.querySelectorAll("[data-vis]").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("[data-vis]").forEach((other) => other.classList.remove("on"));
    btn.classList.add("on");
  };
});

// Los colores del preview son POR PESTANA (window.espColorsByTab los rellena
// command.js con el state del C++): se aplican los de la pestana activa.
if (typeof window.applyEspPreviewColors === "function") window.applyEspPreviewColors();

new ResizeObserver(resize).observe(stage);

const navObs = new MutationObserver(() => {
  if (pageVisual && pageVisual.classList.contains("active")) startLoop();
  else stopLoop();
});
if (pageVisual) navObs.observe(pageVisual, { attributes: true, attributeFilter: ["class"] });

loadDirectModel();
updateCamera();
resize();
startLoop();
