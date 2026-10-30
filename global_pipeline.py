"""Fetch all 44 upstream country/territory entries; publish validated compressed shards."""
import argparse
import asyncio
import csv
import gzip
import hashlib
import io
import json
import logging
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from urllib.parse import urlsplit, parse_qs
from zoneinfo import ZoneInfo
from update_data import FIELDS, read_csv, publish as publish_taiwan

ROOT = Path(__file__).resolve().parent
CRAWLER_COMMIT = 'cc7c982457a1bf8406aeeb8b982df49c6224045b'
CHAR_MAP = dict(pair for pair in '会會 计計 师師 网網 页頁 设設 内內 装裝 顾顧 问問 险險 产產 销銷 业業 电電 脑腦 软軟 开開 发發 务務 财財 税稅 帐帳 记記 账帳 医醫 疗療 养養 护護 营營 运運 输輸 动動 礼禮 摄攝 庆慶 宠寵 银銀 贷貸 资資 询詢 咨諮 厂廠 车車 广廣 络絡 专專 类類 联聯 线線 机機 统統 筑築 纸紙 划劃 经經 劳勞 农農 贸貿 购購 学學 习習 健健 材材 简簡 体體 别別 帮幫 找找'.split())


def normalize(value):
    s = unicodedata.normalize('NFKC', str(value)).lower()
    return ''.join(CHAR_MAP.get(c, c) for c in s if not c.isspace() and unicodedata.category(c)[0] not in 'PS').replace('台', '臺')


def member_key(row):
    u = urlsplit(row['detail_url'])
    key = parse_qs(u.query).get('encryptedMemberId', [''])[0]
    return key.replace('+', '-').replace('/', '_').rstrip('=')


def countries():
    return json.loads((ROOT / 'countries.json').read_text())


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf8')


def compressed(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))


def read_compressed(path):
    return json.loads(gzip.decompress(Path(path).read_bytes()))


def validate(rows, country_id, previous=()):
    if not rows:
        raise ValueError('No public members returned; retain the previous country snapshot')
    if previous and len(rows) < math.ceil(len(previous) * .9):
        raise ValueError('Member count fell by more than 10%')
    seen = set()
    for r in rows:
        if set(r) != set(FIELDS) or any(not isinstance(v, str) for v in r.values()):
            raise ValueError('Unexpected 24-field schema')
        u = urlsplit(r['detail_url'])
        if r['country_id'] != str(country_id) or not r['member_name'].strip() or not member_key(r):
            raise ValueError('Missing member identity or wrong country')
        if u.scheme != 'https' or u.hostname != 'bni.com.tw':
            raise ValueError('Unexpected upstream member URL')
        k = member_key(r)
        if k in seen:
            raise ValueError('Duplicate identity after deduplication')
        seen.add(k)
    for key in ['region_id', 'chapter_id']:
        before = {r[key] for r in previous if r[key]}
        after = {r[key] for r in rows if r[key]}
        if before and len(before & after) < math.ceil(len(before) * .95):
            raise ValueError(f'{key} coverage fell by more than 5%')
    for key in ['company', 'phone', 'address', 'business_desc']:
        before = sum(bool(r[key].strip()) for r in previous) / max(1, len(previous))
        after = sum(bool(r[key].strip()) for r in rows) / len(rows)
        if before and after < before * .90:
            raise ValueError(f'{key} completeness fell by more than 10%')


async def crawl(source, country_id, concurrency):
    sys.path.insert(0, str(source.resolve()))
    import aiohttp
    import bni_scraper_async as crawler
    failures = []
    class Capture(logging.Handler):
        def emit(self, record):
            text = record.getMessage()
            if '分會清單取得失敗' in text or ('區域取得失敗' in text and 'attempt=' not in text):
                failures.append(text)
    crawler.logger.addHandler(Capture())
    original_post = crawler._post_cms_html
    async def checked(*args, **kwargs):
        text = await original_post(*args, **kwargs)
        if not text.strip():
            raise RuntimeError('Empty CMS response after retries')
        return text
    crawler._post_cms_html = checked
    original_detail = crawler.fetch_member_detail
    async def retry_detail(*args, **kwargs):
        for attempt in range(2):
            try:
                return await original_detail(*args, **kwargs)
            except Exception:
                if attempt:
                    failures.append('Member detail failed after retry')
                    raise
                await asyncio.sleep(2)
    crawler.fetch_member_detail = retry_detail
    connector = aiohttp.TCPConnector(limit=concurrency, limit_per_host=concurrency, ttl_dns_cache=300)
    async with aiohttp.ClientSession(headers=crawler.HEADERS, connector=connector) as session:
        rows = await crawler.scrape_country(session, int(country_id), concurrency)
    if failures:
        raise RuntimeError(f'{len(failures)} terminal upstream failures')
    # One person may occur in more than one list. Merge missing public fields by stable identity.
    unique = {}
    for row in rows:
        clean = {k: str(row.get(k) or '') for k in FIELDS}
        key = member_key(clean)
        if key in unique:
            unique[key] = {k: unique[key][k] or clean[k] for k in FIELDS}
        else:
            unique[key] = clean
    return list(unique.values())


def country_command(args):
    directory = args.output / args.country_id
    directory.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    try:
        actual = subprocess.check_output(['git', '-C', str(args.crawler_dir), 'rev-parse', 'HEAD'], text=True).strip()
        if actual != CRAWLER_COMMIT:
            raise ValueError('Crawler revision differs from the reviewed version')
        rows = asyncio.run(crawl(args.crawler_dir, args.country_id, args.concurrency))
        validate(rows, args.country_id)
        compressed(directory / 'members.json.gz', rows)
        status = dict(country_id=args.country_id, status='success', records=len(rows), updated_at=now)
    except Exception as exc:
        logging.exception('Country %s failed; previous snapshot will be retained', args.country_id)
        status = dict(country_id=args.country_id, status='failed', error=f'{type(exc).__name__}: {exc}', updated_at=now)
    dump(directory / 'status.json', status)
    print(json.dumps(status, ensure_ascii=False))


def build_country(root, country, rows, updated_at):
    cid = country['id']
    folder = root / 'docs/catalog' / cid
    stage = folder.with_name(cid + '-staging')
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    chunks, summaries = [], []
    for offset in range(0, len(rows), 1000):
        values = [[r[k] for k in FIELDS] for r in rows[offset:offset+1000]]
        blob = gzip.compress(json.dumps(values, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
        filename = 'profiles-' + hashlib.sha256(blob).hexdigest()[:16] + '.json.gz'
        (stage / filename).write_bytes(blob)
        chunks.append('catalog/' + cid + '/' + filename)
    for number, r in enumerate(rows):
        summaries.append([member_key(r), r['region_id'], r['chapter_id'], r['member_name'], r['company'], r['industry'], r['city'], r['phone'], r['mobile'], r['line_url'], r['website'], (r['business_desc'] or r['best_product'] or r['top_problem_solved'])[:200], r['detail_url'], normalize(' '.join(r.values())), number // 1000, number % 1000])
    blob = gzip.compress(json.dumps(summaries, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    name = 'index-' + hashlib.sha256(blob).hexdigest()[:16] + '.json.gz'
    (stage / name).write_bytes(blob)
    regions = {r['region_id']: r['region_name'] for r in rows}
    chapters = {(r['region_id'], r['chapter_id']): r['chapter_name'] for r in rows}
    meta = dict(id=cid, name=country['name'], label=country['label'], records=len(rows), updated_at=updated_at,
                snapshot_date=datetime.fromisoformat(updated_at).astimezone(ZoneInfo('Asia/Taipei')).date().isoformat(),
                index='catalog/' + cid + '/' + name, chunks=chunks,
                regions=[dict(id=k, name=v) for k, v in regions.items()],
                chapters=[dict(region_id=k[0], id=k[1], name=v) for k, v in chapters.items()],
                categories=sorted({r['industry'].split(' > ')[0] for r in rows if r['industry']}),
                professions=sorted({r['industry'].split(' > ')[-1] for r in rows if r['industry']}))
    dump(stage / 'meta.json', meta)
    shutil.rmtree(folder, ignore_errors=True)
    stage.replace(folder)
    compressed(root / 'data/countries' / (cid + '.json.gz'), rows)
    return meta


def publish_command(args):
    root = args.root
    statuses, successes = [], 0
    for country in countries():
        cid = country['id']
        prior = root / 'data/countries' / (cid + '.json.gz')
        previous = read_compressed(prior) if prior.exists() else []
        if not previous and cid == '7699':
            previous = read_csv(root / 'data/members.csv')
        status_path = args.results / cid / 'status.json'
        status = json.loads(status_path.read_text()) if status_path.exists() else dict(status='failed', error='Country job did not return an artifact')
        if status['status'] == 'success':
            try:
                rows = read_compressed(args.results / cid / 'members.json.gz')
                validate(rows, cid, previous)
                meta = build_country(root, country, rows, status['updated_at'])
                status = dict(meta, status='current')
                successes += 1
                if cid == '7699':
                    publish_taiwan(rows, root=root, crawler_commit=CRAWLER_COMMIT)
            except Exception as exc:
                status = dict(status='failed', error=str(exc))
        if status['status'] == 'failed':
            meta_path = root / 'docs/catalog' / cid / 'meta.json'
            if not meta_path.exists() and previous:
                old_meta = json.loads((root / 'data/metadata.json').read_text())
                build_country(root, country, previous, old_meta['updated_at'])
            if meta_path.exists():
                status = dict(json.loads(meta_path.read_text()), status='stale', error=status['error'])
            else:
                status = dict(country, records=0, status='unavailable', error=status['error'])
        statuses.append(status)
    if not any(c['records'] for c in statuses):
        raise ValueError('No usable country snapshots; retain the previous website')
    manifest = dict(version=1, source='https://github.com/gaskhuang/bni-crawler', crawler_commit=CRAWLER_COMMIT,
                    updated_at=datetime.now(timezone.utc).isoformat(), fields=FIELDS, countries=statuses,
                    records=sum(c['records'] for c in statuses), countries_available=sum(c['records'] > 0 for c in statuses),
                    countries_total=len(statuses), successful_refreshes=successes)
    dump(root / 'docs/catalog.json', manifest)
    dump(root / 'data/global-metadata.json', manifest)
    summary = f'Global BNI: {manifest["records"]:,} members, {manifest["countries_available"]}/{len(statuses)} country/territory entries available, {successes} refreshed successfully.'
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write(summary + '\n\n|國家／地區|筆數|狀態|\n|---|---:|---|\n')
            for c in statuses:
                f.write(f'|{c["label"]}|{c["records"]}|{c["status"]}|\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('country')
    p.add_argument('--crawler-dir', type=Path, required=True)
    p.add_argument('--country-id', required=True)
    p.add_argument('--concurrency', type=int, default=8, choices=range(1, 13))
    p.add_argument('--output', type=Path, default=Path('result'))
    p = sub.add_parser('publish')
    p.add_argument('--root', type=Path, default=ROOT)
    p.add_argument('--results', type=Path, default=Path('incoming'))
    args = parser.parse_args()
    country_command(args) if args.command == 'country' else publish_command(args)
