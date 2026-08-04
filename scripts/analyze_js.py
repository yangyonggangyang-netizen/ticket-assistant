"""Search the management system's JavaScript for API URLs and domains."""
import re

with open(r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\scripts\index.js', 'r', encoding='utf-8', errors='replace') as f:
    js = f.read()

print(f"File size: {len(js)} chars")

# 1. Find all URLs
print("\n" + "=" * 80)
print("1. All URLs found:")
print("=" * 80)
urls = re.findall(r'https?://[^\s"\'`,;<>\\]+', js)
unique_urls = sorted(set(urls))
for url in unique_urls:
    print(f"  {url[:200]}")

# 2. Find all domain-like strings
print("\n" + "=" * 80)
print("2. Domain-like strings:")
print("=" * 80)
domains = re.findall(r'(?:["\'`])([a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[a-zA-Z0-9/]*)["\'`]', js)
unique_domains = sorted(set(domains))
for d in unique_domains:
    # Skip common non-API domains
    skip = ['w3.org', 'xmlsoap', 'adobe.com', 'microsoft.com', 'github.com',
            'google.com', 'mozilla.org', 'ietf.org', 'opensource.org']
    if any(s in d.lower() for s in skip):
        continue
    print(f"  {d}")

# 3. Find API path patterns
print("\n" + "=" * 80)
print("3. API path patterns:")
print("=" * 80)
api_paths = re.findall(r'["\'`]/(?:api|admin|mini|app|wx|v1|v2)[^\s"\'`,;<>\\]*["\'`]', js)
unique_paths = sorted(set(api_paths))
for p in unique_paths[:50]:
    print(f"  {p}")
if len(unique_paths) > 50:
    print(f"  ... and {len(unique_paths)-50} more")

# 4. Find baseURL or API_BASE or similar config
print("\n" + "=" * 80)
print("4. Base URL / API config:")
print("=" * 80)
config_patterns = [
    r'baseURL\s*[:=]\s*["\'`]([^"\'`]+)["\'`]',
    r'API_BASE\s*[:=]\s*["\'`]([^"\'`]+)["\'`]',
    r'BASE_URL\s*[:=]\s*["\'`]([^"\'`]+)["\'`]',
    r'apiUrl\s*[:=]\s*["\'`]([^"\'`]+)["\'`]',
    r'apiBase\s*[:=]\s*["\'`]([^"\'`]+)["\'`]',
    r'requestUrl\s*[:=]\s*["\'`]([^"\'`]+)["\'`]',
    r'serverUrl\s*[:=]\s*["\'`]([^"\'`]+)["\'`]',
    r'VITE_\w+\s*[:=]\s*["\'`]([^"\'`]+)["\'`]',
    r'VITE_\w+',
]
for pattern in config_patterns:
    matches = re.findall(pattern, js)
    if matches:
        for m in set(matches):
            print(f"  [{pattern[:30]}] {m}")

# 5. Find WebSocket URLs
print("\n" + "=" * 80)
print("5. WebSocket URLs:")
print("=" * 80)
ws_urls = re.findall(r'wss?://[^\s"\'`,;<>\\]+', js)
for url in sorted(set(ws_urls)):
    print(f"  {url}")

# 6. Search for "piaoxf" mentions
print("\n" + "=" * 80)
print("6. 'piaoxf' mentions:")
print("=" * 80)
for match in re.finditer(r'.{0,50}piaoxf.{0,50}', js, re.IGNORECASE):
    print(f"  {match.group()[:200]}")

# 7. Search for "login" related code
print("\n" + "=" * 80)
print("7. Login-related code snippets:")
print("=" * 80)
login_patterns = [
    r'["\'`][^"\'`]*login[^"\'`]*["\'`]',
    r'["\'`][^"\'`]*sms[^"\'`]*["\'`]',
    r'["\'`][^"\'`]*verify[^"\'`]*["\'`]',
    r'["\'`][^"\'`]*phone[^"\'`]*["\'`]',
    r'["\'`][^"\'`]*captcha[^"\'`]*["\'`]',
]
for pattern in login_patterns:
    matches = re.findall(pattern, js, re.IGNORECASE)
    if matches:
        unique = sorted(set(matches))
        print(f"\n  Pattern: {pattern[:40]}")
        for m in unique[:15]:
            print(f"    {m[:150]}")
        if len(unique) > 15:
            print(f"    ... and {len(unique)-15} more")

# 8. Search for environment variables
print("\n" + "=" * 80)
print("8. Environment/config variables:")
print("=" * 80)
env_patterns = re.findall(r'(?:import\.meta\.env|process\.env)\.\w+', js)
for env in sorted(set(env_patterns)):
    print(f"  {env}")

# 9. Search for axios or request configuration
print("\n" + "=" * 80)
print("9. Request configuration:")
print("=" * 80)
request_patterns = [
    r'axios\.create\([^)]+\)',
    r'request\.defaults\.[^;]+',
    r'interceptors\.[^;]+',
]
for pattern in request_patterns:
    matches = re.findall(pattern, js)
    for m in matches[:5]:
        print(f"  {m[:300]}")
