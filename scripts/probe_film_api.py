"""Probe film-api.piaoxf.com API endpoints."""
import subprocess
import json

BASE = 'https://film-api.piaoxf.com'

# 1. Resolve domain
print("=" * 80)
print("1. DNS resolution for film-api.piaoxf.com")
print("=" * 80)
result = subprocess.run(['nslookup', 'film-api.piaoxf.com'], capture_output=True, text=True, errors='replace')
print(result.stdout)

# 2. Test GET requests to various endpoints
print("=" * 80)
print("2. GET requests to API endpoints")
print("=" * 80)

endpoints = [
    '/',
    '/login',
    '/sms',
    '/sendSms',
    '/send-sms',
    '/sendCode',
    '/send-code',
    '/verification',
    '/captcha',
    '/config',
    '/init',
    '/home',
    '/index',
    '/film',
    '/films',
    '/movie',
    '/movies',
    '/cinema',
    '/cinemas',
    '/cinema/list',
    '/ticket',
    '/order',
    '/user',
    '/user/info',
    '/member',
    '/member/info',
    '/seat',
    '/schedule',
    '/showtime',
    '/mall',
    '/shop',
    '/product',
    '/balance',
    '/point',
    '/score',
    '/mini/login',
    '/mini/sms',
    '/mini/home',
    '/miniapp/login',
    '/miniapp/sms',
    '/wx/login',
    '/wx/sms',
    '/api/login',
    '/api/sms',
    '/api/v1/login',
    '/api/v1/sms',
    '/api/v1/user',
    '/api/v1/config',
    '/api/v1/home',
    '/api/v1/film',
    '/api/v1/cinema',
    '/api/v1/ticket',
    '/api/v1/order',
    '/api/v1/seat',
    '/api/v1/schedule',
]

for endpoint in endpoints:
    url = f'{BASE}{endpoint}'
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-w', '\n---HTTP_CODE:%{http_code}---',
         '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
         '-H', 'Accept: application/json',
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

    # Only show interesting responses (not 404, not 405, not empty)
    if code not in ('404', '405', '000', '502', '503', '?'):
        print(f"\n  GET {endpoint}")
        print(f"    Status: {code}")
        if body:
            print(f"    Body: {body[:500]}")

# 3. Test POST to login endpoint
print(f"\n{'='*80}")
print("3. POST /login with different payloads")
print("=" * 80)

login_payloads = [
    ('Empty', '{}'),
    ('Account login', '{"account":"test","password":"test123"}'),
    ('Phone login', '{"phone":"13800138000","code":"1234"}'),
    ('Phone login v2', '{"phone":"13800138000","verification":"1234"}'),
    ('WeChat login', '{"code":"test_wx_code"}'),
]

for name, payload in login_payloads:
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '10',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
         '-H', 'Accept: application/json',
         '-d', payload,
         '-w', '\n---HTTP_CODE:%{http_code}---',
         f'{BASE}/login'],
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

    print(f"\n  POST /login ({name})")
    print(f"    Payload: {payload}")
    print(f"    Status: {code}")
    if body:
        print(f"    Response: {body[:500]}")

# 4. Test SMS sending endpoints
print(f"\n{'='*80}")
print("4. POST to SMS/verification endpoints")
print("=" * 80)

sms_endpoints = [
    '/sms', '/sendSms', '/send-sms', '/sendCode', '/send-code',
    '/verification', '/captcha', '/sms/send', '/code/send',
    '/sendVerification', '/send-verification',
    '/mini/sms', '/mini/sendSms', '/miniapp/sms',
    '/api/v1/sms', '/api/v1/sendSms',
]

sms_payload = '{"phone":"13800138000"}'

for endpoint in sms_endpoints:
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
         '-d', sms_payload,
         '-w', '\n---HTTP_CODE:%{http_code}---',
         f'{BASE}{endpoint}'],
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

    if code not in ('404', '405', '000', '?'):
        print(f"\n  POST {endpoint}")
        print(f"    Status: {code}")
        if body:
            print(f"    Response: {body[:500]}")
