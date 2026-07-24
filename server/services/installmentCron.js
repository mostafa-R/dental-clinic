import cron from 'node-cron';
import InstallmentPlan from '../modules/patients/installment.model.js';
import { withTransaction } from '../core/transaction.js';

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

      await withTransaction(async (session) => {
        const livePlan = await InstallmentPlan.findOne({ _id: plan._id, status: 'active' }).session(session);
        if (!livePlan) return;

        for (const inst of livePlan.installments) {
          if (overdueIds.some((id) => String(id) === String(inst._id)) && inst.status === 'pending') {
            inst.status = 'overdue';
          }
        }

        const allOverdue = livePlan.installments.every((i) => i.status === 'overdue');
        const allPaid = livePlan.installments.every((i) => i.status === 'paid');

        if (allPaid) livePlan.status = 'completed';
        else if (allOverdue) livePlan.status = 'defaulted';

        await livePlan.save({ session });
      });

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
