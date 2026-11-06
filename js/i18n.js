/* =========================================================================
   Bennoo — langues de l'interface (français, anglais, wolof en bêta).

   Principe : le code de l'application reste écrit en français (langue de référence).
   Ce module traduit à l'affichage : chaque texte affiché, placeholder, aria-label ou
   title est cherché tel quel dans le dictionnaire de la langue choisie (js/i18n/xx.js),
   puis dans une liste de motifs pour les phrases qui contiennent un nombre ou un nom.
   Un texte absent du dictionnaire reste en français (repli volontaire).

   Le choix est gardé sur l'appareil (localStorage « bennoo:lang ») : il ne demande
   aucune donnée ni règle Firestore supplémentaire.
   ========================================================================= */
(() => {
"use strict";

const LANGS = {
  fr: { label: "Français", locale: "fr-FR" },
  en: { label: "English", locale: "en-GB" },
  wo: { label: "Wolof", locale: "fr-FR", beta: true },
};
const KEY = "bennoo:lang";

function initialLang() {
  try { const saved = localStorage.getItem(KEY); if (saved && LANGS[saved]) return saved; } catch { /* stockage bloqué */ }
  const nav = (navigator.languages?.[0] || navigator.language || "fr").toLowerCase();
  if (nav.startsWith("wo")) return "wo";
  if (nav.startsWith("en")) return "en";
  return "fr";
}

const lang = initialLang();
const dicts = {};          // { en: { map: Map, patterns: [[RegExp, fn]] } }
const cache = new Map();

/** Enregistre un dictionnaire (appelé par js/i18n/en.js et js/i18n/wo.js). */
function add(code, map, patterns = []) {
  dicts[code] = { map: new Map(Object.entries(map)), patterns: patterns.map(([re, fn]) => [new RegExp(re, "u"), fn]) };
  cache.clear();
}

const pl = (n, one, many) => (Number(String(n).replace(/\D/g, "")) > 1 ? many : one);

/** Traduit un texte français (ou le renvoie tel quel). Les espaces de début et de fin sont conservés. */
function t(text, depth = 0) {
  if (lang === "fr" || typeof text !== "string" || !text) return text;
  const d = dicts[lang];
  if (!d) return text;
  if (cache.has(text)) return cache.get(text);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  const [, lead, core, trail] = m;
  let out = core ? d.map.get(core) : undefined;
  if (out === undefined && core && depth < 4) {
    const sub = (s) => t(s, depth + 1);
    for (const [re, fn] of d.patterns) {
      const hit = re.exec(core);
      if (hit) { out = fn(hit, sub, pl); if (out !== undefined) break; }
    }
    // « J-60 · Organisateur », « Mariage · Dakar »… : chaque morceau séparément.
    if (out === undefined && core.includes(" · ")) {
      const parts = core.split(" · ");
      const tr = parts.map(sub);
      if (tr.some((p, i) => p !== parts[i])) out = tr.join(" · ");
    }
  }
  const result = out === undefined ? text : lead + out + trail;
  if (cache.size > 5000) cache.clear();
  cache.set(text, result);
  return result;
}

/* ---------- Dates et nombres ---------- */
const WO_MONTHS = ["Samwiyee", "Fewriyee", "Mars", "Awril", "Mee", "Suwe", "Sulet", "Ut", "Sàttumbar", "Oktoobar", "Nowàmbar", "Desàmbar"];
const WO_DAYS = ["Dibéer", "Altine", "Talaata", "Àlarba", "Alxamis", "Àjjuma", "Aseer"];

/** Équivalent de new Intl.DateTimeFormat(locale, options) pour la langue choisie.
 *  Wolof : les navigateurs n'ont pas toujours les noms wolof ; on formate à la française
 *  et on remplace les noms de jours et de mois (calendrier CLDR « wo »). */
function dateFormat(options) {
  const fmt = new Intl.DateTimeFormat(LANGS[lang].locale, options);
  if (lang !== "wo") return fmt;
  return {
    format(date) {
      return fmt.formatToParts(date).map((p) => {
        if (p.type === "month" && options.month === "long") return WO_MONTHS[date.getMonth()];
        if (p.type === "weekday") return WO_DAYS[date.getDay()];
        return p.value;
      }).join("");
    },
  };
}

/** Heure « 18:30 » (ou « 18 h 30 » en français si separator est donné). */
function time(date, frSeparator = null) {
  const s = date.toLocaleTimeString(LANGS[lang].locale, { hour: "2-digit", minute: "2-digit" });
  return frSeparator && LANGS[lang].locale === "fr-FR" ? s.replace(":", frSeparator) : s;
}

/* ---------- Traduction de la page ---------- */
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP = "script, style, textarea, [translate='no']";
const done = new WeakMap(); // nœud texte -> dernière valeur posée par la traduction

function translateText(node) {
  const v = node.nodeValue;
  if (!v || done.get(node) === v || !/\p{L}/u.test(v)) return;
  if (node.parentElement?.closest(SKIP)) return;
  const tv = t(v);
  done.set(node, tv);
  if (tv !== v) node.nodeValue = tv;
}
function translateAttrs(el) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const tv = t(v);
    if (tv !== v) el.setAttribute(a, tv);
  }
  if (el.tagName === "INPUT" && /^(button|submit)$/i.test(el.type) && el.value) el.value = t(el.value);
}
function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches(SKIP)) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n);
    else translateAttrs(n);
  }
}

function start() {
  document.documentElement.lang = lang;
  if (lang === "fr") return;
  translateTree(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(translateTree);
      else if (r.type === "characterData") translateText(r.target);
      else if (r.type === "attributes") translateAttrs(r.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // Fenêtres du navigateur (confirmation, saisie, alerte) : textes écrits par l'application.
  const { confirm: c, prompt: p, alert: a } = window;
  window.confirm = (msg) => c.call(window, t(String(msg ?? "")));
  window.prompt = (msg, def) => p.call(window, t(String(msg ?? "")), def);
  window.alert = (msg) => a.call(window, t(String(msg ?? "")));
}

/* ---------- Choix de la langue ---------- */
function setLang(code) {
  if (!LANGS[code] || code === lang) return;
  try { localStorage.setItem(KEY, code); } catch { /* stockage bloqué : le choix vaut pour cette page */ }
  location.reload();
}

/** Sélecteur de langue (jamais traduit : chaque langue s'affiche dans sa propre langue). */
function picker({ compact = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = compact ? "lang-picker compact" : "lang-picker";
  wrap.setAttribute("translate", "no");
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", { fr: "Langue", en: "Language", wo: "Làkk" }[lang]);
  for (const [code, info] of Object.entries(LANGS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lang-chip" + (code === lang ? " active" : "");
    b.setAttribute("aria-pressed", String(code === lang));
    b.setAttribute("lang", code);
    b.textContent = info.label + (info.beta && !compact ? " (bêta)" : "");
    b.addEventListener("click", () => setLang(code));
    wrap.append(b);
  }
  return wrap;
}

window.BennooI18n = {
  lang, LANGS, add, t, dateFormat, time, picker, setLang,
  locale: LANGS[lang].locale,
  get coverage() { return dicts[lang]?.map.size ?? 0; },
};
document.addEventListener("DOMContentLoaded", start);
})();
