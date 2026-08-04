const axios = require('axios');

const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb2RlIjoiMGEzQmFwRmExUTN5Yk0wUnB2SWExYXZINTM0QmFwRnIiLCJleHAiOjE3ODU3ODgyNDQsIm1lbWJlcklkIjoiMTg4ODgxNTk2NzAxNDg3OTIzNCJ9.710C6pzPNYP1Q6qrh2XPyL_O9JOi05zzAa6UYp5OKyk';
const memberId = '1888815967014879234';
const base = 'https://860753002.api.yq30.com/jeecg-boot';

async function req(method, path, data = {}) {
  const headers = {
    'X-Access-Token': token,
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Accept: 'application/json',
    checktoken: '0',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessenger/8.0.49',
  };
  const params = { ...data, memberId };
  try {
    const resp = await axios({ method, url: base + path, params, headers, timeout: 15000 });
    return resp.data;
  } catch (e) {
    return { success: false, message: e.message, response: e.response?.data };
  }
}

async function main() {
  const list = await req('GET', '/api/order/getSaleOrder', { pageNo: 1, pageSize: 20, flag: 1 });
  console.log('=== ORDER LIST ===');
  console.log(JSON.stringify(list, null, 2).slice(0, 8000));

  if (list.success && list.result?.records?.length) {
    const order = list.result.records[0];
    console.log('\n=== FIRST ORDER ID ===');
    console.log(order.id || order.orderId || order.orderNo);

    const detail = await req('GET', '/api/order/getSaleOrder', { orderId: order.id });
    console.log('\n=== ORDER DETAIL ===');
    console.log(JSON.stringify(detail, null, 2).slice(0, 12000));
  }
}

main();
