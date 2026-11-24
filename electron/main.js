const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const { randomInt } = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const path = require('node:path');

const INSPECTOR_WIDTH = 420;
const TOOLBAR_HEIGHT = 112;
const DOH_SERVERS = ['https://cloudflare-dns.com/dns-query'];
const COMPARISON_DOH_RESOLVERS = {
  cloudflare: { name: 'Cloudflare DoH', endpoint: 'https://cloudflare-dns.com/dns-query' },
  google: { name: 'Google DNS DoH', endpoint: 'https://dns.google/dns-query' },
  quad9: { name: 'Quad9 DoH', endpoint: 'https://dns.quad9.net/dns-query' },
};
let mainWindow;
let browserView;
let dohEnabled = true;
let sidebarVisible = true;
let lookupSequence = 0;
let latestLookup = null;
let latestConnection = { state: 'idle' };
let latestTrace = { url: '', steps: [] };
let traceInspectionStarted = false;
let mainFrameId = null;
let networkMonitorPromise = null;

function browserBounds() {
  const [width, height] = mainWindow.getContentSize();
  return {
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: Math.max(320, width - (sidebarVisible ? INSPECTOR_WIDTH : 0)),
    height: Math.max(200, height - TOOLBAR_HEIGHT),
  };
}

function resizeBrowserView() {
  if (mainWindow && browserView) browserView.setBounds(browserBounds());
}

function normalizeAddress(input) {
  const value = String(input || '').trim();
  if (!value) throw new Error('Nhập địa chỉ website hoặc từ khóa tìm kiếm.');

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  if (/\s/.test(value)) return searchUrl;

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value);
  let url;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return searchUrl;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Mini browser chỉ mở địa chỉ HTTP hoặc HTTPS.');
  }
  if (hasScheme) return url.toString();

  const hostname = url.hostname.replace(/\.$/, '');
  const labels = hostname.split('.');
  const hasDomainSuffix = net.isIP(hostname) !== 0
    || (labels.length > 1
      && labels.every(Boolean)
      && /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(labels[labels.length - 1]));
  return hasDomainSuffix ? url.toString() : searchUrl;
}

function applyDohMode(enabled) {
  dohEnabled = Boolean(enabled);
  app.configureHostResolver({
    enableBuiltInResolver: true,
    secureDnsMode: dohEnabled ? 'secure' : 'off',
    secureDnsServers: DOH_SERVERS,
  });
}

function sendLookupState(lookup = latestLookup) {
  if (!mainWindow || mainWindow.isDestroyed() || !lookup) return;
  mainWindow.webContents.send('browser:lookup', lookup);
}

function sendConnectionState(connection = latestConnection) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('browser:connection', connection);
}

function sendSidebarState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('browser:sidebar', { visible: sidebarVisible });
}

function sendTrace() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('browser:trace', latestTrace);
}

function addTraceStep(title, detail, state = 'complete') {
  latestTrace.steps.push({ title, detail, state, time: new Date().toLocaleTimeString() });
  if (latestTrace.steps.length > 100) latestTrace.steps.shift();
  sendTrace();
}

function startTrace(url) {
  latestTrace = { url, steps: [] };
  traceInspectionStarted = false;
  addTraceStep('Bắt đầu truy cập', url, 'loading');
}

function createDnsQuery(domain, type) {
  const hostname = new URL(`http://${domain}`).hostname;
  const id = randomInt(0x10000);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);

  const labels = hostname.split('.').map((label) => {
    const bytes = Buffer.from(label, 'ascii');
    if (!bytes.length || bytes.length > 63) throw new Error('Tên miền không hợp lệ.');
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  });
  const question = Buffer.concat([
    ...labels,
    Buffer.from([0, type === 'A' ? 1 : 28, 0, 1]),
  ]);
  return { id, packet: Buffer.concat([header, question]) };
}

function skipDnsName(packet, offset) {
  while (offset < packet.length) {
    const length = packet[offset];
    if (length === 0) return offset + 1;
    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= packet.length) throw new Error('Phản hồi DNS không hợp lệ.');
      return offset + 2;
    }
    if ((length & 0xc0) !== 0 || offset + 1 + length > packet.length) {
      throw new Error('Phản hồi DNS không hợp lệ.');
    }
    offset += length + 1;
  }
  throw new Error('Phản hồi DNS không hợp lệ.');
}

function parseDnsResponse(packet, id, type) {
  if (packet.length < 12 || packet.readUInt16BE(0) !== id) {
    throw new Error('Phản hồi DNS không hợp lệ.');
  }
  const flags = packet.readUInt16BE(2);
  if (!(flags & 0x8000) || flags & 0x0200) throw new Error('Phản hồi DNS không hợp lệ.');
  const responseCode = flags & 0x000f;
  if (responseCode === 3) return [];
  if (responseCode !== 0) throw new Error(`DNS status ${responseCode}`);

  const questionCount = packet.readUInt16BE(4);
  const answerCount = packet.readUInt16BE(6);
  let offset = 12;
  for (let index = 0; index < questionCount; index += 1) {
    offset = skipDnsName(packet, offset) + 4;
    if (offset > packet.length) throw new Error('Phản hồi DNS không hợp lệ.');
  }

  const expectedType = type === 'A' ? 1 : 28;
  const addresses = [];
  for (let index = 0; index < answerCount; index += 1) {
    offset = skipDnsName(packet, offset);
    if (offset + 10 > packet.length) throw new Error('Phản hồi DNS không hợp lệ.');
    const recordType = packet.readUInt16BE(offset);
    const recordClass = packet.readUInt16BE(offset + 2);
    const dataLength = packet.readUInt16BE(offset + 8);
    const dataOffset = offset + 10;
    if (dataOffset + dataLength > packet.length) throw new Error('Phản hồi DNS không hợp lệ.');

    if (recordClass === 1 && recordType === expectedType
        && dataLength === (type === 'A' ? 4 : 16)) {
      const data = packet.subarray(dataOffset, dataOffset + dataLength);
      addresses.push(type === 'A'
        ? Array.from(data).join('.')
        : Array.from({ length: 8 }, (_, group) => data.readUInt16BE(group * 2).toString(16)).join(':'));
    }
    offset = dataOffset + dataLength;
  }
  return addresses;
}

async function resolveWithDoH(domain, type, resolver) {
  const { id, packet } = createDnsQuery(domain, type);
  const response = await fetch(resolver.endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/dns-message',
      'content-type': 'application/dns-message',
    },
    body: packet,
  });
  if (!response.ok) throw new Error(`${resolver.name} trả về HTTP ${response.status}`);
  return parseDnsResponse(Buffer.from(await response.arrayBuffer()), id, type);
}

async function resolveWithSystem(domain, type) {
  try {
    return type === 'A' ? await dns.resolve4(domain) : await dns.resolve6(domain);
  } catch (error) {
    if (error.code === 'ENODATA' || error.code === 'ENOTFOUND' || error.code === 'ESERVFAIL') return [];
    throw error;
  }
}

async function compareResolver(domain, resolver, resolve) {
  const startedAt = performance.now();
  const records = await Promise.all(['A', 'AAAA'].map(async (type) => {
    try {
      return { type, addresses: await resolve(domain, type), error: '' };
    } catch (error) {
      return { type, addresses: [], error: error.message };
    }
  }));
  return {
    resolver,
    elapsedMs: Math.round(performance.now() - startedAt),
    records,
  };
}

async function attachNetworkMonitor() {
  const debuggerApi = browserView.webContents.debugger;
  debuggerApi.on('message', (_event, method, params) => {
    if (method === 'Page.frameNavigated' && !params.frame.parentId) {
      mainFrameId = params.frame.id;
    }
    if (method !== 'Network.responseReceived' || params.type !== 'Document') return;
    if (mainFrameId && params.frameId !== mainFrameId) return;

    const response = params.response;
    latestConnection = {
      state: 'complete',
      url: response.url,
      ip: response.remoteIPAddress || '',
      port: response.remotePort || null,
      protocol: response.protocol || '',
      status: response.status,
      fromDiskCache: response.fromDiskCache || false,
      fromServiceWorker: response.fromServiceWorker || false,
    };
    sendConnectionState();
    addTraceStep(
      'Nhận phản hồi trang chính',
      `HTTP ${response.status}${response.remoteIPAddress ? ` · IP ${response.remoteIPAddress}` : ''} · ${response.protocol || 'giao thức chưa rõ'}`,
    );
  });

  try {
    debuggerApi.attach('1.3');
    await debuggerApi.sendCommand('Page.enable');
    await debuggerApi.sendCommand('Network.enable');
    await debuggerApi.sendCommand('Network.setCacheDisabled', { cacheDisabled: true });
    await debuggerApi.sendCommand('Network.setBypassServiceWorker', { bypass: true });
    const tree = await debuggerApi.sendCommand('Page.getFrameTree');
    mainFrameId = tree.frameTree.frame.id;
  } catch (error) {
    latestConnection = { state: 'unavailable', error: error.message };
    sendConnectionState();
  }
}

function ensureNetworkMonitor() {
  if (!networkMonitorPromise) networkMonitorPromise = attachNetworkMonitor();
  return networkMonitorPromise;
}

function sendDohMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('browser:doh-mode', {
    enabled: dohEnabled,
    mode: dohEnabled ? 'secure' : 'off',
    resolver: dohEnabled ? 'Cloudflare DoH' : 'Resolver mặc định hệ điều hành',
  });
}

async function inspectCurrentPage(url) {
  const sequence = ++lookupSequence;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    latestLookup = { url, state: 'unsupported', error: 'Trang này không có tên miền để tra cứu.' };
    sendLookupState();
    return;
  }
  if (parsed.protocol === 'file:') {
    latestLookup = { url, state: 'idle', dohEnabled };
    latestConnection = { state: 'idle' };
    sendLookupState();
    sendConnectionState();
    return;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    latestLookup = { url, state: 'unsupported', error: 'Chỉ tra cứu tên miền của trang HTTP/HTTPS.' };
    sendLookupState();
    return;
  }

  const domain = parsed.hostname;
  if (latestTrace.url === url) {
    addTraceStep('Bắt đầu tra cứu DNS', `${domain} · bản ghi A và AAAA qua ${dohEnabled ? 'Cloudflare DoH' : 'DNS hệ điều hành'}`, 'loading');
  }
  latestLookup = { url, domain, state: 'loading', dohEnabled };
  sendLookupState();

  try {
    const startedAt = performance.now();
    const resolverSession = browserView.webContents.session;
    const options = { source: 'dns', cacheUsage: 'disallowed', secureDnsPolicy: 'allow' };
    const [a, aaaa] = await Promise.all([
      resolverSession.resolveHost(domain, { ...options, queryType: 'A' }),
      resolverSession.resolveHost(domain, { ...options, queryType: 'AAAA' }),
    ]);
    if (sequence !== lookupSequence) return;

    const addresses = (result) => (result.endpoints || []).map((endpoint) => endpoint.address).filter(Boolean);
    latestLookup = {
      url,
      domain,
      state: 'complete',
      dohEnabled,
      resolver: dohEnabled ? 'Cloudflare DoH' : 'DNS mặc định của hệ điều hành',
      resolverMode: dohEnabled ? 'Secure DNS · không fallback plaintext' : 'DNS mặc định',
      elapsedMs: Math.round(performance.now() - startedAt),
      records: [
        { type: 'A', addresses: addresses(a) },
        { type: 'AAAA', addresses: addresses(aaaa) },
      ],
    };
    if (latestTrace.url === url) {
      const count = latestLookup.records.reduce((total, record) => total + record.addresses.length, 0);
      addTraceStep('Hoàn tất tra cứu DNS', `${count} địa chỉ · ${latestLookup.elapsedMs} ms`);
    }
  } catch (error) {
    if (sequence !== lookupSequence) return;
    latestLookup = { url, domain, state: 'error', dohEnabled, error: error.message };
    if (latestTrace.url === url) addTraceStep('Tra cứu DNS thất bại', error.message, 'error');
  }
  sendLookupState();
}

function sendPageState(details = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const contents = browserView.webContents;
  mainWindow.webContents.send('browser:state', {
    url: contents.getURL(),
    title: contents.getTitle(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    ...details,
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 620,
    title: 'DoH Mini Browser',
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  browserView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:doh-mini-browser',
    },
  });
  mainWindow.contentView.addChildView(browserView);
  resizeBrowserView();
  mainWindow.on('resize', resizeBrowserView);
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    sendPageState();
    sendDohMode();
    sendSidebarState();
    sendConnectionState();
    const currentUrl = browserView.webContents.getURL();
    if (currentUrl) inspectCurrentPage(currentUrl);
    else {
      latestLookup = { state: 'idle' };
      sendLookupState();
    }
  });

  browserView.webContents.on('did-navigate', () => sendPageState());
  browserView.webContents.on('did-navigate-in-page', () => sendPageState());
  browserView.webContents.on('page-title-updated', () => sendPageState());
  browserView.webContents.on('did-start-loading', () => {
    const currentUrl = browserView.webContents.getURL();
    if (currentUrl.startsWith('http') && latestTrace.url !== currentUrl) startTrace(currentUrl);
    latestConnection = { state: 'loading', url: browserView.webContents.getURL() };
    if (latestTrace.url) addTraceStep('Đang tải trang', currentUrl.startsWith('http') ? currentUrl : latestTrace.url, 'loading');
    sendConnectionState();
    sendPageState({ loading: true });
  });
  browserView.webContents.on('did-stop-loading', () => sendPageState({ loading: false }));
  browserView.webContents.on('will-navigate', (event, url) => {
    try {
      if (!['http:', 'https:'].includes(new URL(url).protocol)) event.preventDefault();
      else {
        if (latestTrace.url !== url) startTrace(url);
        if (!traceInspectionStarted) {
          traceInspectionStarted = true;
          inspectCurrentPage(url);
        }
      }
    } catch {
      event.preventDefault();
    }
  });
  browserView.webContents.on('did-fail-load', (_event, errorCode, description, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      addTraceStep('Không tải được trang', `${description} (${errorCode})`, 'error');
      latestConnection = { state: 'error', url: validatedURL, error: `${description} (${errorCode})` };
      sendConnectionState();
      sendPageState({ error: `${description} (${errorCode})`, failedURL: validatedURL });
    }
  });

  browserView.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const safeUrl = normalizeAddress(url);
      ensureNetworkMonitor().then(() => browserView.webContents.loadURL(safeUrl));
    } catch {
      // Ignore unsupported schemes and malformed popup destinations.
    }
    return { action: 'deny' };
  });

  browserView.webContents.loadFile(path.join(__dirname, '..', 'src', 'start.html'));
}

ipcMain.handle('browser:navigate', async (_event, input) => {
  const url = normalizeAddress(input);
  startTrace(url);
  await ensureNetworkMonitor();
  await browserView.webContents.loadURL(url);
  return { url };
});
ipcMain.handle('browser:back', () => {
  if (browserView.webContents.navigationHistory.canGoBack()) browserView.webContents.navigationHistory.goBack();
});
ipcMain.handle('browser:forward', () => {
  if (browserView.webContents.navigationHistory.canGoForward()) browserView.webContents.navigationHistory.goForward();
});
ipcMain.handle('browser:reload', () => {
  const url = browserView.webContents.getURL();
  if (url) {
    startTrace(url);
    traceInspectionStarted = true;
    inspectCurrentPage(url);
  }
  return browserView.webContents.reload();
});
ipcMain.handle('browser:get-inspection', () => latestLookup);
ipcMain.handle('browser:get-trace', () => latestTrace);
ipcMain.handle('browser:compare-dns', async (_event, { domain: input, resolver: resolverId } = {}) => {
  const value = String(input || '').trim();
  let parsed;
  try {
    parsed = new URL(`https://${value}`);
  } catch {
    throw new Error('Nhập tên miền hợp lệ, ví dụ example.com.');
  }
  if (!value || !parsed.hostname || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Chỉ nhập tên miền, không nhập đường dẫn website.');
  }
  const domain = parsed.hostname;
  const dohResolver = Object.prototype.hasOwnProperty.call(COMPARISON_DOH_RESOLVERS, resolverId)
    ? COMPARISON_DOH_RESOLVERS[resolverId]
    : null;
  if (!dohResolver) throw new Error('Chọn một nhà cung cấp DoH hợp lệ.');
  const [doh, system] = await Promise.all([
    compareResolver(domain, dohResolver.name, (name, type) => resolveWithDoH(name, type, dohResolver)),
    compareResolver(domain, 'DNS hệ điều hành', resolveWithSystem),
  ]);
  return { domain, doh, system };
});
ipcMain.handle('browser:get-connection', () => latestConnection);
ipcMain.handle('browser:get-sidebar', () => ({ visible: sidebarVisible }));
ipcMain.handle('browser:toggle-sidebar', () => {
  sidebarVisible = !sidebarVisible;
  resizeBrowserView();
  sendSidebarState();
  return { visible: sidebarVisible };
});
ipcMain.handle('browser:get-doh-mode', () => ({ enabled: dohEnabled, mode: dohEnabled ? 'secure' : 'off' }));
ipcMain.handle('browser:refresh-inspection', () => inspectCurrentPage(browserView.webContents.getURL()));
ipcMain.handle('browser:clear-cache', async () => {
  const session = browserView.webContents.session;
  await Promise.all([session.clearHostResolverCache(), session.clearCache()]);
  return { ok: true };
});
ipcMain.handle('browser:set-doh-mode', async (_event, enabled) => {
  applyDohMode(enabled);
  await browserView.webContents.session.clearHostResolverCache();
  sendDohMode();
  if (browserView.webContents.getURL()) await browserView.webContents.reload();
  return { enabled: dohEnabled, mode: dohEnabled ? 'secure' : 'off' };
});

app.whenReady().then(() => {
  applyDohMode(true);
  createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
