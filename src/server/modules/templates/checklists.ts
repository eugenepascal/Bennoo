/**
 * Modèles de checklist proposés à la création d'un événement (story B-31).
 *
 * Ce sont des suggestions : aucune tâche n'est créée tant que l'organisateur ne l'a pas
 * cochée. Chaque élément a une clé stable (`key`) enregistrée dans task.template_item_key,
 * ce qui empêche d'importer deux fois la même tâche.
 * `daysBefore` sert à proposer une échéance relative à la date de l'événement.
 */
export const EVENT_TYPES = [
  "WEDDING",
  "NAMING_CEREMONY",
  "COMMUNION",
  "BIRTHDAY",
  "RELIGIOUS_CEREMONY",
  "FAMILY_REUNION",
  "TRADITIONAL_CEREMONY",
  "CUSTOM",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  WEDDING: "Mariage",
  NAMING_CEREMONY: "Baptême / Ngenté",
  COMMUNION: "Communion",
  BIRTHDAY: "Anniversaire",
  RELIGIOUS_CEREMONY: "Cérémonie religieuse",
  FAMILY_REUNION: "Réunion familiale",
  TRADITIONAL_CEREMONY: "Cérémonie traditionnelle",
  CUSTOM: "Événement personnalisé",
};

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface ChecklistItem {
  key: string;
  title: string;
  category: "organisation" | "lieu" | "repas" | "invites" | "budget" | "tenues" | "ceremonie" | "souvenirs";
  priority: TaskPriority;
  daysBefore: number;
}

const COMMON: ChecklistItem[] = [
  { key: "common.budget", title: "Fixer le budget global et les grandes dépenses", category: "budget", priority: "HIGH", daysBefore: 60 },
  { key: "common.roles", title: "Répartir les rôles et former les comités", category: "organisation", priority: "HIGH", daysBefore: 60 },
  { key: "common.guest-list", title: "Établir la liste des invités", category: "invites", priority: "HIGH", daysBefore: 45 },
  { key: "common.venue", title: "Réserver le lieu", category: "lieu", priority: "HIGH", daysBefore: 45 },
  { key: "common.catering", title: "Choisir le traiteur ou organiser la cuisine", category: "repas", priority: "HIGH", daysBefore: 30 },
  { key: "common.invitations", title: "Envoyer les invitations", category: "invites", priority: "MEDIUM", daysBefore: 21 },
  { key: "common.rsvp-followup", title: "Relancer les invités sans réponse", category: "invites", priority: "MEDIUM", daysBefore: 7 },
  { key: "common.photos", title: "Désigner qui prend les photos", category: "souvenirs", priority: "LOW", daysBefore: 7 },
];

const BY_TYPE: Partial<Record<EventType, ChecklistItem[]>> = {
  WEDDING: [
    { key: "wedding.families-date", title: "Fixer la date avec les deux familles", category: "organisation", priority: "HIGH", daysBefore: 120 },
    { key: "wedding.religious-civil", title: "Préparer les démarches religieuses et civiles", category: "ceremonie", priority: "HIGH", daysBefore: 60 },
    { key: "wedding.outfits", title: "Choisir et commander les tenues", category: "tenues", priority: "MEDIUM", daysBefore: 45 },
    { key: "wedding.music", title: "Réserver l'animation et la musique", category: "ceremonie", priority: "MEDIUM", daysBefore: 30 },
    { key: "wedding.transport", title: "Organiser le transport des proches", category: "organisation", priority: "MEDIUM", daysBefore: 14 },
  ],
  NAMING_CEREMONY: [
    { key: "naming.name", title: "Choisir le nom avec la famille", category: "ceremonie", priority: "HIGH", daysBefore: 7 },
    { key: "naming.officiant", title: "Prévenir la personne qui célèbre la cérémonie", category: "ceremonie", priority: "HIGH", daysBefore: 7 },
    { key: "naming.sheep", title: "Prévoir le mouton, si la famille le souhaite", category: "repas", priority: "MEDIUM", daysBefore: 5 },
    { key: "naming.gifts", title: "Préparer les cadeaux pour la mère et le bébé", category: "organisation", priority: "LOW", daysBefore: 3 },
  ],
  COMMUNION: [
    { key: "communion.parish", title: "Confirmer la date avec la paroisse", category: "ceremonie", priority: "HIGH", daysBefore: 60 },
    { key: "communion.outfit", title: "Préparer la tenue de l'enfant", category: "tenues", priority: "MEDIUM", daysBefore: 21 },
  ],
  FAMILY_REUNION: [
    { key: "reunion.agenda", title: "Préparer l'ordre du jour de la réunion", category: "organisation", priority: "MEDIUM", daysBefore: 14 },
  ],
};

/** Éléments proposés pour un type d'événement, sans doublon de clé. */
export function checklistFor(type: EventType): ChecklistItem[] {
  const items = [...(BY_TYPE[type] ?? []), ...COMMON];
  return items.sort((a, b) => b.daysBefore - a.daysBefore);
}

export interface ProposedTask {
  templateItemKey: string;
  title: string;
  category: ChecklistItem["category"];
  priority: TaskPriority;
  dueAt: Date | null;
}

/**
 * Transforme les éléments cochés par l'organisateur en tâches à créer.
 * - Une clé inconnue pour ce type est refusée (pas de tâche fantôme envoyée par un client).
 * - Une échéance déjà passée n'est pas proposée : elle est laissée vide plutôt que fausse.
 */
export function tasksFromSelection(
  type: EventType,
  selectedKeys: readonly string[],
  eventStartsAt: Date | null,
  now: Date = new Date(),
): ProposedTask[] {
  const available = new Map(checklistFor(type).map((i) => [i.key, i]));
  const unknown = selectedKeys.filter((k) => !available.has(k));
  if (unknown.length > 0) {
    throw new RangeError(`Éléments de checklist inconnus : ${unknown.join(", ")}`);
  }
  const unique = [...new Set(selectedKeys)];
  return unique.map((key) => {
    const item = available.get(key)!;
    let dueAt: Date | null = null;
    if (eventStartsAt) {
      const candidate = new Date(eventStartsAt.getTime() - item.daysBefore * 24 * 60 * 60 * 1000);
      dueAt = candidate.getTime() > now.getTime() ? candidate : null;
    }
    return { templateItemKey: item.key, title: item.title, category: item.category, priority: item.priority, dueAt };
  });
}
