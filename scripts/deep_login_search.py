#!/usr/bin/env python3
"""Deep dive into login page and captcha usage."""
import re
import os

base = r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\wxapkg_unpacked'

# Read pagesC app-service.js
pagesc_js = os.path.join(base, 'pagesC', 'pagesC', 'app-service.js')
with open(pagesc_js, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Search for /api/captcha/create usage
print("="*60)
print("SEARCHING FOR /api/captcha/create USAGE")
print("="*60)

for term in ['/api/captcha/create', 'captcha/create', 'createCaptcha', 'getCaptcha']:
    positions = []
    start = 0
    while True:
        idx = content.find(term, start)
        if idx == -1:
            break
        positions.append(idx)
        start = idx + len(term)
    
    if positions:
        print(f'\n--- "{term}" found {len(positions)} times ---')
        for pos in positions[:5]:
            ctx_start = max(0, pos - 300)
            ctx_end = min(len(content), pos + 500)
            ctx = content[ctx_start:ctx_end].replace('\n', ' ').replace('\t', ' ')
            print(f'  [{pos}]: ...{ctx}...')
            print()

# Search for the login page component (not ph-login, but login.js)
print("\n" + "="*60)
print("SEARCHING FOR LOGIN PAGE COMPONENT")
print("="*60)

# The login page component is defined somewhere in the webpack modules
# Search for "pagesC/login/login" in the define/module section
search_terms = [
    "pagesC/login/login.js",
    "wx.login",
    "getUserProfile",
    "getUserInfo",
    "button open-type",
    "getPhoneNumber",
    "bindgetphonenumber",
    "encryptedData",
    "loginWithCode",
    "reLogin",
    "toLogin",
    "noLogin",
]

for term in search_terms:
    positions = []
    start = 0
    while True:
        idx = content.find(term, start)
        if idx == -1:
            break
        positions.append(idx)
        start = idx + len(term)
    
    if positions:
        print(f'\n--- "{term}" found {len(positions)} times in pagesC ---')
        for pos in positions[:3]:
            ctx_start = max(0, pos - 200)
            ctx_end = min(len(content), pos + 500)
            ctx = content[ctx_start:ctx_end].replace('\n', ' ').replace('\t', ' ')
            print(f'  [{pos}]: ...{ctx[:600]}...')
            print()

# Also search in main app-service.js
main_js = os.path.join(base, 'appAPPapp', 'app-service.js')
with open(main_js, 'r', encoding='utf-8', errors='replace') as f:
    main_content = f.read()

print("\n" + "="*60)
print("SEARCHING IN MAIN APP-SERVICE.JS")
print("="*60)

for term in ['wx.login', 'getUserProfile', 'noLogin', 'toLogin', '/api/member/register', '/api/member/wxResetPassword', '/api/member/updatePhoneNumber']:
    positions = []
    start = 0
    while True:
        idx = main_content.find(term, start)
        if idx == -1:
            break
        positions.append(idx)
        start = idx + len(term)
    
    if positions:
        print(f'\n--- "{term}" found {len(positions)} times in main ---')
        for pos in positions[:3]:
            ctx_start = max(0, pos - 200)
            ctx_end = min(len(main_content), pos + 500)
            ctx = main_content[ctx_start:ctx_end].replace('\n', ' ').replace('\t', ' ')
            print(f'  [{pos}]: ...{ctx[:600]}...')
            print()

# Search in all files for register and resetPassword
print("\n" + "="*60)
print("SEARCHING FOR REGISTER AND RESET PASSWORD")
print("="*60)

for jf in [main_js, pagesc_js, 
           os.path.join(base, 'pagesA', 'pagesA', 'app-service.js'),
           os.path.join(base, 'pagesB', 'pagesB', 'app-service.js')]:
    with open(jf, 'r', encoding='utf-8', errors='replace') as f:
        c = f.read()
    
    for term in ['/api/member/register', '/api/member/wxResetPassword', 'resetPwd', 'resetPassword']:
        idx = c.find(term)
        if idx != -1:
            rel = os.path.relpath(jf, base)
            ctx_start = max(0, idx - 300)
            ctx_end = min(len(c), idx + 500)
            ctx = c[ctx_start:ctx_end].replace('\n', ' ').replace('\t', ' ')
            print(f'  [{rel}] "{term}": ...{ctx[:700]}...')
            print()
