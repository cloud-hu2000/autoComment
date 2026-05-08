// 批量外链评论自动化 - 扩展端核心逻辑

// ==================== 配置 ====================
const API_BASE = 'https://jieyunsang.cn/api';
const MAX_CONCURRENT_TABS = 3;       // 最多同时打开3个标签页
const POLL_INTERVAL = 3000;          // 轮询间隔（ms）
const MAX_RETRY = 3;                 // 最大重试次数
const TIMEOUT_CHECK_INTERVAL = 5000; // 超时检查间隔（ms）
const TIMEOUT_STORAGE_KEY = 'batch_timeout_seconds';

// ==================== 状态 ====================
let batchId = null;
let userId = null;
let parsedUrls = [];                // [{originalIndex, url}]
let status = 'idle';                // idle | running | paused | completed
let activeTabCount = 0;
let pendingReports = [];             // 待上报结果（本地队列）

// 实时计数
let totalCount = 0;
let pendingCount = 0;
// 初始积分（用于结束后通过积分差值计算成功/失败数）
let initialPoints = 0;

// 轮询定时器
let pollTimer = null;
let processTimer = null;

// 活跃标签页记录 { tabId -> { batchId, urlId, startTime } }
let activeTabs = new Map();

// 定时器
let timeoutCheckTimer = null;

// 超时秒数（从 chrome.storage.sync 读取，默认 60）
let timeoutSeconds = 60;

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

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', init);

let lastResultCount = 0;
let isPolling = false;

async function init() {
  await loadUserId();
  await loadPoints();
  await loadTimeoutSetting();
  setupEventListeners();
  restoreSession();
  // 开始轮询 batchResults，更新进度
  startResultPolling();
}

// 轮询 chrome.storage.local 中的批量结果
function startResultPolling() {
  setInterval(async () => {
    if (!batchId || status !== 'running') return;

    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['batchResults'], (d) => resolve(d));
    });

    const results = data.batchResults || [];
    const newResults = results.filter((r) => r.batchId === batchId);

    if (newResults.length > lastResultCount) {
      lastResultCount = newResults.length;

      // 只更新待处理计数（不记录日志，不区分成功/失败）
      pendingCount = Math.max(0, totalCount - newResults.length);
      updateStatsUI();

      // 检查是否全部完成
      if (newResults.length >= totalCount && totalCount > 0) {
        onAllCompleted();
      }
    }
  }, 300);
}

// ==================== 事件绑定 ====================
function setupEventListeners() {
  // 上传区域点击
  uploadZone.addEventListener('click', () => fileInput.click());

  // 拖拽上传
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // 文件选择
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // 移除文件
  fileRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFile();
  });

  // 开始处理
  startBtn.addEventListener('click', startBatch);

  // 暂停
  pauseBtn.addEventListener('click', togglePause);

  // 停止
  stopBtn.addEventListener('click', stopBatch);

  // 导出 CSV
  exportBtn.addEventListener('click', exportCsv);

  // 清空批次
  clearBtn.addEventListener('click', clearBatch);

  // 超时配置变化时保存
  timeoutInput.addEventListener('change', saveTimeoutSetting);
  timeoutInput.addEventListener('input', () => {
    const val = parseInt(timeoutInput.value, 10);
    if (val < 10) timeoutInput.value = '10';
    if (val > 600) timeoutInput.value = '600';
  });
}

// ==================== 文件处理 ====================
// 读取文件并解码为文本，优先尝试 GBK（中文 Windows 常见编码），兜底 UTF-8
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      // 先尝试 GBK 解码（中文 Windows 默认导出编码）
      const decoder = new TextDecoder('GBK');
      let text = decoder.decode(buffer);
      // GBK 解析后若列名仍然是乱码字符，兜底用 UTF-8 重读
      if (text.charCodeAt(0) > 0x4DBF && text.slice(0, 4) !== '页面AS') {
        text = new TextDecoder('UTF-8').decode(buffer);
      }
      resolve(text);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function handleFile(file) {
  if (!file.name.endsWith('.csv')) {
    alert('请上传 CSV 格式的文件');
    return;
  }

  fileName.textContent = file.name;
  fileCount.textContent = '解析中...';
  fileInfo.classList.add('visible');
  uploadZone.classList.add('has-file');

  readFileAsText(file).then((csvText) => {
    const results = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    const rows = results.data;
    parsedUrls = [];
    let validCount = 0;
    let invalidCount = 0;

    urlPreviewBody.innerHTML = '';

    // 兼容不同编码：UTF-8 列名和 GBK 列名同时支持
    const colUrl = '原URL' in rows[0] ? '原URL'
                : '\u539F\u0055\u0052\u004C' in rows[0] ? '\u539F\u0055\u0052\u004C'  // GBK乱码的"原URL"
                : null;
    const colDomain = 'URL对应域名' in rows[0] ? 'URL对应域名'
                : null;

    if (rows.length === 0 || !colUrl) {
      alert('CSV 文件缺少"原URL"列，请确认文件格式正确。\n\n标准格式应为：\n页面AS, 原URL, URL对应域名, 目标域名, 类型, 外部链接数量, 自动评论运行结果');
      resetFile();
      return;
    }

    rows.forEach((row, idx) => {
      let url = (row[colUrl] || '').trim();
      let sourceDomain = colDomain ? (row[colDomain] || '').trim() : '';

      if (!url) {
        invalidCount++;
        return;
      }

      // 补全协议头，确保 URL 可用
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }

      if (!isValidUrl(url)) {
        invalidCount++;
        return;
      }

      parsedUrls.push({
        originalIndex: idx,
        url,
        sourceDomain
      });
      validCount++;

      // 预览前5条
      if (idx < 5) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(sourceDomain || url)}</td><td>${escapeHtml(url)}</td>`;
        urlPreviewBody.appendChild(tr);
      }
    });

    urlPreview.classList.add('visible');
    fileCount.textContent = `共 ${validCount} 条 URL`;
    if (invalidCount > 0) {
      fileCount.textContent += `（跳过 ${invalidCount} 条无效）`;
    }

    updateCostHint(validCount);
    startBtn.disabled = validCount === 0;
  }).catch((err) => {
    alert('CSV 读取失败：' + err.message);
    resetFile();
  });
}

function resetFile() {
  fileInput.value = '';
  fileInfo.classList.remove('visible');
  uploadZone.classList.remove('has-file');
  urlPreview.classList.remove('visible');
  urlPreviewBody.innerHTML = '';
  parsedUrls = [];
  startBtn.disabled = true;
  costHint.style.display = 'none';
  pointsHint.textContent = '';
}

function updateCostHint(count) {
  if (count === 0) return;
  costHint.style.display = 'block';
  costHint.textContent = `本次将消耗约 ${count} 积分（每条评论 1 积分），请确保余额充足`;
  pointsHint.textContent = count > parseInt(pointsBalance.textContent || '0')
    ? ' ⚠️ 积分不足，请先充值'
    : '';
}

// ==================== 用户信息 ====================
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

function saveTimeoutSetting() {
  const val = parseInt(timeoutInput.value, 10);
  if (val >= 10 && val <= 600) {
    timeoutSeconds = val;
    chrome.storage.sync.set({ [TIMEOUT_STORAGE_KEY]: val });
  } else {
    timeoutInput.value = String(timeoutSeconds);
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

  // 记录初始积分
  initialPoints = parseInt(pointsBalance.textContent || '0', 10);

  // 生成 batchId
  batchId = generateUUID();
  totalCount = parsedUrls.length;
  pendingCount = totalCount;

  // 提交到后端
  setStatus('running');
  updateUI();

  try {
    const resp = await fetch(`${API_BASE}/batch/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId,
        userId,
        totalCount,
        urls: parsedUrls
      })
    });
    const json = await resp.json();
    if (json.code !== 0) {
      alert('创建批次失败：' + (json.message || '未知错误'));
      setStatus('idle');
      return;
    }
  } catch (e) {
    alert('网络错误，无法连接服务器：' + e.message);
    setStatus('idle');
    return;
  }

  // 保存会话以便刷新后恢复
  saveSession();

  // 先尝试上报待定的结果
  await flushPendingReports();

  // 开始轮询处理
  scheduleNext();
}

function scheduleNext() {
  if (status !== 'running') return;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(pollAndProcess, POLL_INTERVAL);
  // 同时启动超时检测定时器
  startTimeoutChecker();
}

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
      toRemove.push({ tabId, urlId: info.urlId, url: info.url });
    }
  }
  for (const { tabId, urlId, url } of toRemove) {
    activeTabs.delete(tabId);
    reportTabClosedFallback(urlId, url);
    try {
      await new Promise((resolve) => {
        chrome.tabs.remove(tabId, () => resolve());
      });
    } catch (_) {}
  }
}

async function pollAndProcess() {
  if (status !== 'running') return;
  if (isPolling) return;
  isPolling = true;

  // 先尝试上报pending结果
  await flushPendingReports();

  if (activeTabCount >= MAX_CONCURRENT_TABS) {
    // 标签页已满，等待完成（标签关闭时 onRemoved 会调用 scheduleNext）
    isPolling = false;
    scheduleNext();
    return;
  }

  // 请求下一个URL
  try {
    const resp = await fetch(`${API_BASE}/batch/${batchId}/next-url`);
    const json = await resp.json();

    if (json.data === null) {
      // 全部处理完成
      onAllCompleted();
      isPolling = false;
      return;
    }

    const { urlId, url, originalIndex } = json.data;

    // 打开标签页（必须等到 create 回调执行后再 ++activeTabCount，避免标签页快速关闭导致计数错乱）
    chrome.tabs.create({ url, active: false }, (tab) => {
      activeTabCount++;
      // 记录标签页开启时间，用于超时检测
      activeTabs.set(tab.id, { batchId, urlId, startTime: Date.now(), url });
      // 启动超时检测定时器（若尚未启动）
      startTimeoutChecker();
      updateStatsUI();

      // 监听标签页关闭，以减少 activeTabCount（只在未收到成功确认时触发兜底上报）
      let alreadyConfirmed = false;
      const listener = (tabId, removeInfo) => {
        if (tabId === tab.id) {
          const tabInfo = activeTabs.get(tab.id);
          activeTabs.delete(tab.id);
          // 仅当未收到成功确认时，才兜底上报失败（防止重复上报）
          if (!alreadyConfirmed) {
            reportTabClosedFallback(urlId, tabInfo && tabInfo.url);
          }
          activeTabCount = Math.max(0, activeTabCount - 1);
          updateStatsUI();
          chrome.tabs.onRemoved.removeListener(listener);
          scheduleNext();
        }
      };
      chrome.tabs.onRemoved.addListener(listener);

      // 向标签页发送 batch 任务信息
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'BATCH_HANDLE',
          batchId,
          urlId,
          url,
          originalIndex
        }).then((response) => {
          if (response && response.ok) {
            alreadyConfirmed = true;
            chrome.tabs.remove(tab.id, () => {});
          }
        }).catch(() => {});
      }, 1000);
    });
  } catch (e) {
    console.error('[batch] pollAndProcess 错误:', e);
    isPolling = false;
    scheduleNext();
    return;
  }

  // 本次轮询结束，释放锁。标签关闭时会触发 scheduleNext → 下一次 pollAndProcess
  isPolling = false;
}

function togglePause() {
  if (status === 'running') {
    setStatus('paused');
    if (pollTimer) clearTimeout(pollTimer);
    stopTimeoutChecker();
  } else if (status === 'paused') {
    setStatus('running');
    scheduleNext();
  }
}

async function stopBatch() {
  setStatus('idle');
  if (pollTimer) clearTimeout(pollTimer);
  stopTimeoutChecker();
  // 关闭所有仍在记录中的标签页
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
  clearSession();
  updateUI();
}

// ==================== 结果上报 ====================
/** 标签关闭时兜底上报失败：避免「未写入服务端」时 next-url 反复返回同一条 */
async function reportTabClosedFallback(urlId, pageUrl) {
  if (!batchId || urlId == null) return;

  const data = await new Promise((resolve) => {
    chrome.storage.local.get(['batchResults', 'batchReportedUrls'], (d) => resolve(d));
  });

  const reported = data.batchReportedUrls || [];
  const urlKey = `${batchId}:${urlId}`;
  if (reported.includes(urlKey)) return;

  // 写入 batchResults，使 batch.js 轮询立即感知到失败（url 供日志展示）
  const results = data.batchResults || [];
  results.push({
    batchId,
    urlId,
    url: pageUrl || '',
    result: 'fail',
    aiContent: null,
    errorMessage: '标签页已关闭（超时或用户主动关闭）',
    timestamp: Date.now()
  });
  if (results.length > 100) results.shift();

  reported.push(urlKey);
  if (reported.length > 500) reported.shift();

  await new Promise((resolve) => {
    chrome.storage.local.set({ batchResults: results, batchReportedUrls: reported }, resolve);
  });

  // 同时发给后端（异步，不阻塞）
  fetch(`${API_BASE}/batch/${encodeURIComponent(batchId)}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urlId,
      result: 'fail',
      aiContent: null,
      errorMessage: '标签页已关闭（超时或用户主动关闭）'
    })
  }).catch(() => {});
}

async function reportResult(urlId, result, aiContent, errorMessage) {
  if (!batchId) return;

  try {
    const resp = await fetch(`${API_BASE}/batch/${batchId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlId, result, aiContent, errorMessage })
    });
    const json = await resp.json();
    if (json.code !== 0) {
      throw new Error(json.message || '上报失败');
    }
    return true;
  } catch (e) {
    console.error('[batch] reportResult 失败:', e);
    // 加入重试队列
    pendingReports.push({ urlId, result, aiContent, errorMessage, retry: 0 });
    savePendingReports();
    return false;
  }
}

async function flushPendingReports() {
  if (pendingReports.length === 0) return;
  const toReport = [...pendingReports];
  pendingReports = [];

  for (const item of toReport) {
    try {
      const resp = await fetch(`${API_BASE}/batch/${batchId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const json = await resp.json();
      if (json.code !== 0 && json.message !== '已处理，忽略重复上报') {
        throw new Error(json.message);
      }
    } catch (e) {
      if (item.retry < MAX_RETRY) {
        item.retry++;
        pendingReports.push(item);
      }
    }
  }

  if (pendingReports.length > 0) {
    savePendingReports();
  }
}

function addLog(url, result, message) {
  const item = document.createElement('div');
  item.className = 'log-item';

  const icon = result === 'success' ? '√' : result === 'fail' ? '×' : '⋯';
  const iconClass = result === 'success' ? 'success' : result === 'fail' ? 'fail' : 'info';

  item.innerHTML = `
    <span class="log-icon ${iconClass}">${icon}</span>
    <span class="log-url">${escapeHtml(url)}</span>
    ${message ? `<span style="color:#9ca3af;font-size:11px;margin-left:6px">${escapeHtml(message)}</span>` : ''}
    <span class="log-time">${formatTime(new Date())}</span>
  `;

  logList.insertBefore(item, logList.firstChild);

  // 限制日志数量
  while (logList.children.length > 100) {
    logList.removeChild(logList.lastChild);
  }
}

async function onAllCompleted() {
  setStatus('completed');
  stopTimeoutChecker();
  activeTabs.clear();
  clearSession();

  // 通过积分差值计算成功/失败数
  let finalPoints = initialPoints;
  try {
    const resp = await fetch(`${API_BASE}/get-points?userId=${encodeURIComponent(userId)}`);
    const json = await resp.json();
    if (json.success && json.points !== undefined) {
      finalPoints = json.points;
    }
  } catch (_) {}

  const pointsUsed = initialPoints - finalPoints;
  const successCount = pointsUsed > 0 ? pointsUsed : 0;
  const failCount = totalCount - successCount;

  // 更新 UI
  document.querySelector('.stat-success').classList.remove('inactive');
  document.querySelector('.stat-fail').classList.remove('inactive');
  document.getElementById('successCount').textContent = successCount;
  document.getElementById('failCount').textContent = failCount;
  document.getElementById('pendingCount').textContent = '0';
  document.getElementById('progressText').textContent = `${totalCount}/${totalCount}`;

  addLog('系统', 'success', `处理完毕：${successCount} 成功，${failCount} 失败（积分：${initialPoints} → ${finalPoints}，消耗 ${pointsUsed}）`);
}

// ==================== UI 更新 ====================
function setStatus(s) {
  status = s;
  updateStatusBadge();
}

function updateStatusBadge() {
  statusBadge.className = `status-badge ${status}`;
  const labels = { idle: '空闲', running: '处理中', paused: '已暂停', completed: '已完成' };
  statusBadge.textContent = labels[status] || status;
}

function updateUI() {
  // 根据状态显示/隐藏按钮
  if (status === 'idle' || status === 'completed') {
    startBtn.style.display = '';
    startBtn.disabled = parsedUrls.length === 0;
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    progressSection.classList.remove('visible');
    logSection.classList.remove('visible');
    footerActions.classList.remove('visible');
  } else if (status === 'running') {
    startBtn.style.display = 'none';
    pauseBtn.style.display = '';
    stopBtn.style.display = '';
    pauseBtn.textContent = '⏸ 暂停';
    progressSection.classList.add('visible');
    logSection.classList.add('visible');
    footerActions.classList.remove('visible');
  } else if (status === 'paused') {
    startBtn.style.display = 'none';
    pauseBtn.style.display = '';
    stopBtn.style.display = '';
    pauseBtn.textContent = '▶ 继续';
    progressSection.classList.add('visible');
    logSection.classList.add('visible');
    footerActions.classList.remove('visible');
  }
}

function updateStatsUI() {
  const pct = totalCount > 0 ? Math.round(((totalCount - pendingCount) / totalCount) * 100) : 0;

  progressBar.style.width = pct + '%';
  successCountEl.textContent = '0';
  failCountEl.textContent = '0';
  pendingCountEl.textContent = pendingCount;
  progressText.textContent = `${totalCount - pendingCount}/${totalCount}`;
}

// ==================== 导出 & 清空 ====================
async function exportCsv() {
  if (!batchId) return;
  try {
    const resp = await fetch(`${API_BASE}/batch/${batchId}/export`);
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      alert('导出失败：' + (errData.message || `HTTP ${resp.status}`));
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_result_${batchId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败：' + e.message);
  }
}

function clearBatch() {
  resetFile();
  batchId = null;
  totalCount = pendingCount = 0;
  logList.innerHTML = '';
  setStatus('idle');
  updateUI();
  clearSession();
}

// ==================== 会话持久化 ====================
function saveSession() {
  chrome.storage.local.set({
    batchSession: { batchId, totalCount }
  });
}

function restoreSession() {
  chrome.storage.local.get(['batchSession'], (data) => {
    if (data.batchSession && data.batchSession.batchId) {
      // 有未完成的批次，可以选择恢复
      // 这里简化处理，不自动恢复
    }
  });
}

function clearSession() {
  chrome.storage.local.remove(['batchSession']);
}

function savePendingReports() {
  chrome.storage.local.set({ pendingReports });
}

function loadPendingReports() {
  chrome.storage.local.get(['pendingReports'], (data) => {
    pendingReports = data.pendingReports || [];
  });
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

// ==================== 接收 content script 消息 ====================
// background 收到 content.js 消息后转发给 batch.js
// 注意：本文件运行在 batch.html 页面，不能直接监听 chrome.runtime
// 所以在 background.js 中做桥接，将消息转发到当前标签页
// 这里通过 chrome.storage 做桥接（简单方案）

// 更好的方案：扩展端页面通过 chrome.runtime.onMessage 监听
// 但 batch.html 不是 background，所以需要 background.js 做转发
// 简化处理：使用轮询 chrome.storage.local 读取结果

// 监听来自 background 的消息（通过 iframe 注入方式）
// 这里改为通过 chrome.storage 广播结果，由 batch.html 轮询读取

// 初始化时加载 pendingReports
loadPendingReports();