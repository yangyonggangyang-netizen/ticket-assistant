"""Try to find wxid for wxapkg decryption and search for piaoxf in all WeChat data."""
import os
import re
import glob

# 1. Search for wxid in WeChat data
wechat_base = os.path.expandvars(r'%APPDATA%\Tencent\xwechat\radium')

print("=" * 80)
print("1. Searching for wxid in WeChat data")
print("=" * 80)

# Search in config files, MMKV, etc.
search_paths = [
    os.path.join(wechat_base, 'config'),
    os.path.join(wechat_base, 'users'),
]

for search_path in search_paths:
    if not os.path.exists(search_path):
        continue
    for root, dirs, files in os.walk(search_path):
        # Limit depth
        depth = root.replace(search_path, '').count(os.sep)
        if depth > 2:
            continue
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                fsize = os.path.getsize(fpath)
                if fsize > 5_000_000:
                    continue
                with open(fpath, 'rb') as f:
                    data = f.read()
                # Search for wxid_ pattern
                for match in re.finditer(rb'wxid_[a-zA-Z0-9_]+', data):
                    wxid = match.group().decode('ascii', errors='replace')
                    print(f"  Found wxid: {wxid} in {os.path.relpath(fpath, wechat_base)}")
                # Also search for "wxid" as JSON key
                for match in re.finditer(rb'"wxid"\s*:\s*"([^"]+)"', data):
                    wxid = match.group(1).decode('ascii', errors='replace')
                    print(f"  Found wxid (JSON): {wxid} in {os.path.relpath(fpath, wechat_base)}")
            except:
                pass

# 2. Search for piaoxf in ALL WeChat data (broader search)
print(f"\n{'='*80}")
print("2. Searching for 'piaoxf' in all WeChat data")
print("=" * 80)

APPID = 'wx4fd7f63cb29a8891'
for root, dirs, files in os.walk(wechat_base):
    for fname in files:
        fpath = os.path.join(root, fname)
        try:
            fsize = os.path.getsize(fpath)
            if fsize > 20_000_000:
                continue
            with open(fpath, 'rb') as f:
                data = f.read()
            if b'piaoxf' in data.lower():
                rel = os.path.relpath(fpath, wechat_base)
                print(f"  Found 'piaoxf' in: {rel} ({fsize:,} bytes)")
                # Show context
                for match in re.finditer(rb'.{0,50}piaoxf.{0,50}', data, re.IGNORECASE):
                    ctx = match.group()
                    try:
                        text = ctx.decode('utf-8', errors='replace')
                    except:
                        text = ctx.decode('latin-1', errors='replace')
                    text = re.sub(r'[^\x20-\x7e]', '.', text)
                    print(f"    Context: {text}")
        except:
            pass

# 3. Also search for 'film-yun' pattern
print(f"\n{'='*80}")
print("3. Searching for 'film-yun' in all WeChat data")
print("=" * 80)

for root, dirs, files in os.walk(wechat_base):
    # Skip deep directories
    depth = root.replace(wechat_base, '').count(os.sep)
    if depth > 4:
        continue
    for fname in files:
        fpath = os.path.join(root, fname)
        try:
            fsize = os.path.getsize(fpath)
            if fsize > 20_000_000:
                continue
            with open(fpath, 'rb') as f:
                data = f.read()
            if b'film-yun' in data or b'film_yun' in data:
                rel = os.path.relpath(fpath, wechat_base)
                print(f"  Found 'film-yun' in: {rel} ({fsize:,} bytes)")
        except:
            pass

# 4. Check WeChat install directory for wxid
print(f"\n{'='*80}")
print("4. Checking WeChat install directory")
print("=" * 80)

# Check common WeChat install paths
install_paths = [
    r'C:\Program Files\Tencent\Weixin',
    r'C:\Program Files (x86)\Tencent\Weixin',
    r'C:\Program Files\Tencent\WeChat',
    r'C:\Program Files (x86)\Tencent\WeChat',
    os.path.expandvars(r'%LOCALAPPDATA%\Tencent\Weixin'),
    os.path.expandvars(r'%LOCALAPPDATA%\Tencent\WeChat'),
]

for path in install_paths:
    if os.path.exists(path):
        print(f"  Found WeChat install: {path}")
        # List files
        for item in os.listdir(path):
            print(f"    {item}")

# 5. Check registry for wxid
print(f"\n{'='*80}")
print("5. Checking Windows registry for wxid")
print("=" * 80)

import subprocess
reg_paths = [
    r'HKCU\Software\Tencent\Weixin',
    r'HKCU\Software\Tencent\WeChat',
    r'HKCU\Software\Tencent\xwechat',
    r'HKLM\Software\Tencent\Weixin',
    r'HKLM\Software\Tencent\WeChat',
    r'HKLM\Software\WOW6432Node\Tencent\WeChat',
    r'HKLM\Software\WOW6432Node\Tencent\Weixin',
]

for reg_path in reg_paths:
    result = subprocess.run(['reg', 'query', reg_path], capture_output=True, text=True, errors='replace')
    if result.returncode == 0 and result.stdout.strip():
        print(f"\n  Registry: {reg_path}")
        for line in result.stdout.strip().split('\n'):
            line = line.strip()
            if line and line != reg_path:
                print(f"    {line}")
