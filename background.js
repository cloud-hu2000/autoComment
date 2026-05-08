// 点击扩展图标时，在当前标签页内打开/关闭浮动窗口
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_PROMOTE_PANEL'
    });
  }
});

const BATCH_API_BASE = 'https://jieyunsang.cn/api';

/**
 * 将批量结果写入 storage + 上报服务端（在 service worker 中执行，不受页面跳转/关闭影响）
 */
async function persistBatchReport(message) {
  const { batchId, urlId, url: pageUrl = '', result, aiContent, errorMessage } = message;

  const data = await chrome.storage.local.get(['batchResults', 'batchReportedUrls']);
  const results = data.batchResults || [];
  results.push({
    batchId,
    urlId,
    url: pageUrl,
    result,
    aiContent,
    errorMessage,
    timestamp: Date.now()
  });
  if (results.length > 100) results.shift();

  let reported = data.batchReportedUrls || [];
  if (!Array.isArray(reported)) reported = [];
  const urlKey = `${batchId}:${urlId}`;
  if (!reported.includes(urlKey)) {
    reported.push(urlKey);
    if (reported.length > 500) reported.shift();
  }

  await chrome.storage.local.set({ batchResults: results, batchReportedUrls: reported });

  try {
    const resp = await fetch(`${BATCH_API_BASE}/batch/${encodeURIComponent(batchId)}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlId, result, aiContent, errorMessage })
    });
    if (!resp.ok) {
      console.warn('[background] batch report HTTP', resp.status);
    }
  } catch (err) {
    console.error('[background] batch report 请求失败:', err);
  }
}

// content.js 确认评论已提交（标签页可能刷新，context 丢失，background 仍活着）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'BATCH_HANDLE_CONFIRM') {
    (async () => {
      try {
        await persistBatchReport({
          batchId: message.batchId,
          urlId: message.urlId,
          url: message.url || '',
          result: 'success',
          aiContent: message.aiContent,
          errorMessage: null
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});

// 批量任务结果：content / batch 页 -> background 持久化（须等 storage 落盘后再 response，供 content await）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'BATCH_REPORT_RESULT') {
    (async () => {
      try {
        await persistBatchReport(message);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});
