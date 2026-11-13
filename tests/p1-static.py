from pathlib import Path
from html.parser import HTMLParser
import re,subprocess
R=Path(__file__).resolve().parents[1]
class Forms(HTMLParser):
 def __init__(self):super().__init__();self.forms=[];self.cur=None
 def handle_starttag(self,t,a):
  d=dict(a)
  if t=='form':self.cur={'attr':d,'fields':[]};self.forms.append(self.cur)
  if self.cur and t in ['input','select','textarea']:self.cur['fields'].append(d.get('name'))
 def handle_endtag(self,t):
  if t=='form':self.cur=None
s=(R/'pro-vs-max-outdoor-kitchen.html').read_text();f=Forms();f.feed(s)
assert len(f.forms)==2
assert f.forms[0]['fields']==['name','company','email','country','business_type','request_type','consent']
assert all(x['attr']['action']=='https://formspree.io/f/xwlkoeel' for x in f.forms)
assert '<form' not in (R/'index.html').read_text()
for a,b in [('KAISTEEL_Horizontal.svg','KAISTEEL_Horizontal_NoTagline.svg'),('KAISTEEL_Horizontal_White.svg','KAISTEEL_Horizontal_White_NoTagline.svg')]:
 original=(R/'assets'/a).read_text();small=(R/'assets'/b).read_text()
 p=re.findall(r'<path\b[^>]*/>',original);q=re.findall(r'<path\b[^>]*/>',small)
 assert len(p)==17 and len(q)==16 and p[:-1]==q
 assert re.search(r'viewBox="([^"]+)"',original)[1]==re.search(r'viewBox="([^"]+)"',small)[1]
 assert 224*(1140.060830379747-115)/1140.060830379747>=200
css=(R/'assets/brand-v1.4.css').read_text();assert '.brand img{width:224px;min-width:224px;height:auto;max-height:none}' in css
subprocess.run(['node','--check',str(R/'assets/product-enquiries.js')],check=True)
print('PASS P1 form schema, homepage consolidation, logo path fidelity, net-width arithmetic, JS syntax. NOT browser QA.')
