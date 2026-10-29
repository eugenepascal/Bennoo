/**
 * Rôles d'un membre dans un événement et matrice des permissions.
 *
 * Source unique de vérité : l'API appelle `can()` avant chaque action, et l'interface
 * s'en sert seulement pour masquer les boutons inutiles. Masquer un bouton n'est jamais
 * une protection en soi (règle de sécurité du projet).
 */
export const EVENT_ROLES = ["ORGANIZER", "CO_ORGANIZER", "TREASURER", "MEMBER", "VIEWER"] as const;
export type EventRole = (typeof EVENT_ROLES)[number];

export const EVENT_ACTIONS = [
  "event.update",
  "event.archive",
  "members.manage",
  "members.grantOrganizer",
  "tasks.manage",
  "tasks.updateOwnStatus",
  "budget.manage",
  "budget.viewTotals",
  "budget.viewDetails",
  "contributions.declareOwn",
  "contributions.confirm",
  "contributions.viewTotals",
  "contributions.viewAllLines",
  "guests.manage",
  "album.upload",
  "album.view",
] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

/**
 * Décisions produit du 29/10/2026 :
 * - un simple membre (MEMBER) ne voit que les totaux du budget et des contributions ;
 * - seuls ORGANIZER et TREASURER confirment une contribution.
 */
const MATRIX: Record<EventRole, ReadonlySet<EventAction>> = {
  ORGANIZER: new Set<EventAction>([
    "event.update", "event.archive", "members.manage", "members.grantOrganizer",
    "tasks.manage", "tasks.updateOwnStatus", "budget.manage", "budget.viewTotals", "budget.viewDetails",
    "contributions.declareOwn", "contributions.confirm", "contributions.viewTotals", "contributions.viewAllLines",
    "guests.manage", "album.upload", "album.view",
  ]),
  CO_ORGANIZER: new Set<EventAction>([
    "event.update", "members.manage", "tasks.manage", "tasks.updateOwnStatus",
    "budget.viewTotals", "budget.viewDetails", "contributions.declareOwn", "contributions.viewTotals",
    "contributions.viewAllLines", "guests.manage", "album.upload", "album.view",
  ]),
  TREASURER: new Set<EventAction>([
    "tasks.updateOwnStatus", "budget.manage", "budget.viewTotals", "budget.viewDetails",
    "contributions.declareOwn", "contributions.confirm", "contributions.viewTotals", "contributions.viewAllLines",
    "album.upload", "album.view",
  ]),
  MEMBER: new Set<EventAction>([
    "tasks.updateOwnStatus", "budget.viewTotals", "contributions.declareOwn", "contributions.viewTotals",
    "album.upload", "album.view",
  ]),
  VIEWER: new Set<EventAction>(["album.view"]),
};

export function isEventRole(value: unknown): value is EventRole {
  return typeof value === "string" && (EVENT_ROLES as readonly string[]).includes(value);
}

export function can(role: EventRole, action: EventAction): boolean {
  return MATRIX[role].has(action);
}

/**
 * Un co-organisateur gère les membres mais ne peut ni nommer ni retirer un organisateur.
 * Retourne true si `actor` peut attribuer `targetRole` à quelqu'un qui a `currentRole`.
 */
export function canAssignRole(actor: EventRole, currentRole: EventRole | null, targetRole: EventRole): boolean {
  if (!can(actor, "members.manage")) return false;
  const touchesOrganizer = targetRole === "ORGANIZER" || currentRole === "ORGANIZER";
  return !touchesOrganizer || can(actor, "members.grantOrganizer");
}

/** Un événement doit toujours garder au moins un organisateur. */
export function wouldLeaveNoOrganizer(
  roles: readonly EventRole[],
  change: { from: EventRole; to: EventRole | null },
): boolean {
  if (change.from !== "ORGANIZER" || change.to === "ORGANIZER") return false;
  return roles.filter((r) => r === "ORGANIZER").length <= 1;
}
