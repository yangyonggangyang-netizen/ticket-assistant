"""Search JS for request configuration, headers, interceptors, and API paths."""
import re

with open(r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\scripts\index.js', 'r', encoding='utf-8', errors='replace') as f:
    js = f.read()

# 1. Find the P7e function (creates request instance)
print("=" * 80)
print("1. P7e function (request instance creator)")
print("=" * 80)

# Find P7e definition
for match in re.finditer(r'function\s+P7e\s*\([^)]*\)\s*\{[^}]+\}', js):
    print(f"  {match.group()[:1000]}")

# Also search for the context around P7e
for match in re.finditer(r'.{0,100}P7e.{0,500}', js):
    text = match.group()
    if 'function' in text or 'return' in text or 'new' in text:
        print(f"\n  Context: {text[:800]}")

# 2. Find request interceptors
print("\n" + "=" * 80)
print("2. Request interceptors (headers, tokens)")
print("=" * 80)

# Search for interceptor code
for match in re.finditer(r'interceptors\.request\.use\s*\([^)]+\)', js):
    print(f"  {match.group()[:500]}")

# Search for header setting code
for match in re.finditer(r'(?:headers|header)\.\w+\s*=\s*[^;,\n]+', js):
    text = match.group()
    if any(kw in text.lower() for kw in ['token', 'auth', 'channel', 'app', 'version', 'content-type', 'accept']):
        print(f"  {text[:200]}")

# 3. Find all path strings that look like API endpoints
print("\n" + "=" * 80)
print("3. All path-like strings")
print("=" * 80)

# Look for strings that start with / and look like API paths
paths = re.findall(r'["\'`](/[a-zA-Z][a-zA-Z0-9_/-]*(?:\?[^"\'`]*)?)["\'`]', js)
unique_paths = sorted(set(paths))
print(f"\nFound {len(unique_paths)} path strings:")
for p in unique_paths:
    # Skip common non-API paths
    skip = ['/assets/', '/pages/', '/node_modules/', '/src/', '/components/',
            '/static/', '/public/', '/@', '/.', '/__']
    if any(p.startswith(s) for s in skip):
        continue
    print(f"  {p}")

# 4. Search for nie.post and nie.get calls
print("\n" + "=" * 80)
print("4. Request calls (nie.post/get/put/delete)")
print("=" * 80)

for match in re.finditer(r'nie\.(post|get|put|delete)\s*\(\s*\{[^}]+\}', js):
    print(f"  {match.group()[:300]}")

# Also search for .post({url:...}) pattern
for match in re.finditer(r'\.(post|get|put|delete)\s*\(\s*\{\s*url\s*:\s*["\'`]([^"\'`]+)["\'`][^}]*\}', js):
    method = match.group(1)
    url = match.group(2)
    full = match.group()
    print(f"  {method.upper()} {url}")
    # Show more context
    print(f"    Full: {full[:300]}")

# 5. Search for any string containing "admin" or "mini" or "app"
print("\n" + "=" * 80)
print("5. Strings containing admin/mini/app/cinema/film/ticket")
print("=" * 80)

for keyword in ['admin', 'mini', 'cinema', 'film', 'ticket', 'order', 'seat', 'schedule', 'sms', 'code']:
    matches = re.findall(rf'["\'`]([^"\'`]*{keyword}[^"\'`]*)["\'`]', js, re.IGNORECASE)
    unique = sorted(set(matches))
    # Filter to only show path-like strings
    path_like = [m for m in unique if '/' in m and len(m) < 100 and not m.startswith('http')]
    if path_like:
        print(f"\n  [{keyword}] ({len(path_like)} path-like matches)")
        for m in path_like[:15]:
            print(f"    {m}")

# 6. Search for the full login flow
print("\n" + "=" * 80)
print("6. Full login flow context")
print("=" * 80)

# Find the store/state definition with login
for match in re.finditer(r'state\s*\(\s*\(\)\s*=>\s*\(\{[^}]*token[^}]*\}\)\s*,\s*getters[^}]*\}\s*,\s*actions\s*:\s*\{[^}]*login[^}]+\}', js, re.DOTALL):
    print(f"  {match.group()[:1000]}")

# 7. Find token storage
print("\n" + "=" * 80)
print("7. Token storage code")
print("=" * 80)

for match in re.finditer(r'localStorage\.(setItem|getItem|removeItem)\s*\([^)]+\)', js):
    print(f"  {match.group()[:200]}")

# 8. Search for channel/app identifiers
print("\n" + "=" * 80)
print("8. Channel/app identifiers")
print("=" * 80)

for match in re.finditer(r'(?:channel|appid|app_id|appKey|app_key|secret)\s*[:=]\s*["\'`]([^"\'`]+)["\'`]', js, re.IGNORECASE):
    print(f"  {match.group()[:200]}")
