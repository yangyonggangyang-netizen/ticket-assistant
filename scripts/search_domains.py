"""Search for piaoxf and other domain strings in mini-program data."""
import os
import re

base = os.path.expandvars(r'%APPDATA%\Tencent\xwechat\radium\users')
APPID = 'wx4fd7f63cb29a8891'

# Search strings (case insensitive)
search_strings = [
    b'piaoxf', b'piaoxianfeng', b'film-yun',
    b'jiayi', b'jiayiyinlian', b'jayi',
    b'mhdyp', b'fdep', b'dabu',
    b'.com', b'.cn', b'.net',
    b'http://', b'https://', b'wss://', b'ws://',
    b'api.', b'film.', b'ticket.',
    b'login', b'sms', b'verify', b'phone',
    b'token', b'session',
]

def search_binary(filepath, search_terms):
    """Search binary file for strings."""
    results = []
    try:
        with open(filepath, 'rb') as f:
            data = f.read()

        for term in search_terms:
            idx = 0
            while True:
                idx = data.find(term, idx)
                if idx == -1:
                    break
                # Extract context around the match
                start = max(0, idx - 50)
                end = min(len(data), idx + len(term) + 100)
                context = data[start:end]
                # Try to decode context
                try:
                    text = context.decode('utf-8', errors='replace')
                except:
                    text = context.decode('latin-1', errors='replace')
                # Clean up
                text = re.sub(r'[^\x20-\x7e\u4e00-\u9fff]', '.', text)
                results.append((term.decode('utf-8', errors='replace'), idx, text))
                idx += len(term)
    except Exception as e:
        pass
    return results

def main():
    print("=" * 80)
    print("Searching for domain strings in mini-program data")
    print("=" * 80)

    user_dirs = []
    if os.path.exists(base):
        for d in os.listdir(base):
            full = os.path.join(base, d)
            if os.path.isdir(full):
                user_dirs.append(full)

    for user_dir in user_dirs:
        # Search in applet/local/{APPID}/
        local_path = os.path.join(user_dir, 'applet', 'local', APPID)
        if not os.path.exists(local_path):
            continue

        user_hash = os.path.basename(user_dir)
        print(f"\n--- User: {user_hash} ---")

        for root, dirs, files in os.walk(local_path):
            for fname in files:
                fpath = os.path.join(root, fname)
                fsize = os.path.getsize(fpath)
                if fsize > 20_000_000:
                    continue

                results = search_binary(fpath, search_strings)
                if results:
                    rel_path = os.path.relpath(fpath, local_path)
                    print(f"\n  File: {rel_path} ({fsize:,} bytes)")

                    # Deduplicate and show unique findings
                    seen = set()
                    for term, offset, context in results:
                        # Skip if we've seen similar context
                        key = context[:80]
                        if key in seen:
                            continue
                        seen.add(key)

                        # Only show interesting results
                        if term in ('.com', '.cn', '.net', 'http://', 'https://'):
                            # Only show if it looks like a real domain
                            if not re.search(r'[a-zA-Z0-9-]+\.[a-zA-Z]{2,}', context):
                                continue
                        if term in ('login', 'sms', 'verify', 'phone', 'token', 'session'):
                            # Only show if in context of URL or API
                            if not any(s in context.lower() for s in ['url', 'api', 'http', 'path', 'request']):
                                continue

                        print(f"    [{term}] @offset {offset}")
                        print(f"      Context: {context[:200]}")

        # Also search in codecache
        cc_path = os.path.join(user_dir, 'applet', 'codecache')
        if os.path.exists(cc_path):
            for root, dirs, files in os.walk(cc_path):
                for fname in files:
                    if not fname.endswith('.js'):
                        continue
                    fpath = os.path.join(root, fname)
                    fsize = os.path.getsize(fpath)
                    if fsize > 20_000_000:
                        continue

                    # Only search for piaoxf and domain-related terms in codecache
                    results = search_binary(fpath, [
                        b'piaoxf', b'film-yun', b'mhdyp', b'fdep',
                        b'jiayi', b'dabu', b'jayi'
                    ])
                    if results:
                        print(f"\n  Codecache: {fname} ({fsize:,} bytes)")
                        seen = set()
                        for term, offset, context in results:
                            key = context[:80]
                            if key in seen:
                                continue
                            seen.add(key)
                            print(f"    [{term}] @offset {offset}")
                            print(f"      Context: {context[:200]}")

if __name__ == '__main__':
    main()
