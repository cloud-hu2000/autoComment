const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const Module = require('node:module');
const test = require('node:test');

const express = require('express');

function createDbMock() {
  const state = {
    orders: [],
    executedSql: []
  };

  function clone(row) {
    return row ? { ...row } : null;
  }

  function latestOrderForUser(userId) {
    return state.orders
      .filter((order) => order.user_id === userId)
      .sort((a, b) => b.id - a.id)[0] || null;
  }

  function activeOrderForUser(userId, statuses) {
    return state.orders
      .filter((order) => order.user_id === userId && statuses.includes(order.status))
      .sort((a, b) => b.id - a.id)[0] || null;
  }

  async function execute(sql, params = []) {
    state.executedSql.push(sql);
    if (/UPDATE\s+payment_orders/i.test(sql) && /SET\s+status\s*=\s*'closed'/i.test(sql) && /out_trade_no/i.test(sql)) {
      const [userId, outTradeNo] = params;
      const order = state.orders.find((item) => item.user_id === userId && item.out_trade_no === outTradeNo);
      if (order && order.status === 'pending_payment') {
        order.status = 'closed';
        order.updated_at = new Date('2026-06-27T10:00:00.000Z');
      }
      return { affectedRows: order ? 1 : 0 };
    }

    if (/UPDATE\s+payment_orders/i.test(sql) && /paid_pending_fulfillment/i.test(sql)) {
      const [alipayTradeNo, rawNotify, outTradeNo] = params;
      const order = state.orders.find((item) => item.out_trade_no === outTradeNo);
      if (order) {
        if (order.status !== 'fulfilled') {
          order.status = 'paid_pending_fulfillment';
        }
        order.alipay_trade_no = alipayTradeNo;
        order.paid_at = order.paid_at || new Date('2026-06-27T10:00:00.000Z');
        order.raw_notify = rawNotify;
        order.updated_at = new Date('2026-06-27T10:00:00.000Z');
      }
      return { affectedRows: order ? 1 : 0 };
    }

    if (/UPDATE\s+payment_orders/i.test(sql) && /TRADE_CLOSED|closed/i.test(sql)) {
      const [alipayTradeNo, rawNotify, outTradeNo] = params;
      const order = state.orders.find((item) => item.out_trade_no === outTradeNo);
      if (order) {
        if (['pending_payment', 'failed'].includes(order.status)) {
          order.status = 'closed';
        }
        order.alipay_trade_no = alipayTradeNo;
        order.raw_notify = rawNotify;
        order.updated_at = new Date('2026-06-27T10:00:00.000Z');
      }
      return { affectedRows: order ? 1 : 0 };
    }

    if (/UPDATE\s+payment_orders/i.test(sql) && /raw_notify/i.test(sql)) {
      const [rawNotify, outTradeNo] = params;
      const order = state.orders.find((item) => item.out_trade_no === outTradeNo);
      if (order) {
        order.raw_notify = rawNotify;
        order.updated_at = new Date('2026-06-27T10:00:00.000Z');
      }
      return { affectedRows: order ? 1 : 0 };
    }

    return { affectedRows: 0 };
  }

  async function query(sql, params = []) {
    if (/FROM\s+payment_orders/i.test(sql) && /WHERE\s+user_id/i.test(sql)) {
      return state.orders
        .filter((order) => order.user_id === params[0])
        .sort((a, b) => b.id - a.id)
        .slice(0, 20)
        .map(clone);
    }
    return [];
  }

  async function queryOne(sql, params = []) {
    if (/WHERE\s+user_id\s*=\s*\?/i.test(sql) && /out_trade_no\s*=\s*\?/i.test(sql)) {
      return clone(state.orders.find((order) => order.user_id === params[0] && order.out_trade_no === params[1]));
    }

    if (/WHERE\s+out_trade_no\s*=\s*\?/i.test(sql)) {
      return clone(state.orders.find((order) => order.out_trade_no === params[0]));
    }

    if (/WHERE\s+user_id\s*=\s*\?/i.test(sql)) {
      return clone(latestOrderForUser(params[0]));
    }

    return null;
  }

  function getPool() {
    return {
      async getConnection() {
        return {
          async execute(sql, params = []) {
            if (/GET_LOCK/i.test(sql)) {
              return [[{ locked: 1 }]];
            }

            if (/RELEASE_LOCK/i.test(sql)) {
              return [[{ released: 1 }]];
            }

            if (/FROM\s+payment_orders/i.test(sql) && /status\s+IN/i.test(sql)) {
              const order = activeOrderForUser(params[0], [params[1], params[2]]);
              return [[clone(order)].filter(Boolean)];
            }

            if (/INSERT\s+INTO\s+payment_orders/i.test(sql)) {
              const [outTradeNo, userId, planId, subject, amount] = params;
              const now = new Date();
              state.orders.push({
                id: state.orders.length + 1,
                out_trade_no: outTradeNo,
                alipay_trade_no: null,
                user_id: userId,
                plan_id: planId,
                subject,
                amount,
                status: 'pending_payment',
                paid_at: null,
                fulfilled_at: null,
                raw_notify: null,
                created_at: now,
                updated_at: now
              });
              return [{ affectedRows: 1, insertId: state.orders.length }];
            }

            return [{ affectedRows: 0 }];
          },
          release() {}
        };
      }
    };
  }

  return {
    state,
    exports: {
      execute,
      getPool,
      query,
      queryOne
    }
  };
}

function loadAlipayRouterWithMocks(dbMock) {
  const dbPath = require.resolve('../api/db');
  const alipayPath = require.resolve('../api/alipay');
  delete require.cache[dbPath];
  delete require.cache[alipayPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: dbMock.exports
  };

  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'alipay-sdk') {
      return {
        AlipaySdk: class FakeAlipaySdk {
          pageExecute(method, httpMethod, options) {
            const tradeNo = options.bizContent.out_trade_no;
            return `https://pay.example.test/${method}?out_trade_no=${tradeNo}&amount=${options.bizContent.total_amount}&timeout=${options.bizContent.timeout_express}`;
          }

          checkNotifySignV2() {
            return true;
          }

          exec(method, params) {
            return Promise.resolve({
              code: '10000',
              msg: 'Success',
              outTradeNo: params.bizContent.out_trade_no
            });
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require('../api/alipay');
  } finally {
    Module._load = originalLoad;
  }
}

async function startApp(router) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    })
  };
}

test('payment launch smoke: order creation, paid notify, status, duplicate guard', async (t) => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    }
  });

  process.env.ALIPAY_APP_ID = 'test-app-id';
  process.env.ALIPAY_PRIVATE_KEY = privateKey;
  process.env.ALIPAY_PUBLIC_KEY = publicKey;
  process.env.ALIPAY_ENV = 'sandbox';

  const dbMock = createDbMock();
  const router = loadAlipayRouterWithMocks(dbMock);
  const app = await startApp(router);
  t.after(async () => {
    await app.close();
  });

  const createResponse = await fetch(`${app.baseUrl}/api/alipay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'launch-user-001',
      planId: 'blog_250'
    })
  });
  const createBody = await createResponse.json();

  assert.equal(createResponse.status, 200);
  assert.equal(createBody.success, true);
  assert.match(createBody.outTradeNo, /^AC\d{14}[A-Z0-9]{6}$/);
  assert.equal(createBody.env, 'sandbox');
  assert.equal(createBody.plan.id, 'blog_250');
  assert.match(createBody.payUrl, /https:\/\/pay\.example\.test\/alipay\.trade\.page\.pay/);
  assert.match(createBody.payUrl, /timeout=2h/);
  assert.equal(createBody.remainingSeconds, 7200);
  assert.match(createBody.expiresAt, /^2026|^20/);

  const insertedOrder = dbMock.state.orders[0];
  assert.equal(insertedOrder.user_id, 'launch-user-001');
  assert.equal(insertedOrder.plan_id, 'blog_250');
  assert.equal(insertedOrder.status, 'pending_payment');
  assert.equal(String(insertedOrder.amount), '19.90');

  const reuseResponse = await fetch(`${app.baseUrl}/api/alipay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'launch-user-001',
      planId: 'as_50'
    })
  });
  const reuseBody = await reuseResponse.json();

  assert.equal(reuseResponse.status, 200);
  assert.equal(reuseBody.success, true);
  assert.equal(reuseBody.reused, true);
  assert.equal(reuseBody.outTradeNo, createBody.outTradeNo);
  assert.equal(reuseBody.order.status, 'pending_payment');
  assert.ok(reuseBody.order.remainingSeconds > 7190);
  assert.ok(reuseBody.order.remainingSeconds <= 7200);
  assert.match(reuseBody.payUrl, /timeout=2h/);
  assert.equal(dbMock.state.orders.length, 1);

  const ordersResponse = await fetch(`${app.baseUrl}/api/alipay/orders?userId=launch-user-001`);
  const ordersBody = await ordersResponse.json();

  assert.equal(ordersResponse.status, 200);
  assert.equal(ordersBody.success, true);
  assert.equal(ordersBody.orders.length, 1);
  assert.equal(ordersBody.orders[0].status, 'pending_payment');
  assert.equal(ordersBody.orders[0].outTradeNo, createBody.outTradeNo);

  const continueResponse = await fetch(`${app.baseUrl}/api/alipay/continue-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'launch-user-001',
      outTradeNo: createBody.outTradeNo
    })
  });
  const continueBody = await continueResponse.json();

  assert.equal(continueResponse.status, 200);
  assert.equal(continueBody.success, true);
  assert.equal(continueBody.reused, true);
  assert.equal(continueBody.outTradeNo, createBody.outTradeNo);
  assert.match(continueBody.payUrl, /alipay\.trade\.page\.pay/);

  const cancelCreateResponse = await fetch(`${app.baseUrl}/api/alipay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'cancel-user-001',
      planId: 'as_50'
    })
  });
  const cancelCreateBody = await cancelCreateResponse.json();

  assert.equal(cancelCreateResponse.status, 200);
  assert.equal(cancelCreateBody.success, true);

  const cancelResponse = await fetch(`${app.baseUrl}/api/alipay/cancel-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'cancel-user-001',
      outTradeNo: cancelCreateBody.outTradeNo
    })
  });
  const cancelBody = await cancelResponse.json();

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelBody.success, true);
  assert.equal(cancelBody.status, 'closed');
  assert.equal(dbMock.state.orders.find((order) => order.out_trade_no === cancelCreateBody.outTradeNo).status, 'closed');

  const recreateResponse = await fetch(`${app.baseUrl}/api/alipay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'cancel-user-001',
      planId: 'blog_250'
    })
  });
  const recreateBody = await recreateResponse.json();

  assert.equal(recreateResponse.status, 200);
  assert.equal(recreateBody.success, true);
  assert.notEqual(recreateBody.outTradeNo, cancelCreateBody.outTradeNo);

  const notifyResponse = await fetch(`${app.baseUrl}/api/alipay/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: 'test-app-id',
      out_trade_no: createBody.outTradeNo,
      trade_no: '2026062722000000000001',
      total_amount: '19.90',
      trade_status: 'TRADE_SUCCESS'
    })
  });
  const notifyText = await notifyResponse.text();

  assert.equal(notifyResponse.status, 200);
  assert.equal(notifyText, 'success');
  assert.equal(insertedOrder.status, 'paid_pending_fulfillment');
  assert.equal(insertedOrder.alipay_trade_no, '2026062722000000000001');
  assert.ok(insertedOrder.paid_at instanceof Date);
  assert.equal(JSON.parse(insertedOrder.raw_notify).trade_status, 'TRADE_SUCCESS');

  const statusResponse = await fetch(`${app.baseUrl}/api/purchase-status?userId=launch-user-001`);
  const statusBody = await statusResponse.json();

  assert.equal(statusResponse.status, 200);
  assert.equal(statusBody.success, true);
  assert.equal(statusBody.status, 'paid_pending_fulfillment');
  assert.equal(statusBody.planId, 'blog_250');
  assert.equal(statusBody.outTradeNo, createBody.outTradeNo);

  const duplicateResponse = await fetch(`${app.baseUrl}/api/alipay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'launch-user-001',
      planId: 'as_50'
    })
  });
  const duplicateBody = await duplicateResponse.json();

  assert.equal(duplicateResponse.status, 409);
  assert.equal(duplicateBody.success, false);
  assert.equal(duplicateBody.code, 'PENDING_FULFILLMENT_EXISTS');
  assert.equal(dbMock.state.orders.filter((order) => order.user_id === 'launch-user-001').length, 1);

  const schemaSql = dbMock.state.executedSql.join('\n');
  assert.match(schemaSql, /COMMENT/);
  assert.match(schemaSql, /pending_payment/);
  assert.match(schemaSql, /paid_pending_fulfillment/);
  assert.match(schemaSql, /TRADE_SUCCESS/);
});
