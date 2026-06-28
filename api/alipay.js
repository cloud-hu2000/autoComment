const express = require('express');
const crypto = require('crypto');
const { AlipaySdk } = require('alipay-sdk');

const { execute, getPool, query, queryOne } = require('./db');

const router = express.Router();

const ACTIVE_ORDER_STATUSES = ['pending_payment', 'paid_pending_fulfillment'];
const PAID_TRADE_STATUSES = ['TRADE_SUCCESS', 'TRADE_FINISHED'];
const PAYMENT_TIMEOUT_EXPRESS = '2h';
const PAYMENT_TIMEOUT_SECONDS = 2 * 60 * 60;
const PAYMENT_TIMEOUT_MS = PAYMENT_TIMEOUT_SECONDS * 1000;

const PLANS = {
  blog_250: {
    id: 'blog_250',
    name: '博客列表基础包',
    amount: '19.90',
    subject: 'AutoComment 博客列表基础包',
    body: '250条博客列表，最终转化率5%~10%'
  },
  as_50: {
    id: 'as_50',
    name: '高 AS 博客精选包',
    amount: '19.90',
    subject: 'AutoComment 高 AS 博客精选包',
    body: '50条 AS评分>50 的博客列表'
  }
};

const STATUS_TEXT = {
  none: '未购买',
  pending_payment: '待支付',
  paid_pending_fulfillment: '已支付，待人工发货',
  fulfilled: '已发货',
  closed: '已关闭',
  failed: '异常或失败'
};

let tablesReadyPromise = null;
let sdkInstance = null;
let sdkConfigFingerprint = '';

function getAlipayEnv() {
  return String(process.env.ALIPAY_ENV || 'sandbox').trim().toLowerCase() === 'production'
    ? 'production'
    : 'sandbox';
}

function getGateway() {
  if (process.env.ALIPAY_GATEWAY) {
    return process.env.ALIPAY_GATEWAY;
  }
  return getAlipayEnv() === 'production'
    ? 'https://openapi.alipay.com/gateway.do'
    : 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';
}

function maskAppId(appId) {
  const value = String(appId || '').trim();
  if (!value) return '';
  return value.length <= 4 ? '*'.repeat(value.length) : `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

function getConfigDiagnostics() {
  const appId = String(process.env.ALIPAY_APP_ID || '').trim();
  const gateway = getGateway();
  const env = getAlipayEnv();
  const expectedGateway = env === 'production'
    ? 'https://openapi.alipay.com/gateway.do'
    : 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';

  return {
    env,
    gateway,
    gatewayMatchesEnv: gateway === expectedGateway,
    appIdMasked: maskAppId(appId),
    appIdLength: appId.length,
    hasPrivateKey: !!String(process.env.ALIPAY_PRIVATE_KEY || '').trim(),
    hasAlipayPublicKey: !!String(process.env.ALIPAY_PUBLIC_KEY || '').trim(),
    keyType: String(process.env.ALIPAY_KEY_TYPE || 'PKCS8').trim().toUpperCase()
  };
}

function logConfigDiagnostics() {
  const diagnostics = getConfigDiagnostics();
  console.info('[alipay] config diagnostics:', diagnostics);
}

function wrapPem(value, type) {
  const raw = String(value || '').replace(/\\n/g, '\n').trim();
  if (!raw) return '';
  if (raw.includes('-----BEGIN')) return raw;

  const compact = raw.replace(/\s+/g, '');
  const lines = compact.match(/.{1,64}/g) || [];
  return [
    `-----BEGIN ${type}-----`,
    ...lines,
    `-----END ${type}-----`
  ].join('\n');
}

function parsePrivateKey(value, configuredKeyType) {
  const raw = String(value || '').replace(/\\n/g, '\n').trim();
  const normalizedConfiguredKeyType = configuredKeyType === 'PKCS1' ? 'PKCS1' : 'PKCS8';
  if (!raw) {
    throw new Error('缺少环境变量 ALIPAY_PRIVATE_KEY');
  }

  const candidates = [];
  if (raw.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    candidates.push({ keyType: 'PKCS1', privateKey: raw });
  } else if (raw.includes('-----BEGIN PRIVATE KEY-----')) {
    candidates.push({ keyType: 'PKCS8', privateKey: raw });
  } else if (raw.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')) {
    throw new Error('ALIPAY_PRIVATE_KEY 是加密私钥，当前服务不支持带密码私钥，请使用支付宝工具导出的未加密应用私钥');
  } else if (raw.includes('-----BEGIN')) {
    throw new Error('ALIPAY_PRIVATE_KEY 不是支持的 RSA 私钥格式，请使用 PKCS8 或 PKCS1 应用私钥');
  } else {
    const firstType = normalizedConfiguredKeyType;
    const secondType = firstType === 'PKCS8' ? 'PKCS1' : 'PKCS8';
    candidates.push({ keyType: firstType, privateKey: wrapPem(raw, firstType === 'PKCS1' ? 'RSA PRIVATE KEY' : 'PRIVATE KEY') });
    candidates.push({ keyType: secondType, privateKey: wrapPem(raw, secondType === 'PKCS1' ? 'RSA PRIVATE KEY' : 'PRIVATE KEY') });
  }

  const errors = [];
  for (const candidate of candidates) {
    try {
      crypto.createPrivateKey(candidate.privateKey);
      return candidate;
    } catch (error) {
      errors.push(`${candidate.keyType}: ${error.message}`);
    }
  }

  throw new Error(`ALIPAY_PRIVATE_KEY 无法解析，请检查私钥是否复制完整、是否混入引号/空格、ALIPAY_KEY_TYPE 是否正确。OpenSSL: ${errors.join(' | ')}`);
}

function normalizePublicKey(value) {
  return wrapPem(value, 'PUBLIC KEY');
}

function getRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

function getReturnUrl() {
  return process.env.ALIPAY_RETURN_URL || 'https://jieyunsang.cn/api/alipay/return';
}

function getNotifyUrl() {
  return process.env.ALIPAY_NOTIFY_URL || 'https://jieyunsang.cn/api/alipay/notify';
}

function getSdk() {
  const appId = getRequiredEnv('ALIPAY_APP_ID');
  const configuredKeyType = String(process.env.ALIPAY_KEY_TYPE || 'PKCS8').trim().toUpperCase() === 'PKCS1'
    ? 'PKCS1'
    : 'PKCS8';
  const { privateKey, keyType } = parsePrivateKey(getRequiredEnv('ALIPAY_PRIVATE_KEY'), configuredKeyType);
  const alipayPublicKey = normalizePublicKey(getRequiredEnv('ALIPAY_PUBLIC_KEY'));
  const gateway = getGateway();

  const fingerprint = JSON.stringify({
    appId,
    privateKey,
    alipayPublicKey,
    gateway,
    keyType
  });

  if (!sdkInstance || sdkConfigFingerprint !== fingerprint) {
    sdkInstance = new AlipaySdk({
      appId,
      privateKey,
      alipayPublicKey,
      gateway,
      keyType,
      signType: 'RSA2',
      charset: 'utf-8'
    });
    sdkConfigFingerprint = fingerprint;
  }

  return sdkInstance;
}

async function ensureTables() {
  if (!tablesReadyPromise) {
    tablesReadyPromise = (async () => {
      await execute(
        `
          CREATE TABLE IF NOT EXISTS payment_orders (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
            out_trade_no VARCHAR(64) NOT NULL COMMENT '本系统商户订单号，AC+时间戳+随机串；唯一',
            alipay_trade_no VARCHAR(128) DEFAULT NULL COMMENT '支付宝交易号，支付通知返回的 trade_no',
            user_id VARCHAR(255) NOT NULL COMMENT '用户ID，来自插件端用户标识',
            plan_id VARCHAR(64) NOT NULL COMMENT '套餐ID枚举：blog_250=博客列表基础包，as_50=高AS博客精选包',
            subject VARCHAR(255) NOT NULL COMMENT '支付订单标题，来自套餐 subject',
            amount DECIMAL(10,2) NOT NULL COMMENT '订单金额，单位：元',
            status VARCHAR(40) NOT NULL DEFAULT 'pending_payment' COMMENT '订单状态枚举：pending_payment=待支付，paid_pending_fulfillment=已支付待人工发货，fulfilled=已发货，closed=已关闭，failed=异常或失败',
            paid_at TIMESTAMP NULL DEFAULT NULL COMMENT '首次确认支付成功时间；支付宝 trade_status 为 TRADE_SUCCESS 或 TRADE_FINISHED 时写入',
            fulfilled_at TIMESTAMP NULL DEFAULT NULL COMMENT '人工发货完成时间',
            raw_notify JSON DEFAULT NULL COMMENT '最近一次支付宝异步通知原文JSON；trade_status 参考：WAIT_BUYER_PAY=等待买家付款，TRADE_SUCCESS=支付成功，TRADE_FINISHED=交易结束，TRADE_CLOSED=交易关闭',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录最后更新时间',
            PRIMARY KEY (id),
            UNIQUE KEY uk_payment_orders_out_trade_no (out_trade_no),
            INDEX idx_payment_orders_user_status (user_id, status),
            INDEX idx_payment_orders_user_created (user_id, created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付宝支付订单表'
        `,
        []
      );

      await execute(
        `
          ALTER TABLE payment_orders
            MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
            MODIFY out_trade_no VARCHAR(64) NOT NULL COMMENT '本系统商户订单号，AC+时间戳+随机串；唯一',
            MODIFY alipay_trade_no VARCHAR(128) DEFAULT NULL COMMENT '支付宝交易号，支付通知返回的 trade_no',
            MODIFY user_id VARCHAR(255) NOT NULL COMMENT '用户ID，来自插件端用户标识',
            MODIFY plan_id VARCHAR(64) NOT NULL COMMENT '套餐ID枚举：blog_250=博客列表基础包，as_50=高AS博客精选包',
            MODIFY subject VARCHAR(255) NOT NULL COMMENT '支付订单标题，来自套餐 subject',
            MODIFY amount DECIMAL(10,2) NOT NULL COMMENT '订单金额，单位：元',
            MODIFY status VARCHAR(40) NOT NULL DEFAULT 'pending_payment' COMMENT '订单状态枚举：pending_payment=待支付，paid_pending_fulfillment=已支付待人工发货，fulfilled=已发货，closed=已关闭，failed=异常或失败',
            MODIFY paid_at TIMESTAMP NULL DEFAULT NULL COMMENT '首次确认支付成功时间；支付宝 trade_status 为 TRADE_SUCCESS 或 TRADE_FINISHED 时写入',
            MODIFY fulfilled_at TIMESTAMP NULL DEFAULT NULL COMMENT '人工发货完成时间',
            MODIFY raw_notify JSON DEFAULT NULL COMMENT '最近一次支付宝异步通知原文JSON；trade_status 参考：WAIT_BUYER_PAY=等待买家付款，TRADE_SUCCESS=支付成功，TRADE_FINISHED=交易结束，TRADE_CLOSED=交易关闭',
            MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
            MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录最后更新时间',
            COMMENT='支付宝支付订单表'
        `,
        []
      );
    })().catch((error) => {
      tablesReadyPromise = null;
      throw error;
    });
  }
  return tablesReadyPromise;
}

function generateOutTradeNo() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AC${timestamp}${random}`;
}

function getPlan(planId) {
  return PLANS[planId] || null;
}

function formatDate(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function getOrderCreatedTime(row) {
  const createdAt = row && row.created_at;
  if (createdAt instanceof Date) return createdAt.getTime();
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getPendingOrderExpiresAt(row) {
  if (!row || row.status !== 'pending_payment') return null;
  const createdTime = getOrderCreatedTime(row);
  if (!createdTime) return null;
  return new Date(createdTime + PAYMENT_TIMEOUT_MS);
}

function getPendingOrderRemainingSeconds(row) {
  const expiresAt = getPendingOrderExpiresAt(row);
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
}

function buildPurchaseStatus(row) {
  if (!row) {
    return {
      success: true,
      status: 'none',
      statusText: STATUS_TEXT.none
    };
  }

  const plan = getPlan(row.plan_id);
  const result = {
    success: true,
    status: row.status,
    statusText: STATUS_TEXT[row.status] || row.status,
    planId: row.plan_id,
    planName: plan ? plan.name : row.plan_id,
    outTradeNo: row.out_trade_no,
    paidAt: formatDate(row.paid_at),
    fulfilledAt: formatDate(row.fulfilled_at),
    createdAt: formatDate(row.created_at)
  };
  const expiresAt = getPendingOrderExpiresAt(row);
  if (expiresAt) {
    result.expiresAt = expiresAt.toISOString();
    result.remainingSeconds = getPendingOrderRemainingSeconds(row);
  }
  return result;
}

function normalizeUserId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOutTradeNo(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function closeExpiredPendingOrders(userId) {
  await execute(
    `
      UPDATE payment_orders
      SET status = 'closed',
          updated_at = NOW()
      WHERE user_id = ?
        AND status = 'pending_payment'
        AND created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)
    `,
    [userId]
  );
}

async function findOrderForUser(userId, outTradeNo) {
  return queryOne(
    `
      SELECT *
      FROM payment_orders
      WHERE user_id = ?
        AND out_trade_no = ?
      LIMIT 1
    `,
    [userId, outTradeNo]
  );
}

async function findActiveOrder(userId) {
  return queryOne(
    `
      SELECT *
      FROM payment_orders
      WHERE user_id = ?
        AND status IN (?, ?)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId, ACTIVE_ORDER_STATUSES[0], ACTIVE_ORDER_STATUSES[1]]
  );
}

async function findDisplayOrder(userId) {
  return queryOne(
    `
      SELECT *
      FROM payment_orders
      WHERE user_id = ?
      ORDER BY CASE
          WHEN status = 'pending_payment' THEN 0
          WHEN status = 'paid_pending_fulfillment' THEN 1
          ELSE 2
        END,
        created_at DESC
      LIMIT 1
    `,
    [userId]
  );
}

function getActiveOrderError(order) {
  if (!order) return null;
  if (order.status === 'paid_pending_fulfillment') {
    return {
      code: 'PENDING_FULFILLMENT_EXISTS',
      message: '你已有已支付订单，正在等待人工发货'
    };
  }
  return {
    code: 'ACTIVE_ORDER_EXISTS',
    message: '你有一笔待支付订单，请先完成或等待订单关闭'
  };
}

function buildPayUrl({ outTradeNo, plan }) {
  const sdk = getSdk();
  return sdk.pageExecute('alipay.trade.page.pay', 'GET', {
    notifyUrl: getNotifyUrl(),
    returnUrl: getReturnUrl(),
    bizContent: {
      out_trade_no: outTradeNo,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: plan.amount,
      subject: plan.subject,
      body: plan.body,
      timeout_express: PAYMENT_TIMEOUT_EXPRESS
    }
  });
}

function isExpiredPendingOrder(order) {
  return order && order.status === 'pending_payment' && getPendingOrderRemainingSeconds(order) <= 0;
}

async function markPendingOrderClosed(userId, outTradeNo) {
  await execute(
    `
      UPDATE payment_orders
      SET status = 'closed',
          updated_at = NOW()
      WHERE user_id = ?
        AND out_trade_no = ?
        AND status = 'pending_payment'
    `,
    [userId, outTradeNo]
  );
}

function isAlipaySuccess(result) {
  return result && String(result.code) === '10000';
}

function isAlipayTradeNotExist(result) {
  const subCode = String(result && (result.subCode || result.sub_code || '')).toUpperCase();
  return subCode === 'ACQ.TRADE_NOT_EXIST';
}

async function closeAlipayTrade(outTradeNo) {
  const sdk = getSdk();
  return sdk.exec('alipay.trade.close', {
    bizContent: {
      out_trade_no: outTradeNo
    }
  });
}

async function createOrder(req, res) {
  const { userId, planId } = req.body || {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ success: false, error: '缺少 userId 参数' });
  }

  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return res.status(400).json({ success: false, error: '缺少 userId 参数' });
  }

  const plan = getPlan(planId);
  if (!plan) {
    return res.status(400).json({ success: false, error: '无效的套餐' });
  }

  let conn = null;
  let lockName = '';
  let lockAcquired = false;

  try {
    await ensureTables();
    await closeExpiredPendingOrders(normalizedUserId);

    conn = await getPool().getConnection();
    lockName = `payment_order:${normalizedUserId}`;
    const [lockRows] = await conn.execute('SELECT GET_LOCK(?, 5) AS locked', [lockName]);
    const lockRow = lockRows && lockRows[0];
    lockAcquired = !!(lockRow && Number(lockRow.locked) === 1);
    if (!lockAcquired) {
      return res.status(429).json({
        success: false,
        code: 'ORDER_LOCK_TIMEOUT',
        message: '订单创建处理中，请稍后重试'
      });
    }

    const [activeRows] = await conn.execute(
      `
        SELECT *
        FROM payment_orders
        WHERE user_id = ?
          AND status IN (?, ?)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [normalizedUserId, ACTIVE_ORDER_STATUSES[0], ACTIVE_ORDER_STATUSES[1]]
    );
    const activeOrder = activeRows && activeRows[0];
    if (activeOrder && activeOrder.status === 'pending_payment') {
      const activePlan = getPlan(activeOrder.plan_id);
      if (!activePlan) {
        return res.status(409).json({
          success: false,
          code: 'ACTIVE_ORDER_EXISTS',
          message: '你有一笔待支付订单，请先完成或等待订单关闭',
          order: buildPurchaseStatus(activeOrder)
        });
      }
      return res.status(200).json({
        success: true,
        reused: true,
        outTradeNo: activeOrder.out_trade_no,
        payUrl: buildPayUrl({ outTradeNo: activeOrder.out_trade_no, plan: activePlan }),
        env: getAlipayEnv(),
        order: buildPurchaseStatus(activeOrder),
        plan: {
          id: activePlan.id,
          name: activePlan.name,
          amount: activePlan.amount
        }
      });
    }

    const activeOrderError = getActiveOrderError(activeOrder);
    if (activeOrderError) {
      return res.status(409).json({
        success: false,
        ...activeOrderError,
        order: activeOrder ? buildPurchaseStatus(activeOrder) : null
      });
    }

    const outTradeNo = generateOutTradeNo();
    const payUrl = buildPayUrl({ outTradeNo, plan });

    await conn.execute(
      `
        INSERT INTO payment_orders
          (out_trade_no, user_id, plan_id, subject, amount, status, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, 'pending_payment', NOW(), NOW())
      `,
      [outTradeNo, normalizedUserId, plan.id, plan.subject, plan.amount]
    );

    return res.status(200).json({
      success: true,
      outTradeNo,
      payUrl,
      env: getAlipayEnv(),
      expiresAt: new Date(Date.now() + PAYMENT_TIMEOUT_MS).toISOString(),
      remainingSeconds: PAYMENT_TIMEOUT_SECONDS,
      plan: {
        id: plan.id,
        name: plan.name,
        amount: plan.amount
      }
    });
  } catch (error) {
    console.error('[alipay] create-order failed:', error);
    return res.status(500).json({
      success: false,
      error: '创建支付宝订单失败',
      message: error.message
    });
  } finally {
    if (conn && lockAcquired && lockName) {
      await conn.execute('SELECT RELEASE_LOCK(?) AS released', [lockName]).catch((error) => {
        console.error('[alipay] release order lock failed:', error);
      });
    }
    if (conn) {
      conn.release();
    }
  }
}

async function continueOrder(req, res) {
  const { userId, outTradeNo } = req.body || {};
  const normalizedUserId = normalizeUserId(userId);
  const normalizedOutTradeNo = normalizeOutTradeNo(outTradeNo);

  if (!normalizedUserId) {
    return res.status(400).json({ success: false, error: '缺少 userId 参数' });
  }
  if (!normalizedOutTradeNo) {
    return res.status(400).json({ success: false, error: '缺少 outTradeNo 参数' });
  }

  try {
    await ensureTables();
    await closeExpiredPendingOrders(normalizedUserId);

    const order = await findOrderForUser(normalizedUserId, normalizedOutTradeNo);
    if (!order) {
      return res.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', message: '订单不存在' });
    }
    if (isExpiredPendingOrder(order)) {
      await markPendingOrderClosed(normalizedUserId, normalizedOutTradeNo);
      return res.status(410).json({
        success: false,
        code: 'ORDER_EXPIRED',
        message: '待支付订单已超时关闭',
        order: { ...buildPurchaseStatus(order), status: 'closed', statusText: STATUS_TEXT.closed }
      });
    }
    if (order.status !== 'pending_payment') {
      return res.status(409).json({
        success: false,
        code: 'ORDER_NOT_PENDING_PAYMENT',
        message: '只有待支付订单可以继续支付',
        order: buildPurchaseStatus(order)
      });
    }

    const plan = getPlan(order.plan_id);
    if (!plan) {
      return res.status(409).json({
        success: false,
        code: 'UNKNOWN_ORDER_PLAN',
        message: '订单套餐不存在，无法继续支付',
        order: buildPurchaseStatus(order)
      });
    }

    return res.status(200).json({
      success: true,
      reused: true,
      outTradeNo: order.out_trade_no,
      payUrl: buildPayUrl({ outTradeNo: order.out_trade_no, plan }),
      env: getAlipayEnv(),
      order: buildPurchaseStatus(order),
      plan: {
        id: plan.id,
        name: plan.name,
        amount: plan.amount
      }
    });
  } catch (error) {
    console.error('[alipay] continue-order failed:', error);
    return res.status(500).json({
      success: false,
      error: '继续支付订单失败',
      message: error.message
    });
  }
}

async function cancelOrder(req, res) {
  const { userId, outTradeNo } = req.body || {};
  const normalizedUserId = normalizeUserId(userId);
  const normalizedOutTradeNo = normalizeOutTradeNo(outTradeNo);

  if (!normalizedUserId) {
    return res.status(400).json({ success: false, error: '缺少 userId 参数' });
  }
  if (!normalizedOutTradeNo) {
    return res.status(400).json({ success: false, error: '缺少 outTradeNo 参数' });
  }

  try {
    await ensureTables();
    await closeExpiredPendingOrders(normalizedUserId);

    const order = await findOrderForUser(normalizedUserId, normalizedOutTradeNo);
    if (!order) {
      return res.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', message: '订单不存在' });
    }
    if (order.status !== 'pending_payment') {
      return res.status(409).json({
        success: false,
        code: 'ORDER_NOT_PENDING_PAYMENT',
        message: '只有待支付订单可以取消',
        order: buildPurchaseStatus(order)
      });
    }

    let closeResult = null;
    if (!isExpiredPendingOrder(order)) {
      closeResult = await closeAlipayTrade(normalizedOutTradeNo);
      if (!isAlipaySuccess(closeResult) && !isAlipayTradeNotExist(closeResult)) {
        return res.status(502).json({
          success: false,
          code: 'ALIPAY_CLOSE_FAILED',
          message: (closeResult && (closeResult.subMsg || closeResult.sub_msg || closeResult.msg)) || '支付宝关闭交易失败',
          alipay: closeResult,
          order: buildPurchaseStatus(order)
        });
      }
    }

    await markPendingOrderClosed(normalizedUserId, normalizedOutTradeNo);
    return res.status(200).json({
      success: true,
      status: 'closed',
      statusText: STATUS_TEXT.closed,
      outTradeNo: normalizedOutTradeNo,
      alipay: closeResult
    });
  } catch (error) {
    console.error('[alipay] cancel-order failed:', error);
    return res.status(500).json({
      success: false,
      error: '取消订单失败',
      message: error.message
    });
  }
}

function normalizeNotifyBody(body) {
  const normalized = {};
  Object.keys(body || {}).forEach((key) => {
    const value = body[key];
    normalized[key] = Array.isArray(value) ? value[0] : value;
  });
  return normalized;
}

async function handleNotify(req, res) {
  const notifyData = normalizeNotifyBody(req.body);

  try {
    await ensureTables();

    const sdk = getSdk();
    const signOk = sdk.checkNotifySignV2(notifyData);
    if (!signOk) {
      console.warn('[alipay] notify sign check failed:', notifyData);
      return res.status(400).send('failure');
    }

    const outTradeNo = notifyData.out_trade_no;
    const order = await queryOne('SELECT * FROM payment_orders WHERE out_trade_no = ?', [outTradeNo]);
    if (!order) {
      console.warn('[alipay] notify order not found:', outTradeNo);
      return res.status(404).send('failure');
    }

    if (notifyData.app_id && notifyData.app_id !== process.env.ALIPAY_APP_ID) {
      console.warn('[alipay] notify app_id mismatch:', notifyData.app_id);
      return res.status(400).send('failure');
    }

    const notifyAmount = Number(notifyData.total_amount);
    const orderAmount = Number(order.amount);
    if (!Number.isFinite(notifyAmount) || Math.abs(notifyAmount - orderAmount) > 0.001) {
      console.warn('[alipay] notify amount mismatch:', {
        outTradeNo,
        notifyAmount,
        orderAmount
      });
      return res.status(400).send('failure');
    }

    const tradeStatus = notifyData.trade_status;
    const rawNotify = JSON.stringify(notifyData);
    if (PAID_TRADE_STATUSES.includes(tradeStatus)) {
      await execute(
        `
          UPDATE payment_orders
          SET status = CASE
                WHEN status = 'fulfilled' THEN status
                ELSE 'paid_pending_fulfillment'
              END,
              alipay_trade_no = ?,
              paid_at = COALESCE(paid_at, NOW()),
              raw_notify = ?,
              updated_at = NOW()
          WHERE out_trade_no = ?
        `,
        [notifyData.trade_no || null, rawNotify, outTradeNo]
      );
      return res.status(200).send('success');
    }

    if (tradeStatus === 'TRADE_CLOSED') {
      await execute(
        `
          UPDATE payment_orders
          SET status = CASE
                WHEN status IN ('pending_payment', 'failed') THEN 'closed'
                ELSE status
              END,
              alipay_trade_no = ?,
              raw_notify = ?,
              updated_at = NOW()
          WHERE out_trade_no = ?
        `,
        [notifyData.trade_no || null, rawNotify, outTradeNo]
      );
      return res.status(200).send('success');
    }

    await execute(
      `
        UPDATE payment_orders
        SET raw_notify = ?,
            updated_at = NOW()
        WHERE out_trade_no = ?
      `,
      [rawNotify, outTradeNo]
    );

    return res.status(200).send('success');
  } catch (error) {
    console.error('[alipay] notify failed:', error);
    return res.status(500).send('failure');
  }
}

async function purchaseStatus(req, res) {
  const { userId } = req.query || {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ success: false, error: '缺少 userId 参数' });
  }

  try {
    await ensureTables();
    const normalizedUserId = userId.trim();
    await closeExpiredPendingOrders(normalizedUserId);
    const displayOrder = await findDisplayOrder(normalizedUserId);
    return res.status(200).json(buildPurchaseStatus(displayOrder));
  } catch (error) {
    console.error('[alipay] purchase-status failed:', error);
    return res.status(500).json({
      success: false,
      error: '查询套餐状态失败',
      message: error.message
    });
  }
}

async function listOrders(req, res) {
  const { userId } = req.query || {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ success: false, error: '缺少 userId 参数' });
  }

  try {
    await ensureTables();
    await closeExpiredPendingOrders(userId.trim());
    const rows = await query(
      `
        SELECT *
        FROM payment_orders
        WHERE user_id = ?
        ORDER BY CASE
            WHEN status = 'pending_payment' THEN 0
            WHEN status = 'paid_pending_fulfillment' THEN 1
            ELSE 2
          END,
          created_at DESC
        LIMIT 20
      `,
      [userId.trim()]
    );
    return res.status(200).json({
      success: true,
      orders: rows.map((row) => buildPurchaseStatus(row))
    });
  } catch (error) {
    console.error('[alipay] orders failed:', error);
    return res.status(500).json({
      success: false,
      error: '查询订单失败',
      message: error.message
    });
  }
}

function returnPage(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>支付结果 - AutoComment</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f5f5f7;
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .card {
        width: min(420px, calc(100vw - 32px));
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      h1 { margin: 0 0 10px; font-size: 20px; }
      p { margin: 0; color: #4b5563; line-height: 1.7; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>支付结果处理中</h1>
      <p>支付宝已返回支付页面。订单是否成功以服务器异步通知为准，请回到插件设置页查看套餐状态。</p>
    </div>
  </body>
</html>`);
}

function configDiagnostics(req, res) {
  res.status(200).json({
    success: true,
    diagnostics: getConfigDiagnostics()
  });
}

router.post('/alipay/create-order', createOrder);
router.post('/alipay/continue-order', continueOrder);
router.post('/alipay/cancel-order', cancelOrder);
router.post('/alipay/notify', handleNotify);
router.get('/alipay/return', returnPage);
router.get('/alipay/config-diagnostics', configDiagnostics);
router.get('/purchase-status', purchaseStatus);
router.get('/alipay/orders', listOrders);

router.ensureTables = ensureTables;
router.logConfigDiagnostics = logConfigDiagnostics;
router.PLANS = PLANS;
router.STATUS_TEXT = STATUS_TEXT;

module.exports = router;
