import PlatformSetting from './platformSetting.model.js';

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
    Object.assign(settings, data);
    await settings.save();
  }
  return settings;
}
