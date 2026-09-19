import Card from "./Card";

const variantStyles = {
  default: {
    chip: "bg-indigo-100 dark:bg-indigo-900/50",
    icon: "text-indigo-600 dark:text-indigo-400",
  },
  info: {
    chip: "bg-blue-100 dark:bg-blue-900/50",
    icon: "text-blue-600 dark:text-blue-400",
  },
  success: {
    chip: "bg-emerald-100 dark:bg-emerald-900/50",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    chip: "bg-amber-100 dark:bg-amber-900/50",
    icon: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    chip: "bg-red-100 dark:bg-red-900/50",
    icon: "text-red-600 dark:text-red-400",
  },
  neutral: {
    chip: "bg-slate-100 dark:bg-slate-700/60",
    icon: "text-slate-600 dark:text-slate-300",
  },
};

export default function StatCard({
  title,
  value,
  change,
  icon: Icon,
  trend = "up",
  subtitle,
  variant = "default",
}) {
  const trendColors = {
    up: "text-emerald-600 dark:text-emerald-400",
    down: "text-red-600 dark:text-red-400",
  };

  const styles = variantStyles[variant] || variantStyles.default;

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
          <div className={`p-3 rounded-lg ${styles.chip}`}>
            <Icon className={`w-6 h-6 ${styles.icon}`} />
          </div>
        )}
      </div>
    </Card>
  );
}
