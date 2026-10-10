/* ============================================================================
 * command.js — puente de comandos UI <-> backend (WebView2)
 *
 * Cada control del menú lleva `data-cmd="nombre"`. Protocolo:
 *   UI  -> backend : "cmd"        (acción sin valor)
 *   UI  -> backend : "cmd|valor"  (check 0/1 · rango · select · color · texto · tecla)
 *   backend -> UI  : { type:"state", ...campos }   → restaura el estado
 *   backend -> UI  : { type:"sharelink", value }   → actualiza el link compartido
 *
 * LISTA DE COMANDOS ENVIADOS
 * ----------------------------------------------------------------------------
 * SETTINGS        vsync|0/1  hidemouse|0/1  mirrormouse|0/1  debug|0/1
 *                 fps|N  overlay|N  monitor|N  menukey|TECLA
 *                 accent|#rrggbb  fontname|TEXTO  notipos|N
 * ESP             esp|0/1  espteam|0/1  box|0/1  skeleton|0/1  contorno|0/1
 *                 rank|0/1  prestige|0/1  snapline|0/1  offscreen|0/1
 *                 platform|0/1  input|0/1  teamid|0/1  rainbow|0/1
 *                 boxstyle|N  snappos|N  maxdist|N  espthick|N  skelthick|N
 *                 fontsize|N  fontsmall|N  outline|0/1  outlineth|N
 *                 colvis|#rrggbb  colhid|#rrggbb  coldown|#rrggbb
 *                 coltext|#rrggbb  coltextsm|#rrggbb  coloutline|#rrggbb
 * AIMBOT          aimbot|0/1  aimkey1|TECLA  aimkey2|TECLA  bones|CSV
 *                 visibleonly|0/1  ignoredown|0/1  aimlock|0/1
 *                 priority|0..3  smooth|1.0..100.0 (valor RAW)  bezier|0..100
 *                 aimfov|N  aimrange|N  switchdelay|N  aiminterval|N  deadzone|N
 *                 drawfov|0/1  fovrainbow|0/1  fovcolor|#rrggbb  crosshair|0/1
 *                 crosssize|N  drawdead|0/1
 * AIMBOT OBJ/AM   taimbot|0/1  tbones|CSV  tvisibleonly|0/1
 *                 tignoredown|0/1  taimlock|0/1  tpriority|0..3
 *                 tsmooth|1.0..100.0  taimfov|N  taimrange|N  tswitchdelay|N
 *                 taiminterval|N  tdeadzone|N  (y lo mismo con f* para amigos)
 * APUNT. CERCANO  closeaim|0/1  cdist|1..200  csmooth|1.0..100.0  cfov|N
 *                 cdeadzone|0..180  cbones|CSV
 * OVERRIDE        ovkey|TECLA  ovvis|0/1  ovsmooth|1.0..100.0  ovfov|N
 *                 ovdeadzone|0..180  ovbones|CSV
 * ESP POS         espposname|N  espposdist|N  espposinfo|N  espposicons|N
 *                 espposhealth|N  espposorderd|N  espposorderi|N ... offxname|N
 *                 OJO: el dash NO tiene controles para estos. Los manda SOLO el
 *                 preview 3D (player3d.js) al arrastrar un bloque de slot
 *                 (esppos...), al soltarlo en otra linea (espposorder...) o al
 *                 arrastrar en horizontal con Shift (offx...), y al pulsar
 *                 "Reset layout". El estado (state.esppos... , state.offx...) se
 *                 lee igual en setState() para alimentar el propio preview.
 * ESP CATEGORIA   namesenabled|0/1  namestargetcolor|#rrggbb
 *                 namesfriendcolor|#rrggbb
 * TRIGGERBOT      trig|0/1  trigteam|0/1  trigspec|0/1  trigauto|0/1
 * RADAR           radar|0/1  radnorainbow|0/1  radnoteam|0/1
 *                 radvis|#rrggbb  radhid|#rrggbb  radadv|0/1  radmini|0/1
 *                 radbg|0/1  radbgcol|#rrggbb  radx|N  rady|N  radw|N  radh|N
 *                 mpmode|0/1
 * SHARED RADAR    sharelink   (pide el link)
 *                 copylink    (copia el link al portapapeles)
 *                 sharerate|N  sharetoggle
 * DEBUG / HW      testmove  testclick  kmip|TEXTO  kmport|TEXTO
 *                 kmuuid|TEXTO  kmconnect
 * SALIDA          quit  (cierre limpio: apaga todo y cierra la app)
 * ========================================================================== */

function nativeSend(cmd) {
  if (window.chrome && chrome.webview && chrome.webview.postMessage) {
    chrome.webview.postMessage(cmd);
  }
}

// Popup de confirmación de salida (en vez del confirm nativo del navegador).
function openQuitModal() {
  const m = document.getElementById("quitModal");
  if (m) m.hidden = false;
}
function closeQuitModal() {
  const m = document.getElementById("quitModal");
  if (m) m.hidden = true;
}
function wireQuitModal() {
  const cancel = document.getElementById("quitCancel");
  const confirmBtn = document.getElementById("quitConfirmBtn");
  const overlay = document.getElementById("quitModal");
  if (cancel) cancel.addEventListener("click", closeQuitModal);
  if (confirmBtn) confirmBtn.addEventListener("click", () => { closeQuitModal(); nativeSend("quit"); });
  if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) closeQuitModal(); });
}

function setCheck(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle("on", !!value);
  }
}

function updateDeviceStatus(device) {
  const el = document.getElementById('deviceStatus');
  if (!el) return;
  if (device === 'makcu' || device === 'kmbox') {
    el.style.display = 'inline-flex';
    el.className = 'device-status';
    if (device === 'makcu') {
      el.classList.add('connected-makcu');
      el.textContent = 'MAKCU';
    } else {
      el.classList.add('connected-kmbox');
      el.textContent = 'KMBox';
    }
  } else {
    el.style.display = 'none';
  }
}

function setKmStatus(msg, ok, pending) {
  const el = document.getElementById("kmStatusText");
  if (!el) return;
  el.textContent = msg ? String(msg) : "";
  el.className = "km-status" + (pending ? " pending" : (ok ? " ok" : " err"));
}

// ---------------------------------------------------------------------------
// Helpers de restauración de estado
// ---------------------------------------------------------------------------

const CHECK_IDS = {
  vsync: "vsyncCheck",
  hidemouse: "hideMouseCheck",
  mirrormouse: "mirrorMouseCheck",
  debug: "debugCheck",
  esp: "espCheck",
  espteam: "espTeamCheck",
  box: "boxCheck",
  skeleton: "skelCheck",
  contorno: "contornoCheck",
  name: "nameCheck",
  distance: "distCheck",
  health: "healthCheck",
  kd: "kdCheck",
  rank: "rankCheck",
  prestige: "prestigeCheck",
  snapline: "snapCheck",
  offscreen: "offCheck",
  platform: "platCheck",
  input: "inputCheck",
  espclan: "espClanCheck",
  supportcontroller: "supCtrlMakcuCheck",
  teamid: "teamIdCheck",
  rainbow: "rainbowCheck",
  outline: "outlineCheck",
  aimbot: "aimEnabledCheck",
  visibleonly: "visOnlyCheck",
  ignoredown: "ignoreDownCheck",
  drawfov: "drawFovCheck",
  fovrainbow: "fovRainbowCheck",
  crosshair: "crosshairCheck",
  drawdead: "drawDeadCheck",
  aimlock: "aimLockCheck",
  radar: "radarCheck",
  radnorainbow: "radNoRainbowCheck",
  radnoteam: "radNoTeamCheck",
  radadv: "radAdvCheck",
  radmini: "radMiniCheck",
  radbg: "radBgCheck",
  mpmode: "mpModeCheck",
  trig: "trigEnabledCheck",
  trigteam: "trigTeamCheck",
  trigspec: "trigSpecCheck",
  trigauto: "trigAutoCheck",
  loot: "lootCheck",
  lootlines: "lootLinesCheck",
  lootdist: "lootDistCheck",

  tesp: "tespCheck",
  tespteam: "tespTeamCheck",
  tbox: "tboxCheck",
  tskeleton: "tskelCheck",
  tcontorno: "tcontornoCheck",
  tname: "tnameCheck",
  tdistance: "tdistCheck",
  thealth: "thealthCheck",
  tkd: "tkdCheck",
  trank: "trankCheck",
  tprestige: "tprestigeCheck",
  tsnapline: "tsnapCheck",
  toffscreen: "toffCheck",
  tplatform: "tplatCheck",
  tinput: "tinputCheck",
  tteamid: "tteamIdCheck",
  trainbow: "trainbowCheck",
  fesp: "fespCheck",
  fespteam: "fespTeamCheck",
  fbox: "fboxCheck",
  fskeleton: "fskelCheck",
  fcontorno: "fcontornoCheck",
  fname: "fnameCheck",
  fdistance: "fdistCheck",
  fhealth: "fhealthCheck",
  fkd: "fkdCheck",
  frank: "frankCheck",
  fprestige: "fprestigeCheck",
  fsnapline: "fsnapCheck",
  foffscreen: "foffCheck",
  fplatform: "fplatCheck",
  finput: "finputCheck",
  fteamid: "fteamIdCheck",
  frainbow: "frainbowCheck",

  // Aimbot Objetivos / Amigos (amigos apagado por defecto)
  taimbot: "taimEnabledCheck",
  tvisibleonly: "tvisOnlyCheck",
  tignoredown: "tignoreDownCheck",
  taimlock: "taimLockCheck",
  faimbot: "faimEnabledCheck",
  fvisibleonly: "fvisOnlyCheck",
  fignoredown: "fignoreDownCheck",
  faimlock: "faimLockCheck",

  // Apuntado cercano / Override
  closeaim: "closeAimCheck",
  ovvis: "ovVisCheck",

  // ESP: color propio por categoría
  namesenabled: "namesEnabledCheck",
};

const RANGE_IDS = {
  fps: "fpsLimit",
  contornorim: "contornorimRange",
  maxdist: "maxDistRange",
  espthick: "espThick",
  zboxth: "zBoxThRange",
  vboxth: "vBoxThRange",
  skelthick: "skelThick",
  espiconsize: "iconSizeRange",
  fontsize: "fontSizeRange",
  fontsmall: "fontSmallRange",
  outlineth: "outlineThRange",
  smooth: "smoothRange",
  aimfov: "fovRange",
  aimrange: "aimRangeRange",
  switchdelay: "switchDelayRange",
  aiminterval: "aimIntervalRange",
  deadzone: "deadzoneRange",
  crosssize: "crossSizeRange",
  radx: "radXRange",
  rady: "radYRange",
  radw: "radWRange",
  radh: "radHRange",
  radarrow: "radArrowSizeRange",
  sharerate: "sharedRadarRate",
  trigdelay: "trigDelayRange",
  lootlineth: "lootLineThRange",
  lootfontsize: "lootFontSizeRange",
  // espposorder... y offx... NO van aqui: no tienen sliders en el dash. Los
  // manda el preview 3D al arrastrar un bloque (player3d.js): al soltarlo en
  // otra linea manda espposorder... / esppos... y con Shift manda offx...

  // Curvatura del aim (0..100 %)
  bezier: "bezierRange",

  // Apuntado cercano / Override
  cdist: "cdistRange",
  csmooth: "csmoothRange",
  cfov: "cfovRange",
  cdeadzone: "cdeadzoneRange",
  cinterval: "cintervalRange",
  ovsmooth: "ovsmoothRange",
  ovfov: "ovfovRange",
  ovdeadzone: "ovdeadzoneRange",
  ovinterval: "ovintervalRange",
  stickpx: "stickpxRange",

  tcontornorim: "tcontornorimRange",
  fcontornorim: "fcontornorimRange",

  // Aimbot Objetivos / Amigos
  tsmooth: "tsmoothRange",
  taimfov: "tfovRange",
  taimrange: "taimRangeRange",
  tswitchdelay: "tswitchDelayRange",
  taiminterval: "taimIntervalRange",
  tdeadzone: "tdeadzoneRange",
  fsmooth: "fsmoothRange",
  faimfov: "ffovRange",
  faimrange: "faimRangeRange",
  fswitchdelay: "fswitchDelayRange",
  faiminterval: "faimIntervalRange",
  fdeadzone: "fdeadzoneRange",
};

const SELECT_IDS = {
  overlay: "overlayMode",
  monitor: "monitorSelect",
  boxstyle: "boxStyleSel",
  snappos: "snapPosSel",
  priority: "prioritySel",
  notipos: "posNoti",
  tpriority: "tprioritySel",
  fpriority: "fprioritySel"
};

const TEXT_IDS = {
  fontname: "fontName",
  kmip: "kmIpInput",
  kmport: "kmPortInput",
  kmuuid: "kmUuidInput"
};

const KEY_IDS = {
  menukey: "menuKeyBind",
  aimkey1: "aimKey1Bind",
  aimkey2: "aimKey2Bind",
  trigkey1: "trigKey1Bind",
  trigkey2: "trigKey2Bind",
  zaimkey: "zAimKeyBind",
  ztrigkey: "zTrigKeyBind",
  ovkey: "ovKeyBind"
};

const COLOR_CMDS = [
  "colvis", "colhid", "coldown", "coltext", "coltextsm",
  "zcol", "vcol",
  "coloutline", "fovcolor", "radvis", "radhid", "radbgcol", "accent",
  "lootcollines", "lootcoltext",
  "contornocolvis", "contornocolhid",
  "tcontornocolvis", "tcontornocolhid",
  "fcontornocolvis", "fcontornocolhid",
  "namestargetcolor", "namesfriendcolor"
];

function setRange(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = String(value);
  el.dispatchEvent(new Event("input"));
}

function setSelect(id, index) {
  const el = document.getElementById(id);
  if (!el) return;
  el.selectedIndex = Number(index) || 0;
  if (typeof rebuildSelect === "function") rebuildSelect(el);
}

function setColor(cmd, hex) {
  if (cmd === "accent" && typeof setAccent === "function") {
    setAccent(hex);
    return;
  }
  if (typeof setChip !== "function") return;
  const pick = document.querySelector('.color-pick[data-cmd="' + cmd + '"]');
  if (pick) setChip(pick, hex);
}

// ---------------------------------------------------------------------------
// Tabla de items de loot — la lista de defs viene del C++ (state.lootdefs):
// [{ t: "AR", c: 2, v: 1 }, ...] en el mismo orden que loot_item_visible[].
// Se agrupa por categoría con un master checkbox por grupo y un checkbox por
// item (igual que la tabla del ejemplo Ventrix DMA, pero en la web).
// ---------------------------------------------------------------------------
const LOOT_CATS = ["lootCatGen", "lootCatAmmo", "lootCatWeapons", "lootCatGrenades", "lootCatStreaks"];

let lootTableRendered = false;

function renderLootTable(defs) {
  const container = document.getElementById("lootTable");
  if (!container || !Array.isArray(defs) || !defs.length) return;

  // reconstruir solo si cambió la lista (evita re-render en cada PushState)
  const sig = defs.map((d) => (d.v ? "1" : "0")).join("");
  if (lootTableRendered && container.dataset.sig === sig) return;
  container.dataset.sig = sig;

  container.innerHTML = "";

  // agrupar por categoría (0..4), conservando el orden de la tabla
  const groups = [[], [], [], [], []];
  defs.forEach((d, i) => {
    const cat = (d.c != null ? d.c : 0) | 0;
    if (cat >= 0 && cat <= 4) groups[cat].push({ idx: i, t: d.t || "", v: !!d.v });
  });

  groups.forEach((items, cat) => {
    if (!items.length) return;
    const group = document.createElement("div");
    group.className = "loot-cat";

    const allOn = items.every((it) => it.v);
    const anyOn = items.some((it) => it.v);

    // header con master checkbox
    const head = document.createElement("div");
    head.className = "loot-cat-head";
    const master = document.createElement("input");
    master.type = "checkbox";
    master.className = "loot-master";
    master.checked = allOn;
    master.indeterminate = anyOn && !allOn;
    master.dataset.cat = String(cat);

    const name = document.createElement("span");
    name.className = "loot-cat-name";
    name.dataset.i18n = LOOT_CATS[cat];
    name.textContent = typeof t === "function" ? t(LOOT_CATS[cat]) : LOOT_CATS[cat];

    const count = document.createElement("span");
    count.className = "loot-cat-count";
    const onCount = items.filter((it) => it.v).length;
    count.textContent = onCount + "/" + items.length;

    head.appendChild(master);
    head.appendChild(name);
    head.appendChild(count);
    head.addEventListener("click", (ev) => {
      if (ev.target !== master) master.click();
    });
    master.addEventListener("change", () => {
      const on = master.checked;
      items.forEach((it) => {
        const cb = group.querySelector('.loot-item[data-idx="' + it.idx + '"] input');
        if (cb) cb.checked = on;
      });
      master.indeterminate = false;
      nativeSend("lootcat|" + cat + "|" + (on ? "1" : "0"));
      count.textContent = (on ? items.length : 0) + "/" + items.length;
      // marca local para el siguiente PushState
      items.forEach((it) => { it.v = on; });
    });

    group.appendChild(head);

    // grid de items
    const grid = document.createElement("div");
    grid.className = "loot-grid";
    items.forEach((it) => {
      const label = document.createElement("label");
      label.className = "loot-item";
      label.dataset.idx = String(it.idx);
      label.title = it.t;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = it.v;
      cb.dataset.idx = String(it.idx);
      cb.addEventListener("change", () => {
        nativeSend("lootitem|" + it.idx + "|" + (cb.checked ? "1" : "0"));
        it.v = cb.checked;
        // actualizar master + contador
        const all = group.querySelectorAll(".loot-item input");
        let checked = 0;
        all.forEach((c) => { if (c.checked) checked++; });
        master.checked = checked === all.length;
        master.indeterminate = checked > 0 && checked < all.length;
        count.textContent = checked + "/" + all.length;
      });

      const box = document.createElement("span");
      box.className = "check-box";

      const nameEl = document.createElement("span");
      nameEl.className = "loot-name";
      nameEl.textContent = it.t;

      label.appendChild(cb);
      label.appendChild(box);
      label.appendChild(nameEl);
      grid.appendChild(label);
    });

    group.appendChild(grid);
    container.appendChild(group);
  });

  lootTableRendered = true;
}

let sharedRunning = false;

function setSharedState(running) {
  sharedRunning = !!running;
  const status = document.getElementById("sharedRadarStatus");
  const btn = document.getElementById("sharedRadarToggle");
  const txt = (key, fallback) => (typeof t === "function" ? t(key) : fallback);
  if (status) status.textContent = txt(running ? "running" : "stopped", running ? "Running" : "Stopped");
  if (btn) {
    const span = btn.querySelector("span[data-i18n]");
    if (span) {
      span.dataset.i18n = running ? "stop" : "start";
      span.textContent = txt(span.dataset.i18n, running ? "Stop" : "Start");
    } else {
      btn.textContent = txt(running ? "stop" : "start", running ? "Stop" : "Start");
    }
  }
}

function setState(state) {
  if (!state) return;

  Object.keys(CHECK_IDS).forEach((cmd) => {
    if (state[cmd] != null) setCheck(CHECK_IDS[cmd], state[cmd]);
  });
  Object.keys(RANGE_IDS).forEach((cmd) => {
    if (state[cmd] != null) setRange(RANGE_IDS[cmd], state[cmd]);
  });
  Object.keys(SELECT_IDS).forEach((cmd) => {
    if (state[cmd] != null) setSelect(SELECT_IDS[cmd], state[cmd]);
  });
  Object.keys(TEXT_IDS).forEach((cmd) => {
    if (state[cmd] != null) {
      const el = document.getElementById(TEXT_IDS[cmd]);
      if (el) el.value = String(state[cmd]);
    }
  });
  Object.keys(KEY_IDS).forEach((cmd) => {
    if (state[cmd] != null) {
      const el = document.getElementById(KEY_IDS[cmd]);
      if (el) {
        const v = String(state[cmd]);
        el.textContent = v === "None" ? t("none") : v;
      }
    }
  });
  COLOR_CMDS.forEach((cmd) => {
    if (state[cmd] != null) setColor(cmd, state[cmd]);
  });

  // Posiciones de bloques ESP (slots 0..7) para el preview 3D
  if (!window.espPositions) window.espPositions = { name: 1, dist: 0, info: 0, icons: 1, health: 2 };
  if (state.espposname != null) window.espPositions.name = Number(state.espposname) || 0;
  if (state.espposdist != null) window.espPositions.dist = Number(state.espposdist) || 0;
  if (state.espposinfo != null) window.espPositions.info = Number(state.espposinfo) || 0;
  if (state.espposicons != null) window.espPositions.icons = Number(state.espposicons) || 0;
  if (state.espposhealth != null) window.espPositions.health = Number(state.espposhealth) || 0;

  // Orden de apilado de bloques dentro de un mismo slot (menor = más pegado a la caja)
  if (!window.espOrder) window.espOrder = { name: 1, dist: 2, info: 3, icons: 0 };
  if (state.espposordern != null) window.espOrder.name = Number(state.espposordern) || 0;
  if (state.espposorderd != null) window.espOrder.dist = Number(state.espposorderd) || 0;
  if (state.espposorderi != null) window.espOrder.info = Number(state.espposorderi) || 0;
  if (state.espposorderc != null) window.espOrder.icons = Number(state.espposorderc) || 0;

  // Desplazamiento horizontal (px) de cada bloque dentro de su misma línea
  if (!window.espOffx) window.espOffx = { icons: 0, name: 0, dist: 0, info: 0 };
  if (state.offxname != null) window.espOffx.name = Number(state.offxname) || 0;
  if (state.offxdist != null) window.espOffx.dist = Number(state.offxdist) || 0;
  if (state.offxinfo != null) window.espOffx.info = Number(state.offxinfo) || 0;
  if (state.offxicons != null) window.espOffx.icons = Number(state.offxicons) || 0;

  // Colores del menú → preview 3D. El preview es POR PESTANA:
  //   General   -> colores globales (colvis / colhid / coldown / textos / outline)
  //   Objetivos -> color propio de la lista (namestargetcolor), igual que Esp.cpp
  //   Amigos    -> namesfriendcolor
  // El texto y el outline son comunes a las tres (el C++ también los comparte).
  const colMap = { colvis: "visible", colhid: "hidden", coldown: "downed", coltext: "text", coltextsm: "textSmall", coloutline: "outline" };
  if (!window.espNamedColors) window.espNamedColors = {};
  if (state.namestargetcolor != null) window.espNamedColors.namestargetcolor = String(state.namestargetcolor);
  if (state.namesfriendcolor != null) window.espNamedColors.namesfriendcolor = String(state.namesfriendcolor);
  if (state.namesenabled != null) window.espNamesEnabled = !!state.namesenabled;

  if (!window.espColorsByTab) window.espColorsByTab = {};
  const byTab = window.espColorsByTab;
  byTab.players = byTab.players || {};
  Object.keys(colMap).forEach((cmd) => {
    if (state[cmd] != null) byTab.players[colMap[cmd]] = String(state[cmd]);
  });
  if (!byTab.players.text) byTab.players.text = "#ffffff";
  if (!byTab.players.textSmall) byTab.players.textSmall = "#cfcfd4";
  if (!byTab.players.outline) byTab.players.outline = "#111111";
  if (!byTab.players.visible) byTab.players.visible = "#3b82f6";
  if (!byTab.players.hidden) byTab.players.hidden = "#ef4444";
  if (!byTab.players.downed) byTab.players.downed = "#f59e0b";

  // Objetivos / Amigos: mismo texto y outline, pero el cuerpo (caja y esqueleto)
  // va con el color de su lista, que es lo que pinta Esp.cpp.
  const namedT = window.espNamedColors.namestargetcolor || "#ff3b30";
  const namedF = window.espNamedColors.namesfriendcolor || "#22c55e";
  byTab.targets = Object.assign({}, byTab.players, { visible: namedT, hidden: namedT, downed: namedT });
  byTab.friends = Object.assign({}, byTab.players, { visible: namedF, hidden: namedF, downed: namedF });

  window.espColors = Object.assign({}, byTab.players);
  if (typeof window.applyEspPreviewColors === "function") window.applyEspPreviewColors();

  // Huesos (chips). El C++ los manda como CSV de índices (o array).
  if (typeof applyBonesState === "function") applyBonesState(state);

  if (state.lootdefs != null) renderLootTable(state.lootdefs);

  if (state.device != null) updateDeviceStatus(state.device);
  if (state.kmmsg != null) setKmStatus(state.kmmsg, !!state.kmok, false);
  if (state.sharelink != null) {
    const link = document.getElementById("sharedRadarLink");
    if (link) link.value = String(state.sharelink);
  }
  if (state.share != null) setSharedState(!!state.share);
  if (state.lang != null && typeof applyLang === "function") applyLang(state.lang);
}

function requestState() {
  nativeSend("get_state");
}

// ---------------------------------------------------------------------------
// Binds genéricos: todo elemento con [data-cmd] queda conectado
// ---------------------------------------------------------------------------

let pendingBindBtn = null;

function restoreBindBtn(btn) {
  if (!btn) return;
  btn.classList.remove("listening");
  btn.textContent = btn.dataset.bindPrev || "";
  if (pendingBindBtn === btn) pendingBindBtn = null;
}

// El JS ya NO captura teclas (solo vería las del host, no las del PC
// principal). Al hacer clic se pide el bind al C++ ("bindkey|cmd"); el C++
// detecta la tecla del PC principal y responde {"type":"keybind",...}.
function bindKey(btn, command) {
  btn.addEventListener("click", () => {
    if (pendingBindBtn && pendingBindBtn !== btn) restoreBindBtn(pendingBindBtn);
    pendingBindBtn = btn;
    btn.dataset.bindPrev = btn.textContent;
    btn.classList.add("listening");
    btn.textContent = "...";
    nativeSend("bindkey|" + command);
  });
}

function updateSharedRateLabel() {
  const input = document.getElementById("sharedRadarRate");
  const label = document.getElementById("sharedRadarRateValue");
  if (input && label) label.textContent = input.value + " ms";
}

// ---------------------------------------------------------------------------
// Perfiles: lista dinámica desde C++ (C:\Ventrix\.cfg\*.cfg encriptados)
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

let activeProfileName = "Default";
let activeProfileHotkey = "";

// El boton unico de tecla (antes de Save) muestra la tecla del perfil activo.
function updateHotkeyButton() {
  const label = document.getElementById("profileHotkeyLabel");
  if (!label) return;
  label.textContent = activeProfileHotkey ? activeProfileHotkey : t("assignHotkey");
}

function renderProfiles(list) {
  const container = document.querySelector(".profiles-list");
  if (!container) return;
  container.innerHTML = "";
  (list || []).forEach((p) => {
    const item = document.createElement("div");
    item.className = "profile-item" + (p.active ? " active" : "");

    const status = p.active
      ? '<span class="profile-status">' + t("active") + "</span>"
      : "";
    const hotkeyText = p.hotkey
      ? (p.hotkey === "None" ? t("none") : escapeHtml(p.hotkey))
      : t("assignHotkey");

    // La tecla ya no se asigna por fila: hay un solo boton en la tarjeta del
    // perfil actual (el de antes de Save). Aqui solo se muestra cual tiene.
    item.innerHTML =
      '<div class="profile-item-icon"><i class="fa-solid fa-folder-open"></i></div>' +
      '<div class="profile-item-info"><strong>' + escapeHtml(p.name) + "</strong>" +
      "<span>" + (p.active ? t("active") : t("saved")) + "</span></div>" +
      '<span class="profile-hotkey"><i class="fa-solid fa-keyboard"></i> ' + hotkeyText + "</span>" +
      status +
      // Si este perfil está compartido, se muestra su código para copiarlo.
      (communityCodeOf(p.name)
        ? '<button class="profile-code-chip" type="button" data-action="share-code" title="' + escapeHtml(t("copyCode")) + '">' +
            escapeHtml(communityCodeOf(p.name)) + ' <i class="fa-regular fa-copy"></i></button>'
        : "") +
      '<div class="profile-item-actions">' +
      '<button type="button" data-action="delete" title="' + t("delete") + '"><i class="fa-solid fa-trash"></i></button>' +
      "</div>";

    // Clic en el perfil → cargarlo (si no es el activo)
    item.onclick = () => {
      if (p.active) return;
      nativeSend("profile|load|" + p.name);
    };

    item.querySelector('[data-action="delete"]').onclick = (ev) => {
      ev.stopPropagation();
      nativeSend("profile|delete|" + p.name);
    };

    // Copiar el código de comunidad de este perfil (si está compartido).
    const codeChip = item.querySelector('[data-action="share-code"]');
    if (codeChip) {
      codeChip.onclick = (ev) => {
        ev.stopPropagation();
        const shared = communityCodeOf(p.name);
        if (!shared) return;

        copyToClipboard(shared);
        codeChip.classList.add("copied");
        codeChip.innerHTML = escapeHtml(shared) + ' <i class="fa-solid fa-check"></i>';
        setTimeout(() => {
          codeChip.classList.remove("copied");
          codeChip.innerHTML = escapeHtml(shared) + ' <i class="fa-regular fa-copy"></i>';
        }, 1500);
      };
    }

    container.appendChild(item);
  });

  const active = (list || []).find((p) => p.active);
  if (active) {
    activeProfileName = active.name;
    activeProfileHotkey = (active.hotkey && active.hotkey !== "None") ? active.hotkey : "";
  }
  const cur = document.getElementById("currentProfile");
  if (cur) cur.textContent = activeProfileName;
  updateHotkeyButton();
}

// --- Popup de mapeo de la tecla del perfil activo -------------------------

const keyModal = document.getElementById("keyModal");
const keyModalDisplay = document.getElementById("keyModalDisplay");

function openKeyModal() {
  if (!keyModal || !activeProfileName) return;

  const who = document.getElementById("keyModalWho");
  if (who) who.textContent = activeProfileName;
  if (keyModalDisplay) {
    keyModalDisplay.classList.add("listening");
    keyModalDisplay.textContent = "...";
  }
  keyModal.hidden = false;

  // La captura la hace C++ (tecla del PC principal o de esta PC). Al capturarla
  // asigna la hotkey del perfil y responde {"type":"keybind","cmd":"profilekey|<nombre>"}.
  nativeSend("bindkey|profilekey|" + activeProfileName);
}

function closeKeyModal(sendCancel) {
  if (sendCancel) nativeSend("bindcancel");
  if (keyModal) keyModal.hidden = true;
}

// --- Popup de creación de perfil ------------------------------------------

const profileModal = document.getElementById("profileModal");
const profileNameInput = document.getElementById("profileNameInput");
const modalKeyBtn = document.getElementById("profileKeyBtn");
let modalKey = "";

function openProfileModal() {
  modalKey = "";
  if (modalKeyBtn) {
    modalKeyBtn.classList.remove("listening");
    modalKeyBtn.textContent = t("assignHotkey");
  }
  if (profileNameInput) profileNameInput.value = "";
  if (profileModal) profileModal.hidden = false;
  if (profileNameInput) profileNameInput.focus();
}

function closeProfileModal() {
  if (profileModal) profileModal.hidden = true;
}

function confirmCreateProfile() {
  if (!profileNameInput) return;
  const name = profileNameInput.value.trim();
  if (!name) {
    profileNameInput.focus();
    return;
  }
  nativeSend("profile|create|" + name);
  if (modalKey) nativeSend("profile|setkey|" + name + "|" + modalKey);
  closeProfileModal();
}

function bindCommands() {
  // --- checks (on/off) -----------------------------------------------
  document.querySelectorAll("button.check[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.classList.contains("on") ? "0" : "1";
      btn.classList.toggle("on", value === "1");
      nativeSend(btn.dataset.cmd + "|" + value);
    });
  });

  // --- rangos ---------------------------------------------------------
  document.querySelectorAll('input[type="range"][data-cmd]').forEach((input) => {
    input.addEventListener("input", () => {
      if (input.id === "fpsLimit") return; // fps ya lo envía app.js
      nativeSend(input.dataset.cmd + "|" + input.value);
    });
    if (input.id === "sharedRadarRate") {
      input.addEventListener("input", updateSharedRateLabel);
    }
  });

  // --- selects --------------------------------------------------------
  document.querySelectorAll("select[data-cmd]").forEach((sel) => {
    sel.addEventListener("change", () => {
      nativeSend(sel.dataset.cmd + "|" + sel.selectedIndex);
    });
  });

  // --- campos de texto ------------------------------------------------
  document.querySelectorAll('input[type="text"][data-cmd]').forEach((input) => {
    input.addEventListener("change", () => {
      nativeSend(input.dataset.cmd + "|" + input.value);
    });
  });

  // --- binds de teclas / mouse ----------------------------------------
  document.querySelectorAll("button.bind[data-cmd]").forEach((btn) => {
    bindKey(btn, btn.dataset.cmd);
  });

  // --- botones de acción ----------------------------------------------
  document.querySelectorAll("button[data-cmd]:not(.check):not(.bind)").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      if (cmd === "copylink") {
        const link = document.getElementById("sharedRadarLink");
        if (link && link.value) {
          // Helper con respaldo (WebView2 sin foco bloquea navigator.clipboard).
          copyToClipboard(link.value);
          const span = btn.querySelector("span[data-i18n]");
          if (span) {
            const prev = span.textContent;
            span.textContent = "✓";
            setTimeout(() => { span.textContent = prev; }, 1200);
          }
        }
      }
      if (cmd === "sharetoggle") {
        setSharedState(!sharedRunning);
      }
      if (cmd === "quit") {
        openQuitModal();
        return;
      }
      if (cmd === "kmconnect") {
        const ip = document.getElementById("kmIpInput");
        const port = document.getElementById("kmPortInput");
        const uuid = document.getElementById("kmUuidInput");
        if (ip) nativeSend("kmip|" + ip.value);
        if (port) nativeSend("kmport|" + port.value);
        if (uuid) nativeSend("kmuuid|" + uuid.value);
      }
      nativeSend(cmd);
    });
  });

  // --- colores: hook invocado por app.js (iro.js) ----------------------
  window.onIroChange = (pick, hex) => {
    const cmd = pick && pick.dataset.cmd;
    if (!cmd) return;
    const val = String(hex || "").toLowerCase();
    nativeSend(cmd + "|" + val);
    // El C++ no devuelve state al cambiar un color: el preview de la pestana
    // correspondiente se actualiza aqui mismo.
    if (typeof window.setEspPreviewColor === "function") window.setEspPreviewColor(cmd, val);
  };

  // --- perfiles --------------------------------------------------------
  const newProfileBtn = document.getElementById("createProfile");
  if (newProfileBtn) newProfileBtn.onclick = openProfileModal;

  const loadProfileBtn = document.getElementById("loadProfile");
  if (loadProfileBtn) loadProfileBtn.onclick = () => nativeSend("profile|load|" + activeProfileName);

  const saveProfileBtn = document.getElementById("saveProfile");
  if (saveProfileBtn) saveProfileBtn.onclick = () => nativeSend("profile|save|" + activeProfileName);

  // Popup: capturar tecla (opcional), confirmar, cancelar, overlay
  if (modalKeyBtn) {
    modalKeyBtn.onclick = () => {
      // No hace falta escribir el nombre antes: la tecla se guarda y se aplica
      // al pulsar Create (profile|create + profile|setkey).
      modalKeyBtn.classList.add("listening");
      modalKeyBtn.textContent = "...";
      nativeSend("bindkey|modalkey");
    };
  }

  // Tecla del perfil activo: un solo boton, justo antes de Save.
  const hotkeyBtn = document.getElementById("profileHotkey");
  if (hotkeyBtn) hotkeyBtn.onclick = openKeyModal;
  const keyModalCancel = document.getElementById("keyModalCancel");
  if (keyModalCancel) keyModalCancel.onclick = () => closeKeyModal(true);
  if (keyModal) {
    keyModal.addEventListener("mousedown", (ev) => {
      if (ev.target === keyModal) closeKeyModal(true);
    });
  }
  const profileCancel = document.getElementById("profileCancel");
  if (profileCancel) profileCancel.onclick = closeProfileModal;
  const profileCreate = document.getElementById("profileCreate");
  if (profileCreate) profileCreate.onclick = confirmCreateProfile;
  if (profileNameInput) {
    profileNameInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") confirmCreateProfile();
    });
  }
  if (profileModal) {
    profileModal.addEventListener("mousedown", (ev) => {
      if (ev.target === profileModal) closeProfileModal();
    });
  }

  updateSharedRateLabel();
  updateHotkeyButton();
  bindCommunity();
  requestState();
  nativeSend("profiles");

  // La lista de la comunidad se pide en segundo plano desde el arranque: así
  // "Mis perfiles" ya muestra el código de los que están compartidos sin tener
  // que abrir la pestaña Community.
  requestCommunityList(true);

  if (document.getElementById("sharedRadarLink")) nativeSend("sharelink|");
}

// ---------------------------------------------------------------------------
// Comunidad: perfiles compartidos
// ---------------------------------------------------------------------------
//
// Flujo:  Dash --"community|<accion>|..."--> C++ (WinHTTP, en su propio hilo)
//            --> panel ventrixtools.com/api.php --> Worker --> VPS (MySQL)
//         Dash <--{"type":"community","action":"...","raw":{...}}-- C++
//
// El C++ no interpreta los datos: reenvía el JSON de la API tal cual en "raw".

// La API solo ordena por new | top | downloads; el <select> tiene 4 opciones.
const COMMUNITY_SORTS = {
  recent: "new",
  rating: "top",
  downloads: "downloads",
  popular: "top",
};

let communityLoaded = false;    // ya se pidió la lista al menos una vez
let communitySecondClick = "";  // codigo esperando la 2ª pulsacion (report/delete)
let shareCodeValue = "";        // codigo del ultimo perfil compartido

function communityStatus(text, isError) {
  const el = document.getElementById("communityStatus");
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
  el.classList.toggle("error", !!isError);
}

// silent = refresco automático en segundo plano: no toca el aviso de estado ni
// cancela una confirmación pendiente (reportar/borrar con doble clic).
function requestCommunityList(silent) {
  const input = document.getElementById("communitySearch");
  const sel = document.getElementById("communitySort");
  const search = (input && input.value.trim()) || "";
  const sort = COMMUNITY_SORTS[(sel && sel.value) || "recent"] || "new";

  communityLoaded = true;

  if (!silent) {
    communitySecondClick = "";
    communityStatus(t("communityLoading"));
  }

  nativeSend("community|list|" + sort + "|" + search);
}

// "hace 5 min" (los textos salen de i18n con {n})
function communityAgo(seconds) {
  if (!seconds) return "";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - Number(seconds));
  if (diff < 120) return t("justNow");
  if (diff < 3600) return t("minutesAgo").replace("{n}", String(Math.floor(diff / 60)));
  if (diff < 86400) return t("hoursAgo").replace("{n}", String(Math.floor(diff / 3600)));
  return t("daysAgo").replace("{n}", String(Math.floor(diff / 86400)));
}

// 1240 -> "1.2K" (app.js ya sabe leer esos sufijos)
function communityCount(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// Codigo de perfil: 10 hex en mayúsculas.
function normalizeProfileCode(raw) {
  const code = String(raw || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return code.length === 10 ? code : "";
}

// Firma de lo que se ve: si no cambia (estrellas, descargas, votos) no se
// repinta la lista, así el refresco automático no parpadea ni pierde el scroll.
// El código del perfil también aparece en "Mis perfiles": mapa nombre -> código
// de los perfiles propios que están compartidos (lo llena la lista de Community).
let communityMineByName = {};
let communityMineSig = "";

function communityRememberMine(list) {
  const map = {};

  (list || []).forEach((p) => {
    if (p && p.mine && p.name) map[String(p.name)] = String(p.code || "");
  });

  const sig = JSON.stringify(map);
  if (sig === communityMineSig) return false;

  communityMineSig = sig;
  communityMineByName = map;
  return true;
}

function communityCodeOf(profileName) {
  return communityMineByName[String(profileName)] || "";
}

function communitySignature(list) {
  return (list || []).map((p) => [
    p.code, p.name, p.score, p.downloads,
    p.votes_up, p.votes_down, p.voted, p.mine ? 1 : 0,
  ].join(":")).join("|");
}

function renderCommunity(list) {
  const box = document.querySelector(".community-profiles");
  if (!box) return;

  const sig = communitySignature(list);
  if (box.dataset.sig === sig) return;

  box.dataset.sig = sig;
  box.innerHTML = "";

  if (!list || !list.length) {
    const empty = document.createElement("p");
    empty.className = "community-empty";
    empty.textContent = t("communityEmpty");
    box.appendChild(empty);
    return;
  }

  list.forEach((p) => {
    const code = String(p.code || "");
    const mine = !!p.mine;
    const score = Number(p.score) || 0;

    const item = document.createElement("div");
    item.className = "community-profile";
    item.dataset.code = code;
    item.dataset.voted = String(Number(p.voted) || 0);

    item.innerHTML =
      '<div class="profile-item-icon"><i class="fa-solid fa-' + (mine ? "user" : "crosshairs") + '"></i></div>' +
      '<div class="profile-item-info"><strong>' + escapeHtml(p.name || code) + "</strong>" +
      "<span>" + (mine ? escapeHtml(t("mine")) + " · " : "") +
      (p.author_note ? escapeHtml(p.author_note) + " · " : "") +
      escapeHtml(communityAgo(p.created)) +
      (mine ? "" : " · " + escapeHtml(code)) + "</span></div>" +

      // El contador (estrella + puntuación) solo se muestra aquí, en Community.
      // En tu propio perfil sale apagado y lo explica el tooltip.
      (mine
        ? '<div class="profile-rating own" title="' + escapeHtml(t("voteOwn")) + '">' +
            '<i class="fa-solid fa-star"></i><span>' + score + "</span></div>"
        : '<div class="profile-rating"><i class="fa-solid fa-star"></i><span>' + score + "</span></div>") +

      // Tus perfiles: el código a la vista y copiable (para pasárselo).
      (mine
        ? '<button class="profile-code-chip" type="button" data-action="copy" title="' + escapeHtml(t("copyCode")) + '">' +
            escapeHtml(code) + ' <i class="fa-regular fa-copy"></i></button>'
        : "") +

      '<div class="profile-downloads"><i class="fa-solid fa-download"></i><span>' + communityCount(p.downloads) + "</span></div>" +
      // Los botones de voto se ven SIEMPRE (para saber dónde están): en tus
      // perfiles salen apagados porque el servidor no deja votarte a ti mismo.
      '<div class="profile-item-actions">' +
      '<button type="button" data-action="vote" title="' + escapeHtml(mine ? t("voteOwn") : t("voteUp")) + '"' +
      (mine ? " disabled" : "") + '><i class="fa-solid fa-thumbs-up"></i></button>' +
      '<button type="button" data-action="down" title="' + escapeHtml(mine ? t("voteOwn") : t("voteDown")) + '"' +
      (mine ? " disabled" : "") + '><i class="fa-solid fa-thumbs-down"></i></button>' +
      (mine
        ? '<button type="button" data-action="delete" title="' + escapeHtml(t("delete")) + '"><i class="fa-solid fa-trash"></i></button>'
        : '<button type="button" data-action="report" title="' + escapeHtml(t("report")) + '"><i class="fa-solid fa-flag"></i></button>') +
      "</div>" +
      '<button class="btn community-get" type="button"><i class="fa-solid fa-cloud-arrow-down"></i><span>' +
      escapeHtml(t("download")) + "</span></button>";

    const starBtn = item.querySelector('[data-action="vote"]');
    const downBtn = item.querySelector('[data-action="down"]');
    const reportBtn = item.querySelector('[data-action="report"]');
    const deleteBtn = item.querySelector('[data-action="delete"]');
    const copyBtn = item.querySelector('[data-action="copy"]');

    if (starBtn && Number(p.voted) === 1) starBtn.classList.add("voted");
    if (downBtn && Number(p.voted) === -1) downBtn.classList.add("voted");

    item.querySelector(".community-get").onclick = () => {
      communitySecondClick = "";
      communityStatus(t("communityLoading"));
      nativeSend("community|get|" + code);
    };

    // 👍 = voto positivo, 👎 = negativo. Si vuelves a pulsar el que ya tienes
    // puesto, se quita el voto (value 0).
    if (starBtn) {
      starBtn.onclick = () =>
        nativeSend("community|vote|" + code + "|" + (item.dataset.voted === "1" ? "0" : "1"));
    }

    if (downBtn) {
      downBtn.onclick = () =>
        nativeSend("community|vote|" + code + "|" + (item.dataset.voted === "-1" ? "0" : "-1"));
    }

    // Mi código: copiar al portapapeles con confirmación visual.
    if (copyBtn) {
      copyBtn.onclick = () => {
        shareCodeValue = code;
        copyToClipboard(code);
        copyBtn.classList.add("copied");
        copyBtn.innerHTML = escapeHtml(code) + ' <i class="fa-solid fa-check"></i>';
        setTimeout(() => {
          copyBtn.classList.remove("copied");
          copyBtn.innerHTML = escapeHtml(code) + ' <i class="fa-regular fa-copy"></i>';
        }, 1500);
      };
    }

    // Reportar/borrar piden una segunda pulsación (así no se hace sin querer).
    if (reportBtn) {
      reportBtn.onclick = () => {
        if (communitySecondClick !== "report:" + code) {
          communitySecondClick = "report:" + code;
          communityStatus(t("confirmTwice"));
          return;
        }
        communitySecondClick = "";
        communityStatus("");
        nativeSend("community|report|" + code);
      };
    }

    if (deleteBtn) {
      deleteBtn.onclick = () => {
        if (communitySecondClick !== "delete:" + code) {
          communitySecondClick = "delete:" + code;
          communityStatus(t("confirmTwice"));
          return;
        }
        communitySecondClick = "";
        communityStatus("");
        nativeSend("community|delete|" + code);
      };
    }

    box.appendChild(item);
  });
}

function communityUpdateVote(data) {
  const code = String((data && data.code) || "");
  const card = document.querySelector('.community-profile[data-code="' + code + '"]');
  if (!card) return;

  const voted = Number(data.voted) || 0;
  card.dataset.voted = String(voted);

  const rating = card.querySelector(".profile-rating span");
  if (rating) rating.textContent = String(Number(data.score) || 0);

  const star = card.querySelector('[data-action="vote"]');
  if (star) star.classList.toggle("voted", voted === 1);

  const down = card.querySelector('[data-action="down"]');
  if (down) down.classList.toggle("voted", voted === -1);
}

// Portapapeles: la API moderna puede no estar disponible en WebView2 sin foco,
// así que hay un respaldo con textarea + execCommand.
function copyToClipboard(text) {
  if (!text) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();

  try {
    document.execCommand("copy");
  } catch (_) {
    /* sin portapapeles disponible */
  }

  document.body.removeChild(ta);
}

function importByCode() {
  const input = document.getElementById("profileCode");
  const code = normalizeProfileCode(input && input.value);

  if (!code) {
    communityStatus(t("communityError"), true);
    return;
  }

  communityStatus(t("communityLoading"));
  nativeSend("community|get|" + code);
}

// --- popup de compartir ----------------------------------------------------

function shareStatusText(text, isError) {
  const el = document.getElementById("shareStatus");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", !!isError);
}

function openShareModal() {
  const modal = document.getElementById("shareModal");
  if (!modal) return;

  shareCodeValue = "";

  const who = document.getElementById("shareWho");
  if (who) who.textContent = activeProfileName;

  const name = document.getElementById("shareName");
  if (name) name.value = activeProfileName;

  const note = document.getElementById("shareNote");
  if (note) note.value = "";

  const row = document.getElementById("shareCodeRow");
  if (row) row.hidden = true;

  const codeBtn = document.getElementById("shareCode");
  if (codeBtn) codeBtn.textContent = "";

  const send = document.getElementById("shareSend");
  if (send) send.disabled = false;

  shareStatusText("");
  modal.hidden = false;
  if (name) name.focus();
}

function closeShareModal() {
  const modal = document.getElementById("shareModal");
  if (modal) modal.hidden = true;
}

function sendShare() {
  const nameEl = document.getElementById("shareName");
  const noteEl = document.getElementById("shareNote");

  // "|" es el separador del comando: fuera.
  const name = ((nameEl && nameEl.value) || "").replace(/\|/g, " ").trim();
  const note = ((noteEl && noteEl.value) || "").replace(/\|/g, " ").trim();

  if (!name) {
    shareStatusText(t("communityError"), true);
    if (nameEl) nameEl.focus();
    return;
  }

  const send = document.getElementById("shareSend");
  if (send) send.disabled = true;

  shareStatusText(t("communityLoading"));
  nativeSend("community|share|" + name + "|" + note);
}

// --- respuestas del C++ ----------------------------------------------------

function handleCommunity(msg) {
  const action = msg.action || "";
  const raw = msg.raw || null;
  const data = (raw && raw.data) || null;
  const apiError = (raw && raw.ok === false) ? (raw.error || raw.message || "") : "";

  if (msg.error === "offline") {
    communityStatus(t("communityOffline"), true);
    shareStatusText(t("communityOffline"), true);
    const send = document.getElementById("shareSend");
    if (send) send.disabled = false;
    return;
  }

  // Error de la API (ok:false): se muestra el motivo que devuelve el servidor
  // (not_found, own_profile, expired, invalid_code...) para poder diagnosticar.
  if (apiError) {
    communityStatus(t("communityError") + " (" + apiError + ")", true);
    shareStatusText(t("communityError") + " (" + apiError + ")", true);
    const send = document.getElementById("shareSend");
    if (send) send.disabled = false;
    return;
  }

  if (msg.error === "invalid_code") {
    communityStatus(t("communityError"), true);
    return;
  }

  if (msg.error === "invalid_name" || msg.error === "export_failed") {
    shareStatusText(t("communityError"), true);
    const send = document.getElementById("shareSend");
    if (send) send.disabled = false;
    return;
  }

  if (action === "list" || action === "mine") {
    const list = (data && data.list) || [];

    // Si cambian mis perfiles compartidos, "Mis perfiles" repinta sus códigos.
    if (communityRememberMine(list)) nativeSend("profiles");

    renderCommunity(list);
    communityStatus("");
    return;
  }

  if (action === "get") {
    if (msg.imported) {
      communityStatus(t("imported").replace("{name}", msg.imported));
      communitySecondClick = "";
      nativeSend("profiles");
      requestCommunityList(true);   // el contador de descargas ya subió
    } else {
      communityStatus(t("communityError"), true);
    }
    return;
  }

  if (action === "share") {
    const send = document.getElementById("shareSend");
    if (send) send.disabled = false;

    const code = (data && data.code) || "";
    if (!code) {
      shareStatusText(t("communityError"), true);
      return;
    }

    shareCodeValue = code;
    const row = document.getElementById("shareCodeRow");
    if (row) row.hidden = false;

    const codeBtn = document.getElementById("shareCode");
    if (codeBtn) codeBtn.innerHTML = escapeHtml(code) + ' <i class="fa-regular fa-copy"></i>';

    shareStatusText(data && data.duplicate ? t("shareDupe") : t("shareOk"));
    requestCommunityList(true);     // aparece ya en la lista
    return;
  }

  if (action === "vote") {
    communityUpdateVote(data);
    return;
  }

  if (action === "report") {
    communityStatus(t("reportOk"));
    return;
  }

  if (action === "delete") {
    communityStatus(t("deleteOk"));
    requestCommunityList();
    return;
  }
}

// --- wiring ---------------------------------------------------------------

function bindCommunity() {
  const shareBtn = document.getElementById("shareProfile");
  if (shareBtn) shareBtn.onclick = openShareModal;

  const shareSend = document.getElementById("shareSend");
  if (shareSend) shareSend.onclick = sendShare;

  const shareCancel = document.getElementById("shareCancel");
  if (shareCancel) shareCancel.onclick = closeShareModal;

  const shareModal = document.getElementById("shareModal");
  if (shareModal) {
    shareModal.addEventListener("mousedown", (ev) => {
      if (ev.target === shareModal) closeShareModal();
    });
  }

  const nameEl = document.getElementById("shareName");
  if (nameEl) {
    nameEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") sendShare();
    });
  }

  const codeBtn = document.getElementById("shareCode");
  if (codeBtn) {
    codeBtn.onclick = () => {
      if (!shareCodeValue) return;
      copyToClipboard(shareCodeValue);
      codeBtn.innerHTML = escapeHtml(shareCodeValue) + ' <i class="fa-solid fa-check"></i>';
    };
  }

  const importBtn = document.getElementById("importProfile");
  if (importBtn) importBtn.onclick = importByCode;

  const codeInput = document.getElementById("profileCode");
  if (codeInput) {
    codeInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") importByCode();
    });
  }

  const sortSel = document.getElementById("communitySort");
  if (sortSel) {
    sortSel.addEventListener("change", () => {
      if (communityLoaded) requestCommunityList();
    });
  }

  const searchInput = document.getElementById("communitySearch");
  if (searchInput) {
    let timer = 0;
    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (communityLoaded) requestCommunityList();
      }, 350);
    });
  }

  // La lista se pide al abrir la pestaña y luego se refresca sola (estrellas,
  // descargas) sin recargar la web.
  const tab = document.querySelector('[data-profile-tab="community"]');
  if (tab) {
    tab.addEventListener("click", () => requestCommunityList());
  }
  startCommunityPoll();
}

// --- Refresco automático de la comunidad ----------------------------------

const COMMUNITY_POLL_MS = 15000;
let communityPollId = 0;

function communityTabVisible() {
  const view = document.getElementById("profiles-community");
  if (!view || !view.classList.contains("active")) return false;

  const page = document.getElementById("page-profiles");
  return !page || page.classList.contains("active");
}

function startCommunityPoll() {
  if (communityPollId) return;

  communityPollId = setInterval(() => {
    if (!communityLoaded || !communityTabVisible()) return;

    const modal = document.getElementById("shareModal");
    if (modal && !modal.hidden) return;   // no molestar mientras comparte

    requestCommunityList(true);
  }, COMMUNITY_POLL_MS);
}

// ---------------------------------------------------------------------------
// Mensajes entrantes del backend
// ---------------------------------------------------------------------------

function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "kmstatus") {
    setKmStatus(msg.msg || "", !!msg.ok, !!msg.pending);
    if (msg.device != null) updateDeviceStatus(msg.device);
  }
  if (msg.type === "state") {
    setState(msg);
    // Refresca la lista de perfiles: al cambiar de perfil (hotkey desde C++)
    // el badge "Active" debe moverse.
    nativeSend("profiles");
  }
  if (msg.type === "sharelink" && msg.value != null) {
    const link = document.getElementById("sharedRadarLink");
    if (link) link.value = String(msg.value);
  }
  if (msg.type === "profiles" && Array.isArray(msg.list)) {
    renderProfiles(msg.list);
  }
  // Perfiles de la comunidad (la API responde dentro de "raw")
  if (msg.type === "community") {
    handleCommunity(msg);
  }
  // Lista de jugadores (Player List) — llega desde C++ cuando el cache cambió
  if (msg.type === "players" && Array.isArray(msg.players)) {
    if (typeof window.setPlayers === "function") window.setPlayers(msg.players);
    if (typeof window.fillPlayersDatalist === "function") window.fillPlayersDatalist(msg.players);
  }
  // Listas de OBJETIVOS y AMIGOS (viven solo en el C++, en memoria)
  if (msg.type === "lists") {
    if (typeof window.applyNamedLists === "function")
      window.applyNamedLists(msg.targets, msg.friends);
  }
  // Respuesta del bind capturado en C++ (tecla del PC principal o local)
  if (msg.type === "keybind") {
    if (msg.cmd === "modalkey") {
      // Captura del popup de creación de perfil (tecla opcional)
      if (modalKeyBtn) {
        modalKeyBtn.classList.remove("listening");
        modalKeyBtn.textContent = msg.key
          ? (msg.key === "None" ? t("none") : msg.key)
          : t("assignHotkey");
      }
      modalKey = msg.key || "";
      return;
    }
    if (msg.cmd && msg.cmd.indexOf("profilekey|") === 0) {
      const key = msg.key || "";
      const shown = key ? (key === "None" ? t("none") : key) : t("assignHotkey");

      if (keyModalDisplay) {
        keyModalDisplay.classList.remove("listening");
        keyModalDisplay.textContent = shown;
      }

      if (key) {
        // C++ ya guardo la tecla en el perfil: solo hay que reflejarlo.
        activeProfileHotkey = (key === "None") ? "" : key;
        updateHotkeyButton();
        nativeSend("profiles");                    // refresca la tecla en la lista
        setTimeout(() => closeKeyModal(false), 650); // y cierra el popup
      }
      return;
    }
    const btn = KEY_IDS[msg.cmd] ? document.getElementById(KEY_IDS[msg.cmd]) : null;
    if (btn) {
      if (msg.key) {
        // ESC -> "None": se muestra localizado (Ninguno) y queda sin tecla
        btn.textContent = msg.key === "None" ? t("none") : msg.key;
        btn.dataset.bindPrev = "";
        btn.classList.remove("listening");
      } else {
        restoreBindBtn(btn); // cancelado (timeout / bindcancel)
      }
      if (pendingBindBtn === btn) pendingBindBtn = null;
    }
  }
}

if (window.chrome && chrome.webview && chrome.webview.addEventListener) {
  chrome.webview.addEventListener("message", (ev) => {
    let msg = ev.data;
    if (typeof msg === "string") {
      try { msg = JSON.parse(msg); } catch (_) { return; }
    }
    handleMessage(msg);
  });
}

window.addEventListener("message", (ev) => {
  if (ev.data && typeof ev.data === "object") handleMessage(ev.data);
});

bindCommands();
wireQuitModal();

// ---------------------------------------------------------------------------
// HUESOS como CHIPS (General / Objetivos / Amigos / Cercano / Override)
// ---------------------------------------------------------------------------
// El usuario añade huesos uno a uno desde un único desplegable ("+ Añadir
// hueso") y cada hueso se ve como una etiqueta con su "✕" para quitarlo.
// Al C++ se le manda la lista como CSV de índices:
//   bones|1,2,3     tbones|     fbones|2,0     cbones|     ovbones|5
// Lista vacía ("bones|") = sin huesos elegidos.
// El estado que devuelve el C++ se acepta como CSV ("1,2") o como array.
// ---------------------------------------------------------------------------

// Índices = mismos que usa Aim.cpp en TargetBone() (0..17).
const BONE_LABELS = [
  "head", "neck", "chest", "stomach", "tummy", "pelvis",
  "leftArm", "rightArm", "leftFoot", "rightFoot",
  "headNeck", "headChest", "neckChest", "chestStomach", "chestPelvis",
  "upper", "closest", "random"
];

const BONE_GROUPS = {
  bones:   { chips: "boneChips",   picker: "bonePicker" },
  tbones:  { chips: "tboneChips",  picker: "tbonePicker" },
  fbones:  { chips: "fboneChips",  picker: "fbonePicker" },
  cbones:  { chips: "cboneChips",  picker: "cbonePicker" },
  ovbones: { chips: "ovboneChips", picker: "ovbonePicker" }
};

// Listas de huesos por panel. General / Objetivos / Amigos arrancan con los
// 3 predeterminados del C++ (aim_bones / aimt_bones / aimf_bones = {0,1,2} =
// Head, Neck, Chest) para que se vean 3 chips ya puestos antes de que llegue
// el estado; Cercano y Override empiezan vacios (el C++ no les pone ninguno).
// En cuanto llega state.bones/tbones/fbones/cbones/ovbones, applyBonesState()
// sustituye la lista por la del C++.
const BONE_DEFAULT = [0, 1, 2];

const boneList = {
  bones: BONE_DEFAULT.slice(),
  tbones: BONE_DEFAULT.slice(),
  fbones: BONE_DEFAULT.slice(),
  cbones: [],
  ovbones: []
};

function boneLabel(idx) {
  const key = BONE_LABELS[idx];
  if (!key) return String(idx);
  return typeof t === "function" ? t(key) : key;
}

function renderBoneChips(cmd) {
  const box = document.getElementById(BONE_GROUPS[cmd].chips);
  if (!box) return;
  const list = boneList[cmd] || [];
  box.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("span");
    empty.className = "bone-empty";
    empty.textContent = typeof t === "function" ? t("boneNone") : "";
    box.appendChild(empty);
    return;
  }
  list.forEach((idx) => {
    const chip = document.createElement("span");
    chip.className = "bone-chip";
    chip.textContent = boneLabel(idx);

    const x = document.createElement("button");
    x.type = "button";
    x.className = "bone-chip-x";
    x.textContent = "✕";
    x.title = typeof t === "function" ? t("remove") : "Remove";
    x.addEventListener("click", () => removeBone(cmd, idx));

    chip.appendChild(x);
    box.appendChild(chip);
  });
}

function sendBones(cmd) {
  nativeSend(cmd + "|" + (boneList[cmd] || []).join(","));
}

function addBone(cmd, idx) {
  if (!boneList[cmd]) boneList[cmd] = [];
  if (idx < 0 || idx >= BONE_LABELS.length) return;
  if (boneList[cmd].indexOf(idx) >= 0) return;   // ya está
  boneList[cmd].push(idx);
  renderBoneChips(cmd);
  sendBones(cmd);
}

function removeBone(cmd, idx) {
  if (!boneList[cmd]) return;
  boneList[cmd] = boneList[cmd].filter((v) => v !== idx);
  renderBoneChips(cmd);
  sendBones(cmd);
}

// state.bones / tbones / fbones / cbones / ovbones -> chips
function applyBonesState(state) {
  Object.keys(BONE_GROUPS).forEach((cmd) => {
    const raw = state[cmd];
    if (raw == null) return;
    const arr = Array.isArray(raw) ? raw : String(raw).split(",");
    const parsed = [];
    arr.forEach((v) => {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= 0 && n < BONE_LABELS.length && parsed.indexOf(n) < 0)
        parsed.push(n);
    });
    boneList[cmd] = parsed;
    renderBoneChips(cmd);
  });
}

(function initBoneChips() {
  Object.keys(BONE_GROUPS).forEach((cmd) => {
    const sel = document.getElementById(BONE_GROUPS[cmd].picker);
    if (!sel) return;
    sel.addEventListener("change", () => {
      const idx = parseInt(sel.value, 10);
      // El desplegable vuelve siempre a "Añadir hueso"
      sel.selectedIndex = 0;
      if (typeof rebuildSelect === "function") rebuildSelect(sel);
      if (!isNaN(idx)) addBone(cmd, idx);
    });
    renderBoneChips(cmd);
  });

  // applyLang() no re-renderiza los chips (son nodos creados por JS), así que
  // al cambiar de idioma se vuelven a pintar para traducir sus etiquetas.
  document.querySelectorAll("[data-lang]").forEach((b) => {
    b.addEventListener("click", () => {
      setTimeout(() => { Object.keys(BONE_GROUPS).forEach(renderBoneChips); }, 0);
    });
  });
})();

// ESP: pestanas Players / Objetivos / Amigos + listas de nombres
// Las listas viven SOLO en el C++ (memoria).
(function () {
  function $(id) { return document.getElementById(id); }
  // Pestanas por GRUPO: Visual (data-tabgroup="esp") y Aimbot ("aim").
  // Cada grupo tiene sus botones .esp-tab y sus paneles .esp-pane.
  function groupOf(el) { return el.getAttribute("data-tabgroup") || "esp"; }
  function tabsOf(group) {
    return document.querySelectorAll('.esp-tab[data-tabgroup="' + group + '"]');
  }
  function panesOf(group) {
    return document.querySelectorAll('.esp-pane[data-tabgroup="' + group + '"]');
  }
  document.querySelectorAll(".esp-tab").forEach(function (b) {
    b.addEventListener("click", function () {
      const group = groupOf(b);
      const k = b.getAttribute("data-esptab");
      tabsOf(group).forEach(function (x) { x.classList.toggle("on", x === b); });
      panesOf(group).forEach(function (p) {
        p.classList.toggle("on", p.id === group + "-pane-" + k);
      });
    });
  });
  // La busqueda del menu tiene que poder abrir la pestana donde vive el ajuste.
  window.activateTabFor = function (el) {
    if (!el || !el.closest) return false;
    const pane = el.closest(".esp-pane");
    if (!pane) return false;
    const group = groupOf(pane);
    const k = pane.id.replace(group + "-pane-", "");
    const btn = document.querySelector(
      '.esp-tab[data-tabgroup="' + group + '"][data-esptab="' + k + '"]');
    if (!btn) return false;
    btn.click();
    return true;
  };
  const LISTS = { targets: [], friends: [] };
  const VIEW = { targets: false, friends: false };
  const esc = function (v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  function items(kind) {
    const arr = LISTS[kind] || [];
    if (!arr.length) return '<div class="nm-empty">Sin nombres todavia</div>';
    return arr.map(function (n) {
      return '<div class="nm-item"><span>' + esc(n) + '</span>' +
        '<button type="button" class="nm-del" data-kind="' + kind + '" data-name="' + esc(n) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    }).join("");
  }
  // La lista se ve en un POP UP (boton "Ver lista")
  function render(kind) {
    const box = $(kind === "targets" ? "targetList" : "friendList");
    if (box) box.innerHTML = "";
    const modal = $("nmModal");
    if (modal && !modal.hidden && MODAL_KIND === kind) {
      const ml = $("nmModalList");
      if (ml) ml.innerHTML = items(kind);
    }
  }
  let MODAL_KIND = "targets";

  function renderPool() {
    const box = $("nmModalPool");
    if (!box) return;
    const inp = $("nmModalSearch");
    const q = inp ? inp.value.trim().toLowerCase() : "";
    const mine = LISTS[MODAL_KIND] || [];
    const list = POOL.filter(function (n) {
      if (mine.indexOf(n.toLowerCase()) >= 0) return false;   // ya agregado
      return !q || n.toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) {
      box.innerHTML = '<div class="nm-pool-empty">' +
        (POOL.length ? "Sin coincidencias" : "Sin jugadores en la partida") + '</div>';
      return;
    }
    box.innerHTML = list.slice(0, 60).map(function (n) {
      return '<div class="nm-pool-item" data-name="' + esc(n) + '">' + esc(n) + '</div>';
    }).join("");
  }

  window.openNmModal = function (kind) {
    MODAL_KIND = kind;
    const ttl = $("nmModalTitle");
    if (ttl) ttl.textContent = (kind === "targets") ? t("espTabTargets") : t("espTabFriends");
    const inp = $("nmModalSearch");
    if (inp) inp.value = "";
    const ml = $("nmModalList");
    if (ml) ml.innerHTML = items(kind);
    renderPool();
    const m = $("nmModal");
    if (m) m.hidden = false;
  };

  // buscar dentro del pop up
  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "nmModalSearch") renderPool();
  });
  // clic en un jugador del pool -> agregar
  document.addEventListener("click", function (e) {
    const it = (e.target && e.target.closest) ? e.target.closest(".nm-pool-item") : null;
    if (!it) return;
    nativeSend((MODAL_KIND === "targets" ? "tadd|" : "fadd|") + it.getAttribute("data-name"));
  });

  // ---- Preview POR PESTANA ----
  // Las tres pestanas (General / Objetivos / Amigos) son tres configs distintas
  // del usuario, asi que cada una tiene SU preview: los interruptores los lee
  // player3d.js directamente de la pestana activa y los colores salen de
  // window.espColorsByTab (lo llena setState con el state del C++).
  window.applyEspPreviewColors = function () {
    const tab = (typeof window.activeEspTab === "function") ? window.activeEspTab() : "players";
    const all = window.espColorsByTab || {};
    const base = all.players || {};
    const useNamed = (tab !== "players") && window.espNamesEnabled !== false;
    window.espColors = Object.assign({}, base, useNamed ? (all[tab] || {}) : {});
  };
  // Solo las pestanas del ESP repintan el preview 3D (las del Aimbot no).
  document.querySelectorAll('.esp-tab[data-tabgroup="esp"]').forEach(function (b) {
    b.addEventListener("click", function () { window.applyEspPreviewColors(); });
  });

  // Cambiar un color no devuelve state desde el C++: se refleja al instante en
  // el preview de SU pestana (y solo en el de esa pestana).
  const COLOR_TAB = {
    colvis: "players", colhid: "players", coldown: "players",
    coltext: "players", coltextsm: "players", coloutline: "players",
    namestargetcolor: "targets", namesfriendcolor: "friends"
  };
  const COLOR_PREVIEW_KEY = {
    colvis: ["visible"], colhid: ["hidden"], coldown: ["downed"],
    coltext: ["text"], coltextsm: ["textSmall"], coloutline: ["outline"],
    namestargetcolor: ["visible", "hidden", "downed"],
    namesfriendcolor: ["visible", "hidden", "downed"]
  };
  window.setEspPreviewColor = function (cmd, hex) {
    const tab = COLOR_TAB[cmd], keys = COLOR_PREVIEW_KEY[cmd];
    if (!tab || !keys || !hex) return;
    const all = window.espColorsByTab = window.espColorsByTab || {};
    all[tab] = all[tab] || {};
    keys.forEach(function (k) { all[tab][k] = hex; });
    window.applyEspPreviewColors();
  };
  function closeNmModal() { const m = $("nmModal"); if (m) m.hidden = true; }
  document.addEventListener("click", function (e) {
    if (e.target && e.target.closest && e.target.closest("[data-nm-close]")) closeNmModal();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNmModal(); });
  function add(kind) {
    const inp = $(kind === "targets" ? "targetSearch" : "friendSearch");
    if (!inp) return;
    const v = inp.value.trim();
    if (!v) return;
    nativeSend((kind === "targets" ? "tadd|" : "fadd|") + v);
    VIEW[kind] = true;
    inp.value = "";
  }
  ["targets", "friends"].forEach(function (k) {
    const btn = $(k === "targets" ? "targetAdd" : "friendAdd");
    if (btn) btn.addEventListener("click", function () { add(k); });
    const inp = $(k === "targets" ? "targetSearch" : "friendSearch");
    if (inp) inp.addEventListener("keydown", function (e) { if (e.key === "Enter") add(k); });
    const vw = $(k === "targets" ? "targetView" : "friendView");
    if (vw) vw.addEventListener("click", function () { window.openNmModal(k); });
  });
  document.addEventListener("click", function (e) {
    const b = (e.target && e.target.closest) ? e.target.closest(".nm-del") : null;
    if (!b) return;
    const kind = b.getAttribute("data-kind");
    nativeSend((kind === "targets" ? "tdel|" : "fdel|") + b.getAttribute("data-name"));
  });
  window.applyNamedLists = function (targets, friends) {
    LISTS.targets = Array.isArray(targets) ? targets : [];
    LISTS.friends = Array.isArray(friends) ? friends : [];
    render("targets"); render("friends");
  };
  // ---- Nombres del player list (para buscar y seleccionar) ----
  let POOL = [];

  function inputOf(kind) { return $(kind === "targets" ? "targetSearch" : "friendSearch"); }

  function ddOf(kind) {
    const inp = inputOf(kind);
    if (!inp) return null;
    const wrap = inp.parentNode;
    if (!wrap) return null;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    let dd = wrap.querySelector(".nm-dd");
    if (!dd) {
      dd = document.createElement("div");
      dd.className = "nm-dd";
      wrap.appendChild(dd);
    }
    return dd;
  }

  function showDd(kind) {
    const inp = inputOf(kind), dd = ddOf(kind);
    if (!inp || !dd) return;
    const q = inp.value.trim().toLowerCase();
    const list = POOL.filter(function (n) { return !q || n.toLowerCase().indexOf(q) >= 0; });
    if (!list.length) {
      dd.innerHTML = '<div class="nm-dd-empty">' + (POOL.length ? "Sin coincidencias" : "Sin jugadores en la partida") + '</div>';
    } else {
      dd.innerHTML = list.slice(0, 50).map(function (n) {
        return '<div class="nm-dd-item" data-kind="' + kind + '" data-name="' + esc(n) + '">' + esc(n) + '</div>';
      }).join("");
    }
    dd.classList.add("on");
  }

  function hideDd(kind) {
    const dd = ddOf(kind);
    if (dd) dd.classList.remove("on");
  }

  // El C++ manda la lista de jugadores de la partida
  window.fillPlayersDatalist = function (players) {
    if (!Array.isArray(players)) return;
    POOL = players.map(function (p) { return String((p && p.username) || "").trim(); }).filter(Boolean);
  };

  // clic en una sugerencia -> agregar
  document.addEventListener("click", function (e) {
    const it = (e.target && e.target.closest) ? e.target.closest(".nm-dd-item") : null;
    if (!it) return;
    const kind = it.getAttribute("data-kind");
    const nm = it.getAttribute("data-name");
    nativeSend((kind === "targets" ? "tadd|" : "fadd|") + nm);
    const inp = inputOf(kind);
    if (inp) inp.value = "";
    hideDd(kind);
  });

  ["targets", "friends"].forEach(function (k) {
    const inp = inputOf(k);
    if (!inp) return;
    inp.removeAttribute("list");
    inp.addEventListener("input", function () { showDd(k); });
    inp.addEventListener("focus", function () { showDd(k); });
    inp.addEventListener("blur", function () { setTimeout(function () { hideDd(k); }, 180); });
  });
  nativeSend("lists");
})();
