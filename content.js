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
      // 排除明显不是用户名的字段
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
    // 识别明显是"评论 / 留言 / 回复"等用途的 textarea，从而定位对应的表单
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

    // 兜底：如果通过 textarea 属性没能识别到评论表单，再根据表单内文案来猜测
    // 兼容类似 Deusto 博客这种"Deja una respuesta / Tu dirección de correo electrónico no será publicada"结构
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

    // 在识别到的"评论表单"中，尝试填充 Name 和 Website
    if (commentForms.size > 0) {
      commentForms.forEach((form) => {
        const formInputs = Array.from(form.querySelectorAll('input'));

        // Name / 昵称 / 联系人 等
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
            'nombre' // 西班牙语：名字
          ];
          return keywords.some((k) => text.includes(k));
        });
        if (nameInput) {
          setValue(nameInput, USERNAME);
        }

        // Email（优先在评论表单内部单独再填一次，避免被其他订阅框"抢占"）
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

        // Website / URL / Homepage 等
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
    // 避免被框架拦截，触发原生 setter + 事件
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

  // ====== 通义千问：网站推广 Skill 与调用 ======
  // API Key / Skill 模板 / 推广网站地址都从 chrome.storage.sync 中读取，不在代码中硬编码
  const API_KEY_STORAGE_KEY = 'dashscope_api_key';
  const SKILL_TEMPLATE_STORAGE_KEY = 'qwen_skill_template';
  const WEBSITE_URL_STORAGE_KEY = 'promotion_website_url';
  const AUTO_OPEN_QWEN_PANEL_KEY = 'auto_open_qwen_panel';
  const AUTO_GENERATE_QWEN_ON_PAGE_LOAD_KEY = 'auto_generate_qwen_on_page_load';
  const USER_NAME_STORAGE_KEY = 'auto_fill_user_name';
  const USER_EMAIL_STORAGE_KEY = 'auto_fill_user_email';
  const USER_PASSWORD_STORAGE_KEY = 'auto_fill_user_password';

  // ====== 防重复生成配置 ======
  // 冷却时间：同一域名在24小时内不重复生成推广文案（单位：毫秒）
  const DOMAIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const GENERATION_RECORD_KEY = 'qwen_generation_records';
  // 表单提交后短期冷却时间（5分钟），防止页面刷新后重复生成
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

  // 获取当前页面的域名
  function getCurrentDomain() {
    return extractDomain(window.location.href);
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

  // 从 chrome.storage.sync 中异步获取 DashScope / 通义千问 API Key
  function getDashScopeApiKey() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve('');
        return;
      }
      chrome.storage.sync.get([API_KEY_STORAGE_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('读取 DashScope API Key 失败：', chrome.runtime.lastError);
          resolve('');
          return;
        }
        const key =
          result && typeof result[API_KEY_STORAGE_KEY] === 'string'
            ? result[API_KEY_STORAGE_KEY]
            : '';
        resolve(key.trim());
      });
    });
  }

  // 从 chrome.storage.sync 中异步获取 Skill 模板（如果为空则回落到默认模板）
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

  // 从 chrome.storage.sync 中异步获取推广网站地址（用于自动填充评论表单中的 Website/URL 字段）
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

  // 从 chrome.storage.sync 中异步获取用户的姓名 / 邮箱 / 密码，用于自动填表
  // 如果为空或读取失败，则回退到扩展内置的默认姓名 / 邮箱 / 密码
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
          let name =
            result && typeof result[USER_NAME_STORAGE_KEY] === 'string'
              ? result[USER_NAME_STORAGE_KEY].trim()
              : '';
          let email =
            result && typeof result[USER_EMAIL_STORAGE_KEY] === 'string'
              ? result[USER_EMAIL_STORAGE_KEY].trim()
              : '';
          let password =
            result && typeof result[USER_PASSWORD_STORAGE_KEY] === 'string'
              ? result[USER_PASSWORD_STORAGE_KEY].trim()
              : '';

          if (!name) {
            name = DEFAULT_USERNAME;
          }
          if (!email) {
            email = DEFAULT_EMAIL;
          }
          if (!password) {
            password = DEFAULT_PASSWORD;
          }

          resolve({ name, email, password });
        }
      );
    });
  }

  // 从 chrome.storage.sync 中异步获取"是否自动打开浮动窗口"的设置
  // 默认值：true（即未设置或读取失败时，视为开启自动打开）
  function getAutoOpenQwenPanelSetting() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        resolve(true);
        return;
      }
      chrome.storage.sync.get([AUTO_OPEN_QWEN_PANEL_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('读取自动打开浮动窗口设置失败：', chrome.runtime.lastError);
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

  // 从 chrome.storage 中异步获取"是否在页面加载时自动调用通义千问生成推广文案"的设置
  // 出于节省 token 的考虑，默认值为 false
  function getAutoGenerateQwenOnPageLoadSetting() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve(false);
        return;
      }

      let storageArea = null;
      try {
        // 优先使用 sync，与 options 页面中保存的存储区域保持一致
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

  // 检查当前域名是否在冷却时间内（避免同一域名重复生成）
  function isUrlInCooldown() {
    return new Promise((resolve) => {
      const currentDomain = getCurrentDomain();
      console.log('[AutoComment] isUrlInCooldown - 当前域名:', currentDomain);

      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.log('[AutoComment] isUrlInCooldown - chrome.storage 不可用，返回 false');
        resolve(false);
        return;
      }

      let storageArea = null;
      try {
        if (chrome.storage.local && typeof chrome.storage.local.get === 'function') {
          storageArea = chrome.storage.local;
        }
      } catch (_e) {
        console.log('[AutoComment] isUrlInCooldown - 获取 storageArea 失败，返回 false');
        resolve(false);
        return;
      }

      if (!storageArea) {
        console.log('[AutoComment] isUrlInCooldown - storageArea 为空，返回 false');
        resolve(false);
        return;
      }

      storageArea.get([GENERATION_RECORD_KEY, SUBMIT_COOLDOWN_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.log('[AutoComment] isUrlInCooldown - runtime.lastError:', chrome.runtime.lastError);
          resolve(false);
          return;
        }

        console.log('[AutoComment] isUrlInCooldown - 存储中的记录:', JSON.stringify(result));

        const records = result && result[GENERATION_RECORD_KEY];
        const submitCooldown = result && result[SUBMIT_COOLDOWN_KEY];

        console.log('[AutoComment] isUrlInCooldown - 域名冷却记录:', records ? JSON.stringify(records) : '无');
        console.log('[AutoComment] isUrlInCooldown - 表单提交冷却:', submitCooldown ? JSON.stringify(submitCooldown) : '无');

        // 检查表单提交冷却（改为检查域名）
        if (submitCooldown && submitCooldown.domain === currentDomain) {
          const submitTime = submitCooldown.timestamp || 0;
          const timeSinceSubmit = Date.now() - submitTime;
          console.log('[AutoComment] isUrlInCooldown - 距表单提交过去:', timeSinceSubmit, 'ms (冷却时间:', SUBMIT_COOLDOWN_MS, 'ms)');
          if (timeSinceSubmit < SUBMIT_COOLDOWN_MS) {
            console.log('[AutoComment] isUrlInCooldown - 表单刚提交，命中冷却，返回 true');
            resolve(true);
            return;
          }
        }

        // 检查域名冷却时间（改为检查域名）
        if (records && records[currentDomain] && records[currentDomain].timestamp) {
          const lastGenTime = records[currentDomain].timestamp;
          const timeSinceGen = Date.now() - lastGenTime;
          console.log('[AutoComment] isUrlInCooldown - 距上次生成过去:', timeSinceGen, 'ms (冷却时间:', DOMAIN_COOLDOWN_MS, 'ms)');
          if (timeSinceGen < DOMAIN_COOLDOWN_MS) {
            console.log('[AutoComment] isUrlInCooldown - 域名在冷却时间内，返回 true');
            resolve(true);
            return;
          }
        }

        console.log('[AutoComment] isUrlInCooldown - 未命中冷却，返回 false');
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
          console.log('[AutoComment] 已记录域名生成时间:', currentDomain);
          resolve();
        });
      });
    });
  }

  // 记录表单提交事件，设置短期冷却（改为记录域名）
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
        console.log('[AutoComment] 已记录表单提交，短期内刷新页面不会自动生成，域名:', currentDomain);
        resolve();
      });
    });
  }

  // 获取缓存的推广文案（如果之前生成过）
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
      // 检查是否是评论/留言相关的表单
      const isCommentForm = form && (
        form.id?.toLowerCase().includes('comment') ||
        form.className?.toLowerCase().includes('comment') ||
        form.method?.toLowerCase() === 'post'
      );

      if (isCommentForm) {
        // 延迟执行，等待表单提交完成后再记录
        setTimeout(() => {
          recordFormSubmit();
        }, 1500);
      }
    }, { capture: true });
  }

  // 在页面打开时自动调用一次通义千问，生成推广文案并尝试自动填充评论框
  let autoGeneratedOnce = false;

  async function autoGeneratePromotionOnPageLoad() {
    console.log('[AutoComment] === 开始执行 autoGeneratePromotionOnPageLoad ===');
    console.log('[AutoComment] autoGeneratedOnce 当前值:', autoGeneratedOnce);
    console.log('[AutoComment] 当前页面URL:', window.location.href);

    if (autoGeneratedOnce) {
      console.log('[AutoComment] 拦截：autoGeneratedOnce 已为 true，跳过生成');
      return;
    }

    // 检查URL是否在冷却时间内
    console.log('[AutoComment] 开始检查冷却时间...');
    const inCooldown = await isUrlInCooldown();
    console.log('[AutoComment] 冷却时间检查结果 inCooldown:', inCooldown);

    if (inCooldown) {
      console.log('[AutoComment] 跳过自动生成：当前URL在冷却时间内');
      const cachedCopy = await getCachedPromotionCopy();
      console.log('[AutoComment] 缓存文案内容:', cachedCopy ? '有缓存' : '无缓存');
      if (cachedCopy) {
        lastGeneratedPromotionCopy = cachedCopy;
        tryFillCommentTextareaWithPromotion(cachedCopy);
        focusCommentTextareaWithPromotion(cachedCopy);
      }
      return;
    }

    const hasCommentBox = !!findLikelyCommentTextarea({ allowGenericFallback: false });
    console.log('[AutoComment] 是否识别到评论框:', hasCommentBox);
    if (!hasCommentBox) {
      console.log('[AutoComment] 未识别到评论框，跳过生成');
      return;
    }

    autoGeneratedOnce = true;
    console.log('[AutoComment] 设置 autoGeneratedOnce = true，开始生成文案');

    // 如果浮动窗口已打开，则同步显示按钮"生成中"的状态
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

      // 自动填充到页面中识别到的"评论"文本框（仅在目标文本框当前为空时填充）
      tryFillCommentTextareaWithPromotion(text);

      // 聚焦到评论框，并在需要时填充文案
      focusCommentTextareaWithPromotion(text);

      // 如果浮动窗口已存在，则同步更新到浮动窗口的文本区域和复制按钮状态
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
      // 自动流程中不打扰用户，只在控制台输出错误日志
      console.error('自动调用通义千问生成推广文案失败：', err);
      if (
        qwenPanelEl &&
        typeof qwenPanelEl._qwenSetGenerateLoading === 'function' &&
        typeof qwenPanelEl._qwenSetStatus === 'function'
      ) {
        qwenPanelEl._qwenSetStatus('自动生成推广文案失败，请稍后重试。', '#f97373');
      }
    } finally {
      if (
        qwenPanelEl &&
        typeof qwenPanelEl._qwenSetGenerateLoading === 'function'
      ) {
        qwenPanelEl._qwenSetGenerateLoading(false);
      }
    }
  }

  // 初次加载（仅在页面打开/刷新时自动填表一次，并根据设置决定是否自动打开浮动窗口）
  function initOnPageReady() {
    fillInputs();
    // 设置表单提交监听器
    setupFormSubmitListener();

    getAutoOpenQwenPanelSetting().then((shouldOpen) => {
      if (shouldOpen) {
        createOrToggleQwenPanel();
      }
    });
    // 根据当前页面内容，自动调用通义千问生成一份推广文案，并尝试填充到评论框 & 浮动窗口
    // 该行为受选项页中的开关控制，且开关默认关闭、随浏览器会话重置为关闭，以避免意外消耗过多 token
    getAutoGenerateQwenOnPageLoadSetting().then((shouldAutoGenerate) => {
      if (shouldAutoGenerate) {
        autoGeneratePromotionOnPageLoad();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnPageReady);
  } else {
    initOnPageReady();
  }

  // 根据页面结构找到一个最有可能是"评论 / 留言"用途的 textarea
  // allowGenericFallback:
  //   - false：仅在明确识别为"评论/留言"区域时返回（用于是否触发自动生成的判断，避免浪费 token）
  //   - true：在识别失败时退回到页面第一个 textarea，保证在部分网站上尽量可用
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

    // 兜底：如果通过 textarea 属性没能识别到评论表单，再根据表单内文案来猜测
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

    // 优先使用之前通过关键词识别到的 textarea
    if (commentTextareas.length > 0) {
      targetTextarea = commentTextareas[0];
    } else if (commentForms.size > 0) {
      // 其次在识别到的评论表单内挑一个 textarea
      for (const form of commentForms) {
        const formTextareas = Array.from(form.querySelectorAll('textarea'));
        if (formTextareas.length > 0) {
          targetTextarea = formTextareas[0];
          break;
        }
      }
    }

    // 再兜底：如果仍未识别到评论表单，就用页面中的第一个 textarea（避免完全失效）
    if (!targetTextarea && allowGenericFallback) {
      targetTextarea = allTextareas[0];
    }

    return targetTextarea || null;
  }

  // 尝试根据页面结构找到一个最有可能是"评论 / 留言"用途的 textarea，并在为空时填充推广文案
  function tryFillCommentTextareaWithPromotion(promotionText) {
    if (!promotionText) return;

    const targetTextarea = findLikelyCommentTextarea({ allowGenericFallback: true });
    if (!targetTextarea) return;

    // 仅在当前为空时填充，避免覆盖用户已经在编辑的内容
    if ((targetTextarea.value || '').trim()) {
      return;
    }

    setValue(targetTextarea, promotionText);
  }

  // 在生成推广文案后，将光标自动移动到最有可能的评论框：
  // - 如果评论框当前为空，则自动填入推广文案
  // - 无论是否填充，都将焦点与光标移动到评论框末尾，并滚动到视口中
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
      // 忽略焦点/滚动异常，避免影响主流程
      console.warn('尝试将焦点移动到评论框时出错：', e);
    }
  }

  // 收集当前页面内容 + 调用通义千问生成推广文案（仅负责返回文本，不做 UI 交互）
  async function generatePromotionCopyWithQwen() {
    const DASHSCOPE_API_KEY = await getDashScopeApiKey();
    const QWEN_SKILL_TEMPLATE = await getQwenSkillTemplate();

    if (!DASHSCOPE_API_KEY) {
      throw new Error(
        '尚未配置 DashScope / 通义千问 API Key，请打开扩展的"选项/设置"页面填写 API Key。'
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
      // 简单清洗、截断，避免内容过长
      bodyText = bodyText.replace(/\s+/g, ' ').trim();
      const MAX_LEN = 4000;
      if (bodyText.length > MAX_LEN) {
        bodyText = bodyText.slice(0, MAX_LEN) + ' …（内容已截断）';
      }
    }

    const websiteContent = [
      `【网站标题】${title}`,
      `【网站 URL】${websiteUrl}`,
      description ? `【网站描述】${description}` : '',
      '【页面正文节选】',
      bodyText || '（当前页面正文内容为空或无法提取）'
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = [
      '下面是当前网站的内容，请根据 Skill 模板的要求，为该网站生成一份推广文案：',
      '',
      websiteContent
    ].join('\n');

    // 调用 DashScope / 通义千问（OpenAI 兼容模式）
    const apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const requestBody = {
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: QWEN_SKILL_TEMPLATE },
        { role: 'user', content: userPrompt }
      ]
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DashScope API 响应异常：', response.status, errorText);
      throw new Error('通义千问接口调用失败，具体信息请查看控制台。');
    }

    const data = await response.json();

    const aiText =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? data.choices[0].message.content
        : '未能从通义千问响应中解析出文案内容。';

    console.log('通义千问生成的网站推广文案：\n', aiText);
    return aiText;
  }

  // ====== 页面内浮动窗口 UI：AI 生成推广文案 + 一键复制 ======

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
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = '#e5e7eb';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = '#9ca3af';
    });
    closeBtn.addEventListener('click', () => {
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
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
    generateBtn.style.background =
      'linear-gradient(135deg, #2563eb, #4f46e5)';
    generateBtn.style.color = '#f9fafb';
    generateBtn.style.boxShadow = '0 10px 24px rgba(37,99,235,0.45)';
    generateBtn.addEventListener('mouseenter', () => {
      if (generateBtn.disabled) return;
      generateBtn.style.filter = 'brightness(1.05)';
    });
    generateBtn.addEventListener('mouseleave', () => {
      generateBtn.style.filter = 'none';
    });

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

    // 暴露内部控件与方法，方便外部（例如自动生成流程）同步文案与状态
    qwenPanelEl._qwenTextarea = textarea;
    qwenPanelEl._qwenSetStatus = setStatus;
    qwenPanelEl._qwenSetCopyEnabled = setCopyEnabled;
    qwenPanelEl._qwenSetGenerateLoading = setGenerateLoading;

    // 如果在页面加载阶段已经自动生成过推广文案，则在首次打开浮动窗口时直接回显
    if (lastGeneratedPromotionCopy) {
      textarea.value = lastGeneratedPromotionCopy;
      setCopyEnabled(true);
      setStatus('已自动生成推广文案，可以复制使用。', '#22c55e');
    }

    function setStatus(text, color) {
      statusEl.textContent = text || '';
      if (color) {
        statusEl.style.color = color;
      }
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
        generateBtn.style.background =
          'linear-gradient(135deg, #2563eb, #4f46e5)';
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
        // 生成文案后，自动将焦点移动到页面中的评论框，并在需要时填充文案
        focusCommentTextareaWithPromotion(text);
      } catch (err) {
        console.error('调用通义千问生成推广文案失败：', err);
        const msg =
          (err && err.message) ||
          '调用通义千问失败，请检查控制台日志或 API Key 配置。';
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
        console.error('复制文案失败：', err);
        setStatus('复制失败，请手动选择文本复制。', '#f97373');
      }
    });
  }

  // 监听 background.js 中点击扩展图标发送的消息，打开/关闭浮动窗口
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      if (message && message.type === 'TOGGLE_PROMOTE_WITH_QWEN_PANEL') {
        createOrToggleQwenPanel();
      }
    });
  }
})();
