import cron from "node-cron";
import PlatformSetting from "../modules/platform/platformSetting.model.js";
import Subscription from "../modules/site/tenant/subscription.model.js";
import Tenant from "../modules/site/tenant/tenant.model.js";
import { invalidateTenant } from "../utils/cache.js";
import { withTransaction } from "../core/transaction.js";

async function checkAndSuspend() {
  try {
    const settings = await PlatformSetting.findOne().lean();
    const graceDays = settings?.autoSuspendDays ?? 30;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - graceDays);

    const overdue = await Subscription.find({
      status: { $in: ["pending", "past_due"] },
      nextPaymentAt: { $lt: cutoff },
    })
      .populate("tenant")
      .lean();

    for (const sub of overdue) {
      if (!sub.tenant) continue;

      // Tenant suspension + subscription status must land atomically — a
      // partial failure between the two writes would leave a suspended tenant
      // with an active subscription (or an overdue tenant never suspended).
      await withTransaction(async (session) => {
        await Tenant.findByIdAndUpdate(
          sub.tenant._id,
          { status: "suspended", isActive: false },
          { session },
        );

        await Subscription.findByIdAndUpdate(
          sub._id,
          { status: "past_due" },
          { session },
        );
      });

      // Drop the cached tenant immediately so the status change takes effect
      // right away instead of after the 2-minute tenant cache TTL.
      await invalidateTenant(String(sub.tenant._id));

      console.log(
        `[Auto-Suspend] Suspended tenant "${sub.tenant.name}" (${sub.tenant._id}) — overdue since ${sub.nextPaymentAt?.toISOString()}`,
      );
    }

    if (overdue.length > 0) {
      console.log(
        `[Auto-Suspend] Check complete: ${overdue.length} tenant(s) suspended`,
      );
    }
  } catch (err) {
    console.error("[Auto-Suspend] Error during suspension check:", err.message);
  }
}

let suspensionTask = null;

export { checkAndSuspend };

export function startSuspensionCron() {
  suspensionTask = cron.schedule("0 0 * * *", checkAndSuspend);
  console.log("[Auto-Suspend] Cron scheduled daily at midnight");
}

export function stopSuspensionCron() {
  if (suspensionTask) {
    suspensionTask.stop();
    suspensionTask = null;
    console.log("[Auto-Suspend] Cron stopped");
  }
}
