-- Bennoo — migration initiale : lots 1 à 3 (comptes, familles, événements, membres,
-- comités, tâches issues des modèles, budget prévisionnel, journal d'audit).
-- Écrite à la main et validée sur PostgreSQL 16 (tests/db). Confrontée à
-- prisma/schema.prisma par `npm run db:check` dans la CI.
-- Les identifiants sont des UUID v7 générés par l'application (PostgreSQL 16 n'a pas uuidv7()).

-- ─── Types énumérés ──────────────────────────────────────────────────────────
CREATE TYPE "FamilyRole"     AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "EventType"      AS ENUM ('WEDDING', 'NAMING_CEREMONY', 'COMMUNION', 'BIRTHDAY',
                                      'RELIGIOUS_CEREMONY', 'FAMILY_REUNION', 'TRADITIONAL_CEREMONY', 'CUSTOM');
CREATE TYPE "EventStatus"    AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "EventPrivacy"   AS ENUM ('EVENT_MEMBERS', 'FAMILY_MEMBERS');
CREATE TYPE "EventRole"      AS ENUM ('ORGANIZER', 'CO_ORGANIZER', 'TREASURER', 'MEMBER', 'VIEWER');
CREATE TYPE "CommitteeKind"  AS ENUM ('FAMILY_SIDE', 'COMMITTEE');
CREATE TYPE "Currency"       AS ENUM ('XOF', 'EUR');
CREATE TYPE "TaskStatus"     AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "TaskPriority"   AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- ─── Authentification (schéma cœur Better Auth + champs de profil Bennoo) ────
CREATE TABLE "user" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL CHECK (char_length("name") BETWEEN 1 AND 120),
  "email"          TEXT NOT NULL UNIQUE CHECK ("email" = lower("email")),  -- normalisé en minuscules par l'application
  "email_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image"          TEXT,
  "phone"          TEXT CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$'),
  "locale"         TEXT NOT NULL DEFAULT 'fr',
  "timezone"       TEXT NOT NULL DEFAULT 'Africa/Dakar',
  "country_code"   CHAR(2),
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "session" (
  "id"          TEXT PRIMARY KEY,
  "user_id"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token"       TEXT NOT NULL UNIQUE,
  "expires_at"  TIMESTAMPTZ NOT NULL,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");

CREATE TABLE "account" (
  "id"                        TEXT PRIMARY KEY,
  "user_id"                   TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "account_id"                TEXT NOT NULL,
  "provider_id"               TEXT NOT NULL,
  "access_token"              TEXT,
  "refresh_token"             TEXT,
  "id_token"                  TEXT,
  "access_token_expires_at"   TIMESTAMPTZ,
  "refresh_token_expires_at"  TIMESTAMPTZ,
  "scope"                     TEXT,
  "password"                  TEXT,          -- hash scrypt produit par Better Auth, jamais le mot de passe
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("provider_id", "account_id")
);
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");

CREATE TABLE "verification" (
  "id"          TEXT PRIMARY KEY,
  "identifier"  TEXT NOT NULL,
  "value"       TEXT NOT NULL,
  "expires_at"  TIMESTAMPTZ NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- Compteurs de limitation de débit (stockage « database » de Better Auth).
CREATE TABLE "rate_limit" (
  "id"            TEXT PRIMARY KEY,
  "key"           TEXT NOT NULL UNIQUE,
  "count"         INTEGER NOT NULL,
  "last_request"  BIGINT NOT NULL
);

-- ─── Familles ────────────────────────────────────────────────────────────────
CREATE TABLE "family" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  "description"    TEXT CHECK ("description" IS NULL OR char_length("description") <= 1000),
  "created_by_id"  TEXT REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "family_member" (
  "id"          TEXT PRIMARY KEY,
  "family_id"   TEXT NOT NULL REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role"        "FamilyRole" NOT NULL DEFAULT 'MEMBER',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("family_id", "user_id")
);
CREATE INDEX "family_member_user_id_idx" ON "family_member" ("user_id");

-- ─── Événements ──────────────────────────────────────────────────────────────
CREATE TABLE "event" (
  "id"               TEXT PRIMARY KEY,
  "family_id"        TEXT NOT NULL REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type"             "EventType" NOT NULL,
  "title"            TEXT NOT NULL CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  "description"      TEXT CHECK ("description" IS NULL OR char_length("description") <= 4000),
  "starts_at"        TIMESTAMPTZ,              -- facultatif tant que l'événement est un brouillon
  "timezone"         TEXT NOT NULL DEFAULT 'Africa/Dakar',
  "venue_name"       TEXT CHECK ("venue_name" IS NULL OR char_length("venue_name") <= 200),
  "city"             TEXT CHECK ("city" IS NULL OR char_length("city") <= 120),
  "country_code"     CHAR(2),
  "cover_media_id"   TEXT,                     -- clé étrangère vers "media" ajoutée au lot 8
  "expected_guests"  INTEGER CHECK ("expected_guests" IS NULL OR "expected_guests" BETWEEN 0 AND 100000),
  "currency"         "Currency" NOT NULL DEFAULT 'XOF',
  "privacy"          "EventPrivacy" NOT NULL DEFAULT 'EVENT_MEMBERS',
  "status"           "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "archived_at"      TIMESTAMPTZ,
  "created_by_id"    TEXT REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un événement actif doit avoir une date ; un événement archivé porte sa date d'archivage.
  CONSTRAINT "event_active_needs_date" CHECK ("status" = 'DRAFT' OR "starts_at" IS NOT NULL),
  CONSTRAINT "event_archived_consistency" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL))
);
CREATE INDEX "event_family_id_status_idx" ON "event" ("family_id", "status");
CREATE INDEX "event_starts_at_idx" ON "event" ("starts_at");

CREATE TABLE "event_member" (
  "id"          TEXT PRIMARY KEY,
  "event_id"    TEXT NOT NULL REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role"        "EventRole" NOT NULL DEFAULT 'MEMBER',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("event_id", "user_id")
);
CREATE INDEX "event_member_user_id_idx" ON "event_member" ("user_id");

-- Défense en profondeur : un membre d'événement doit appartenir à la famille de l'événement.
-- Le service le vérifie déjà ; ce déclencheur empêche toute fuite entre familles même en cas de bug.
CREATE FUNCTION "ensure_event_member_in_family"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "family_member" fm
    JOIN "event" e ON e."family_id" = fm."family_id"
    WHERE e."id" = NEW."event_id" AND fm."user_id" = NEW."user_id"
  ) THEN
    RAISE EXCEPTION 'event_member_not_in_family' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "event_member_in_family"
  BEFORE INSERT OR UPDATE OF "event_id", "user_id" ON "event_member"
  FOR EACH ROW EXECUTE FUNCTION "ensure_event_member_in_family"();

-- Invitations à rejoindre une famille (et éventuellement directement un événement).
CREATE TABLE "member_invitation" (
  "id"              TEXT PRIMARY KEY,
  "family_id"       TEXT NOT NULL REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "event_id"        TEXT REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "family_role"     "FamilyRole" NOT NULL DEFAULT 'MEMBER',
  "event_role"      "EventRole",
  "email"           TEXT,                     -- facultatif : un lien peut être partagé sur WhatsApp
  "token_hash"      TEXT NOT NULL UNIQUE,     -- SHA-256 du jeton ; le jeton en clair n'est jamais stocké
  "invited_by_id"   TEXT REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "expires_at"      TIMESTAMPTZ NOT NULL,
  "accepted_at"     TIMESTAMPTZ,
  "accepted_by_id"  TEXT REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "revoked_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "invitation_event_role_pair" CHECK (("event_id" IS NULL) = ("event_role" IS NULL)),
  CONSTRAINT "invitation_no_owner_role"   CHECK ("family_role" <> 'OWNER'),
  CONSTRAINT "invitation_expiry_after_creation" CHECK ("expires_at" > "created_at")
);
CREATE INDEX "member_invitation_family_id_idx" ON "member_invitation" ("family_id");

-- ─── Groupes et comités ──────────────────────────────────────────────────────
CREATE TABLE "committee" (
  "id"              TEXT PRIMARY KEY,
  "event_id"        TEXT NOT NULL REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name"            TEXT NOT NULL CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  "kind"            "CommitteeKind" NOT NULL DEFAULT 'COMMITTEE',
  "lead_member_id"  TEXT REFERENCES "event_member"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("event_id", "name")
);

CREATE TABLE "committee_member" (
  "id"               TEXT PRIMARY KEY,
  "committee_id"     TEXT NOT NULL REFERENCES "committee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "event_member_id"  TEXT NOT NULL REFERENCES "event_member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("committee_id", "event_member_id")
);

-- ─── Tâches (créées au lot 3 depuis les modèles, enrichies au lot 4) ─────────
CREATE TABLE "task" (
  "id"                 TEXT PRIMARY KEY,
  "event_id"           TEXT NOT NULL REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "committee_id"       TEXT REFERENCES "committee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "title"              TEXT NOT NULL CHECK (char_length(btrim("title")) BETWEEN 1 AND 160),
  "description"        TEXT CHECK ("description" IS NULL OR char_length("description") <= 4000),
  "category"           TEXT NOT NULL DEFAULT 'general',
  "priority"           "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "status"             "TaskStatus" NOT NULL DEFAULT 'TODO',
  "due_at"             TIMESTAMPTZ,
  "completed_at"       TIMESTAMPTZ,
  "template_item_key"  TEXT,                  -- élément de checklist d'origine, pour éviter les doublons
  "created_by_id"      TEXT REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "task_done_has_completion" CHECK (("status" = 'DONE') = ("completed_at" IS NOT NULL)),
  UNIQUE ("event_id", "template_item_key")
);
CREATE INDEX "task_event_id_status_idx" ON "task" ("event_id", "status");
CREATE INDEX "task_event_id_due_at_idx" ON "task" ("event_id", "due_at");

CREATE TABLE "task_assignment" (
  "id"               TEXT PRIMARY KEY,
  "task_id"          TEXT NOT NULL REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "event_member_id"  TEXT NOT NULL REFERENCES "event_member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("task_id", "event_member_id")
);

-- ─── Budget prévisionnel (catégories, dépenses et contributions au lot 5) ────
CREATE TABLE "budget" (
  "id"             TEXT PRIMARY KEY,
  "event_id"       TEXT NOT NULL UNIQUE REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Montant entier dans l'unité mineure de la devise de l'événement (FCFA : unité ; EUR : centime).
  "planned_total"  BIGINT NOT NULL DEFAULT 0 CHECK ("planned_total" >= 0),
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Journal d'audit des actions sensibles ───────────────────────────────────
-- Pas de clé étrangère sur family_id / event_id : la trace survit à la suppression
-- de l'objet. L'auteur est anonymisé (NULL) si son compte est supprimé.
CREATE TABLE "audit_log" (
  "id"             TEXT PRIMARY KEY,
  "actor_user_id"  TEXT REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "family_id"      TEXT,
  "event_id"       TEXT,
  "action"         TEXT NOT NULL,
  "entity_type"    TEXT NOT NULL,
  "entity_id"      TEXT NOT NULL,
  "metadata"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "audit_log_event_id_created_at_idx"  ON "audit_log" ("event_id", "created_at");
CREATE INDEX "audit_log_family_id_created_at_idx" ON "audit_log" ("family_id", "created_at");
