import fs from 'fs';
import WhatsAppSetting from '../modules/whatsapp/whatsappSetting.model.js';

const clients = new Map();

function getClientKey(tenantId) {
  return String(tenantId);
}

export async function getWhatsAppSettings(tenantId) {
  let settings = await WhatsAppSetting.findOne({ tenant: tenantId }).select('+config.session +config.accessToken +qrCode');
  if (!settings) {
    settings = await WhatsAppSetting.create({ tenant: tenantId });
  }
  return settings;
}

export async function updateWhatsAppSettings(tenantId, data) {
  const update = {};
  if (data.enabled !== undefined) update.enabled = data.enabled;
  if (data.provider) update.provider = data.provider;
  if (data.config) {
    Object.entries(data.config).forEach(([k, v]) => {
      if (v !== undefined) update[`config.${k}`] = v;
    });
  }
  if (data.settings) {
    Object.entries(data.settings).forEach(([k, v]) => {
      if (v !== undefined) update[`settings.${k}`] = v;
    });
  }

  const settings = await WhatsAppSetting.findOneAndUpdate(
    { tenant: tenantId },
    { $set: update },
    { upsert: true, returnDocument: 'after', select: '+config.session +config.accessToken +qrCode' },
  );
  return settings;
}

function getChromePath() {
  const paths = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter(Boolean);
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return undefined;
}

export async function connectWhatsApp(tenantId) {
  const key = getClientKey(tenantId);
  if (clients.has(key)) {
    return { status: 'connected' };
  }

  await WhatsAppSetting.findOneAndUpdate(
    { tenant: tenantId },
    { $set: { status: 'connecting', lastError: '' } },
  );

  const { Client } = await import('whatsapp-web.js');
  const chromePath = getChromePath();
  if (!chromePath) {
    const errMsg = 'Chrome/Chromium not found. Install Chrome or set CHROME_PATH env variable.';
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      { $set: { status: 'error', lastError: errMsg, qrCode: '' } },
    );
    throw new Error(errMsg);
  }

  const client = new Client({
    puppeteer: {
      executablePath: chromePath,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-zygote',
      ],
    },
  });

  client.on('qr', async (qr) => {
    const qrData = await import('qrcode');
    const qrImage = await qrData.toDataURL(qr);
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      { $set: { qrCode: qrImage, status: 'connecting' } },
    );
  });

  client.on('ready', async () => {
    const info = client.info;
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      {
        $set: {
          status: 'connected',
          'config.phoneNumber': info.wid.user,
          qrCode: '',
          lastError: '',
        },
      },
    );
  });

  client.on('disconnected', async (reason) => {
    clients.delete(key);
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      { $set: { status: 'disconnected', qrCode: '' } },
    );

    const setting = await WhatsAppSetting.findOne({ tenant: tenantId }).lean();
    if (setting?.enabled) {
      const retryDelays = [5000, 15000, 30000];
      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt]));
        if (clients.has(key)) break;
        try {
          console.log(`[WhatsApp] Auto-reconnect attempt ${attempt + 1} for tenant ${tenantId}`);
          await connectWhatsApp(tenantId);
          console.log(`[WhatsApp] Auto-reconnected for tenant ${tenantId}`);
          break;
        } catch {
          console.warn(`[WhatsApp] Auto-reconnect attempt ${attempt + 1} failed for tenant ${tenantId}`);
        }
      }
    }
  });

  client.on('auth_failure', async (msg) => {
    clients.delete(key);
    try { await client.destroy(); } catch {}
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      { $set: { status: 'error', lastError: msg, qrCode: '' } },
    );
  });

  try {
    await client.initialize();
    clients.set(key, client);
    return { status: 'connecting' };
  } catch (err) {
    try { await client.destroy(); } catch {}
    clients.delete(key);
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      { $set: { status: 'error', lastError: err.message, qrCode: '' } },
    );
    throw err;
  }
}

export async function disconnectWhatsApp(tenantId) {
  const key = getClientKey(tenantId);
  const client = clients.get(key);
  if (client) {
    try {
      await client.destroy();
    } catch {}
    clients.delete(key);
  }
  await WhatsAppSetting.findOneAndUpdate(
    { tenant: tenantId },
    { $set: { status: 'disconnected', qrCode: '', lastError: '' } },
  );
}

export async function sendWhatsAppMessage(tenantId, to, message) {
  const key = getClientKey(tenantId);
  const client = clients.get(key);
  if (!client) {
    const settings = await WhatsAppSetting.findOne({ tenant: tenantId });
    if (!settings?.enabled) {
      throw new Error('WhatsApp غير مفعل لهذه العيادة');
    }
    throw new Error('WhatsApp client not connected');
  }

  if (!client.info?.wid?.user) {
    clients.delete(key);
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      { $set: { status: 'disconnected', lastError: 'Session expired — reconnect required', qrCode: '' } },
    );
    throw new Error('WhatsApp session expired. Please disconnect and reconnect.');
  }

  const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
  try {
    await client.sendMessage(chatId, message);
  } catch (err) {
    const isFatal = err.message === 't';
    if (isFatal) {
      clients.delete(key);
      try { await client.destroy(); } catch {}
      await WhatsAppSetting.findOneAndUpdate(
        { tenant: tenantId },
        { $set: { status: 'error', lastError: err.message, qrCode: '' } },
      );
    }
    const errorMsg = isFatal
      ? 'Browser engine error. Install Chrome 124+ or set CHROME_PATH env var.'
      : err.message;
    throw new Error(errorMsg);
  }
}

export async function getWhatsAppStatus(tenantId) {
  const key = getClientKey(tenantId);
  const client = clients.get(key);
  return {
    connected: !!client,
    ready: client?.info?.wid?.user ? true : false,
  };
}

export async function disconnectAllWhatsAppClients() {
  const tasks = [];
  for (const [key, client] of clients.entries()) {
    tasks.push(client.destroy().catch(() => {}));
  }
  await Promise.allSettled(tasks);
  clients.clear();
}
