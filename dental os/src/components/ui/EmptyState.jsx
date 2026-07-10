export default function EmptyState({ title = 'Nothing here yet', message }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h18M3 12h18M3 17h18" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {message && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{message}</p>}
    </div>
  );
}
