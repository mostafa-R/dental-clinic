import cron from "node-cron";
import PlatformSetting from "../models/PlatformSetting.js";
import Subscription from "../models/Subscription.js";
import Tenant from "../models/Tenant.js";

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

      await Tenant.findByIdAndUpdate(sub.tenant._id, {
        status: "suspended",
        isActive: false,
      });

      await Subscription.findByIdAndUpdate(sub._id, { status: "past_due" });

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
