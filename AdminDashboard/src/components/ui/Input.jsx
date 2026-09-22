import { useId } from "react";

export default function Input({
  label,
  icon: Icon,
  className = "",
  id,
  ...props
}) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className="relative">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
      )}
      {Icon && (
        <Icon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
      )}
      <input
        id={inputId}
        className={`${Icon ? "ps-10 " : ""}pe-4 py-2 w-full border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none ${className}`}
        {...props}
      />
    </div>
  );
}