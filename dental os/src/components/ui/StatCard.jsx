const accents = {
  indigo: {
    icon: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    border: 'border-l-indigo-500 dark:border-l-indigo-400',
    bg: 'bg-gradient-to-br from-indigo-50/60 to-white dark:from-indigo-500/5 dark:to-slate-900',
    glow: 'group-hover:shadow-indigo-500/10',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    border: 'border-l-emerald-500 dark:border-l-emerald-400',
    bg: 'bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-500/5 dark:to-slate-900',
    glow: 'group-hover:shadow-emerald-500/10',
  },
  sky: {
    icon: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    border: 'border-l-sky-500 dark:border-l-sky-400',
    bg: 'bg-gradient-to-br from-sky-50/60 to-white dark:from-sky-500/5 dark:to-slate-900',
    glow: 'group-hover:shadow-sky-500/10',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    border: 'border-l-amber-500 dark:border-l-amber-400',
    bg: 'bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-500/5 dark:to-slate-900',
    glow: 'group-hover:shadow-amber-500/10',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    border: 'border-l-violet-500 dark:border-l-violet-400',
    bg: 'bg-gradient-to-br from-violet-50/60 to-white dark:from-violet-500/5 dark:to-slate-900',
    glow: 'group-hover:shadow-violet-500/10',
  },
  rose: {
    icon: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    border: 'border-l-rose-500 dark:border-l-rose-400',
    bg: 'bg-gradient-to-br from-rose-50/60 to-white dark:from-rose-500/5 dark:to-slate-900',
    glow: 'group-hover:shadow-rose-500/10',
  },
};

export default function StatCard({ label, value, icon, hint, accent = 'indigo' }) {
  const a = accents[accent] || accents.indigo;
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${a.border} ${a.bg} ${a.glow}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${a.icon}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}
