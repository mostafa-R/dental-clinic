export default function Card({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
