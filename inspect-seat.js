const axios = require('axios');

const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb2RlIjoiMGEzQmFwRmExUTN5Yk0wUnB2SWExYXZINTM0QmFwRnIiLCJleHAiOjE3ODU3ODgyNDQsIm1lbWJlcklkIjoiMTg4ODgxNTk2NzAxNDg3OTIzNCJ9.710C6pzPNYP1Q6qrh2XPyL_O9JOi05zzAa6UYp5OKyk';
const MEMBER_ID = '1888815967014879234';
const CINEMA_ID = '1509713779150159873';
const BASE = 'https://860753002.api.yq30.com/jeecg-boot';

const headers = {
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json',
  checktoken: '0',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessenger/8.0.49',
  'X-Access-Token': TOKEN,
};

function pad(n){ return String(n).padStart(2,'0'); }
function fmt(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

async function run() {
  const today = fmt(new Date());
  const sched = await axios.get(`${BASE}/api/film/getScheduleAllFilm`, { params: { cinemaId: CINEMA_ID, startDate: today }, headers, timeout: 15000 });
  console.log('schedule success', sched.data.success, 'count', (sched.data.result||[]).length);
  const list = sched.data.result || [];
  if (!list.length) return console.log('no schedule');
  const s = list[0];
  console.log('first schedule', JSON.stringify({ id: s.scheduleId || s.id, filmName: s.filmName, hallName: s.hallName, startTime: s.startTime }, null, 2));
  const sid = s.scheduleId || s.id;

  const seatResp = await axios.get(`${BASE}/api/seat/getSeatByScheduleId`, { params: { id: sid, memberId: MEMBER_ID }, headers, timeout: 15000 });
  const seats = seatResp.data.result || [];
  console.log('seat count', seats.length);
  console.log('first 5 seats:', JSON.stringify(seats.slice(0,5), null, 2));
  console.log('unique type values:', [...new Set(seats.map(x => x.type))]);
  console.log('unique seatStatus:', [...new Set(seats.map(x => x.seatStatus))]);
  console.log('unique ticketState:', [...new Set(seats.map(x => x.ticketState))]);
  console.log('unique seatGroup (non-empty):', [...new Set(seats.map(x => x.seatGroup).filter(Boolean))].slice(0,10));

  const priceResp = await axios.get(`${BASE}/api/film/getSeatTypeWithTicketPrice`, { params: { filmScheduleId: sid, balanceFlag: '1', memberId: MEMBER_ID }, headers, timeout: 15000 });
  console.log('price types:', JSON.stringify(priceResp.data.result, null, 2));
}

run().catch(e => {
  console.error(e.response?.data || e.message);
});
