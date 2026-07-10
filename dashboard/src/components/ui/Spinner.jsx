export function Spinner({ size = "md", className = "" }) {
  const sizes = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
    xl: "h-12 w-12",
  };

  return (
    <div
      className={`animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400 ${sizes[size]} ${className}`}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Spinner size="xl" />
    </div>
  );
}
