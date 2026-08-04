"""Probe film-api.piaoxf.com with correct path prefixes."""
import subprocess
import json

BASE = 'https://film-api.piaoxf.com'

# 1. Test /admin/login (management system)
print("=" * 80)
print("1. POST /admin/login (management system)")
print("=" * 80)

admin_payloads = [
    ('Empty', '{}'),
    ('Account', '{"account":"test","password":"test123"}'),
    ('Phone', '{"phone":"13800138000","code":"1234"}'),
    ('Phone v2', '{"phone":"13800138000","verification":"1234"}'),
]

for name, payload in admin_payloads:
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '10',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-H', 'Accept: application/json',
         '-H', 'Origin: https://film-yun.piaoxf.com',
         '-H', 'Referer: https://film-yun.piaoxf.com/',
         '-d', payload,
         '-w', '\n---HTTP_CODE:%{http_code}---',
         f'{BASE}/admin/login'],
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

    print(f"\n  POST /admin/login ({name})")
    print(f"    Payload: {payload}")
    print(f"    Status: {code}")
    if body:
        print(f"    Response: {body[:500]}")

# 2. Test /admin/getMenuList (with GET)
print(f"\n{'='*80}")
print("2. GET /admin/getMenuList")
print("=" * 80)

result = subprocess.run(
    ['curl', '-s', '-k', '--max-time', '10',
     '-H', 'Accept: application/json',
     '-H', 'Origin: https://film-yun.piaoxf.com',
     '-H', 'Referer: https://film-yun.piaoxf.com/',
     '-w', '\n---HTTP_CODE:%{http_code}---',
     f'{BASE}/admin/getMenuList'],
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

print(f"  Status: {code}")
if body:
    print(f"  Response: {body[:500]}")

# 3. Try different prefixes for mini-program API
print(f"\n{'='*80}")
print("3. Testing different API prefixes for mini-program")
print("=" * 80)

prefixes = ['/mini', '/miniapp', '/wx', '/app', '/api', '/api/v1', '/v1', '/m', '/h5', '/web']

for prefix in prefixes:
    # Try login endpoint
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-d', '{"phone":"13800138000","code":"1234"}',
         '-w', '\n---HTTP_CODE:%{http_code}---',
         f'{BASE}{prefix}/login'],
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
        print(f"\n  POST {prefix}/login -> HTTP {code}")
        if body:
            print(f"    Response: {body[:300]}")

    # Try SMS endpoint
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-d', '{"phone":"13800138000"}',
         '-w', '\n---HTTP_CODE:%{http_code}---',
         f'{BASE}{prefix}/sms'],
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
        print(f"\n  POST {prefix}/sms -> HTTP {code}")
        if body:
            print(f"    Response: {body[:300]}")

    # Try sendSms
    for sms_ep in ['/sendSms', '/send-sms', '/sendCode', '/send-code', '/verification']:
        result = subprocess.run(
            ['curl', '-s', '-k', '--max-time', '5',
             '-X', 'POST',
             '-H', 'Content-Type: application/json',
             '-d', '{"phone":"13800138000"}',
             '-w', '\n---HTTP_CODE:%{http_code}---',
             f'{BASE}{prefix}{sms_ep}'],
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
            print(f"\n  POST {prefix}{sms_ep} -> HTTP {code}")
            if body:
                print(f"    Response: {body[:300]}")

# 4. Also try without prefix but with query params
print(f"\n{'='*80}")
print("4. Testing with query parameters")
print("=" * 80)

for path in ['/login?type=phone', '/login?source=mini', '/login?app=mini',
             '/index', '/index/init', '/config', '/init', '/home/index']:
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-H', 'Accept: application/json',
         '-w', '\n---HTTP_CODE:%{http_code}---',
         f'{BASE}{path}'],
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
        print(f"\n  GET {path} -> HTTP {code}")
        if body:
            print(f"    Response: {body[:300]}")

# 5. Try GET /admin/ endpoints to find working ones
print(f"\n{'='*80}")
print("5. GET /admin/ endpoints")
print("=" * 80)

admin_endpoints = [
    '/admin/login', '/admin/index', '/admin/getMenuList',
    '/admin/config', '/admin/init', '/admin/home',
    '/admin/user', '/admin/user/info', '/admin/film',
    '/admin/cinema', '/admin/order', '/admin/ticket',
    '/admin/sms', '/admin/sendSms', '/admin/captcha',
]

for ep in admin_endpoints:
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-H', 'Accept: application/json',
         '-H', 'Origin: https://film-yun.piaoxf.com',
         '-w', '\n---HTTP_CODE:%{http_code}---',
         f'{BASE}{ep}'],
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
        print(f"\n  GET {ep} -> HTTP {code}")
        if body:
            print(f"    Response: {body[:300]}")
