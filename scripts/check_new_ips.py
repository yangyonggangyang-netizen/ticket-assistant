"""Check what servers are running on the new IPs."""
import ssl
import socket
import subprocess

ips = [
    ('47.94.174.180', 443, 'Alibaba Cloud - NEW after mini-program interaction'),
    ('124.220.120.234', 443, 'Tencent Cloud - in baseline'),
]

# Also try to resolve via nslookup
print("=" * 80)
print("1. Reverse DNS lookup")
print("=" * 80)
for ip, port, desc in ips:
    result = subprocess.run(['nslookup', ip], capture_output=True, text=True, errors='replace')
    print(f"\n  {ip} ({desc})")
    print(f"  {result.stdout.strip()}")

# Check SSL certificates with proper SNI
print(f"\n{'='*80}")
print("2. SSL Certificate Check (with various SNI)")
print("=" * 80)

# Try connecting with different SNI hostnames
sni_hosts = [
    'film-api.piaoxf.com',
    'film-yun.piaoxf.com',
    'piaoxf.com',
    'api.piaoxf.com',
    'm.piaoxf.com',
    'mini.piaoxf.com',
    'film.piaoxf.com',
]

for ip, port, desc in ips:
    print(f"\n  IP: {ip}:{port} ({desc})")

    # First try without SNI
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        sock = socket.create_connection((ip, port), timeout=5)
        ssock = ctx.wrap_socket(sock)
        cert = ssock.getpeercert()
        subject = dict(x[0] for x in cert.get('subject', []))
        san = cert.get('subjectAltName', [])
        print(f"    No SNI - Subject: {subject}")
        if san:
            print(f"    SAN: {san[:5]}")
        ssock.close()
    except Exception as e:
        print(f"    No SNI - Error: {e}")

    # Try with various SNI hostnames
    for hostname in sni_hosts:
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            sock = socket.create_connection((ip, port), timeout=5)
            ssock = ctx.wrap_socket(sock, server_hostname=hostname)
            cert = ssock.getpeercert()
            subject = dict(x[0] for x in cert.get('subject', []))
            san = cert.get('subjectAltName', [])
            if subject or san:
                print(f"    SNI={hostname} - Subject CN: {subject.get('commonName', 'N/A')}")
                dns_names = [v for t, v in san if t == 'DNS']
                if dns_names:
                    print(f"    SAN domains: {dns_names[:5]}")
            ssock.close()
        except Exception as e:
            pass  # Silently skip failed SNI attempts

# HTTP response check
print(f"\n{'='*80}")
print("3. HTTP Response Check")
print("=" * 80)

for ip, port, desc in ips:
    print(f"\n  IP: {ip}:{port} ({desc})")

    # Try HTTPS with curl
    for host in ['', 'film-api.piaoxf.com', 'piaoxf.com']:
        if host:
            url = f'https://{ip}/'
            headers = ['-H', f'Host: {host}']
        else:
            url = f'https://{ip}/'
            headers = []

        result = subprocess.run(
            ['curl', '-s', '-k', '--max-time', '5'] + headers +
            ['-w', '\n---HTTP:%{http_code}---', url],
            capture_output=True, text=True, errors='replace'
        )
        output = result.stdout
        if '---HTTP:' in output:
            parts = output.rsplit('---HTTP:', 1)
            body = parts[0].strip()
            code = parts[1].strip().replace('---', '')
        else:
            body = output.strip()
            code = '?'

        if code and code != '000':
            label = f'Host={host}' if host else 'No Host'
            print(f"    {label}: HTTP {code}")
            if body:
                print(f"    Body: {body[:300]}")

# Also check what curl says with -v
print(f"\n{'='*80}")
print("4. Verbose curl to 47.94.174.180")
print("=" * 80)

result = subprocess.run(
    ['curl', '-s', '-k', '-v', '--max-time', '5', 'https://47.94.174.180/'],
    capture_output=True, text=True, errors='replace'
)
print(f"  stdout: {result.stdout[:500]}")
print(f"  stderr: {result.stderr[:1000]}")

# Also try with Host header
print(f"\n  With Host: film-api.piaoxf.com")
result = subprocess.run(
    ['curl', '-s', '-k', '-v', '--max-time', '5',
     '-H', 'Host: film-api.piaoxf.com',
     'https://47.94.174.180/'],
    capture_output=True, text=True, errors='replace'
)
print(f"  stdout: {result.stdout[:500]}")
print(f"  stderr: {result.stderr[:1000]}")

# Try POST /film/login
print(f"\n  POST /film/login to 47.94.174.180")
result = subprocess.run(
    ['curl', '-s', '-k', '--max-time', '5',
     '-X', 'POST',
     '-H', 'Content-Type: application/json',
     '-H', 'Host: film-api.piaoxf.com',
     '-d', '{}',
     'https://47.94.174.180/film/login'],
    capture_output=True, text=True, errors='replace'
)
print(f"  Response: {result.stdout[:500]}")
