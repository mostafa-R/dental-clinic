import PlatformSetting from './platformSetting.model.js';

const ALLOWED_KEYS = [
  'autoSuspendDays', 'emailNotifications', 'maintenanceMode',
  'allowedDomains', 'maxTenants', 'defaultPlan', 'trialDays',
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
  return settings;
}
