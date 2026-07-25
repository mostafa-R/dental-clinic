const BAR_COLORS = [
  { bar: 'bg-indigo-500 dark:bg-indigo-400', ring: 'ring-indigo-500/20' },
  { bar: 'bg-sky-500 dark:bg-sky-400', ring: 'ring-sky-500/20' },
  { bar: 'bg-emerald-500 dark:bg-emerald-400', ring: 'ring-emerald-500/20' },
  { bar: 'bg-amber-500 dark:bg-amber-400', ring: 'ring-amber-500/20' },
  { bar: 'bg-violet-500 dark:bg-violet-400', ring: 'ring-violet-500/20' },
  { bar: 'bg-rose-500 dark:bg-rose-400', ring: 'ring-rose-500/20' },
  { bar: 'bg-cyan-500 dark:bg-cyan-400', ring: 'ring-cyan-500/20' },
  { bar: 'bg-pink-500 dark:bg-pink-400', ring: 'ring-pink-500/20' },
];

export default function BarChart({ data, formatValue, colored = true }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-4">
      {data.map((d, i) => {
        const color = colored ? BAR_COLORS[i % BAR_COLORS.length] : BAR_COLORS[0];
        return (
          <li key={d.label}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">{d.label}</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {formatValue ? formatValue(d.value) : d.value}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${color.bar}`}
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
