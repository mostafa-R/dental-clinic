import Skeleton from './Skeleton';
import EmptyState from './EmptyState';

export default function DataTable({
  columns,
  count = 0,
  loading = false,
  children,
  footer,
  maxHeight,
  className,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyIcon,
}) {
  const isEmpty = !loading && count === 0;

  const thead = (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
        {columns.map((c) => (
          <th
            key={c.label}
            scope="col"
            className={`px-4 py-3 text-start font-semibold ${c.className ?? ''}`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );

  const skeletonBody = (
    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {columns.map((c, j) => (
            <td key={j} className={`px-4 py-3 ${c.className ?? ''}`}>
              <Skeleton className={c.skeleton ?? 'h-4 w-24'} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );

  const emptyBody = (
    <tbody>
      <tr>
        <td colSpan={columns.length}>
          <EmptyState title={emptyTitle} message={emptyMessage} icon={emptyIcon} />
        </td>
      </tr>
    </tbody>
  );

  const table = (
    <table className="w-full text-start text-sm">
      {thead}
      {loading ? (
        skeletonBody
      ) : isEmpty ? (
        emptyBody
      ) : (
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      )}
    </table>
  );

  const inner = maxHeight ? (
    <div className="overflow-auto overscroll-contain" style={{ maxHeight }}>
      {table}
    </div>
  ) : (
    <div className="overflow-x-auto">{table}</div>
  );

  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className ?? ''}`}
    >
      {inner}
      {footer && (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">{footer}</div>
      )}
    </div>
  );
}