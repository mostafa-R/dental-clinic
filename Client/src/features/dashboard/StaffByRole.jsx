import BarChart from '../../components/ui/BarChart';
import EmptyState from '../../components/ui/EmptyState';
import { roleLabel } from '../../lib/roles';
import { useT } from '../../lib/i18n';

export default function StaffByRole({ staffByRole }) {
  const { t } = useT();
  const data = staffByRole.map((r) => ({ label: roleLabel(r.role), value: r.count }));

  if (!data.length) {
    return <EmptyState title={t('dashboard.noStaffYet')} message={t('dashboard.noStaffHint')} />;
  }

  return <BarChart data={data} />;
}
