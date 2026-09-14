const ACCENTS = {
  brand: {
    dot: 'bg-brand-light',
    title: '',
  },
  indigo: {
    dot: 'bg-indigo-500',
    title: '',
  },
  sky: {
    dot: 'bg-sky-400',
    title: '',
  },
  emerald: {
    dot: 'bg-emerald-500',
    title: '',
  },
  amber: {
    dot: 'bg-amber-400',
    title: '',
  },
  violet: {
    dot: 'bg-violet-400',
    title: '',
  },
  rose: {
    dot: 'bg-rose-400',
    title: '',
  },
};

export default function Card({ title, action, accent, padded = true, className = '', bodyClassName = '', children }) {
  const hasHeader = Boolean(title || action);
  const a = ACCENTS[accent] || ACCENTS.indigo;
  return (
    <section
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            {accent && (
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className={`absolute inset-0 rounded-full ${a.dot}`} />
              </span>
            )}
            {title && <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? `p-5 ${bodyClassName}` : bodyClassName}>{children}</div>
    </section>
  );
}
