import Card from "./Card";

export default function StatCard({
  title,
  value,
  change,
  icon: Icon,
  trend = "up",
  subtitle,
}) {
  const trendColors = {
    up: "text-emerald-600 dark:text-emerald-400",
    down: "text-red-600 dark:text-red-400",
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {value}
          </p>
          {change && (
            <p className={`mt-1 text-sm ${trendColors[trend]}`}>
              {trend === "up" ? "↑" : "↓"} {change}
            </p>
          )}
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
            <Icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
        )}
      </div>
    </Card>
  );
}
