"""
分析抓包数据 - 大埔嘉逸影联
功能：
1. 读取 captured_api 目录下的所有抓包数据
2. 按域名/路径聚类
3. 提取 API 端点
4. 识别认证方式
5. 生成 api-spec.json
6. 输出人类可读的分析报告

使用方法：
  python analyze.py
"""

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from urllib.parse import urlparse, parse_qs

CAPTURE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "captured_api")
OUTPUT_SPEC = os.path.join(CAPTURE_DIR, "api-spec.json")
OUTPUT_REPORT = os.path.join(CAPTURE_DIR, "analysis-report.txt")


def load_captures():
    """加载所有抓包数据"""
    captures = []

    if not os.path.exists(CAPTURE_DIR):
        print(f"错误：抓包目录不存在 {CAPTURE_DIR}")
        return captures

    for domain_dir in os.listdir(CAPTURE_DIR):
        domain_path = os.path.join(CAPTURE_DIR, domain_dir)
        if not os.path.isdir(domain_path) or domain_dir.startswith("_"):
            continue

        for filename in os.listdir(domain_path):
            if not filename.endswith(".json"):
                continue

            filepath = os.path.join(domain_path, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)

                # 解析文件名获取方向和请求信息
                # 格式: timestamp_direction_method_pathhash.json
                parts = filename.replace(".json", "").split("_")
                if len(parts) >= 4:
                    direction = parts[1]
                    method = parts[2]
                else:
                    direction = "unknown"
                    method = "unknown"

                captures.append({
                    "direction": direction,
                    "method": method,
                    "data": data,
                    "file": filename,
                    "domain": domain_dir,
                })
            except (json.JSONDecodeError, Exception) as e:
                print(f"  跳过文件 {filename}: {e}")

    return captures


def pair_requests_responses(captures):
    """将请求和响应配对"""
    pairs = defaultdict(dict)

    for cap in captures:
        url = cap["data"].get("url", "")
        if not url:
            continue

        # 用 URL + 方法作为配对 key
        method = cap["data"].get("method", cap["method"])
        key = f"{method} {url}"

        if cap["direction"] == "request":
            if "request" not in pairs[key]:
                pairs[key]["request"] = cap["data"]
                pairs[key]["method"] = method
                pairs[key]["url"] = url
        elif cap["direction"] == "response":
            pairs[key]["response"] = cap["data"]
            if "request" not in pairs[key]:
                pairs[key]["url"] = url
                pairs[key]["method"] = method

    return {k: v for k, v in pairs.items() if "request" in v or "response" in v}


def extract_api_endpoints(pairs):
    """提取 API 端点"""
    endpoints = []

    for key, pair in pairs.items():
        req = pair.get("request", {})
        resp = pair.get("response", {})

        url = pair.get("url", "")
        parsed = urlparse(url)
        path = parsed.path
        method = pair.get("method", "GET")

        # 参数化路径（把数字/UUID 替换为占位符）
        path_template = re.sub(r"/\d+", "/{id}", path)
        path_template = re.sub(r"/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}", "/{uuid}", path_template)

        # 解析请求体
        req_body = None
        if req.get("body"):
            try:
                req_body = json.loads(req["body"])
            except (json.JSONDecodeError, TypeError):
                req_body = req["body"][:500] if isinstance(req["body"], str) else None

        # 解析响应体
        resp_body = None
        if resp.get("body"):
            try:
                resp_body = json.loads(resp["body"])
            except (json.JSONDecodeError, TypeError):
                resp_body = resp["body"][:500] if isinstance(resp["body"], str) else None

        # 提取查询参数
        query_params = req.get("query_params", {})
        if not query_params and parsed.query:
            query_params = {k: v[0] if len(v) == 1 else v for k, v in parse_qs(parsed.query).items()}

        # 分类
        category = categorize_endpoint(parsed.netloc, path, req.get("headers", {}))

        # 提取 token 信息
        auth_info = extract_auth(req.get("headers", {}), query_params)

        endpoint = {
            "method": method,
            "url": url,
            "host": parsed.netloc,
            "path": path,
            "path_template": path_template,
            "query_params": query_params,
            "request_headers": {k: v for k, v in req.get("headers", {}).items()
                                if k.lower() not in ["cookie", "set-cookie"]},
            "request_body": req_body,
            "response_status": resp.get("status_code"),
            "response_body_preview": json.dumps(resp_body, ensure_ascii=False)[:500] if resp_body else None,
            "category": category,
            "auth": auth_info,
        }

        endpoints.append(endpoint)

    return endpoints


def categorize_endpoint(host, path, headers):
    """对端点进行分类"""
    path_lower = path.lower()
    combined = f"{host} {path_lower}".lower()

    if any(k in combined for k in ["login", "auth", "token", "session"]):
        return "auth"
    if any(k in combined for k in ["cinema", "theater", "影"]):
        return "cinema"
    if any(k in combined for k in ["movie", "film", "影片", "电影"]):
        return "movie"
    if any(k in combined for k in ["schedule", "session", "plan", "排期", "场次"]):
        return "session"
    if any(k in combined for k in ["seat", "座"]):
        return "seat"
    if any(k in combined for k in ["order", "订单", "下单"]):
        return "order"
    if any(k in combined for k in ["pay", "支付", "余额", "balance"]):
        return "payment"
    if any(k in combined for k in ["member", "user", "info", "会员", "个人"]):
        return "member"
    if any(k in combined for k in ["mall", "shop", "商城", "商品", "exchange", "兑换"]):
        return "mall"
    if any(k in combined for k in ["point", "积分"]):
        return "points"
    return "other"


def extract_auth(headers, query_params):
    """提取认证信息"""
    auth = {}

    # 检查 headers
    for key, value in headers.items():
        key_lower = key.lower()
        if key_lower == "authorization":
            auth["type"] = "header"
            auth["key"] = key
            auth["value_prefix"] = value[:30]
            auth["format"] = "Bearer" if value.startswith("Bearer ") else "raw"
        elif any(t in key_lower for t in ["x-token", "x-auth", "token", "session"]):
            auth["type"] = "header"
            auth["key"] = key
            auth["value_prefix"] = value[:30]

    # 检查 query params
    for key, value in query_params.items():
        key_lower = key.lower()
        if any(t in key_lower for t in ["token", "auth", "session", "sign"]):
            if not auth:
                auth["type"] = "query"
                auth["key"] = key
                auth["value_prefix"] = str(value)[:30]

    # 检查 Cookie
    cookie = headers.get("Cookie") or headers.get("cookie")
    if cookie and not auth:
        auth["type"] = "cookie"
        auth["key"] = "Cookie"
        auth["value_prefix"] = cookie[:50]

    return auth if auth else None


def generate_api_spec(endpoints):
    """生成 API 规格文件"""
    # 按 host 聚合
    hosts = set()
    auth_info = None

    for ep in endpoints:
        hosts.add(ep["host"])
        if ep["auth"] and not auth_info:
            auth_info = ep["auth"]

    # 去重端点（按 path_template + method）
    seen = set()
    unique_endpoints = []
    for ep in endpoints:
        key = f"{ep['method']} {ep['path_template']}"
        if key not in seen:
            seen.add(key)
            unique_endpoints.append(ep)

    spec = {
        "version": "0.1.0",
        "generated_at": datetime.now().isoformat(),
        "base_urls": [f"https://{h}" for h in sorted(hosts)],
        "auth": auth_info or {"type": "unknown"},
        "endpoints": unique_endpoints,
        "summary": {
            "total_endpoints": len(unique_endpoints),
            "by_category": defaultdict(list),
        },
    }

    for ep in unique_endpoints:
        spec["summary"]["by_category"][ep["category"]].append(
            f"{ep['method']} {ep['path_template']}"
        )

    # Convert defaultdict to regular dict
    spec["summary"]["by_category"] = dict(spec["summary"]["by_category"])

    return spec


def generate_report(endpoints, spec):
    """生成人类可读的分析报告"""
    lines = []
    lines.append("=" * 70)
    lines.append("  大埔嘉逸影联 - 抓包分析报告")
    lines.append(f"  生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 70)
    lines.append("")

    # 概览
    lines.append("【概览】")
    lines.append(f"  总请求数: {len(endpoints)}")
    lines.append(f"  去重端点数: {len(spec['endpoints'])}")
    lines.append(f"  后端域名: {', '.join(spec['base_urls'])}")
    lines.append("")

    # 认证信息
    lines.append("【认证方式】")
    auth = spec.get("auth", {})
    if auth.get("type") == "header":
        lines.append(f"  类型: Header 认证")
        lines.append(f"  Header Key: {auth.get('key')}")
        lines.append(f"  格式: {auth.get('format', 'raw')}")
        lines.append(f"  Token 示例: {auth.get('value_prefix', 'N/A')}...")
    elif auth.get("type") == "query":
        lines.append(f"  类型: Query 参数认证")
        lines.append(f"  参数名: {auth.get('key')}")
    elif auth.get("type") == "cookie":
        lines.append(f"  类型: Cookie 认证")
    else:
        lines.append(f"  类型: 未知")
        lines.append(f"  原始数据: {json.dumps(auth, ensure_ascii=False)}")
    lines.append("")

    # 按分类列出端点
    lines.append("【API 端点列表（按分类）】")
    by_category = defaultdict(list)
    for ep in spec["endpoints"]:
        by_category[ep["category"]].append(ep)

    category_names = {
        "auth": "认证相关",
        "cinema": "影院相关",
        "movie": "影片相关",
        "session": "场次排期",
        "seat": "座位相关",
        "order": "订单相关",
        "payment": "支付相关",
        "member": "会员相关",
        "mall": "积分商城",
        "points": "积分相关",
        "other": "其他",
    }

    for category in ["auth", "cinema", "movie", "session", "seat", "order", "payment", "member", "mall", "points", "other"]:
        if category not in by_category:
            continue
        lines.append(f"\n  --- {category_names.get(category, category)} ({len(by_category[category])}个) ---")
        for ep in by_category[category]:
            status = f" [{ep['response_status']}]" if ep.get("response_status") else ""
            lines.append(f"    {ep['method']:6s} {ep['path_template']}{status}")

            # 显示请求体关键字段
            if ep.get("request_body") and isinstance(ep["request_body"], dict):
                keys = list(ep["request_body"].keys())[:5]
                if keys:
                    lines.append(f"           请求参数: {', '.join(keys)}")

            # 显示响应体关键字段
            if ep.get("response_body_preview"):
                try:
                    resp = json.loads(ep["response_body_preview"])
                    if isinstance(resp, dict):
                        keys = list(resp.keys())[:5]
                        if keys:
                            lines.append(f"           响应字段: {', '.join(keys)}")
                except (json.JSONDecodeError, TypeError):
                    pass

    lines.append("")
    lines.append("=" * 70)
    lines.append(f"  API 规格文件: {OUTPUT_SPEC}")
    lines.append(f"  分析报告文件: {OUTPUT_REPORT}")
    lines.append("=" * 70)

    return "\n".join(lines)


def main():
    print("正在加载抓包数据...")
    captures = load_captures()

    if not captures:
        print("未找到抓包数据！请先运行 start-capture.bat 进行抓包。")
        return

    print(f"找到 {len(captures)} 条记录")

    print("正在配对请求和响应...")
    pairs = pair_requests_responses(captures)
    print(f"配对得到 {len(pairs)} 个请求")

    print("正在提取 API 端点...")
    endpoints = extract_api_endpoints(pairs)
    print(f"提取到 {len(endpoints)} 个端点")

    print("正在生成 API 规格文件...")
    spec = generate_api_spec(endpoints)

    with open(OUTPUT_SPEC, "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
    print(f"  -> {OUTPUT_SPEC}")

    print("正在生成分析报告...")
    report = generate_report(endpoints, spec)

    with open(OUTPUT_REPORT, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"  -> {OUTPUT_REPORT}")

    print()
    print(report)


if __name__ == "__main__":
    main()
