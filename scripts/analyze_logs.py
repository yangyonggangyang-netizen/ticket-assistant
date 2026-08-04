"""Deep analysis of mini-program log files to find API URLs."""
import os
import re

base = os.path.expandvars(r'%APPDATA%\Tencent\xwechat\radium\users')
APPID = 'wx4fd7f63cb29a8891'

# Focus on the main user with most recent logs
user_dir = os.path.join(base, '5c49b943d43dc4f78cd906629d45ef75')
local_path = os.path.join(user_dir, 'applet', 'local', APPID)

log_dir = os.path.join(local_path, 'usr', 'miniprogramLog')

print("=" * 80)
print("Deep log analysis for user 5c49b943d43dc4f78cd906629d45ef75")
print("=" * 80)

# Read all log files
for fname in sorted(os.listdir(log_dir)):
    fpath = os.path.join(log_dir, fname)
    if not os.path.isfile(fpath):
        continue
    fsize = os.path.getsize(fpath)
    print(f"\n{'='*60}")
    print(f"File: {fname} ({fsize:,} bytes)")
    print(f"{'='*60}")

    with open(fpath, 'rb') as f:
        data = f.read()

    # Try UTF-8
    text = data.decode('utf-8', errors='replace')

    # Search for various patterns
    patterns = {
        'URLs': r'https?://[^\s"\'<>\\]+',
        'WebSocket': r'wss?://[^\s"\'<>\\]+',
        'Domains': r'(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:/[^\s"\'<>\\]*)?',
        'API paths': r'/api/[^\s"\'<>\\]+',
        'Page paths': r'pages[A-C]?/[^\s"\'<>\\]+',
        'Request info': r'wx\.request[^\n]*',
        'Socket info': r'wx\.connectSocket[^\n]*',
        'Socket open': r'onSocketOpen[^\n]*',
        'Socket msg': r'onSocketMessage[^\n]*',
        'ph-login': r'[^\n]*ph-login[^\n]*',
        'Storage keys': r'(?:get|set|remove)StorageSync[^\n]*',
    }

    for label, pattern in patterns.items():
        matches = re.findall(pattern, text)
        if matches:
            # Deduplicate and show unique matches
            unique = []
            seen = set()
            for m in matches:
                m_str = str(m).strip()
                # Skip common noise
                skip = ['weixin.qq.com', 'wx.qq.com', 'tencent.com', 'qq.com',
                        'w3.org', 'xmlsoap', 'adobe.com', 'microsoft.com',
                        'openid.net', 'ietf.org', 'google.com', 'mozilla.org',
                        'github.com', 'schemas.', 'purl.org', 'ns.adobe']
                if any(s in m_str.lower() for s in skip):
                    continue
                if m_str not in seen:
                    seen.add(m_str)
                    unique.append(m_str)

            if unique:
                print(f"\n  [{label}] ({len(unique)} unique)")
                for u in unique[:30]:
                    print(f"    {u[:200]}")
                if len(unique) > 30:
                    print(f"    ... and {len(unique)-30} more")

    # Also print the full content around ph-login references
    ph_login_matches = list(re.finditer(r'ph-login', text))
    if ph_login_matches:
        print(f"\n  [ph-login context] ({len(ph_login_matches)} occurrences)")
        for i, match in enumerate(ph_login_matches[:5]):
            start = max(0, match.start() - 200)
            end = min(len(text), match.end() + 200)
            context = text[start:end]
            # Clean up
            context = re.sub(r'[^\x20-\x7e\u4e00-\u9fff\n]', '.', context)
            print(f"\n    --- Occurrence {i+1} ---")
            print(f"    {context[:500]}")

# Also check ALL user directories for ph-login
print(f"\n{'='*80}")
print("Checking ALL users for ph-login references")
print(f"{'='*80}")

for d in os.listdir(base):
    user_path = os.path.join(base, d)
    if not os.path.isdir(user_path):
        continue
    local = os.path.join(user_path, 'applet', 'local', APPID, 'usr', 'miniprogramLog')
    if not os.path.exists(local):
        continue

    for fname in os.listdir(local):
        fpath = os.path.join(local, fname)
        if not os.path.isfile(fpath):
            continue
        with open(fpath, 'rb') as f:
            data = f.read()
        text = data.decode('utf-8', errors='replace')
        if 'ph-login' in text:
            print(f"\n  User: {d}, File: {fname}")
            # Find all occurrences and show context
            for match in re.finditer(r'.{0,100}ph-login.{0,100}', text):
                ctx = match.group()
                ctx = re.sub(r'[^\x20-\x7e\u4e00-\u9fff]', '.', ctx)
                print(f"    {ctx[:300]}")
