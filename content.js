(function () {
  // ====== 原有自动填表功能 ======
  // 默认值设为空，用户需要在扩展选项中配置
  const DEFAULT_EMAIL = '';
  const DEFAULT_PASSWORD = '';
  const DEFAULT_USERNAME = '';

  async function fillInputs() {
    const WEBSITE = await getWebsiteUrl();
    const userProfile = await getUserProfile();
    const EMAIL = userProfile.email;
    const USERNAME = userProfile.name;
    const PASSWORD = userProfile.password;
    const allInputs = Array.from(document.querySelectorAll('input'));
    const allTextareas = Array.from(document.querySelectorAll('textarea'));

    // 填邮箱（全局优先填第一个看起来像 Email 的输入框）
    const emailCandidates = allInputs.filter((input) => {
      const type = (input.type || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();

      if (type === 'hidden') return false;

      if (type === 'email') return true;

      const keywords = ['email', 'e-mail', 'mail'];
      return keywords.some((k) => name.includes(k) || id.includes(k) || placeholder.includes(k));
    });

    if (emailCandidates.length > 0) {
      const emailInput = emailCandidates[0];
      setValue(emailInput, EMAIL);
    }

    // 填用户名（尽量匹配"用户名 / 账号 / 昵称 / login / username"等字段）
    const usernameCandidates = allInputs.filter((input) => {
      const type = (input.type || '').toLowerCase();
      if (type === 'email' || type === 'password' || type === 'checkbox' || type === 'radio') {
        return false;
      }

      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const text = `${name} ${id} ${placeholder}`;

      const keywords = [
        'user',
        'username',
        'account',
        'login',
        'nick',
        'nickname',
        'handle',
        '用户名',
        '账号',
        '帐户',
        '登录名',
        '昵称'
      ];

      return keywords.some((k) => text.includes(k));
    });

    if (usernameCandidates.length > 0) {
      const usernameInput = usernameCandidates[0];
      setValue(usernameInput, USERNAME);
    }

    // 填密码（通常有两个：密码和确认密码）
    const passwordInputs = allInputs.filter(
      (input) => (input.type || '').toLowerCase() === 'password'
    );

    if (passwordInputs.length > 0) {
      passwordInputs.forEach((input) => {
        setValue(input, PASSWORD);
      });
    }

    // ====== 针对"评论表单"的增强逻辑：自动填 Name / Email / Website ======
    const commentForms = new Set();
    allTextareas.forEach((ta) => {
      const name = (ta.name || '').toLowerCase();
      const id = (ta.id || '').toLowerCase();
      const placeholder = (ta.placeholder || '').toLowerCase();
      const text = `${name} ${id} ${placeholder}`;
      const keywords = [
        'comment',
        'comentario',
        'reply',
        'respuesta',
        'message',
        'mensaje',
        'review',
        'reseña',
        'feedback',
        'opinion',
        'opinión',
        'commenttext',
        '留言',
        '评论',
        '回复'
      ];
      if (keywords.some((k) => text.includes(k))) {
        const form = ta.form || (ta.closest && ta.closest('form'));
        if (form) {
          commentForms.add(form);
        }
      }
    });

    if (commentForms.size === 0) {
      const forms = Array.from(document.querySelectorAll('form'));
      forms.forEach((form) => {
        const text = (form.textContent || '').toLowerCase();
        const className = (form.className || '').toLowerCase();
        const id = (form.id || '').toLowerCase();

        const keywords = [
          'deja una respuesta',
          'deja un comentario',
          'tu dirección de correo electrónico no será publicada',
          'comentario *',
          'leave a reply',
          'leave a comment',
          'post comment',
          'submit comment',
          'reply',
          'respond',
          '评论',
          '留言',
          '回复'
        ];

        const wpClassNames = ['comment-form', 'commentform', 'respond', 'comment-respond'];

        if (keywords.some((k) => text.includes(k)) ||
            wpClassNames.some(c => className.includes(c) || id.includes(c))) {
          commentForms.add(form);
        }
      });
    }

    if (commentForms.size === 0) {
      const commentAreas = document.querySelectorAll('#comments, .comments, .comment-section, #respond, .respond, .reply');
      commentAreas.forEach(area => {
        const form = area.closest('form');
        if (form) {
          commentForms.add(form);
        }
      });
    }

    if (commentForms.size > 0) {
      commentForms.forEach((form) => {
        const formInputs = Array.from(form.querySelectorAll('input'));

        const nameInput = formInputs.find((input) => {
          const type = (input.type || '').toLowerCase();
          if (type === 'email' || type === 'password' || type === 'checkbox' || type === 'radio') {
            return false;
          }
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          const placeholder = (input.placeholder || '').toLowerCase();
          const text = `${name} ${id} ${placeholder}`;
          const keywords = [
            'name',
            'your-name',
            'author',
            'nickname',
            'nick',
            'fullname',
            'full-name',
            'display-name',
            'contact',
            '联系人',
            '姓名',
            '名字',
            '称呼',
            'nombre'
          ];
          return keywords.some((k) => text.includes(k));
        });
        if (nameInput) {
          setValue(nameInput, USERNAME);
        }

        const emailInputInForm = formInputs.find((input) => {
          const type = (input.type || '').toLowerCase();
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          const placeholder = (input.placeholder || '').toLowerCase();

          if (type === 'hidden' || type === 'password' || type === 'checkbox' || type === 'radio') {
            return false;
          }

          if (type === 'email') return true;

          const text = `${name} ${id} ${placeholder}`;
          const keywords = ['email', 'e-mail', 'mail'];
          return keywords.some((k) => text.includes(k));
        });
        if (emailInputInForm) {
          setValue(emailInputInForm, EMAIL);
        }

        const websiteInput = formInputs.find((input) => {
          const type = (input.type || '').toLowerCase();
          if (type === 'email' || type === 'password' || type === 'checkbox' || type === 'radio') {
            return false;
          }
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          const placeholder = (input.placeholder || '').toLowerCase();
          const text = `${name} ${id} ${placeholder}`;
          const keywords = [
            'website',
            'site',
            'homepage',
            'home-page',
            'blog',
            'url',
            'link',
            'web',
            '网站',
            '网址',
            '站点'
          ];
          return keywords.some((k) => text.includes(k));
        });
        if (websiteInput && WEBSITE) {
          setValue(websiteInput, WEBSITE);
        }
      });
    }
  }

  function setValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      'value'
    );
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ====== 通义千问后端配置 ======
  const QWEN_API_BASE = 'https://101.37.116.48/api';
  const SKILL_TEMPLATE_STORAGE_KEY = 'qwen_skill_template';
  const WEBSITE_URL_STORAGE_KEY = 'promotion_website_url';
  const AUTO_OPEN_QWEN_PANEL_KEY = 'auto_open_qwen_panel';
  const AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY = 'auto_generate_qwen_on_page_load';
  const USER_NAME_STORAGE_KEY = 'auto_fill_user_name';
  const USER_EMAIL_STORAGE_KEY = 'auto_fill_user_email';
  const USER_PASSWORD_STORAGE_KEY = 'auto_fill_user_password';
  const USER_ID_STORAGE_KEY = 'auto_comment_user_id';

  // ====== 积分系统配置 ======
  const POINTS_API_BASE = 'https://101.37.116.48/api';
  const POINTS_COST_PER_GENERATION = 1;

  // ====== 防重复生成配置 ======
  const DOMAIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const GENERATION_RECORD_KEY = 'qwen_generation_records';
  const SUBMIT_COOLDOWN_MS = 5 * 60 * 1000;
  const SUBMIT_COOLDOWN_KEY = 'qwen_submit_cooldown';

  // 从URL中提取域名（用于冷却判断）
  function extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      const match = url.match(/^https?:\/\/([^/]+)/);
      return match ? match[1] : url;
    }
  }

  function getCurrentDomain() {
    return extractDomain(window.location.href);
  }

  // ====== 积分系统函数 ======

  // 从 chrome.storage.sync 读取用户ID（由管理员线下分配）
  function getUserId() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve('');
        return;
      }
      chrome.storage.sync.get([USER_ID_STORAGE_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('读取用户ID失败：', chrome.runtime.lastError);
          resolve('');
          return;
        }
        const userId = result && typeof result[USER_ID_STORAGE_KEY] === 'string'
          ? result[USER_ID_STORAGE_KEY].trim()
          : '';
        resolve(userId);
      });
    });
  }

  // 查询积分余额
  async function getPointsBalance() {
    const userId = await getUserId();
    if (!userId) {
      return 0;
    }
    try {
      const response = await fetch(`${POINTS_API_BASE}/get-points?userId=${encodeURIComponent(userId)}`);
      const data = await response.json();
      return data.success ? data.points : 0;
    } catch (e) {
      console.error('查询积分失败:', e);
      return 0;
    }
  }

  // 扣减积分
  async function deductPoints(points) {
    const userId = await getUserId();
    if (!userId) {
      return { success: false, error: '用户ID未配置，请在选项页面填写用户ID' };
    }
    try {
      const response = await fetch(`${POINTS_API_BASE}/deduct-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, points })
      });
      const data = await response.json();
      return data;
    } catch (e) {
      console.error('扣减积分失败:', e);
      return { success: false, error: e.message };
    }
  }

  // 最近一次通义千问生成的推广文案（用于页面自动填充 & 浮动窗口回显）
  let lastGeneratedPromotionCopy = '';

  // 默认 Skill 语言模板（当 storage 中没有用户自定义模板时使用）
  const DEFAULT_QWEN_SKILL_TEMPLATE = [
    '你是一个资深的网站营销与文案专家，擅长为各类网站撰写高转化率的推广文案。',
    '请严格根据我提供的"当前网站内容"进行分析和创作，不要凭空捏造网站不存在的功能或信息。',
    '',
    '【输出要求】',
    '1. 先用 1–2 句话高度概括该网站的核心价值和目标用户。',
    '2. 我需要在该网站发表评论，关联到我的网站并吸引用户点击访问我的网站。',
    '3. 语气可以专业但要自然、真实，避免夸张、虚假宣传。',
    '4. 使用英文输出，字数建议控制在 100-200词。'
  ].join('\n');

  // 从 chrome.storage.sync 中异步获取 Skill 模板
  function getQwenSkillTemplate() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve(DEFAULT_QWEN_SKILL_TEMPLATE);
        return;
      }
      chrome.storage.sync.get([SKILL_TEMPLATE_STORAGE_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('读取 Skill 模板失败：', chrome.runtime.lastError);
          resolve(DEFAULT_QWEN_SKILL_TEMPLATE);
          return;
        }
        const tpl =
          result && typeof result[SKILL_TEMPLATE_STORAGE_KEY] === 'string'
            ? result[SKILL_TEMPLATE_STORAGE_KEY].trim()
            : '';
        if (!tpl) {
          resolve(DEFAULT_QWEN_SKILL_TEMPLATE);
        } else {
          resolve(tpl);
        }
      });
    });
  }

  // 从 chrome.storage.sync 中异步获取推广网站地址
  function getWebsiteUrl() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve('');
        return;
      }
      chrome.storage.sync.get([WEBSITE_URL_STORAGE_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('读取推广网站地址失败：', chrome.runtime.lastError);
          resolve('');
          return;
        }
        const url =
          result && typeof result[WEBSITE_URL_STORAGE_KEY] === 'string'
            ? result[WEBSITE_URL_STORAGE_KEY].trim()
            : '';
        resolve(url);
      });
    });
  }

  // 从 chrome.storage.sync 中异步获取用户的姓名 / 邮箱 / 密码
  function getUserProfile() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve({ name: DEFAULT_USERNAME, email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD });
        return;
      }
      chrome.storage.sync.get(
        [USER_NAME_STORAGE_KEY, USER_EMAIL_STORAGE_KEY, USER_PASSWORD_STORAGE_KEY],
        (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.error('读取用户姓名/邮箱/密码失败：', chrome.runtime.lastError);
            resolve({ name: DEFAULT_USERNAME, email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD });
            return;
          }
          let name = result && typeof result[USER_NAME_STORAGE_KEY] === 'string'
            ? result[USER_NAME_STORAGE_KEY].trim() : '';
          let email = result && typeof result[USER_EMAIL_STORAGE_KEY] === 'string'
            ? result[USER_EMAIL_STORAGE_KEY].trim() : '';
          let password = result && typeof result[USER_PASSWORD_STORAGE_KEY] === 'string'
            ? result[USER_PASSWORD_STORAGE_KEY].trim() : '';

          if (!name) name = DEFAULT_USERNAME;
          if (!email) email = DEFAULT_EMAIL;
          if (!password) password = DEFAULT_PASSWORD;

          resolve({ name, email, password });
        }
      );
    });
  }

  // 从 chrome.storage.sync 中获取"是否自动打开浮动窗口"的设置
  function getAutoOpenQwenPanelSetting() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve(true);
        return;
      }
      chrome.storage.sync.get([AUTO_OPEN_QWEN_PANEL_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(true);
          return;
        }
        if (!result || typeof result[AUTO_OPEN_QWEN_PANEL_KEY] === 'undefined') {
          resolve(true);
          return;
        }
        resolve(Boolean(result[AUTO_OPEN_QWEN_PANEL_KEY]));
      });
    });
  }

  // 从 chrome.storage 中获取"是否在页面加载时自动调用通义千问"的设置
  function getAutoGenerateQwenOnPageLoadSetting() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve(false);
        return;
      }

      let storageArea = null;
      try {
        if (chrome.storage.sync && typeof chrome.storage.sync.get === 'function') {
          storageArea = chrome.storage.sync;
        } else if (chrome.storage.session && typeof chrome.storage.session.get === 'function') {
          storageArea = chrome.storage.session;
        }
      } catch (_e) {
        resolve(false);
        return;
      }

      if (!storageArea) {
        resolve(false);
        return;
      }

      try {
        storageArea.get([AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY], (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(false);
            return;
          }
          if (!result || typeof result[AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY] === 'undefined') {
            resolve(false);
            return;
          }
          resolve(Boolean(result[AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY]));
        });
      } catch (_e) {
        resolve(false);
      }
    });
  }

  // 检查当前域名是否在冷却时间内
  function isUrlInCooldown() {
    return new Promise((resolve) => {
      const currentDomain = getCurrentDomain();

      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve(false);
        return;
      }

      let storageArea = null;
      try {
        if (chrome.storage.local && typeof chrome.storage.local.get === 'function') {
          storageArea = chrome.storage.local;
        }
      } catch (_e) {
        resolve(false);
        return;
      }

      if (!storageArea) {
        resolve(false);
        return;
      }

      storageArea.get([GENERATION_RECORD_KEY, SUBMIT_COOLDOWN_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(false);
          return;
        }

        const records = result && result[GENERATION_RECORD_KEY];
        const submitCooldown = result && result[SUBMIT_COOLDOWN_KEY];

        if (submitCooldown && submitCooldown.domain === currentDomain) {
          const submitTime = submitCooldown.timestamp || 0;
          const timeSinceSubmit = Date.now() - submitTime;
          if (timeSinceSubmit < SUBMIT_COOLDOWN_MS) {
            resolve(true);
            return;
          }
        }

        if (records && records[currentDomain] && records[currentDomain].timestamp) {
          const lastGenTime = records[currentDomain].timestamp;
          const timeSinceGen = Date.now() - lastGenTime;
          if (timeSinceGen < DOMAIN_COOLDOWN_MS) {
            resolve(true);
            return;
          }
        }

        resolve(false);
      });
    });
  }

  // 记录当前域名的生成时间戳和内容
  function recordGenerationTime(content) {
    return new Promise((resolve) => {
      const currentDomain = getCurrentDomain();

      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }

      chrome.storage.local.get([GENERATION_RECORD_KEY], (result) => {
        const records = result && result[GENERATION_RECORD_KEY] || {};
        records[currentDomain] = {
          timestamp: Date.now(),
          content: content || ''
        };

        // 清理过期的记录（只保留7天内的）
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const domain in records) {
          if (records[domain] && records[domain].timestamp < sevenDaysAgo) {
            delete records[domain];
          }
        }

        chrome.storage.local.set({ [GENERATION_RECORD_KEY]: records }, () => {
          resolve();
        });
      });
    });
  }

  // 记录表单提交事件
  function recordFormSubmit() {
    return new Promise((resolve) => {
      const currentDomain = getCurrentDomain();

      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }

      chrome.storage.local.set({
        [SUBMIT_COOLDOWN_KEY]: {
          domain: currentDomain,
          timestamp: Date.now()
        }
      }, () => {
        resolve();
      });
    });
  }

  // 获取缓存的推广文案
  function getCachedPromotionCopy() {
    return new Promise((resolve) => {
      const currentDomain = getCurrentDomain();

      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve('');
        return;
      }

      chrome.storage.local.get([GENERATION_RECORD_KEY], (result) => {
        const records = result && result[GENERATION_RECORD_KEY];
        if (records && records[currentDomain] && records[currentDomain].content) {
          resolve(records[currentDomain].content);
        } else {
          resolve('');
        }
      });
    });
  }

  // 监听表单提交事件
  function setupFormSubmitListener() {
    document.addEventListener('submit', (event) => {
      const form = event.target;
      const isCommentForm = form && (
        form.id?.toLowerCase().includes('comment') ||
        form.className?.toLowerCase().includes('comment') ||
        form.method?.toLowerCase() === 'post'
      );

      if (isCommentForm) {
        setTimeout(() => {
          recordFormSubmit();
        }, 1500);
      }
    }, { capture: true });
  }

  // 在页面打开时自动调用一次通义千问
  let autoGeneratedOnce = false;

  async function autoGeneratePromotionOnPageLoad() {
    if (autoGeneratedOnce) {
      return;
    }

    const inCooldown = await isUrlInCooldown();

    if (inCooldown) {
      const cachedCopy = await getCachedPromotionCopy();
      if (cachedCopy) {
        lastGeneratedPromotionCopy = cachedCopy;
        tryFillCommentTextareaWithPromotion(cachedCopy);
        focusCommentTextareaWithPromotion(cachedCopy);
      }
      return;
    }

    const hasCommentBox = !!findLikelyCommentTextarea({ allowGenericFallback: false });
    if (!hasCommentBox) {
      return;
    }

    autoGeneratedOnce = true;

    if (
      qwenPanelEl &&
      typeof qwenPanelEl._qwenSetGenerateLoading === 'function' &&
      typeof qwenPanelEl._qwenSetStatus === 'function'
    ) {
      qwenPanelEl._qwenSetStatus('正在自动生成推广文案，请稍候…', '#9ca3af');
      qwenPanelEl._qwenSetGenerateLoading(true);
    }

    try {
      const text = await generatePromotionCopyWithQwen();
      if (!text) return;

      lastGeneratedPromotionCopy = text;
      await recordGenerationTime(text);

      tryFillCommentTextareaWithPromotion(text);
      focusCommentTextareaWithPromotion(text);

      if (
        qwenPanelEl &&
        qwenPanelEl._qwenTextarea &&
        typeof qwenPanelEl._qwenSetCopyEnabled === 'function'
      ) {
        qwenPanelEl._qwenTextarea.value = text;
        qwenPanelEl._qwenSetCopyEnabled(true);
        if (typeof qwenPanelEl._qwenSetStatus === 'function') {
          qwenPanelEl._qwenSetStatus('已自动生成推广文案，可以复制使用。', '#22c55e');
        }
      }
    } catch (err) {
      if (
        qwenPanelEl &&
        typeof qwenPanelEl._qwenSetGenerateLoading === 'function' &&
        typeof qwenPanelEl._qwenSetStatus === 'function'
      ) {
        qwenPanelEl._qwenSetStatus('自动生成推广文案失败，请稍后重试。', '#f97373');
      }
    } finally {
      if (qwenPanelEl && typeof qwenPanelEl._qwenSetGenerateLoading === 'function') {
        qwenPanelEl._qwenSetGenerateLoading(false);
      }
    }
  }

  function initOnPageReady() {
    fillInputs();
    setupFormSubmitListener();

    getAutoOpenQwenPanelSetting().then((shouldOpen) => {
      if (shouldOpen) {
        createOrToggleQwenPanel();
      }
    });

    getAutoGenerateQwenOnPageLoadSetting().then((shouldAutoGenerate) => {
      if (shouldAutoGenerate) {
        autoGeneratePromotionOnPageLoad();
      }
    });

    observeDynamicElements();
  }

  let hasNotifiedCommentBox = false;
  let hasCheckedInitialCommentBox = false;

  function observeDynamicElements() {
    setTimeout(() => {
      if (!hasCheckedInitialCommentBox) {
        hasCheckedInitialCommentBox = true;
        const hasCommentBox = !!findLikelyCommentTextarea({ allowGenericFallback: false });
        if (hasCommentBox && !hasNotifiedCommentBox) {
          hasNotifiedCommentBox = true;
          getAutoGenerateQwenOnPageLoadSetting().then((shouldAutoGenerate) => {
            if (shouldAutoGenerate && !autoGeneratedOnce) {
              autoGeneratePromotionOnPageLoad();
            }
          });
        }
      }
    }, 1000);

    const observer = new MutationObserver((mutations) => {
      const newTextareas = document.querySelectorAll('textarea');
      if (newTextareas.length > 0 && !hasNotifiedCommentBox) {
        const hasCommentBox = !!findLikelyCommentTextarea({ allowGenericFallback: false });
        if (hasCommentBox) {
          hasNotifiedCommentBox = true;
          getAutoGenerateQwenOnPageLoadSetting().then((shouldAutoGenerate) => {
            if (shouldAutoGenerate && !autoGeneratedOnce) {
              autoGeneratePromotionOnPageLoad();
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnPageReady);
  } else {
    initOnPageReady();
  }

  function findLikelyCommentTextarea(options) {
    const allowGenericFallback = options && options.allowGenericFallback;
    const allTextareas = Array.from(document.querySelectorAll('textarea'));
    if (allTextareas.length === 0) return null;

    const commentTextareas = [];
    const commentForms = new Set();

    allTextareas.forEach((ta) => {
      const name = (ta.name || '').toLowerCase();
      const id = (ta.id || '').toLowerCase();
      const placeholder = (ta.placeholder || '').toLowerCase();
      const text = `${name} ${id} ${placeholder}`;

      const keywords = [
        'comment',
        'comentario',
        'reply',
        'respuesta',
        'message',
        'mensaje',
        'review',
        'reseña',
        'feedback',
        'opinion',
        'opinión',
        'commenttext',
        '留言',
        '评论',
        '回复'
      ];
      if (keywords.some((k) => text.includes(k))) {
        commentTextareas.push(ta);
        const form = ta.form || (ta.closest && ta.closest('form'));
        if (form) {
          commentForms.add(form);
        }
      }
    });

    if (commentForms.size === 0) {
      const forms = Array.from(document.querySelectorAll('form'));
      forms.forEach((form) => {
        const text = (form.textContent || '').toLowerCase();
        const keywords = [
          'deja una respuesta',
          'deja un comentario',
          'tu dirección de correo electrónico no será publicada',
          'comentario *',
          'leave a reply',
          'leave a comment'
        ];
        if (keywords.some((k) => text.includes(k))) {
          commentForms.add(form);
        }
      });
    }

    let targetTextarea = null;

    if (commentTextareas.length > 0) {
      targetTextarea = commentTextareas[0];
    } else if (commentForms.size > 0) {
      for (const form of commentForms) {
        const formTextareas = Array.from(form.querySelectorAll('textarea'));
        if (formTextareas.length > 0) {
          targetTextarea = formTextareas[0];
          break;
        }
      }
    }

    if (!targetTextarea && allowGenericFallback) {
      targetTextarea = allTextareas[0];
    }

    return targetTextarea || null;
  }

  function tryFillCommentTextareaWithPromotion(promotionText) {
    if (!promotionText) return;

    const targetTextarea = findLikelyCommentTextarea({ allowGenericFallback: true });
    if (!targetTextarea) return;

    if ((targetTextarea.value || '').trim()) {
      return;
    }

    setValue(targetTextarea, promotionText);
  }

  function focusCommentTextareaWithPromotion(promotionText) {
    const targetTextarea = findLikelyCommentTextarea({ allowGenericFallback: true });
    if (!targetTextarea) return;

    const current = (targetTextarea.value || '').trim();
    if (!current && promotionText) {
      setValue(targetTextarea, promotionText);
    }

    try {
      targetTextarea.focus();
      const len = targetTextarea.value.length;
      if (typeof targetTextarea.setSelectionRange === 'function') {
        targetTextarea.setSelectionRange(len, len);
      }
      if (typeof targetTextarea.scrollIntoView === 'function') {
        targetTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {
      // 忽略异常
    }
  }

  // 收集当前页面内容 + 调用后端生成推广文案
  async function generatePromotionCopyWithQwen() {
    const QWEN_SKILL_TEMPLATE = await getQwenSkillTemplate();

    // 检查用户ID是否配置
    const userId = await getUserId();
    if (!userId) {
      throw new Error(
        '尚未配置用户 ID，请在扩展选项页面填写由管理员分配的用户 ID。'
      );
    }

    // 扣减积分（在后端一并完成，此处仅做友好提示）
    const currentPoints = await getPointsBalance();
    if (currentPoints < POINTS_COST_PER_GENERATION) {
      throw new Error(
        `积分不足！当前积分: ${currentPoints}，生成一次需要 ${POINTS_COST_PER_GENERATION} 积分。请联系管理员充值。`
      );
    }

    const websiteUrl = window.location.href || '';
    const title = document.title || '';
    const descriptionMeta =
      document.querySelector('meta[name="description"]') ||
      document.querySelector('meta[name="Description"]');
    const description = descriptionMeta ? descriptionMeta.content || '' : '';

    let bodyText = '';
    if (document.body) {
      bodyText = document.body.innerText || '';
      bodyText = bodyText.replace(/\s+/g, ' ').trim();
      const MAX_LEN = 4000;
      if (bodyText.length > MAX_LEN) {
        bodyText = bodyText.slice(0, MAX_LEN) + ' …（内容已截断）';
      }
    }

    const response = await fetch(`${QWEN_API_BASE}/generate-copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        websiteUrl,
        title,
        description,
        bodyText,
        skillTemplate: QWEN_SKILL_TEMPLATE
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      const msg = data && data.error
        ? `生成失败: ${data.error}`
        : '后端返回异常，请稍后重试。';
      throw new Error(msg);
    }

    const aiText = data.text || '未能从响应中解析出文案内容。';

    console.log('通义千问生成的网站推广文案：\n', aiText);
    return aiText;
  }

  // ====== 页面内浮动窗口 UI ======
  let qwenPanelEl = null;

  function createOrToggleQwenPanel() {
    if (qwenPanelEl && qwenPanelEl.parentNode) {
      qwenPanelEl.parentNode.removeChild(qwenPanelEl);
      qwenPanelEl = null;
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'auto-register-qwen-panel';
    panel.style.position = 'fixed';
    panel.style.right = '24px';
    panel.style.bottom = '24px';
    panel.style.width = '360px';
    panel.style.maxWidth = '80vw';
    panel.style.maxHeight = '60vh';
    panel.style.zIndex = '2147483647';
    panel.style.background = 'rgba(15,23,42,0.97)';
    panel.style.color = '#e5e7eb';
    panel.style.borderRadius = '12px';
    panel.style.boxShadow = '0 18px 45px rgba(15,23,42,0.55)';
    panel.style.backdropFilter = 'blur(14px)';
    panel.style.fontFamily =
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Open Sans','Helvetica Neue',sans-serif";
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.overflow = 'hidden';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '10px 14px';
    header.style.borderBottom = '1px solid rgba(148,163,184,0.25)';
    header.style.fontSize = '13px';
    header.style.fontWeight = '600';
    header.textContent = '通义千问 · 网站推广助手';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#9ca3af';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.padding = '2px 4px';
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#e5e7eb'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#9ca3af'; });
    closeBtn.addEventListener('click', () => {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      qwenPanelEl = null;
    });

    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.padding = '10px 12px 12px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '8px';
    body.style.fontSize = '12px';

    const hint = document.createElement('div');
    hint.textContent = '基于当前网页内容，使用通义千问一键生成英文推广文案。';
    hint.style.color = '#9ca3af';
    hint.style.lineHeight = '1.4';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.alignItems = 'center';
    btnRow.style.gap = '8px';

    const generateBtn = document.createElement('button');
    generateBtn.textContent = 'AI生成推广文案';
    generateBtn.style.flex = '1';
    generateBtn.style.border = 'none';
    generateBtn.style.borderRadius = '999px';
    generateBtn.style.padding = '7px 12px';
    generateBtn.style.fontSize = '12px';
    generateBtn.style.fontWeight = '500';
    generateBtn.style.cursor = 'pointer';
    generateBtn.style.background = 'linear-gradient(135deg, #2563eb, #4f46e5)';
    generateBtn.style.color = '#f9fafb';
    generateBtn.style.boxShadow = '0 10px 24px rgba(37,99,235,0.45)';
    generateBtn.addEventListener('mouseenter', () => {
      if (!generateBtn.disabled) generateBtn.style.filter = 'brightness(1.05)';
    });
    generateBtn.addEventListener('mouseleave', () => { generateBtn.style.filter = 'none'; });

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '复制文案';
    copyBtn.style.border = 'none';
    copyBtn.style.borderRadius = '999px';
    copyBtn.style.padding = '7px 10px';
    copyBtn.style.fontSize = '12px';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.background = 'rgba(15,23,42,0.8)';
    copyBtn.style.color = '#e5e7eb';
    copyBtn.style.border = '1px solid rgba(148,163,184,0.6)';
    copyBtn.disabled = true;
    copyBtn.style.opacity = '0.55';

    const statusEl = document.createElement('div');
    statusEl.style.minHeight = '16px';
    statusEl.style.fontSize = '11px';
    statusEl.style.color = '#9ca3af';

    const textarea = document.createElement('textarea');
    textarea.readOnly = true;
    textarea.style.width = '100%';
    textarea.style.flex = '1';
    textarea.style.minHeight = '120px';
    textarea.style.maxHeight = '220px';
    textarea.style.borderRadius = '8px';
    textarea.style.border = '1px solid rgba(148,163,184,0.6)';
    textarea.style.background = 'rgba(15,23,42,0.85)';
    textarea.style.color = '#e5e7eb';
    textarea.style.fontSize = '12px';
    textarea.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    textarea.style.padding = '8px 9px';
    textarea.style.boxSizing = 'border-box';
    textarea.style.resize = 'vertical';

    btnRow.appendChild(generateBtn);
    btnRow.appendChild(copyBtn);

    body.appendChild(hint);
    body.appendChild(btnRow);
    body.appendChild(statusEl);
    body.appendChild(textarea);

    panel.appendChild(header);
    panel.appendChild(body);

    document.documentElement.appendChild(panel);
    qwenPanelEl = panel;

    qwenPanelEl._qwenTextarea = textarea;
    qwenPanelEl._qwenSetStatus = setStatus;
    qwenPanelEl._qwenSetCopyEnabled = setCopyEnabled;
    qwenPanelEl._qwenSetGenerateLoading = setGenerateLoading;

    if (lastGeneratedPromotionCopy) {
      textarea.value = lastGeneratedPromotionCopy;
      setCopyEnabled(true);
      setStatus('已自动生成推广文案，可以复制使用。', '#22c55e');
    }

    function setStatus(text, color) {
      statusEl.textContent = text || '';
      if (color) statusEl.style.color = color;
    }

    function setCopyEnabled(enabled) {
      copyBtn.disabled = !enabled;
      copyBtn.style.opacity = enabled ? '1' : '0.55';
    }

    function setGenerateLoading(loading) {
      if (loading) {
        generateBtn.disabled = true;
        generateBtn.style.opacity = '0.55';
        generateBtn.style.cursor = 'not-allowed';
        generateBtn.style.background = '#4b5563';
        generateBtn.style.boxShadow = 'none';
        generateBtn.textContent = '生成中…';
      } else {
        generateBtn.disabled = false;
        generateBtn.style.opacity = '1';
        generateBtn.style.cursor = 'pointer';
        generateBtn.style.background = 'linear-gradient(135deg, #2563eb, #4f46e5)';
        generateBtn.style.boxShadow = '0 10px 24px rgba(37,99,235,0.45)';
        generateBtn.textContent = 'AI生成推广文案';
      }
    }

    generateBtn.addEventListener('click', async () => {
      setStatus('正在调用通义千问生成推广文案，请稍候…', '#9ca3af');
      textarea.value = '';
      setCopyEnabled(false);
      setGenerateLoading(true);
      try {
        const text = await generatePromotionCopyWithQwen();
        lastGeneratedPromotionCopy = text;
        textarea.value = text;
        await recordGenerationTime(text);
        setStatus('生成完成，可以复制使用。', '#22c55e');
        setCopyEnabled(true);
        focusCommentTextareaWithPromotion(text);
      } catch (err) {
        const msg = (err && err.message) || '调用通义千问失败，请检查控制台日志或 API Key 配置。';
        setStatus(msg, '#f97373');
        setCopyEnabled(false);
      } finally {
        setGenerateLoading(false);
      }
    });

    copyBtn.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) return;

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const temp = document.createElement('textarea');
          temp.value = text;
          temp.style.position = 'fixed';
          temp.style.left = '-9999px';
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          document.body.removeChild(temp);
        }
        setStatus('文案已复制到剪贴板。', '#22c55e');
      } catch (err) {
        setStatus('复制失败，请手动选择文本复制。', '#f97373');
      }
    });

    // ====== 外链分析功能 ======
    function analyzeOutlinks() {
      const links = Array.from(document.querySelectorAll('a[href]'));

      const outlinks = links
        .map(link => {
          const href = link.href;
          try {
            const url = new URL(href);
            if (url.protocol === 'mailto:' ||
                url.protocol === 'tel:' ||
                url.protocol === 'javascript:' ||
                href.startsWith('#')) {
              return null;
            }
            if (isSameSite(url.hostname)) {
              return null;
            }
            const rel = (link.rel || '').toLowerCase();
            const isNofollow = rel.includes('nofollow');

            return {
              url: href,
              text: link.textContent?.trim() || link.innerText?.trim() || '',
              host: url.hostname,
              isNofollow,
              isDofollow: !isNofollow
            };
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      const seen = new Set();
      return outlinks.filter(link => {
        if (seen.has(link.url)) return false;
        seen.add(link.url);
        return true;
      });
    }

    function showOutlinksPanel() {
      const existing = document.getElementById('auto-comment-outlinks-panel');
      if (existing) existing.remove();

      const outlinks = analyzeOutlinks();
      const dofollowCount = outlinks.filter(l => l.isDofollow).length;
      const nofollowCount = outlinks.filter(l => l.isNofollow).length;

      const panel = document.createElement('div');
      panel.id = 'auto-comment-outlinks-panel';
      panel.style.position = 'fixed';
      panel.style.left = '50%';
      panel.style.top = '50%';
      panel.style.transform = 'translate(-50%, -50%)';
      panel.style.width = '600px';
      panel.style.maxWidth = '90vw';
      panel.style.maxHeight = '80vh';
      panel.style.zIndex = '2147483647';
      panel.style.background = 'rgba(15,23,42,0.98)';
      panel.style.color = '#e5e7eb';
      panel.style.borderRadius = '12px';
      panel.style.boxShadow = '0 18px 45px rgba(15,23,42,0.55)';
      panel.style.fontFamily = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.overflow = 'hidden';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.padding = '12px 16px';
      header.style.borderBottom = '1px solid rgba(148,163,184,0.25)';

      const title = document.createElement('div');
      title.style.fontSize = '14px';
      title.style.fontWeight = '600';
      title.textContent = `外链分析 - 共 ${outlinks.length} 个`;

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.border = 'none';
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = '#9ca3af';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontSize = '18px';
      closeBtn.addEventListener('click', () => panel.remove());

      header.appendChild(title);
      header.appendChild(closeBtn);

      const stats = document.createElement('div');
      stats.style.display = 'flex';
      stats.style.gap = '16px';
      stats.style.padding = '10px 16px';
      stats.style.fontSize = '12px';
      stats.style.borderBottom = '1px solid rgba(148,163,184,0.15)';

      const dofollowStat = document.createElement('span');
      dofollowStat.innerHTML = `<span style="color:#22c55e;font-weight:600">✓ DoFollow:</span> ${dofollowCount}`;
      const nofollowStat = document.createElement('span');
      nofollowStat.innerHTML = `<span style="color:#f97373;font-weight:600">✗ NoFollow:</span> ${nofollowCount}`;

      stats.appendChild(dofollowStat);
      stats.appendChild(nofollowStat);

      const list = document.createElement('div');
      list.style.flex = '1';
      list.style.overflowY = 'auto';
      list.style.padding = '8px';

      if (outlinks.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px">未检测到外链</div>';
      } else {
        outlinks.forEach(link => {
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.alignItems = 'center';
          item.style.gap = '8px';
          item.style.padding = '6px 8px';
          item.style.borderRadius = '6px';
          item.style.fontSize = '11px';
          item.style.wordBreak = 'break-all';

          const tag = document.createElement('span');
          tag.style.flexShrink = '0';
          tag.style.padding = '2px 6px';
          tag.style.borderRadius = '4px';
          tag.style.fontSize = '10px';
          tag.style.fontWeight = '600';

          if (link.isDofollow) {
            tag.style.background = 'rgba(34,197,94,0.2)';
            tag.style.color = '#22c55e';
            tag.textContent = 'DoFollow';
          } else {
            tag.style.background = 'rgba(249,115,115,0.2)';
            tag.style.color = '#f97373';
            tag.textContent = 'NoFollow';
          }

          const linkEl = document.createElement('a');
          linkEl.href = link.url;
          linkEl.textContent = link.host;
          linkEl.style.color = '#60a5fa';
          linkEl.style.textDecoration = 'none';
          linkEl.style.fontFamily = 'monospace';
          linkEl.target = '_blank';

          item.appendChild(tag);
          item.appendChild(linkEl);
          list.appendChild(item);
        });
      }

      const exportBtn = document.createElement('button');
      exportBtn.textContent = '导出 CSV';
      exportBtn.style.margin = '12px 16px';
      exportBtn.style.padding = '8px 16px';
      exportBtn.style.border = 'none';
      exportBtn.style.borderRadius = '6px';
      exportBtn.style.background = 'linear-gradient(135deg, #2563eb, #4f46e5)';
      exportBtn.style.color = '#fff';
      exportBtn.style.fontSize = '12px';
      exportBtn.style.cursor = 'pointer';
      exportBtn.addEventListener('click', () => {
        const csvHost = window.location.hostname;
        const csvContent = [
          ['URL', 'Hostname', 'Type', 'Link Text'].join(','),
          ...outlinks.map(l => [
            `"${l.url.replace(/"/g, '""')}"`,
            `"${l.host}"`,
            l.isDofollow ? 'DoFollow' : 'NoFollow',
            `"${l.text.replace(/"/g, '""')}"`
          ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `outlinks-${csvHost}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });

      panel.appendChild(header);
      panel.appendChild(stats);
      panel.appendChild(list);
      panel.appendChild(exportBtn);
      document.body.appendChild(panel);
    }

    // ====== 外链高亮 ======
    const OUTLINK_HIGHLIGHT_CLASS = 'auto-comment-outlink-highlight';
    let outlinkHighlightEnabled = false;

    function normalizeHost(hostname) {
      return hostname.replace(/^www\./, '').toLowerCase();
    }

    function isSameSite(hostname) {
      const normalizedCurrent = normalizeHost(window.location.hostname);
      const normalizedLink = normalizeHost(hostname);
      if (normalizedCurrent === normalizedLink) return true;
      if (normalizedLink.endsWith('.' + normalizedCurrent)) return true;
      if (normalizedCurrent.endsWith('.' + normalizedLink)) return true;
      return false;
    }

    function highlightExternalLinks() {
      const links = Array.from(document.querySelectorAll('a[href]'));
      links.forEach(link => {
        const href = link.href;
        try {
          const url = new URL(href);
          if (url.protocol === 'mailto:' ||
              url.protocol === 'tel:' ||
              url.protocol === 'javascript:' ||
              href.startsWith('#')) {
            return;
          }
          if (isSameSite(url.hostname)) {
            return;
          }
          link.classList.add(OUTLINK_HIGHLIGHT_CLASS);
        } catch (e) {}
      });
    }

    function removeOutlinkHighlights() {
      const highlighted = document.querySelectorAll('.' + OUTLINK_HIGHLIGHT_CLASS);
      highlighted.forEach(link => {
        link.classList.remove(OUTLINK_HIGHLIGHT_CLASS);
      });
    }

    function toggleOutlinkHighlight() {
      outlinkHighlightEnabled = !outlinkHighlightEnabled;
      if (outlinkHighlightEnabled) {
        highlightExternalLinks();
      } else {
        removeOutlinkHighlights();
      }
      return outlinkHighlightEnabled;
    }

    function injectOutlinkHighlightStyle() {
      if (document.getElementById('auto-comment-outlink-style')) return;
      const style = document.createElement('style');
      style.id = 'auto-comment-outlink-style';
      style.textContent = [
        'a.' + OUTLINK_HIGHLIGHT_CLASS + ' {',
        '  background-color: #fef08a !important;',
        '  outline: 2px solid #eab308 !important;',
        '  border-radius: 2px;',
        '  transition: background-color 0.2s, outline 0.2s;',
        '}',
        'a.' + OUTLINK_HIGHLIGHT_CLASS + ':hover {',
        '  background-color: #fde047 !important;',
        '  outline-color: #ca8a04 !important;',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    }

    injectOutlinkHighlightStyle();

    const highlightBtn = document.createElement('button');
    highlightBtn.textContent = outlinkHighlightEnabled ? '取消高亮' : '高亮外链';
    highlightBtn.style.border = 'none';
    highlightBtn.style.borderRadius = '999px';
    highlightBtn.style.padding = '7px 10px';
    highlightBtn.style.fontSize = '12px';
    highlightBtn.style.cursor = 'pointer';
    highlightBtn.style.background = outlinkHighlightEnabled
      ? 'linear-gradient(135deg, #2563eb, #4f46e5)'
      : 'rgba(15,23,42,0.8)';
    highlightBtn.style.color = '#e5e7eb';
    highlightBtn.style.border = '1px solid rgba(148,163,184,0.6)';
    highlightBtn.addEventListener('click', () => {
      const enabled = toggleOutlinkHighlight();
      highlightBtn.textContent = enabled ? '取消高亮' : '高亮外链';
      highlightBtn.style.background = enabled
        ? 'linear-gradient(135deg, #2563eb, #4f46e5)'
        : 'rgba(15,23,42,0.8)';
    });

    const outlinkBtn = document.createElement('button');
    outlinkBtn.textContent = '分析外链';
    outlinkBtn.style.border = 'none';
    outlinkBtn.style.borderRadius = '999px';
    outlinkBtn.style.padding = '7px 10px';
    outlinkBtn.style.fontSize = '12px';
    outlinkBtn.style.cursor = 'pointer';
    outlinkBtn.style.background = 'rgba(15,23,42,0.8)';
    outlinkBtn.style.color = '#e5e7eb';
    outlinkBtn.style.border = '1px solid rgba(148,163,184,0.6)';
    outlinkBtn.addEventListener('click', showOutlinksPanel);

    btnRow.appendChild(generateBtn);
    btnRow.appendChild(highlightBtn);
    btnRow.appendChild(outlinkBtn);
    btnRow.appendChild(copyBtn);
  }

  // 监听 background.js 中点击扩展图标发送的消息
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      if (message && message.type === 'TOGGLE_PROMOTE_WITH_QWEN_PANEL') {
        createOrToggleQwenPanel();
      }
      if (message && message.type === 'TOGGLE_OUTLINK_HIGHLIGHT') {
        const enabled = toggleOutlinkHighlight();
        if (_sendResponse) _sendResponse({ enabled });
      }
    });
  }
})();
