import { useSelector } from "react-redux";
import Sidebar from "./Sidebar";

export default function AppLayout({ children }) {
  const { sidebarCollapsed } = useSelector((state) => state.ui);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar />
      <main
        className={`transition-all duration-300 ${
          sidebarCollapsed ? "ms-20" : "ms-64"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
