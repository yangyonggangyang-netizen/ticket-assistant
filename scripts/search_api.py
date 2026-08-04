#!/usr/bin/env python3
"""Search extracted wxapkg source code for API endpoints and login logic."""
import re
import os

base = r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\wxapkg_unpacked'

# Find all JS files
js_files = []
for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith('.js'):
            js_files.append(os.path.join(root, f))

print(f'Found {len(js_files)} JS files\n')

# Pattern 1: Extract all URLs
url_pattern = r'https?://[^\s"\'\\)>]+'
# Pattern 2: Extract /film/ paths
film_pattern = r'/film/[a-zA-Z0-9_/\-]+'
# Pattern 3: Extract API-related string assignments
api_pattern = r'(?:baseUrl|BASE_URL|apiUrl|requestUrl|base_url|apiBase)\s*[=:]\s*["\']([^"\']+)["\']'

for jf in js_files:
    with open(jf, 'r', encoding='utf-8', errors='replace') as fh:
        content = fh.read()
    
    found = set()
    
    for m in re.findall(url_pattern, content):
        if len(m) > 8 and 'localhost' not in m and 'schemas' not in m and 'w3.org' not in m:
            found.add(('URL', m[:200]))
    
    for m in re.findall(film_pattern, content):
        found.add(('FILM_API', m))
    
    for m in re.findall(api_pattern, content):
        found.add(('BASE_URL', m))
    
    if found:
        rel = os.path.relpath(jf, base)
        print(f'=== {rel} ===')
        for typ, val in sorted(found):
            print(f'  [{typ}] {val}')
        print()

# Now search specifically for login/SMS related code in pagesC
print('\n' + '='*60)
print('SEARCHING FOR LOGIN/SMS CODE IN pagesC')
print('='*60)

pagesc_js = os.path.join(base, 'pagesC', 'pagesC', 'app-service.js')
if os.path.exists(pagesc_js):
    with open(pagesc_js, 'r', encoding='utf-8', errors='replace') as fh:
        content = fh.read()
    
    # Find all occurrences of login/sms/phone related keywords with context
    keywords = ['sendSms', 'sendCode', 'sms', 'phoneLogin', 'phone', 'login', 'verifyCode', 
                'getCode', 'countDown', 'Token', 'token', 'wx.login', 'code2Session',
                'ph-login', 'phLogin', 'mobile', 'captcha']
    
    for kw in keywords:
        # Find all positions
        positions = []
        start = 0
        while True:
            idx = content.find(kw, start)
            if idx == -1:
                break
            positions.append(idx)
            start = idx + len(kw)
        
        if positions:
            print(f'\n--- "{kw}" found {len(positions)} times ---')
            # Show first 3 occurrences with context
            for pos in positions[:3]:
                ctx_start = max(0, pos - 100)
                ctx_end = min(len(content), pos + 200)
                ctx = content[ctx_start:ctx_end].replace('\n', ' ').replace('\t', ' ')
                print(f'  ...{ctx}...')
