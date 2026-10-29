import { test } from "node:test";
import assert from "node:assert/strict";
import { checklistFor, tasksFromSelection, EVENT_TYPES, EVENT_TYPE_LABELS } from "../../src/server/modules/templates/checklists.ts";

test("checklists : chaque type a un libellé et des suggestions sans clé en double", () => {
  for (const type of EVENT_TYPES) {
    assert.ok(EVENT_TYPE_LABELS[type]);
    const keys = checklistFor(type).map((i) => i.key);
    assert.ok(keys.length >= 8);
    assert.equal(new Set(keys).size, keys.length, type);
  }
});

test("checklists : le mariage propose des tâches spécifiques", () => {
  const keys = checklistFor("WEDDING").map((i) => i.key);
  assert.ok(keys.includes("wedding.families-date"));
  assert.ok(!checklistFor("BIRTHDAY").some((i) => i.key.startsWith("wedding.")));
});

test("checklists : seules les tâches cochées sont créées, avec échéance relative", () => {
  const startsAt = new Date("2027-06-12T16:00:00Z");
  const now = new Date("2026-10-29T12:00:00Z");
  const tasks = tasksFromSelection("WEDDING", ["common.venue", "wedding.outfits", "common.venue"], startsAt, now);
  assert.equal(tasks.length, 2, "doublon ignoré");
  assert.equal(tasks.find((t) => t.templateItemKey === "common.venue")?.dueAt?.toISOString(), "2027-04-28T16:00:00.000Z");
});

test("checklists : une échéance déjà passée reste vide", () => {
  const tasks = tasksFromSelection("NAMING_CEREMONY", ["common.budget"], new Date("2026-11-05T10:00:00Z"), new Date("2026-10-29T12:00:00Z"));
  assert.equal(tasks[0]?.dueAt, null);
});

test("checklists : une clé inconnue ou d'un autre type est refusée", () => {
  assert.throws(() => tasksFromSelection("BIRTHDAY", ["wedding.outfits"], null), RangeError);
  assert.throws(() => tasksFromSelection("BIRTHDAY", ["<script>"], null), RangeError);
});

test("checklists : sans date d'événement, aucune échéance inventée", () => {
  const tasks = tasksFromSelection("CUSTOM", ["common.roles"], null);
  assert.equal(tasks[0]?.dueAt, null);
});
