"""Run the reviewed upstream asynchronous crawler for Taiwan only."""
import argparse
import asyncio
import logging
import subprocess
import sys
from pathlib import Path
from update_data import FIELDS, publish

CRAWLER_COMMIT = 'cc7c982457a1bf8406aeeb8b982df49c6224045b'


async def crawl(source, concurrency):
    sys.path.insert(0, str(source.resolve()))
    import aiohttp
    import bni_scraper_async as crawler
    failures = []

    class CaptureFailure(logging.Handler):
        def emit(self, record):
            if any(s in record.getMessage() for s in ['分會清單取得失敗', '詳情解析失敗']):
                failures.append(record.getMessage())

    crawler.logger.addHandler(CaptureFailure())
    original = crawler._post_cms_html

    async def checked_request(*args, **kwargs):
        try:
            content = await original(*args, **kwargs)
            if not content.strip():
                raise RuntimeError('Empty CMS response after retries')
            return content
        except Exception as exc:
            failures.append(str(exc))
            raise

    crawler._post_cms_html = checked_request
    connector = aiohttp.TCPConnector(limit=concurrency, limit_per_host=concurrency,
                                     ttl_dns_cache=300)
    async with aiohttp.ClientSession(headers=crawler.HEADERS, connector=connector) as session:
        records = await crawler.scrape_country(session, 7699, concurrency)
    if failures:
        raise RuntimeError(f'{len(failures)} crawl failures; previous database retained')
    return [{k: str(r.get(k) or '') for k in FIELDS} for r in records]


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--crawler-dir', type=Path, required=True)
    parser.add_argument('--concurrency', type=int, default=8, choices=range(1, 21))
    args = parser.parse_args()
    actual = subprocess.check_output(['git', '-C', str(args.crawler_dir), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != CRAWLER_COMMIT:
        raise SystemExit('Crawler revision differs from the reviewed version')
    records = asyncio.run(crawl(args.crawler_dir, args.concurrency))
    publish(records, crawler_commit=actual)
