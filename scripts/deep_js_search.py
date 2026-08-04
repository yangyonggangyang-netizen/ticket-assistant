"""Deep search for API paths in the management system JavaScript."""
import re

with open(r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\scripts\index.js', 'r', encoding='utf-8', errors='replace') as f:
    js = f.read()

# 1. Search for all URL paths used in requests
print("=" * 80)
print("1. All request URL paths")
print("=" * 80)

# Look for patterns like url:"/path" or url:'/path' or url:`/path`
url_patterns = [
    r'url\s*:\s*["\'`]([^"\'`]+)["\'`]',
    r'url\s*:\s*`([^`]+)`',
    r'\.post\s*\(\s*["\'`]([^"\'`]+)["\'`]',
    r'\.get\s*\(\s*["\'`]([^"\'`]+)["\'`]',
    r'\.put\s*\(\s*["\'`]([^"\'`]+)["\'`]',
    r'\.delete\s*\(\s*["\'`]([^"\'`]+)["\'`]',
    r'request\s*\(\s*{\s*url\s*:\s*["\'`]([^"\'`]+)["\'`]',
]

all_urls = set()
for pattern in url_patterns:
    matches = re.findall(pattern, js)
    for m in matches:
        all_urls.add(m)

print(f"\nFound {len(all_urls)} unique URL paths:")
for url in sorted(all_urls):
    print(f"  {url}")

# 2. Search for all string literals containing common API keywords
print("\n" + "=" * 80)
print("2. String literals with API keywords")
print("=" * 80)

keywords = ['login', 'sms', 'verify', 'code', 'phone', 'captcha',
            'token', 'session', 'user', 'member', 'auth',
            'film', 'movie', 'cinema', 'ticket', 'order',
            'seat', 'schedule', 'showtime', 'pay', 'balance',
            'point', 'score', 'mall', 'shop', 'product',
            'register', 'signup', 'password']

for kw in keywords:
    # Find string literals containing this keyword
    patterns = [
        rf'["\'`]([^"\'`]*{kw}[^"\'`]*)["\'`]',
    ]
    matches = set()
    for p in patterns:
        for m in re.findall(p, js, re.IGNORECASE):
            # Filter: only keep strings that look like API paths or meaningful config
            if len(m) > 3 and len(m) < 200:
                # Skip if it's a CSS class, HTML tag, or other noise
                if not any(s in m for s in ['px', 'rem', 'em;', 'rgba', 'rgb(', '#',
                                              'margin', 'padding', 'border', 'font-',
                                              'background', 'display', 'position',
                                              'width', 'height', 'color:', 'class=']):
                    matches.add(m)
    if matches:
        print(f"\n  [{kw}] ({len(matches)} matches)")
        for m in sorted(matches)[:20]:
            print(f"    {m}")

# 3. Search for the context around film-api.piaoxf.com
print("\n" + "=" * 80)
print("3. Context around film-api.piaoxf.com")
print("=" * 80)

for match in re.finditer(r'.{0,200}film-api\.piaoxf\.com.{0,200}', js):
    print(f"\n  {match.group()[:500]}")

# 4. Search for phoneLogin context
print("\n" + "=" * 80)
print("4. Context around phoneLogin")
print("=" * 80)

for match in re.finditer(r'.{0,300}phoneLogin.{0,300}', js):
    print(f"\n  {match.group()[:600]}")

# 5. Search for accountLogin context
print("\n" + "=" * 80)
print("5. Context around accountLogin")
print("=" * 80)

for match in re.finditer(r'.{0,300}accountLogin.{0,300}', js):
    print(f"\n  {match.group()[:600]}")

# 6. Search for wechatLogin context
print("\n" + "=" * 80)
print("6. Context around wechatLogin")
print("=" * 80)

for match in re.finditer(r'.{0,300}wechatLogin.{0,300}', js):
    print(f"\n  {match.group()[:600]}")

# 7. Search for login function
print("\n" + "=" * 80)
print("7. Login function context")
print("=" * 80)

for match in re.finditer(r'async\s+login\s*\([^)]*\)\s*\{[^}]+\}', js):
    print(f"\n  {match.group()[:500]}")
