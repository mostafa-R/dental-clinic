import cron from 'node-cron';
import InstallmentPlan from '../modules/patients/installment.model.js';

async function markOverdue() {
  try {
    const now = new Date();

    const plans = await InstallmentPlan.find({ status: 'active' }).lean();
    let changed = 0;

    for (const plan of plans) {
      const overdueIds = plan.installments
        .filter((inst) => inst.status === 'pending' && inst.dueDate < now)
        .map((inst) => inst._id);

      if (overdueIds.length === 0) continue;

      const allInstallments = plan.installments;
      const updatedInstallments = allInstallments.map((inst) =>
        overdueIds.some((id) => String(id) === String(inst._id))
          ? { ...inst, status: 'overdue' }
          : inst,
      );

      const allOverdue = updatedInstallments.every((i) => i.status === 'overdue');
      const allPaid = updatedInstallments.every((i) => i.status === 'paid');

      let newStatus = plan.status;
      if (allPaid) newStatus = 'completed';
      else if (allOverdue) newStatus = 'defaulted';

      await InstallmentPlan.findOneAndUpdate(
        { _id: plan._id, status: plan.status },
        {
          $set: {
            installments: updatedInstallments,
            status: newStatus,
          },
        },
      );
      changed++;
    }

    if (changed > 0) {
      console.log(`[InstallmentCron] Updated ${changed} plan(s) — overdue check complete`);
    }
  } catch (err) {
    console.error('[InstallmentCron] Error during overdue check:', err.message);
  }
}

let task = null;

export function startInstallmentCron() {
  task = cron.schedule('0 0 * * *', markOverdue);
  console.log('[InstallmentCron] Scheduled daily at midnight');
}

export function stopInstallmentCron() {
  if (task) {
    task.stop();
    task = null;
    console.log('[InstallmentCron] Stopped');
  }
}
