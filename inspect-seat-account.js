const axios = require('axios');

const TOKENS = [
  { name: '托', token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb2RlIjoiMGYxUTFwRmExY0h5Yk0wdU9OSWExUnpYOWYzUTFwRkwiLCJleHAiOjE3ODU3ODgxMDUsIm1lbWJlcklkIjoiMjQxNjg0OTQxOSJ9.qtDRQQ6dFrpBPZIMh9Rmh4yTYf0YzTEUxgffqwDPN8c', memberId: '2416849419' },
  { name: '185', token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb2RlIjoiMGEzQmFwRmExUTN5Yk0wUnB2SWExYXZINTM0QmFwRnIiLCJleHAiOjE3ODU3ODgyNDQsIm1lbWJlcklkIjoiMTg4ODgxNTk2NzAxNDg3OTIzNCJ9.710C6pzPNYP1Q6qrh2XPyL_O9JOi05zzAa6UYp5OKyk', memberId: '1888815967014879234' },
];
const BASE = 'https://860753002.api.yq30.com/jeecg-boot';

async function run() {
  const sid = '2084234284973031425';
  for (const acc of TOKENS) {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      checktoken: '0',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessenger/8.0.49',
      'X-Access-Token': acc.token,
    };
    try {
      const [seatResp, priceResp] = await Promise.all([
        axios.get(`${BASE}/api/seat/getSeatByScheduleId`, { params: { id: sid, memberId: acc.memberId }, headers, timeout: 15000 }),
        axios.get(`${BASE}/api/film/getSeatTypeWithTicketPrice`, { params: { filmScheduleId: sid, balanceFlag: '1', memberId: acc.memberId }, headers, timeout: 15000 }),
      ]);
      const seats = seatResp.data.result || [];
      const prices = priceResp.data.result || [];
      const priceMap = {};
      prices.forEach(p => priceMap[p.id] = p.type);
      const counts = {};
      seats.forEach(s => { counts[s.type] = (counts[s.type]||0)+1; });
      console.log(acc.name, 'success', seatResp.data.success, priceResp.data.success, 'counts', Object.fromEntries(Object.entries(counts).map(([k,v]) => [priceMap[k]||k, v])));
    } catch(e) {
      console.log(acc.name, 'error', e.response?.data || e.message);
    }
  }
}
run();
