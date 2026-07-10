export default function StatCard({ label, value, icon, hint, accent = 'indigo' }) {
  const accents = {
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accents[accent] || accents.indigo}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}
