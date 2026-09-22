import { useT } from '../../lib/i18n';
import { statusStyle, statusTKey } from './statuses';

export default function StatusBadge({ status, size = 'sm' }) {
  const { t } = useT();
  const sizes = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
  };
  return (
    <span className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${statusStyle(status)} ${sizes[size] || sizes.sm}`}>
      {t(statusTKey(status))}
    </span>
  );
}
