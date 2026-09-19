import { useId } from "react";

export default function Select({ label, className = "", id, children, ...props }) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div>
      {label && (
        <label
          htmlFor={selectId}
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`px-4 py-2 w-full border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}