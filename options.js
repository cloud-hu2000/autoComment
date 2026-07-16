const LEGACY_SKILL_TEMPLATE_STORAGE_KEY = 'qwen_skill_template';
const WEBSITE_URL_STORAGE_KEY = 'promotion_website_url';
const WEBSITE_CONTENT_STORAGE_KEY = 'promotion_website_content';
const USER_NAME_STORAGE_KEY = 'auto_fill_user_name';
const USER_EMAIL_STORAGE_KEY = 'auto_fill_user_email';
const USER_PASSWORD_STORAGE_KEY = 'auto_fill_user_password';
const USER_ID_STORAGE_KEY = 'auto_comment_user_id';
const LEGACY_PROMPT_FIELD_VALUES_STORAGE_KEY = 'auto_fill_prompt_field_values';
const SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY = 'show_export_outlinks_floating_button';

const POINTS_API_BASE = 'https://jieyunsang.cn/api';
const CONFIG_VERSION = 2;
const USER_ID_NOT_ASSIGNED_MESSAGE = 'userid需要由管理员手动分配';

const ACTIVE_STORAGE_KEYS = [
  WEBSITE_URL_STORAGE_KEY,
  WEBSITE_CONTENT_STORAGE_KEY,
  USER_NAME_STORAGE_KEY,
  USER_EMAIL_STORAGE_KEY,
  USER_PASSWORD_STORAGE_KEY,
  USER_ID_STORAGE_KEY,
  SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY
];

const IMPORT_COMPAT_STORAGE_KEYS = [
  ...ACTIVE_STORAGE_KEYS,
  LEGACY_SKILL_TEMPLATE_STORAGE_KEY,
  LEGACY_PROMPT_FIELD_VALUES_STORAGE_KEY
];

document.addEventListener('DOMContentLoaded', () => {
  const websiteUrlInput = document.getElementById('websiteUrl');
  const websiteContentInput = document.getElementById('websiteContent');
  const userNameInput = document.getElementById('userName');
  const userEmailInput = document.getElementById('userEmail');
  const userPasswordInput = document.getElementById('userPassword');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsStatusEl = document.getElementById('settingsStatus');
  const savePointsBtn = document.getElementById('savePointsBtn');
  const pointsStatusEl = document.getElementById('pointsStatus');
  const userIdInput = document.getElementById('userId');
  const pointsBalanceEl = document.getElementById('pointsBalance');
  const exportConfigBtn = document.getElementById('exportConfigBtn');
  const importConfigBtn = document.getElementById('importConfigBtn');
  const importConfigFileInput = document.getElementById('importConfigFileInput');
  const importExportStatus = document.getElementById('importExportStatus');
  const openBatchBtn = document.getElementById('openBatchBtn');
  const openPaymentBtn = document.getElementById('openPaymentBtn');
  const toggleExportOutlinksFloatingBtn = document.getElementById('toggleExportOutlinksFloatingBtn');
  const purchaseStatusEl = document.getElementById('purchaseStatus');
  const purchasePlanEl = document.getElementById('purchasePlan');
  const purchaseOrderNoEl = document.getElementById('purchaseOrderNo');
  const purchaseUpdatedAtEl = document.getElementById('purchaseUpdatedAt');

  if (
    !websiteUrlInput ||
    !websiteContentInput ||
    !userNameInput ||
    !userEmailInput ||
    !userPasswordInput ||
    !saveSettingsBtn ||
    !settingsStatusEl
  ) {
    console.error('Options page 初始化失败：元素未找到');
    return;
  }

  function showStatus(el, text, timeout = 1600) {
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    setTimeout(() => {
      el.style.opacity = '0';
    }, timeout);
  }

  let showExportOutlinksFloatingButton = true;

  function renderExportOutlinksFloatingToggle() {
    if (!toggleExportOutlinksFloatingBtn) return;
    toggleExportOutlinksFloatingBtn.textContent = showExportOutlinksFloatingButton ? '隐藏导出外链按钮' : '显示导出外链按钮';
    toggleExportOutlinksFloatingBtn.classList.toggle('btn-primary', !showExportOutlinksFloatingButton);
    toggleExportOutlinksFloatingBtn.classList.toggle('btn-secondary', showExportOutlinksFloatingButton);
    toggleExportOutlinksFloatingBtn.title = showExportOutlinksFloatingButton
      ? '点击后页面不再显示“导出外链”浮动按钮'
      : '点击后页面显示“导出外链”浮动按钮';
  }

  function pickLegacyPromptValue(values, keywords) {
    if (!values || typeof values !== 'object') return '';
    const normalizedKeywords = keywords.map((keyword) => String(keyword).toLowerCase());
    const entry = Object.entries(values).find(([key, value]) => {
      if (!value) return false;
      const normalizedKey = String(key || '').toLowerCase();
      return normalizedKeywords.some((keyword) => normalizedKey.includes(keyword));
    });
    return entry ? String(entry[1] || '').trim() : '';
  }

  function getLegacyWebsiteUrl(data) {
    return pickLegacyPromptValue(data[LEGACY_PROMPT_FIELD_VALUES_STORAGE_KEY], [
      '网站链接',
      '网址',
      'website link',
      'website url',
      'url'
    ]);
  }

  function getLegacyWebsiteContent(data) {
    return pickLegacyPromptValue(data[LEGACY_PROMPT_FIELD_VALUES_STORAGE_KEY], [
      '网站内容',
      '网站介绍',
      'website content',
      'site content',
      'description'
    ]);
  }

  function getInputValue(input) {
    return input && typeof input.value === 'string' ? input.value.trim() : '';
  }

  function mergeCurrentFormValues(data) {
    const merged = { ...(data || {}) };
    const currentValues = {
      [WEBSITE_URL_STORAGE_KEY]: getInputValue(websiteUrlInput),
      [WEBSITE_CONTENT_STORAGE_KEY]: getInputValue(websiteContentInput),
      [USER_NAME_STORAGE_KEY]: getInputValue(userNameInput),
      [USER_EMAIL_STORAGE_KEY]: getInputValue(userEmailInput),
      [USER_PASSWORD_STORAGE_KEY]: getInputValue(userPasswordInput),
      [USER_ID_STORAGE_KEY]: getInputValue(userIdInput)
    };

    ACTIVE_STORAGE_KEYS.forEach((key) => {
      if (currentValues[key] !== '') {
        merged[key] = currentValues[key];
      }
    });

    return merged;
  }

  function getImportedData(config) {
    if (!config || typeof config !== 'object') return null;
    if (config.data && typeof config.data === 'object') {
      return config.data;
    }
    return config;
  }

  function normalizeStringSetting(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function getSettingsPayloadFromInputs() {
    return {
      [WEBSITE_URL_STORAGE_KEY]: normalizeStringSetting(websiteUrlInput.value),
      [WEBSITE_CONTENT_STORAGE_KEY]: normalizeStringSetting(websiteContentInput.value),
      [USER_NAME_STORAGE_KEY]: normalizeStringSetting(userNameInput.value),
      [USER_EMAIL_STORAGE_KEY]: normalizeStringSetting(userEmailInput.value),
      [USER_PASSWORD_STORAGE_KEY]: normalizeStringSetting(userPasswordInput.value)
    };
  }

  function applySettingsToForm(data) {
    if (!data || typeof data !== 'object') return;

    if (data[WEBSITE_URL_STORAGE_KEY] !== undefined) {
      websiteUrlInput.value = normalizeStringSetting(data[WEBSITE_URL_STORAGE_KEY]);
    }
    if (data[WEBSITE_CONTENT_STORAGE_KEY] !== undefined) {
      websiteContentInput.value = normalizeStringSetting(data[WEBSITE_CONTENT_STORAGE_KEY]);
    }
    if (data[USER_NAME_STORAGE_KEY] !== undefined) {
      userNameInput.value = normalizeStringSetting(data[USER_NAME_STORAGE_KEY]);
    }
    if (data[USER_EMAIL_STORAGE_KEY] !== undefined) {
      userEmailInput.value = normalizeStringSetting(data[USER_EMAIL_STORAGE_KEY]);
    }
    if (data[USER_PASSWORD_STORAGE_KEY] !== undefined) {
      userPasswordInput.value = normalizeStringSetting(data[USER_PASSWORD_STORAGE_KEY]);
    }
    if (userIdInput && data[USER_ID_STORAGE_KEY] !== undefined) {
      userIdInput.value = normalizeStringSetting(data[USER_ID_STORAGE_KEY]);
    }
    if (data[SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY] !== undefined) {
      showExportOutlinksFloatingButton = data[SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY] !== false;
      renderExportOutlinksFloatingToggle();
    }
  }

  function buildImportPayload(importedData) {
    const toSave = {};

    IMPORT_COMPAT_STORAGE_KEYS.forEach((key) => {
      if (importedData[key] !== undefined) {
        toSave[key] = importedData[key];
      }
    });

    [
      WEBSITE_URL_STORAGE_KEY,
      WEBSITE_CONTENT_STORAGE_KEY,
      USER_NAME_STORAGE_KEY,
      USER_EMAIL_STORAGE_KEY,
      USER_PASSWORD_STORAGE_KEY,
      USER_ID_STORAGE_KEY
    ].forEach((key) => {
      if (importedData[key] !== undefined) {
        toSave[key] = normalizeStringSetting(importedData[key]);
      }
    });

    if (!toSave[WEBSITE_URL_STORAGE_KEY]) {
      const legacyWebsiteUrl = getLegacyWebsiteUrl(importedData);
      if (legacyWebsiteUrl) {
        toSave[WEBSITE_URL_STORAGE_KEY] = legacyWebsiteUrl;
      }
    }

    if (!toSave[WEBSITE_CONTENT_STORAGE_KEY]) {
      const legacyWebsiteContent = getLegacyWebsiteContent(importedData);
      if (legacyWebsiteContent) {
        toSave[WEBSITE_CONTENT_STORAGE_KEY] = legacyWebsiteContent;
      }
    }

    if (importedData[SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY] !== undefined) {
      toSave[SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY] =
        importedData[SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY] !== false;
    }

    return toSave;
  }

  function loadSettings() {
    chrome.storage.sync.get(IMPORT_COMPAT_STORAGE_KEYS, (result) => {
      if (chrome.runtime.lastError) {
        console.error('读取设置失败：', chrome.runtime.lastError);
        return;
      }

      const data = result || {};
      websiteUrlInput.value = typeof data[WEBSITE_URL_STORAGE_KEY] === 'string'
        ? data[WEBSITE_URL_STORAGE_KEY]
        : getLegacyWebsiteUrl(data);
      websiteContentInput.value = typeof data[WEBSITE_CONTENT_STORAGE_KEY] === 'string'
        ? data[WEBSITE_CONTENT_STORAGE_KEY]
        : getLegacyWebsiteContent(data);
      userNameInput.value = typeof data[USER_NAME_STORAGE_KEY] === 'string'
        ? data[USER_NAME_STORAGE_KEY]
        : '';
      userEmailInput.value = typeof data[USER_EMAIL_STORAGE_KEY] === 'string'
        ? data[USER_EMAIL_STORAGE_KEY]
        : '';
      userPasswordInput.value = typeof data[USER_PASSWORD_STORAGE_KEY] === 'string'
        ? data[USER_PASSWORD_STORAGE_KEY]
        : '';
      if (userIdInput && typeof data[USER_ID_STORAGE_KEY] === 'string') {
        userIdInput.value = data[USER_ID_STORAGE_KEY];
        if (data[USER_ID_STORAGE_KEY]) {
          fetchPointsBalance(data[USER_ID_STORAGE_KEY]);
          fetchPurchaseStatus(data[USER_ID_STORAGE_KEY]);
        }
      }
      showExportOutlinksFloatingButton = data[SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY] !== false;
      renderExportOutlinksFloatingToggle();
    });
  }

  const requiredSettingsFields = [
    { el: websiteUrlInput, label: '网站链接' },
    { el: websiteContentInput, label: '网站内容' },
    { el: userNameInput, label: '姓名/昵称' },
    { el: userEmailInput, label: '邮箱' }
  ];

  function validateRequiredSettings() {
    let firstInvalid = null;
    const missingLabels = [];

    requiredSettingsFields.forEach(({ el, label }) => {
      const isValid = el.checkValidity() && !!el.value.trim();
      el.classList.toggle('is-invalid', !isValid);
      if (!isValid) {
        missingLabels.push(label);
        if (!firstInvalid) firstInvalid = el;
      }
    });

    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalid.focus();
      showStatus(settingsStatusEl, `请先填写必填项：${missingLabels.join('、')}`, 2600);
      return false;
    }

    return true;
  }

  requiredSettingsFields.forEach(({ el }) => {
    el.addEventListener('input', () => {
      el.classList.toggle('is-invalid', !(el.checkValidity() && !!el.value.trim()));
    });
  });

  saveSettingsBtn.addEventListener('click', () => {
    if (!validateRequiredSettings()) {
      return;
    }

    chrome.storage.sync.set(
      getSettingsPayloadFromInputs(),
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

  if (savePointsBtn && userIdInput) {
    savePointsBtn.addEventListener('click', async () => {
      const userId = userIdInput.value.trim();
      let validatedPoints = null;

      if (userId) {
        try {
          validatedPoints = await validateUserIdExists(userId);
        } catch (error) {
          console.error('validate userId failed:', error);
          if (error && error.code === 'USER_NOT_FOUND') {
            alert(USER_ID_NOT_ASSIGNED_MESSAGE);
            showStatus(pointsStatusEl, USER_ID_NOT_ASSIGNED_MESSAGE, 3000);
            setPointsBalance(null);
            setPurchaseStatus(null);
            return;
          }
          alert('校验用户ID失败，请稍后重试');
          showStatus(pointsStatusEl, '校验失败', 3000);
          return;
        }
      }

      chrome.storage.sync.set({ [USER_ID_STORAGE_KEY]: userId }, () => {
        if (chrome.runtime.lastError) {
          console.error('保存用户ID失败：', chrome.runtime.lastError);
          showStatus(pointsStatusEl, '保存失败', 2000);
          return;
        }
        showStatus(pointsStatusEl, '已保存');
        if (userId) {
          setPointsBalance(validatedPoints);
          fetchPurchaseStatus(userId);
        } else {
          setPointsBalance(null);
          setPurchaseStatus(null);
        }
      });
    });
  }

  if (toggleExportOutlinksFloatingBtn) {
    renderExportOutlinksFloatingToggle();
    toggleExportOutlinksFloatingBtn.addEventListener('click', () => {
      const nextValue = !showExportOutlinksFloatingButton;
      chrome.storage.sync.set(
        { [SHOW_EXPORT_OUTLINKS_FLOATING_BUTTON_STORAGE_KEY]: nextValue },
        () => {
          if (chrome.runtime.lastError) {
            console.error('保存导出外链浮动按钮设置失败：', chrome.runtime.lastError);
            showStatus(settingsStatusEl, '保存失败', 2000);
            return;
          }
          showExportOutlinksFloatingButton = nextValue;
          renderExportOutlinksFloatingToggle();
          showStatus(settingsStatusEl, nextValue ? '已显示导出外链按钮' : '已隐藏导出外链按钮');
        }
      );
    });
  }

  function setPointsBalance(points) {
    if (pointsBalanceEl) {
      pointsBalanceEl.textContent = (points !== null && points !== undefined) ? points : '-';
    }
  }

  async function validateUserIdExists(userId) {
    const response = await fetch(`${POINTS_API_BASE}/get-points?userId=${encodeURIComponent(userId)}`);
    const data = await response.json().catch(() => ({}));
    if (response.status === 404 || data.code === 'USER_NOT_FOUND') {
      const error = new Error(USER_ID_NOT_ASSIGNED_MESSAGE);
      error.code = 'USER_NOT_FOUND';
      throw error;
    }
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to validate userId');
    }
    return data.points;
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
      } else if (data.code === 'USER_NOT_FOUND') {
        setPointsBalance(USER_ID_NOT_ASSIGNED_MESSAGE);
      } else {
        setPointsBalance('查询失败');
      }
    } catch (error) {
      console.error('查询积分失败:', error);
      setPointsBalance('网络错误');
    }
  }

  function formatPurchaseDateText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function setPurchaseStatus(data) {
    if (!purchaseStatusEl) return;

    if (!data || data.status === 'none') {
      purchaseStatusEl.textContent = '未购买';
      purchaseStatusEl.style.color = '#6b7280';
      if (purchasePlanEl) {
        purchasePlanEl.style.display = 'none';
        purchasePlanEl.textContent = '';
      }
      if (purchaseUpdatedAtEl) {
        purchaseUpdatedAtEl.style.display = 'none';
        purchaseUpdatedAtEl.textContent = '';
      }
      if (purchaseOrderNoEl) {
        purchaseOrderNoEl.style.display = 'none';
        purchaseOrderNoEl.textContent = '';
      }
      return;
    }

    purchaseStatusEl.textContent = data.statusText || data.status || '未知状态';
    purchaseStatusEl.style.color = data.status === 'fulfilled' ? '#059669' : '#1d4ed8';
    if (purchasePlanEl) {
      purchasePlanEl.style.display = 'block';
      purchasePlanEl.textContent = data.planName ? `当前文件：${data.planName}` : '';
    }
    if (purchaseOrderNoEl) {
      purchaseOrderNoEl.style.display = data.outTradeNo ? 'block' : 'none';
      purchaseOrderNoEl.textContent = data.outTradeNo ? `订单号：${data.outTradeNo}` : '';
    }
    if (purchaseUpdatedAtEl) {
      const updatedAtText = formatPurchaseDateText(data.updatedAt || data.fulfilledAt || data.paidAt || data.createdAt);
      purchaseUpdatedAtEl.style.display = updatedAtText ? 'block' : 'none';
      purchaseUpdatedAtEl.textContent = updatedAtText ? `最后更新时间：${updatedAtText}` : '';
    }
  }

  async function fetchPurchaseStatus(userId) {
    if (!userId) {
      setPurchaseStatus(null);
      return;
    }

    try {
      const response = await fetch(`${POINTS_API_BASE}/purchase-status?userId=${encodeURIComponent(userId)}`);
      const data = await response.json();
      if (data.success) {
        setPurchaseStatus(data);
      } else if (purchaseStatusEl) {
        purchaseStatusEl.textContent = '查询失败';
        purchaseStatusEl.style.color = '#dc2626';
      }
    } catch (error) {
      console.error('查询购买状态失败:', error);
      if (purchaseStatusEl) {
        purchaseStatusEl.textContent = '网络错误';
        purchaseStatusEl.style.color = '#dc2626';
      }
    }
  }

  function showImportExportStatus(text, isError) {
    if (!importExportStatus) return;
    importExportStatus.textContent = text;
    importExportStatus.style.color = isError ? '#dc2626' : '#b45309';
    importExportStatus.style.opacity = '1';
    setTimeout(() => {
      importExportStatus.style.opacity = '0';
    }, 3000);
  }

  if (exportConfigBtn) {
    exportConfigBtn.addEventListener('click', () => {
      chrome.storage.sync.get(ACTIVE_STORAGE_KEYS, (result) => {
        if (chrome.runtime.lastError) {
          showImportExportStatus('导出失败：' + chrome.runtime.lastError.message, true);
          return;
        }

        const mergedData = mergeCurrentFormValues(result);
        const config = {
          _version: CONFIG_VERSION,
          _exportTime: new Date().toISOString(),
          data: {}
        };

        ACTIVE_STORAGE_KEYS.forEach((key) => {
          if (mergedData[key] !== undefined) {
            config.data[key] = mergedData[key];
          }
        });

        if (!config.data[WEBSITE_CONTENT_STORAGE_KEY]) {
          showImportExportStatus('导出失败：请先填写你的网站内容。', true);
          return;
        }

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'autocomment-config-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showImportExportStatus('配置已导出！', false);
      });
    });
  }

  if (importConfigBtn && importConfigFileInput) {
    importConfigBtn.addEventListener('click', () => {
      importConfigFileInput.click();
    });

    importConfigFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const config = JSON.parse(ev.target.result);
          const importedData = getImportedData(config);
          if (!importedData) {
            showImportExportStatus('文件格式无效，不是有效的配置文件。', true);
            return;
          }

          const toSave = buildImportPayload(importedData);
          applySettingsToForm(toSave);
          if (!validateRequiredSettings()) {
            showImportExportStatus('导入失败：配置缺少网站链接、网站内容、姓名或邮箱。', true);
            return;
          }

          chrome.storage.sync.set(toSave, () => {
            if (chrome.runtime.lastError) {
              showImportExportStatus('导入失败：' + chrome.runtime.lastError.message, true);
              return;
            }
            showStatus(settingsStatusEl, '已保存');
            showImportExportStatus('配置已导入并保存！页面将自动刷新...', false);
            setTimeout(() => {
              location.reload();
            }, 1500);
          });
        } catch (err) {
          showImportExportStatus('解析文件失败：' + err.message, true);
        }
      };
      reader.readAsText(file);
      importConfigFileInput.value = '';
    });
  }

  if (openBatchBtn) {
    openBatchBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'batch.html' });
    });
  }

  if (openPaymentBtn) {
    openPaymentBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'payment.html' });
    });
  }

  loadSettings();
});
