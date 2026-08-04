const axios = require('axios');

const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb2RlIjoiMGEzQmFwRmExUTN5Yk0wUnB2SWExYXZINTM0QmFwRnIiLCJleHAiOjE3ODU3ODgyNDQsIm1lbWJlcklkIjoiMTg4ODgxNTk2NzAxNDg3OTIzNCJ9.710C6pzPNYP1Q6qrh2XPyL_O9JOi05zzAa6UYp5OKyk';
const MEMBER_ID = '1888815967014879234';
const BASE = 'https://860753002.api.yq30.com/jeecg-boot';

const headers = {
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json',
  checktoken: '0',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessenger/8.0.49',
  'X-Access-Token': TOKEN,
};

async function run() {
  const sid = '2084234284973031425';
  const bf = '1';
  const [seatResp, priceResp] = await Promise.all([
    axios.get(`${BASE}/api/seat/getSeatByScheduleId`, { params: { id: sid, memberId: MEMBER_ID }, headers, timeout: 15000 }),
    axios.get(`${BASE}/api/film/getSeatTypeWithTicketPrice`, { params: { filmScheduleId: sid, balanceFlag: bf, memberId: MEMBER_ID }, headers, timeout: 15000 }),
  ]);
  const seats = seatResp.data.result || [];
  const prices = priceResp.data.result || [];
  console.log('seat count', seats.length);
  console.log('price types', JSON.stringify(prices, null, 2));
  const counts = {};
  seats.forEach(s => { counts[s.type] = (counts[s.type]||0)+1; });
  const priceMap = {};
  prices.forEach(p => priceMap[p.id] = p.type);
  console.log('counts by type name', Object.fromEntries(Object.entries(counts).map(([k,v]) => [priceMap[k]||k, v])));
  // print one seat of each type
  const samples = [];
  for (const s of seats) {
    if (!samples.find(x => x.type === s.type)) samples.push(s);
  }
  console.log('samples', JSON.stringify(samples, null, 2));
}
run().catch(e => console.error(e.response?.data || e.message));
