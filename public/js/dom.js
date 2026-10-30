/**
 * Petit utilitaire DOM. Tout le texte passe par textContent : aucune donnée saisie par
 * un utilisateur n'est jamais interprétée comme du HTML (protection contre le XSS).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Champ de formulaire accessible : libellé relié, aide et message d'erreur annoncés. */
let fieldSeq = 0;
export function field(label, inputAttrs = {}, help = null) {
  const id = inputAttrs.id ?? `f${++fieldSeq}`;
  const helpId = help ? `${id}-help` : null;
  const tag = inputAttrs.tag ?? "input";
  const { tag: _ignored, options, ...rest } = inputAttrs;
  const input = tag === "select"
    ? h("select", { id, ...rest, "aria-describedby": helpId }, (options ?? []).map(([value, text]) => h("option", { value }, text)))
    : h(tag, { id, ...rest, "aria-describedby": helpId });
  return h("div", { class: "field" },
    h("label", { for: id }, label),
    input,
    help ? h("p", { class: "help", id: helpId }, help) : null,
  );
}

export function alertBox(message, kind = "error") {
  return h("p", { class: `alert alert-${kind}`, role: kind === "error" ? "alert" : "status" }, message);
}

/** Affiche une erreur dans un conteneur dédié d'un formulaire. */
export function showFormError(form, message) {
  let box = form.querySelector(".form-error");
  if (!box) {
    box = h("div", { class: "form-error" });
    form.prepend(box);
  }
  box.replaceChildren(message ? alertBox(message) : "");
  if (message) box.scrollIntoView({ block: "nearest" });
}

/** Désactive le bouton pendant l'envoi pour éviter les doubles soumissions. */
export async function withBusy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Patientez…";
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = label;
  }
}

let toastTimer;
export function toast(message) {
  const region = document.getElementById("toast");
  if (!region) return;
  region.textContent = message;
  region.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => region.classList.remove("visible"), 3500);
}

export function loading(text = "Chargement…") {
  return h("p", { class: "loading", role: "status" }, text);
}

export function emptyState(title, text) {
  return h("div", { class: "empty" }, h("p", { class: "empty-title" }, title), text ? h("p", {}, text) : null);
}

export function card(...children) {
  return h("section", { class: "card" }, ...children);
}
