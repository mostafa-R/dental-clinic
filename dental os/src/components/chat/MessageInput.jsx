import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sendMessage } from '../../features/chat/chatSlice';
import { useT } from '../../lib/i18n';

export default function MessageInput() {
  const { t } = useT();
  const dispatch = useDispatch();
  const { activeChat, sendingStatus } = useSelector((s) => s.chat);
  const [content, setContent] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, [content]);

  const disabled = !activeChat || sendingStatus === 'loading';

  const handleSend = () => {
    if (!content.trim() || disabled) return;
    const payload = activeChat.type === 'dm'
      ? { recipient: activeChat.id, content: content.trim() }
      : { channel: activeChat.id, content: content.trim() };
    dispatch(sendMessage(payload));
    setContent('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.inputPlaceholder')}
          disabled={disabled}
          rows={1}
          className="max-h-40 min-h-[38px] flex-1 resize-none overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/20"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !content.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}