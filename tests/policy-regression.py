#!/usr/bin/env python3
"""Offline release checks for the approved global policy and public-only P1 copy."""
from pathlib import Path
import json, re, subprocess, os
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
from xml.etree import ElementTree as ET
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('KAISTEEL_RELEASE_BASE','f2458db4d34c7d1d5b54419242ac4bcea7a1a59c')
pages=list(ROOT.rglob('*.html'))
allcopy='\n'.join(p.read_text() for p in pages)+(ROOT/'llms.txt').read_text()
for forbidden in ['6 months after','50% deposit','50% balance','qualifying standard PRO','INTERNAL IMPLEMENTATION SPECIFICATION','INTERNAL ONLY','Draft receipt text','DRAFT','Prepared for review','Review copy, not published','Local review copy','subject to release','GP-approved','not guaranteed delivered dimensions','not a complete specification or a promise of exact delivered dimensions','Start with one PRO or MAX dealer sample','Standard PRO/MAX one-unit samples','Standard PRO/MAX samples available','Australian Dealer Pack','Australian dealers','Australian outdoor-kitchen dealer programme']:
    assert forbidden not in allcopy, forbidden
class Document(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.ids=set()
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.add(a['id'])
        if tag=='a' and 'href' in a:self.links.append(a['href'])
documents={}
for p in pages:
    s=p.read_text();d=Document();d.feed(s);documents[p.resolve()]=d
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',s,re.S):json.loads(block)
    if p.parent==ROOT:assert 'australia-outdoor-kitchen-dealers' not in s,p
for p,d in documents.items():
    for href in d.links:
        u=urlsplit(href)
        if u.scheme or u.netloc:continue
        target=(ROOT/u.path.lstrip('/') if u.path.startswith('/') else p.parent/u.path).resolve() if u.path else p
        if target.is_dir():target=target/'index.html'
        assert target.is_file(),(p.name,'missing linked file',href)
        if u.fragment and target in documents:assert unquote(u.fragment) in documents[target].ids,(p.name,'missing anchor',href)
sample=(ROOT/'outdoor-kitchen-sample-credit.html').read_text()
for expected in ['registered business entities','first contract and first payment','1 September through 31 December 2026','one customer (one paying entity)','Multi-customer consolidation','pre-shipment balance without waiting','carrier’s POD','The next day is Day 1','23:59 local time','Day 180','no negative balance, refund, cash value or carry-over','packaging and packing upgrades','separately charged services','11 November 2026, 00:00 HKT (UTC+8)','formal quotation or PI must record participation']:
    assert expected in sample,expected
p1=(ROOT/'pro-vs-max-outdoor-kitchen.html').read_text()
for expected in ['CUSTOM','Model and supply scope are separate choices','System Shell','Appliance-Ready','Full Package','index.html#contact','DDP is not offered for Australia']:
    assert expected in p1,expected
# Latest user naming decision, 10 November 2026, supersedes flexible-size series language.
for name in ['index.html','pro-vs-max-outdoor-kitchen.html','llms.txt']:
    copy=(ROOT/name).read_text()
    assert 'Other sizes available as CUSTOM' in copy,name
    assert 'CUSTOM 3500' in copy,name
    assert '2300 mm' in copy and '2900 mm' in copy,name
home=(ROOT/'index.html').read_text()
products=[json.loads(b) for b in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',home,re.S)]
for model,width in [('KAISTEEL PRO',2300),('KAISTEEL MAX',2900)]:
    product=next(x for x in products if x.get('@type')=='Product' and x.get('name')==model)
    assert product.get('width')=={'@type':'QuantitativeValue','value':width,'unitCode':'MMT'},model
    assert f'fixed standard width of {width} mm' in product['description'],model
for expected in ['Warranty starts on the shipment date','solid SUS304/SUS316','up to 5 years','canopy motors','no overseas stock or warehouses','worldwide through one global enquiry']:
    assert expected in home,expected
before=subprocess.check_output(['git','show',BASE+':index.html'],cwd=ROOT,text=True)
# 12 November WEB-P1 authorization consolidates homepage lead capture into two product-page forms.
assert '<form' not in home, 'Legacy homepage form must be retired'
for target in ['pro-vs-max-outdoor-kitchen.html#dealer-pack','pro-vs-max-outdoor-kitchen.html#quotation']:
    assert target in home, target
assert 'const rfqForm=' not in home and 'const FORM_ENDPOINT=' not in home, 'Dead homepage submission logic remains'
assert p1.count('class="product-enquiry"') == 2
for expected in ['name="model"','name="supply_scope"','name="project_notes"','name="consent" required','https://formspree.io/f/xwlkoeel']:
    assert expected in p1, expected
# Homepage video safety (replaces the f2458db4 markup freeze): every <video> is silent, lazy and has real files,
# captions/labels avoid owned-factory claims, and no unreferenced video ships from assets/video/ via pages.yml.
import shutil
videos=re.findall(r'(<video\b[^>]*>)(.*?)</video>',home,re.S)
assert videos,'No homepage videos'
for tag,inner in videos:
    assert 'preload="none"' in tag and re.search(r'\bmuted\b',tag) and re.search(r'\bplaysinline\b',tag),tag
    poster=re.search(r'poster="([^"]+)"',tag); assert poster and (ROOT/poster[1]).is_file(),('missing poster',tag)
    sources=re.findall(r'<source\b[^>]*src="([^"]+\.mp4)"',inner); assert sources,('missing mp4 source',tag)
    for src in sources:
        assert (ROOT/src).is_file(),('missing video',src)
        if shutil.which('ffprobe'):
            streams=subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name','-of','csv=p=0',str(ROOT/src)],text=True).split()
            assert not [s for s in streams if s.endswith('audio')],('audio stream present',src)
            assert 'h264,video' in streams,('not H.264',src)
for text in re.findall(r'<figcaption\b.*?</figcaption>',home,re.S)+re.findall(r'aria-label="([^"]*)"',home):
    # The partner-workshop disclaimer "not a KAISTEEL-owned factory" is required wording; any other use is a claim.
    claim=text.replace('not a KAISTEEL-owned','')
    for forbidden in ['Real factory footage','KAISTEEL-owned','our factory','Our factory']:
        assert forbidden not in claim,(forbidden,text[:120])
published='\n'.join(p.read_text() for p in pages)
for mp4 in sorted((ROOT/'assets/video').glob('*.mp4')):
    assert 'assets/video/'+mp4.name in published,('unreferenced video would be published',mp4.name)
for path in ['assets/analytics-consent.js','assets/inquiry-resilience.js','privacy-policy.html','terms.html','assets/KAISTEEL-Technical-Approval-2026-10.pdf','assets/KAISTEEL-Technical-Specification-V1.2.pdf','assets/KAISTEEL-QC-Checklist-V1.1.pdf']:
    prior=subprocess.check_output(['git','show',BASE+':'+path],cwd=ROOT)
    if path.endswith('.html'):
        prior=prior.replace(b'assets/KAISTEEL_Horizontal_White.svg',b'assets/KAISTEEL_Horizontal_White_NoTagline.svg').replace(b'assets/KAISTEEL_Horizontal.svg',b'assets/KAISTEEL_Horizontal_NoTagline.svg')
    assert prior==(ROOT/path).read_bytes(),path+' changed beyond authorized logo substitution'
redirect=(ROOT/'australia-outdoor-kitchen-dealers/index.html').read_text()
for expected in ['noindex,follow','rel="canonical" href="https://kaisteelkitchen.com/"','window.location.replace','target.search = window.location.search',"'#dealer-pack' ? 'contact' : 'business'",'<noscript>']:
    assert expected in redirect,expected
assert '<form' not in redirect
sitemap=(ROOT/'sitemap.xml').read_text();ET.fromstring(sitemap)
assert 'australia-outdoor-kitchen-dealers' not in sitemap
mapping={
'KAISTEEL-PRO-MAX-B2B-Guide.pdf':'KAISTEEL-Procurement-Guide-2026-11.pdf',
'KAISTEEL-Catalog-2026-Brand-v1.4.pdf':'KAISTEEL-Procurement-Guide-2026-11.pdf',
'KAISTEEL-Product-Guide-2026-10.pdf':'KAISTEEL-Procurement-Guide-2026-11.pdf',
'KAISTEEL-Manufacturing-Overview-2026-10.pdf':'KAISTEEL-Manufacturing-Overview-2026-11.pdf',
'KAISTEEL-MANUFACTURING-CAPABILITY-EN.pdf':'KAISTEEL-Manufacturing-Overview-2026-11.pdf',
'KAISTEEL-LIMITED-WARRANTY-V1.4.pdf':'KAISTEEL-Limited-Warranty-2026-11.pdf',
'KAISTEEL-Warranty-V1.3-Brand-v1.4.pdf':'KAISTEEL-Limited-Warranty-2026-11.pdf',
'KAISTEEL-Limited-Warranty-2026-10.pdf':'KAISTEEL-Limited-Warranty-2026-11.pdf'}
for old,new in mapping.items():
    assert old not in allcopy,old+' still linked publicly'
    text=subprocess.check_output(['pdftotext',str(ROOT/'assets'/old),'-'],text=True)
    reader=PdfReader(ROOT/'assets'/old)
    urls=[str(a.get_object().get('/A',{}).get('/URI','')) for page in reader.pages for a in page.get('/Annots',[])]
    assert 'https://kaisteelkitchen.com/assets/'+new in urls,(old,'missing embedded replacement link')
    assert 'superseded' in text.lower(),(old,'not a superseded notice')
    assert (ROOT/'assets'/new).is_file()
for name in [*set(mapping.values()),'KAISTEEL-Sample-Credit-Policy-2026-11.pdf']:
    text=subprocess.check_output(['pdftotext',str(ROOT/'assets'/name),'-'],text=True)
    assert 'DRAFT' not in text and 'REVIEW COPY' not in text,name
    assert '11 November 2026' in text and '00:00' in text,name+' commencement missing'
procurement=subprocess.check_output(['pdftotext',str(ROOT/'assets/KAISTEEL-Procurement-Guide-2026-11.pdf'),'-'],text=True)
assert 'Other sizes available as CUSTOM' in procurement
assert 'CUSTOM 3500' in procurement
assert 'promise of exact delivered dimensions' not in procurement
print('PASS: global public copy, policy boundaries, all local links/anchors, JSON-LD, sitemap, redirect, eight PDF notices; P1 enquiry routes, homepage video safety and protected legal/technical files')
print('NOT TESTED: browser rendering, keyboard, inquiry responses, production delivery or deployment')
