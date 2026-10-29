import type { EventRole } from "../events/roles.ts";
import { can } from "../events/roles.ts";
import { sumAmounts } from "../../../lib/money.ts";

/**
 * Confidentialité et anonymat des contributions (décisions du 29/10/2026).
 *
 * 1. Un simple membre ne reçoit que les totaux et sa propre ligne.
 * 2. Une contribution marquée anonyme n'affiche le nom qu'au contributeur lui-même et
 *    aux personnes qui peuvent la confirmer (trésoriers ; organisateurs seulement si
 *    l'événement n'a aucun trésorier). Tous les autres voient « Anonyme ».
 *
 * Ce filtrage est appliqué par le serveur avant l'envoi des données : un membre ne peut
 * pas retrouver un nom masqué en inspectant les réponses de l'API.
 */
export type ContributionStatus = "PLEDGED" | "DECLARED" | "CONFIRMED" | "CANCELLED";

export interface ContributionRecord {
  id: string;
  contributorUserId: string | null; // null : contributeur hors application (nom libre)
  contributorName: string;
  isAnonymous: boolean;
  status: ContributionStatus;
  pledgedAmount: bigint;
  declaredAmount: bigint;
  confirmedAmount: bigint;
}

export interface Viewer {
  userId: string;
  role: EventRole;
}

export interface ContributionLine {
  id: string;
  contributorName: string; // « Anonyme » si masqué
  isOwn: boolean;
  isAnonymous: boolean;
  status: ContributionStatus;
  pledgedAmount: bigint;
  declaredAmount: bigint;
  confirmedAmount: bigint;
}

export interface ContributionTotals {
  count: number;
  pledged: bigint;
  declared: bigint;
  confirmed: bigint;
}

export interface ContributionView {
  totals: ContributionTotals;
  lines: ContributionLine[];
  /** true si `lines` ne contient que la ligne du lecteur (simple membre). */
  restrictedToOwn: boolean;
}

export const ANONYMOUS_LABEL = "Anonyme";

/** Qui peut confirmer — et donc connaître l'identité d'un contributeur anonyme. */
export function confirmerRoles(rolesPresent: readonly EventRole[]): ReadonlySet<EventRole> {
  return rolesPresent.includes("TREASURER") ? new Set(["TREASURER"]) : new Set(["ORGANIZER"]);
}

export function buildContributionView(
  records: readonly ContributionRecord[],
  viewer: Viewer,
  rolesPresent: readonly EventRole[],
): ContributionView {
  if (!can(viewer.role, "contributions.viewTotals")) {
    throw new Error("forbidden");
  }
  const active = records.filter((r) => r.status !== "CANCELLED");
  const totals: ContributionTotals = {
    count: active.length,
    pledged: sumAmounts(active.map((r) => r.pledgedAmount)),
    declared: sumAmounts(active.map((r) => r.declaredAmount)),
    confirmed: sumAmounts(active.map((r) => r.confirmedAmount)),
  };

  const seesAll = can(viewer.role, "contributions.viewAllLines");
  const seesAnonymousIdentity = confirmerRoles(rolesPresent).has(viewer.role);

  const lines = records
    .filter((r) => seesAll || r.contributorUserId === viewer.userId)
    .map((r): ContributionLine => {
      const isOwn = r.contributorUserId !== null && r.contributorUserId === viewer.userId;
      const showName = !r.isAnonymous || isOwn || seesAnonymousIdentity;
      return {
        id: r.id,
        contributorName: showName ? r.contributorName : ANONYMOUS_LABEL,
        isOwn,
        isAnonymous: r.isAnonymous,
        status: r.status,
        pledgedAmount: r.pledgedAmount,
        declaredAmount: r.declaredAmount,
        confirmedAmount: r.confirmedAmount,
      };
    });

  return { totals, lines, restrictedToOwn: !seesAll };
}
