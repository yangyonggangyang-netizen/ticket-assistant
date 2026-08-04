#!/usr/bin/env python3
"""Extract ALL API endpoints from all JS files."""
import re
import os

base = r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\wxapkg_unpacked'

# All JS files
js_files = []
for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith('.js'):
            js_files.append(os.path.join(root, f))

# Extract all API paths (patterns like "/api/xxx" or "/film/xxx" or "/member/xxx" etc.)
api_pattern = r'["\'](/(?:api|film|member|bar|trans|equity|activity|order|captcha|sys)/[a-zA-Z0-9_/\-]+)["\']'

all_endpoints = set()

for jf in js_files:
    with open(jf, 'r', encoding='utf-8', errors='replace') as fh:
        content = fh.read()
    
    matches = re.findall(api_pattern, content)
    for m in matches:
        all_endpoints.add(m)

print("="*60)
print(f"ALL API ENDPOINTS FOUND ({len(all_endpoints)} unique)")
print("="*60)
for ep in sorted(all_endpoints):
    print(f"  {ep}")

# Now search for phone login specifically
print("\n\n" + "="*60)
print("SEARCHING FOR PHONE LOGIN PATTERNS")
print("="*60)

phone_patterns = [
    r'phoneLogin',
    r'phone login',
    r'sendSms',
    r'sendSMS',
    r'sendVerifyCode',
    r'getVerifyCode',
    r'loginByPhone',
    r'loginBySms',
    r'mobileLogin',
    r'smsLogin',
    r'codeLogin',
    r'fastLogin',
    r'/api/member/[a-zA-Z]+',
    r'/api/login[a-zA-Z]*',
    r'/api/sms[a-zA-Z]*',
    r'/api/verify[a-zA-Z]*',
    r'/api/phone[a-zA-Z]*',
    r'/api/captcha[a-zA-Z/]*',
]

for pat in phone_patterns:
    for jf in js_files:
        with open(jf, 'r', encoding='utf-8', errors='replace') as fh:
            content = fh.read()
        
        matches = re.findall(pat, content, re.IGNORECASE)
        if matches:
            rel = os.path.relpath(jf, base)
            unique_matches = sorted(set(matches))
            print(f'  [{pat}] in {rel}: {unique_matches}')

# Extract the full request wrapper function
print("\n\n" + "="*60)
print("REQUEST WRAPPER FUNCTION (from main app-service.js)")
print("="*60)

main_js = os.path.join(base, 'appAPPapp', 'app-service.js')
with open(main_js, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find the request wrapper - search for "var u=function" near "getStorageSync"
idx = content.find('var u=function(t){var e=r.getStorageSync("token")')
if idx == -1:
    idx = content.find('getStorageSync("token")')
    if idx != -1:
        # Go back to find the function start
        for i in range(idx, max(0, idx-500), -1):
            if content[i:i+20].startswith('var u=function'):
                idx = i
                break

if idx != -1:
    # Extract a good chunk of the function
    chunk = content[idx:idx+2000]
    print(chunk[:2000])
else:
    print("Request wrapper function not found")

# Also search for the full login page component in pagesC
print("\n\n" + "="*60)
print("LOGIN PAGE COMPONENT (from pagesC)")
print("="*60)

pagesc_js = os.path.join(base, 'pagesC', 'pagesC', 'app-service.js')
with open(pagesc_js, 'r', encoding='utf-8', errors='replace') as f:
    pc_content = f.read()

# Find the login page component
# Search for "pagesC/login/login" component definition
login_markers = [
    "pagesC/login/login.js",
    "ph-login.js",
    "login.wxml",
]

for marker in login_markers:
    idx = pc_content.find(marker)
    if idx != -1:
        # Extract surrounding context
        start = max(0, idx - 200)
        end = min(len(pc_content), idx + 2000)
        chunk = pc_content[start:end]
        print(f'\n--- Found "{marker}" at position {idx} ---')
        print(chunk[:2000])
        print()
