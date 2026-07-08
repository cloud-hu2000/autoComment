const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const Module = require('node:module');
const test = require('node:test');

const express = require('express');

function createDbMock() {
  const state = {
    orders: [],
    batches: [],
    purchases: [],
    executedSql: [],
    connectionSql: []
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
    if (/FROM\s+csv_batches\s+b/i.test(sql) && /LEFT\s+JOIN\s+user_csv_purchases/i.test(sql)) {
      const userId = params[0];
      return state.batches
        .filter((batch) => ['ready', 'disabled'].includes(batch.status))
        .map((batch) => {
          const purchase = state.purchases.find((item) => item.user_id === userId && item.batch_id === batch.id);
          return {
            ...clone(batch),
            purchase_user_id: purchase && purchase.user_id,
            purchase_out_trade_no: purchase && purchase.out_trade_no,
            purchase_batch_id: purchase && purchase.batch_id
          };
        });
    }

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
    if (/FROM\s+csv_batches/i.test(sql) && /WHERE\s+id\s*=\s*\?/i.test(sql)) {
      return clone(state.batches.find((batch) => batch.id === Number(params[0])));
    }

    if (/FROM\s+user_csv_purchases/i.test(sql) && /WHERE\s+user_id\s*=\s*\?/i.test(sql) && /batch_id\s*=\s*\?/i.test(sql)) {
      return clone(state.purchases.find((purchase) => purchase.user_id === params[0] && purchase.batch_id === Number(params[1])));
    }

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
          async beginTransaction() {},
          async commit() {},
          async rollback() {},
          async execute(sql, params = []) {
            state.connectionSql.push(sql);
            if (/GET_LOCK/i.test(sql)) {
              return [[{ locked: 1 }]];
            }

            if (/RELEASE_LOCK/i.test(sql)) {
              return [[{ released: 1 }]];
            }

            if (/FROM\s+payment_orders/i.test(sql) && /out_trade_no\s*=\s*\?/i.test(sql) && /FOR\s+UPDATE/i.test(sql)) {
              return [[clone(state.orders.find((order) => order.out_trade_no === params[0]))].filter(Boolean)];
            }

            if (/FROM\s+csv_batches/i.test(sql) && /WHERE\s+id\s*=\s*\?/i.test(sql) && /FOR\s+UPDATE/i.test(sql)) {
              return [[clone(state.batches.find((batch) => batch.id === Number(params[0])))].filter(Boolean)];
            }

            if (/FROM\s+payment_orders/i.test(sql) && /status\s+IN/i.test(sql)) {
              const order = activeOrderForUser(params[0], [params[1], params[2]]);
              return [[clone(order)].filter(Boolean)];
            }

            if (/FROM\s+blog_run_stats\s+s/i.test(sql)) {
              return [[]];
            }

            if (/INSERT\s+INTO\s+payment_orders/i.test(sql)) {
              const [outTradeNo, userId, planId, batchId, subject, amount] = params;
              const now = new Date();
              state.orders.push({
                id: state.orders.length + 1,
                out_trade_no: outTradeNo,
                alipay_trade_no: null,
                user_id: userId,
                plan_id: planId,
                batch_id: batchId,
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

            if (/INSERT\s+INTO\s+user_csv_purchases/i.test(sql)) {
              const [userId, batchId, outTradeNo, tokenHash] = params;
              const existing = state.purchases.find((purchase) => purchase.user_id === userId && purchase.batch_id === Number(batchId));
              if (!existing) {
                state.purchases.push({
                  id: state.purchases.length + 1,
                  user_id: userId,
                  batch_id: Number(batchId),
                  out_trade_no: outTradeNo,
                  purchase_token_hash: tokenHash,
                  paid_at: new Date('2026-06-27T10:00:00.000Z'),
                  granted_at: new Date('2026-06-27T10:00:00.000Z')
                });
              }
              return [{ affectedRows: 1, insertId: state.purchases.length }];
            }

            if (/UPDATE\s+payment_orders/i.test(sql) && /status\s*=\s*'fulfilled'/i.test(sql)) {
              const [alipayTradeNo, rawNotify, outTradeNo] = params;
              const order = state.orders.find((item) => item.out_trade_no === outTradeNo);
              if (order) {
                order.status = 'fulfilled';
                order.alipay_trade_no = alipayTradeNo;
                order.paid_at = order.paid_at || new Date('2026-06-27T10:00:00.000Z');
                order.fulfilled_at = order.fulfilled_at || new Date('2026-06-27T10:00:00.000Z');
                order.raw_notify = rawNotify;
                order.updated_at = new Date('2026-06-27T10:00:00.000Z');
              }
              return [{ affectedRows: order ? 1 : 0 }];
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
  const csvBatchesPath = require.resolve('../api/csv-batches');
  delete require.cache[dbPath];
  delete require.cache[alipayPath];
  delete require.cache[csvBatchesPath];
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

function loadCsvBatchesWithMocks(dbMock) {
  const dbPath = require.resolve('../api/db');
  const csvBatchesPath = require.resolve('../api/csv-batches');
  delete require.cache[dbPath];
  delete require.cache[csvBatchesPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: dbMock.exports
  };
  return require('../api/csv-batches');
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

  const quoteResponse = await fetch(`${app.baseUrl}/api/alipay/quote-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId: 'blog_250',
      couponCode: 'GEFEI'
    })
  });
  const quoteBody = await quoteResponse.json();

  assert.equal(quoteResponse.status, 200);
  assert.equal(quoteBody.success, true);
  assert.equal(quoteBody.plan.amount, '19.90');
  assert.equal(quoteBody.plan.originalAmount, '39.90');
  assert.equal(quoteBody.plan.discountAmount, '20.00');
  assert.equal(quoteBody.plan.couponCode, 'GEFEI');

  const invalidQuoteResponse = await fetch(`${app.baseUrl}/api/alipay/quote-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId: 'blog_250',
      couponCode: 'NOPE'
    })
  });
  const invalidQuoteBody = await invalidQuoteResponse.json();

  assert.equal(invalidQuoteResponse.status, 400);
  assert.equal(invalidQuoteBody.success, false);
  assert.equal(invalidQuoteBody.code, 'INVALID_COUPON');

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
  assert.equal(createBody.plan.amount, '39.90');
  assert.match(createBody.payUrl, /https:\/\/pay\.example\.test\/alipay\.trade\.page\.pay/);
  assert.match(createBody.payUrl, /timeout=2h/);
  assert.equal(createBody.remainingSeconds, 7200);
  assert.match(createBody.expiresAt, /^2026|^20/);

  const insertedOrder = dbMock.state.orders[0];
  assert.equal(insertedOrder.user_id, 'launch-user-001');
  assert.equal(insertedOrder.plan_id, 'blog_250');
  assert.equal(insertedOrder.status, 'pending_payment');
  assert.equal(String(insertedOrder.amount), '39.90');

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
      planId: 'as_50',
      couponCode: 'BEST-FRIEND'
    })
  });
  const cancelCreateBody = await cancelCreateResponse.json();

  assert.equal(cancelCreateResponse.status, 200);
  assert.equal(cancelCreateBody.success, true);
  assert.equal(cancelCreateBody.plan.amount, '9.90');
  assert.equal(cancelCreateBody.plan.originalAmount, '39.90');
  assert.equal(cancelCreateBody.plan.discountAmount, '30.00');
  assert.equal(cancelCreateBody.plan.couponCode, 'BEST-FRIEND');
  assert.match(cancelCreateBody.payUrl, /amount=9\.90/);

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
  assert.equal(recreateBody.plan.amount, '39.90');

  const invalidCouponResponse = await fetch(`${app.baseUrl}/api/alipay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'invalid-coupon-user-001',
      planId: 'blog_250',
      couponCode: 'NOPE'
    })
  });
  const invalidCouponBody = await invalidCouponResponse.json();

  assert.equal(invalidCouponResponse.status, 400);
  assert.equal(invalidCouponBody.success, false);
  assert.equal(invalidCouponBody.code, 'INVALID_COUPON');

  const notifyResponse = await fetch(`${app.baseUrl}/api/alipay/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: 'test-app-id',
      out_trade_no: createBody.outTradeNo,
      trade_no: '2026062722000000000001',
      total_amount: '39.90',
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
  assert.equal(statusBody.updatedAt, '2026-06-27T10:00:00.000Z');

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

test('csv batch payment grants download access idempotently', async (t) => {
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
  process.env.PURCHASE_TOKEN_SECRET = 'test-token-secret';

  const dbMock = createDbMock();
  dbMock.state.batches.push({
    id: 88,
    batch_no: 'BLOGS_20260601_20260701',
    file_name: 'blogs_20260601_20260701.csv',
    storage_path: 'E:\\autoComment-master\\autoComment-master\\storage\\csv-batches\\blogs_20260601_20260701.csv',
    sha256: 'abc',
    row_count: 250,
    source_start_date: new Date('2026-06-01T00:00:00.000Z'),
    source_end_date: new Date('2026-07-01T00:00:00.000Z'),
    source_started_at: new Date('2026-06-01T08:00:00.000Z'),
    source_ended_at: new Date('2026-07-01T08:00:00.000Z'),
    price: '39.90',
    status: 'ready',
    created_at: new Date('2026-07-04T02:00:00.000Z'),
    updated_at: new Date('2026-07-04T02:00:00.000Z')
  });

  const router = loadAlipayRouterWithMocks(dbMock);
  const app = await startApp(router);
  t.after(async () => {
    await app.close();
  });

  const createResponse = await fetch(`${app.baseUrl}/api/alipay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'csv-user-001',
      batchId: 88,
      couponCode: 'GEFEI'
    })
  });
  const createBody = await createResponse.json();

  assert.equal(createResponse.status, 200);
  assert.equal(createBody.success, true);
  assert.equal(createBody.plan.id, 'csv_batch');
  assert.equal(createBody.plan.batchId, 88);
  assert.equal(createBody.plan.name, 'blogs_20260601_20260701.csv');
  assert.equal(createBody.plan.amount, '19.90');
  assert.equal(createBody.plan.originalAmount, '39.90');
  assert.equal(createBody.plan.discountAmount, '20.00');
  assert.equal(createBody.plan.couponCode, 'GEFEI');

  const order = dbMock.state.orders.find((item) => item.out_trade_no === createBody.outTradeNo);
  assert.equal(order.user_id, 'csv-user-001');
  assert.equal(order.plan_id, 'csv_batch');
  assert.equal(order.batch_id, 88);
  assert.equal(order.status, 'pending_payment');
  assert.equal(String(order.amount), '19.90');

  const notifyBody = {
    app_id: 'test-app-id',
    out_trade_no: createBody.outTradeNo,
    trade_no: '2026062722000000000088',
    total_amount: '19.90',
    trade_status: 'TRADE_SUCCESS'
  };

  const notifyResponse = await fetch(`${app.baseUrl}/api/alipay/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notifyBody)
  });
  assert.equal(notifyResponse.status, 200);
  assert.equal(await notifyResponse.text(), 'success');
  assert.equal(order.status, 'fulfilled');
  assert.equal(order.alipay_trade_no, '2026062722000000000088');
  assert.equal(dbMock.state.purchases.length, 1);
  assert.equal(dbMock.state.purchases[0].user_id, 'csv-user-001');
  assert.equal(dbMock.state.purchases[0].batch_id, 88);
  assert.equal(dbMock.state.purchases[0].out_trade_no, createBody.outTradeNo);
  assert.match(dbMock.state.purchases[0].purchase_token_hash, /^[a-f0-9]{64}$/);

  const repeatNotifyResponse = await fetch(`${app.baseUrl}/api/alipay/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notifyBody)
  });
  assert.equal(repeatNotifyResponse.status, 200);
  assert.equal(await repeatNotifyResponse.text(), 'success');
  assert.equal(dbMock.state.purchases.length, 1);

  const duplicateResponse = await fetch(`${app.baseUrl}/api/alipay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'csv-user-001',
      batchId: 88
    })
  });
  const duplicateBody = await duplicateResponse.json();

  assert.equal(duplicateResponse.status, 409);
  assert.equal(duplicateBody.success, false);
  assert.equal(duplicateBody.code, 'CSV_ALREADY_PURCHASED');
});

test('csv export queries low and high AS batches separately', async () => {
  const dbMock = createDbMock();
  const csvBatches = loadCsvBatchesWithMocks(dbMock);

  const result = await csvBatches.runExportJob({ maxBatches: 1 });

  assert.equal(result.success, true);
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.remainingRows, {
    basic_low_as: 0,
    high_as: 0
  });

  const sql = dbMock.state.connectionSql.join('\n');
  assert.match(sql, /CAST\(TRIM\(s\.page_as\) AS DECIMAL\(10,2\)\)\s+<\s+50[\s\S]*LIMIT 250/);
  assert.match(sql, /CAST\(TRIM\(s\.page_as\) AS DECIMAL\(10,2\)\)\s+>\s+50[\s\S]*LIMIT 50/);
  assert.match(sql, /TRIM\(s\.page_as\) REGEXP '\^\[0-9\]\+\(\[.\]\[0-9\]\+\)\?\$'/);
});
