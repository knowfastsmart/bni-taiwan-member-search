import copy
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from global_pipeline import validate, build_country, normalize, member_key
from update_data import FIELDS


def member(number=0, country='10'):
    row = dict.fromkeys(FIELDS, '')
    row.update(country_id=country, country_name='United States', region_id='r',
               region_name='Region', chapter_id='c', chapter_name='Chapter',
               member_name='Member ' + str(number), company='Company',
               industry='Legal > Lawyer', business_desc='法律服務與 contracts',
               detail_url=f'https://bni.com.tw/zh-TW/memberdetails?encryptedMemberId=Member{number}%3D%3D&name=Old')
    return row


class GlobalTests(unittest.TestCase):
    def test_validation_rejects_empty_wrong_country_drop_and_bad_url(self):
        rows = [member(i) for i in range(100)]
        validate(rows, '10')
        for new in [[], rows[:50], [member(country='7699')]]:
            with self.assertRaises(ValueError):
                validate(new, '10', rows)
        row = member()
        row['detail_url'] = 'https://evil.example/?encryptedMemberId=Bad'
        with self.assertRaises(ValueError):
            validate([row], '10')

    def test_indexes_preserve_searchable_full_fields_and_exact_profile_chunks(self):
        rows = [member(i) for i in range(1001)]
        rows[1000]['industry'] = 'Creative > Photographer >'
        rows[999]['industry'] = ' > '
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            meta = build_country(root, dict(id='10', name='United States', label='美國'), rows, '2026-10-30T12:00:00+00:00')
            self.assertEqual(len(meta['chunks']), 2)
            self.assertIn('Photographer', meta['professions'])
            self.assertNotIn('Photographer >', meta['professions'])
            index = json.loads(gzip.decompress((root / 'docs' / meta['index']).read_bytes()))
            self.assertIn(normalize('法律服務'), index[1000][13])
            self.assertEqual(index[1000][14:], [1, 0])
            profile = json.loads(gzip.decompress((root / 'docs' / meta['chunks'][1]).read_bytes()))[0]
            self.assertEqual(dict(zip(FIELDS, profile)), rows[1000])
            again = build_country(root, dict(id='10', name='United States', label='美國'), rows, '2026-10-30T12:00:00+00:00')
            self.assertEqual(meta['index'], again['index'])
            self.assertEqual(member_key(rows[0]), member_key(dict(rows[0], detail_url=rows[0]['detail_url'].replace('Old', 'New'))))


if __name__ == '__main__':
    unittest.main()
