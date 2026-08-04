#!/usr/bin/env python3
"""Find getClientAction definition and API base URL configuration."""
import re
import os

base = r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\wxapkg_unpacked'

# Read main app-service.js
main_js = os.path.join(base, 'appAPPapp', 'app-service.js')
with open(main_js, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find getClientAction definition
print("="*60)
print("SEARCHING FOR getClientAction / postClientAction DEFINITION")
print("="*60)

# Search for function definitions
patterns = [
    'getClientAction',
    'postClientAction', 
    'postClientActionWithJson',
    'putClientAction',
    'warnToast',
    'baseClientUrl',
    'baseUrl',
    'requestUrl',
    'apiUrl',
    'film-api',
    'piaoxf',
    'yq30',
    'api.yq30',
    'getExtConfigSync',
    'merchant_code',
]

for pat in patterns:
    positions = []
    start = 0
    while True:
        idx = content.find(pat, start)
        if idx == -1:
            break
        positions.append(idx)
        start = idx + len(pat)
    
    if positions:
        print(f'\n--- "{pat}" found {len(positions)} times ---')
        for pos in positions[:5]:
            ctx_start = max(0, pos - 200)
            ctx_end = min(len(content), pos + 400)
            ctx = content[ctx_start:ctx_end].replace('\n', ' ').replace('\t', ' ')
            print(f'  [{pos}]: ...{ctx}...')
            print()

# Also check app-config.json
print("\n" + "="*60)
print("APP-CONFIG.JSON")
print("="*60)
config_path = os.path.join(base, 'appAPPapp', 'app-config.json')
if os.path.exists(config_path):
    with open(config_path, 'r', encoding='utf-8', errors='replace') as f:
        config = f.read()
    # Look for URL patterns
    urls = re.findall(r'https?://[^\s"\'\\]+', config)
    for url in urls:
        print(f'  URL: {url}')
    
    # Look for request/network configuration
    for keyword in ['request', 'baseUrl', 'api', 'domain', 'host']:
        idx = config.lower().find(keyword)
        if idx != -1:
            ctx = config[max(0,idx-50):idx+200]
            print(f'  [{keyword}]: ...{ctx}...')
