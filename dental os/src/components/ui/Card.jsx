export default function Card({ title, action, padded = true, className = '', bodyClassName = '', children }) {
  const hasHeader = Boolean(title || action);
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          {title && <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>}
          {action}
        </div>
      )}
      <div className={padded ? `p-5 ${bodyClassName}` : bodyClassName}>{children}</div>
    </section>
  );
}
