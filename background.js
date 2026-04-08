// 点击扩展图标时，在当前标签页内打开/关闭浮动窗口
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_PROMOTE_PANEL'
    });
  }
});

// 批量任务结果上报：content script -> background -> batch.html
chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  if (message && message.type === 'BATCH_REPORT_RESULT') {
    const { batchId, urlId, result, aiContent, errorMessage } = message;
    // 将结果存储到 chrome.storage.local，batch.html 通过轮询读取
    chrome.storage.local.get(['batchResults'], (data) => {
      const results = data.batchResults || [];
      results.push({ batchId, urlId, result, aiContent, errorMessage, timestamp: Date.now() });
      // 只保留最近100条
      if (results.length > 100) results.shift();
      chrome.storage.local.set({ batchResults: results });
    });
  }
});

