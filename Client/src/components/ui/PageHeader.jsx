export default function PageHeader({ title, subtitle, actions, eyebrow, className }) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-3 ${className ?? ''}`}>
      <div>
        {eyebrow && (
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-brand dark:text-brand-light">
            {eyebrow}
          </p>
        )}
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-brand to-brand-dark" aria-hidden="true" />
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}