// 选项页逻辑：保存和读取 DashScope / 通义千问 API Key & Skill 模板

const API_KEY_STORAGE_KEY = 'dashscope_api_key';
const SKILL_TEMPLATE_STORAGE_KEY = 'qwen_skill_template';
const WEBSITE_URL_STORAGE_KEY = 'promotion_website_url';
const AUTO_OPEN_QWEN_PANEL_KEY = 'auto_open_qwen_panel';
const USER_NAME_STORAGE_KEY = 'auto_fill_user_name';
const USER_EMAIL_STORAGE_KEY = 'auto_fill_user_email';
const USER_PASSWORD_STORAGE_KEY = 'auto_fill_user_password';
const AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY = 'auto_generate_qwen_on_page_load';

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const skillTemplateInput = document.getElementById('skillTemplate');
  const websiteUrlInput = document.getElementById('websiteUrl');
  const autoOpenPanelCheckbox = document.getElementById('autoOpenPanel');
  const autoGenerateOnLoadCheckbox = document.getElementById('autoGenerateOnLoad');
  const userNameInput = document.getElementById('userName');
  const userEmailInput = document.getElementById('userEmail');
  const userPasswordInput = document.getElementById('userPassword');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusEl = document.getElementById('status');

  if (
    !apiKeyInput ||
    !skillTemplateInput ||
    !websiteUrlInput ||
    !autoOpenPanelCheckbox ||
    !autoGenerateOnLoadCheckbox ||
    !userNameInput ||
    !userEmailInput ||
    !userPasswordInput ||
    !saveBtn ||
    !clearBtn ||
    !statusEl
  ) {
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
  chrome.storage.sync.get(
    [
      API_KEY_STORAGE_KEY,
      SKILL_TEMPLATE_STORAGE_KEY,
      WEBSITE_URL_STORAGE_KEY,
      AUTO_OPEN_QWEN_PANEL_KEY,
      USER_NAME_STORAGE_KEY,
      USER_EMAIL_STORAGE_KEY,
      USER_PASSWORD_STORAGE_KEY
    ],
    (result) => {
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
      if (result && typeof result[WEBSITE_URL_STORAGE_KEY] === 'string') {
        websiteUrlInput.value = result[WEBSITE_URL_STORAGE_KEY];
      }
      if (result && typeof result[AUTO_OPEN_QWEN_PANEL_KEY] === 'boolean') {
        autoOpenPanelCheckbox.checked = result[AUTO_OPEN_QWEN_PANEL_KEY];
      } else {
        // 默认开启自动打开浮动窗口
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
    }
  );

  // 设置：是否在页面加载时自动调用通义千问生成推广文案
  // 使用 chrome.storage.sync 存储，便于内容脚本直接读取
  (function initSessionAutoGenerateSetting() {
    if (!chrome.storage || !chrome.storage.sync) {
      // 在不支持 storage 的环境下，保持开关默认关闭
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
        // 默认关闭
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
    const key = apiKeyInput.value.trim();
    const skillTemplate = skillTemplateInput.value.trim();
    const websiteUrl = websiteUrlInput.value.trim();
    const autoOpenPanel = !!autoOpenPanelCheckbox.checked;
    const autoGenerateOnLoad = !!autoGenerateOnLoadCheckbox.checked;
    const userName = userNameInput.value.trim();
    const userEmail = userEmailInput.value.trim();
  const userPassword = userPasswordInput.value.trim();

    chrome.storage.sync.set(
      {
        [API_KEY_STORAGE_KEY]: key,
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

  // ====== 积分充值功能 ======
  const USER_ID_KEY = 'auto_comment_user_id';
  const POINTS_API_BASE = 'https://your-project.vercel.app/api';

  // 生成或获取用户ID
  function getUserId() {
    return new Promise((resolve) => {
      chrome.storage.local.get([USER_ID_KEY], (result) => {
        if (result && result[USER_ID_KEY]) {
          resolve(result[USER_ID_KEY]);
        } else {
          const newUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          chrome.storage.local.set({ [USER_ID_KEY]: newUserId }, () => {
            resolve(newUserId);
          });
        }
      });
    });
  }

  // 查询积分余额
  async function fetchPointsBalance() {
    const userId = await getUserId();
    try {
      const response = await fetch(`${POINTS_API_BASE}/get-points?userId=${encodeURIComponent(userId)}`);
      const data = await response.json();
      if (data.success) {
        document.getElementById('pointsBalance').textContent = `${data.points} 积分`;
        return data.points;
      }
    } catch (error) {
      console.error('查询积分失败:', error);
    }
    document.getElementById('pointsBalance').textContent = '0 积分';
    return 0;
  }

  // 创建订单
  async function createRechargeOrder(points, amount) {
    const userId = await getUserId();
    try {
      const response = await fetch(`${POINTS_API_BASE}/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, points, amount })
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('创建订单失败:', error);
      return { error: '创建订单失败' };
    }
  }

  // 检查订单支付状态
  async function checkOrderPayment(orderId) {
    const userId = await getUserId();
    try {
      const response = await fetch(`${POINTS_API_BASE}/check-order?orderId=${encodeURIComponent(orderId)}&userId=${encodeURIComponent(userId)}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('检查订单失败:', error);
      return { success: false };
    }
  }

  // 充值套餐价格映射
  const PACKAGE_PRICES = {
    '10': 10,
    '30': 25,
    '100': 70
  };

  // 初始化积分余额显示
  fetchPointsBalance();

  // 充值按钮
  const rechargeBtn = document.getElementById('rechargeBtn');
  const rechargeModal = document.getElementById('rechargeModal');
  const paymentModal = document.getElementById('paymentModal');
  const confirmRechargeBtn = document.getElementById('confirmRechargeBtn');
  const cancelRechargeBtn = document.getElementById('cancelRechargeBtn');
  const closePaymentBtn = document.getElementById('closePaymentBtn');
  const qrCodeContainer = document.getElementById('qrCodeContainer');
  const paymentStatus = document.getElementById('paymentStatus');

  if (rechargeBtn && rechargeModal) {
    rechargeBtn.addEventListener('click', () => {
      rechargeModal.style.display = 'flex';
    });

    cancelRechargeBtn.addEventListener('click', () => {
      rechargeModal.style.display = 'none';
    });

    confirmRechargeBtn.addEventListener('click', async () => {
      const selectedPackage = document.querySelector('input[name="rechargePackage"]:checked');
      if (!selectedPackage) {
        alert('请选择充值套餐');
        return;
      }

      const points = parseInt(selectedPackage.value);
      const amount = PACKAGE_PRICES[selectedPackage.value];

      rechargeModal.style.display = 'none';
      paymentModal.style.display = 'flex';
      paymentStatus.textContent = '正在创建订单...';
      qrCodeContainer.innerHTML = '';

      const orderData = await createRechargeOrder(points, amount);

      if (orderData.error) {
        paymentStatus.textContent = '创建订单失败: ' + orderData.error;
        return;
      }

      if (orderData.payUrl) {
        // 生成二维码
        try {
          await QRCode.toCanvas(qrCodeContainer.appendChild(document.createElement('canvas')), orderData.payUrl, {
            width: 200,
            margin: 2
          });
          paymentStatus.textContent = '请使用支付宝扫码支付';

          // 轮询检查支付状态
          const checkPayment = async () => {
            const result = await checkOrderPayment(orderData.orderId);
            if (result.success && result.paid) {
              paymentStatus.textContent = '支付成功！';
              paymentStatus.style.color = '#22c55e';
              setTimeout(() => {
                paymentModal.style.display = 'none';
                fetchPointsBalance();
              }, 1500);
            } else if (result.success === false && result.error === '订单不存在') {
              paymentStatus.textContent = '订单已取消';
              setTimeout(() => {
                paymentModal.style.display = 'none';
              }, 1500);
            } else {
              // 继续轮询（最多60秒）
              setTimeout(checkPayment, 2000);
            }
          };

          // 启动轮询
          setTimeout(checkPayment, 2000);
        } catch (error) {
          console.error('生成二维码失败:', error);
          paymentStatus.textContent = '生成支付码失败';
        }
      }
    });

    closePaymentBtn.addEventListener('click', () => {
      paymentModal.style.display = 'none';
    });
  }
});

