import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useT } from "../../lib/i18n";

const STATUS_LABELS = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  checked_in: "Checked-in",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const STATUS_COLORS = {
  scheduled: "#6366f1",
  confirmed: "#3b82f6",
  checked_in: "#f59e0b",
  in_progress: "#10b981",
  completed: "#6b7280",
  cancelled: "#ef4444",
  no_show: "#8b5cf6",
};

const STATUS_ORDER = [
  "scheduled",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

export default function AppointmentQueue({ queueByStatus }) {
  const { t } = useT();
  const data = STATUS_ORDER.map((key) => ({
    key,
    name: STATUS_LABELS[key],
    value: queueByStatus?.[key] || 0,
  })).filter((d) => d.value > 0);

  if (!data.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        {t("common.none")}
      </p>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      <div className="relative shrink-0">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={data}
              cx={100}
              cy={100}
              innerRadius={62}
              outerRadius={90}
              dataKey="value"
              paddingAngle={3}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={STATUS_COLORS[d.key] || "#94a3b8"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{total}</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Total</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-1">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={d.key} className="flex items-center gap-2.5 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-sm shadow-sm"
                style={{ backgroundColor: STATUS_COLORS[d.key] || "#94a3b8" }}
              />
              <span className="text-slate-600 dark:text-slate-300">{d.name}</span>
              <span className="ms-auto flex items-center gap-1.5">
                <span className="font-semibold text-slate-900 dark:text-white">{d.value}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
