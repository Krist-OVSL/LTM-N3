const $ = (selector) => document.querySelector(selector);
const addressInput = $('#addressInput');
const dohToggle = $('#dohToggle');

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

function setModeUI(enabled) {
  dohToggle.checked = enabled;
  $('#modeStateText').textContent = enabled
    ? 'ĐANG BẬT · Cloudflare · không fallback'
    : 'ĐANG TẮT · resolver DNS của hệ điều hành';
  $('#transportPill').textContent = enabled ? 'DoH · HTTPS' : 'OS DNS';
  $('#transportPill').classList.toggle('plain-pill', !enabled);
  $('#resolverName').textContent = enabled ? 'cloudflare-dns.com' : 'DNS hệ điều hành';
  $('#resolverMode').textContent = enabled ? 'DoH-only · không fallback' : 'Resolver hệ điều hành';
  $('#lookupDescription').textContent = enabled
    ? 'Tự tra cứu tên miền của trang vừa mở qua DoH trong mini browser.'
    : 'Tự tra cứu tên miền của trang vừa mở qua DNS mặc định của hệ điều hành.';
  $('#modeExplanation').textContent = enabled
    ? 'Mini browser đang ép Chromium dùng DoH của Cloudflare và không fallback sang DNS thường. Đây là trạng thái do app tự cấu hình.'
    : 'Mini browser đang dùng DNS không mã hóa trong resolver Chromium, theo cấu hình DNS của hệ điều hành. VPN/WARP vẫn có thể đóng gói lưu lượng mạng.';
}

function renderLookup(result) {
  if (result.state === 'idle') {
    $('#resultDomain').textContent = 'Chưa mở website';
    const status = $('#resultStatus');
    status.className = 'status neutral';
    status.textContent = 'Sẵn sàng';
    const message = document.createElement('p');
    message.className = 'empty-state';
    message.textContent = 'Nhập địa chỉ website hoặc từ khóa vào thanh địa chỉ phía trên để bắt đầu.';
    $('#recordList').replaceChildren(message);
    $('#queryTime').textContent = '—';
    return;
  }
  $('#resultDomain').textContent = result.domain || 'Không có tên miền';
  const status = $('#resultStatus');
  const list = $('#recordList');
  list.replaceChildren();

  if (result.state === 'loading') {
    status.className = 'status neutral';
    status.textContent = 'Đang tra';
    const message = document.createElement('p');
    message.className = 'empty-state';
    message.textContent = 'Đang hỏi resolver của mini browser…';
    list.append(message);
    return;
  }

  if (result.state === 'unsupported' || result.state === 'error') {
    status.className = 'status error';
    status.textContent = result.state === 'error' ? 'Lỗi tra cứu' : 'Không hỗ trợ';
    const message = document.createElement('p');
    message.className = 'empty-state';
    message.textContent = result.error || 'Không thể tra cứu trang này.';
    list.append(message);
    $('#queryTime').textContent = '—';
    return;
  }

  const answers = result.records.flatMap((record) => record.addresses);
  status.className = `status ${answers.length ? 'success' : 'neutral'}`;
  status.textContent = answers.length ? 'Đã phân giải' : 'Không có IP';

  for (const record of result.records) {
    if (record.addresses.length) {
      for (const address of record.addresses) {
        const row = document.createElement('div');
        row.className = 'record';
        const type = document.createElement('span');
        type.textContent = record.type;
        const value = document.createElement('code');
        value.textContent = address;
        row.append(type, value);
        list.append(row);
      }
    } else {
      const row = document.createElement('div');
      row.className = 'record';
      const type = document.createElement('span');
      type.textContent = record.type;
      const value = document.createElement('code');
      value.textContent = 'Không có bản ghi';
      row.append(type, value);
      list.append(row);
    }
  }

  $('#queryTime').textContent = `${result.elapsedMs} ms (A + AAAA)`;
  $('#resolverMode').textContent = result.resolverMode;
}

function renderConnection(connection) {
  const status = $('#connectionStatus');
  const ip = $('#destinationIp');
  const transport = $('#destinationTransport');
  const httpStatus = $('#destinationHttpStatus');

  if (connection.state === 'loading') {
    status.className = 'status neutral';
    status.textContent = 'Đang kết nối';
    ip.textContent = 'Đang chờ phản hồi trang chính…';
    transport.textContent = '—';
    httpStatus.textContent = '—';
  } else if (connection.state === 'complete') {
    status.className = 'status success';
    status.textContent = 'Đã nhận phản hồi';
    ip.textContent = connection.ip || (connection.fromDiskCache || connection.fromServiceWorker
      ? 'Không có kết nối mạng mới (cache)'
      : 'Chromium không cung cấp IP cho phản hồi này');
    transport.textContent = [connection.port && `cổng ${connection.port}`, connection.protocol && connection.protocol.toUpperCase()]
      .filter(Boolean).join(' · ') || '—';
    httpStatus.textContent = connection.status ? String(connection.status) : '—';
  } else if (connection.state === 'error') {
    status.className = 'status error';
    status.textContent = 'Kết nối lỗi';
    ip.textContent = connection.error || 'Không nhận được phản hồi từ website.';
    transport.textContent = '—';
    httpStatus.textContent = '—';
  } else if (connection.state === 'unavailable') {
    status.className = 'status error';
    status.textContent = 'Không khả dụng';
    ip.textContent = 'Không lấy được IP đích từ Chromium.';
    transport.textContent = '—';
    httpStatus.textContent = '—';
  } else {
    status.className = 'status neutral';
    status.textContent = 'Chờ kết nối';
    ip.textContent = 'Mở website để xem IP đích.';
    transport.textContent = '—';
    httpStatus.textContent = '—';
  }
}

function setSidebarUI(visible) {
  const button = $('#sidebarToggle');
  document.body.classList.toggle('sidebar-visible', visible);
  $('#inspector').classList.toggle('sidebar-hidden', !visible);
  button.setAttribute('aria-expanded', String(visible));
  button.title = visible ? 'Ẩn bảng DNS' : 'Hiện bảng DNS';
  button.setAttribute('aria-label', button.title);
}

$('#addressForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = addressInput.value.trim();
  if (!address) return;
  $('#pageStatus').textContent = 'Đang mở địa chỉ…';
  try {
    const result = await window.miniBrowser.navigate(address);
    addressInput.value = result.url;
  } catch (error) {
    $('#pageStatus').textContent = error.message;
    showToast(error.message);
  }
});

$('#backButton').addEventListener('click', () => window.miniBrowser.back());
$('#forwardButton').addEventListener('click', () => window.miniBrowser.forward());
$('#reloadButton').addEventListener('click', () => window.miniBrowser.reload());
$('#refreshLookupButton').addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  window.miniBrowser.refreshInspection();
});
$('#sidebarToggle').addEventListener('click', () => window.miniBrowser.toggleSidebar());

dohToggle.addEventListener('change', async () => {
  dohToggle.disabled = true;
  try {
    const result = await window.miniBrowser.setDohMode(dohToggle.checked);
    setModeUI(result.enabled);
    showToast(result.enabled
      ? 'DoH-only đã bật cho mini browser. Đang tải lại trang.'
      : 'Đã chuyển mini browser sang DNS hệ điều hành. Đang tải lại trang.');
  } catch (error) {
    setModeUI(!dohToggle.checked);
    showToast(`Không đổi được chế độ DNS: ${error.message}`);
  } finally {
    dohToggle.disabled = false;
  }
});

window.miniBrowser.onState((state) => {
  if (state.url) addressInput.value = state.url.startsWith('http') ? state.url : '';
  $('#pageTitle').textContent = state.title || 'Trang web';
  $('#pageUrl').textContent = state.url?.startsWith('http') ? state.url : 'Trang khởi động';
  $('#backButton').disabled = !state.canGoBack;
  $('#forwardButton').disabled = !state.canGoForward;
  if (state.loading) $('#pageStatus').textContent = 'Đang tải trang…';
  else if (state.error) $('#pageStatus').textContent = `Không tải được: ${state.error}`;
  else if (state.url?.startsWith('http')) $('#pageStatus').textContent = 'Đã tải xong';
  else if (state.url) $('#pageStatus').textContent = 'Nhập địa chỉ ở thanh phía trên để bắt đầu.';
});

window.miniBrowser.onLookup(renderLookup);
window.miniBrowser.onConnection(renderConnection);
window.miniBrowser.onSidebar((sidebar) => setSidebarUI(sidebar.visible));
window.miniBrowser.onDohMode((mode) => setModeUI(mode.enabled));
window.miniBrowser.getInspection().then((result) => result && renderLookup(result));
window.miniBrowser.getConnection().then(renderConnection);
window.miniBrowser.getSidebar().then((sidebar) => setSidebarUI(sidebar.visible));
window.miniBrowser.getDohMode().then((mode) => setModeUI(mode.enabled));
