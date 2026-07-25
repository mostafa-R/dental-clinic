export default function Card({ title, action, accent, padded = true, className = '', bodyClassName = '', children }) {
  const hasHeader = Boolean(title || action);
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {hasHeader && (
        <div className={`flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 ${accent ? 'bg-gradient-to-r from-' + accent + '-50/80 to-transparent dark:from-' + accent + '-500/10' : ''}`}>
          <div className="flex items-center gap-3">
            {accent && (
              <span className={`h-1 w-8 rounded-full bg-${accent}-500 dark:bg-${accent}-400`} />
            )}
            {title && <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? `p-5 ${bodyClassName}` : bodyClassName}>{children}</div>
    </section>
  );
}
