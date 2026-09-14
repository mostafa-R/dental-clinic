const accents = {
  brand: {
    icon: 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm shadow-brand/30',
  },
  indigo: {
    icon: 'bg-brand-light/40 text-brand dark:bg-brand/25 dark:text-brand-light',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  sky: {
    icon: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  },
};

export default function StatCard({ label, value, icon, hint, accent = 'indigo' }) {
  const a = accents[accent] || accents.indigo;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="pointer-events-none absolute -end-8 -top-8 h-24 w-24 rounded-full bg-brand-light/10 transition-transform duration-300 group-hover:scale-125 dark:bg-brand/10" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
        {icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${a.icon}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="relative mt-2.5 text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</div>
      {hint && <div className="relative mt-1.5 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}