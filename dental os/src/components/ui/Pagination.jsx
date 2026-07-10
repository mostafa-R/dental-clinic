export default function Pagination({ page, pages, total, pageSize = 20, onChange }) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const goto = (p) => {
    if (p >= 1 && p <= pages) onChange(p);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-200">{from}</span>–
        <span className="font-medium text-slate-700 dark:text-slate-200">{to}</span>{' '}
        <span className="text-slate-400">/</span>{' '}
        <span className="font-medium text-slate-700 dark:text-slate-200">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => goto(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Prev
        </button>
        <span className="px-2 text-sm text-slate-600 dark:text-slate-300">
          {page} / {pages}
        </span>
        <button
          type="button"
          onClick={() => goto(page + 1)}
          disabled={page >= pages}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Next
        </button>
      </div>
    </div>
  );
}
