// 选项页逻辑：保存和读取 DashScope / 通义千问 API Key & Skill 模板 & 用户ID

const SKILL_TEMPLATE_STORAGE_KEY = 'qwen_skill_template';
const WEBSITE_URL_STORAGE_KEY = 'promotion_website_url';
const AUTO_OPEN_QWEN_PANEL_KEY = 'auto_open_qwen_panel';
const USER_NAME_STORAGE_KEY = 'auto_fill_user_name';
const USER_EMAIL_STORAGE_KEY = 'auto_fill_user_email';
const USER_PASSWORD_STORAGE_KEY = 'auto_fill_user_password';
const AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY = 'auto_generate_qwen_on_page_load';
const USER_ID_STORAGE_KEY = 'auto_comment_user_id';

// ====== 积分系统配置 ======
const POINTS_API_BASE = 'http://101.37.116.48/api';

document.addEventListener('DOMContentLoaded', () => {
  const skillTemplateInput = document.getElementById('skillTemplate');
  const websiteUrlInput = document.getElementById('websiteUrl');
  const autoOpenPanelCheckbox = document.getElementById('autoOpenPanel');
  const autoGenerateOnLoadCheckbox = document.getElementById('autoGenerateOnLoad');
  const userNameInput = document.getElementById('userName');
  const userEmailInput = document.getElementById('userEmail');
  const userPasswordInput = document.getElementById('userPassword');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');
  const userIdInput = document.getElementById('userId');
  const refreshPointsBtn = document.getElementById('refreshPointsBtn');
  const pointsBalanceEl = document.getElementById('pointsBalance');

  if (
    !skillTemplateInput ||
    !websiteUrlInput ||
    !autoOpenPanelCheckbox ||
    !autoGenerateOnLoadCheckbox ||
    !userNameInput ||
    !userEmailInput ||
    !userPasswordInput ||
    !saveBtn ||
    !statusEl
  ) {
    console.error('Options page 初始化失败：元素未找到');
    return;
  }

  // 默认 Skill 模板（仅用于选项页初次展示时的提示）
  const DEFAULT_SKILL_TEMPLATE = [
    '你是一个资深的网站营销与文案专家，擅长为各类网站撰写高转化率的推广文案。',
    '请严格根据我提供的"当前网站内容"进行分析和创作，不要凭空捏造网站不存在的功能或信息。',
    '',
    '【输出要求】',
    '1. 我需要在该网站发表评论，关联到我的网站，并吸引用户点击访问我的网站。',
    '2. 语气可以专业但要自然、真实，避免夸张、虚假宣传。',
    '3. 使用网站的主要语言作为输出语言 100-200词。'
  ].join('\n');

  // 初始化时从 chrome.storage.sync 读取
  chrome.storage.sync.get(
    [
      SKILL_TEMPLATE_STORAGE_KEY,
      WEBSITE_URL_STORAGE_KEY,
      AUTO_OPEN_QWEN_PANEL_KEY,
      USER_NAME_STORAGE_KEY,
      USER_EMAIL_STORAGE_KEY,
      USER_PASSWORD_STORAGE_KEY,
      USER_ID_STORAGE_KEY
    ],
    (result) => {
      if (chrome.runtime.lastError) {
        console.error('读取设置失败：', chrome.runtime.lastError);
        return;
      }
      if (result && typeof result[SKILL_TEMPLATE_STORAGE_KEY] === 'string') {
        skillTemplateInput.value = result[SKILL_TEMPLATE_STORAGE_KEY];
      } else {
        skillTemplateInput.value = DEFAULT_SKILL_TEMPLATE;
      }
      if (result && typeof result[WEBSITE_URL_STORAGE_KEY] === 'string') {
        websiteUrlInput.value = result[WEBSITE_URL_STORAGE_KEY];
      }
      if (result && typeof result[AUTO_OPEN_QWEN_PANEL_KEY] === 'boolean') {
        autoOpenPanelCheckbox.checked = result[AUTO_OPEN_QWEN_PANEL_KEY];
      } else {
        autoOpenPanelCheckbox.checked = true;
      }
      if (result && typeof result[USER_NAME_STORAGE_KEY] === 'string') {
        userNameInput.value = result[USER_NAME_STORAGE_KEY];
      }
      if (result && typeof result[USER_EMAIL_STORAGE_KEY] === 'string') {
        userEmailInput.value = result[USER_EMAIL_STORAGE_KEY];
      }
      if (result && typeof result[USER_PASSWORD_STORAGE_KEY] === 'string') {
        userPasswordInput.value = result[USER_PASSWORD_STORAGE_KEY];
      }
      // 读取已保存的用户ID
      if (result && typeof result[USER_ID_STORAGE_KEY] === 'string' && result[USER_ID_STORAGE_KEY]) {
        userIdInput.value = result[USER_ID_STORAGE_KEY];
      }
    }
  );

  // 设置：是否在页面加载时自动调用通义千问生成推广文案
  (function initSessionAutoGenerateSetting() {
    if (!chrome.storage || !chrome.storage.sync) {
      if (autoGenerateOnLoadCheckbox) {
        autoGenerateOnLoadCheckbox.checked = false;
      }
      return;
    }
    chrome.storage.sync.get([AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.error('读取自动生成推广文案设置失败：', chrome.runtime.lastError);
        autoGenerateOnLoadCheckbox.checked = false;
        return;
      }
      if (result && typeof result[AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY] === 'boolean') {
        autoGenerateOnLoadCheckbox.checked = result[AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY];
      } else {
        autoGenerateOnLoadCheckbox.checked = false;
      }
    });
  })();

  function showStatus(text, timeout = 1600) {
    statusEl.textContent = text;
    statusEl.classList.add('visible');
    if (timeout > 0) {
      setTimeout(() => {
        statusEl.classList.remove('visible');
      }, timeout);
    }
  }

  // 保存按钮
  saveBtn.addEventListener('click', () => {
    const skillTemplate = skillTemplateInput.value.trim();
    const websiteUrl = websiteUrlInput.value.trim();
    const autoOpenPanel = !!autoOpenPanelCheckbox.checked;
    const autoGenerateOnLoad = !!autoGenerateOnLoadCheckbox.checked;
    const userName = userNameInput.value.trim();
    const userEmail = userEmailInput.value.trim();
    const userPassword = userPasswordInput.value.trim();
    const userId = userIdInput.value.trim();

    chrome.storage.sync.set(
      {
        [SKILL_TEMPLATE_STORAGE_KEY]: skillTemplate,
        [WEBSITE_URL_STORAGE_KEY]: websiteUrl,
        [AUTO_OPEN_QWEN_PANEL_KEY]: autoOpenPanel,
        [USER_NAME_STORAGE_KEY]: userName,
        [USER_EMAIL_STORAGE_KEY]: userEmail,
        [USER_PASSWORD_STORAGE_KEY]: userPassword,
        [AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY]: autoGenerateOnLoad,
        [USER_ID_STORAGE_KEY]: userId
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('保存设置失败：', chrome.runtime.lastError);
          showStatus('保存失败', 2000);
          return;
        }
        showStatus('已保存');
        // 保存后自动刷新积分
        if (userId) {
          fetchPointsBalance(userId);
        }
      }
    );
  });

  // ====== 积分查询功能 ======
  function setPointsBalance(points) {
    if (pointsBalanceEl) {
      pointsBalanceEl.textContent = (points !== null && points !== undefined) ? points : '—';
    }
  }

  async function fetchPointsBalance(userId) {
    if (!userId) {
      setPointsBalance(null);
      return;
    }
    try {
      const response = await fetch(`${POINTS_API_BASE}/get-points?userId=${encodeURIComponent(userId)}`);
      const data = await response.json();
      if (data.success) {
        setPointsBalance(data.points);
      } else {
        setPointsBalance('查询失败');
      }
    } catch (error) {
      console.error('查询积分失败:', error);
      setPointsBalance('网络错误');
    }
  }

  // 刷新积分按钮
  if (refreshPointsBtn) {
    refreshPointsBtn.addEventListener('click', () => {
      const userId = userIdInput.value.trim();
      if (!userId) {
        setPointsBalance(null);
        return;
      }
      setPointsBalance('查询中…');
      fetchPointsBalance(userId);
    });
  }

  // 页面加载时自动查询积分（如果有用户ID）
  chrome.storage.sync.get([USER_ID_STORAGE_KEY], (result) => {
    if (result && typeof result[USER_ID_STORAGE_KEY] === 'string' && result[USER_ID_STORAGE_KEY]) {
      fetchPointsBalance(result[USER_ID_STORAGE_KEY]);
    }
  });
});
