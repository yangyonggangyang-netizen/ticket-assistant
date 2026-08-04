"""Capture new connections and DNS entries after mini-program interaction."""
import subprocess
import socket
import json
import os
from datetime import datetime

def run_cmd(cmd, encoding='utf-8'):
    r = subprocess.run(cmd, capture_output=True)
    try: return r.stdout.decode(encoding, errors='replace')
    except: return r.stdout.decode('gbk', errors='replace')

def get_wechat_pids():
    output = run_cmd(['tasklist', '/FO', 'CSV', '/NH'], encoding='gbk')
    pids = set()
    for line in output.split('\n'):
        parts = line.strip().split('","')
        if len(parts) >= 2:
            name = parts[0].strip('"')
            try: pid = int(parts[1].strip('"'))
            except: continue
            if name in ('Weixin.exe', 'WeChatAppEx.exe'):
                pids.add(pid)
    return pids

def get_all_connections():
    output = run_cmd(['netstat', '-ano'], encoding='gbk')
    connections = []
    for line in output.split('\n'):
        line = line.strip()
        if not any(s in line for s in ['ESTABLISHED', 'TIME_WAIT', 'CLOSE_WAIT', 'SYN_SENT', 'LISTENING']):
            continue
        parts = line.split()
        if len(parts) >= 4:
            proto = parts[0]
            local = parts[1]
            foreign = parts[2]
            state = parts[3] if len(parts) > 3 else ''
            try: pid = int(parts[-1])
            except: pid = 0
            if ':' in foreign:
                ip, port = foreign.rsplit(':', 1)
            else:
                ip, port = foreign, ''
            connections.append({
                'proto': proto, 'local': local, 'foreign': foreign,
                'ip': ip, 'port': port, 'state': state, 'pid': pid
            })
    return connections

def get_dns_cache():
    """Get DNS cache via PowerShell."""
    entries = {}
    result = subprocess.run(
        ['powershell', '-Command',
         'Get-DnsClientCache | Select-Object Entry,Data,Type | ConvertTo-Csv -NoTypeInformation'],
        capture_output=True
    )
    try:
        output = result.stdout.decode('utf-8', errors='replace')
        lines = output.strip().split('\n')
        if len(lines) > 1:
            # Parse CSV
            for line in lines[1:]:
                line = line.strip()
                if not line: continue
                # Remove quotes and split
                parts = line.replace('"', '').split(',')
                if len(parts) >= 2:
                    entry = parts[0].strip()
                    data = parts[1].strip()
                    if entry and data:
                        entries[entry] = data
    except:
        pass

    # Also try ipconfig /displaydns
    output = run_cmd(['ipconfig', '/displaydns'], encoding='gbk')
    current_entry = None
    for line in output.split('\n'):
        line = line.strip()
        if '记录名称' in line or 'Record Name' in line:
            if ':' in line:
                current_entry = line.split(':', 1)[1].strip()
        elif ('记录' in line or 'Data' in line or 'Address' in line) and current_entry:
            if ':' in line:
                data = line.split(':', 1)[1].strip()
                if current_entry and data and data != '0':
                    entries[current_entry] = data

    return entries

def resolve_ip(ip):
    if ip in ('127.0.0.1', '0.0.0.0', '::1', 'localhost'):
        return 'localhost'
    try:
        parts = ip.split('.')
        if len(parts) == 4:
            first = int(parts[0])
            if first == 10 or (first == 172 and 16 <= int(parts[1]) <= 31) or (first == 192 and int(parts[1]) == 168):
                return f'internal({ip})'
    except: pass
    try:
        hostname = socket.gethostbyaddr(ip)
        return hostname[0]
    except:
        return ip

# Load baseline
baseline_file = r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\scripts\baseline.txt'
baseline = set()
if os.path.exists(baseline_file):
    with open(baseline_file) as f:
        baseline = set(line.strip() for line in f if line.strip())

print(f"Baseline: {len(baseline)} connections")

# Get current state
wechat_pids = get_wechat_pids()
all_conns = get_all_connections()
wechat_conns = [c for c in all_conns if c['pid'] in wechat_pids]

# Find new connections
new_conns = [c for c in wechat_conns if c['foreign'] not in baseline]
all_wechat_ips = {c['foreign'] for c in wechat_conns}

print(f"\nWeChat processes: {len(wechat_pids)}")
print(f"Current WeChat connections: {len(wechat_conns)}")
print(f"New connections: {len(new_conns)}")

# Show all WeChat connections with hostname resolution
print(f"\n{'='*80}")
print("ALL WeChat connections (with hostname resolution):")
print(f"{'='*80}")

seen_ips = {}
for c in wechat_conns:
    ip = c['ip']
    if ip not in seen_ips:
        seen_ips[ip] = []
    seen_ips[ip].append(c)

for ip, conns in sorted(seen_ips.items()):
    hostname = resolve_ip(ip)
    is_new = ip not in {b.rsplit(':', 1)[0] for b in baseline}
    marker = " *** NEW ***" if is_new else ""
    ports = sorted(set(c['port'] for c in conns))
    states = sorted(set(c['state'] for c in conns))
    print(f"\n  IP: {ip}{marker}")
    print(f"  Hostname: {hostname}")
    print(f"  Ports: {', '.join(ports)}")
    print(f"  States: {', '.join(states)}")
    print(f"  Connections: {len(conns)}")

# Get DNS cache
print(f"\n{'='*80}")
print("DNS Cache Entries:")
print(f"{'='*80}")

dns_entries = get_dns_cache()
print(f"Total DNS entries: {len(dns_entries)}")

# Filter out common non-interesting domains
skip = ['weixin.qq.com', 'wx.qq.com', 'tencent.com', 'qq.com',
        'microsoft.com', 'windows.com', 'msftncsi.com',
        'dns.google', 'cloudflare.com', 'akamai.com',
        'edgekey.net', 'edgesuite.net', 'facebook.com',
        'google.com', 'apple.com', 'amazonaws.com',
        'localhost', 'in-addr.arpa', 'ip6.arpa']

interesting = {}
for entry, data in dns_entries.items():
    if not any(s in entry.lower() for s in skip):
        interesting[entry] = data

print(f"\nInteresting DNS entries: {len(interesting)}")
for entry, data in sorted(interesting.items()):
    print(f"  {entry:50s} -> {data}")

# Highlight piaoxf and film-related entries
piaoxf_dns = {k: v for k, v in dns_entries.items() if 'piaoxf' in k.lower() or 'piaoxf' in str(v).lower()}
film_dns = {k: v for k, v in dns_entries.items()
            if any(s in k.lower() for s in ['film', 'cinema', 'movie', 'ticket', 'jiahe', 'jiayi', 'sucai'])}

if piaoxf_dns:
    print(f"\n{'='*80}")
    print("!!! PIAOXF-RELATED DNS ENTRIES !!!")
    print(f"{'='*80}")
    for entry, data in piaoxf_dns.items():
        print(f"  {entry} -> {data}")

if film_dns:
    print(f"\n{'='*80}")
    print("!!! FILM/CINEMA-RELATED DNS ENTRIES !!!")
    print(f"{'='*80}")
    for entry, data in film_dns.items():
        print(f"  {entry} -> {data}")

# Save results
results = {
    'timestamp': datetime.now().isoformat(),
    'baseline_count': len(baseline),
    'current_wechat_connections': len(wechat_conns),
    'new_connections': [{'ip': c['ip'], 'port': c['port'], 'state': c['state'], 'pid': c['pid']} for c in new_conns],
    'all_wechat_ips': [{'ip': ip, 'hostname': resolve_ip(ip), 'ports': sorted(set(c['port'] for c in conns))}
                       for ip, conns in seen_ips.items()],
    'dns_entries': dns_entries,
    'interesting_dns': interesting
}

output_file = r'D:\巴蒂哥\2026-08-03-21-45-13\movie-ticket-desktop\captured_api\network_capture.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(f"\nResults saved to: {output_file}")
