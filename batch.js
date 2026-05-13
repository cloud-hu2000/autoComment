// 批量外链评论自动化 - 扩展端核心逻辑（本地批次管理）

// ==================== 配置 ====================
const API_BASE = 'https://jieyunsang.cn/api';
const CONCURRENT_TABS_STORAGE_KEY = 'batch_concurrent_tabs';
const DEFAULT_CONCURRENT_TABS = 3;
const POLL_INTERVAL = 3000;
const TIMEOUT_CHECK_INTERVAL = 5000;
const TIMEOUT_STORAGE_KEY = 'batch_timeout_seconds';

// ==================== 状态 ====================
let batchId = null;
let userId = null;
let parsedUrls = [];                // [{originalIndex, url}]
let status = 'idle';                // idle | running | paused | completed
let activeTabCount = 0;
let maxConcurrentTabs = DEFAULT_CONCURRENT_TABS;
let currentIndex = 0;               // 当前处理到的索引（本地管理）
let initialPoints = 0;

// 实时计数
let totalCount = 0;
let successCount = 0;
let failCount = 0;
let pendingCount = 0;

// 本地结果存储
let localResults = [];              // [{originalIndex, url, result, aiContent, errorMessage, timestamp}]

// 轮询定时器
let pollTimer = null;

// 活跃标签页记录 { tabId -> { urlIndex, startTime } }
let activeTabs = new Map();
let activeTabsByIndex = new Map();  // urlIndex -> { urlIndex, startTime }

// 定时器
let timeoutCheckTimer = null;
let timeoutSeconds = 60;

// 标签打开锁（防止并发）
let isOpeningTab = false;

// ==================== DOM 引用 ====================
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileCount = document.getElementById('fileCount');
const fileRemove = document.getElementById('fileRemove');
const urlPreview = document.getElementById('urlPreview');
const urlPreviewBody = document.getElementById('urlPreviewBody');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const successCountEl = document.getElementById('successCount');
const failCountEl = document.getElementById('failCount');
const pendingCountEl = document.getElementById('pendingCount');
const progressText = document.getElementById('progressText');
const logSection = document.getElementById('logSection');
const logList = document.getElementById('logList');
const footerActions = document.getElementById('footerActions');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const pointsBalance = document.getElementById('pointsBalance');
const pointsHint = document.getElementById('pointsHint');
const costHint = document.getElementById('costHint');
const statusBadge = document.getElementById('statusBadge');
const timeoutInput = document.getElementById('timeoutInput');
const concurrentInput = document.getElementById('concurrentInput');
const statsPanel = document.getElementById('statsPanel');
const statsTotal = document.getElementById('statsTotal');
const statsSuccess = document.getElementById('statsSuccess');
const statsFail = document.getElementById('statsFail');
const statsRate = document.getElementById('statsRate');
const filterResult = document.getElementById('filterResult');
const filterDomain = document.getElementById('filterDomain');
const filterTimeRange = document.getElementById('filterTimeRange');
const filterKeyword = document.getElementById('filterKeyword');
const statsTableBody = document.getElementById('statsTableBody');
const statsTableWrap = document.getElementById('statsTableWrap');
const statsCountLabel = document.getElementById('statsCountLabel');

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadUserId();
  await loadPoints();
  await loadTimeoutSetting();
  await loadConcurrentSetting();
  bindEvents();
  updateUI();
}

async function loadUserId() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['auto_comment_user_id'], (data) => {
      userId = data.auto_comment_user_id || '';
      resolve();
    });
  });
}

async function loadPoints() {
  if (!userId) {
    pointsBalance.textContent = '—';
    return;
  }
  try {
    const resp = await fetch(`${API_BASE}/get-points?userId=${encodeURIComponent(userId)}`);
    const json = await resp.json();
    if (json.success && json.points !== undefined) {
      pointsBalance.textContent = json.points;
    } else {
      pointsBalance.textContent = '0';
    }
  } catch (e) {
    pointsBalance.textContent = '—';
  }
}

async function loadTimeoutSetting() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([TIMEOUT_STORAGE_KEY], (data) => {
      const saved = parseInt(data[TIMEOUT_STORAGE_KEY], 10);
      timeoutSeconds = (saved && saved >= 10 && saved <= 600) ? saved : 60;
      timeoutInput.value = String(timeoutSeconds);
      resolve();
    });
  });
}

async function loadConcurrentSetting() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([CONCURRENT_TABS_STORAGE_KEY], (data) => {
      const saved = parseInt(data[CONCURRENT_TABS_STORAGE_KEY], 10);
      maxConcurrentTabs = (saved && saved >= 1 && saved <= 10) ? saved : DEFAULT_CONCURRENT_TABS;
      concurrentInput.value = String(maxConcurrentTabs);
      resolve();
    });
  });
}

function saveTimeoutSetting() {
  const val = parseInt(timeoutInput.value, 10);
  if (val >= 10 && val <= 600) {
    timeoutSeconds = val;
    chrome.storage.sync.set({ [TIMEOUT_STORAGE_KEY]: val });
  } else {
    timeoutInput.value = String(timeoutSeconds);
  }
}

function saveConcurrentSetting() {
  const val = parseInt(concurrentInput.value, 10);
  if (val >= 1 && val <= 10) {
    maxConcurrentTabs = val;
    chrome.storage.sync.set({ [CONCURRENT_TABS_STORAGE_KEY]: val });
  } else {
    concurrentInput.value = String(maxConcurrentTabs);
  }
}

// ==================== 事件绑定 ====================
function bindEvents() {
  // 上传区域
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', handleFileDrop);
  fileInput.addEventListener('change', handleFileSelect);

  // 文件信息
  fileRemove.addEventListener('click', resetFile);

  // 操作按钮
  startBtn.addEventListener('click', startBatch);
  pauseBtn.addEventListener('click', togglePause);
  stopBtn.addEventListener('click', stopBatch);
  exportBtn.addEventListener('click', exportResults);
  clearBtn.addEventListener('click', clearBatch);

  // 设置
  timeoutInput.addEventListener('change', saveTimeoutSetting);
  concurrentInput.addEventListener('change', saveConcurrentSetting);

  // 监听 background 消息（结果回调）
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'BATCH_RESULT') {
      handleTabResult(message.urlIndex, message.result, message.aiContent, message.errorMessage);
    }
  });

  // 统计筛选器
  filterResult.addEventListener('change', renderStats);
  filterDomain.addEventListener('change', renderStats);
  filterTimeRange.addEventListener('change', renderStats);
  filterKeyword.addEventListener('input', debounce(renderStats, 300));
}

// ==================== CSV 解析 ====================
function handleFileDrop(e) {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  if (!file.name.endsWith('.csv')) {
    alert('请上传 CSV 文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    parseCSV(e.target.result, file.name);
  };
  reader.onerror = () => {
    alert('文件读取失败');
  };
  reader.readAsText(file);
}

function parseCSV(text, fileNameParam) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    alert('CSV 文件内容为空或格式错误');
    return;
  }

  // 去除 UTF-8 BOM（常见于从 Windows Excel 保存的文件）
  const headerRaw = lines[0].replace(/^\ufeff/, '');
  const header = parseCSVLine(headerRaw);
  const colUrl = header.findIndex((h) => h === '原URL' || h === 'URL' || h === 'url' || h === 'Url');
  const colDomain = header.findIndex((h) => h === 'URL对应域名' || h === '来源域名' || h === 'sourceDomain');

  if (colUrl === -1) {
    alert('CSV 文件缺少"原URL"列，请确认文件格式正确。\n\n标准格式应为：\n页面AS, 原URL, URL对应域名, 目标域名, 类型, 外部链接数量, 自动评论运行结果');
    resetFile();
    return;
  }

  let validCount = 0;
  let invalidCount = 0;
  parsedUrls = [];
  urlPreviewBody.innerHTML = '';

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i].replace(/^\ufeff/, ''));
    let url = (row[colUrl] || '').trim();
    let sourceDomain = colDomain >= 0 ? (row[colDomain] || '').trim() : '';

    if (!url) {
      invalidCount++;
      continue;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    if (!isValidUrl(url)) {
      invalidCount++;
      continue;
    }

    parsedUrls.push({
      originalIndex: parsedUrls.length,
      url,
      sourceDomain
    });
    validCount++;

    const tr = document.createElement('tr');
    tr.dataset.url = url;
    tr.innerHTML = `<td>${parsedUrls.length}</td><td>${escapeHtml(sourceDomain || url)}</td><td>${escapeHtml(url)}</td>`;
    urlPreviewBody.appendChild(tr);
  }

  // 检测重复
  const seenUrls = new Set();
  let duplicateCount = 0;
  urlPreviewBody.querySelectorAll('tr').forEach((tr) => {
    const url = tr.dataset.url;
    if (seenUrls.has(url)) {
      tr.classList.add('duplicate');
      duplicateCount++;
    }
    seenUrls.add(url);
  });

  urlPreview.classList.add('visible');
  fileName.textContent = fileNameParam || '已上传文件';
  fileInfo.classList.add('visible');
  uploadZone.classList.add('has-file');
  fileCount.textContent = `共 ${validCount} 条 URL`;
  if (invalidCount > 0) fileCount.textContent += `（跳过 ${invalidCount} 条无效）`;
  if (duplicateCount > 0) {
    fileCount.textContent += `（发现 ${duplicateCount} 条重复）`;
    document.getElementById('duplicateCount').textContent = `⚠️ ${duplicateCount} 条重复`;
  }
  updateCostHint(validCount);
  startBtn.disabled = validCount === 0;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function resetFile() {
  fileInput.value = '';
  fileInfo.classList.remove('visible');
  uploadZone.classList.remove('has-file');
  urlPreview.classList.remove('visible');
  urlPreviewBody.innerHTML = '';
  parsedUrls = [];
  startBtn.disabled = true;
  fileCount.textContent = '';
  document.getElementById('duplicateCount').textContent = '';
  updateCostHint(0);
}

function updateCostHint(count) {
  if (count === 0) {
    costHint.textContent = '';
  } else {
    costHint.textContent = `本次预计消耗 ${count} 条积分`;
  }
}

// ==================== 批量处理核心 ====================
async function startBatch() {
  if (!userId) {
    alert('请先在设置页面中配置用户 ID');
    return;
  }
  if (parsedUrls.length === 0) {
    alert('请先上传有效的 CSV 文件');
    return;
  }

  initialPoints = parseInt(pointsBalance.textContent || '0', 10);
  batchId = generateUUID();
  totalCount = parsedUrls.length;
  successCount = 0;
  failCount = 0;
  pendingCount = totalCount;
  currentIndex = 0;
  localResults = [];
  status = 'running';

  setStatus('running');
  updateUI();
  updateStatsUI();

  // 串行打开初始标签页
  await openNextTabConcurrently(maxConcurrentTabs);
}

// 串行打开 N 个标签页（确保每个 URL 只处理一次）
async function openNextTabConcurrently(count) {
  for (let i = 0; i < count; i++) {
    if (status !== 'running') break;
    await openNextTabSync();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function togglePause() {
  if (status === 'running') {
    setStatus('paused');
    if (pollTimer) clearTimeout(pollTimer);
    stopTimeoutChecker();
  } else if (status === 'paused') {
    setStatus('running');
    // 继续处理
    while (activeTabCount < maxConcurrentTabs && currentIndex < totalCount) {
      openNextTabSync();
    }
  }
}

async function stopBatch() {
  setStatus('idle');
  if (pollTimer) clearTimeout(pollTimer);
  stopTimeoutChecker();

  const tabIds = Array.from(activeTabs.keys());
  activeTabs.clear();
  for (const tabId of tabIds) {
    try {
      await new Promise((resolve) => {
        chrome.tabs.remove(tabId, () => resolve());
      });
    } catch (_) {}
  }
  activeTabCount = 0;
  updateStatsUI();
  updateUI();
}

// 立即打开下一个标签页（从本地队列获取）
async function openNextTabSync() {
  if (isOpeningTab) return;
  isOpeningTab = true;
  await openNextTab();
  isOpeningTab = false;
}

async function openNextTab() {
  if (status !== 'running') return;
  if (activeTabCount >= maxConcurrentTabs) return;
  if (currentIndex >= totalCount) return;

  const urlIndex = currentIndex;
  const { url } = parsedUrls[urlIndex];
  currentIndex++;

  try {
    chrome.tabs.create({ url, active: false }, (tab) => {
      activeTabCount++;
      activeTabs.set(tab.id, { urlIndex, startTime: Date.now() });
      activeTabsByIndex.set(urlIndex, { urlIndex, startTime: Date.now() });

      // 高亮预览表格中对应的行
      highlightPreviewRow(urlIndex, 'processing');

      startTimeoutChecker();
      updateStatsUI();

      // 监听标签页关闭
      const listener = (tabId, removeInfo) => {
        if (tabId === tab.id) {
          // 取 startTime（必须在删除前获取）
          const startTime = activeTabs.get(tab.id)?.startTime;
          activeTabs.delete(tab.id);
          activeTabsByIndex.delete(urlIndex);
          activeTabCount = Math.max(0, activeTabCount - 1);
          chrome.tabs.onRemoved.removeListener(listener);

          // 检查是否已有结果（content.js 主动上报或超时处理过了），没有则记为手动关闭失败
          if (!localResults.some((r) => r.originalIndex === urlIndex)) {
            const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : null;
            handleTabResult(urlIndex, 'fail', null, '用户手动关闭', elapsed);
          } else {
            clearPreviewRow(urlIndex);
          }

          updateStatsUI();

          // 标签关闭后补充新标签
          if (status === 'running' && currentIndex < totalCount) {
            openNextTabSync();
          } else if (status === 'running' && activeTabCount === 0) {
            onAllCompleted();
          }
        }
      };
      chrome.tabs.onRemoved.addListener(listener);

      // 向标签页发送任务信息
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'BATCH_HANDLE',
          batchId,
          urlIndex,
          url
        }).then((response) => {
          if (response && response.ok) {
            handleTabResult(urlIndex, 'success', response.aiContent, null);
            chrome.tabs.remove(tab.id, () => {});
          }
        }).catch(() => {});
      }, 1000);
    });
  } catch (e) {
    console.error('[batch] openNextTab 错误:', e);
    // 出错时继续下一个
    if (currentIndex < totalCount) {
      setTimeout(openNextTabSync, 1000);
    }
  }
}

// 处理标签页结果
// elapsed 可选，外部已知的耗时直接传入（如手动关闭时），否则从 activeTabsByIndex 计算
function handleTabResult(urlIndex, result, aiContent, errorMessage, forcedElapsed) {
  const item = parsedUrls[urlIndex];
  if (!item) return;

  // 避免重复处理
  if (localResults.some((r) => r.originalIndex === urlIndex)) return;

  let elapsed = forcedElapsed !== undefined ? forcedElapsed : null;
  if (elapsed === null) {
    const tabInfo = activeTabsByIndex.get(urlIndex);
    elapsed = tabInfo ? Math.round((Date.now() - tabInfo.startTime) / 1000) : null;
  }

  const resultEntry = {
    originalIndex: urlIndex,
    url: item.url,
    sourceDomain: item.sourceDomain || '',
    result: result,
    aiContent: aiContent || null,
    errorMessage: errorMessage || null,
    timestamp: Date.now(),
    elapsed
  };

  localResults.push(resultEntry);

  if (result === 'success') {
    successCount++;
    highlightPreviewRow(urlIndex, 'success');
    addLog(item.url, 'success', aiContent || '评论成功');
  } else {
    failCount++;
    highlightPreviewRow(urlIndex, 'fail');
    addLog(item.url, 'fail', errorMessage || '处理失败');
  }

  pendingCount = totalCount - successCount - failCount;
  updateStatsUI();
  renderStats();

  // 保存到本地存储
  saveLocalResults();

  // 检查是否全部完成
  if (successCount + failCount >= totalCount) {
    onAllCompleted();
  }
}

// 保存结果到本地存储
function saveLocalResults() {
  chrome.storage.local.set({
    batchLocalResults: {
      batchId,
      totalCount,
      results: localResults.slice(-100) // 只保留最近100条
    }
  });
}

// 全部完成
async function onAllCompleted() {
  setStatus('completed');
  stopTimeoutChecker();

  // 通过积分差值计算成功/失败数（备用验证）
  let finalPoints = initialPoints;
  try {
    const resp = await fetch(`${API_BASE}/get-points?userId=${encodeURIComponent(userId)}`);
    const json = await resp.json();
    if (json.success && json.points !== undefined) {
      finalPoints = json.points;
    }
  } catch (_) {}

  const pointsDiff = initialPoints - finalPoints;
  if (pointsDiff > 0 && Math.abs(pointsDiff - successCount) > 2) {
    console.warn(`积分差值(${pointsDiff})与成功数(${successCount})不一致，请以实际结果为准`);
  }

  updateStatsUI();
}

// 超时检测
function startTimeoutChecker() {
  if (timeoutCheckTimer) return;
  timeoutCheckTimer = setInterval(() => {
    if (status !== 'running') {
      stopTimeoutChecker();
      return;
    }
    checkTimeouts();
  }, TIMEOUT_CHECK_INTERVAL);
}

function stopTimeoutChecker() {
  if (timeoutCheckTimer) {
    clearInterval(timeoutCheckTimer);
    timeoutCheckTimer = null;
  }
}

async function checkTimeouts() {
  if (activeTabs.size === 0) {
    stopTimeoutChecker();
    return;
  }
  const now = Date.now();
  const toRemove = [];
  for (const [tabId, info] of activeTabs) {
    const elapsed = (now - info.startTime) / 1000;
    if (elapsed > timeoutSeconds) {
      toRemove.push({ tabId, urlIndex: info.urlIndex });
    }
  }
  for (const { tabId, urlIndex } of toRemove) {
    activeTabs.delete(tabId);
    activeTabsByIndex.delete(urlIndex);
    handleTabResult(urlIndex, 'fail', null, '处理超时');
    try {
      await new Promise((resolve) => {
        chrome.tabs.remove(tabId, () => resolve());
      });
    } catch (_) {}
  }
}

// ==================== UI 更新 ====================
function setStatus(s) {
  status = s;
  statusBadge.textContent = {
    idle: '空闲',
    running: '运行中',
    paused: '已暂停',
    completed: '已完成'
  }[s] || s;
  statusBadge.className = 'status-badge ' + s;
}

function updateUI() {
  const isIdle = status === 'idle';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';

  startBtn.disabled = isRunning || isPaused || parsedUrls.length === 0;
  pauseBtn.disabled = !isRunning && !isPaused;
  pauseBtn.textContent = isPaused ? '继续' : '暂停';
  stopBtn.disabled = isIdle;
  exportBtn.disabled = isIdle || localResults.length === 0;
  clearBtn.disabled = isRunning || isPaused;

  progressSection.style.display = isIdle ? 'none' : 'block';
  logSection.style.display = isIdle ? 'none' : 'flex';
  footerActions.style.display = isIdle ? 'none' : 'flex';

  if (isIdle) {
    statsPanel.classList.remove('visible');
    statsTableBody.innerHTML = '';
  }
}

function updateStatsUI() {
  const processed = successCount + failCount;
  const percent = totalCount > 0 ? Math.round((processed / totalCount) * 100) : 0;
  progressBar.style.width = percent + '%';
  progressText.textContent = `${processed}/${totalCount} (${percent}%)`;
  successCountEl.textContent = successCount;
  failCountEl.textContent = failCount;
  pendingCountEl.textContent = pendingCount;
}

function addLog(url, result, message) {
  const item = document.createElement('div');
  item.className = 'log-item ' + result;

  const time = formatTime(new Date());
  const shortUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;

  item.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-result ${result}">${result === 'success' ? '✓' : '✗'}</span>
    <span class="log-url" title="${escapeHtml(url)}">${escapeHtml(shortUrl)}</span>
    <span class="log-message">${escapeHtml(message)}</span>
  `;

  logList.insertBefore(item, logList.firstChild);

  if (logList.children.length > 200) {
    logList.removeChild(logList.lastChild);
  }
}

// ==================== 导出 ====================
function exportResults() {
  if (localResults.length === 0) {
    alert('没有可导出的结果');
    return;
  }

  const header = '原序号,URL,来源域名,结果,AI内容,错误信息,处理耗时(秒),处理时间';
  const rows = localResults.map((r) => {
    const escape = (val) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    return [
      r.originalIndex + 1,
      escape(r.url),
      escape(r.sourceDomain),
      r.result,
      escape(r.aiContent),
      escape(r.errorMessage),
      r.elapsed != null ? r.elapsed : '',
      r.timestamp ? new Date(r.timestamp).toLocaleString() : ''
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `batch_result_${batchId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function clearBatch() {
  resetFile();
  batchId = null;
  totalCount = successCount = failCount = pendingCount = 0;
  currentIndex = 0;
  localResults = [];
  activeTabsByIndex.clear();
  logList.innerHTML = '';
  statsTableBody.innerHTML = '';
  statsTotal.textContent = '0';
  statsSuccess.textContent = '0';
  statsFail.textContent = '0';
  statsRate.textContent = '—';
  statsPanel.classList.remove('visible');
  filterDomain.innerHTML = '<option value="all">全部域名</option>';
  filterResult.value = 'all';
  filterTimeRange.value = 'all';
  filterKeyword.value = '';
  setStatus('idle');
  updateUI();
  chrome.storage.local.remove(['batchLocalResults']);
}

// ==================== 统计面板 ====================

// 从 parsedUrls 找到对应行（用 data-url 属性查找）
function findPreviewRowByIndex(urlIndex) {
  const { url } = parsedUrls[urlIndex] || {};
  if (!url) return null;
  const rows = urlPreviewBody.querySelectorAll('tr');
  for (const row of rows) {
    if (row.dataset.url === url) return row;
  }
  return null;
}

function highlightPreviewRow(urlIndex, state) {
  const row = findPreviewRowByIndex(urlIndex);
  if (!row) return;
  row.classList.remove('url-processing', 'url-done-success', 'url-done-fail');
  if (state === 'processing') row.classList.add('url-processing');
  else if (state === 'success') row.classList.add('url-done-success');
  else if (state === 'fail') row.classList.add('url-done-fail');
}

function clearPreviewRow(urlIndex) {
  highlightPreviewRow(urlIndex, null);
}

function buildDomainOptions() {
  const domainMap = new Map();
  for (const r of localResults) {
    const domain = extractDomain(r.url);
    if (domain) domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
  }
  const select = filterDomain;
  // 保留第一项 "全部域名"
  select.innerHTML = '<option value="all">全部域名</option>';
  for (const [domain, count] of [...domainMap.entries()].sort((a, b) => b[1] - a[1])) {
    const opt = document.createElement('option');
    opt.value = domain;
    opt.textContent = `${domain} (${count})`;
    select.appendChild(opt);
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function filterTimeBucket(elapsedSecs) {
  const sel = filterTimeRange.value;
  if (sel === 'all') return true;
  if (elapsedSecs == null) return sel === '60+';
  if (sel === '0-5') return elapsedSecs <= 5;
  if (sel === '5-15') return elapsedSecs > 5 && elapsedSecs <= 15;
  if (sel === '15-30') return elapsedSecs > 15 && elapsedSecs <= 30;
  if (sel === '30-60') return elapsedSecs > 30 && elapsedSecs <= 60;
  if (sel === '60+') return elapsedSecs > 60;
  return true;
}

function renderStats() {
  if (localResults.length === 0) {
    statsPanel.classList.remove('visible');
    return;
  }
  statsPanel.classList.add('visible');

  const total = localResults.length;
  const success = localResults.filter((r) => r.result === 'success').length;
  const fail = total - success;
  statsTotal.textContent = total;
  statsSuccess.textContent = success;
  statsFail.textContent = fail;
  statsRate.textContent = total > 0 ? Math.round((success / total) * 100) + '%' : '—';

  buildDomainOptions();

  const resultFilter = filterResult.value;
  const domainFilter = filterDomain.value;
  const kw = filterKeyword.value.trim().toLowerCase();

  const filtered = localResults.filter((r) => {
    if (resultFilter !== 'all' && r.result !== resultFilter) return false;
    if (domainFilter !== 'all' && extractDomain(r.url) !== domainFilter) return false;
    if (!filterTimeBucket(r.elapsed)) return false;
    if (kw) {
      const haystack = (r.url + ' ' + (r.aiContent || '') + ' ' + (r.errorMessage || '')).toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });

  statsCountLabel.textContent = `显示 ${filtered.length} / ${total} 条`;

  // 渲染表格（只重建 DOM，不重新请求）
  statsTableBody.innerHTML = '';
  for (const r of filtered) {
    const tr = document.createElement('tr');
    tr.className = 'url-' + r.result;

    const elapsedStr = r.elapsed != null ? r.elapsed + 's' : '—';
    const timeStr = r.timestamp ? formatTime(new Date(r.timestamp)) : '—';
    const domain = extractDomain(r.url);
    const shortUrl = r.url.length > 40 ? r.url.substring(0, 37) + '…' : r.url;

    const aiCell = document.createElement('td');
    if (r.aiContent) {
      aiCell.className = 'ai-content-cell';
      aiCell.textContent = r.aiContent;
      aiCell.title = r.aiContent;
      aiCell.addEventListener('click', () => {
        aiCell.classList.toggle('expanded');
      });
    } else {
      aiCell.textContent = '—';
      aiCell.style.color = '#d1d5db';
    }

    tr.innerHTML = `
      <td style="color:#9ca3af;width:40px;text-align:center;">${r.originalIndex + 1}</td>
      <td style="color:#6b7280;font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(domain)}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.url)}">${escapeHtml(shortUrl)}</td>
      <td><span class="result-badge ${r.result}">${r.result === 'success' ? '成功' : '失败'}</span></td>
    `;
    tr.appendChild(aiCell);

    const errCell = document.createElement('td');
    if (r.errorMessage) {
      errCell.className = 'error-cell';
      errCell.textContent = r.errorMessage;
      errCell.title = r.errorMessage;
    } else {
      errCell.textContent = '—';
      errCell.style.color = '#d1d5db';
    }
    tr.appendChild(errCell);

    tr.innerHTML += `
      <td style="font-size:11px;color:#9ca3af;white-space:nowrap;">${elapsedStr}</td>
      <td style="font-size:11px;color:#9ca3af;white-space:nowrap;">${timeStr}</td>
    `;

    statsTableBody.appendChild(tr);
  }

  // 滚动到最新
  statsTableWrap.scrollTop = 0;
}

// ==================== 工具函数 ====================
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
