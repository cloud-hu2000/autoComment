// 点击扩展图标时，在当前标签页内打开/关闭浮动窗口
chrome.action.onClicked.addListener((tab) => {
  // 打开选项页面
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
});

/**
 * 将批量结果写入 storage（本地存储，由 batch.js 轮询读取）
 */
async function persistBatchReport(message) {
  const { batchId, urlIndex, url: pageUrl = '', result, aiContent, errorMessage } = message;

  const data = await chrome.storage.local.get(['batchResults', 'batchReportedUrls']);
  const results = data.batchResults || [];
  results.push({
    batchId,
    urlIndex,
    url: pageUrl,
    result,
    aiContent,
    errorMessage,
    timestamp: Date.now()
  });
  if (results.length > 100) results.shift();

  let reported = data.batchReportedUrls || [];
  if (!Array.isArray(reported)) reported = [];
  const urlKey = `${batchId}:${urlIndex}`;
  if (!reported.includes(urlKey)) {
    reported.push(urlKey);
    if (reported.length > 500) reported.shift();
  }

  await chrome.storage.local.set({ batchResults: results, batchReportedUrls: reported });
}

// content.js 确认评论已提交（标签页可能刷新，context 丢失，background 仍活着）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'BATCH_HANDLE_CONFIRM') {
    (async () => {
      try {
        await persistBatchReport({
          batchId: message.batchId,
          urlIndex: message.urlIndex,
          url: message.url || '',
          result: message.result || 'success',
          aiContent: message.aiContent || null,
          errorMessage: message.errorMessage || null
        });

        // 转发给 popup（batch.js）
        chrome.runtime.sendMessage({
          type: 'BATCH_RESULT',
          urlIndex: message.urlIndex,
          result: message.result || 'success',
          aiContent: message.aiContent || null,
          errorMessage: message.errorMessage || null
        }).catch(() => {});

        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});

// 批量任务结果：content / batch 页 -> background 持久化
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
