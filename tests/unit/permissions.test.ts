import { test } from "node:test";
import assert from "node:assert/strict";
import { can, canAssignRole, wouldLeaveNoOrganizer, EVENT_ROLES, EVENT_ACTIONS } from "../../src/server/modules/events/roles.ts";
import {
  buildContributionView,
  ANONYMOUS_LABEL,
  type ContributionRecord,
} from "../../src/server/modules/contributions/visibility.ts";

test("matrice : chaque rôle a une réponse explicite pour chaque action", () => {
  for (const role of EVENT_ROLES) for (const action of EVENT_ACTIONS) assert.equal(typeof can(role, action), "boolean");
});

test("matrice : un simple membre ne voit que les totaux", () => {
  assert.equal(can("MEMBER", "contributions.viewTotals"), true);
  assert.equal(can("MEMBER", "contributions.viewAllLines"), false);
  assert.equal(can("MEMBER", "budget.viewTotals"), true);
  assert.equal(can("MEMBER", "budget.viewDetails"), false);
});

test("matrice : seuls organisateur et trésorier confirment", () => {
  const confirmers = EVENT_ROLES.filter((r) => can(r, "contributions.confirm"));
  assert.deepEqual(confirmers, ["ORGANIZER", "TREASURER"]);
});

test("matrice : un lecteur ne fait que consulter l'album", () => {
  const allowed = EVENT_ACTIONS.filter((a) => can("VIEWER", a));
  assert.deepEqual(allowed, ["album.view"]);
});

test("rôles : un co-organisateur ne touche pas au rôle d'organisateur", () => {
  assert.equal(canAssignRole("CO_ORGANIZER", "MEMBER", "TREASURER"), true);
  assert.equal(canAssignRole("CO_ORGANIZER", "MEMBER", "ORGANIZER"), false);
  assert.equal(canAssignRole("CO_ORGANIZER", "ORGANIZER", "MEMBER"), false);
  assert.equal(canAssignRole("ORGANIZER", "MEMBER", "ORGANIZER"), true);
  assert.equal(canAssignRole("MEMBER", "VIEWER", "MEMBER"), false);
});

test("rôles : le dernier organisateur ne peut pas être retiré", () => {
  assert.equal(wouldLeaveNoOrganizer(["ORGANIZER", "MEMBER"], { from: "ORGANIZER", to: "MEMBER" }), true);
  assert.equal(wouldLeaveNoOrganizer(["ORGANIZER", "ORGANIZER"], { from: "ORGANIZER", to: null }), false);
  assert.equal(wouldLeaveNoOrganizer(["ORGANIZER"], { from: "MEMBER", to: null }), false);
});

const rec = (over: Partial<ContributionRecord>): ContributionRecord => ({
  id: "c",
  contributorUserId: null,
  contributorName: "X",
  isAnonymous: false,
  status: "DECLARED",
  pledgedAmount: 0n,
  declaredAmount: 0n,
  confirmedAmount: 0n,
  ...over,
});

const records: ContributionRecord[] = [
  rec({ id: "c1", contributorUserId: "awa", contributorName: "Awa", declaredAmount: 100000n, confirmedAmount: 100000n, status: "CONFIRMED" }),
  rec({ id: "c2", contributorUserId: "moussa", contributorName: "Moussa", isAnonymous: true, declaredAmount: 50000n }),
  rec({ id: "c3", contributorUserId: null, contributorName: "Tonton Ibou", pledgedAmount: 30000n, status: "PLEDGED" }),
  rec({ id: "c4", contributorUserId: "fatou", contributorName: "Fatou", declaredAmount: 999n, status: "CANCELLED" }),
];
const roles = ["ORGANIZER", "TREASURER", "MEMBER", "MEMBER"] as const;

test("contributions : un simple membre reçoit les totaux et sa seule ligne", () => {
  const v = buildContributionView(records, { userId: "awa", role: "MEMBER" }, roles);
  assert.equal(v.restrictedToOwn, true);
  assert.deepEqual(v.lines.map((l) => l.id), ["c1"]);
  assert.equal(v.totals.declared, 150000n, "les contributions annulées sont exclues des totaux");
  assert.equal(v.totals.pledged, 30000n);
  assert.equal(v.totals.confirmed, 100000n);
  assert.equal(v.totals.count, 3);
  assert.ok(!JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)).includes("Moussa"));
});

test("contributions : l'anonyme garde son nom pour lui-même", () => {
  const v = buildContributionView(records, { userId: "moussa", role: "MEMBER" }, roles);
  assert.equal(v.lines.length, 1);
  assert.equal(v.lines[0]?.contributorName, "Moussa");
  assert.equal(v.lines[0]?.isOwn, true);
});

test("contributions : l'organisateur voit « Anonyme » quand un trésorier existe", () => {
  const v = buildContributionView(records, { userId: "orga", role: "ORGANIZER" }, roles);
  assert.equal(v.lines.length, 4);
  assert.equal(v.lines.find((l) => l.id === "c2")?.contributorName, ANONYMOUS_LABEL);
  assert.equal(v.lines.find((l) => l.id === "c1")?.contributorName, "Awa");
});

test("contributions : le trésorier qui confirme voit le nom de l'anonyme", () => {
  const v = buildContributionView(records, { userId: "treso", role: "TREASURER" }, roles);
  assert.equal(v.lines.find((l) => l.id === "c2")?.contributorName, "Moussa");
});

test("contributions : sans trésorier, l'organisateur confirme et voit le nom", () => {
  const v = buildContributionView(records, { userId: "orga", role: "ORGANIZER" }, ["ORGANIZER", "MEMBER"]);
  assert.equal(v.lines.find((l) => l.id === "c2")?.contributorName, "Moussa");
});

test("contributions : un co-organisateur ne voit jamais le nom de l'anonyme", () => {
  const v = buildContributionView(records, { userId: "co", role: "CO_ORGANIZER" }, ["ORGANIZER", "CO_ORGANIZER"]);
  assert.equal(v.lines.find((l) => l.id === "c2")?.contributorName, ANONYMOUS_LABEL);
});

test("contributions : un lecteur n'a accès à rien", () => {
  assert.throws(() => buildContributionView(records, { userId: "v", role: "VIEWER" }, roles), /forbidden/);
});
