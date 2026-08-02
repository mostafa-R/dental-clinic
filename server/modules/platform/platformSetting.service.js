import PlatformSetting from './platformSetting.model.js';
import { clearMaintenanceCache } from '../../middleware/maintenance.js';
import { clearIpAllowlistCache } from '../../middleware/ipAllowlist.js';

const ALLOWED_KEYS = [
  'autoSuspendDays', 'emailNotifications', 'maintenanceMode',
  'allowedDomains', 'allowedSiteIps', 'maxTenants', 'defaultPlan', 'trialDays',
  'backupEnabled', 'backupRetentionDays', 'backupTime',
];

export async function getSettings() {
  let settings = await PlatformSetting.findOne();
  if (!settings) {
    settings = await PlatformSetting.create({});
  }
  return settings;
}

export async function updateSettings(data) {
  let settings = await PlatformSetting.findOne();
  if (!settings) {
    settings = await PlatformSetting.create(data);
  } else {
    for (const key of ALLOWED_KEYS) {
      if (data[key] !== undefined) settings[key] = data[key];
    }
    await settings.save();
  }

  // Cached platform flags — drop them now so toggles apply immediately.
  if (data.maintenanceMode !== undefined) {
    await clearMaintenanceCache();
  }
  if (data.allowedSiteIps !== undefined) {
    await clearIpAllowlistCache();
  }

  return settings;
}
