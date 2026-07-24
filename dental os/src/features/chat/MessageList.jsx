import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { formatTime } from '../../lib/format';
import { useT } from '../../lib/i18n';
import Spinner from '../ui/Spinner';

export default function MessageList() {
  const { t } = useT();
  const { messages, status, sendingStatus } = useSelector((s) => s.chat);
  const user = useSelector((s) => s.auth.user);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (status === 'loading' && messages.length === 0) {
    return <div className="flex-1 p-4"><Spinner label={t('chat.loading')} /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {messages.map((msg) => {
        const isOwn = msg.sender ? String(msg.sender._id) === String(user._id) : false;
        const bubbleClass = isOwn
          ? 'bg-indigo-600 text-white'
          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
        return (
          <div key={msg._id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 break-words ${bubbleClass}`}>
              {!isOwn && msg.sender && <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{msg.sender.name}</p>}
              <p className="text-sm whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>{msg.content}</p>
              <p className={`mt-1 text-xs ${isOwn ? 'text-indigo-200' : 'text-slate-400'}`}>
                {formatTime(new Date(msg.createdAt))}
              </p>
            </div>
          </div>
        );
      })}
      {sendingStatus === 'loading' && (
        <div className="flex justify-end">
          <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <span className="text-xs text-slate-400">{t('chat.sending')}</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}