/**
 * Éléments d'interface communs : icônes, avatars, en-têtes, barre de navigation.
 */
import { h } from "./dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  family: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6zm12.5 0c0-2-.6-3.8-1.7-5.2.9-.5 2-.8 3.2-.8 3.3 0 6 2.7 6 6z",
  more: "M5 12a2 2 0 1 0 0-.01zM12 12a2 2 0 1 0 0-.01zM19 12a2 2 0 1 0 0-.01z",
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "currentColor");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", ICONS[name]);
  svg.append(p);
  return svg;
}

/** Barre de navigation : seules les rubriques déjà développées apparaissent (pas de lien mort). */
export function tabbar(active) {
  const link = (href, name, label, key) =>
    h("a", { href, "aria-current": active === key ? "page" : null }, icon(name), h("span", {}, label));
  return h("nav", { class: "tabbar", "aria-label": "Navigation principale" },
    h("a", { href: "#/", class: "brand-side" }, h("img", { src: "/img/logo.svg", alt: "" }), "Bennoo"),
    link("#/", "home", "Accueil", "home"),
    link("#/familles", "family", "Famille", "family"),
    link("#/plus", "more", "Plus", "more"),
  );
}

const AVATAR_COLORS = ["#6d28d9", "#b7791f", "#0e7490", "#be185d", "#4d7c0f", "#1d4ed8", "#9333ea", "#c2410c"];
export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
export function avatar(name, cls = "") {
  let hash = 0;
  for (const c of String(name)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const el = h("span", { class: `avatar ${cls}`, "aria-hidden": "true" }, initials(name));
  el.style.background = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return el;
}

export function header(title, backHref) {
  return h("div", { class: "screen-head" },
    backHref ? h("a", { href: backHref, class: "back", "aria-label": "Retour" }, "‹") : null,
    h("h1", {}, title),
  );
}

export const EVENT_ICONS = {
  WEDDING: "💍", NAMING_CEREMONY: "👶", COMMUNION: "🕊️", BIRTHDAY: "🎂",
  RELIGIOUS_CEREMONY: "🕌", FAMILY_REUNION: "👨‍👩‍👧‍👦", TRADITIONAL_CEREMONY: "🥁", CUSTOM: "✨",
};
