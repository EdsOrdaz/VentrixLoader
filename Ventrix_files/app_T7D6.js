function nativeSend(cmd) {
  if (window.chrome && chrome.webview && chrome.webview.postMessage)
    chrome.webview.postMessage(cmd);
}

// El idioma activo llega desde C++ (state.lang); nada se guarda en localStorage.
let lang = "en";

function t(key) {
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}


const titlebar = document.querySelector(".titlebar");
if (titlebar) {
  titlebar.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, a, .search-wrap, .lang-dd, .dd, .iro-pop, .color-pick")) return;
    nativeSend("drag");
  });
}

function showPage(name) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === "page-" + name);
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === name);
  });
  if (name === "players") {
    requestAnimationFrame(() => {
      const api = typeof window.getPlayersGrid === "function" ? window.getPlayersGrid() : null;
      if (api && typeof api.refreshHeaderAndBodyHeight === "function") {
        try { api.refreshHeaderAndBodyHeight(); } catch (_) {}
      }
      window.dispatchEvent(new Event("resize"));
    });
  }
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.onclick = () => showPage(btn.dataset.page);
});

const INF_ICON = "∞";


document.querySelectorAll(".seg").forEach((group) => {
  group.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      group.querySelectorAll("button").forEach((other) => other.classList.remove("on"));
      btn.classList.add("on");
    };
  });
});

document.querySelectorAll(".range-wrap").forEach((wrap) => {
  const input = wrap.querySelector("input[type='range']");
  const label = wrap.querySelector("span");
  if (!input) return;
  const bar = document.createElement("div");
  bar.className = "range-bar";
  const fill = document.createElement("i");
  fill.className = "range-fill";
  input.parentNode.insertBefore(bar, input);
  bar.appendChild(fill);
  bar.appendChild(input);
  const sync = () => {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const p = ((Number(input.value) - min) / (max - min || 1)) * 100;
    fill.style.width = p + "%";
    if (!label) return;
    if (wrap.dataset.unlimited !== undefined && Number(input.value) <= min) {
      label.classList.add("inf");
      label.innerHTML = INF_ICON;
    } else {
      label.classList.remove("inf");
      label.textContent = input.value + (input.dataset.unit || "");
    }
  };
  input.addEventListener("input", () => {
    sync();
    if (input.id === "fpsLimit") {
      nativeSend("fps|" + input.value);
    }
  });
  input.addEventListener("change", sync);
  sync();
});

const iroPop = document.getElementById("iroPop");
const iroHex = document.getElementById("iroHex");
let iroPicker = null;
let iroTarget = null;

function hexOf(color) {
  return String(color || "#445c7f").replace("#", "").padStart(6, "0").slice(0, 6);
}

function setChip(pick, hex) {
  const chip = pick.querySelector(".chip");
  const label = pick.querySelector(".hex");
  const value = "#" + hexOf(hex);
  if (chip) chip.style.background = value;
  if (label) label.textContent = value.toUpperCase();
  pick.dataset.color = value;
}

function setAccent(hex) {
  const value = "#" + hexOf(hex);
  const h = hexOf(value);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const root = document.documentElement.style;
  root.setProperty("--accent", value);
  const d = (c, n) => Math.max(0, Math.min(255, c + n)).toString(16).padStart(2, "0");
  root.setProperty("--accent-2", "#" + d(r, -28) + d(g, -22) + d(b, -8));
  root.setProperty("--accent-dim", "rgba(" + r + "," + g + "," + b + ",0.18)");
  root.setProperty("--accent-glow", "rgba(" + r + "," + g + "," + b + ",0.32)");

  // El matiz del accent tine TODA la interfaz (fondo, paneles, tarjetas,
  // campos, checks, menus, scrollbar, textos...). Solo se copia el TONO:
  // la claridad y la saturacion de cada superficie estan fijas en style.css
  // (hsl(var(--tint-h) S% L%)), asi que nada se aclara ni se oscurece.
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const mx = Math.max(rf, gf, bf), mn = Math.min(rf, gf, bf), span = mx - mn;
  if (span > 0.02) {                 // accent casi gris: se mantiene el tono actual
    let hue = mx === rf ? 60 * (((gf - bf) / span) % 6)
      : mx === gf ? 60 * ((bf - rf) / span + 2)
        : 60 * ((rf - gf) / span + 4);
    if (hue < 0) hue += 360;
    const NEUTRAL = 240;             // tono original de la interfaz
    const MIX = 1;                   // 0 = sin tinte, 1 = tono puro del accent
    const delta = ((hue - NEUTRAL + 540) % 360) - 180;
    root.setProperty("--tint-h", (NEUTRAL + delta * MIX).toFixed(1) + "deg");
  }

  // Rellenos del accent (cuadrito del menu activo, checks, botones...):
  // encima llevan un icono/tilde/texto claro, asi que con un color muy
  // claro se dejarian de ver. Para esos rellenos se usa el MISMO tono y
  // color, solo oscurecido lo justo hasta que el blanco se lea
  // (--accent-fill). --accent sigue siendo el color exacto que elegiste,
  // y bordes, sliders y textos no se tocan.
  const lumOf = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const relLum = (rr, gg, bb) => 0.2126 * lumOf(rr) + 0.7152 * lumOf(gg) + 0.0722 * lumOf(bb);
  let k = 1;
  while (k > 0.3 && relLum(r * k, g * k, b * k) > 0.26) k -= 0.03;
  root.setProperty("--accent-fill", "#" + [r, g, b].map((v) =>
    Math.round(v * k).toString(16).padStart(2, "0")).join(""));

  // Avisa a los canvas (preview 3D) para que su fondo use el mismo tono.
  window.dispatchEvent(new CustomEvent("vtxaccent"));

  const pick = document.getElementById("uiAccentPick");
  if (pick && pick !== iroTarget) setChip(pick, value);
}

function ensureIro() {
  if (iroPicker || typeof iro === "undefined") return iroPicker;
  iroPicker = new iro.ColorPicker("#iroWheel", {
    width: 176,
    color: "#445c7f",
    borderWidth: 0,
    layout: [
      { component: iro.ui.Box, options: { boxHeight: 120 } },
      { component: iro.ui.Slider, options: { sliderType: "hue" } }
    ]
  });
  iroPicker.on("color:change", (c) => {
    if (!iroTarget) return;
    setChip(iroTarget, c.hexString);
    if (iroHex) iroHex.value = c.hexString.toUpperCase();
    if (iroTarget.hasAttribute("data-accent")) setAccent(c.hexString);
    if (typeof window.onIroChange === "function")
      window.onIroChange(iroTarget, c.hexString);
  });
  return iroPicker;
}

function openIro(pick) {
  const picker = ensureIro();
  if (!picker || !iroPop) return;
  iroTarget = pick;
  const hex = pick.dataset.color || pick.querySelector("input")?.value || "#445c7f";
  picker.color.hexString = hex;
  if (iroHex) iroHex.value = String(hex).toUpperCase();
  const r = pick.getBoundingClientRect();
  iroPop.hidden = false;
  const pw = iroPop.offsetWidth || 200;
  const ph = iroPop.offsetHeight || 200;
  let left = r.right - pw;
  let top = r.bottom + 8;
  if (left < 12) left = 12;
  if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
  if (top + ph > window.innerHeight - 12) top = r.top - ph - 8;
  iroPop.style.left = left + "px";
  iroPop.style.top = top + "px";
}

document.querySelectorAll(".color-pick").forEach((pick) => {
  const input = pick.querySelector("input");
  let start = (input && input.value) || "#5B5A8F";
  if (pick.hasAttribute("data-accent")) start = "#445c7f";
  if (input) input.remove();
  setChip(pick, start);
  if (pick.hasAttribute("data-accent")) setAccent(start);
  pick.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openIro(pick);
  });
});

if (iroHex) {
  iroHex.addEventListener("change", () => {
    const v = iroHex.value.startsWith("#") ? iroHex.value : "#" + iroHex.value;
    if (!/^#[0-9a-fA-F]{6}$/.test(v) || !iroPicker) return;
    iroPicker.color.hexString = v;
  });
}

const PLAT_LABEL = {
  steam: "Steam",
  battlenet: "Battle.net",
  bnet: "Battle.net",
  "battle.net": "Battle.net",
  gamepass: "Game Pass",
  "game pass": "Game Pass",
  xbox: "Xbox",
  playstation: "PlayStation",
  ps: "PlayStation"
};

function setPlatform(name) {
  const el = document.getElementById("platLabel");
  if (!el) return;
  const raw = String(name || "").trim();
  if (!raw) {
    el.dataset.i18n = "detecting";
    el.textContent = t("detecting");
    return;
  }
  const mapped = PLAT_LABEL[raw.toLowerCase()] || raw;
  delete el.dataset.i18n;
  el.textContent = mapped;
}

function setResellerLogo(id, name) {
  // La aplicacion real vive en el script inline de index.html, que ya corre en
  // la primera pasada del parser con window.__VTX_RESELLER__ (lo inyecta el C++
  // antes de cargar la pagina). Se reusa para no tener dos implementaciones:
  // el state solo actua como respaldo (p.ej. si el HTML es antiguo).
  if (typeof window.vtxApplyReseller === "function") {
    window.vtxApplyReseller(id, name);
    return;
  }
  const el = document.getElementById("brandLogo");
  if (!el) return;
  const n = Number(id) || 0;
  const nm = String(name || "").trim();

  // Ventrix (id 1) -> logo por defecto
  if (n <= 1) {
    el.src = "assets/logo-text.png";
    return;
  }

  // Imagen del reseller; si no existe -> solo el NOMBRE en texto
  el.src = "assets/resellerslogo/" + n + ".png";
  el.onerror = function () {
    el.onerror = null;
    const span = document.createElement("span");
    span.className = el.className;
    span.id = el.id;
    span.textContent = nm;   // sin nombre -> vacio, NUNCA "Ventrix"
    span.style.cssText = "font-family:var(--display,Unbounded),sans-serif;font-weight:700;font-size:16px;letter-spacing:.04em;color:var(--text);text-transform:uppercase;white-space:nowrap";
    el.replaceWith(span);
  };
}

function onNativeMessage(data) {
  let msg = data;
  if (typeof msg === "string") {
    try { msg = JSON.parse(msg); } catch (_) { return; }
  }
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "platform") setPlatform(msg.value);
  if (msg.type === "state") {
    if (msg.platform != null) setPlatform(msg.platform);
    if (msg.reseller != null) setResellerLogo(msg.reseller, msg.resellername);
    if (msg.overlay != null) {
      const ov = document.getElementById("overlayMode");
      if (ov) {
        ov.value = String(msg.overlay);
        rebuildSelect(ov);
      }
    }
    if (msg.vsync != null) {
      const el = document.getElementById("vsyncCheck");
      if (el) el.classList.toggle("on", !!msg.vsync);
    }
    if (msg.hidemouse != null) {
      const el = document.getElementById("hideMouseCheck");
      if (el) el.classList.toggle("on", !!msg.hidemouse);
    }
    if (msg.fps != null) {
      const fps = document.getElementById("fpsLimit");
      if (fps) {
        fps.value = String(msg.fps);
        fps.dispatchEvent(new Event("input"));
      }
    }
  }
}

if (window.chrome && chrome.webview && chrome.webview.addEventListener) {
  chrome.webview.addEventListener("message", (ev) => onNativeMessage(ev.data));
}
window.addEventListener("message", (ev) => {
  if (ev.data && ev.data.type) onNativeMessage(ev.data);
});
nativeSend("get_state");

document.querySelectorAll(".profile-item").forEach((item) => {
  item.onclick = () => {
    document.querySelectorAll(".profile-item").forEach((other) => other.classList.remove("on"));
    item.classList.add("on");
  };
});

// Key binding (`.bind[data-cmd]`) ahora se maneja en command.js
// para centralizar el envío de comandos al backend.

const langBtn = document.getElementById("langBtn");
const langMenu = document.getElementById("langMenu");

if (langBtn && langMenu) {
  langBtn.onclick = (ev) => {
    ev.stopPropagation();
    const isOpen = !langMenu.hidden;
    langMenu.hidden = isOpen;
    langBtn.classList.toggle("open", !isOpen);
  };

  langMenu.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.onclick = () => {
      const code = btn.dataset.lang;
      applyLang(code);
      // El idioma se guarda en C++, no en el navegador
      nativeSend("lang|" + code);
      langMenu.hidden = true;
      langBtn.classList.remove("open");
    };
  });

  document.addEventListener("click", () => {
    langMenu.hidden = true;
    langBtn.classList.remove("open");
  });
}

const LANG_NAMES = {
  es: "Español",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  pt: "Português",
  ru: "Русский",
  zh: "中文"
};

// Aplica el idioma a TODO el menú: textos, placeholders, títulos y selects.
function applyLang(l) {
  if (!I18N[l]) l = "en";
  lang = l;

  if (langBtn) {
    langBtn.querySelectorAll(".flag").forEach((f) => {
      f.hidden = f.dataset.flag !== lang;
    });
    const lbl = document.getElementById("langLabel");
    if (lbl) lbl.textContent = LANG_NAMES[lang] || "English";
  }

  // Textos con data-i18n (conserva hijos dinámicos tipo <strong id="...">)
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const val = t(key);
    if (el.children.length === 0) {
      el.textContent = val;
    } else {
      const first = el.childNodes[0];
      if (first && first.nodeType === 3) first.textContent = val;
    }
  });

  // Placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  // Tooltips
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });

  // Valores de inputs/readonly (ej. "Generando enlace..." del radar compartido)
  document.querySelectorAll("[data-i18n-value]").forEach((el) => {
    el.value = t(el.dataset.i18nValue);
  });

  // Selects custom: refresca las opciones traducidas
  if (typeof upgradeSelects === "function") upgradeSelects();
  else if (typeof rebuildSelect === "function") {
    document.querySelectorAll("select.select[data-upgraded]").forEach(rebuildSelect);
  }

  // Titulos de la tabla de jugadores (ag-Grid)
  if (typeof window.refreshPlayersGridLang === "function") window.refreshPlayersGridLang();

  // Etiquetas dinamicas (no llevan data-i18n): el boton de tecla del perfil.
  if (typeof updateHotkeyButton === "function") updateHotkeyButton();
}

const search = document.getElementById("search");
const pop = document.getElementById("searchResults");

// Etiqueta de la pestana (Players / Objetivos / Amigos) donde vive un ajuste.
// Sirve para distinguir las filas clonadas del ESP y del Aimbot en la busqueda.
function rowTabLabel(row) {
  if (!row.closest) return "";
  const pane = row.closest(".esp-pane");
  if (!pane) return "";
  const group = pane.getAttribute("data-tabgroup") || "esp";
  const key = pane.id.replace(group + "-pane-", "");
  const btn = document.querySelector(
    '.esp-tab[data-tabgroup="' + group + '"][data-esptab="' + key + '"]');
  return btn ? btn.textContent.trim() : "";
}

function settingIndex() {
  return [...document.querySelectorAll(".row[data-goto]")].map((row) => {
    const title = row.querySelector("strong");
    return {
      row,
      page: row.dataset.goto,
      title: title ? title.textContent : "",
      tab: rowTabLabel(row),
      hay: ((row.dataset.search || "") + " " + row.textContent).toLowerCase()
    };
  });
}

function renderSearch(q) {
  const query = q.trim().toLowerCase();
  if (!query) {
    pop.hidden = true;
    pop.innerHTML = "";
    return;
  }
  const hits = settingIndex().filter((item) => item.hay.includes(query)).slice(0, 8);
  if (!hits.length) {
    pop.hidden = false;
    pop.innerHTML = '<div class="search-empty">' + t("searchEmpty") + "</div>";
    return;
  }
  pop.hidden = false;
  pop.innerHTML = hits.map((item, i) =>
    '<button class="search-item' + (i === 0 ? " on" : "") + '" data-page="' + item.page + '"><span>' +
    item.title + '</span><small>' + t(item.page) + (item.tab ? " · " + item.tab : "") + "</small></button>"
  ).join("");
  pop.querySelectorAll(".search-item").forEach((btn, i) => {
    btn.onclick = () => {
      const hit = hits[i];
      showPage(hit.page);
      // Si el ajuste vive en una pestana (ESP / Aimbot Objetivos / Amigos) hay
      // que abrirla, o la fila quedaria dentro de un panel oculto.
      if (typeof window.activateTabFor === "function") window.activateTabFor(hit.row);
      hit.row.classList.add("hit");
      hit.row.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => hit.row.classList.remove("hit"), 1400);
      pop.hidden = true;
      search.blur();
    };
  });
}

if (search) {
  search.addEventListener("input", () => renderSearch(search.value));
  search.addEventListener("focus", () => renderSearch(search.value));
  search.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      search.value = "";
      pop.hidden = true;
      search.blur();
    }
    if (ev.key === "Enter") {
      const first = pop.querySelector(".search-item");
      if (first) first.click();
    }
  });
}

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Tab") {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  if (ev.key === "/" && document.activeElement !== search) {
    ev.preventDefault();
    search.focus();
  }
}, true);

document.addEventListener("mousedown", (ev) => {
  if (!ev.target.closest(".search-wrap")) pop.hidden = true;
  if (!ev.target.closest(".lang-dd") && langMenu) langMenu.hidden = true;
  if (!ev.target.closest(".dd")) closeSelects();
  if (iroPop && !ev.target.closest(".iro-pop") && !ev.target.closest(".color-pick"))
    iroPop.hidden = true;
});

function closeSelects() {
  document.querySelectorAll(".dd").forEach((dd) => {
    dd.classList.remove("open");
    const menu = dd.querySelector(".dd-menu");
    if (menu) menu.hidden = true;
  });
}

function rebuildSelect(sel) {
  if (!sel) return;
  const wrap = sel.closest(".dd");
  if (!wrap) return;
  const btn = wrap.querySelector(".dd-btn");
  const menu = wrap.querySelector(".dd-menu");
  if (!btn || !menu) return;
  const optText = (opt) => opt.dataset.i18n ? t(opt.dataset.i18n) : opt.textContent;
  menu.innerHTML = "";
  [...sel.options].forEach((opt, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = optText(opt);
    if (i === sel.selectedIndex) b.classList.add("on");
    b.onclick = () => {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      rebuildSelect(sel);
      closeSelects();
    };
    menu.appendChild(b);
  });
  const cur = sel.options[sel.selectedIndex];
  btn.textContent = cur ? optText(cur) : "";
}

function upgradeSelects() {
  document.querySelectorAll("select.select").forEach((sel) => {
    if (sel.dataset.upgraded) {
      rebuildSelect(sel);
      return;
    }
    sel.dataset.upgraded = "1";
    const wrap = document.createElement("div");
    wrap.className = "dd";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dd-btn";
    const menu = document.createElement("div");
    menu.className = "dd-menu";
    menu.hidden = true;
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    wrap.appendChild(sel);
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const open = wrap.classList.contains("open");
      closeSelects();
      if (!open) {
        wrap.classList.add("open");
        menu.hidden = false;
      }
    };
    rebuildSelect(sel);
  });
}


const profileTabs = document.querySelectorAll('.profiles-tab');
const profileViews = document.querySelectorAll('.profiles-view');

profileTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.profileTab;

    profileTabs.forEach(item => {
      item.classList.toggle('active', item === tab);
    });

    profileViews.forEach(view => {
      view.classList.toggle(
        'active',
        view.id === `profiles-${target}`
      );
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("communitySearch");
  const sortSelect = document.getElementById("communitySort");
  const profilesContainer = document.querySelector(".community-profiles");

  if (!searchInput || !sortSelect || !profilesContainer) return;

  const getProfiles = () => {
    return Array.from(
      profilesContainer.querySelectorAll(".community-profile")
    );
  };

  const getNumber = (element, selector) => {
    const value = element.querySelector(selector)?.textContent
      ?.trim()
      .replace(/[^0-9.kKmM]/g, "");

    if (!value) return 0;

    const normalized = value.toLowerCase();

    if (normalized.endsWith("k")) {
      return parseFloat(normalized) * 1000;
    }

    if (normalized.endsWith("m")) {
      return parseFloat(normalized) * 1000000;
    }

    return parseFloat(normalized) || 0;
  };

  const getDateValue = (element) => {
    const text = element
      .querySelector(".profile-item-info span")
      ?.textContent
      ?.toLowerCase() || "";

    if (text.includes("ahora")) return Date.now();

    const hours = text.match(/hace\s+(\d+)\s+hora/);
    if (hours) {
      return Date.now() - Number(hours[1]) * 60 * 60 * 1000;
    }

    const days = text.match(/hace\s+(\d+)\s+d[ií]a/);
    if (days) {
      return Date.now() - Number(days[1]) * 24 * 60 * 60 * 1000;
    }

    if (text.includes("ayer")) {
      return Date.now() - 24 * 60 * 60 * 1000;
    }

    return 0;
  };

  const filterProfiles = () => {
    const search = searchInput.value.trim().toLowerCase();
    const sort = sortSelect.value;

    const profiles = getProfiles();

    profiles.forEach(profile => {
      const name =
        profile.querySelector(".profile-item-info strong")
          ?.textContent
          ?.toLowerCase() || "";

      const author =
        profile.querySelector(".profile-item-info span")
          ?.textContent
          ?.toLowerCase() || "";

      const matches =
        !search ||
        name.includes(search) ||
        author.includes(search);

      profile.style.display = matches ? "flex" : "none";
    });

    const visibleProfiles = profiles.filter(
      profile => profile.style.display !== "none"
    );

    visibleProfiles.sort((a, b) => {
      switch (sort) {
        case "recent":
          return getDateValue(b) - getDateValue(a);

        case "oldest":
          return getDateValue(a) - getDateValue(b);

        case "rating":
        case "votes":
          return (
            getNumber(b, ".profile-rating span") -
            getNumber(a, ".profile-rating span")
          );

        case "downloads":
          return (
            getNumber(b, ".profile-downloads span") -
            getNumber(a, ".profile-downloads span")
          );

        case "least-downloads":
          return (
            getNumber(a, ".profile-downloads span") -
            getNumber(b, ".profile-downloads span")
          );

        case "popular":
          return (
            getNumber(b, ".profile-downloads span") -
            getNumber(a, ".profile-downloads span")
          );

        case "name-asc":
          return (
            a.querySelector(".profile-item-info strong")
              ?.textContent
              .localeCompare(
                b.querySelector(".profile-item-info strong")
                  ?.textContent
              ) || 0
          );

        case "name-desc":
          return (
            b.querySelector(".profile-item-info strong")
              ?.textContent
              .localeCompare(
                a.querySelector(".profile-item-info strong")
                  ?.textContent
              ) || 0
          );

        default:
          return 0;
      }
    });

    visibleProfiles.forEach(profile => {
      profilesContainer.appendChild(profile);
    });
  };

  searchInput.addEventListener("input", filterProfiles);
  sortSelect.addEventListener("change", filterProfiles);

  filterProfiles();
  upgradeSelects();

});

// Aplica el idioma inicial (en por defecto; C++ lo reemplaza vía state.lang)
applyLang(lang);


// ---------------------------------------------------------------------------
// Tooltip de ayuda: icono "?" al lado del titulo de la fila.
//   * El texto sale de data-tip -> I18N, traducido al vuelo (asi el cambio de
//     idioma no necesita re-aplicar nada).
//   * Sale con hover, con foco de teclado y con clic (asi funciona sin raton y
//     no se pelea mientras arrastras un slider).
//   * NO entra en el buscador: el texto esta en un atributo, no en el DOM.
// ---------------------------------------------------------------------------
(function () {
  if (typeof document === "undefined" || !document.body) return;
  var tip = document.createElement("div");
  tip.className = "row-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  var owner = null;

  function hide() { tip.hidden = true; owner = null; }

  function show(btn) {
    var key = btn.getAttribute("data-tip");
    var text = key ? t(key) : "";
    if (!text || text === key) { hide(); return; }   // sin traduccion: nada
    owner = btn;
    tip.textContent = text;
    tip.hidden = false;
    tip.style.animation = "none";
    void tip.offsetWidth;                            // reinicia la animacion de entrada
    tip.style.animation = "";
    var r = btn.getBoundingClientRect();
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = r.left + r.width / 2 - w / 2;
    var below = true;
    var y = r.bottom + 9;
    if (x < 12) x = 12;
    if (x + w > window.innerWidth - 12) x = window.innerWidth - w - 12;
    if (y + h > window.innerHeight - 12) { y = r.top - h - 9; below = false; }   // se abre arriba
    if (y < 12) y = 12;
    tip.classList.toggle("below", below);
    tip.classList.toggle("above", !below);
    var ax = r.left + r.width / 2 - x;               // la flechita apunta al icono
    if (ax < 14) ax = 14;
    if (ax > w - 14) ax = w - 14;
    tip.style.setProperty("--arrow-x", ax + "px");
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }

  function helpOf(ev) {
    var el = ev.target;
    return (el && el.closest) ? el.closest(".row-help") : null;
  }

  document.addEventListener("mouseover", function (ev) {
    var b = helpOf(ev);
    if (b) show(b); else if (owner) hide();
  });
  document.addEventListener("focusin", function (ev) {
    var b = helpOf(ev);
    if (b) show(b); else if (owner) hide();
  });
  document.addEventListener("click", function (ev) {
    var b = helpOf(ev);
    if (!b) { if (owner) hide(); return; }
    ev.preventDefault();
    if (owner === b && !tip.hidden) hide(); else show(b);
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && owner) hide();
  });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
})();
