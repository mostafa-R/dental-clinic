import cron from 'node-cron';
import InstallmentPlan from '../modules/patients/installment.model.js';
import { withTransaction } from '../core/transaction.js';

const BATCH_SIZE = 200;

async function markOverdue() {
  try {
    const now = new Date();
    let changed = 0;
    let skip = 0;

    // Paginate so a large number of active plans never all get loaded into
    // memory in a single pass.
    for (;;) {
      const plans = await InstallmentPlan.find({ status: 'active' })
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean();

      if (plans.length === 0) break;

      for (const plan of plans) {
        // Plans with no installments are left untouched (a vacuous all-paid
        // check would otherwise mark them completed).
        if (!plan.installments || plan.installments.length === 0) continue;

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

          // Resolve the plan once nothing is pending anymore. A plan with any
          // overdue installment and no remaining pending ones is defaulted;
          // a plan where every installment is paid is completed. Mixed
          // paid+overdue states therefore always resolve instead of staying
          // 'active' forever. Plans that still have pending installments stay
          // 'active' and keep progressing on later runs.
          const hasPending = livePlan.installments.some((i) => i.status === 'pending');
          const hasOverdue = livePlan.installments.some((i) => i.status === 'overdue');

          if (!hasPending) {
            livePlan.status = hasOverdue ? 'defaulted' : 'completed';
          }

          await livePlan.save({ session });
        });

        changed++;
      }

      skip += BATCH_SIZE;
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
