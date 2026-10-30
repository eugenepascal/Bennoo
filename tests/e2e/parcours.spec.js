/**
 * Parcours de l'étape 1 de bout en bout, dans un vrai navigateur (format mobile), contre les
 * émulateurs Firebase : inscription → vérification email → famille → invitation d'un proche →
 * création d'événement en 5 étapes → ajout du proche comme trésorier → confidentialité.
 */
import { test, expect } from "@playwright/test";

const AUTH_EMULATOR = "http://127.0.0.1:9099";
const PROJECT = "demo-bennoo";
const run = Date.now();
const awa = { first: "Awa", last: "Diop", email: `awa.${run}@example.sn`, password: "motdepasse-awa" };
const ibou = { first: "Ibou", last: "Fall", email: `ibou.${run}@example.fr`, password: "motdepasse-ibou" };
const pathOf = (url) => url.replace(/^https?:\/\/[^/]+/, "");

// En cas d'échec, le texte de l'écran est écrit dans le journal (lisible depuis la CI).
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const text = await page.locator("body").innerText().catch(() => "");
    console.log(`ECRAN-ECHEC: ${text.replace(/\s+/g, " ").slice(0, 400)}`);
  }
});

async function signUp(page, user) {
  await page.goto("/#/inscription");
  await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
  await page.getByLabel("Prénom").fill(user.first);
  await page.getByLabel("Nom", { exact: true }).fill(user.last);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(user.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { name: "Vérifiez votre adresse email" })).toBeVisible();
}

/** Récupère le lien de vérification envoyé par l'émulateur et l'ouvre, comme un clic dans l'email. */
async function verifyEmail(page, request, email) {
  let code;
  await expect.poll(async () => {
    const res = await request.get(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/oobCodes`);
    const { oobCodes } = await res.json();
    code = [...oobCodes].reverse().find((c) => c.email === email && c.requestType === "VERIFY_EMAIL");
    return Boolean(code);
  }, { message: "email de vérification envoyé", timeout: 10_000 }).toBe(true);
  const res = await request.get(code.oobLink);
  expect(res.ok(), "lien de vérification accepté").toBeTruthy();
  await page.getByRole("button", { name: "J'ai cliqué sur le lien" }).click();
}

test("étape 1 : comptes, famille, invitation, événement et confidentialité", async ({ browser, request }) => {
  // ── Awa : écran de lancement, inscription, vérification ──
  const awaCtx = await browser.newContext();
  const a = await awaCtx.newPage();
  await a.goto("/");
  await expect(a.getByRole("heading", { name: "Bennoo" })).toBeVisible();
  await expect(a.getByRole("link", { name: "Commencer" })).toBeVisible();
  await signUp(a, awa);
  await verifyEmail(a, request, awa.email);
  await expect(a.getByRole("heading", { name: /Bonjour Awa/ })).toBeVisible();

  // ── Famille ──
  await a.getByLabel("Nom de la famille").fill("Famille Diop");
  await a.getByRole("button", { name: "Créer la famille" }).click();
  await expect(a.getByRole("heading", { name: "Famille Diop" })).toBeVisible();
  await expect(a.getByText("1 membre · 0 événement")).toBeVisible();
  await a.getByRole("link", { name: "+ Inviter un membre" }).click();
  await a.getByRole("button", { name: "Créer un lien d'invitation" }).click();
  const inviteInput = a.getByLabel("Lien d'invitation").first();
  await expect(inviteInput).toBeVisible();
  const inviteLink = await inviteInput.inputValue();
  expect(inviteLink).toMatch(/#\/rejoindre\/[^/]+\/[A-Za-z0-9_-]{43}$/);
  const wa = await a.getByRole("link", { name: "Envoyer sur WhatsApp" }).first().getAttribute("href");
  expect(decodeURIComponent(wa)).toContain(inviteLink);
  const familyPath = pathOf(inviteLink).replace(/rejoindre\/([^/]+)\/.*/, "famille/$1");

  // ── Création d'un événement en 5 étapes ──
  await a.goto("/#/");
  await a.getByRole("link", { name: "+ Créer" }).click();
  await expect(a.getByRole("heading", { name: "Type d'événement" })).toBeVisible();
  await a.getByText("Mariage", { exact: true }).click();
  await a.getByRole("button", { name: "Suivant" }).click();
  await a.getByLabel("Nom de l'événement").fill("Mariage de Fatou et Mamadou");
  await a.getByRole("button", { name: "Suivant" }).click();
  await a.getByLabel("Date et heure").fill("2030-06-12T16:00");
  await a.getByLabel("Ville").fill("Dakar");
  await a.getByRole("button", { name: "Suivant" }).click();
  await a.getByLabel("Budget prévu").fill("12,5");
  await a.getByRole("button", { name: "Suivant" }).click();
  await expect(a.getByRole("alert")).toContainText("Montant invalide"); // FCFA sans décimales
  await a.getByLabel("Budget prévu").fill("6 000 000");
  await a.getByLabel("Nombre d'invités prévu").fill("300");
  await a.getByRole("button", { name: "Suivant" }).click();
  await expect(a.getByText("Vous êtes pour l'instant le seul membre de cette famille.")).toBeVisible();
  await a.getByRole("button", { name: "Créer l'événement" }).click();
  await expect(a.getByRole("heading", { name: "Mariage de Fatou et Mamadou" })).toBeVisible();
  await expect(a.getByText("Votre rôle : Organisateur")).toBeVisible();
  await expect(a.getByText(/^J - \d+$/)).toBeVisible();
  await expect(a.getByText(/6\s000\s000/)).toBeVisible();
  const eventPath = pathOf(a.url());

  // ── Ibou ouvre le lien d'invitation, s'inscrit et rejoint la famille ──
  const ibouCtx = await browser.newContext();
  const b = await ibouCtx.newPage();
  await b.goto(pathOf(inviteLink));
  await expect(b.getByRole("link", { name: "Commencer" })).toBeVisible();
  await signUp(b, ibou);
  await verifyEmail(b, request, ibou.email);
  await expect(b.getByRole("heading", { name: "Famille Diop" })).toBeVisible();
  await b.getByRole("button", { name: "Rejoindre la famille" }).click();
  await expect(b.getByText("2 membres · 0 événement")).toBeVisible();
  // Seul un administrateur crée des liens d'invitation.
  await expect(b.getByRole("link", { name: "+ Inviter un membre" })).toHaveCount(0);

  // Confidentialité : membre de la famille mais pas participant → l'événement reste invisible.
  await b.goto(eventPath);
  await expect(b.getByRole("heading", { name: "Introuvable" })).toBeVisible();

  // ── Awa ajoute Ibou comme trésorier ──
  await a.goto(`${eventPath}/participants`);
  await a.getByLabel("Membre de la famille").selectOption({ label: "Ibou Fall" });
  await a.getByLabel("Rôle", { exact: true }).selectOption("treasurer");
  await a.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(a.getByText("Ibou Fall")).toBeVisible();
  await expect(a.getByRole("combobox", { name: "Rôle de Ibou Fall" })).toHaveValue("treasurer");

  // ── Ibou voit l'événement, avec son rôle, sans pouvoir le modifier ──
  await b.goto("/#/");
  await expect(b.getByText("Mariage de Fatou et Mamadou")).toBeVisible();
  await b.getByText("Mariage de Fatou et Mamadou").click();
  await expect(b.getByText("Votre rôle : Trésorier")).toBeVisible();
  await expect(b.getByRole("tab", { name: "Modifier" })).toHaveCount(0);
  await b.goto(familyPath);
  await expect(b.getByText("2 membres · 1 événement")).toBeVisible();

  // ── Déconnexion ──
  await b.goto("/#/plus");
  await b.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(b.getByRole("link", { name: "Commencer" })).toBeVisible();

  await awaCtx.close();
  await ibouCtx.close();
});

test("mot de passe oublié : même réponse que le compte existe ou non", async ({ page }) => {
  await page.goto("/#/mot-de-passe-oublie");
  await page.getByLabel("Email du compte").fill(`inconnu.${run}@example.com`);
  await page.getByRole("button", { name: "Recevoir un lien" }).click();
  await expect(page.getByText(/Si un compte existe pour cette adresse/)).toBeVisible();
});

test("connexion : mauvais mot de passe refusé avec un message neutre", async ({ page }) => {
  await page.goto("/#/connexion");
  await expect(page.getByRole("heading", { name: "Bienvenue sur Bennoo" })).toBeVisible();
  await page.getByLabel("Email").fill(awa.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toContainText("Email ou mot de passe incorrect");
});
