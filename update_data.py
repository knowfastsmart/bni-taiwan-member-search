"""Usage: python3 update_data.py /path/to/members.csv"""
import csv
import json
import pathlib
import sys

with open(sys.argv[1], encoding='utf-8-sig', newline='') as source:
    reader = csv.DictReader(source)
    required = {'member_name', 'company', 'industry', 'region_name', 'chapter_name', 'chapter_id', 'detail_url'}
    if not required.issubset(reader.fieldnames or []):
        raise SystemExit('CSV 欄位不符：缺少 ' + ', '.join(sorted(required - set(reader.fieldnames or []))))
    records = list(reader)
if not records:
    raise SystemExit('CSV 沒有會員資料')
target = pathlib.Path(__file__).parent / 'docs' / 'members.js'
target.write_text('window.BNI_DATA=' + json.dumps(records, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c') + ';\n', encoding='utf-8')
print(f'已更新 {len(records):,} 筆資料至 {target}')
