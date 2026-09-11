import fs from 'fs';
import ApiError from '../utils/ApiError.js';
import WhatsAppSetting from '../modules/whatsapp/whatsappSetting.model.js';

const WHATSAPP_WEB = 'whatsapp_web';
const CLOUD_API = 'cloud_api';
const SUPPORTED_PROVIDERS = [WHATSAPP_WEB, CLOUD_API];
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const clients = new Map();
const connecting = new Map();

function getClientKey(tenantId) {
  return String(tenantId);
}

function defaultCountryCode() {
  // WhatsApp expects international digits (no "+", no leading zero). Patient
  // numbers in this product are stored free-form (e.g. "01012345678"), so we
  // prepend a default country code when the number looks local. Override per
  // deployment via WHATSAPP_DEFAULT_COUNTRY (Egypt = 20).
  return String(process.env.WHATSAPP_DEFAULT_COUNTRY || '20');
}

/**
 * Normalize a raw user-supplied phone number into international digits
 * suitable for WhatsApp (e.g. "01012345678" -> "201012345678").
 * Numbers already in international form (>= 11 digits or carrying the
 * default country prefix) are left untouched.
 */
export function normalizeE164(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length < 11 && !digits.startsWith(defaultCountryCode())) {
    digits = `${defaultCountryCode()}${digits}`;
  }
  return digits;
}

export async function getWhatsAppSettings(tenantId) {
  let settings = await WhatsAppSetting.findOne({ tenant: tenantId }).select('+config.session +config.accessToken +qrCode');
  if (!settings) {
    settings = await WhatsAppSetting.create({ tenant: tenantId });
  }
  return settings;
}

const ALLOWED_CONFIG_KEYS = ['phoneNumber', 'phoneNumberId', 'accessToken'];
const ALLOWED_SETTINGS_KEYS = [
  'appointmentReminder',
  'appointmentConfirm',
  'reminderHours',
  'reminderHoursSecondary',
  'installmentReminder',
  'noShowReminder',
  'queueNotifications',
];

export async function updateWhatsAppSettings(tenantId, data) {
  if (data.provider && !SUPPORTED_PROVIDERS.includes(data.provider)) {
    throw ApiError.badRequest(
      `Provider "${data.provider}" is not supported. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}.`,
    );
  }

  let settings = await WhatsAppSetting.findOne({ tenant: tenantId });
  if (!settings) {
    settings = new WhatsAppSetting({ tenant: tenantId });
  }

  const providerChanged = Boolean(data.provider && data.provider !== settings.provider);
  const disabling = data.enabled === false;

  if (data.enabled !== undefined) settings.enabled = data.enabled;
  if (data.provider) settings.provider = data.provider;
  if (data.config) {
    for (const [k, v] of Object.entries(data.config)) {
      if (ALLOWED_CONFIG_KEYS.includes(k) && v !== undefined) settings.config[k] = v;
    }
  }
  if (data.settings) {
    for (const [k, v] of Object.entries(data.settings)) {
      if (ALLOWED_SETTINGS_KEYS.includes(k) && v !== undefined) settings.settings[k] = v;
    }
  }

  // Disabling WhatsApp or switching providers must tear down the running
  // client — otherwise a stale Chrome process / live session would linger
  // until the server restarts.
  if (providerChanged || disabling) {
    await disposeWhatsAppForTenant(tenantId);
    settings.status = 'disconnected';
    settings.qrCode = '';
  }

  await settings.save();
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

async function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a text message through the Meta WhatsApp Cloud API (no extra SDK).
 * Returns the Graph API JSON response body.
 */
export async function sendViaCloudApi(config, to, message) {
  const { accessToken, phoneNumberId } = config || {};
  if (!accessToken || !phoneNumberId) {
    throw ApiError.badRequest('Cloud API requires accessToken and phoneNumberId. Configure them before sending.');
  }
  const recipient = normalizeE164(to);
  if (!recipient) throw ApiError.badRequest('A valid recipient phone number is required');

  const res = await fetchWithTimeout(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw ApiError.internal(`Cloud API send failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Verify Meta Cloud API credentials are valid before marking the tenant
 * connected. A 401/403 means the token or phone number id is wrong.
 */
async function validateCloudApiCredentials(config) {
  const { accessToken, phoneNumberId } = config || {};
  if (!accessToken || !phoneNumberId) {
    throw ApiError.badRequest('Cloud API requires accessToken and phoneNumberId. Configure them before connecting.');
  }
  const res = await fetchWithTimeout(`${GRAPH_API_BASE}/${phoneNumberId}?fields=id`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw ApiError.badRequest('Cloud API credentials rejected. Check the access token and phone number ID.');
  }
  if (!res.ok) {
    throw ApiError.internal(`Cloud API verification failed (${res.status})`);
  }
}

function maxConnectedClients() {
  const raw = Number(process.env.WHATSAPP_MAX_CONNECTED || 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

export async function connectWhatsApp(tenantId) {
  const key = getClientKey(tenantId);
  const settings = await getWhatsAppSettings(tenantId);

  // Cloud API has no session to pair: connected state is driven by verified
  // credentials, not an in-memory client.
  if (settings.provider === CLOUD_API) {
    if (settings.status === 'connected') {
      return { status: 'connected', provider: CLOUD_API };
    }
    await validateCloudApiCredentials(settings.config || {});
    await WhatsAppSetting.findByIdAndUpdate(settings._id, {
      $set: { status: 'connected', lastError: '', qrCode: '' },
    });
    return { status: 'connected', provider: CLOUD_API };
  }

  const client = clients.get(key);
  if (client) {
    return { status: 'connected', ready: Boolean(client.info?.wid?.user) };
  }

  // Concurrency guard: two simultaneous connect requests must not both
  // spawn a Chrome instance. The second caller awaits the first's promise.
  if (connecting.has(key)) {
    return connecting.get(key);
  }

  if (clients.size >= maxConnectedClients()) {
    throw ApiError.tooManyRequests(
      `WhatsApp connection limit reached (${maxConnectedClients()} concurrent). Disconnect an unused clinic or raise WHATSAPP_MAX_CONNECTED.`,
    );
  }

  const promise = doConnect(tenantId, key);
  connecting.set(key, promise);
  try {
    return await promise;
  } finally {
    connecting.delete(key);
  }
}

async function doConnect(tenantId, key) {
  await WhatsAppSetting.findOneAndUpdate(
    { tenant: tenantId },
    { $set: { status: 'connecting', lastError: '' } },
  );

  const { Client, LocalAuth } = await import('whatsapp-web.js');
  const chromePath = getChromePath();
  if (!chromePath) {
    const errMsg = 'Chrome/Chromium not found. Install Chrome or set CHROME_PATH env variable.';
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      { $set: { status: 'error', lastError: errMsg, qrCode: '' } },
    );
    throw ApiError.internal(errMsg);
  }

  const client = new Client({
    // Persist the authenticated session per tenant (clientId) so a restart
    // does not force a new QR scan. LocalAuth stores the login state under
    // .wwebjs_auth/<clientId> and restores it automatically on initialize().
    authStrategy: new LocalAuth({ clientId: key }),
    puppeteer: {
      executablePath: chromePath,
      headless: true,
      // Isolated Chrome profile per tenant — no concurrent profile-lock races.
      userDataDir: `./.wwebjs_chrome/${key}`,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-zygote',
        '--no-sandbox',
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
  connecting.delete(key);
  await WhatsAppSetting.findOneAndUpdate(
    { tenant: tenantId },
    { $set: { status: 'disconnected', qrCode: '', lastError: '' } },
  );
}

/**
 * Tear down the in-memory client WITHOUT touching the database. Used when the
 * tenant is being deleted or when settings (provider/disable) change.
 */
export async function disposeWhatsAppForTenant(tenantId) {
  const key = getClientKey(tenantId);
  const client = clients.get(key);
  if (client) {
    try {
      await client.destroy();
    } catch {}
    clients.delete(key);
  }
  connecting.delete(key);
}

export async function sendWhatsAppMessage(tenantId, to, message) {
  const settings = await WhatsAppSetting.findOne({ tenant: tenantId })
    .select('+config.accessToken enabled provider status')
    .lean();
  if (!settings?.enabled) {
    throw ApiError.badRequest('WhatsApp is not enabled for this clinic');
  }

  // Cloud API: stateless HTTP send through the Meta Graph API.
  if (settings.provider === CLOUD_API) {
    if (settings.status !== 'connected') {
      throw ApiError.conflict('Cloud API is not connected — connect first');
    }
    return sendViaCloudApi(settings.config, to, message);
  }

  const key = getClientKey(tenantId);
  const client = clients.get(key);
  if (!client) {
    throw ApiError.conflict('WhatsApp client not connected');
  }

  if (!client.info?.wid?.user) {
    clients.delete(key);
    await WhatsAppSetting.findOneAndUpdate(
      { tenant: tenantId },
      { $set: { status: 'disconnected', lastError: 'Session expired — reconnect required', qrCode: '' } },
    );
    throw ApiError.conflict('WhatsApp session expired. Please disconnect and reconnect.');
  }

  const recipient = normalizeE164(to);
  if (!recipient) {
    throw ApiError.badRequest('A valid recipient phone number is required');
  }

  const chatId = `${recipient}@c.us`;
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
    throw ApiError.internal(errorMsg);
  }
}

export async function getWhatsAppStatus(tenantId) {
  const settings = await WhatsAppSetting.findOne({ tenant: tenantId })
    .select('provider status')
    .lean();
  const key = getClientKey(tenantId);
  const client = clients.get(key);
  return {
    provider: settings?.provider,
    status: settings?.status,
    connected: settings?.provider === CLOUD_API ? settings.status === 'connected' : Boolean(client),
    ready: Boolean(client?.info?.wid?.user),
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