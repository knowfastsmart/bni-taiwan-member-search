import csv
import io
import json
import tempfile
import unittest
from pathlib import Path
from update_data import FIELDS, publish, read_csv, validate


def members(count=120):
    rows = []
    for i in range(count):
        r = dict.fromkeys(FIELDS, '')
        r.update(country_id='7699', country_name='Taiwan', member_name=f'Member {i}',
                 industry='法律&會計 > 會計服務 > 會計師', region_id='1', chapter_id='2',
                 company='Example', phone='02-12345678', address='Taiwan',
                 business_desc='Accounting', detail_url=f'https://bni.com.tw/zh-TW/memberdetails?encryptedMemberId={i}')
        rows.append(r)
    return rows


class SnapshotTests(unittest.TestCase):
    def test_empty_and_large_drop_rejected(self):
        for records in [[], members(100)]:
            with self.assertRaises(ValueError):
                validate(records, members())

    def test_wrong_country_duplicate_and_missing_details_rejected(self):
        for key, value in [('country_id', '7638'), ('detail_url', members()[0]['detail_url'])]:
            records = members()
            records[-1][key] = value
            with self.assertRaises(ValueError):
                validate(records, members())
        records = members()
        for row in records:
            row['address'] = ''
        with self.assertRaises(ValueError):
            validate(records, members())

    def test_valid_publish_csv_and_javascript_match_and_escape_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            (root / 'docs').mkdir()
            buffer = io.StringIO()
            writer = csv.DictWriter(buffer, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(members())
            (root / 'data/members.csv').write_text(buffer.getvalue())
            rows = members()
            rows[0]['company'] = '</script><script>alert(1)</script>'
            rows[1]['company'] = '=1+1'
            meta = publish(rows, root=root, snapshot_date='2026-10-30')
            script = (root / 'docs/members.js').read_text()
            self.assertNotIn('</script>', script)
            encoded = script.split('window.BNI_DATA=', 1)[1].removesuffix(';\n')
            self.assertEqual(json.loads(encoded), read_csv(root / 'data/members.csv'))
            self.assertEqual(meta['changes'], {'added': 0, 'removed': 0, 'updated': 2})
            before = (root / 'docs/members.js').read_bytes()
            with self.assertRaises(ValueError):
                publish([], root=root)
            self.assertEqual(before, (root / 'docs/members.js').read_bytes())


if __name__ == '__main__':
    unittest.main()
