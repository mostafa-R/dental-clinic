import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sendMessage } from './chatSlice';
import { showErrorDialog } from '../ui/uiSlice';
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

  const handleSend = async () => {
    if (!content.trim() || disabled) return;
    const text = content.trim();
    const payload = activeChat.type === 'dm'
      ? { recipient: activeChat.id, content: text }
      : { channel: activeChat.id, content: text };
    setContent('');
    try {
      await dispatch(sendMessage(payload)).unwrap();
    } catch (err) {
      // Restore the draft so a failed send never loses the message.
      setContent(text);
      dispatch(showErrorDialog(err));
    }
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
          aria-label={t('chat.inputPlaceholder')}
          disabled={disabled}
          rows={1}
          className="max-h-40 min-h-[38px] flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand dark:focus:ring-brand/20"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !content.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand/25 transition hover:bg-brand-dark active:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand dark:hover:bg-brand-dark"
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}