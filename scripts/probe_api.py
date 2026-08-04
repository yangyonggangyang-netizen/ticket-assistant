"""Probe film-yun.piaoxf.com for API endpoints and JavaScript files."""
import subprocess
import re
import json

BASE = 'https://film-yun.piaoxf.com'

# 1. Fetch the main page and look for JavaScript files
print("=" * 80)
print("1. Fetching film-yun.piaoxf.com main page")
print("=" * 80)

result = subprocess.run(
    ['curl', '-s', '-L', '-k', '--max-time', '10',
     '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
     f'{BASE}/'],
    capture_output=True, text=True, errors='replace'
)

html = result.stdout
print(f"Response length: {len(html)} chars")

# Find JavaScript file references
js_files = re.findall(r'src=["\']([^"\']*\.js[^"\']*)["\']', html)
print(f"\nJavaScript files found: {len(js_files)}")
for js in js_files:
    print(f"  {js}")

# Find any API URLs in the HTML
api_urls = re.findall(r'https?://[^\s"\'<>]+', html)
if api_urls:
    print(f"\nURLs found in HTML:")
    for url in set(api_urls):
        print(f"  {url}")

# 2. Try common API endpoints
print(f"\n{'='*80}")
print("2. Probing common API endpoints")
print("=" * 80)

endpoints = [
    '/api/',
    '/api/login',
    '/api/sms',
    '/api/sendSms',
    '/api/send-sms',
    '/api/verifyCode',
    '/api/verify-code',
    '/api/captcha',
    '/api/user/login',
    '/api/user/info',
    '/api/movies',
    '/api/cinema',
    '/api/films',
    '/api/film',
    '/api/ticket',
    '/api/order',
    '/api/home',
    '/api/index',
    '/api/config',
    '/api/init',
    '/api/version',
    '/admin/',
    '/admin/api/',
    '/mini/',
    '/mini/api/',
    '/miniapp/',
    '/miniapp/api/',
    '/wx/',
    '/wx/api/',
    '/app/',
    '/app/api/',
]

for endpoint in endpoints:
    url = f'{BASE}{endpoint}'
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5', '-o', '/dev/null',
         '-w', '%{http_code} %{content_type} %{size_download}',
         '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
         url],
        capture_output=True, text=True, errors='replace'
    )
    status = result.stdout.strip()
    if status and not status.startswith('000'):
        parts = status.split()
        code = parts[0] if parts else '?'
        size = parts[2] if len(parts) > 2 else '?'
        if code != '404':
            print(f"  {endpoint:30s} -> HTTP {code} (size: {size})")

# 3. Try POST to login endpoints
print(f"\n{'='*80}")
print("3. Testing login endpoints")
print("=" * 80)

login_endpoints = [
    '/api/login',
    '/api/user/login',
    '/api/auth/login',
    '/api/sms/login',
    '/api/phone/login',
    '/api/member/login',
]

for endpoint in login_endpoints:
    url = f'{BASE}{endpoint}'
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5',
         '-X', 'POST',
         '-H', 'Content-Type: application/json',
         '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
         '-d', '{"phone":"13800138000","code":"1234"}',
         '-w', '\n%{http_code}',
         url],
        capture_output=True, text=True, errors='replace'
    )
    output = result.stdout.strip()
    if output:
        lines = output.rsplit('\n', 1)
        body = lines[0] if len(lines) > 1 else ''
        code = lines[-1] if lines else '?'
        if code != '404' and code != '000':
            print(f"\n  POST {endpoint}")
            print(f"    Status: {code}")
            print(f"    Response: {body[:300]}")

# 4. Try other possible domains
print(f"\n{'='*80}")
print("4. Trying other possible API domains")
print("=" * 80)

other_domains = [
    'https://api.piaoxf.com',
    'https://m.piaoxf.com',
    'https://mini.piaoxf.com',
    'https://app.piaoxf.com',
    'https://wx.piaoxf.com',
    'https://film.piaoxf.com',
    'https://ticket.piaoxf.com',
    'https://cinema.piaoxf.com',
]

for domain in other_domains:
    result = subprocess.run(
        ['curl', '-s', '-k', '--max-time', '5', '-o', '/dev/null',
         '-w', '%{http_code} %{size_download}',
         '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
         domain],
        capture_output=True, text=True, errors='replace'
    )
    status = result.stdout.strip()
    if status and not status.startswith('000'):
        print(f"  {domain:40s} -> HTTP {status}")
    else:
        print(f"  {domain:40s} -> unreachable")
