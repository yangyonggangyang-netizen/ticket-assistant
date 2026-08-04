import re, os

dirs = [
    'wxapkg_unpacked/appAPPapp',
    'wxapkg_unpacked/pagesA/pagesA',
    'wxapkg_unpacked/pagesB/pagesB',
    'wxapkg_unpacked/pagesC/pagesC',
]

for d in dirs:
    if not os.path.isdir(d):
        continue
    for fn in os.listdir(d):
        if not fn.endswith('.js'):
            continue
        fp = os.path.join(d, fn)
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # Find all /api/order/ or /order/ patterns
        matches = set(re.findall(r'["\']([^"\']*?/api/order/[^"\']*?)["\']', content))
        matches2 = set(re.findall(r'["\']([^"\']*?/order/[^"\']*?)["\']', content))
        for m in sorted(matches | matches2):
            print(f'{fn}: {m}')

        # Find getClientAction calls related to orders
        actions = re.findall(r'getClientAction\(\s*["\']([^"\']+)["\']', content)
        for a in actions:
            if 'order' in a.lower() or 'ticket' in a.lower():
                print(f'  getClientAction: {a}')

        # Find any URL with 'order' in it
        urls = set(re.findall(r'["\']([^"\']{5,80}order[^"\']{0,80})["\']', content, re.IGNORECASE))
        for u in sorted(urls):
            if 'api' in u.lower() or '/order' in u.lower():
                if len(u) < 120:
                    print(f'  URL: {u}')
