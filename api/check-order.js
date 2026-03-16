const { AlipaySdk } = require('alipay-sdk').default;
const { orders, users } = require('./storage');

const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || 'your_app_id',
  privateKey: process.env.ALIPAY_PRIVATE_KEY || 'your_private_key',
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || 'alipay_public_key'
};

const sdk = new AlipaySdk(ALIPAY_CONFIG);

/**
 * 检查订单支付状态
 * GET /api/check-order?orderId=xxx
 */
module.exports = async function checkOrder(req, res, query) {
  const { orderId, userId } = query;

  if (!orderId) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '缺少orderId参数' }));
    return;
  }

  // 先检查本地订单状态
  const localOrder = orders.get(orderId);

  if (localOrder) {
    if (localOrder.status === 'PAID') {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        paid: true,
        points: localOrder.points,
        orderId: localOrder.orderId
      }));
      return;
    }

    if (localOrder.status === 'PENDING') {
      // 查询支付宝订单状态
      try {
        const result = await sdk.exec('alipay.trade.query', {
          bizContent: {
            out_trade_no: orderId
          }
        });

        // 根据支付宝返回的trade_status判断
        const isPaid = result.code === '10000' &&
          (result.trade_status === 'TRADE_SUCCESS' || result.trade_status === 'TRADE_FINISHED');

        if (isPaid) {
          // 更新本地订单状态
          localOrder.status = 'PAID';
          localOrder.paidAt = Date.now();
          orders.set(orderId, localOrder);

          // 给用户增加积分
          const userPoints = users.get(userId) || 0;
          users.set(userId, userPoints + localOrder.points);

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            paid: true,
            points: localOrder.points,
            orderId: localOrder.orderId
          }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            paid: false,
            message: result.subMsg || '等待支付'
          }));
        }
      } catch (error) {
        console.error('查询支付宝订单失败:', error);
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          paid: false,
          message: '查询失败，请稍后重试'
        }));
      }
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: '订单不存在' }));
  }
};
