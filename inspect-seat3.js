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
  const list = sched.data.result || [];
  const spider = list.filter(s => (s.filmName||'').includes('蜘蛛'));
  console.log('spider schedules', spider.length);
  for (const s of spider) {
    console.log(s.startTime, s.name, 'scheduleId', s.scheduleId);
  }
}
run().catch(e => console.error(e.response?.data || e.message));
