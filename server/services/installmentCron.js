import cron from 'node-cron';
import InstallmentPlan from '../modules/patients/installment.model.js';
import Patient from '../modules/patients/patient.model.js';
import WhatsAppSetting from '../modules/whatsapp/whatsappSetting.model.js';
import { emitToBranch } from '../socket/index.js';
import { withTransaction } from '../core/transaction.js';
import { round2 } from '../constants/accounting.js';
import { sendWhatsAppMessage } from './whatsapp.js';

const BATCH_SIZE = 200;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function markOverdue() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
    let changed = 0;
    let skip = 0;
    const affectedPlans = [];

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

        // PRD §6.3: a plan defaults once ≥2 of its installments are overdue
        // by ≥30 days — regardless of whether others are still pending.
        const needsDefaulting =
          plan.installments.filter(
            (inst) => inst.status !== 'paid' && inst.dueDate < thirtyDaysAgo,
          ).length >= 2;
        const allPaid = plan.installments.every((inst) => inst.status === 'paid');

        if (overdueIds.length === 0 && !needsDefaulting && !allPaid) continue;

        await withTransaction(async (session) => {
          const livePlan = await InstallmentPlan.findOne({ _id: plan._id, status: 'active' }).session(session);
          if (!livePlan) return;

          for (const inst of livePlan.installments) {
            if (overdueIds.some((id) => String(id) === String(inst._id)) && inst.status === 'pending') {
              inst.status = 'overdue';
            }
          }

          // Plan resolution (PRD §6.3):
          //   - every installment paid            → completed
          //   - ≥2 installments overdue ≥30 days  → defaulted
          //   - anything else                     → stays active
          const liveAllPaid = livePlan.installments.every((i) => i.status === 'paid');
          const liveDefaulted =
            livePlan.installments.filter(
              (i) => i.status !== 'paid' && new Date(i.dueDate).getTime() < thirtyDaysAgo.getTime(),
            ).length >= 2;

          if (liveAllPaid) {
            livePlan.status = 'completed';
          } else if (liveDefaulted) {
            livePlan.status = 'defaulted';
          }

          await livePlan.save({ session });
        });

        changed++;

        // Collect overdue info for reception alerts / patient notifications.
        const overdueInstallments = plan.installments.filter(
          (inst) => inst.status !== 'paid' && inst.dueDate < now,
        );
        if (overdueInstallments.length > 0) {
          affectedPlans.push({
            planId: plan._id,
            branch: plan.branch,
            tenant: plan.tenant,
            patientId: plan.patient,
            title: plan.title,
            overdueCount: overdueInstallments.length,
            overdueAmount: round2(
              overdueInstallments.reduce(
                (s, inst) => s + (inst.amount + (inst.lateFee || 0)) - (inst.paidAmount || 0),
                0,
              ),
            ),
          });
        }
      }

      skip += BATCH_SIZE;
    }

    if (changed > 0) {
      console.log(`[InstallmentCron] Updated ${changed} plan(s) — overdue check complete`);
    }

    await notifyOverdue(affectedPlans);
  } catch (err) {
    console.error('[InstallmentCron] Error during overdue check:', err.message);
  }
}

/**
 * PRD §6.3: the daily check alerts the reception team over the branch socket
 * and notifies the patient via WhatsApp when the tenant enabled it.
 */
async function notifyOverdue(affectedPlans) {
  for (const info of affectedPlans) {
    emitToBranch(info.branch, 'installment.overdue', {
      installmentPlanId: String(info.planId),
      patientId: String(info.patientId),
      title: info.title,
      overdueCount: info.overdueCount,
      overdueAmount: info.overdueAmount,
    });
  }

  const tenantsWithMessaging = [...new Set(affectedPlans.map((p) => String(p.tenant)).filter(Boolean))];
  for (const tenantId of tenantsWithMessaging) {
    try {
      const settings = await WhatsAppSetting.findOne({
        tenant: tenantId,
        enabled: true,
        status: 'connected',
        'settings.installmentReminder': true,
      })
        .select('_id')
        .lean();
      if (!settings) continue;

      const plansForTenant = affectedPlans.filter((p) => String(p.tenant) === tenantId);
      const BATCH_SIZE_MSG = 5;
      for (let i = 0; i < plansForTenant.length; i += BATCH_SIZE_MSG) {
        await Promise.allSettled(
          plansForTenant.slice(i, i + BATCH_SIZE_MSG).map(async (info) => {
            try {
              const patient = await Patient.findById(info.patientId)
                .select('firstName phone')
                .lean();
              if (!patient?.phone) return;

              const message = [
                'تنبيه أقساط متأخرة 🦷',
                '',
                `مرحباً ${patient.firstName}،`,
                `لديك ${info.overdueCount} قسط متأخر بخططة "${info.title}" بقيمة ${info.overdueAmount}.`,
                'يرجى سداد المبلغ المتأخر في أقرب فرصة — شكراً لتعاونك.',
              ].join('\n');

              await sendWhatsAppMessage(tenantId, patient.phone, message);
            } catch (err) {
              console.error(`[InstallmentCron] WhatsApp failed for plan ${info.planId}: ${err.message}`);
            }
          }),
        );
        if (i + BATCH_SIZE_MSG < plansForTenant.length) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } catch (err) {
      console.error(`[InstallmentCron] Messaging failed for tenant ${tenantId}: ${err.message}`);
    }
  }
}

let task = null;

export function startInstallmentCron() {
  task = cron.schedule('0 2 * * *', markOverdue);
  console.log('[InstallmentCron] Scheduled daily at 02:00');
}

export function stopInstallmentCron() {
  if (task) {
    task.stop();
    task = null;
    console.log('[InstallmentCron] Stopped');
  }
}
