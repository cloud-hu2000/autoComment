// 点击扩展图标时，在当前标签页内打开/关闭浮动窗口
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_PROMOTE_WITH_QWEN_PANEL'
    });
  }
});

