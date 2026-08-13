from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path
import sqlite3, json, os, secrets, hashlib, hmac, re

ROOT=Path(__file__).resolve().parent
DB=Path(os.environ.get('DB_PATH',str(ROOT/'mes_essentiels.db')))
ADMIN_EMAIL=os.environ.get('ADMIN_EMAIL','admin@mesessentiels.com').lower()
ADMIN_PASSWORD=os.environ.get('ADMIN_PASSWORD','ChangeMe2026!')
WHATSAPP_NUMBER=os.environ.get('WHATSAPP_NUMBER','224621353257')
STRIPE_PAYMENT_LINK=os.environ.get('STRIPE_PAYMENT_LINK','')
PRODUCTS=[
(1,'Robe longue wax élégante',550000,'femme','assets/prod1.jpg','S,M,L,XL',8,'Robe longue en wax, coupe élégante et confortable.'),
(2,'Ensemble traditionnel homme',650000,'homme','assets/prod2.jpg','M,L,XL,XXL',7,'Ensemble traditionnel brodé pour homme.'),
(3,'Boubou en bazin premium',850000,'femme','assets/prod3.jpg','S,M,L,XL',5,'Boubou en bazin premium pour cérémonies et occasions.'),
(4,'Ensemble brodé cérémonie',600000,'homme','assets/prod4.jpg','S,M,L,XL',6,'Ensemble homme brodé, finition cérémonie.'),
(5,'Robe courte wax colorée',350000,'femme','assets/prod5.jpg','S,M,L,XL',12,'Robe courte colorée en tissu wax.'),
(6,'Tenue enfant wax',300000,'enfant','assets/enfant.jpg','4A,6A,8A,10A',10,'Tenue wax confortable pour enfant.'),
(7,'Sac inspiration africaine',400000,'accessoires','assets/accessoires.jpg','Unique',9,'Sac élégant aux inspirations africaines.')]

def db():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');return c

def norm_phone(v):
 d=re.sub(r'\D','',str(v or ''))
 if d.startswith('00'): d=d[2:]
 if len(d)==9 and d.startswith(('6','7')): d='224'+d
 return d

def hash_password(p,salt=None):
 salt=salt or secrets.token_bytes(16);dk=hashlib.pbkdf2_hmac('sha256',p.encode(),salt,180000);return salt.hex()+':'+dk.hex()

def verify_password(p,stored):
 try:
  s,h=stored.split(':');return hmac.compare_digest(hash_password(p,bytes.fromhex(s)).split(':')[1],h)
 except:return False

def public_email(e):
 e=str(e or '');return '' if e.endswith('@mesessentiels.local') else e

def user_obj(u):return {'id':u['id'],'name':u['name'],'email':public_email(u['email']),'phone':u['phone'] or '','role':u['role']}

def init_db():
 con=db();cur=con.cursor();cur.executescript("""
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,price REAL NOT NULL,category TEXT NOT NULL,image TEXT NOT NULL,sizes TEXT NOT NULL,stock INTEGER NOT NULL DEFAULT 0,description TEXT DEFAULT '',active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,customer_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,postal_code TEXT NOT NULL,payment_method TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'nouvelle',total REAL NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,name TEXT NOT NULL,size TEXT NOT NULL,qty INTEGER NOT NULL,unit_price REAL NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
 """)
 cols=[r['name'] for r in cur.execute('PRAGMA table_info(users)').fetchall()]
 if 'phone' not in cols:cur.execute('ALTER TABLE users ADD COLUMN phone TEXT')
 cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone<>''")
 for p in PRODUCTS:
  cur.execute('INSERT OR IGNORE INTO products(id,name,price,category,image,sizes,stock,description) VALUES(?,?,?,?,?,?,?,?)',p);cur.execute('UPDATE products SET price=? WHERE id=? AND price<10000',(p[2],p[0]))
 if not cur.execute('SELECT id FROM users WHERE email=?',(ADMIN_EMAIL,)).fetchone():cur.execute('INSERT INTO users(name,email,password,role,phone) VALUES(?,?,?,?,?)',('Administration',ADMIN_EMAIL,hash_password(ADMIN_PASSWORD),'admin',None))
 con.commit();con.close()

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def send_json(self,o,s=200):
  d=json.dumps(o,ensure_ascii=False).encode();self.send_response(s);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(d)));self.end_headers();self.wfile.write(d)
 def body(self):
  try:return json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}')
  except:return {}
 def auth(self,admin=False):
  t=self.headers.get('Authorization','').replace('Bearer ','').strip()
  if not t:return None
  con=db();r=con.execute('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?',(t,)).fetchone();con.close()
  return dict(r) if r and (not admin or r['role']=='admin') else None
 def do_GET(self):
  p=urlparse(self.path).path
  if p=='/api/config':return self.send_json({'whatsapp':WHATSAPP_NUMBER,'stripe_enabled':bool(STRIPE_PAYMENT_LINK)})
  if p=='/api/products':
   con=db();r=con.execute('SELECT * FROM products WHERE active=1 ORDER BY id').fetchall();con.close();return self.send_json([dict(x) for x in r])
  if p=='/api/me':
   u=self.auth();return self.send_json({'user':user_obj(u) if u else None})
  if p=='/api/admin/products':
   if not self.auth(True):return self.send_json({'error':'Non autorisé'},401)
   con=db();r=con.execute('SELECT * FROM products ORDER BY id').fetchall();con.close();return self.send_json([dict(x) for x in r])
  if p=='/api/admin/orders':
   if not self.auth(True):return self.send_json({'error':'Non autorisé'},401)
   con=db();out=[]
   for r in con.execute('SELECT * FROM orders ORDER BY id DESC').fetchall():
    o=dict(r);o['items']=[dict(x) for x in con.execute('SELECT * FROM order_items WHERE order_id=?',(r['id'],)).fetchall()];out.append(o)
   con.close();return self.send_json(out)
  if p=='/api/admin/customers':
   if not self.auth(True):return self.send_json({'error':'Non autorisé'},401)
   con=db();r=con.execute("SELECT id,name,email,phone,created_at FROM users WHERE role='customer' ORDER BY id DESC").fetchall();con.close();return self.send_json([{'id':x['id'],'name':x['name'],'email':public_email(x['email']),'phone':x['phone'] or '','created_at':x['created_at']} for x in r])
  return super().do_GET()
 def do_POST(self):
  p=urlparse(self.path).path;b=self.body()
  if p=='/api/register':
   name=str(b.get('name','')).strip();phone=norm_phone(b.get('phone'));email=str(b.get('email','')).strip().lower();pwd=str(b.get('password',''))
   if not name or len(phone)<8 or len(pwd)<6:return self.send_json({'error':'Nom, téléphone valide et mot de passe de 6 caractères minimum requis.'},400)
   if email and '@' not in email:return self.send_json({'error':'Adresse e-mail invalide.'},400)
   con=db()
   try:
    ie=email or f'phone-{phone}@mesessentiels.local';cur=con.execute('INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)',(name,ie,phone,hash_password(pwd)));uid=cur.lastrowid;t=secrets.token_urlsafe(32);con.execute('INSERT INTO sessions(token,user_id) VALUES(?,?)',(t,uid));con.commit();u=con.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone();return self.send_json({'token':t,'user':user_obj(u)},201)
   except sqlite3.IntegrityError:return self.send_json({'error':'Un compte existe déjà avec ce téléphone ou cet e-mail.'},409)
   finally:con.close()
  if p=='/api/login':
   login=str(b.get('login',b.get('email',''))).strip();pwd=str(b.get('password',''));con=db();u=con.execute('SELECT * FROM users WHERE lower(email)=?',(login.lower(),)).fetchone() if '@' in login else con.execute('SELECT * FROM users WHERE phone=?',(norm_phone(login),)).fetchone()
   if not u or not verify_password(pwd,u['password']):con.close();return self.send_json({'error':'Téléphone/e-mail ou mot de passe incorrect.'},401)
   t=secrets.token_urlsafe(32);con.execute('INSERT INTO sessions(token,user_id) VALUES(?,?)',(t,u['id']));con.commit();o=user_obj(u);con.close();return self.send_json({'token':t,'user':o})
  if p=='/api/logout':
   t=self.headers.get('Authorization','').replace('Bearer ','').strip();con=db();con.execute('DELETE FROM sessions WHERE token=?',(t,));con.commit();con.close();return self.send_json({'ok':True})
  if p=='/api/change-password':
   u=self.auth();cur=str(b.get('current_password',''));new=str(b.get('new_password',''))
   if not u:return self.send_json({'error':'Connexion requise.'},401)
   if len(new)<6:return self.send_json({'error':'Le nouveau mot de passe doit contenir au moins 6 caractères.'},400)
   if not verify_password(cur,u['password']):return self.send_json({'error':'Mot de passe actuel incorrect.'},400)
   con=db();con.execute('UPDATE users SET password=? WHERE id=?',(hash_password(new),u['id']));con.commit();con.close();return self.send_json({'ok':True})
  if p.startswith('/api/admin/customers/') and p.endswith('/password'):
   if not self.auth(True):return self.send_json({'error':'Non autorisé'},401)
   try:cid=int(p.split('/')[4])
   except:return self.send_json({'error':'Client invalide'},400)
   new=str(b.get('password',''))
   if len(new)<6:return self.send_json({'error':'6 caractères minimum.'},400)
   con=db();r=con.execute("SELECT id FROM users WHERE id=? AND role='customer'",(cid,)).fetchone()
   if not r:con.close();return self.send_json({'error':'Client introuvable'},404)
   con.execute('UPDATE users SET password=? WHERE id=?',(hash_password(new),cid));con.execute('DELETE FROM sessions WHERE user_id=?',(cid,));con.commit();con.close();return self.send_json({'ok':True})
  if p=='/api/orders':
   u=self.auth();items=b.get('items') or []
   if not u:return self.send_json({'error':'Compte client obligatoire pour commander.'},401)
   for f in ['customer_name','phone','address','city','payment_method']:
    if not str(b.get(f,'')).strip():return self.send_json({'error':'Nom, téléphone, adresse et ville requis.'},400)
   if not items:return self.send_json({'error':'Panier vide.'},400)
   con=db();total=0;prepared=[]
   try:
    con.execute('BEGIN IMMEDIATE')
    for x in items:
     pr=con.execute('SELECT * FROM products WHERE id=? AND active=1',(int(x.get('id',0)),)).fetchone();q=max(1,int(x.get('qty',1)));size=str(x.get('size','Unique'))
     if not pr or pr['stock']<q or size not in pr['sizes'].split(','):raise ValueError('Produit, taille ou stock invalide.')
     total+=pr['price']*q;prepared.append((pr,q,size))
    vals=(u['id'],str(b['customer_name']).strip(),str(b.get('email','')).strip(),norm_phone(b['phone']),str(b['address']).strip(),str(b['city']).strip(),str(b.get('postal_code','')).strip(),str(b['payment_method']).strip(),round(total,2));cur=con.execute('INSERT INTO orders(user_id,customer_name,email,phone,address,city,postal_code,payment_method,total) VALUES(?,?,?,?,?,?,?,?,?)',vals);oid=cur.lastrowid
    for pr,q,size in prepared:con.execute('INSERT INTO order_items(order_id,product_id,name,size,qty,unit_price) VALUES(?,?,?,?,?,?)',(oid,pr['id'],pr['name'],size,q,pr['price']));con.execute('UPDATE products SET stock=stock-? WHERE id=?',(q,pr['id']))
    con.commit();return self.send_json({'ok':True,'order_id':oid,'total':round(total,2),'payment_url':STRIPE_PAYMENT_LINK if b.get('payment_method')=='stripe' and STRIPE_PAYMENT_LINK else None},201)
   except ValueError as e:con.rollback();return self.send_json({'error':str(e)},400)
   finally:con.close()
  return self.send_json({'error':'Route introuvable'},404)
 def do_PUT(self):
  p=urlparse(self.path).path;b=self.body()
  if p.startswith('/api/admin/products/'):
   if not self.auth(True):return self.send_json({'error':'Non autorisé'},401)
   pid=int(p.rsplit('/',1)[1]);fields={k:b[k] for k in ['name','price','category','image','sizes','stock','description','active'] if k in b};con=db();con.execute('UPDATE products SET '+','.join(f'{k}=?' for k in fields)+' WHERE id=?',list(fields.values())+[pid]);con.commit();con.close();return self.send_json({'ok':True})
  if p.startswith('/api/admin/orders/'):
   if not self.auth(True):return self.send_json({'error':'Non autorisé'},401)
   oid=int(p.rsplit('/',1)[1]);status=str(b.get('status',''));con=db();con.execute('UPDATE orders SET status=? WHERE id=?',(status,oid));con.commit();con.close();return self.send_json({'ok':True})
  return self.send_json({'error':'Route introuvable'},404)

if __name__=='__main__':
 init_db();port=int(os.environ.get('PORT','8000'));ThreadingHTTPServer(('0.0.0.0',port),Handler).serve_forever()
