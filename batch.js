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
let skippedCount = 0;
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

// 等待确认的标签页: tabId -> { urlIndex }
let tabsPendingConfirm = new Map();
// 需要收到 BATCH_CONFIRMED 才关闭的标签页
let tabsWaitingClose = new Set();
// 已跳过（已存在评论）的 urlIndex 记录
let skippedIndices = new Set();

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
const skippedCountEl = document.getElementById('skippedCount');
const pendingCountEl = document.getElementById('pendingCount');
const progressText = document.getElementById('progressText');
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
  startBtn.addEventListener('click', () => {
    if (status === 'terminated') {
      resumeBatch();
    } else {
      startBatch();
    }
  });
  pauseBtn.addEventListener('click', togglePause);
  stopBtn.addEventListener('click', stopBatch);
  exportBtn.addEventListener('click', exportResults);
  clearBtn.addEventListener('click', clearBatch);

  // 设置
  timeoutInput.addEventListener('change', saveTimeoutSetting);
  concurrentInput.addEventListener('change', saveConcurrentSetting);

  // 监听 background 消息（结果回调）
  chrome.runtime.onMessage.addListener((message) => {
    // background 通知：结果已落盘，标签页可以安全关闭了
    if (message.type === 'BATCH_CONFIRMED') {
      console.log('[batch] 收到 BATCH_CONFIRMED >>>', { urlIndex: message.urlIndex, result: message.result, aiContentLen: message.aiContent ? message.aiContent.length : 0, tabsPendingConfirm: [...tabsPendingConfirm.entries()], tabsWaitingClose: [...tabsWaitingClose], time: new Date().toISOString() });
      handleTabConfirmed(message.urlIndex, message.result, message.aiContent, message.errorMessage);
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
  reader.readAsArrayBuffer(file);
}

function normalizeEncoding(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;

  // UTF-16 LE BOM: FF FE
  if (len >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.slice(2));
  }
  // UTF-16 BE BOM: FE FF
  if (len >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.slice(2));
  }
  // UTF-8 BOM: EF BB BF（已在 TextDecoder 自动跳过，但保险起见再剥一层）
  if (len >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  // 尝试检测 UTF-16 LE（无 BOM，但数据特征为每个 ASCII 后跟 00）
  if (len >= 4 && bytes[1] === 0x00 && bytes[3] === 0x00) {
    return new TextDecoder('utf-16le').decode(bytes);
  }

  // 检测 GBK/GB2312 编码：中文 GBK 双字节范围 0x81-0xFE
  let hasGBKSignature = false;
  for (let i = 0; i < len - 1; i++) {
    const b = bytes[i];
    if (b >= 0x81 && b <= 0xfe) {
      hasGBKSignature = true;
      break;
    }
  }

  // 优先尝试 UTF-8 解码（现代标准）
  const utf8Text = new TextDecoder('utf-8').decode(bytes);

  // 如果 UTF-8 解码后仍包含乱码特征（连续问号或方框），尝试 GBK
  if (hasGBKSignature && (utf8Text.includes('�') || utf8Text.includes('???') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(utf8Text.slice(0, 100)))) {
    try {
      // 使用 GBK/GB2312/GB18030 解码
      const gbkText = new TextDecoder('gbk').decode(bytes);
      // 验证 GBK 解码结果是否包含有效中文（GBK 中常用汉字在 0xB0-0xF7 范围）
      const validChineseCount = (gbkText.match(/[\u4e00-\u9fa5]/g) || []).length;
      if (validChineseCount > 0) {
        return gbkText;
      }
    } catch (e) {
      // GBK 解码失败，回退到 UTF-8
    }
  }

  return utf8Text;
}

function parseCSV(raw, fileNameParam) {
  const text = normalizeEncoding(raw);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    alert('CSV 文件内容为空或格式错误');
    return;
  }

  // 去除 UTF-8 BOM（常见于从 Windows Excel 保存的文件）
  const headerRaw = lines[0];
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
    const row = parseCSVLine(lines[i]);
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

// 终止标志：stopBatch 后保持 results 但不再处理
let isTerminated = false;

async function stopBatch() {
  // 停止继续打开新标签页
  isTerminated = true;

  // 标记所有待处理的为未处理（可用于恢复）
  const terminatedCount = pendingCount;

  // 清空轮询和超时检查
  if (pollTimer) clearTimeout(pollTimer);
  stopTimeoutChecker();

  // 关闭所有打开的标签页
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

  // 状态设为 terminated，用于显示保留的结果
  setStatus('terminated');
  updateStatsUI();
  updateUI();

  // 显示终止提示
  console.log(`[batch] 已手动终止。共保留 ${localResults.length} 条结果（成功 ${successCount}，失败 ${failCount}），跳过 ${terminatedCount} 条未处理`);
}

// 恢复处理（从终止状态继续）
async function resumeBatch() {
  console.log('[resumeBatch] 开始恢复处理', { status, currentIndex, totalCount, successCount, failCount });

  if (status !== 'terminated') {
    console.log('[resumeBatch] 状态不是 terminated，不执行');
    return;
  }

  // 重置终止状态
  isTerminated = false;
  isOpeningTab = false;  // 重置锁，确保可以继续打开

  // 重置待处理计数（仅统计还未处理的）
  const processedCount = successCount + failCount;
  pendingCount = totalCount - processedCount;

  console.log('[resumeBatch] 将要处理的 URL 索引范围:', currentIndex, '-', totalCount - 1);

  setStatus('running');
  updateUI();

  // 从断点继续打开标签页
  const tabsToOpen = Math.min(maxConcurrentTabs, totalCount - currentIndex);
  console.log('[resumeBatch] 将打开', tabsToOpen, '个标签页');

  for (let i = 0; i < tabsToOpen; i++) {
    console.log('[resumeBatch] 打开标签页', i, '当前索引:', currentIndex);
    openNextTabSync();
    // 短暂延迟让标签页有机会打开
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

// 立即打开下一个标签页（从本地队列获取）
async function openNextTabSync() {
  console.log('[openNextTabSync] 调用', { isOpeningTab, status, isTerminated, currentIndex, totalCount });
  if (isOpeningTab) {
    console.log('[openNextTabSync] 跳过 - 正在打开中');
    return;
  }
  isOpeningTab = true;
  await openNextTab();
  isOpeningTab = false;
}

async function openNextTab() {
  console.log('[openNextTab] 检查条件', { status, isTerminated, activeTabCount, maxConcurrentTabs, currentIndex, totalCount });

  if (status !== 'running') {
    console.log('[openNextTab] 跳过 - 状态不是 running');
    return;
  }
  if (isTerminated) {
    console.log('[openNextTab] 跳过 - 已终止');
    return;
  }
  if (activeTabCount >= maxConcurrentTabs) {
    console.log('[openNextTab] 跳过 - 达到并发上限');
    return;
  }
  if (currentIndex >= totalCount) {
    console.log('[openNextTab] 跳过 - 索引超出范围');
    return;
  }

  const urlIndex = currentIndex;
  const { url } = parsedUrls[urlIndex];
  console.log('[openNextTab] 准备打开标签页', { urlIndex, url });
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

          console.log('[batch] 标签页关闭:', { tabId, urlIndex, activeTabCount, status });

          // 检查是否已有结果（content.js 主动上报或超时处理过了），没有则记为手动关闭失败
          if (!localResults.some((r) => r.originalIndex === urlIndex)) {
            console.log('[batch] 标签关闭但无结果，记为失败:', urlIndex);
            const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : null;
            handleTabResult(urlIndex, 'fail', null, '用户手动关闭', elapsed);
          } else {
            console.log('[batch] 标签关闭已有结果:', urlIndex);
            clearPreviewRow(urlIndex);
          }

          updateStatsUI();

          // 标签关闭后补充新标签
          if (status === 'running' && currentIndex < totalCount) {
            openNextTabSync();
          } else if (status === 'running' && activeTabCount === 0) {
            // 所有标签页都已关闭，检查是否全部完成
            const processedCount = successCount + failCount + skippedCount;
            console.log('[batch] 所有标签关闭，检查完成状态:', { processedCount, totalCount, activeTabCount });
            if (processedCount >= totalCount) {
              onAllCompleted();
            }
          }
        }
      };
      chrome.tabs.onRemoved.addListener(listener);

      // 等待 content script 就绪后再发送任务
      function sendWhenReady(tabId, retries = 0) {
        if (retries > 20) {
          console.error('[batch] content.js 就绪超时，放弃发送, tabId:', tabId);
          return;
        }
        chrome.tabs.sendMessage(tabId, { type: 'PING' }).then(() => {
          // content.js 已就绪，发送正式任务
          console.log('[batch] content.js 已就绪，发送 BATCH_HANDLE → tabId:', tab.id, { batchId, urlIndex, url, time: new Date().toISOString() });
          chrome.tabs.sendMessage(tab.id, {
            type: 'BATCH_HANDLE',
            batchId,
            urlIndex,
            url
          }).then((response) => {
            console.log('[batch] 收到 content.js 响应:', response, 'tabId:', tab.id, 'tabsPendingConfirm:', [...tabsPendingConfirm.keys()], 'time:', new Date().toISOString());
            if (response && response.ok) {
              console.log('[batch] 记录 tabId', tab.id, '到 tabsPendingConfirm, 等待 BATCH_CONFIRMED...');
              tabsPendingConfirm.set(tab.id, { urlIndex });
              tabsWaitingClose.add(tab.id);
            } else {
              console.warn('[batch] content.js 响应 ok=false 或无响应:', response);
            }
          }).catch((err) => {
            console.error('[batch] sendMessage BATCH_HANDLE 发送失败:', err, 'tabId:', tab.id);
          });
        }).catch(() => {
          // content.js 还没注入，500ms 后重试
          setTimeout(() => sendWhenReady(tabId, retries + 1), 500);
        });
      }
      sendWhenReady(tab.id);
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
  console.log('[batch] handleTabResult 被调用:', { urlIndex, result, aiContentLen: aiContent ? aiContent.length : 0, errorMessage });
  const item = parsedUrls[urlIndex];
  if (!item) {
    console.log('[batch] handleTabResult: item 不存在, urlIndex=', urlIndex);
    return;
  }

  // 避免重复处理
  if (localResults.some((r) => r.originalIndex === urlIndex)) {
    console.log('[batch] handleTabResult: 重复调用, urlIndex=', urlIndex);
    return;
  }

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
  } else if (result === 'skipped') {
    skippedCount++;
    skippedIndices.add(urlIndex);
    highlightPreviewRow(urlIndex, 'skipped');
  } else {
    failCount++;
    highlightPreviewRow(urlIndex, 'fail');
  }

  pendingCount = totalCount - successCount - failCount - skippedCount;
  updateStatsUI();
  renderStats();

  // 保存到本地存储
  saveLocalResults();

  // 检查是否全部完成（成功 + 失败 + 已跳过 >= 总数）
  const processedCount = successCount + failCount + skippedCount;
  console.log('[batch] handleTabResult 完成检查:', {
    urlIndex,
    result,
    successCount,
    failCount,
    skippedCount,
    processedCount,
    totalCount,
    shouldComplete: processedCount >= totalCount
  });
  if (processedCount >= totalCount) {
    onAllCompleted();
  }
}

// background 通知：结果已落盘，可以安全关闭标签页了
function handleTabConfirmed(urlIndex, result, aiContent, errorMessage) {
  console.log('[batch] handleTabConfirmed >>>', { urlIndex, result, aiContentLen: aiContent ? aiContent.length : 0, errorMessage, tabsPendingConfirmBefore: [...tabsPendingConfirm.entries()] });

  // 如果已经记录过结果（标签页可能已被 onRemoved 提前关闭清理），跳过 handleTabResult
  if (localResults.some((r) => r.originalIndex === urlIndex)) {
    console.log('[batch] handleTabConfirmed: urlIndex', urlIndex, '已有结果，可能是标签页提前关闭，无需重复处理');
  } else {
    // 处理结果（更新 UI、写入 storage）
    handleTabResult(urlIndex, result, aiContent, errorMessage);
  }

  // 查找并关闭标签页（如果还在的话）
  for (const [tabId, info] of tabsPendingConfirm) {
    if (info.urlIndex === urlIndex) {
      console.log('[batch] 关闭 tabId:', tabId, 'urlIndex:', urlIndex);
      tabsPendingConfirm.delete(tabId);
      tabsWaitingClose.delete(tabId);
      chrome.tabs.remove(tabId, () => {});
      break;
    }
  }
  // 找不到对应的 tabId 说明已经关闭了（用户手动关或超时自动关），无需处理
  console.log('[batch] handleTabConfirmed <<<');
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
  console.log('[batch] onAllCompleted 被调用!');
  isTerminated = true;  // 防止继续打开新标签页
  setStatus('completed');
  stopTimeoutChecker();
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  // 关闭所有剩余标签页
  const tabIds = Array.from(activeTabs.keys());
  activeTabs.clear();
  activeTabsByIndex.clear();
  activeTabCount = 0;
  for (const tabId of tabIds) {
    try {
      chrome.tabs.remove(tabId, () => {});
    } catch (_) {}
  }

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
    completed: '已完成',
    terminated: '已终止'
  }[s] || s;
  statusBadge.className = 'status-badge ' + s;
}

function updateUI() {
  const isIdle = status === 'idle';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const isTerminated = status === 'terminated';

  // 开始按钮：空闲时可开始，终止时可重新开始
  startBtn.disabled = (isRunning || isPaused) || parsedUrls.length === 0;
  // 终止状态下显示"重新开始"，正常空闲显示"开始批量处理"
  startBtn.textContent = isTerminated ? '▶ 重新开始' : '▶ 开始批量处理';

  pauseBtn.disabled = !isRunning && !isPaused;
  pauseBtn.style.display = isTerminated ? 'none' : 'inline-flex';
  pauseBtn.textContent = isPaused ? '继续' : '暂停';
  stopBtn.disabled = isIdle || isTerminated;
  stopBtn.style.display = isTerminated ? 'none' : 'inline-flex';

  exportBtn.disabled = localResults.length === 0;
  clearBtn.disabled = isRunning || isPaused;

  // 进度、实时日志、底部操作：终止状态保持显示
  progressSection.style.display = (isIdle) ? 'none' : 'block';
  footerActions.style.display = (isIdle) ? 'none' : 'flex';

  // 统计面板：终止状态保持显示（显示已处理的结果）
  if (isIdle) {
    statsPanel.classList.remove('visible');
    statsTableBody.innerHTML = '';
  } else if (localResults.length > 0) {
    statsPanel.classList.add('visible');
    renderStatsTable();
  }

  // 终止状态下可重新开始，将待处理计数恢复
  if (isTerminated) {
    pendingCount = totalCount - successCount - failCount;
    updateStatsUI();
  }
}

function updateStatsUI() {
  const processed = successCount + failCount + skippedCount;
  const percent = totalCount > 0 ? Math.round((processed / totalCount) * 100) : 0;
  progressBar.style.width = percent + '%';
  progressText.textContent = `${processed}/${totalCount} (${percent}%)`;
  successCountEl.textContent = successCount;
  failCountEl.textContent = failCount;
  skippedCountEl.textContent = skippedCount;
  pendingCountEl.textContent = pendingCount;
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
  activeTabs.clear();
  activeTabsByIndex.clear();
  tabsPendingConfirm.clear();
  tabsWaitingClose.clear();
  isTerminated = false;
  isOpeningTab = false;
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
  row.classList.remove('url-processing', 'url-done-success', 'url-done-fail', 'url-done-skipped');
  if (state === 'processing') row.classList.add('url-processing');
  else if (state === 'success') row.classList.add('url-done-success');
  else if (state === 'fail') row.classList.add('url-done-fail');
  else if (state === 'skipped') row.classList.add('url-done-skipped');
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
  const skipped = localResults.filter((r) => r.result === 'skipped').length;
  const fail = localResults.filter((r) => r.result === 'fail').length;
  statsTotal.textContent = total;
  statsSuccess.textContent = success;
  statsFail.textContent = fail;
  skippedCountEl.textContent = skipped;
  const processedRate = total > 0 ? Math.round((success / total) * 100) : 0;
  statsRate.textContent = total > 0 ? `${processedRate}% (${skipped} 已存在)` : '—';

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
      <td><span class="result-badge ${r.result}">${r.result === 'success' ? '成功' : r.result === 'skipped' ? '已存在' : '失败'}</span></td>
    `;
    tr.className = `url-${r.result}`;
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
