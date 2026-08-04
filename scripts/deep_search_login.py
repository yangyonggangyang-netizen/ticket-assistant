#!/usr/bin/env python3
"""Deep search for login flow and HTTP request configuration in wxapkg source."""
import re
import os

base = r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\wxapkg_unpacked'

# Read the main app-service.js (contains shared utilities and request config)
main_js = os.path.join(base, 'appAPPapp', 'app-service.js')
pagesc_js = os.path.join(base, 'pagesC', 'pagesC', 'app-service.js')

def extract_around(content, keyword, before=200, after=500, max_occurrences=5):
    """Extract context around keyword occurrences."""
    results = []
    start = 0
    while len(results) < max_occurrences:
        idx = content.find(keyword, start)
        if idx == -1:
            break
        ctx_start = max(0, idx - before)
        ctx_end = min(len(content), idx + after)
        ctx = content[ctx_start:ctx_end]
        results.append((idx, ctx))
        start = idx + len(keyword)
    return results

# Search in main app-service.js for request configuration
print("="*60)
print("MAIN APP-SERVICE.JS - Request Configuration")
print("="*60)

with open(main_js, 'r', encoding='utf-8', errors='replace') as f:
    main_content = f.read()

# Search for request wrapper, token handling, and base URL
search_terms = [
    'wx.request',
    'film-api',
    'piaoxf',
    'Token',
    'token',
    'setStorageSync',
    'getStorageSync',
    'request:',
    'http:',
    'baseUrl',
    'BASE_URL',
    'apiUrl',
    'interceptor',
    'header',
    'Authorization',
]

for term in search_terms:
    results = extract_around(main_content, term, before=150, after=300, max_occurrences=3)
    if results:
        print(f'\n--- "{term}" in main app-service.js ({len(results)} shown) ---')
        for idx, ctx in results:
            # Clean up the context
            ctx_clean = ctx.replace('\n', ' ').replace('\t', ' ')
            print(f'  [{idx}]: ...{ctx_clean}...')

# Search in pagesC for the ph-login page implementation
print("\n\n" + "="*60)
print("PAGESC APP-SERVICE.JS - ph-login Page Implementation")
print("="*60)

with open(pagesc_js, 'r', encoding='utf-8', errors='replace') as f:
    pagesc_content = f.read()

# Find the ph-login component definition and its methods
search_terms_c = [
    'ph-login',
    'phoneLogin',
    'sendSms',
    'sendSMS',
    'sms',
    'getCode',
    'countDown',
    'verifyCode',
    'wx.login',
    'code2Session',
    '/film/login',
    'phone',
    'mobile',
    'Token',
    'token',
    'setStorageSync',
    'getStorageSync',
    'wx.request',
    'request',
    'login',
    'submit',
    'bindgetphonenumber',
    'getPhoneNumber',
    'e.encryptedData',
    'iv',
]

for term in search_terms_c:
    results = extract_around(pagesc_content, term, before=200, after=400, max_occurrences=3)
    if results:
        print(f'\n--- "{term}" in pagesC ({len(results)} shown) ---')
        for idx, ctx in results:
            ctx_clean = ctx.replace('\n', ' ').replace('\t', ' ')
            print(f'  [{idx}]: ...{ctx_clean}...')
