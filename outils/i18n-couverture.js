/* Bennoo — couverture des traductions.
   Usage : node outils/i18n-couverture.js [en|wo]
   Liste les textes français de js/app.js qui n'ont ni traduction exacte ni motif dans js/i18n/<langue>.js.
   (Heuristique : certains « textes » listés sont des valeurs techniques, et les phrases construites
   par morceaux sont vérifiées à l'écran.) */
const fs = require("fs");
const path = require("path");
const lang = process.argv[2] || "en";
const root = path.join(__dirname, "..");
const store = {};
global.window = global; global.navigator = { languages: [lang] }; global.localStorage = { getItem: () => lang, setItem() {} };
global.document = { addEventListener() {}, documentElement: {} };
eval(fs.readFileSync(path.join(root, "js/i18n.js"), "utf8"));
eval(fs.readFileSync(path.join(root, `js/i18n/${lang}.js`), "utf8"));
const { t } = window.BennooI18n;
const src = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const seen = new Set(); const missing = [];
for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
  const s = m[1].replace(/\\"/g, '"').trim();
  if (!s || seen.has(s) || !/[a-zàâçéèêëîïôûùüœ]{3,}/i.test(s)) continue;
  seen.add(s);
  if (/^[\w.:/#[\]=,()-]+$/.test(s) && !/[A-ZÀ-Ý]/.test(s[0])) continue;          // clés, classes, chemins
  if (/^(linear-gradient|rgba|https?:|data:|[MmLl]\d|italic|\d+ \d+px|\(|:scope|\.|input, )/.test(s)) continue;
  if (!/[àâçéèêëîïôûùüœ]|\b(le|la|les|de|des|du|un|une|vous|votre|pour|avec|et|est|au|en|à)\b/i.test(s) && !/^[A-ZÉ][a-zé]+$/.test(s)) continue;
  if (t(s) === s) missing.push(s);
}
console.log(`${lang} : ${seen.size} textes examinés, ${missing.length} sans traduction`);
for (const s of missing) console.log("  - " + s);
