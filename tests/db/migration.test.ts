/**
 * Tests de la base : applique les migrations sur une base PostgreSQL neuve et vérifie
 * que les contraintes d'intégrité et d'isolation refusent bien les données invalides.
 * Utilise le client `psql` (variables PGHOST, PGUSER, PGPASSWORD) pour ne dépendre
 * d'aucun paquet npm.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const DB = `bennoo_test_${process.pid}`;
const MIGRATIONS = join(import.meta.dirname, "../../prisma/migrations");

function admin(sql: string): void {
  execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", sql], { stdio: "pipe" });
}

function sql(statement: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", statement], { encoding: "utf8" });
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr };
}

function ok(statement: string): string {
  const r = sql(statement);
  assert.ok(r.ok, `attendu : succès\n${statement}\n${r.err}`);
  return r.out;
}

function rejected(statement: string, why: RegExp): void {
  const r = sql(statement);
  assert.equal(r.ok, false, `attendu : refus\n${statement}`);
  assert.match(r.err, why);
}

before(() => {
  admin(`DROP DATABASE IF EXISTS ${DB}`);
  admin(`CREATE DATABASE ${DB}`);
  const dirs = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.ok(dirs.length > 0, "aucune migration trouvée");
  for (const dir of dirs) {
    execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", join(MIGRATIONS, dir, "migration.sql")], { stdio: "pipe" });
  }
  // Jeu de données minimal : deux familles étanches.
  ok(`
    INSERT INTO "user"(id, name, email) VALUES ('u-awa','Awa','awa@example.sn'), ('u-ibou','Ibou','ibou@example.fr'), ('u-out','Externe','out@example.com');
    INSERT INTO family(id, name, created_by_id) VALUES ('f-diop','Famille Diop','u-awa'), ('f-ndiaye','Famille Ndiaye','u-out');
    INSERT INTO family_member(id, family_id, user_id, role) VALUES ('fm1','f-diop','u-awa','OWNER'), ('fm2','f-diop','u-ibou','MEMBER'), ('fm3','f-ndiaye','u-out','OWNER');
    INSERT INTO event(id, family_id, type, title) VALUES ('e1','f-diop','WEDDING','Mariage Fatou & Mamadou');
    INSERT INTO event_member(id, event_id, user_id, role) VALUES ('em1','e1','u-awa','ORGANIZER');
  `);
});

after(() => {
  admin(`DROP DATABASE IF EXISTS ${DB}`);
});

test("comptes : email unique et en minuscules", () => {
  rejected(`INSERT INTO "user"(id, name, email) VALUES ('u2','Awa bis','awa@example.sn')`, /user_email_key/);
  rejected(`INSERT INTO "user"(id, name, email) VALUES ('u3','Maj','Maj@Example.sn')`, /check constraint/);
  rejected(`INSERT INTO "user"(id, name, email, phone) VALUES ('u4','Tel','t@x.sn','77 123 45 67')`, /check constraint/);
  ok(`INSERT INTO "user"(id, name, email, phone) VALUES ('u5','Tel','t@x.sn','+221771234567')`);
});

test("isolation : un membre d'événement doit appartenir à la famille", () => {
  rejected(`INSERT INTO event_member(id, event_id, user_id) VALUES ('em-x','e1','u-out')`, /event_member_not_in_family/);
  ok(`INSERT INTO event_member(id, event_id, user_id, role) VALUES ('em2','e1','u-ibou','TREASURER')`);
  rejected(`INSERT INTO event_member(id, event_id, user_id) VALUES ('em3','e1','u-ibou')`, /event_member_event_id_user_id_key/);
  rejected(`UPDATE event_member SET user_id = 'u-out' WHERE id = 'em2'`, /event_member_not_in_family/);
});

test("événements : brouillon sans date accepté, actif sans date refusé", () => {
  rejected(`UPDATE event SET status = 'ACTIVE' WHERE id = 'e1'`, /event_active_needs_date/);
  ok(`UPDATE event SET status = 'ACTIVE', starts_at = '2027-06-12 16:00+00' WHERE id = 'e1'`);
  rejected(`UPDATE event SET status = 'ARCHIVED' WHERE id = 'e1'`, /event_archived_consistency/);
  rejected(`INSERT INTO event(id, family_id, type, title) VALUES ('e-bad','f-diop','WEDDING','   ')`, /check constraint/);
  rejected(`INSERT INTO event(id, family_id, type, title, expected_guests) VALUES ('e-neg','f-diop','BIRTHDAY','Anniv',-3)`, /check constraint/);
});

test("invitations : jeton unique, jamais de rôle OWNER, rôle d'événement cohérent", () => {
  const future = `now() + interval '7 days'`;
  ok(`INSERT INTO member_invitation(id, family_id, token_hash, expires_at) VALUES ('i1','f-diop','${"a".repeat(64)}', ${future})`);
  rejected(`INSERT INTO member_invitation(id, family_id, token_hash, expires_at) VALUES ('i2','f-diop','${"a".repeat(64)}', ${future})`, /token_hash_key/);
  rejected(`INSERT INTO member_invitation(id, family_id, family_role, token_hash, expires_at) VALUES ('i3','f-diop','OWNER','${"b".repeat(64)}', ${future})`, /invitation_no_owner_role/);
  rejected(`INSERT INTO member_invitation(id, family_id, event_id, token_hash, expires_at) VALUES ('i4','f-diop','e1','${"c".repeat(64)}', ${future})`, /invitation_event_role_pair/);
  rejected(`INSERT INTO member_invitation(id, family_id, token_hash, expires_at) VALUES ('i5','f-diop','${"d".repeat(64)}', now() - interval '1 day')`, /invitation_expiry_after_creation/);
});

test("tâches : une tâche terminée porte sa date, un modèle n'est importé qu'une fois", () => {
  ok(`INSERT INTO task(id, event_id, title, template_item_key) VALUES ('t1','e1','Réserver le lieu','common.venue')`);
  rejected(`INSERT INTO task(id, event_id, title, template_item_key) VALUES ('t2','e1','Réserver le lieu','common.venue')`, /task_event_id_template_item_key_key/);
  rejected(`UPDATE task SET status = 'DONE' WHERE id = 't1'`, /task_done_has_completion/);
  ok(`UPDATE task SET status = 'DONE', completed_at = now() WHERE id = 't1'`);
  ok(`INSERT INTO task_assignment(id, task_id, event_member_id) VALUES ('ta1','t1','em1')`);
});

test("budget : un seul par événement, jamais négatif", () => {
  ok(`INSERT INTO budget(id, event_id, planned_total) VALUES ('b1','e1', 6000000)`);
  rejected(`INSERT INTO budget(id, event_id) VALUES ('b2','e1')`, /budget_event_id_key/);
  rejected(`UPDATE budget SET planned_total = -1 WHERE id = 'b1'`, /check constraint/);
});

test("suppression : le journal d'audit survit et l'auteur est anonymisé", () => {
  ok(`INSERT INTO "user"(id, name, email) VALUES ('u-gone','Parti','gone@example.sn')`);
  ok(`INSERT INTO audit_log(id, actor_user_id, family_id, event_id, action, entity_type, entity_id) VALUES ('a1','u-gone','f-diop','e1','role.changed','event_member','em2')`);
  ok(`DELETE FROM "user" WHERE id = 'u-gone'`);
  assert.equal(ok(`SELECT coalesce(actor_user_id, 'NULL') FROM audit_log WHERE id = 'a1'`), "NULL");
});

test("suppression : supprimer une famille supprime ses événements et leurs données", () => {
  ok(`INSERT INTO family(id, name) VALUES ('f-tmp','Temporaire')`);
  ok(`INSERT INTO family_member(id, family_id, user_id) VALUES ('fm-tmp','f-tmp','u-awa')`);
  ok(`INSERT INTO event(id, family_id, type, title) VALUES ('e-tmp','f-tmp','CUSTOM','Test')`);
  ok(`INSERT INTO task(id, event_id, title) VALUES ('t-tmp','e-tmp','x')`);
  ok(`DELETE FROM family WHERE id = 'f-tmp'`);
  assert.equal(ok(`SELECT count(*) FROM event WHERE id = 'e-tmp'`), "0");
  assert.equal(ok(`SELECT count(*) FROM task WHERE id = 't-tmp'`), "0");
  assert.equal(ok(`SELECT count(*) FROM family_member WHERE user_id = 'u-awa'`), "1", "l'autre appartenance est intacte");
});
