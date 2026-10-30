"""Validate and publish Taiwan CSV, metadata and browser data together."""
import argparse
import csv
import io
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
FIELDS = ['country_id', 'country_name', 'region_id', 'region_name', 'chapter_id',
          'chapter_name', 'member_name', 'title', 'company', 'industry', 'city',
          'phone', 'mobile', 'address', 'postal_code', 'website', 'business_desc',
          'ideal_referral', 'best_product', 'top_problem_solved',
          'ideal_referral_partner', 'favorite_story', 'line_url', 'detail_url']


def read_csv(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        if set(reader.fieldnames or []) != set(FIELDS):
            raise ValueError('CSV must contain exactly the 24 expected fields')
        return list(reader)


def identity(row):
    values = parse_qs(urlsplit(row['detail_url']).query)
    return values.get('encryptedMemberId', [row['detail_url']])[0]


def validate(records, previous):
    if not records:
        raise ValueError('No members returned; previous data retained')
    if len(records) < max(100, math.ceil(len(previous) * 0.90)):
        raise ValueError('Member count fell by more than 10%; previous data retained')
    seen = set()
    for row in records:
        if set(row) != set(FIELDS) or any(not isinstance(v, str) for v in row.values()):
            raise ValueError('Unexpected record schema')
        if row['country_id'] != '7699' or not all(row[k].strip() for k in
                ['member_name', 'industry', 'region_id', 'chapter_id', 'detail_url']):
            raise ValueError('Missing required Taiwan member fields')
        url = urlsplit(row['detail_url'])
        if url.scheme != 'https' or url.hostname != 'bni.com.tw':
            raise ValueError('Unexpected member URL')
        key = identity(row)
        if key in seen:
            raise ValueError('Duplicate member identity')
        seen.add(key)
    for key in ['region_id', 'chapter_id']:
        before = {r[key] for r in previous}
        after = {r[key] for r in records}
        if before and len(before & after) < math.ceil(len(before) * 0.95):
            raise ValueError(f'{key} coverage fell by more than 5%')
    for key in ['company', 'phone', 'address', 'business_desc']:
        before = sum(bool(r[key].strip()) for r in previous) / max(1, len(previous))
        after = sum(bool(r[key].strip()) for r in records) / len(records)
        if before and after < before * 0.90:
            raise ValueError(f'{key} completeness fell by more than 10%')


def safe_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def publish(records, root=ROOT, snapshot_date=None, crawler_commit=None):
    root = Path(root)
    previous = read_csv(root / 'data/members.csv')
    validate(records, previous)
    records = [{k: "'" + v if v.lstrip().startswith(('=', '+', '-', '@')) else v
                for k, v in row.items()} for row in records]
    now = datetime.now(timezone.utc)
    date = snapshot_date or now.astimezone(ZoneInfo('Asia/Taipei')).date().isoformat()
    old = {identity(r): r for r in previous}
    new = {identity(r): r for r in records}
    changes = {'added': len(new.keys() - old.keys()), 'removed': len(old.keys() - new.keys()),
               'updated': sum(new[k] != old[k] for k in new.keys() & old.keys())}
    metadata = {'source': 'https://github.com/gaskhuang/bni-crawler',
                'snapshot_date': date, 'updated_at': now.isoformat(),
                'records': len(records), 'fields': FIELDS,
                'regions': len({r['region_id'] for r in records}),
                'chapters': len({r['chapter_id'] for r in records}),
                'changes': changes}
    if crawler_commit:
        metadata['crawler_commit'] = crawler_commit
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows(records)
    clean = list(csv.DictReader(io.StringIO(stream.getvalue())))
    outputs = {'data/members.csv': '\ufeff' + stream.getvalue(),
               'data/metadata.json': json.dumps(metadata, ensure_ascii=False, indent=2) + '\n',
               'docs/members.js': 'window.BNI_META=' + safe_json(metadata) + ';\nwindow.BNI_DATA=' + safe_json(clean) + ';\n'}
    for name, text in outputs.items():
        target = root / name
        temporary = target.with_name(target.name + '.tmp')
        temporary.write_text(text, encoding='utf-8', newline='')
        temporary.replace(target)
    summary = f'BNI Taiwan: {len(records):,} members; +{changes["added"]} / -{changes["removed"]} / {changes["updated"]} updated; snapshot {date}'
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as handle:
            handle.write(summary + '\n')
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('csv', type=Path)
    parser.add_argument('--snapshot-date')
    args = parser.parse_args()
    publish(read_csv(args.csv), snapshot_date=args.snapshot_date)
