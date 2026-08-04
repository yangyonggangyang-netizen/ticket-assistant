"""Search mini-program log files for URLs, domains, and API endpoints."""
import os
import re
import glob

# Base path for WeChat mini-program data
base = os.path.expandvars(r'%APPDATA%\Tencent\xwechat\radium\users')

# Target mini-program AppID
APPID = 'wx4fd7f63cb29a8891'

# Patterns to search for
patterns = [
    (r'https?://[^\s"\'<>\\]+', 'HTTP URL'),
    (r'wss?://[^\s"\'<>\\]+', 'WebSocket URL'),
    (r'[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s"\'<>\\]*', 'Domain-like'),
    (r'/api/[^\s"\'<>\\]+', 'API path'),
    (r'/v[0-9]+/[^\s"\'<>\\]+', 'Versioned API path'),
]

def search_file(filepath):
    """Search a file for URL/domain patterns."""
    results = []
    try:
        with open(filepath, 'rb') as f:
            data = f.read()
        # Try to decode as UTF-8, fall back to latin-1
        try:
            text = data.decode('utf-8', errors='replace')
        except:
            text = data.decode('latin-1', errors='replace')

        for pattern, label in patterns:
            matches = re.findall(pattern, text)
            for m in matches:
                # Filter out noise
                m_str = str(m)
                if len(m_str) < 5:
                    continue
                # Skip common WeChat domains
                skip = ['weixin.qq.com', 'wx.qq.com', 'tencent.com', 'qq.com',
                        'microsoft.com', 'windows.com', 'schemas.xmlsoap',
                        'www.w3.org', 'ns.adobe.com', 'purl.org',
                        'openid.net', 'www.ietf.org']
                if any(s in m_str.lower() for s in skip):
                    continue
                results.append((label, m_str))
    except Exception as e:
        print(f"  Error reading {filepath}: {e}")
    return results

def main():
    print("=" * 80)
    print("Searching mini-program data for URLs and domains")
    print("=" * 80)

    # Find all user directories
    user_dirs = []
    if os.path.exists(base):
        for d in os.listdir(base):
            full = os.path.join(base, d)
            if os.path.isdir(full):
                user_dirs.append(full)

    print(f"\nFound {len(user_dirs)} user directories")

    all_results = {}

    for user_dir in user_dirs:
        # Search in applet/local/{APPID}/
        local_path = os.path.join(user_dir, 'applet', 'local', APPID)
        if os.path.exists(local_path):
            print(f"\n--- User dir: {os.path.basename(user_dir)} ---")
            print(f"  Path: {local_path}")

            # Search all files recursively
            for root, dirs, files in os.walk(local_path):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    fsize = os.path.getsize(fpath)
                    if fsize > 10_000_000:  # Skip files > 10MB
                        continue
                    results = search_file(fpath)
                    if results:
                        rel_path = os.path.relpath(fpath, local_path)
                        print(f"\n  File: {rel_path} ({fsize:,} bytes)")
                        seen = set()
                        for label, match in results:
                            key = (label, match)
                            if key not in seen:
                                seen.add(key)
                                print(f"    [{label}] {match[:200]}")

        # Also search in applet/packages/{APPID}/
        pkg_path = os.path.join(user_dir, 'applet', 'packages', APPID)
        if os.path.exists(pkg_path):
            for root, dirs, files in os.walk(pkg_path):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    fsize = os.path.getsize(fpath)
                    if fsize > 10_000_000:
                        continue
                    results = search_file(fpath)
                    if results:
                        rel_path = os.path.relpath(fpath, pkg_path)
                        print(f"\n  Package file: {rel_path} ({fsize:,} bytes)")
                        seen = set()
                        for label, match in results:
                            key = (label, match)
                            if key not in seen:
                                seen.add(key)
                                print(f"    [{label}] {match[:200]}")

        # Also search codecache
        cc_path = os.path.join(user_dir, 'applet', 'codecache')
        if os.path.exists(cc_path):
            for root, dirs, files in os.walk(cc_path):
                for fname in files:
                    if fname.endswith('.js'):
                        fpath = os.path.join(root, fname)
                        fsize = os.path.getsize(fpath)
                        if fsize > 10_000_000:
                            continue
                        results = search_file(fpath)
                        # Only show non-WeChat domains
                        interesting = [(l, m) for l, m in results
                                       if not any(s in m.lower() for s in
                                           ['weixin.qq.com', 'wx.qq.com', 'tencent.com',
                                            'qq.com', 'w3.org', 'xmlsoap', 'adobe.com',
                                            'microsoft.com', 'openid.net', 'ietf.org',
                                            'google.com', 'mozilla.org', 'github.com'])]
                        if interesting:
                            print(f"\n  Codecache: {fname} ({fsize:,} bytes)")
                            seen = set()
                            for label, match in interesting:
                                key = (label, match)
                                if key not in seen:
                                    seen.add(key)
                                    print(f"    [{label}] {match[:200]}")

if __name__ == '__main__':
    main()
