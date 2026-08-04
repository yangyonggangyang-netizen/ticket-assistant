"""Deep probe of /film/ API endpoints - the mini-program API."""
import subprocess
import json

BASE = 'https://film-api.piaoxf.com/film'

# 1. Probe /film/ endpoints
print("=" * 80)
print("1. Probing /film/ endpoints (POST)")
print("=" * 80)

post_endpoints = [
    '/login', '/sendSms', '/sendCode', '/send-sms',
    '/register', '/signup',
    '/phoneLogin', '/phone-login', '/smsLogin', '/sms-login',
    '/wechatLogin', '/wechat-login', '/wxLogin', '/wx-login',
    '/verifyCode', '/verify-code', '/checkCode', '/check-code',
    '/home', '/index', '/init', '/config',
    '/cinema', '/cinemaList', '/cinema-list', '/cinema/list',
    '/film', '/filmList', '/film-list', '/film/list',
    '/movie', '/movieList', '/movie/list',
    '/schedule', '/scheduleList', '/schedule/list',
    '/showtime', '/showtimeList', '/showtime/list',
    '/seat', '/seatMap', '/seat-map', '/seat/list',
    '/ticket', '/ticketList', '/ticket/list',
    '/order', '/orderList', '/order/list', '/createOrder', '/create-order',
    '/user', '/userInfo', '/user/info', '/userInfo',
    '/member', '/memberInfo', '/member/info',
    '/balance', '/point', '/score',
    '/mall', '/shop', '/product', '/productList', '/product/list',
    '/pay', '/payment', '/recharge',
    '/captcha', '/verification',
    '/logout', '/tokenVerify', '/token-verify',
    '/getOpenId', '/get-openid', '/openid',
]

found_post = []

for endpoint in post_endpoints:
    url = f'{BASE}{endpoint}'
    
    # Try with empty body
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-H', 'Accept: application/json',
         '-d', '{}',
         '-w', '\n---HTTP_CODE:%{http_code}---',
         url],
        capture_output=True, text=True, errors='replace'
    )
    output = result.stdout
    if '---HTTP_CODE:' in output:
        parts = output.rsplit('---HTTP_CODE:', 1)
        body = parts[0].strip()
        code = parts[1].strip().replace('---', '')
    else:
        body = output.strip()
        code = '?'

    if code not in ('404', '000', '?'):
        print(f"\n  POST {endpoint:30s} -> HTTP {code}")
        if body:
            print(f"    Response: {body[:400]}")
        found_post.append((endpoint, code, body))

# 2. Also try GET requests
print(f"\n{'='*80}")
print("2. Probing /film/ endpoints (GET)")
print("=" * 80)

get_endpoints = [
    '/login', '/home', '/index', '/init', '/config',
    '/cinema', '/cinemaList', '/cinema/list',
    '/film', '/filmList', '/film/list',
    '/schedule', '/scheduleList',
    '/seat', '/seatMap',
    '/ticket', '/order',
    '/user', '/userInfo', '/user/info',
    '/member', '/memberInfo',
    '/balance', '/point', '/score',
    '/mall', '/shop', '/product',
    '/captcha', '/verification',
]

found_get = []

for endpoint in get_endpoints:
    url = f'{BASE}{endpoint}'
    
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-H', 'Accept: application/json',
         '-w', '\n---HTTP_CODE:%{http_code}---',
         url],
        capture_output=True, text=True, errors='replace'
    )
    output = result.stdout
    if '---HTTP_CODE:' in output:
        parts = output.rsplit('---HTTP_CODE:', 1)
        body = parts[0].strip()
        code = parts[1].strip().replace('---', '')
    else:
        body = output.strip()
        code = '?'

    if code not in ('404', '000', '?'):
        print(f"\n  GET {endpoint:30s} -> HTTP {code}")
        if body:
            print(f"    Response: {body[:400]}")
        found_get.append((endpoint, code, body))

# 3. Try /film/login with different payloads
print(f"\n{'='*80}")
print("3. Testing /film/login with different payloads")
print("=" * 80)

login_payloads = [
    ('Empty', '{}'),
    ('Phone+code', '{"phone":"13800138000","code":"1234"}'),
    ('Phone+verifyCode', '{"phone":"13800138000","verifyCode":"1234"}'),
    ('Phone+smsCode', '{"phone":"13800138000","smsCode":"1234"}'),
    ('Phone+verification', '{"phone":"13800138000","verification":"1234"}'),
    ('Phone+password', '{"phone":"13800138000","password":"123456"}'),
    ('Code only', '{"code":"test_wx_code"}'),
    ('WX code', '{"wxCode":"test_wx_code"}'),
    ('Encrypted data', '{"encryptedData":"test","iv":"test"}'),
    ('Account+password', '{"account":"test","password":"test123"}'),
    ('Username+password', '{"username":"test","password":"test123"}'),
    ('Mobile+code', '{"mobile":"13800138000","code":"1234"}'),
    ('Phone+code+type', '{"phone":"13800138000","code":"1234","type":"phone"}'),
    ('Phone+code+loginType', '{"phone":"13800138000","code":"1234","loginType":"sms"}'),
    ('Token', '{"token":"test"}'),
    ('OpenID', '{"openid":"test"}'),
    ('UnionID', '{"unionid":"test"}'),
    ('Channel', '{"channelid":"C00001"}'),
    ('AppID', '{"appid":"wx4fd7f63cb29a8891"}'),
    ('With appid+code', '{"appid":"wx4fd7f63cb29a8891","code":"test"}'),
    ('With channel+phone', '{"channelid":"C00001","phone":"13800138000","code":"1234"}'),
]

for name, payload in login_payloads:
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-H', 'Accept: application/json',
         '-d', payload,
         f'{BASE}/login'],
        capture_output=True, text=True, errors='replace'
    )
    body = result.stdout.strip()
    if body and '404' not in body:
        print(f"\n  {name}")
        print(f"    Payload: {payload}")
        print(f"    Response: {body[:400]}")

# 4. Try /film/sendSms with different payloads
print(f"\n{'='*80}")
print("4. Testing /film/sendSms with different payloads")
print("=" * 80)

sms_payloads = [
    ('Empty', '{}'),
    ('Phone', '{"phone":"13800138000"}'),
    ('Mobile', '{"mobile":"13800138000"}'),
    ('Phone+type', '{"phone":"13800138000","type":"login"}'),
    ('Phone+scene', '{"phone":"13800138000","scene":"login"}'),
]

for name, payload in sms_payloads:
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-d', payload,
         f'{BASE}/sendSms'],
        capture_output=True, text=True, errors='replace'
    )
    body = result.stdout.strip()
    if body and '404' not in body:
        print(f"\n  {name}")
        print(f"    Payload: {payload}")
        print(f"    Response: {body[:400]}")

# Summary
print(f"\n{'='*80}")
print("Summary")
print("=" * 80)
print(f"\nPOST endpoints found: {len(found_post)}")
for ep, code, body in found_post:
    print(f"  POST {ep} -> HTTP {code}")
print(f"\nGET endpoints found: {len(found_get)}")
for ep, code, body in found_get:
    print(f"  GET {ep} -> HTTP {code}")
