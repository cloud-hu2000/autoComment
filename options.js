// 选项页逻辑：保存和读取 AI API Key、Skill 模板和用户ID

const SKILL_TEMPLATE_STORAGE_KEY = 'qwen_skill_template';
const WEBSITE_URL_STORAGE_KEY = 'promotion_website_url';
const AUTO_OPEN_QWEN_PANEL_KEY = 'auto_open_qwen_panel';
const USER_NAME_STORAGE_KEY = 'auto_fill_user_name';
const USER_EMAIL_STORAGE_KEY = 'auto_fill_user_email';
const USER_PASSWORD_STORAGE_KEY = 'auto_fill_user_password';
const AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY = 'auto_generate_qwen_on_page_load';
const USER_ID_STORAGE_KEY = 'auto_comment_user_id';

// ====== 积分系统配置 ======
const POINTS_API_BASE = 'https://jieyunsang.cn/api';

document.addEventListener('DOMContentLoaded', () => {
  const skillTemplateInput = document.getElementById('skillTemplate');
  const websiteUrlInput = document.getElementById('websiteUrl');
  const autoOpenPanelCheckbox = document.getElementById('autoOpenPanel');
  const autoGenerateOnLoadCheckbox = document.getElementById('autoGenerateOnLoad');
  const userNameInput = document.getElementById('userName');
  const userEmailInput = document.getElementById('userEmail');
  const userPasswordInput = document.getElementById('userPassword');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsStatusEl = document.getElementById('settingsStatus');
  const savePointsBtn = document.getElementById('savePointsBtn');
  const pointsStatusEl = document.getElementById('pointsStatus');
  const userIdInput = document.getElementById('userId');
  const pointsBalanceEl = document.getElementById('pointsBalance');

  if (
    !skillTemplateInput ||
    !websiteUrlInput ||
    !autoOpenPanelCheckbox ||
    !autoGenerateOnLoadCheckbox ||
    !userNameInput ||
    !userEmailInput ||
    !userPasswordInput ||
    !saveSettingsBtn ||
    !settingsStatusEl
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
    '1. 我需要在该网站发表评论，关联到我的网站【请在此处输入网站链接】，并吸引用户点击访问我的网站。',
    '2. 语气可以专业但要自然、真实，避免夸张、虚假宣传。',
    '3. 使用网站的主要语言作为输出语言，字数建议控制在 100词。',
    '4. 只要评论的语句，不要输出其他无关的句子。'
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

  // 设置：是否在页面加载时自动调用 AI 生成推广文案
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

  function showStatus(el, text, timeout = 1600) {
    el.textContent = text;
    el.classList.add('visible');
    if (timeout > 0) {
      setTimeout(() => {
        el.classList.remove('visible');
      }, timeout);
    }
  }

  // 保存 AI 语言模板、自动填表信息及按钮选项
  saveSettingsBtn.addEventListener('click', () => {
    const skillTemplate = skillTemplateInput.value.trim();
    const websiteUrl = websiteUrlInput.value.trim();
    const autoOpenPanel = !!autoOpenPanelCheckbox.checked;
    const autoGenerateOnLoad = !!autoGenerateOnLoadCheckbox.checked;
    const userName = userNameInput.value.trim();
    const userEmail = userEmailInput.value.trim();
    const userPassword = userPasswordInput.value.trim();

    chrome.storage.sync.set(
      {
        [SKILL_TEMPLATE_STORAGE_KEY]: skillTemplate,
        [WEBSITE_URL_STORAGE_KEY]: websiteUrl,
        [AUTO_OPEN_QWEN_PANEL_KEY]: autoOpenPanel,
        [USER_NAME_STORAGE_KEY]: userName,
        [USER_EMAIL_STORAGE_KEY]: userEmail,
        [USER_PASSWORD_STORAGE_KEY]: userPassword,
        [AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY]: autoGenerateOnLoad
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('保存设置失败：', chrome.runtime.lastError);
          showStatus(settingsStatusEl, '保存失败', 2000);
          return;
        }
        showStatus(settingsStatusEl, '已保存');
      }
    );
  });

  // 保存并刷新积分（仅保存用户ID + 查询积分）
  savePointsBtn.addEventListener('click', () => {
    const userId = userIdInput.value.trim();
    chrome.storage.sync.set({ [USER_ID_STORAGE_KEY]: userId }, () => {
      if (chrome.runtime.lastError) {
        console.error('保存用户ID失败：', chrome.runtime.lastError);
        showStatus(pointsStatusEl, '保存失败', 2000);
        return;
      }
      showStatus(pointsStatusEl, '已保存');
      if (userId) {
        fetchPointsBalance(userId);
      }
    });
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

  // 页面加载时自动查询积分（如果有用户ID）
  chrome.storage.sync.get([USER_ID_STORAGE_KEY], (result) => {
    if (result && typeof result[USER_ID_STORAGE_KEY] === 'string' && result[USER_ID_STORAGE_KEY]) {
      fetchPointsBalance(result[USER_ID_STORAGE_KEY]);
    }
  });
});
