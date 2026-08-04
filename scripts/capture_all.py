#!/usr/bin/env python3
"""Capture ALL yq30 API requests (login/captcha/sms etc.) via mitmproxy.

Purpose: find out whether the WeChat mini-program has a hidden
"phone verification code login" endpoint for NEW devices.

Usage: mitmdump -s capture_all.py -p 8888 --set ssl_insecure=true
"""
import json
import os
import time
from datetime import datetime

LOG_FILE = os.path.join(os.path.dirname(__file__), '..', 'captured_all.jsonl')


class CaptureAll:
    def __init__(self, log_file):
        self.log_file = log_file
        self.entries = []
        self.start_time = time.time()

    def _log(self, entry):
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    def request(self, flow):
        url = flow.request.url
        # Focus on the ticket platform domain (yq30 / piaoxf)
        if 'yq30.com' not in url and 'piaoxf.com' not in url:
            return

        entry = {
            'ts': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'method': flow.request.method,
            'url': url,
            'headers': dict(flow.request.headers),
        }
        # Capture request body for POST
        if flow.request.method == 'POST' and flow.request.content:
            try:
                entry['body'] = flow.request.get_text()
            except Exception:
                entry['body'] = '<binary>'

        # Tag verification-code related endpoints
        tags = []
        low = url.lower()
        if any(k in low for k in ['captcha', 'sms', 'verify', 'verif', 'code']):
            tags.append('VERIFY')
        if 'login' in low:
            tags.append('LOGIN')
        if 'register' in low or 'bind' in low:
            tags.append('REGISTER')
        entry['tags'] = tags

        if tags:
            print(f'[REQ {",".join(tags)}] {flow.request.method} {url}')
            if entry.get('body'):
                print(f'    body: {entry["body"][:500]}')

        self._log(entry)

    def response(self, flow):
        url = flow.request.url
        if 'yq30.com' not in url and 'piaoxf.com' not in url:
            return

        entry = {
            'ts': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'method': flow.request.method,
            'url': url,
            'status': flow.response.status_code,
            'resp_headers': dict(flow.response.headers),
        }
        if flow.response.content:
            try:
                entry['resp_body'] = flow.response.get_text()[:3000]
            except Exception:
                entry['resp_body'] = '<binary>'

        low = url.lower()
        if any(k in low for k in ['captcha', 'sms', 'verify', 'verif', 'code', 'login']):
            print(f'[RESP {flow.response.status_code}] {flow.request.method} {url}')
            if entry.get('resp_body'):
                print(f'    body: {entry["resp_body"][:800]}')

        self._log(entry)


addons = [CaptureAll(LOG_FILE)]
