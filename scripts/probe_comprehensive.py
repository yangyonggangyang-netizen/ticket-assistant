"""Comprehensive API prefix probe for film-api.piaoxf.com."""
import subprocess
import itertools

BASE = 'https://film-api.piaoxf.com'

# Comprehensive list of prefixes to try
prefixes = [
    '', '/admin', '/mini', '/miniapp', '/wx', '/app', '/api',
    '/api/v1', '/api/v2', '/v1', '/v2', '/m', '/h5', '/web',
    '/wap', '/front', '/client', '/user', '/c', '/open',
    '/public', '/mini-program', '/mp', '/weapp', '/wa',
    '/mini-api', '/wx-api', '/app-api', '/film', '/ticket',
    '/cinema', '/movie', '/p', '/s', '/r', '/n', '/d',
    '/api/mini', '/api/wx', '/api/app', '/api/v1/mini',
    '/api/v1/wx', '/api/v1/app', '/mini/v1', '/wx/v1',
    '/admin/mini', '/admin/wx', '/admin/api',
    '/sucaiplus', '/sc', '/pxf', '/piaoxf',
]

# Endpoints to try for each prefix
endpoints = ['/login', '/index', '/home', '/config', '/init', '/sms', '/sendSms']

print("=" * 80)
print("Comprehensive API prefix probe")
print("=" * 80)

found = []

for prefix in prefixes:
    for endpoint in endpoints:
        path = f'{prefix}{endpoint}'
        url = f'{BASE}{path}'
        
        # Try POST first (login is usually POST)
        result = subprocess.run(
            ['curl', '-s', '-k', '--max-time', '3',
             '-X', 'POST',
             '-H', 'Content-Type: application/json',
             '-H', 'Accept: application/json',
             '-d', '{"phone":"13800138000"}',
             '-w', '%{http_code}',
             '-o', 'NUL',  # Windows null device
             url],
            capture_output=True, text=True, errors='replace'
        )
        code = result.stdout.strip()
        
        # Filter out 404, 405, 000 (timeout)
        if code and code not in ('404', '405', '000', '502', '503'):
            # Get the actual response body
            result2 = subprocess.run(
                ['curl', '-s', '-k', '--max-time', '3',
                 '-X', 'POST',
                 '-H', 'Content-Type: application/json',
                 '-d', '{"phone":"13800138000"}',
                 url],
                capture_output=True, text=True, errors='replace'
            )
            body = result2.stdout.strip()[:300]
            print(f"\n  POST {path:40s} -> HTTP {code}")
            print(f"    Response: {body}")
            found.append(('POST', path, code, body))

# Also try GET for some prefixes
print(f"\n{'='*80}")
print("GET requests")
print("=" * 80)

for prefix in prefixes:
    for endpoint in ['/index', '/home', '/config', '/init']:
        path = f'{prefix}{endpoint}'
        url = f'{BASE}{path}'
        
        result = subprocess.run(
            ['curl', '-s', '-k', '--max-time', '3',
             '-H', 'Accept: application/json',
             '-w', '%{http_code}',
             '-o', 'NUL',
             url],
            capture_output=True, text=True, errors='replace'
        )
        code = result.stdout.strip()
        
        if code and code not in ('404', '405', '000', '502', '503'):
            result2 = subprocess.run(
                ['curl', '-s', '-k', '--max-time', '3',
                 '-H', 'Accept: application/json',
                 url],
                capture_output=True, text=True, errors='replace'
            )
            body = result2.stdout.strip()[:300]
            print(f"\n  GET {path:40s} -> HTTP {code}")
            print(f"    Response: {body}")
            found.append(('GET', path, code, body))

# Summary
print(f"\n{'='*80}")
print(f"Summary: Found {len(found)} working endpoints")
print("=" * 80)
for method, path, code, body in found:
    print(f"  {method} {path} -> HTTP {code}")
