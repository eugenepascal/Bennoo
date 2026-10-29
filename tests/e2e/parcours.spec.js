/**
 * Parcours de l'étape 1, de bout en bout, dans un vrai navigateur (format mobile) :
 * inscription → vérification email → famille → événement → invitation d'un proche →
 * ajout comme trésorier → l'invité voit l'événement.
 */
import { test, expect } from "@playwright/test";

const AUTH_EMULATOR = "http://127.0.0.1:9099";
const PROJECT = "demo-bennoo";
const run = Date.now();
const awa = { name: "Awa Diop", email: `awa.${run}@example.sn`, password: "motdepasse-awa" };
const ibou = { name: "Ibou Fall", email: `ibou.${run}@example.fr`, password: "motdepasse-ibou" };

async function signUp(page, user) {
  await page.getByRole("link", { name: "Créer un compte" }).click();
  await page.getByLabel("Votre nom").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mot de passe").fill(user.password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { name: "Vérifiez votre adresse email" })).toBeVisible();
}

/** Récupère le lien de vérification envoyé par l'émulateur et l'applique, comme un clic dans l'email. */
async function verifyEmail(page, request, email) {
  // L'écran « vérifiez votre email » s'affiche dès la création du compte ; l'email part juste après.
  let code;
  await expect.poll(async () => {
    const res = await request.get(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/oobCodes`);
    const { oobCodes } = await res.json();
    code = oobCodes.reverse().find((c) => c.email === email && c.requestType === "VERIFY_EMAIL");
    return Boolean(code);
  }, { message: "email de vérification envoyé", timeout: 10_000 }).toBe(true);
  const apply = await request.post(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, {
    data: { oobCode: code.oobCode },
  });
  expect(apply.ok()).toBeTruthy();
  await page.getByRole("button", { name: "J'ai cliqué sur le lien" }).click();
}

test("étape 1 : comptes, famille, invitation, événement et confidentialité", async ({ browser, request }) => {
  // ── Awa crée son compte, sa famille et un mariage ──
  const awaCtx = await browser.newContext();
  const a = await awaCtx.newPage();
  await a.goto("/");
  await expect(a.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  await signUp(a, awa);

  // Avant vérification, impossible d'aller plus loin.
  await a.goto("/#/profil");
  await expect(a.getByRole("heading", { name: "Vérifiez votre adresse email" })).toBeVisible();
  await verifyEmail(a, request, awa.email);
  await expect(a.getByRole("heading", { name: `Bonjour ${awa.name}` })).toBeVisible();
  await expect(a.getByText("Aucun événement pour l'instant.")).toBeVisible();

  await a.getByLabel("Nom de la famille").fill("Famille Diop");
  await a.getByRole("button", { name: "Créer la famille" }).click();
  await expect(a.getByRole("heading", { name: "Famille Diop", level: 1 })).toBeVisible();
  await expect(a.getByText("Membres (1)")).toBeVisible();

  await a.getByRole("button", { name: "Créer un lien d'invitation" }).click();
  const inviteInput = a.getByLabel("Lien d'invitation").first();
  await expect(inviteInput).toBeVisible();
  const inviteLink = await inviteInput.inputValue();
  expect(inviteLink).toMatch(/#\/rejoindre\/[^/]+\/[A-Za-z0-9_-]{43}$/);
  const wa = await a.getByRole("link", { name: "Envoyer sur WhatsApp" }).first().getAttribute("href");
  expect(decodeURIComponent(wa)).toContain(inviteLink);

  await a.getByRole("link", { name: "Nouvel événement" }).click();
  await a.getByLabel("Nom de l'événement").fill("Mariage de Fatou et Mamadou");
  await a.getByLabel("Date et heure").fill("2030-06-12T16:00");
  await a.getByLabel("Ville").fill("Dakar");
  await a.getByLabel("Budget prévu").fill("6 000 000");
  await a.getByLabel("Nombre d'invités prévu").fill("300");
  await a.getByRole("button", { name: "Créer l'événement" }).click();
  await expect(a.getByRole("heading", { name: "Mariage de Fatou et Mamadou" })).toBeVisible();
  await expect(a.getByText("Votre rôle : Organisateur")).toBeVisible();
  await expect(a.getByLabel("Compte à rebours")).toHaveText(/^J-\d+$/);
  await expect(a.getByText(/6\s000\s000/)).toBeVisible();
  const eventUrl = a.url();

  // Budget invalide refusé avec un message clair.
  await a.getByText("Modifier l'événement").click();
  await a.getByLabel("Budget prévu").last().fill("12,5");
  await a.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(a.getByRole("alert")).toContainText("Montant invalide");

  // ── Ibou reçoit le lien, crée son compte et rejoint la famille ──
  const ibouCtx = await browser.newContext();
  const b = await ibouCtx.newPage();
  await b.goto(inviteLink.replace(/^https?:\/\/[^/]+/, ""));
  await expect(b.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  await signUp(b, ibou);
  await verifyEmail(b, request, ibou.email);
  await expect(b.getByRole("heading", { name: "Famille Diop" })).toBeVisible();
  await b.getByRole("button", { name: "Rejoindre la famille" }).click();
  await expect(b.getByText("Membres (2)")).toBeVisible();

  // Confidentialité : membre de la famille, mais pas encore participant → l'événement reste invisible.
  await expect(b.getByText("Aucun événement auquel vous participez.")).toBeVisible();
  await b.goto(eventUrl.replace(/^https?:\/\/[^/]+/, ""));
  await expect(b.getByRole("heading", { name: "Introuvable" })).toBeVisible();
  // Pas de bouton pour inviter : seul un administrateur crée des liens.
  await b.goto(inviteLink.replace(/^https?:\/\/[^/]+/, "").replace(/rejoindre\/([^/]+)\/.*/, "famille/$1"));
  await expect(b.getByRole("button", { name: "Créer un lien d'invitation" })).toHaveCount(0);

  // ── Awa ajoute Ibou comme trésorier ──
  await a.reload();
  await a.getByLabel("Membre de la famille").selectOption({ label: ibou.name });
  await a.getByLabel("Rôle", { exact: true }).selectOption("treasurer");
  await a.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(a.getByText("Participants (2)")).toBeVisible();

  // ── Ibou voit maintenant l'événement, avec son rôle ──
  await b.goto("/#/");
  await expect(b.getByText("Mariage de Fatou et Mamadou")).toBeVisible();
  await expect(b.getByText(/Trésorier/)).toBeVisible();
  await b.getByText("Mariage de Fatou et Mamadou").click();
  await expect(b.getByText("Votre rôle : Trésorier")).toBeVisible();
  await expect(b.getByText("Modifier l'événement")).toHaveCount(0);

  // ── Déconnexion ──
  await b.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(b.getByRole("heading", { name: "Se connecter" })).toBeVisible();

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
  await page.goto("/");
  await page.getByLabel("Email").fill(awa.email);
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toContainText("Email ou mot de passe incorrect");
});
