import { useSelector } from "react-redux";
import { useT } from "../../lib/i18n";

const CHANNELS = [
  {
    key: "doctors",
    labelKey: "chat.channel.doctors",
    descKey: "chat.channel.doctorsDesc",
  },
  {
    key: "accounting",
    labelKey: "chat.channel.accounting",
    descKey: "chat.channel.accountingDesc",
  },
  {
    key: "general",
    labelKey: "chat.channel.general",
    descKey: "chat.channel.generalDesc",
  },
];

export default function ChatSidebar({ activeChat, onSelectChat, onClose }) {
  const { t } = useT();
  const staff = useSelector((s) => s.chat.staff);
  const unread = useSelector((s) => s.chat.unread);

  const activeClass =
    "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300";

  return (
    <aside className="flex w-64 shrink-0 flex-col border-e border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {t("chat.title")}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t("chat.channels")}
        </p>
        {CHANNELS.map((ch) => {
          const chUnread = unread[`channel:${ch.key}`] || 0;
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => onSelectChat({ type: "channel", id: ch.key })}
              className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                activeChat?.type === "channel" && activeChat.id === ch.key
                  ? activeClass
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  activeChat?.type === "channel" && activeChat.id === ch.key
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                #
              </span>
              <span className="flex-1 text-start">
                <span className="block">{t(ch.labelKey)}</span>
                <span className="block text-xs text-slate-400">
                  {t(ch.descKey)}
                </span>
              </span>
              {chUnread > 0 && (
                <span className="absolute end-2 top-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                  {chUnread > 99 ? "99+" : chUnread}
                </span>
              )}
            </button>
          );
        })}
        <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t("chat.staff")}
        </p>
        {staff.map((user) => {
          const unreadCount = unread[user._id] || 0;
          return (
            <button
              key={user._id}
              type="button"
              onClick={() =>
                onSelectChat({ type: "dm", id: user._id, name: user.name })
              }
              className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                activeChat?.type === "dm" && activeChat.id === user._id
                  ? activeClass
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {user.name?.[0] || "?"}
                <span className="absolute bottom-0 end-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
              </span>
              <span className="flex-1 text-start">
                <span className="block">{user.name}</span>
                <span className="block text-xs capitalize text-slate-400">
                  {user.role.replace("_", " ")}
                </span>
              </span>
              {unreadCount > 0 && (
                <span className="absolute end-2 top-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
