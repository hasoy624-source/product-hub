"""Public product-review crawler. No logins, checkout or private review APIs."""
from datetime import date, datetime, timezone
from html import unescape
from html.parser import HTMLParser
import hashlib
import ipaddress
import json
import re
import socket
import time
from uuid import uuid4
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

AGENT = 'ProductHubReviewMonitor/1.0'
MAX_BYTES = 4 * 1024 * 1024


def normalize_url(value):
    parsed = urlsplit(str(value).strip().rstrip('，,。'))
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('请输入不含凭据的 HTTPS 公开商品或集合地址')
    host = parsed.hostname.lower().rstrip('.')
    if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
        raise ValueError('采集地址必须为公开站点')
    try: address = ipaddress.ip_address(host)
    except ValueError: address = None
    if address is not None:
        raise ValueError('请填写公开站点域名，而不是 IP 地址')
    query = parse_qs(parsed.query)
    page = query.get('page', [''])[0]
    if page and (not page.isdigit() or not 1 <= int(page) <= 100):
        raise ValueError('页码应为 1 到 100')
    return urlunsplit(('https', host, parsed.path or '/', urlencode({'page': page}) if page else '', ''))


def validate_public_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('无效的公开 HTTPS 请求地址')
    addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('请求地址解析到非公开网络')


class CrawlError(Exception):
    def __init__(self, message, status='failed', retry_after=0):
        super().__init__(message)
        self.status, self.retry_after = status, retry_after


class PublicRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_url(newurl)
        if urlsplit(req.full_url).hostname != urlsplit(newurl).hostname:
            raise CrawlError('站点跳转到其他域名，需要单独配置来源')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class PublicClient:
    def __init__(self, delay=2.0):
        self.delay, self.last, self.robots = delay, {}, {}
        self.opener = build_opener(PublicRedirects())

    def get(self, url, headers=None, robots=True):
        validate_public_url(url)
        host = urlsplit(url).netloc
        if robots and host not in self.robots:
            robots_url = f'https://{host}/robots.txt'
            try:
                raw = self.get(robots_url, robots=False)
            except CrawlError as error:
                if error.status == 'not_found': raw = ''
                else: raise
            parser = RobotFileParser(robots_url)
            parser.parse(raw.splitlines())
            self.robots[host] = parser
        if robots and not self.robots[host].can_fetch(AGENT, url):
            raise CrawlError('来源 robots.txt 未开放此路径', 'robots_blocked')
        crawl_delay = self.robots.get(host).crawl_delay(AGENT) if host in self.robots else None
        delay = max(self.delay, crawl_delay or 0)
        time.sleep(max(0, delay - (time.monotonic() - self.last.get(host, 0))))
        self.last[host] = time.monotonic()
        try:
            with self.opener.open(Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html,application/json', **(headers or {})}), timeout=25) as response:
                data = response.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES: raise CrawlError('响应超过 4 MB 采集上限')
                return data.decode('utf-8', errors='replace')
        except HTTPError as error:
            if error.code == 429:
                value = error.headers.get('Retry-After', '60')
                retry = int(value) if value.isdigit() else 60
                raise CrawlError(f'HTTP 429，等待重试（至少 {retry} 秒）', 'rate_limited', retry)
            raise CrawlError(f'HTTP {error.code}', 'not_found' if error.code == 404 else 'failed')
        except (TimeoutError, OSError) as error:
            raise CrawlError('网络请求失败：' + type(error).__name__)


class Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []
    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node): yield from child.walk()
    def has(self, name): return name in self.attrs.get('class', '').split()
    def text(self):
        if self.tag in ['script', 'style']: return ''
        return ''.join(child.text() if isinstance(child, Node) else child for child in self.children)
    def raw(self): return ''.join(child for child in self.children if isinstance(child, str))


class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node(); self.stack = [self.root]
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs); self.stack[-1].children.append(node)
        if tag not in ['img', 'br', 'input', 'meta', 'link', 'hr', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track']:
            self.stack.append(node)
        elif tag == 'br': self.stack[-1].children.append('\n')
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack[-1].tag == tag: self.stack.pop()
    def handle_endtag(self, tag):
        for index in range(len(self.stack)-1, 0, -1):
            if self.stack[index].tag == tag:
                if tag in ['p', 'div', 'li']: self.stack[index].children.append('\n')
                self.stack = self.stack[:index]; return
    def handle_data(self, data): self.stack[-1].children.append(data)


def clean_text(value):
    text = Tree(str(value or '')).root.text() if '<' in str(value or '') else str(value or '')
    return re.sub(r'[ \t]+', ' ', unescape(text)).strip()[:20000]


def review_date(value):
    value = str(value or '')
    match = re.match(r'(\d{4}-\d{2}-\d{2})', value)
    if match:
        try: return date.fromisoformat(match[1]).isoformat()
        except ValueError: return ''
    return ''


def json_objects(root):
    for node in root.walk():
        if node.tag == 'script' and node.attrs.get('type') in ('application/ld+json', 'application/json'):
            try: yield json.loads(node.raw())
            except (ValueError, TypeError): pass


def collection_links(html, url):
    root = Tree(html).root; products = {}; pages = set()
    parsed = urlsplit(url); origin = 'https://' + parsed.netloc
    for node in root.walk():
        if node.tag != 'a': continue
        target = urlsplit(urljoin(url, node.attrs.get('href', '')))
        if target.netloc != parsed.netloc: continue
        if '/products/' in target.path:
            # Collection-scoped links prevent promo/recommendation products leaking in.
            if parsed.path.startswith('/collections/') and not target.path.startswith(parsed.path.rstrip('/') + '/products/'):
                continue
            handle = target.path.split('/products/')[-1].split('/')[0]
            if handle:
                canonical = origin + '/products/' + handle
                name = clean_text(node.text())
                products.setdefault(canonical, {'url': canonical, 'title': name or handle})
        elif target.path == parsed.path and parse_qs(target.query).get('page'):
            pages.add(normalize_url(urlunsplit(target)))
    return list(products.values()), sorted(pages)


def normalize_review(row, source, product, observed_at):
    value = row.get('rating')
    if value is None:
        structured = row.get('reviewRating') or {}
        value = structured.get('ratingValue',0) if isinstance(structured,dict) else 0
    try: rating = float(value)
    except (TypeError, ValueError, AttributeError): return None
    if not 1 <= rating <= 5: return None
    if rating.is_integer(): rating = int(rating)
    content = clean_text(row.get('body') or row.get('content') or row.get('reviewBody'))
    title = clean_text(row.get('title') or row.get('name'))[:200]
    if not content and not title: return None
    published = str(row.get('created_at') or row.get('published_at') or row.get('datePublished') or row.get('date') or '')
    remote_id = str(row.get('uuid') or row.get('id') or '')
    identity = remote_id or json.dumps([title, content, rating, published], ensure_ascii=False)
    identifier = hashlib.sha256((source['id']+'|'+product['url']+'|'+identity).encode()).hexdigest()[:32]
    keywords = {'续航': r'battery|charge|charging', '漏液': r'leak', '加热': r'heat|hot|burn', '清洁': r'clean', '质量': r'broken|broke|quality|durable', '物流': r'ship|deliver', '适配': r'fit|compatible'}
    tags = [tag for tag, pattern in keywords.items() if re.search(pattern, title+' '+content, re.I)]
    return {'id': 'review-'+identifier, 'source_id': source['id'], 'product_title': product['title'], 'product_url': product['url'], 'remote_id': remote_id, 'title': title, 'content': content, 'rating': rating, 'sentiment': '正向' if rating >= 4 else '负向' if rating <= 2 else '中性', 'published_on': review_date(published), 'published_raw': published[:100], 'verified_purchase': bool(row.get('verified_buyer') or row.get('verified_purchase') or row.get('verified')), 'tags': tags, 'source_url': product['url']+'#judgeme_product_reviews', 'first_seen_at': observed_at, 'last_seen_at': observed_at}


def parse_reviews(html):
    root = Tree(html).root; rows = []
    for node in root.walk():
        if not node.has('jdgm-rev'): continue
        def text_of(cls): return next((clean_text(item.text()) for item in node.walk() if item.has(cls)), '')
        rating = next((item.attrs.get('data-score') for item in node.walk() if item.has('jdgm-rev__rating')), '')
        published = next((item.attrs.get('data-content') or item.attrs.get('datetime') or item.text() for item in node.walk() if item.has('jdgm-rev__timestamp') or item.tag == 'time'), '')
        rows.append({'id': node.attrs.get('data-review-id') or node.attrs.get('data-review-uuid', ''), 'title': text_of('jdgm-rev__title'), 'body': text_of('jdgm-rev__body'), 'rating': rating, 'date': published, 'verified': any(item.has('jdgm-rev__buyer-badge') for item in node.walk())})
    def visit(value):
        if isinstance(value, dict):
            if value.get('@type') == 'Review' or ('rating' in value and ('body' in value or 'content' in value)):
                rows.append(value)
            for child in value.values(): visit(child)
        elif isinstance(value, list):
            for child in value: visit(child)
    for value in json_objects(root): visit(value)
    return rows


def widget_settings(html):
    def field(name):
        found = re.search(r'jdgm\.'+name+r'\s*=\s*[\'"]([^\'"]+)', html)
        return found[1] if found else ''
    shop = field('SHOP_DOMAIN')
    if not shop:
        found = re.search(r'Shopify\.shop\s*=\s*[\'"]([^\'"]+)', html)
        shop = found[1] if found else ''
    return shop, field('PUBLIC_TOKEN'), field('API_HOST') or 'https://api.judge.me'


def crawl_source(source, client=None, observed_at=None):
    client = client or PublicClient()
    observed_at = observed_at or datetime.now(timezone.utc).isoformat(timespec='seconds')
    entry = normalize_url(source['collection_url'])
    queue = [entry]; visited = set(); products = {}; reviews = {}; errors = []; truncated = False
    max_products = min(100, int(source.get('max_products', 80)))
    max_pages = min(10, int(source.get('max_collection_pages', 5)))
    max_review_pages = min(20, int(source.get('max_review_pages', 10)))
    run = {'id': 'run-'+uuid4().hex, 'source_id': source['id'], 'started_at': observed_at, 'finished_at': '', 'status': 'running', 'products_found': 0, 'products_scanned': 0, 'reviews_found': 0, 'new_reviews': 0, 'message': '', 'retry_after': 0}
    try:
        if '/products/' in urlsplit(entry).path:
            products[entry] = {'url': entry, 'title': entry.rsplit('/',1)[-1]}
            queue = []
        while queue and len(visited) < max_pages:
            url = queue.pop(0)
            if url in visited: continue
            html = client.get(url); visited.add(url)
            found, pages = collection_links(html, url)
            for product in found: products.setdefault(product['url'], product)
            queue.extend(page for page in pages if page not in visited and page not in queue)
        truncated = bool(queue) or len(products) > max_products
        if not products: raise CrawlError('未识别到商品链接，需检查站点页面结构', 'needs_adapter')
        run['products_found'] = len(products)
        for product in list(products.values())[:max_products]:
            try:
                html = client.get(product['url']); root = Tree(html).root
                for value in json_objects(root):
                    candidates = value if isinstance(value,list) else [value]
                    for candidate in candidates:
                        if isinstance(candidate,dict) and candidate.get('@type') == 'Product': product['title'] = clean_text(candidate.get('name')) or product['title']
                widget = next((n for n in root.walk() if n.attrs.get('id') == 'judgeme_product_reviews' or n.has('jdgm-review-widget')), None)
                rows = parse_reviews(html)
                shop, token, api_host = widget_settings(html)
                product_id = widget.attrs.get('data-id', '') if widget else ''
                empty_widget = bool(widget and (widget.attrs.get('data-empty-state') == 'empty_widget' or 'Be the first to write a review' in widget.text()))
                provider_available = bool(rows) or empty_widget
                if widget and product_id and shop and not empty_widget:
                    previous_batch = None
                    for page in range(1, max_review_pages + 1):
                        if token:
                            params = {'shop_domain':shop, 'external_id':product_id, 'page':page, 'per_page':100, 'json_request':'true'}
                            payload = json.loads(client.get('https://api.judge.me/api/v1/widgets/product_review?'+urlencode(params), {'X-Api-Token':token}))
                        else:
                            if urlsplit(api_host).hostname not in ('api.judge.me','judge.me'): raise CrawlError('未识别的评价接口域名','needs_adapter')
                            params = {'shop_domain':shop,'platform':'shopify','product_id':product_id,'page':page,'per_page':100}
                            payload = json.loads(client.get(api_host.rstrip('/')+'/reviews/reviews_for_widget?'+urlencode(params)))
                        if isinstance(payload,dict) and isinstance(payload.get('reviews'),list): batch = payload['reviews']
                        elif isinstance(payload,dict) and isinstance(payload.get('widget'),str): batch = parse_reviews(payload['widget'])
                        else: raise CrawlError('评价接口返回格式发生变化','needs_adapter')
                        signature=json.dumps(batch,sort_keys=True,ensure_ascii=False)
                        if batch and signature==previous_batch:
                            truncated=True;break
                        previous_batch=signature
                        provider_available = True; rows.extend(batch)
                        has_next = isinstance(payload.get('widget'),str) and 'jdgm-paginate__next-page' in payload['widget']
                        total_pages = payload.get('total_pages') or (payload.get('pagination') or {}).get('total_pages')
                        if not batch or total_pages and page>=int(total_pages) or len(batch)<100 and not has_next and not total_pages: break
                        if page == max_review_pages: truncated = True
                if not provider_available:
                    # A page with no review integration is not evidence of zero reviews.
                    raise CrawlError('评价组件未匹配，需要配置站点适配器','needs_adapter')
                for row in rows:
                    normalized = normalize_review(row,source,product,observed_at)
                    if normalized:
                        duplicate = next((r for r in reviews.values() if r['product_url']==normalized['product_url'] and r['rating']==normalized['rating'] and r['content']==normalized['content'] and r['title']==normalized['title'] and (not r['published_on'] or not normalized['published_on'] or r['published_on']==normalized['published_on']) and (not r['remote_id'] or not normalized['remote_id'])),None)
                        if duplicate:
                            if not duplicate['published_on'] and normalized['published_on']:duplicate['published_on']=normalized['published_on']
                        else:reviews[normalized['id']] = normalized
                product['status']='success'; product['review_count']=len({r['id'] for r in reviews.values() if r['product_url']==product['url']})
                run['products_scanned'] += 1
            except CrawlError as error:
                product['status']=error.status; product['message']=str(error); errors.append(str(error))
                if error.status == 'rate_limited': raise
        run['status'] = 'partial' if errors or truncated else 'success'
        run['message'] = '达到采集上限，已保留本批结果' if truncated else '；'.join(dict.fromkeys(errors))[:500] if errors else '采集完成'
    except CrawlError as error:
        run.update(status=error.status,message=str(error),retry_after=error.retry_after)
    except (ValueError, TypeError, KeyError) as error:
        run.update(status='failed',message='解析失败：'+type(error).__name__)
    run['finished_at']=datetime.now(timezone.utc).isoformat(timespec='seconds')
    run['reviews_found']=len(reviews)
    return {'reviews':list(reviews.values()),'products':list(products.values()),'run':run}
