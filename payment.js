const USER_ID_STORAGE_KEY = 'auto_comment_user_id';
const API_BASE = 'https://jieyunsang.cn/api';
const API_ORIGIN = new URL(API_BASE).origin;

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backBtn');
  const refreshBatchesBtn = document.getElementById('refreshBatchesBtn');
  const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
  const batchList = document.getElementById('batchList');
  const pendingOrdersList = document.getElementById('pendingOrdersList');
  const payBtn = document.getElementById('payBtn');
  const payStatus = document.getElementById('payStatus');
  const userIdText = document.getElementById('userIdText');
  const selectedFileText = document.getElementById('selectedFileText');
  const selectedRangeText = document.getElementById('selectedRangeText');
  const couponCodeInput = document.getElementById('couponCodeInput');
  const discountAmountText = document.getElementById('discountAmountText');
  const priceText = document.getElementById('priceText');

  let currentUserId = '';
  let batches = [];
  let pendingOrders = [];
  let selectedBatchId = null;
  let currentOrder = null;
  let countdownTimer = null;
  let loading = false;
  let quoteTimer = null;
  let quoteRequestId = 0;
  let priceQuote = null;
  let priceQuoteError = '';
  let priceQuoteLoading = false;

  function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    return element;
  }

  function setStatus(text, isError = false) {
    payStatus.textContent = text;
    payStatus.style.color = isError ? '#dc2626' : '#6b7280';
  }

  function setEmpty(container, text) {
    container.innerHTML = '';
    container.appendChild(createTextElement('div', 'empty-state', text));
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRemaining(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    if (hours > 0) {
      return `${hours}小时${String(minutes).padStart(2, '0')}分${String(secs).padStart(2, '0')}秒`;
    }
    return `${minutes}分${String(secs).padStart(2, '0')}秒`;
  }

  function getSelectedBatch() {
    return batches.find((batch) => Number(batch.batchId) === Number(selectedBatchId)) || null;
  }

  function isPurchased(batch) {
    return batch && batch.purchaseStatus === 'purchased';
  }

  function isAvailable(batch) {
    return batch && batch.purchaseStatus === 'available';
  }

  function isPendingOrder(order) {
    return order && order.status === 'pending_payment' && Number(order.remainingSeconds) > 0;
  }

  function getBatchForOrder(order) {
    if (!order || !order.batchId) return null;
    return batches.find((batch) => Number(batch.batchId) === Number(order.batchId)) || null;
  }

  function formatMoney(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
  }

  function formatCurrency(value) {
    return `￥${formatMoney(value)}`;
  }

  function getCouponCode() {
    return couponCodeInput ? couponCodeInput.value.trim().toUpperCase() : '';
  }

  function getCheckoutPricing(batch, order) {
    if (!batch && !order) return null;
    const originalAmount = Number((batch && batch.price) || (order && order.amount) || 0);
    const orderAmount = order && order.amount ? Number(order.amount) : null;
    const quotedBatchId = priceQuote && Number(priceQuote.batchId) === Number(batch && batch.batchId);
    const quotedCouponCode = priceQuote && String(priceQuote.couponCode || '') === getCouponCode();
    if (!Number.isFinite(orderAmount) && quotedBatchId && quotedCouponCode) {
      return {
        originalAmount: formatMoney(priceQuote.originalAmount),
        payableAmount: formatMoney(priceQuote.amount),
        discountAmount: formatMoney(priceQuote.discountAmount)
      };
    }

    const payableAmount = Number.isFinite(orderAmount) ? orderAmount : originalAmount;
    const discountAmount = Math.max(0, originalAmount - payableAmount);
    return {
      originalAmount: formatMoney(originalAmount),
      payableAmount: formatMoney(payableAmount),
      discountAmount: formatMoney(discountAmount)
    };
  }

  function getMatchingQuote(batch) {
    if (!batch || !priceQuote) return null;
    if (Number(priceQuote.batchId) !== Number(batch.batchId)) return null;
    if (String(priceQuote.couponCode || '') !== getCouponCode()) return null;
    return priceQuote;
  }

  function clearQuote() {
    priceQuote = null;
    priceQuoteError = '';
    priceQuoteLoading = false;
    if (quoteTimer) {
      clearTimeout(quoteTimer);
      quoteTimer = null;
    }
  }

  function schedulePriceQuote(delay = 250) {
    if (quoteTimer) {
      clearTimeout(quoteTimer);
      quoteTimer = null;
    }

    priceQuote = null;
    priceQuoteError = '';
    const batch = getSelectedBatch();
    const couponCode = getCouponCode();
    const samePendingOrder = batch
      ? pendingOrders.find((order) => Number(order.batchId) === Number(batch.batchId))
      : null;

    if (!batch || samePendingOrder || isPurchased(batch) || !couponCode) {
      priceQuoteLoading = false;
      renderCheckout();
      return;
    }

    priceQuoteLoading = true;
    renderCheckout();
    const requestId = quoteRequestId + 1;
    quoteRequestId = requestId;
    quoteTimer = setTimeout(() => {
      fetchPriceQuote({ requestId, batchId: batch.batchId, couponCode });
    }, delay);
  }

  async function fetchPriceQuote({ requestId, batchId, couponCode }) {
    try {
      const response = await fetch(`${API_BASE}/alipay/quote-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId,
          couponCode
        })
      });
      const data = await response.json();
      if (requestId !== quoteRequestId) return;

      if (!response.ok || !data.success) {
        priceQuote = null;
        priceQuoteError = response.status === 404
          ? '后端报价接口未部署或服务未更新'
          : (data.message || data.error || '优惠码无效');
        return;
      }

      priceQuote = {
        ...data.plan,
        batchId: data.plan.batchId || batchId
      };
      priceQuoteError = '';
    } catch (error) {
      if (requestId !== quoteRequestId) return;
      console.error('查询优惠码报价失败', error);
      priceQuote = null;
      priceQuoteError = '优惠码校验失败，请稍后重试';
    } finally {
      if (requestId === quoteRequestId) {
        priceQuoteLoading = false;
        renderCheckout();
      }
    }
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function openUrl(url) {
    if (!url) return;
    const finalUrl = url.startsWith('http') ? url : `${API_ORIGIN}${url}`;
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: finalUrl });
      return;
    }
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }

  function downloadBatch(batch) {
    if (!batch) {
      setStatus('请先选择一个 CSV 文件。', true);
      return;
    }
    if (!batch.downloadUrl) {
      setStatus('该 CSV 暂无可用下载凭证，请刷新列表后重试。', true);
      return;
    }
    openUrl(batch.downloadUrl);
    setStatus(`正在下载 ${batch.fileName}。`);
  }

  function setButtonsDisabled(disabled) {
    loading = disabled;
    payBtn.disabled = disabled;
    refreshBatchesBtn.disabled = disabled;
    refreshOrdersBtn.disabled = disabled;
    if (couponCodeInput) {
      couponCodeInput.disabled = disabled;
    }
    batchList.querySelectorAll('button').forEach((button) => {
      button.disabled = disabled;
    });
    pendingOrdersList.querySelectorAll('button').forEach((button) => {
      button.disabled = disabled;
    });
  }

  function renderCheckout() {
    const batch = getSelectedBatch();
    const samePendingOrder = batch
      ? pendingOrders.find((order) => Number(order.batchId) === Number(batch.batchId))
      : null;
    const pricing = getCheckoutPricing(batch, samePendingOrder);
    selectedFileText.textContent = batch ? batch.fileName : '未选择';
    selectedRangeText.textContent = batch ? batch.dateRangeText : '-';
    discountAmountText.textContent = pricing ? formatCurrency(pricing.discountAmount) : '-';
    priceText.textContent = pricing ? formatCurrency(pricing.payableAmount) : '-';

    if (!currentUserId) {
      payBtn.disabled = true;
      payBtn.textContent = '支付宝支付';
      setStatus('请先返回设置页填写并保存用户 ID。', true);
      return;
    }

    if (!batch) {
      payBtn.disabled = true;
      payBtn.textContent = '支付宝支付';
      setStatus('请选择一个 CSV 文件。');
      return;
    }

    if (isPurchased(batch)) {
      payBtn.disabled = false;
      payBtn.textContent = '下载 CSV';
      setStatus(`你已拥有 ${batch.fileName} 的下载权限。`);
      return;
    }

    if (!isAvailable(batch)) {
      payBtn.disabled = true;
      payBtn.textContent = '不可购买';
      setStatus('该 CSV 当前不可购买。', true);
      return;
    }

    const couponCode = getCouponCode();
    const matchingQuote = getMatchingQuote(batch);
    if (!samePendingOrder && couponCode && priceQuoteLoading) {
      payBtn.disabled = true;
      payBtn.textContent = '支付宝支付';
      setStatus('正在校验优惠码...');
      return;
    }

    if (!samePendingOrder && couponCode && priceQuoteError) {
      payBtn.disabled = true;
      payBtn.textContent = '支付宝支付';
      setStatus(priceQuoteError, true);
      return;
    }

    if (!samePendingOrder && couponCode && !matchingQuote) {
      payBtn.disabled = true;
      payBtn.textContent = '支付宝支付';
      setStatus('正在校验优惠码...');
      return;
    }

    payBtn.disabled = false;
    payBtn.textContent = samePendingOrder ? '继续支付' : '支付宝支付';
    setStatus(samePendingOrder
      ? `你有一笔未支付订单，金额 ${formatCurrency(pricing.payableAmount)}，点击继续支付。`
      : `${batch.fileName}，${batch.rowCount} 条，应付 ${formatCurrency(pricing.payableAmount)}。`);
  }

  function renderBatchList() {
    batchList.innerHTML = '';
    if (!currentUserId) {
      setEmpty(batchList, '请先返回设置页填写并保存用户 ID。');
      renderCheckout();
      return;
    }
    if (batches.length === 0) {
      setEmpty(batchList, '当前没有可购买的 CSV。');
      selectedBatchId = null;
      renderCheckout();
      return;
    }

    batches.forEach((batch) => {
      const item = document.createElement('div');
      item.className = `batch-item${Number(batch.batchId) === Number(selectedBatchId) ? ' selected' : ''}`;
      item.dataset.batchId = batch.batchId;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');

      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'item-title';
      title.appendChild(createTextElement('span', 'file-name', batch.fileName || `CSV #${batch.batchId}`));
      const pill = createTextElement('span', `status-pill ${batch.purchaseStatus || ''}`, isPurchased(batch) ? '已购买' : (isAvailable(batch) ? '可购买' : '不可购买'));
      title.appendChild(pill);
      info.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      [
        ['类型', batch.batchTypeText],
        ['数据范围', batch.dateRangeText],
        ['行数', `${batch.rowCount || 0} 条`],
        ['价格', `￥${batch.price}`],
        ['生成时间', formatDateTime(batch.createdAt)]
      ].forEach(([label, value]) => {
        const span = document.createElement('span');
        span.appendChild(document.createTextNode(`${label}：`));
        span.appendChild(createTextElement('strong', '', value || '-'));
        meta.appendChild(span);
      });
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'batch-actions';
      if (isPurchased(batch)) {
        const downloadBtn = createTextElement('button', 'btn btn-primary', '下载');
        downloadBtn.type = 'button';
        downloadBtn.dataset.batchAction = 'download';
        downloadBtn.dataset.batchId = batch.batchId;
        actions.appendChild(downloadBtn);
      }

      item.appendChild(info);
      item.appendChild(actions);
      batchList.appendChild(item);
    });

    renderCheckout();
  }

  function renderPendingOrders(orders) {
    pendingOrders = (orders || []).filter(isPendingOrder);
    pendingOrdersList.innerHTML = '';

    if (!currentUserId) {
      setEmpty(pendingOrdersList, '请先返回设置页填写并保存用户 ID。');
      return;
    }

    if (pendingOrders.length === 0) {
      setEmpty(pendingOrdersList, '当前没有待支付订单。');
      renderCheckout();
      return;
    }

    pendingOrders.forEach((order) => {
      const batch = getBatchForOrder(order);
      const item = document.createElement('div');
      item.className = 'order-item';
      item.dataset.outTradeNo = order.outTradeNo;

      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'item-title';
      title.appendChild(createTextElement('span', 'file-name', batch ? batch.fileName : (order.planName || order.planId || '未支付订单')));
      title.appendChild(createTextElement('span', 'status-pill', order.statusText || '待支付'));
      info.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      [
        ['订单号', order.outTradeNo],
        ['创建时间', formatDateTime(order.createdAt)],
        ['剩余时间', formatRemaining(order.remainingSeconds)]
      ].forEach(([label, value]) => {
        const span = document.createElement('span');
        span.appendChild(document.createTextNode(`${label}：`));
        span.appendChild(createTextElement('strong', '', value || '-'));
        meta.appendChild(span);
      });
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'order-actions';
      const continueBtn = createTextElement('button', 'btn btn-primary', '继续支付');
      continueBtn.type = 'button';
      continueBtn.dataset.orderAction = 'continue';
      continueBtn.dataset.outTradeNo = order.outTradeNo;

      const cancelBtn = createTextElement('button', 'btn btn-danger', '取消订单');
      cancelBtn.type = 'button';
      cancelBtn.dataset.orderAction = 'cancel';
      cancelBtn.dataset.outTradeNo = order.outTradeNo;

      actions.appendChild(continueBtn);
      actions.appendChild(cancelBtn);
      item.appendChild(info);
      item.appendChild(actions);
      pendingOrdersList.appendChild(item);
    });

    renderCheckout();
  }

  function selectBatch(batchId) {
    selectedBatchId = Number(batchId);
    clearQuote();
    renderBatchList();
    schedulePriceQuote(0);
  }

  function chooseDefaultBatch() {
    if (selectedBatchId && batches.some((batch) => Number(batch.batchId) === Number(selectedBatchId))) {
      return;
    }
    const firstAvailable = batches.find(isAvailable);
    const firstPurchased = batches.find(isPurchased);
    selectedBatchId = (firstAvailable || firstPurchased || batches[0] || {}).batchId || null;
  }

  async function loadBatches() {
    if (!currentUserId) {
      setEmpty(batchList, '请先返回设置页填写并保存用户 ID。');
      renderCheckout();
      return;
    }

    setEmpty(batchList, '正在读取 CSV 列表...');
    try {
      const response = await fetch(`${API_BASE}/csv-batches?userId=${encodeURIComponent(currentUserId)}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        setEmpty(batchList, data.message || data.error || '查询 CSV 列表失败，请稍后重试。');
        return;
      }
      batches = data.batches || [];
      chooseDefaultBatch();
      renderBatchList();
      schedulePriceQuote(0);
    } catch (error) {
      console.error('查询 CSV 列表失败', error);
      setEmpty(batchList, '网络错误，查询 CSV 列表失败。');
    }
  }

  async function loadPendingOrders() {
    if (!currentUserId) {
      setEmpty(pendingOrdersList, '请先返回设置页填写并保存用户 ID。');
      return;
    }

    setEmpty(pendingOrdersList, '正在读取待支付订单...');
    try {
      const response = await fetch(`${API_BASE}/alipay/orders?userId=${encodeURIComponent(currentUserId)}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        setEmpty(pendingOrdersList, data.message || data.error || '查询订单失败，请稍后重试。');
        return;
      }
      renderPendingOrders(data.orders || []);
      schedulePriceQuote(0);
    } catch (error) {
      console.error('查询订单列表失败', error);
      setEmpty(pendingOrdersList, '网络错误，查询订单失败。');
    }
  }

  async function refreshAll() {
    await loadBatches();
    await loadPendingOrders();
  }

  function loadUserId() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
      userIdText.textContent = '未设置';
      setStatus('请在插件设置页保存用户 ID 后再购买。', true);
      setEmpty(batchList, '请先返回设置页填写并保存用户 ID。');
      setEmpty(pendingOrdersList, '请先返回设置页填写并保存用户 ID。');
      renderCheckout();
      return;
    }

    chrome.storage.sync.get([USER_ID_STORAGE_KEY], (data) => {
      currentUserId = data && data[USER_ID_STORAGE_KEY] ? String(data[USER_ID_STORAGE_KEY]).trim() : '';
      userIdText.textContent = currentUserId || '未设置';
      if (!currentUserId) {
        setStatus('请先返回设置页填写并保存用户 ID。', true);
        setEmpty(batchList, '请先返回设置页填写并保存用户 ID。');
        setEmpty(pendingOrdersList, '请先返回设置页填写并保存用户 ID。');
        renderCheckout();
        return;
      }
      refreshAll();
    });
  }

  async function continuePayment(order) {
    if (!order || !order.outTradeNo) {
      setStatus('没有可继续支付的订单。', true);
      return;
    }

    setButtonsDisabled(true);
    setStatus('正在打开未支付订单...');
    try {
      const response = await fetch(`${API_BASE}/alipay/continue-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          outTradeNo: order.outTradeNo
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setStatus(data.message || data.error || '继续支付失败，请稍后重试。', true);
        await refreshAll();
        return;
      }

      currentOrder = data.order;
      openUrl(data.payUrl);
      setStatus('正在打开支付宝收银台。');
      await loadPendingOrders();
    } catch (error) {
      console.error('继续支付订单失败', error);
      setStatus('网络错误，继续支付失败。', true);
    } finally {
      setButtonsDisabled(false);
      renderCheckout();
    }
  }

  async function cancelPendingOrder(order) {
    if (!order || !order.outTradeNo) {
      setStatus('没有可取消的待支付订单。', true);
      return;
    }

    const confirmed = window.confirm(`确认取消订单 ${order.outTradeNo} 吗？`);
    if (!confirmed) return;

    setButtonsDisabled(true);
    setStatus('正在取消待支付订单...');
    try {
      const response = await fetch(`${API_BASE}/alipay/cancel-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          outTradeNo: order.outTradeNo
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setStatus(data.message || data.error || '取消订单失败，请稍后重试。', true);
        return;
      }

      if (currentOrder && currentOrder.outTradeNo === order.outTradeNo) {
        stopCountdown();
        currentOrder = null;
      }
      setStatus(`订单 ${order.outTradeNo} 已取消。`);
      await refreshAll();
    } catch (error) {
      console.error('取消订单失败', error);
      setStatus('网络错误，取消订单失败。', true);
    } finally {
      setButtonsDisabled(false);
      renderCheckout();
    }
  }

  async function createPaymentForSelectedBatch() {
    const batch = getSelectedBatch();
    if (!currentUserId) {
      setStatus('请先返回设置页填写并保存用户 ID。', true);
      return;
    }
    if (!batch) {
      setStatus('请先选择一个 CSV 文件。', true);
      return;
    }
    if (isPurchased(batch)) {
      downloadBatch(batch);
      return;
    }

    const samePendingOrder = pendingOrders.find((order) => Number(order.batchId) === Number(batch.batchId));
    if (samePendingOrder) {
      await continuePayment(samePendingOrder);
      return;
    }

    const couponCode = getCouponCode();
    if (couponCode && priceQuoteLoading) {
      setStatus('正在校验优惠码，请稍后再支付。', true);
      renderCheckout();
      return;
    }
    if (couponCode && priceQuoteError) {
      setStatus(priceQuoteError, true);
      renderCheckout();
      return;
    }
    if (couponCode && !getMatchingQuote(batch)) {
      schedulePriceQuote(0);
      setStatus('正在校验优惠码，请稍后再支付。', true);
      renderCheckout();
      return;
    }

    setButtonsDisabled(true);
    setStatus('正在创建支付宝订单...');
    try {
      const response = await fetch(`${API_BASE}/alipay/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          batchId: batch.batchId,
          couponCode
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setStatus(data.message || data.error || '创建订单失败，请稍后重试。', true);
        await refreshAll();
        return;
      }

      currentOrder = data.order || {
        status: 'pending_payment',
        batchId: batch.batchId,
        outTradeNo: data.outTradeNo,
        remainingSeconds: data.remainingSeconds,
        expiresAt: data.expiresAt
      };
      openUrl(data.payUrl);
      setStatus(data.reused ? '正在打开已有未支付订单。' : '订单已创建，正在打开支付宝收银台。');
      await loadPendingOrders();
    } catch (error) {
      console.error('创建订单失败', error);
      setStatus('网络错误，创建订单失败。', true);
    } finally {
      setButtonsDisabled(false);
      renderCheckout();
    }
  }

  backBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'options.html' });
      return;
    }
    window.location.href = 'options.html';
  });

  refreshBatchesBtn.addEventListener('click', loadBatches);
  refreshOrdersBtn.addEventListener('click', loadPendingOrders);
  payBtn.addEventListener('click', createPaymentForSelectedBatch);
  if (couponCodeInput) {
    couponCodeInput.addEventListener('input', () => {
      couponCodeInput.value = couponCodeInput.value.toUpperCase();
      schedulePriceQuote();
    });
  }

  batchList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-batch-action]');
    if (button) {
      event.stopPropagation();
      const batch = batches.find((item) => Number(item.batchId) === Number(button.dataset.batchId));
      if (button.dataset.batchAction === 'download') {
        downloadBatch(batch);
      }
      return;
    }

    const item = event.target.closest('.batch-item');
    if (item && !loading) {
      selectBatch(item.dataset.batchId);
    }
  });

  batchList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = event.target.closest('.batch-item');
    if (!item || loading) return;
    event.preventDefault();
    selectBatch(item.dataset.batchId);
  });

  pendingOrdersList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-order-action]');
    if (!button || loading) return;

    const order = pendingOrders.find((item) => item.outTradeNo === button.dataset.outTradeNo);
    if (button.dataset.orderAction === 'continue') {
      continuePayment(order);
      return;
    }
    if (button.dataset.orderAction === 'cancel') {
      cancelPendingOrder(order);
    }
  });

  renderCheckout();
  loadUserId();
});
