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

    // 标准 input / change 事件（覆盖大多数场景）
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    // React 16+ / Vue 需要 InputEvent 并带 inputType
    try {
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: value
      });
      input.dispatchEvent(inputEvent);
    } catch (_) {}

    // 某些主题在 blur 时才触发验证（如 Akismet、WP Math Latex 等插件）
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true, relatedTarget: null }));
  }

  // ──────────────────────────────────────────────────────────────
  //  强化版填值：先聚焦 → 清空 → 按字符填入 → 触发完整事件链
  //  适用于 WordPress 中使用 React/Vue 或字符级监听的主题
  // ──────────────────────────────────────────────────────────────
  function setValueRobust(input, value) {
    console.log('进入setValueRobust方法');
    try {
      input.focus();
      input.select && input.select();
    } catch (_) {}

    // 模拟逐字输入（最高兼容性）
    console.log('开始模拟逐字输入');
    for (const ch of value) {
      if (input.value && input.value.length > 0) {
        // 用 setValue 方法清空已有内容
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
        if (desc && desc.set) {
          desc.set.call(input, '');
        } else {
          input.value = '';
        }
      }
      const prevVal = input.value;
      // 追加字符
      const desc2 = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
      if (desc2 && desc2.set) {
        desc2.set.call(input, prevVal + ch);
      } else {
        input.value = prevVal + ch;
      }
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    // 再触发一次完整赋值 + 事件
    console.log('再触发一次完整赋值 + 事件');
    const desc3 = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
    if (desc3 && desc3.set) {
      desc3.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    try {
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true, cancelable: true, inputType: 'insertText', data: value
      }));
    } catch (_) {}
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true, relatedTarget: null }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ====== AI 生成配置 ======
  const QWEN_API_BASE = 'https://jieyunsang.cn/api';
  const SKILL_TEMPLATE_STORAGE_KEY = 'qwen_skill_template';
  const WEBSITE_URL_STORAGE_KEY = 'promotion_website_url';
  const AUTO_OPEN_QWEN_PANEL_KEY = 'auto_open_qwen_panel';
  const AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY = 'auto_generate_qwen_on_page_load';
  const AUTO_SUBMIT_COMMENT_KEY = 'auto_submit_comment';
  const USER_NAME_STORAGE_KEY = 'auto_fill_user_name';
  const USER_EMAIL_STORAGE_KEY = 'auto_fill_user_email';
  const USER_PASSWORD_STORAGE_KEY = 'auto_fill_user_password';
  const USER_ID_STORAGE_KEY = 'auto_comment_user_id';

  // ====== 积分系统配置 ======
  const POINTS_API_BASE = 'https://jieyunsang.cn/api';
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

  // 最近一次 AI 生成的推广文案（用于页面自动填充 & 浮动窗口回显）
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

  // 从 chrome.storage 中获取"是否在页面加载时自动调用 AI 生成"的设置
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

  // 从 chrome.storage 中获取"是否自动提交评论"的设置
  function getAutoSubmitCommentSetting() {
    return new Promise((resolve) => {
      console.log('[AutoComment] getAutoSubmitCommentSetting 开始检查...');

      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.log('[AutoComment] chrome 或 chrome.storage 未定义，返回 false');
        resolve(false);
        return;
      }

      let storageArea = null;
      try {
        if (chrome.storage.sync && typeof chrome.storage.sync.get === 'function') {
          storageArea = chrome.storage.sync;
          console.log('[AutoComment] 使用 storage.sync');
        } else if (chrome.storage.session && typeof chrome.storage.session.get === 'function') {
          storageArea = chrome.storage.session;
          console.log('[AutoComment] storage.sync 不可用，使用 storage.session');
        } else {
          console.log('[AutoComment] storage.sync 和 storage.session 都不可用');
        }
      } catch (_e) {
        console.log('[AutoComment] 尝试获取 storageArea 时出错:', _e, '，返回 false');
        resolve(false);
        return;
      }

      if (!storageArea) {
        console.log('[AutoComment] storageArea 为 null，返回 false');
        resolve(false);
        return;
      }

      try {
        storageArea.get([AUTO_SUBMIT_COMMENT_KEY], (result) => {
          console.log('[AutoComment] storage.get 回调，result:', JSON.stringify(result));
          console.log('[AutoComment] chrome.runtime.lastError:', chrome.runtime && chrome.runtime.lastError);
          if (chrome.runtime && chrome.runtime.lastError) {
            console.log('[AutoComment] chrome.runtime.lastError 存在，返回 false');
            resolve(false);
            return;
          }
          if (!result || typeof result[AUTO_SUBMIT_COMMENT_KEY] === 'undefined') {
            console.log('[AutoComment] result 为空或 key 不存在，返回 false');
            resolve(false);
            return;
          }
          const val = Boolean(result[AUTO_SUBMIT_COMMENT_KEY]);
          console.log('[AutoComment] 开关值:', val, '，返回:', val);
          resolve(val);
        });
      } catch (_e) {
        console.log('[AutoComment] storageArea.get 抛出异常:', _e, '，返回 false');
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

  // 在页面打开时自动调用一次 AI 生成
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
        console.log('autoGeneratePromotionOnPageLoad方法调用tryFillCommentTextareaWithPromotion');
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
      console.log('generatePromotionCopyWithQwen方法调用tryFillCommentTextareaWithPromotion');
      tryFillCommentTextareaWithPromotion(text);
      focusCommentTextareaWithPromotion(text);

      // ── 检查用户配置是否完整 ─────────────────────────────────
      const userProfile = await getUserProfile();
      console.log('[AutoComment-AutoLoad] getUserProfile 完成:', JSON.stringify(userProfile));
      if (!userProfile.name || !userProfile.email) {
        const missing = [];
        if (!userProfile.name) missing.push('姓名（Name）');
        if (!userProfile.email) missing.push('邮箱（Email）');
        const msg = '请先在扩展选项页填写' + missing.join('和') + '，否则无法自动提交评论！';
        if (typeof qwenPanelEl._qwenSetStatus === 'function') {
          qwenPanelEl._qwenSetStatus(msg, '#f97373');
        }
        console.error('[AutoComment-AutoLoad] ' + msg   );
        return;
      }

      // ── 检查是否开启自动提交 ─────────────────────────────────
      const shouldAutoSubmit = await getAutoSubmitCommentSetting();
      console.log('[AutoComment-AutoLoad] shouldAutoSubmit =', shouldAutoSubmit);

      if (shouldAutoSubmit) {
        console.log('[AutoComment-AutoLoad] 准备自动提交评论...');
        if (typeof qwenPanelEl._qwenSetStatus === 'function') {
          qwenPanelEl._qwenSetStatus('正在自动提交评论，请稍候…', '#9ca3af');
        }

        // 确保所有表单字段都已填好，再点击提交按钮
        const fillResult = await ensureAllCommentFormFieldsFilled(text);

        if (!fillResult.success) {
          const msg = '以下字段缺失，无法自动提交：' + fillResult.missingFields.join('、');
          if (typeof qwenPanelEl._qwenSetStatus === 'function') {
            qwenPanelEl._qwenSetStatus(msg + '，请手动检查', '#f97373');
          }
          console.error('[AutoComment-AutoLoad] 自动提交跳过 - 字段缺失:', fillResult.missingFields);
          return;
        }

        const submitButton = findCommentSubmitButton();
        if (!submitButton) {
          if (typeof qwenPanelEl._qwenSetStatus === 'function') {
            qwenPanelEl._qwenSetStatus('未找到提交按钮，请手动提交', '#f59e0b');
          }
          return;
        }

        if (!isButtonClickable(submitButton)) {
          if (typeof qwenPanelEl._qwenSetStatus === 'function') {
            qwenPanelEl._qwenSetStatus('提交按钮不可见，请手动检查', '#f59e0b');
          }
          return;
        }

        // 等待一小段时间确保页面 JS 验证逻辑已完成初始化
        await new Promise(resolve => setTimeout(resolve, 600));

        const result = await clickCommentSubmitButton();
        if (result.success) {
          if (typeof qwenPanelEl._qwenSetStatus === 'function') {
            qwenPanelEl._qwenSetStatus('评论已自动提交！', '#22c55e');
          }
        } else {
          if (typeof qwenPanelEl._qwenSetStatus === 'function') {
            qwenPanelEl._qwenSetStatus('自动提交失败：' + (result.error || '未知错误') + '，请手动提交', '#f97373');
          }
        }
      } else {
        // 未开启自动提交，仅填充文案并高亮提交按钮
        console.log('[AutoComment-AutoLoad] 未开启自动提交，仅填充文案...');
        if (typeof qwenPanelEl._qwenSetStatus === 'function') {
          qwenPanelEl._qwenSetStatus('已自动生成推广文案，可以复制使用。', '#22c55e');
        }

        const submitButton = findCommentSubmitButton();
        if (submitButton) {
          submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          submitButton.style.outline = '3px solid #22c55e';
          submitButton.style.outlineOffset = '2px';
          setTimeout(() => {
            submitButton.style.outline = '';
            submitButton.style.outlineOffset = '';
          }, 3000);
        }
      }
    } catch (err) {
      console.error('[AutoComment-AutoLoad] 生成推广文案失败:', err);
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

    // 方法1: 通过标准的 WordPress/comment 选择器直接查找
    const standardSelectors = [
      '#comment',
      'textarea[name="comment"]',
      'textarea#comment',
      'textarea[id="comment"]',
      'textarea[name="comment_content"]',
      'textarea[id="comment_content"]',
      'textarea[name="comments"]',
      'textarea#comments',
      'textarea.wpcf7-textarea'
    ];

    for (const selector of standardSelectors) {
      try {
        const ta = document.querySelector(selector);
        if (ta && !commentTextareas.includes(ta)) {
          commentTextareas.push(ta);
          const form = ta.form || (ta.closest && ta.closest('form'));
          if (form) {
            commentForms.add(form);
          }
        }
      } catch (e) {
        // 忽略无效选择器
      }
    }

    // 方法2: 通过关键词匹配
    allTextareas.forEach((ta) => {
      if (commentTextareas.includes(ta)) return; // 避免重复

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
        '回复',
        '响应'
      ];
      if (keywords.some((k) => text.includes(k))) {
        commentTextareas.push(ta);
        const form = ta.form || (ta.closest && ta.closest('form'));
        if (form) {
          commentForms.add(form);
        }
      }
    });

    // 方法3: 通过表单的 class/id/keyword 检测 WordPress 和其他常见表单
    if (commentForms.size === 0) {
      const forms = Array.from(document.querySelectorAll('form'));
      forms.forEach((form) => {
        const text = (form.textContent || '').toLowerCase();
        const className = (form.className || '').toLowerCase();
        const id = (form.id || '').toLowerCase();
        const action = (form.action || '').toLowerCase();

        // WordPress 和其他评论表单关键词
        const keywords = [
          'deja una respuesta',
          'deja un comentario',
          'tu dirección de correo electrónico no será publicada',
          'comentario *',
          'leave a reply',
          'leave a comment',
          'post comment',
          'submit comment',
          'your name',
          'your email',
          'your comment',
          '姓名',
          '邮箱',
          '评论',
          '留言',
          '回复',
          'be first to comment',
          'cancel reply',
          'logged in as'
        ];

        // WordPress 和其他表单选择器
        const formSelectors = [
          '#commentform',
          '.comment-form',
          '.commentform',
          '#respond',
          '.respond',
          '.comment-respond',
          '.wpcf7-form',
          '[class*="comment-form"]',
          '[id*="comment-form"]',
          '[class*="respond"]',
          '[id*="respond"]'
        ];

        const isWordPressForm = formSelectors.some(sel => {
          try {
            return document.querySelector(sel) === form;
          } catch (e) {
            return className.includes(sel.replace('#', '').replace('.', ''));
          }
        });

        const hasKeyword = keywords.some((k) => text.includes(k));
        const hasWPForm = isWordPressForm || action.includes('wp-comments-post') || action.includes('comment');

        if (hasKeyword || hasWPForm) {
          commentForms.add(form);
        }
      });
    }

    // 方法4: 在评论区域附近查找 textarea
    if (commentForms.size === 0) {
      const commentAreaSelectors = [
        '#comments',
        '.comments',
        '.comment-section',
        '#respond',
        '.respond',
        '.reply',
        '#comments-section',
        '.comments-area',
        '.comment-list',
        '.commentarea',
        '[class*="comment-area"]',
        '[id*="comment-area"]'
      ];

      for (const selector of commentAreaSelectors) {
        const area = document.querySelector(selector);
        if (area) {
          // 在评论区域内查找所有 textarea
          const areaTextareas = area.querySelectorAll('textarea');
          areaTextareas.forEach(ta => {
            if (!commentTextareas.includes(ta)) {
              commentTextareas.push(ta);
            }
          });

          // 如果区域在表单内，获取表单
          const form = area.closest ? area.closest('form') : null;
          if (form) {
            commentForms.add(form);
          }
        }
      }
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

  // ====== 通用评论提交按钮检测函数 ======
  /**
   * 输入: 无（依赖 DOM）
   * 输出: { form, button } 与当前评论框同一表单的提交控件，避免与页面上其它表单的 submit 混淆
   */
  function resolveCommentFormAndSubmitButton() {
    const ta = findLikelyCommentTextarea({ allowGenericFallback: true });
    if (ta) {
      const form = ta.form || (ta.closest && ta.closest('form'));
      if (form) {
        const btn = findSubmitButtonInForm(form);
        if (btn) return { form, button: btn };
      }
    }
    const commentForm = findCommentForm();
    if (commentForm) {
      const btn = findSubmitButtonInForm(commentForm);
      if (btn) return { form: commentForm, button: btn };
    }
    const standalone = findStandaloneSubmitButton();
    if (standalone) {
      const form =
        standalone.form ||
        (standalone.closest && standalone.closest('form')) ||
        null;
      return { form, button: standalone };
    }
    return { form: null, button: null };
  }

  function findCommentSubmitButton() {
    return resolveCommentFormAndSubmitButton().button;
  }

  // 查找评论表单
  function findCommentForm() {
    // 方法1: 通过 textarea 关联的表单（与填充逻辑一致，允许 generic 回退）
    const commentTextarea = findLikelyCommentTextarea({ allowGenericFallback: true });
    if (commentTextarea) {
      const form = commentTextarea.form || (commentTextarea.closest && commentTextarea.closest('form'));
      if (form) return form;
    }

    // 方法2: 通过表单 class/id 查找
    const formSelectors = [
      '#commentform',
      '.comment-form',
      '.commentform',
      '#respond',
      '.respond',
      '.comment-respond',
      'form[name="commentform"]',
      'form[id*="comment"]',
      'form[class*="comment"]',
      'form[action*="comment"]'
    ];

    for (const selector of formSelectors) {
      const form = document.querySelector(selector);
      if (form) return form;
    }

    // 方法3: 通过关键词文本查找
    const forms = Array.from(document.querySelectorAll('form'));
    for (const form of forms) {
      const text = (form.textContent || '').toLowerCase();
      const className = (form.className || '').toLowerCase();
      const id = (form.id || '').toLowerCase();

      const keywords = [
        'comment', 'reply', 'respond', '留言', '评论', '回复',
        'post a comment', 'post comment', 'submit comment', 'leave a reply'
      ];

      if (keywords.some(k => text.includes(k) || className.includes(k) || id.includes(k))) {
        return form;
      }
    }

    // 方法4: 通过评论区域查找
    const commentAreaSelectors = [
      '#comments', '.comments', '.comment-section', '#respond',
      '.respond', '.reply', '#comments-section', '.comments-area'
    ];

    for (const selector of commentAreaSelectors) {
      const area = document.querySelector(selector);
      if (area) {
        const form = area.querySelector('form') || area.closest('form');
        if (form) return form;
      }
    }

    return null;
  }

  // 在指定表单中查找提交按钮
  function findSubmitButtonInForm(form) {
    if (!form) return null;

    // 方法1: 通过标准 WordPress 选择器直接查找
    const wpSelectors = [
      '#submit',
      '#submit-btn',
      '#publish',
      'input#submit',
      'input[type="submit"]#submit',
      '.submit',
      'input.submit',
      'button.submit',
      '[name="submit"]',
      'input[name="submit"]',
      'button[name="submit"]',
      'input[type="submit"][name="submit"]',
      'input[name="publish"]',
      'button[name="publish"]',
      '.publish',
      '#wp-submit'
    ];

    for (const selector of wpSelectors) {
      try {
        const btn = form.querySelector(selector);
        if (btn) {
          console.log('[AutoComment] 通过 WordPress 选择器找到提交按钮:', selector);
          return btn;
        }
      } catch (e) {
        // 忽略无效选择器
      }
    }

    // 方法2: 查找所有可能的提交元素（表单内无 type 的 button 默认为 submit）
    const candidates = form.querySelectorAll(
      'button[type="submit"], button:not([type]), input[type="submit"], input[type="image"], [role="submit"]'
    );

    if (candidates.length > 0) {
      // 优先返回有明确提交相关的按钮
      for (const btn of candidates) {
        const value = (btn.value || '').toLowerCase();
        const className = (btn.className || '').toLowerCase();
        const id = (btn.id || '').toLowerCase();
        const text = (btn.textContent || '').toLowerCase();

        // 检查是否包含提交相关关键词（包含西班牙语和 publish）
        const submitKeywords = [
          'submit', 'post', 'comment', 'publish', 'publicar',
          'responder', 'enviar', 'reply', 'send', 'comentar',
          'replicar', 'dejar', 'commentaire', 'comentar',
          'anzeigen', 'absenden', '回答', '返信',
          'post a comment'
        ];

        if (submitKeywords.some(k => value.includes(k) || className.includes(k) || id.includes(k) || text.includes(k))) {
          console.log('[AutoComment] 通过关键词找到提交按钮:', { value, className, id, text });
          return btn;
        }
      }

      // 如果没有找到关键词匹配，返回第一个
      console.log('[AutoComment] 找到提交按钮（第一个）:', candidates[0].tagName);
      return candidates[0];
    }

    // 方法3: 通过文本内容查找（包括 input value）
    const allButtons = form.querySelectorAll('button, input[type="button"]');
    for (const btn of allButtons) {
      const text = (btn.textContent || btn.value || '').toLowerCase().trim();
      const className = (btn.className || '').toLowerCase();
      const id = (btn.id || '').toLowerCase();

      const submitKeywords = [
        'submit', 'post', 'comment', 'reply', 'respond', 'publish',
        '提交', '评论', '发送', 'publicar', 'responder', 'enviar',
        'post comment', 'submit comment', 'post a comment'
      ];

      if (submitKeywords.some(k => text.includes(k) || className.includes(k) || id.includes(k))) {
        console.log('[AutoComment] 通过文本找到提交按钮:', { text, className, id });
        return btn;
      }
    }

    // 如果表单只有一个按钮，返回它
    if (allButtons.length === 1) {
      console.log('[AutoComment] 表单只有一个按钮，返回它');
      return allButtons[0];
    }

    // 方法4: 返回表单内的第一个提交类型输入
    const submitInputs = form.querySelectorAll('input');
    for (const input of submitInputs) {
      const type = (input.type || '').toLowerCase();
      if (type === 'submit' || type === 'image') {
        console.log('[AutoComment] 返回第一个 submit input');
        return input;
      }
    }

    return null;
  }

  // 查找独立的提交按钮（不在表单内但在评论区域附近）
  function findStandaloneSubmitButton() {
    const submitKeywords = [
      'submit', 'post', 'comment', 'publish', 'respond', 'reply',
      '提交', '评论', '发送', 'publicar', 'responder', 'enviar',
      'comentar', 'dejar', 'anzeigen', 'absenden', '回答', '返信'
    ];

    // 方法1: 通过 class/id 查找常见提交按钮选择器
    const commonSelectors = [
      '#submit',
      '#submit-btn',
      '#submit-button',
      '#publish',
      '#wp-submit',
      'input#submit',
      'input[type="submit"]#submit',
      '.submit',
      '.submit-btn',
      '.submit-button',
      '.publish',
      'input.submit',
      'button.submit',
      '.comment-submit',
      '.post-comment',
      '#post-comment',
      '.btn-submit',
      '.submit-comment',
      '.wpcf7-submit',
      '#wpcf7-submit',
      '.form-submit',
      '#form-submit'
    ];

    for (const selector of commonSelectors) {
      try {
        const btn = document.querySelector(selector);
        if (btn) {
          console.log('[AutoComment] 通过选择器找到独立提交按钮:', selector);
          return btn;
        }
      } catch (e) {
        // 忽略无效选择器
      }
    }

    // 方法2: 直接查找所有提交按钮
    const submitButtons = document.querySelectorAll(
      'button[type="submit"], input[type="submit"], input[type="image"]'
    );

    for (const btn of submitButtons) {
      const text = (btn.textContent || btn.value || '').toLowerCase();
      const className = (btn.className || '').toLowerCase();
      const id = (btn.id || '').toLowerCase();
      const name = (btn.name || '').toLowerCase();

      // 检查是否包含提交相关关键词
      if (submitKeywords.some(k =>
        text.includes(k) ||
        className.includes(k) ||
        id.includes(k) ||
        name.includes(k)
      )) {
        console.log('[AutoComment] 通过关键词找到独立提交按钮:', { text, className, id });
        return btn;
      }
    }

    // 方法3: 返回页面中的第一个提交按钮（在评论区域附近）
    const commentAreas = document.querySelectorAll(
      '#comments, .comments, .comment-section, #respond, .respond, .reply, .comment-respond, ' +
      '.comments-area, .commentlist, .comment-area, #comments-section, .comments-section'
    );

    for (const area of commentAreas) {
      // 在评论区域查找提交按钮
      const areaButtons = area.querySelectorAll(
        'button[type="submit"], input[type="submit"], input[type="image"]'
      );
      for (const btn of areaButtons) {
        console.log('[AutoComment] 在评论区域找到提交按钮');
        return btn;
      }

      // 在评论区域查找带有提交关键词的按钮
      const allButtons = area.querySelectorAll('button, input[type="button"]');
      for (const btn of allButtons) {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        if (submitKeywords.some(k => text.includes(k))) {
          console.log('[AutoComment] 在评论区域通过关键词找到按钮');
          return btn;
        }
      }
    }

    // 方法4: 如果只有一个提交按钮，直接返回
    if (submitButtons.length === 1) {
      console.log('[AutoComment] 页面只有一个提交按钮，返回它');
      return submitButtons[0];
    }

    return null;
  }

  // 检查按钮是否可见且可点击
  function isButtonClickable(button) {
    if (!button) return false;

    // 检查 disabled 状态
    if (button.disabled) {
      console.log('[AutoComment] 按钮被禁用');
      return false;
    }

    if (button.getAttribute('aria-disabled') === 'true') {
      console.log('[AutoComment] 按钮 aria-disabled 为 true');
      return false;
    }

    const style = window.getComputedStyle(button);
    const rect = button.getBoundingClientRect();

    // 检查是否可见
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      console.log('[AutoComment] 按钮不可见:', { display: style.display, visibility: style.visibility, opacity: style.opacity });
      return false;
    }

    // 检查尺寸
    if (rect.width === 0 || rect.height === 0) {
      console.log('[AutoComment] 按钮尺寸为0:', { width: rect.width, height: rect.height });
      return false;
    }

    // 检查是否在视口内（允许部分可见）
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    // 至少部分可见即可
    const isPartiallyVisible = !(rect.bottom < 0 || rect.top > viewportHeight || rect.right < 0 || rect.left > viewportWidth);

    if (!isPartiallyVisible) {
      console.log('[AutoComment] 按钮不在视口内，尝试立即滚动（避免 smooth 未完成导致坐标错误）');
      try {
        button.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        return true;
      } catch (e) {
        console.log('[AutoComment] 滚动失败:', e.message);
        return false;
      }
    }

    return true;
  }

  // 点击提交按钮并处理结果
  async function clickCommentSubmitButton() {
    console.log('[AutoComment] ===== 开始自动提交评论 =====');
    console.log('[AutoComment] 当前URL:', window.location.href);

    // 列出页面上所有按钮供调试
    const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[class*="submit"], input[type="image"]');
    console.log('[AutoComment] 页面中所有按钮/链接:', Array.from(allButtons).map(b => ({
      tagName: b.tagName,
      type: b.type,
      id: b.id,
      className: b.className,
      name: b.name,
      value: b.value,
      text: b.textContent ? b.textContent.trim().substring(0, 50) : ''
    })));

    const resolved = resolveCommentFormAndSubmitButton();
    const form = resolved.form;
    const button = resolved.button;
    console.log('[AutoComment] resolveCommentFormAndSubmitButton:', {
      formId: form ? form.id : null,
      formClass: form ? form.className : null,
      buttonTag: button ? button.tagName : null,
      buttonId: button ? button.id : null
    });

    if (!button) {
      console.log('[AutoComment] 未找到任何提交按钮');
      return { success: false, error: '未找到评论提交按钮' };
    }

    return await performClick(button);
  }

  // 执行点击操作
  async function performClick(button) {
    console.log('[AutoComment] 找到提交按钮:', {
      tagName: button.tagName,
      type: button.type,
      id: button.id,
      className: button.className,
      name: button.name,
      value: button.value,
      text: button.textContent ? button.textContent.trim().substring(0, 50) : '',
      disabled: button.disabled
    });

    // 获取评论文本框内容用于确认
    const commentTextarea = findLikelyCommentTextarea({ allowGenericFallback: true });
    if (commentTextarea) {
      console.log('[AutoComment] 评论文本框内容:', commentTextarea.value ? commentTextarea.value.substring(0, 100) + '...' : '(空)');
    }

    if (!isButtonClickable(button)) {
      console.log('[AutoComment] 提交按钮不可见或被禁用');
      return { success: false, error: '提交按钮不可见或被禁用' };
    }

    function tryRequestSubmit(formEl, submitter) {
      if (!formEl) return false;
      if (typeof formEl.requestSubmit === 'function') {
        try {
          formEl.requestSubmit(submitter);
          return true;
        } catch (err) {
          console.log('[AutoComment] requestSubmit 失败:', err.message);
        }
      }
      return false;
    }

    try {
      // 长页面若用 smooth，滚动未完成时 getBoundingClientRect 会算错坐标，合成点击落空
      button.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise(resolve => setTimeout(resolve, 80));

      console.log('[AutoComment] 尝试点击提交按钮...');

      const rect = button.getBoundingClientRect();
      const clientX = Math.round(rect.left + rect.width / 2);
      const clientY = Math.round(rect.top + rect.height / 2);

      const pointerOpts = {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        view: window
      };

      try {
        if (typeof PointerEvent !== 'undefined') {
          button.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
          await new Promise(resolve => setTimeout(resolve, 20));
        }

        button.dispatchEvent(new MouseEvent('mousedown', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX,
          clientY
        }));
        await new Promise(resolve => setTimeout(resolve, 40));

        button.dispatchEvent(new MouseEvent('mouseup', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX,
          clientY
        }));
        await new Promise(resolve => setTimeout(resolve, 20));

        if (typeof PointerEvent !== 'undefined') {
          button.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
          await new Promise(resolve => setTimeout(resolve, 20));
        }

        button.dispatchEvent(new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX,
          clientY
        }));

        recordFormSubmit();

        console.log('[AutoComment] 提交按钮点击成功 (pointer/mousedown→mouseup→click)');
        return { success: true, button: button };
      } catch (e) {
        console.log('[AutoComment] 合成事件失败，尝试 button.click():', e.message);
        try {
          button.click();
          recordFormSubmit();
          console.log('[AutoComment] button.click() 点击成功');
          return { success: true, button: button };
        } catch (e2) {
          console.log('[AutoComment] button.click() 也失败:', e2.message);

          const formEl = button.form || button.closest('form');
          if (tryRequestSubmit(formEl, button)) {
            recordFormSubmit();
            console.log('[AutoComment] form.requestSubmit(submitter) 成功');
            return { success: true, button: button };
          }
          try {
            if (formEl) {
              console.log('[AutoComment] 降级 form.submit()（无 submit 事件）');
              formEl.submit();
              recordFormSubmit();
              return { success: true, button: button };
            }
          } catch (e3) {
            console.log('[AutoComment] 表单提交也失败:', e3.message);
          }

          return { success: false, error: '点击按钮失败: ' + e2.message };
        }
      }
    } catch (e) {
      console.log('[AutoComment] 直接点击失败:', e.message);

      try {
        const event = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        button.dispatchEvent(event);
        recordFormSubmit();
        console.log('[AutoComment] 使用 dispatchEvent 点击成功');
        return { success: true, button: button };
      } catch (e2) {
        console.log('[AutoComment] dispatchEvent 点击也失败:', e2.message);

        const formEl = button.form || button.closest('form');
        if (tryRequestSubmit(formEl, button)) {
          recordFormSubmit();
          console.log('[AutoComment] form.requestSubmit(submitter) 成功');
          return { success: true, button: button };
        }
        try {
          if (formEl) {
            console.log('[AutoComment] 尝试 form.submit()');
            formEl.submit();
            recordFormSubmit();
            return { success: true, button: button };
          }
        } catch (e3) {
          console.log('[AutoComment] 表单提交失败:', e3.message);
        }

        return { success: false, error: '点击按钮失败: ' + e.message };
      }
    }
  }

  function tryFillCommentTextareaWithPromotion(promotionText) {
    if (!promotionText) {
      console.log('[AutoComment] 没有推广文案可填充');
      return false;
    }

    const targetTextarea = findLikelyCommentTextarea({ allowGenericFallback: true });
    if (!targetTextarea) {
      console.log('[AutoComment] 未找到评论文本框，无法填充文案');
      return false;
    }

    console.log('[AutoComment] 找到评论文本框:', {
      name: targetTextarea.name,
      id: targetTextarea.id,
      className: targetTextarea.className,
      currentValue: targetTextarea.value ? targetTextarea.value.substring(0, 50) + '...' : '(空)'
    });

    // 如果文本框已有内容，可以选择覆盖或跳过
    const currentValue = (targetTextarea.value || '').trim();
    if (currentValue && currentValue.length > 10) {
      console.log('[AutoComment] 文本框已有内容，跳过自动填充');
      return false;
    }

    setValueRobust(targetTextarea, promotionText);
    console.log('[AutoComment] 成功填入推广文案，长度:', promotionText.length);
    return true;
  }

  function focusCommentTextareaWithPromotion(promotionText) {
    const targetTextarea = findLikelyCommentTextarea({ allowGenericFallback: true });
    if (!targetTextarea) {
      console.log('[AutoComment] 未找到评论文本框，无法聚焦');
      return;
    }

    // 如果文本框为空且有推广文案，先填入
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
      console.log('[AutoComment] 聚焦文本框失败:', e.message);
    }
  }

  // ============================================================
  //  确保评论表单所有必填字段都被正确填入，并在提交前验证
  // ============================================================
  async function ensureAllCommentFormFieldsFilled(commentText) {
    const userProfile = await getUserProfile();
    const WEBSITE = await getWebsiteUrl();
    const USERNAME = userProfile.name || '';
    const EMAIL = userProfile.email || '';

    console.log('[AutoComment] ===== ensureAllCommentFormFieldsFilled 开始 =====');
    console.log('[AutoComment] 将填入 - Name:', USERNAME, '| Email:', EMAIL, '| Website:', WEBSITE);

    // ── 前置检查：配置缺失则直接报错，不静默失败 ─────────────────
    if (!USERNAME || !EMAIL) {
      const missing = [];
      if (!USERNAME) missing.push('姓名（Name）');
      if (!EMAIL) missing.push('邮箱（Email）');
      const msg = '请先在扩展选项页填写' + missing.join('和') + '，否则无法自动提交评论！';
      console.error('[AutoComment] ' + msg);
      // 通过 status 提示用户
      setStatus(msg, '#f97373');
      return { success: false, missingFields: ['name config missing', 'email config missing'] };
    }

    // ── 步骤1：找到表单 ──────────────────────────────────────
    let form = null;

    // 方法A：直接用 WordPress 标准 form 选择器
    const formSelectors = [
      '#commentform',
      '.comment-form',
      '.commentform',
      'form[name="commentform"]',
      'form[id="commentform"]',
      'form[class*="comment-form"]',
      'form[id*="comment-form"]'
    ];
    for (const sel of formSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.tagName === 'FORM') {
          form = el;
          console.log('[AutoComment] 通过选择器找到表单:', sel);
          break;
        }
      } catch (_) {}
    }

    // 方法B：先找 textarea，再用 ta.form / closest('form')
    if (!form) {
      const textarea = findLikelyCommentTextarea({ allowGenericFallback: true });
      if (textarea) {
        console.log('[AutoComment] 找到评论 textarea:', {
          name: textarea.name,
          id: textarea.id,
          className: textarea.className,
          tagName: textarea.tagName,
          formAttr: textarea.form ? textarea.form.id || textarea.form.className : 'null'
        });
        // textarea.form 在大多数现代浏览器中会返回关联的表单元素
        if (textarea.form) {
          form = textarea.form;
          console.log('[AutoComment] 通过 textarea.form 找到表单');
        } else if (textarea.closest) {
          const parentForm = textarea.closest('form');
          if (parentForm) {
            form = parentForm;
            console.log('[AutoComment] 通过 textarea.closest("form") 找到表单');
          }
        }
      }
    }

    // 方法C：在评论区域附近找 form
    if (!form) {
      const areaSelectors = [
        '#comments', '#respond', '.comment-respond',
        '#comments-section', '.comments-area', '.comment-section'
      ];
      for (const sel of areaSelectors) {
        const area = document.querySelector(sel);
        if (area) {
          const f = area.querySelector('form') || (area.closest ? area.closest('form') : null);
          if (f) {
            form = f;
            console.log('[AutoComment] 通过评论区域找到表单:', sel);
            break;
          }
        }
      }
    }

    // 方法D：直接找页面所有表单中含 comment/respond 关键词的
    if (!form) {
      const allForms = Array.from(document.querySelectorAll('form'));
      for (const f of allForms) {
        const text = (f.textContent || '').toLowerCase();
        const cls = (f.className || '').toLowerCase();
        const fid = (f.id || '').toLowerCase();
        if (text.includes('comment') || text.includes('respond') ||
            cls.includes('comment') || fid.includes('comment') ||
            cls.includes('respond') || fid.includes('respond')) {
          form = f;
          console.log('[AutoComment] 通过关键词找到表单:', f.id, f.className);
          break;
        }
      }
    }

    if (!form) {
      console.log('[AutoComment] 未能找到评论表单!');
      return { success: false, missingFields: ['form not found'] };
    }

    console.log('[AutoComment] 最终使用的表单:', {
      id: form.id,
      className: form.className,
      action: form.action
    });

    // ── 步骤2：统计表单中所有输入框（用于日志）───────────────
    const formAllInputs = Array.from(form.querySelectorAll('input'));
    const formTextareas = Array.from(form.querySelectorAll('textarea'));
    console.log('[AutoComment] 表单中的 input 数量:', formAllInputs.length, 'textarea 数量:', formTextareas.length);
    console.log('[AutoComment] 表单中所有 input:', formAllInputs.map(i => ({
      name: i.name, id: i.id, type: i.type, className: i.className,
      placeholder: i.placeholder, valueLen: (i.value || '').length
    })));

    // ── 步骤3：找评论 textarea ───────────────────────────────
    let commentTextarea = null;
    if (formTextareas.length > 0) {
      // 优先找有 comment 关键词的
      commentTextarea = formTextareas.find(ta => {
        const n = (ta.name || '').toLowerCase();
        const i = (ta.id || '').toLowerCase();
        return n.includes('comment') || i.includes('comment');
      }) || formTextareas[0];
    }
    if (!commentTextarea) {
      // 再从全局找并验证属于当前表单
      const ta = findLikelyCommentTextarea({ allowGenericFallback: true });
      if (ta && (ta.form === form || (ta.closest && ta.closest('form') === form))) {
        commentTextarea = ta;
      }
    }

    if (!commentTextarea) {
      console.log('[AutoComment] 未找到评论 textarea!');
      return { success: false, missingFields: ['comment textarea not found'] };
    }

    // ── 步骤4：找 Name 输入框 ─────────────────────────────────
    // 直接选择器 + closest 验证（不依赖 formInputs 集合，避免遗漏嵌套字段）
    let nameInput = null;
    const nameSelectors = [
      '#author', 'input[name="author"]',
      'input[id*="author" i]', 'input[class*="author" i]',
      'input[name="name"]', 'input[name="your-name"]',
      'input[id="name"]', 'input[id="author-name"]',
      'input[placeholder*="name" i]', 'input[placeholder*="姓名" i]',
      'input[placeholder*="昵称" i]', 'input[placeholder*="名字" i]'
    ];
    for (const sel of nameSelectors) {
      try {
        const el = form.querySelector(sel);
        if (el && el.tagName === 'INPUT' && el.closest('form') === form) {
          nameInput = el;
          console.log('[AutoComment] 通过选择器找到 nameInput:', sel, { name: nameInput.name, id: nameInput.id, type: nameInput.type });
          break;
        }
      } catch (_) {}
    }
    if (nameInput) {
      console.log('[AutoComment] 找到 nameInput:', { name: nameInput.name, id: nameInput.id, type: nameInput.type });
    } else {
      console.log('[AutoComment] 未找到 nameInput!');
    }

    // ── 步骤5：找 Email 输入框 ───────────────────────────────
    let emailInput = null;
    const emailSelectors = [
      '#email', 'input[name="email"]', 'input[type="email"]',
      'input[id="mail"]', 'input[name="mail"]',
      'input[id*="email" i]', 'input[class*="email" i]',
      'input[placeholder*="email" i]', 'input[placeholder*="邮箱" i]',
      'input[placeholder*="mail" i]'
    ];
    for (const sel of emailSelectors) {
      try {
        const el = form.querySelector(sel);
        if (el && el.tagName === 'INPUT' && el.closest('form') === form) {
          emailInput = el;
          console.log('[AutoComment] 通过选择器找到 emailInput:', sel, { name: emailInput.name, id: emailInput.id, type: emailInput.type });
          break;
        }
      } catch (_) {}
    }
    if (emailInput) {
      console.log('[AutoComment] 找到 emailInput:', { name: emailInput.name, id: emailInput.id, type: emailInput.type });
    } else {
      console.log('[AutoComment] 未找到 emailInput!');
    }

    // ── 步骤6：找 Website 输入框 ─────────────────────────────
    let websiteInput = null;
    const urlSelectors = [
      '#url', 'input[name="url"]', 'input[type="url"]',
      'input[id="website"]', 'input[name="website"]',
      'input[placeholder*="website" i]', 'input[placeholder*="网站" i]',
      'input[placeholder*="url" i]'
    ];
    for (const sel of urlSelectors) {
      try {
        const el = form.querySelector(sel);
        if (el && el.tagName === 'INPUT' && el.closest('form') === form) {
          websiteInput = el;
          console.log('[AutoComment] 通过选择器找到 websiteInput:', sel);
          break;
        }
      } catch (_) {}
    }
    if (websiteInput) {
      console.log('[AutoComment] 找到 websiteInput:', { name: websiteInput.name, id: websiteInput.id, type: websiteInput.type });
    } else {
      console.log('[AutoComment] 未找到 websiteInput（可选）');
    }

    // ── 步骤7：填入所有字段 ─────────────────────────────────
    console.log('[AutoComment] 开始填入字段...');

    if (nameInput) {
      setValueRobust(nameInput, USERNAME);
    }
    if (emailInput) {
      setValueRobust(emailInput, EMAIL);
    }
    if (websiteInput && WEBSITE) {
      setValue(websiteInput, WEBSITE);
    }
    if (commentText && commentTextarea) {
      setValue(commentTextarea, commentText);
    }

    // ── 步骤8：等待 DOM 更新后验证 ───────────────────────────
    await new Promise(resolve => setTimeout(resolve, 150));

    const missingFields = [];
    const validationLog = {};

    // 验证 comment
    const cv = (commentTextarea.value || '').trim();
    validationLog.comment = { filled: cv.length > 0, length: cv.length };
    if (!cv || cv.length < 5) missingFields.push('comment');

    // 验证 name
    if (nameInput) {
      const nv = (nameInput.value || '').trim();
      validationLog.name = { filled: nv.length > 0, value: nv.substring(0, 20) };
      if (!nv) missingFields.push('name (empty after fill)');
    } else {
      validationLog.name = { found: false };
      missingFields.push('name (input not found)');
    }

    // 验证 email
    if (emailInput) {
      const ev = (emailInput.value || '').trim();
      validationLog.email = { filled: ev.length > 0, value: ev.substring(0, 20) };
      if (!ev) missingFields.push('email (empty after fill)');
    } else {
      validationLog.email = { found: false };
      missingFields.push('email (input not found)');
    }

    // 验证 website（可选，不影响提交）
    if (websiteInput) {
      validationLog.website = { filled: !!(websiteInput.value || '').trim() };
    }

    console.log('[AutoComment] 字段验证结果:', validationLog);
    console.log('[AutoComment] 缺失字段:', missingFields);
    console.log('[AutoComment] ===== ensureAllCommentFormFieldsFilled 结束 =====');

    return { success: missingFields.length === 0, missingFields };
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

    console.log('AI 生成的网站推广文案：\n', aiText);
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
    header.textContent = 'AI · 网站推广助手';

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
    hint.textContent = '基于当前网页内容，一键生成推广文案。';
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
      setStatus('正在生成推广文案，请稍候…', '#9ca3af');
      textarea.value = '';
      setCopyEnabled(false);
      setGenerateLoading(true);
      try {
        const text = await generatePromotionCopyWithQwen();
        lastGeneratedPromotionCopy = text;
        textarea.value = text;
        await recordGenerationTime(text);

        // ── 把文案填入页面评论框 ────────────────────────────────────
        console.log('[AutoComment] >>>[0] 即将调用 tryFillCommentTextareaWithPromotion');
        const filled = tryFillCommentTextareaWithPromotion(text);
        console.log('[AutoComment] >>>[1] tryFillCommentTextareaWithPromotion 返回:', filled);
        if (!filled) {
          console.log('[AutoComment] 页面评论框填充未成功（可能已有内容或未找到文本框）');
        }

        // ── 步骤A：读取用户配置 ─────────────────────────────────
        console.log('[AutoComment] >>>[2] 即将调用 getUserProfile...');
        const userProfile = await getUserProfile();
        console.log('[AutoComment] >>>[3] getUserProfile() 完成:', JSON.stringify(userProfile));

        console.log('[AutoComment] >>>[4] 检查用户配置是否完整...');
        if (!userProfile.name || !userProfile.email) {
          const missing = [];
          if (!userProfile.name) missing.push('姓名（Name）');
          if (!userProfile.email) missing.push('邮箱（Email）');
          const msg = '请先在扩展选项页填写' + missing.join('和') + '，否则无法自动提交评论！';
          setStatus(msg, '#f97373');
          console.error('[AutoComment] ' + msg);
          setCopyEnabled(true);
          setGenerateLoading(false);
          return;
        }
        console.log('[AutoComment] >>>[5] 用户配置检查通过，继续执行...');

        setCopyEnabled(true);

        // === 自动提交评论（全自动，无需手动点击任何按钮）===
        console.log('[AutoComment] >>>[6] 即将调用 getAutoSubmitCommentSetting...');
        const shouldAutoSubmit = await getAutoSubmitCommentSetting();
        console.log('[AutoComment] shouldAutoSubmit =', shouldAutoSubmit);

        console.log('[AutoComment] >>>[7] shouldAutoSubmit 检查完成，开始判断...');
        if (shouldAutoSubmit) {
          console.log('[AutoComment] >>>[8] shouldAutoSubmit 为 true，准备自动提交...');
          setStatus('正在自动提交评论，请稍候…', '#9ca3af');

          // 确保所有表单字段都已填好，再点击提交按钮
          const fillResult = await ensureAllCommentFormFieldsFilled(text);

          if (!fillResult.success) {
            const msg = '以下字段缺失，无法自动提交：' + fillResult.missingFields.join('、');
            setStatus(msg + '，请手动检查', '#f97373');
            console.error('[AutoComment] 自动提交跳过 - 字段缺失:', fillResult.missingFields);
            setGenerateLoading(false);
            return;
          }

          const submitButton = findCommentSubmitButton();
          if (!submitButton) {
            setStatus('未找到提交按钮，请手动提交', '#f59e0b');
            setGenerateLoading(false);
            return;
          }

          if (!isButtonClickable(submitButton)) {
            setStatus('提交按钮不可见，请手动检查', '#f59e0b');
            setGenerateLoading(false);
            return;
          }

          // 等待一小段时间确保页面 JS 验证逻辑已完成初始化
          await new Promise(resolve => setTimeout(resolve, 600));

          const result = await clickCommentSubmitButton();
          if (result.success) {
            setStatus('评论已自动提交！', '#22c55e');
          } else {
            setStatus('自动提交失败：' + (result.error || '未知错误') + '，请手动提交', '#f97373');
          }
        console.log('[AutoComment] >>>[7b] shouldAutoSubmit 为 false，仅填充文案');
        } else {
          // 未开启自动提交，仅填充文案并高亮提交按钮
          console.log('[AutoComment] >>>[9] 未开启自动提交，仅填充文案并高亮按钮...');
          setStatus('生成完成！文案已填入评论框，勾选"自动提交"即可全自动发送', '#22c55e');

          const submitButton = findCommentSubmitButton();
          if (submitButton) {
            console.log('[AutoComment] >>>[10] 找到提交按钮，高亮显示...');
            submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            submitButton.style.outline = '3px solid #22c55e';
            submitButton.style.outlineOffset = '2px';
            setTimeout(() => {
              submitButton.style.outline = '';
              submitButton.style.outlineOffset = '';
            }, 3000);
          } else {
            console.log('[AutoComment] >>>[11] 未找到提交按钮');
          }
        }
        setGenerateLoading(false);
      } catch (err) {
        const msg = (err && err.message) || '生成失败，请检查控制台日志。';
        setStatus(msg, '#f97373');
        setCopyEnabled(false);
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
      if (message && message.type === 'TOGGLE_PROMOTE_PANEL') {
        createOrToggleQwenPanel();
      }
      if (message && message.type === 'TOGGLE_OUTLINK_HIGHLIGHT') {
        const enabled = toggleOutlinkHighlight();
        if (_sendResponse) _sendResponse({ enabled });
      }
    });
  }
})();
