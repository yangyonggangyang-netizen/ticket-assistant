#!/usr/bin/env python3
"""Capture token from yq30 API login response via mitmproxy.

Usage: mitmdump -s capture_token.py <output_file> -p 8888 --set ssl_insecure=true
"""
import sys
import json
import os

output_file = os.path.join(os.path.dirname(__file__), '..', 'captured_token.json')


class TokenCapture:
    def __init__(self, output_file):
        self.output_file = output_file

    def save(self, data):
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def response(self, flow):
        """Intercept HTTP responses."""
        url = flow.request.url

        # Capture /api/member/login response
        if '/api/member/login' in url:
            try:
                body = json.loads(flow.response.text)
                if body.get('success') and body.get('result'):
                    result = body['result']
                    data = {
                        'token': result.get('token', ''),
                        'memberId': str(result.get('id', '')),
                        'phone': result.get('phone', ''),
                        'level': result.get('level', ''),
                        'cinemaId': str(result.get('cinemaId', '')),
                        'loginUrl': url,
                        'done': True,
                    }
                    self.save(data)
                    print(f'[CAPTURED] Token: {data["token"][:30]}...')
                    print(f'[CAPTURED] MemberId: {data["memberId"]}')
                    print(f'[CAPTURED] Phone: {data["phone"]}')
                    print('[DONE] Token captured successfully!')
                else:
                    print(f'[LOGIN_FAIL] {body.get("message", "unknown error")}')
            except Exception as e:
                print(f'[ERROR] Failed to parse login response: {e}')

        # Also log any request to yq30 for debugging
        if 'api.yq30.com' in url or 'piaoxf.com' in url:
            if '/api/member/login' not in url:
                # Only log non-login requests briefly
                pass


addons = [TokenCapture(output_file)]
