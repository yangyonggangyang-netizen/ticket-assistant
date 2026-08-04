"""Search for mini-program API URLs and mpauth-related code in JS."""
import re

with open(r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\scripts\index.js', 'r', encoding='utf-8', errors='replace') as f:
    js = f.read()

# 1. Search for mpauth context
print("=" * 80)
print("1. mpauth (mini-program auth) context")
print("=" * 80)

for match in re.finditer(r'.{0,200}mpauth.{0,200}', js):
    text = match.group()
    if 'url' in text or 'api' in text or 'post' in text or 'get' in text or 'mini' in text:
        print(f"\n  {text[:500]}")

# 2. Search for all URLs and domains more broadly
print("\n" + "=" * 80)
print("2. All URLs containing 'piaoxf' or 'api'")
print("=" * 80)

for match in re.finditer(r'https?://[^\s"\'`,;<>\\]+', js):
    url = match.group()
    if 'piaoxf' in url.lower() or 'api' in url.lower():
        print(f"  {url}")

# 3. Search for "mini" related strings
print("\n" + "=" * 80)
print("3. 'mini' related strings (URL/path context)")
print("=" * 80)

for match in re.finditer(r'.{0,100}mini.{0,100}', js, re.IGNORECASE):
    text = match.group()
    # Only show if it looks like it could be an API path or URL
    if any(kw in text.lower() for kw in ['url', 'api', 'path', 'request', '/mini', 'prefix', 'domain']):
        # Skip CSS/style related
        if not any(kw in text.lower() for kw in ['min-width', 'min-height', 'minimap', 'minify', 'minimum', 'admin']):
            print(f"\n  {text[:300]}")

# 4. Search for "appid" or "app_id" or "wxapp" 
print("\n" + "=" * 80)
print("4. AppID related strings")
print("=" * 80)

for match in re.finditer(r'.{0,80}(?:appid|app_id|wxapp|appid).{0,80}', js, re.IGNORECASE):
    text = match.group()
    if not any(kw in text.lower() for kw in ['navigator', 'useragent', 'msie']):
        print(f"  {text[:200]}")

# 5. Search for WebSocket related code
print("\n" + "=" * 80)
print("5. WebSocket related code")
print("=" * 80)

for match in re.finditer(r'.{0,100}(?:websocket|socket|ws://|wss://).{0,100}', js, re.IGNORECASE):
    text = match.group()
    if 'websocket' in text.lower() or 'ws://' in text or 'wss://' in text:
        print(f"  {text[:300]}")

# 6. Search for "token" header configuration
print("\n" + "=" * 80)
print("6. Token header configuration")
print("=" * 80)

for match in re.finditer(r'.{0,100}headers\.token.{0,100}', js):
    print(f"  {match.group()[:300]}")

for match in re.finditer(r'.{0,100}withToken.{0,100}', js):
    print(f"  {match.group()[:300]}")

# 7. Search for joinTime (timestamp parameter)
print("\n" + "=" * 80)
print("7. joinTime (timestamp) configuration")
print("=" * 80)

for match in re.finditer(r'.{0,100}joinTime.{0,100}', js):
    print(f"  {match.group()[:300]}")

# 8. Search for "channelid" or "channel_id"
print("\n" + "=" * 80)
print("8. Channel ID configuration")
print("=" * 80)

for match in re.finditer(r'.{0,80}channel.{0,80}', js, re.IGNORECASE):
    text = match.group()
    if any(kw in text.lower() for kw in ['id', 'header', 'config', 'param']):
        if not any(kw in text.lower() for kw in ['websocket', 'socket', 'message']):
            print(f"  {text[:200]}")

# 9. Look for all JS file references
print("\n" + "=" * 80)
print("9. JS file references (might find mini-program config)")
print("=" * 80)

js_files = re.findall(r'(?:assets|src)/[^\s"\'`]+\.js', js)
unique_js = sorted(set(js_files))
for f in unique_js:
    print(f"  {f}")
