"""
mitmproxy 抓包脚本 - 大埔嘉逸影联
功能：
1. 拦截并记录所有 HTTP/HTTPS 请求和响应
2. 自动识别认证 token
3. 按域名分类保存
4. 生成可读的分析报告

使用方法：
  mitmdump -s mitm_capture.py -p 8080
"""

import json
import os
import re
import time
from datetime import datetime
from urllib.parse import urlparse
from mitmproxy import http, ctx

# 输出目录
CAPTURE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "captured_api")

# 需要关注的域名关键词（抓包时自动发现影院后端域名）
# 先放宽松，抓到后再过滤
INTEREST_KEYWORDS = [
    "cinema", "movie", "film", "ticket", "seat", "order",
    "member", "mall", "point", "balance", "schedule", "session",
    "film", "screen", "hall", "pay",
]

# 排除的域名（微信自身框架请求）
EXCLUDE_DOMAINS = [
    "wx.qq.com",
    "wx.qlogo.cn",
    "mp.weixin.qq.com",
    "res.wx.qq.com",
    "servicewechat.com",
    "wxsnsdy.tc.qq.com",
    "wxsnsdythumb.tc.qq.com",
    "mmbiz.qpic.cn",
    "analytics",
    "google",
    "baidu",
    "talkingdata",
    "umeng",
    "growingio",
    "sensorsdata",
]

# 排除的路径模式
EXCLUDE_PATH_PATTERNS = [
    r"\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|mp4|mp3)$",
    r"/static/",
    r"/assets/",
    r"/__code_cache__/",
    r"/preview/",
]

# 统计信息
stats = {
    "total_requests": 0,
    "captured_requests": 0,
    "excluded": 0,
    "domains_seen": set(),
    "api_domains": set(),
    "tokens_found": [],
    "start_time": None,
}


def request(flow: http.HTTPFlow) -> None:
    """拦截请求"""
    if stats["start_time"] is None:
        stats["start_time"] = time.time()

    stats["total_requests"] += 1

    host = flow.request.pretty_host
    path = flow.request.path
    url = flow.request.url

    stats["domains_seen"].add(host)

    # 排除静态资源和无关域名
    if should_exclude(host, path):
        stats["excluded"] += 1
        return

    stats["captured_requests"] += 1

    # 提取请求信息
    req_data = {
        "method": flow.request.method,
        "url": url,
        "host": host,
        "path": path,
        "headers": dict(flow.request.headers),
        "query_params": dict(flow.request.query) if flow.request.query else {},
        "body": flow.request.get_text(),
        "timestamp": datetime.now().isoformat(),
    }

    # 识别 token
    token_info = extract_token(flow.request.headers, flow.request.query)
    if token_info:
        if token_info not in stats["tokens_found"]:
            stats["tokens_found"].append(token_info)
            ctx.log.info(f"[TOKEN] {token_info['key']}: {token_info['value'][:60]}...")

    # 判断是否是 API 请求
    is_api = is_api_request(host, path, flow.request.headers)
    if is_api:
        stats["api_domains"].add(host)

    # 保存
    save_capture(flow, "request", req_data)

    # 实时日志
    category = "[API]" if is_api else "[DATA]"
    ctx.log.info(f"{category} {flow.request.method} {host}{path[:80]}")


def response(flow: http.HTTPFlow) -> None:
    """拦截响应"""
    host = flow.request.pretty_host
    path = flow.request.path

    if should_exclude(host, path):
        return

    resp_data = {
        "status_code": flow.response.status_code,
        "headers": dict(flow.response.headers),
        "body": flow.response.get_text(),
        "content_length": len(flow.response.content) if flow.response.content else 0,
        "timestamp": datetime.now().isoformat(),
    }

    save_capture(flow, "response", resp_data)

    # 标记重要的响应
    if flow.response.status_code >= 400:
        ctx.log.warn(f"[ERROR] {flow.response.status_code} {host}{path[:60]}")


def should_exclude(host: str, path: str) -> bool:
    """判断是否应该排除这个请求"""
    host_lower = host.lower()

    # 排除无关域名
    for exclude in EXCLUDE_DOMAINS:
        if exclude in host_lower:
            return True

    # 排除静态资源
    for pattern in EXCLUDE_PATH_PATTERNS:
        if re.search(pattern, path, re.IGNORECASE):
            return True

    return False


def is_api_request(host: str, path: str, headers: dict) -> bool:
    """判断是否是 API 请求"""
    # 检查 Content-Type
    content_type = headers.get("content-type", "") or headers.get("Content-Type", "")
    if "json" in content_type.lower():
        return True

    # 检查路径
    path_lower = path.lower()
    api_patterns = [
        "/api/", "/v1/", "/v2/", "/interface/",
        "/cinema/", "/movie/", "/film/", "/seat/",
        "/order/", "/member/", "/mall/", "/point/",
        "/schedule/", "/session/", "/login/", "/user/",
        "/pay/", "/ticket/",
    ]
    for pattern in api_patterns:
        if pattern in path_lower:
            return True

    # 检查关键词
    for keyword in INTEREST_KEYWORDS:
        if keyword in path_lower or keyword in host_lower:
            return True

    return False


def extract_token(headers: dict, query) -> list:
    """从请求头和查询参数中提取 token"""
    tokens = []

    # 检查常见的 token header
    token_keys = [
        "authorization", "token", "x-token", "x-auth", "x-auth-token",
        "access-token", "access_token", "session", "session-id",
        "x-session", "cookie",
    ]

    for key, value in headers.items():
        key_lower = key.lower()
        for tk in token_keys:
            if tk in key_lower:
                tokens.append({
                    "source": "header",
                    "key": key,
                    "value": value,
                })
                break

    # 检查查询参数中的 token
    if query:
        for key, value in query.items():
            key_lower = key.lower()
            for tk in token_keys:
                if tk in key_lower:
                    tokens.append({
                        "source": "query",
                        "key": key,
                        "value": value,
                    })
                    break

    return tokens


def save_capture(flow: http.HTTPFlow, direction: str, data: dict):
    """保存捕获的数据"""
    os.makedirs(CAPTURE_DIR, exist_ok=True)

    host = flow.request.pretty_host
    # 清理 host 中的非法字符
    safe_host = re.sub(r"[^a-zA-Z0-9.-]", "_", host)
    safe_dir = os.path.join(CAPTURE_DIR, safe_host)
    os.makedirs(safe_dir, exist_ok=True)

    # 生成文件名：时间戳_方法_路径hash
    path_hash = abs(hash(flow.request.path)) % 100000
    timestamp = int(time.time() * 1000)
    filename = f"{timestamp}_{direction}_{flow.request.method}_{path_hash}.json"

    filepath = os.path.join(safe_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def done():
    """mitmproxy 关闭时输出统计报告"""
    report = {
        "capture_session": {
            "start_time": datetime.fromtimestamp(stats["start_time"]).isoformat() if stats["start_time"] else None,
            "end_time": datetime.now().isoformat(),
            "duration_seconds": time.time() - stats["start_time"] if stats["start_time"] else 0,
        },
        "statistics": {
            "total_requests": stats["total_requests"],
            "captured_requests": stats["captured_requests"],
            "excluded_requests": stats["excluded"],
            "unique_domains": len(stats["domains_seen"]),
            "api_domains": list(stats["api_domains"]),
            "all_domains": sorted(stats["domains_seen"]),
        },
        "tokens_found": stats["tokens_found"],
    }

    report_path = os.path.join(CAPTURE_DIR, "_capture_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    ctx.log.info("=" * 60)
    ctx.log.info("抓包完成！统计信息：")
    ctx.log.info(f"  总请求数: {stats['total_requests']}")
    ctx.log.info(f"  捕获请求数: {stats['captured_requests']}")
    ctx.log.info(f"  排除请求数: {stats['excluded']}")
    ctx.log.info(f"  独立域名数: {len(stats['domains_seen'])}")
    ctx.log.info(f"  API 域名: {', '.join(stats['api_domains'])}")
    ctx.log.info(f"  发现 Token 数: {len(stats['tokens_found'])}")
    ctx.log.info(f"  报告已保存到: {report_path}")
    ctx.log.info("=" * 60)
