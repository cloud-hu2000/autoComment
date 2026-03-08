// 选项页逻辑：保存和读取 DashScope / 通义千问 API Key & Skill 模板

const API_KEY_STORAGE_KEY = 'dashscope_api_key';
const SKILL_TEMPLATE_STORAGE_KEY = 'qwen_skill_template';

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const skillTemplateInput = document.getElementById('skillTemplate');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusEl = document.getElementById('status');

  if (!apiKeyInput || !skillTemplateInput || !saveBtn || !clearBtn || !statusEl) {
    console.error('Options page 初始化失败：元素未找到');
    return;
  }

  // 默认 Skill 模板（仅用于选项页初次展示时的提示）
  const DEFAULT_SKILL_TEMPLATE = [
    '你是一个资深的网站营销与文案专家，擅长为各类网站撰写高转化率的推广文案。',
    '请严格根据我提供的“当前网站内容”进行分析和创作，不要凭空捏造网站不存在的功能或信息。',
    '',
    '【输出要求】',
    '1. 我需要在该网站发表评论，关联到我的网站，并吸引用户点击访问我的网站。',
    '2. 语气可以专业但要自然、真实，避免夸张、虚假宣传。',
    '3. 使用网站的主要语言作为输出语言 100-200词。'
  ].join('\n');

  // 初始化时从 chrome.storage.sync 读取
  chrome.storage.sync.get([API_KEY_STORAGE_KEY, SKILL_TEMPLATE_STORAGE_KEY], (result) => {
    if (chrome.runtime.lastError) {
      console.error('读取设置失败：', chrome.runtime.lastError);
      return;
    }
    if (result && typeof result[API_KEY_STORAGE_KEY] === 'string') {
      apiKeyInput.value = result[API_KEY_STORAGE_KEY];
    }
    if (result && typeof result[SKILL_TEMPLATE_STORAGE_KEY] === 'string') {
      skillTemplateInput.value = result[SKILL_TEMPLATE_STORAGE_KEY];
    } else {
      // 如果尚未自定义过模板，则在界面中展示默认模板，方便用户修改
      skillTemplateInput.value = DEFAULT_SKILL_TEMPLATE;
    }
  });

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
    const key = apiKeyInput.value.trim();
    const skillTemplate = skillTemplateInput.value.trim();

    chrome.storage.sync.set(
      {
        [API_KEY_STORAGE_KEY]: key,
        [SKILL_TEMPLATE_STORAGE_KEY]: skillTemplate
      },
      () => {
      if (chrome.runtime.lastError) {
        console.error('保存设置失败：', chrome.runtime.lastError);
        showStatus('保存失败', 2000);
        return;
      }
      showStatus('已保存');
      }
    );
  });

  // 清空按钮
  clearBtn.addEventListener('click', () => {
    apiKeyInput.value = '';
    chrome.storage.sync.remove([API_KEY_STORAGE_KEY], () => {
      if (chrome.runtime.lastError) {
        console.error('清空 API Key 失败：', chrome.runtime.lastError);
        showStatus('清空失败', 2000);
        return;
      }
      showStatus('已清空');
    });
  });
});

