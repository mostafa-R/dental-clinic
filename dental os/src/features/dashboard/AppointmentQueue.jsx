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
    <div className="flex flex-wrap items-center gap-6">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie
            data={data}
            cx={80}
            cy={80}
            innerRadius={50}
            outerRadius={72}
            dataKey="value"
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={STATUS_COLORS[d.key] || "#94a3b8"} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: STATUS_COLORS[d.key] || "#94a3b8" }}
            />
            <span className="text-slate-500 dark:text-slate-400">{d.name}</span>
            <span className="ms-auto font-medium text-slate-900 dark:text-white">
              {d.value}
            </span>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
          {total} total
        </div>
      </div>
    </div>
  );
}
