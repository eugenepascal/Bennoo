/**
 * Page d'accueil provisoire (lot 0).
 * Elle n'affiche aucun bouton ni formulaire : l'inscription arrive au lot 1.
 * Aucune donnée fictive n'est présentée comme réelle.
 */
export default function HomePage() {
  return (
    <main id="contenu" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Célébrer · Organiser · Partager</p>
      <h1 className="text-5xl font-bold text-brand-900">Bennoo</h1>
      <p className="text-xl text-ink">Une cérémonie, toute la famille, un seul endroit.</p>
      <div className="rounded-[var(--radius-card)] border border-brand-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-brand-900">Application en cours de construction</h2>
        <p className="mt-2 text-ink-muted">
          Bennoo aidera les familles du Sénégal et de la diaspora à organiser ensemble mariages, baptêmes et
          réunions : tâches, budget, contributions, invités et souvenirs. L&apos;inscription ouvrira avec la
          prochaine étape du développement.
        </p>
      </div>
    </main>
  );
}
