"""Test /film/login with WeChat mini-program headers."""
import subprocess
import json

BASE = 'https://film-api.piaoxf.com/film'

# WeChat mini-program request headers
wx_headers = [
    '-H', 'Content-Type: application/json',
    '-H', 'Accept: application/json',
    '-H', 'Referer: https://servicewechat.com/wx4fd7f63cb29a8891/1.0.0/page-frame.html',
    '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x63090c33) XWEB/11275',
]

print("=" * 80)
print("1. /film/login with WeChat mini-program headers")
print("=" * 80)

payloads = [
    ('Empty', '{}'),
    ('Code', '{"code":"test_wx_code"}'),
    ('Phone+code', '{"phone":"13800138000","code":"1234"}'),
    ('AppID+code', '{"appid":"wx4fd7f63cb29a8891","code":"test"}'),
]

for name, payload in payloads:
    cmd = ['curl', '-s', '-k', '--max-time', '10',
           '-X', 'POST'] + wx_headers + ['-d', payload, f'{BASE}/login']
    result = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
    body = result.stdout.strip()
    print(f"\n  {name}: {body[:400]}")

# 2. Try with different custom headers
print(f"\n{'='*80}")
print("2. /film/login with various custom headers")
print("=" * 80)

custom_headers = [
    ('channelid=C00001', ['-H', 'channelid: C00001']),
    ('channelid=1', ['-H', 'channelid: 1']),
    ('appid=wx4fd7...', ['-H', 'appid: wx4fd7f63cb29a8891']),
    ('cinemaid=1', ['-H', 'cinemaid: 1']),
    ('cinemaid=C00001', ['-H', 'cinemaid: C00001']),
    ('shopid=1', ['-H', 'shopid: 1']),
    ('X-Token=test', ['-H', 'X-Token: test']),
    ('Uk-Token=test', ['-H', 'Uk-Token: test']),
    ('Authorization=Bearer', ['-H', 'Authorization: Bearer test']),
    ('X-User-Id=1', ['-H', 'X-User-Id: 1']),
    ('channel=C00001', ['-H', 'channel: C00001']),
    ('source=mini', ['-H', 'source: mini']),
    ('platform=wx', ['-H', 'platform: wx']),
    ('X-App-Id=wx4fd7', ['-H', 'X-App-Id: wx4fd7f63cb29a8891']),
    ('X-Channel=C00001', ['-H', 'X-Channel: C00001']),
]

base_headers = [
    '-H', 'Content-Type: application/json',
    '-H', 'Accept: application/json',
    '-H', 'Referer: https://servicewechat.com/wx4fd7f63cb29a8891/1.0.0/page-frame.html',
]

for name, extra_headers in custom_headers:
    cmd = ['curl', '-s', '-k', '--max-time', '5',
           '-X', 'POST'] + base_headers + extra_headers + \
          ['-d', '{"code":"test"}', f'{BASE}/login']
    result = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
    body = result.stdout.strip()
    
    # Check if response is different from the default error
    default_error = '{"code":999,"message":"获取授权数据失败 - 票先锋特惠影票服务","result":{}}'
    if body != default_error:
        print(f"\n  *** DIFFERENT RESPONSE with {name} ***")
        print(f"    Response: {body[:400]}")
    else:
        print(f"  {name}: same default error")

# 3. Try with query parameters
print(f"\n{'='*80}")
print("3. /film/login with query parameters")
print("=" * 80)

query_params = [
    '?channelid=C00001',
    '?appid=wx4fd7f63cb29a8891',
    '?cinemaid=1',
    '?channelid=C00001&appid=wx4fd7f63cb29a8891',
    '?source=mini&type=login',
]

for params in query_params:
    cmd = ['curl', '-s', '-k', '--max-time', '5',
           '-X', 'POST',
           '-H', 'Content-Type: application/json',
           '-d', '{"code":"test"}',
           f'{BASE}/login{params}']
    result = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
    body = result.stdout.strip()
    
    default_error = '{"code":999,"message":"获取授权数据失败 - 票先锋特惠影票服务","result":{}}'
    if body != default_error:
        print(f"\n  *** DIFFERENT RESPONSE with {params} ***")
        print(f"    Response: {body[:400]}")
    else:
        print(f"  {params}: same default error")

# 4. Try with channelid in body + headers
print(f"\n{'='*80}")
print("4. /film/login with channelid in body")
print("=" * 80)

body_payloads = [
    '{"channelid":"C00001","code":"test"}',
    '{"channelid":"1","code":"test"}',
    '{"channel_id":"C00001","code":"test"}',
    '{"channel":"C00001","code":"test"}',
    '{"cinemaid":"1","code":"test"}',
    '{"cinema_id":"1","code":"test"}',
    '{"shopid":"1","code":"test"}',
    '{"shop_id":"1","code":"test"}',
    '{"appid":"wx4fd7f63cb29a8891","code":"test","channelid":"C00001"}',
    '{"appid":"wx4fd7f63cb29a8891","code":"test","cinemaid":"1"}',
]

for payload in body_payloads:
    cmd = ['curl', '-s', '-k', '--max-time', '5',
           '-X', 'POST',
           '-H', 'Content-Type: application/json',
           '-H', 'Referer: https://servicewechat.com/wx4fd7f63cb29a8891/1.0.0/page-frame.html',
           '-d', payload,
           f'{BASE}/login']
    result = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
    body = result.stdout.strip()
    
    default_error = '{"code":999,"message":"获取授权数据失败 - 票先锋特惠影票服务","result":{}}'
    if body != default_error:
        print(f"\n  *** DIFFERENT RESPONSE ***")
        print(f"    Payload: {payload}")
        print(f"    Response: {body[:400]}")
    else:
        print(f"  {payload[:60]}...: same default error")

# 5. Try other /film/ endpoints with WeChat headers
print(f"\n{'='*80}")
print("5. Other /film/ endpoints with WeChat headers")
print("=" * 80)

other_endpoints = [
    '/sendSms', '/sms', '/sendCode', '/getCode',
    '/sendVerifyCode', '/verifyCode',
    '/getCinema', '/cinemaList', '/cinema',
    '/getFilm', '/filmList', '/film',
    '/getHome', '/home', '/getIndex', '/index',
    '/getConfig', '/config', '/init',
    '/getSchedule', '/schedule',
    '/getSeat', '/seat',
    '/getUser', '/user', '/userInfo',
    '/getMember', '/member',
    '/getBalance', '/balance',
    '/getPoint', '/point',
    '/getMall', '/mall', '/shop',
    '/getOrder', '/order',
    '/getTicket', '/ticket',
    '/wechatLogin', '/phoneLogin', '/smsLogin',
    '/wxLogin', '/wxlogin',
    '/getOpenid', '/openid',
    '/getCity', '/city',
    '/getBanner', '/banner',
    '/getAd', '/ad',
]

for endpoint in other_endpoints:
    cmd = ['curl', '-s', '-k', '--max-time', '3',
           '-X', 'POST',
           '-H', 'Content-Type: application/json',
           '-H', 'Referer: https://servicewechat.com/wx4fd7f63cb29a8891/1.0.0/page-frame.html',
           '-d', '{}',
           '-w', '\n%{http_code}',
           f'{BASE}{endpoint}']
    result = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
    output = result.stdout.strip()
    if '\n' in output:
        body, code = output.rsplit('\n', 1)
    else:
        body = output
        code = '?'
    
    if code not in ('404', '000', '?'):
        print(f"\n  POST {endpoint:25s} -> HTTP {code}")
        print(f"    Response: {body[:300]}")
