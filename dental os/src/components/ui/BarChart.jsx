export default function BarChart({ data, formatValue }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">{d.label}</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {formatValue ? formatValue(d.value) : d.value}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all dark:bg-indigo-400"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
