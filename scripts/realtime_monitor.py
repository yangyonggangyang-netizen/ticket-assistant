"""
Real-time network monitor for capturing mini-program API calls.

Usage:
1. Run this script
2. When prompted, open the mini-program in WeChat
3. Navigate to the phone login page (pagesC/login/ph-login)
4. Try to send an SMS verification code
5. The script will capture all new connections and DNS entries

This script does NOT set a system proxy, so WeChat will work normally.
"""
import subprocess
import socket
import time
import os
import re
import json
from datetime import datetime

def run_cmd(cmd, encoding='utf-8'):
    """Run command and return output."""
    result = subprocess.run(cmd, capture_output=True)
    try:
        return result.stdout.decode(encoding, errors='replace')
    except:
        return result.stdout.decode('gbk', errors='replace')

def get_wechat_pids():
    """Get PIDs of WeChat processes."""
    output = run_cmd(['tasklist', '/FO', 'CSV', '/NH'], encoding='gbk')
    pids = set()
    for line in output.split('\n'):
        line = line.strip()
        if not line:
            continue
        parts = line.split('","')
        if len(parts) >= 2:
            name = parts[0].strip('"')
            try:
                pid = int(parts[1].strip('"'))
            except:
                continue
            if name in ('Weixin.exe', 'WeChatAppEx.exe'):
                pids.add(pid)
    return pids

def get_connections():
    """Get all ESTABLISHED connections."""
    output = run_cmd(['netstat', '-ano'], encoding='gbk')
    connections = []
    for line in output.split('\n'):
        line = line.strip()
        if 'ESTABLISHED' not in line and 'SYN_SENT' not in line:
            continue
        parts = line.split()
        if len(parts) >= 4:
            foreign = parts[2]
            pid = 0
            try:
                pid = int(parts[-1])
            except:
                pass
            if ':' in foreign:
                ip, port = foreign.rsplit(':', 1)
            else:
                ip, port = foreign, ''
            connections.append({
                'ip': ip,
                'port': port,
                'pid': pid,
                'state': parts[3] if len(parts) > 3 else ''
            })
    return connections

def get_dns_cache():
    """Get DNS resolver cache entries."""
    entries = {}
    # Try PowerShell first
    result = subprocess.run(
        ['powershell', '-Command', 'Get-DnsClientCache | Select-Object Entry,Data | ConvertTo-Csv -NoTypeInformation'],
        capture_output=True
    )
    try:
        output = result.stdout.decode('utf-8', errors='replace')
        for line in output.strip().split('\n')[1:]:  # Skip header
            line = line.strip().strip('"')
            if '","' in line:
                parts = line.split('","')
                if len(parts) >= 2:
                    entry = parts[0].strip('"')
                    data = parts[1].strip('"')
                    entries[entry] = data
    except:
        pass

    # Also try ipconfig /displaydns
    output = run_cmd(['ipconfig', '/displaydns'], encoding='gbk')
    current_entry = None
    for line in output.split('\n'):
        line = line.strip()
        if line.startswith('记录名称:') or line.startswith('Record Name:'):
            current_entry = line.split(':', 1)[1].strip()
        elif (line.startswith('记录:') or line.startswith('Data:')) and current_entry:
            data = line.split(':', 1)[1].strip() if ':' in line else ''
            if current_entry and data:
                entries[current_entry] = data

    return entries

def resolve_ip(ip):
    """Try to resolve IP to hostname."""
    if ip in ('127.0.0.1', '0.0.0.0', '::1', 'localhost'):
        return 'localhost'
    try:
        parts = ip.split('.')
        if len(parts) == 4:
            first = int(parts[0])
            if first == 10 or (first == 172 and 16 <= int(parts[1]) <= 31) or (first == 192 and int(parts[1]) == 168):
                return f'internal({ip})'
    except:
        pass
    try:
        hostname = socket.gethostbyaddr(ip)
        return hostname[0]
    except:
        return ip

def flush_dns():
    """Flush DNS cache."""
    subprocess.run(['ipconfig', '/flushdns'], capture_output=True)

def main():
    print("=" * 80)
    print("  Real-time Network Monitor for WeChat Mini-Program")
    print("  This will capture API calls without breaking WeChat")
    print("=" * 80)

    # Step 1: Flush DNS
    print("\n[1/5] Flushing DNS cache...")
    flush_dns()
    print("  DNS cache flushed.")

    # Step 2: Get baseline connections
    print("\n[2/5] Capturing baseline connections...")
    wechat_pids = get_wechat_pids()
    baseline_conns = get_connections()
    baseline_wechat_conns = {c['ip'] for c in baseline_conns if c['pid'] in wechat_pids}
    print(f"  Found {len(wechat_pids)} WeChat processes")
    print(f"  Found {len(baseline_wechat_conns)} unique WeChat remote IPs")

    # Step 3: Wait for user interaction
    print("\n" + "=" * 80)
    print("  [3/5] NOW PLEASE DO THE FOLLOWING IN WECHAT:")
    print()
    print("  1. Open '大埔嘉逸影联' mini-program")
    print("  2. Navigate to the phone login page")
    print("  3. Enter a phone number")
    print("  4. Click 'Send Verification Code' (发送验证码)")
    print("  5. Come back here and press Enter")
    print()
    print("=" * 80)

    input("\n  Press Enter when you've completed the steps above...")

    # Step 4: Capture new connections
    print("\n[4/5] Capturing new connections...")

    # Take multiple snapshots to catch transient connections
    all_new_ips = set()
    all_new_conns = []

    for i in range(5):
        time.sleep(1)
        current_conns = get_connections()
        current_wechat_conns = [c for c in current_conns if c['pid'] in wechat_pids]

        for c in current_wechat_conns:
            if c['ip'] not in baseline_wechat_conns:
                all_new_ips.add(c['ip'])
                all_new_conns.append(c)

        if i < 4:
            print(f"  Snapshot {i+1}/5: {len(current_wechat_conns)} WeChat connections, {len(all_new_ips)} new IPs so far")

    # Step 5: Get DNS cache
    print("\n[5/5] Checking DNS cache for resolved domains...")
    dns_entries = get_dns_cache()
    print(f"  Found {len(dns_entries)} DNS cache entries")

    # Filter DNS entries - skip common WeChat domains
    skip_domains = ['weixin.qq.com', 'wx.qq.com', 'tencent.com', 'qq.com',
                    'microsoft.com', 'windows.com', 'msftncsi.com',
                    'dns.google', 'cloudflare.com', 'akamai.com',
                    'edgekey.net', 'edgesuite.net', 'facebook.com',
                    'google.com', 'apple.com', 'amazonaws.com']

    interesting_dns = {}
    for entry, data in dns_entries.items():
        if not any(s in entry.lower() for s in skip_domains):
            interesting_dns[entry] = data

    # Print results
    print("\n" + "=" * 80)
    print("  RESULTS")
    print("=" * 80)

    print(f"\n--- New WeChat Connections ({len(all_new_conns)} total) ---")
    for ip in sorted(all_new_ips):
        hostname = resolve_ip(ip)
        # Find which process and port
        conns_for_ip = [c for c in all_new_conns if c['ip'] == ip]
        ports = sorted(set(c['port'] for c in conns_for_ip))
        pids = sorted(set(c['pid'] for c in conns_for_ip))
        print(f"\n  IP: {ip}")
        print(f"  Hostname: {hostname}")
        print(f"  Ports: {', '.join(ports)}")
        print(f"  PIDs: {', '.join(str(p) for p in pids)}")

    print(f"\n--- Interesting DNS Entries ({len(interesting_dns)} total) ---")
    for entry, data in sorted(interesting_dns.items()):
        print(f"  {entry:50s} -> {data}")

    # Highlight piaoxf-related entries
    piaoxf_dns = {k: v for k, v in interesting_dns.items() if 'piaoxf' in k.lower() or 'piaoxf' in v.lower()}
    if piaoxf_dns:
        print(f"\n--- Piaoxf-related DNS entries ---")
        for entry, data in piaoxf_dns.items():
            print(f"  {entry} -> {data}")

    # Highlight any film/cinema related entries
    film_dns = {k: v for k, v in interesting_dns.items()
                if any(s in k.lower() for s in ['film', 'cinema', 'movie', 'ticket', 'jiahe', 'jiayi'])}
    if film_dns:
        print(f"\n--- Film/Cinema related DNS entries ---")
        for entry, data in film_dns.items():
            print(f"  {entry} -> {data}")

    # Save results
    results = {
        'timestamp': datetime.now().isoformat(),
        'new_connections': [{'ip': c['ip'], 'port': c['port'], 'pid': c['pid']}
                           for c in all_new_conns],
        'dns_entries': interesting_dns,
        'all_dns_entries': dns_entries
    }

    output_file = os.path.join(os.path.dirname(__file__), '..', 'captured_api', 'network_capture.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n  Results saved to: {output_file}")

if __name__ == '__main__':
    main()
