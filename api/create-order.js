const { AlipaySdk, AlipayFormData } = require('alipay-sdk').default;
const { AlipayConfig } = require('alipay-sdk/lib/constant').AlipayConfig;
const { v4: uuidv4 } = require('uuid');
const { orders } = require('./storage');

// 支付宝配置 - 需要在环境变量中设置
const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || 'your_app_id',
  privateKey: process.env.ALIPAY_PRIVATE_KEY || 'your_private_key',
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || 'alipay_public_key'
};

const sdk = new AlipaySdk(ALIPAY_CONFIG);

/**
 * 创建支付宝订单
 * POST /api/create-order
 * Body: { userId: string, points: number }
 */
module.exports = async function createOrder(req, res, body) {
  const { userId, points, amount } = body;

  if (!userId || !points || !amount) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '缺少必要参数' }));
    return;
  }

  // 生成订单号
  const orderId = `ORDER_${Date.now()}_${uuidv4().slice(0, 8)}`;

  // 创建支付宝统一订单请求
  const formData = new AlipayFormData();
  formData.setMethod('get');
  formData.addField('bizContent', {
    outTradeNo: orderId,
    productCode: 'FAST_INSTANT_TRADE_PAY',
    totalAmount: amount,
    subject: `积分充值 - ${points}积分`,
    body: `充值${points}积分到账户`
  });
  formData.addField('returnUrl', `${process.env.BASE_URL || 'https://your-domain.com'}/payment-success.html`);

  try {
    // 生成支付链接
    const payUrl = await sdk.exec(
      'alipay.trade.page.pay',
      {},
      { formData }
    );

    // 保存订单信息
    orders.set(orderId, {
      orderId,
      userId,
      points,
      amount,
      status: 'PENDING',
      createdAt: Date.now(),
      paidAt: null
    });

    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      orderId,
      payUrl,
      points,
      amount
    }));
  } catch (error) {
    console.error('创建支付宝订单失败:', error);
    res.writeHead(500);
    res.end(JSON.stringify({
      error: '创建订单失败',
      message: error.message
    }));
  }
};
