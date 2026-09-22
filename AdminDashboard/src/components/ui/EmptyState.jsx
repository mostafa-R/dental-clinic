export default function EmptyState({ title, description, action, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {Icon && (
        <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-full mb-4">
          <Icon className="w-12 h-12 text-slate-400" />
        </div>
      )}
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
