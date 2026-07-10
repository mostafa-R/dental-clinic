const colorMap = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

export default function UsageQuotaBar({ label, used, limit, unit = "", color = "indigo" }) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  const barColor = isAtLimit
    ? "bg-red-500"
    : isNearLimit
    ? "bg-amber-500"
    : colorMap[color] || "bg-indigo-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        <span className="font-medium text-slate-900 dark:text-white">
          {used.toLocaleString()} / {limit === 999999 || limit === 0 ? "∞" : limit.toLocaleString()}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      {limit > 0 && limit < 999999 && (
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
      {isAtLimit && (
        <p className="text-xs text-red-500 font-medium">{label} limit reached</p>
      )}
      {isNearLimit && !isAtLimit && (
        <p className="text-xs text-amber-500">{Math.round(100 - percentage)}% remaining</p>
      )}
    </div>
  );
}
