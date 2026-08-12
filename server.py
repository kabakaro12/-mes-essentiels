from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path
import sqlite3, json, os, secrets, hashlib, hmac, mimetypes

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('DB_PATH', str(ROOT / 'mes_essentiels.db')))
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@mesessentiels.com').lower()
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'ChangeMe2026!')
WHATSAPP_NUMBER = os.environ.get('WHATSAPP_NUMBER', '')
STRIPE_PAYMENT_LINK = os.environ.get('STRIPE_PAYMENT_LINK', '')

PRODUCTS = [
 (1,'Robe longue wax élégante',59.90,'femme','assets/prod1.jpg','S,M,L,XL',8,'Robe longue en wax, coupe élégante et confortable.'),
 (2,'Ensemble traditionnel homme',69.90,'homme','assets/prod2.jpg','M,L,XL,XXL',7,'Ensemble traditionnel brodé pour homme.'),
 (3,'Boubou en bazin premium',89.90,'femme','assets/prod3.jpg','S,M,L,XL',5,'Boubou en bazin premium pour cérémonies et occasions.'),
 (4,'Ensemble brodé cérémonie',64.90,'homme','assets/prod4.jpg','S,M,L,XL',6,'Ensemble homme brodé, finition cérémonie.'),
 (5,'Robe courte wax colorée',39.90,'femme','assets/prod5.jpg','S,M,L,XL',12,'Robe courte colorée en tissu wax.'),
 (6,'Tenue enfant wax',29.90,'enfant','assets/enfant.jpg','4A,6A,8A,10A',10,'Tenue wax confortable pour enfant.'),
 (7,'Sac inspiration africaine',44.90,'accessoires','assets/accessoires.jpg','Unique',9,'Sac élégant aux inspirations africaines.')
]

def db():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON'); return c

def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 180_000)
    return salt.hex()+':'+dk.hex()

def verify_password(password, stored):
    try:
        s,h=stored.split(':'); salt=bytes.fromhex(s)
        return hmac.compare_digest(hash_password(password,salt).split(':')[1], h)
    except Exception: return False

def init_db():
    con=db(); cur=con.cursor()
    cur.executescript('''
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, category TEXT NOT NULL, image TEXT NOT NULL, sizes TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 0, description TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, postal_code TEXT NOT NULL, payment_method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'nouvelle', total REAL NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, name TEXT NOT NULL, size TEXT NOT NULL, qty INTEGER NOT NULL, unit_price REAL NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
    ''')
    for p in PRODUCTS:
        cur.execute('INSERT OR IGNORE INTO products(id,name,price,category,image,sizes,stock,description) VALUES(?,?,?,?,?,?,?,?)',p)
    row=cur.execute('SELECT id FROM users WHERE email=?',(ADMIN_EMAIL,)).fetchone()
    if not row:
        cur.execute('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',('Administration',ADMIN_EMAIL,hash_password(ADMIN_PASSWORD),'admin'))
    con.commit(); con.close()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,fmt,*args): print('[MES ESSENTIELS]',fmt%args)
    def send_json(self,obj,status=200):
        data=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def body(self):
        try: return json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}')
        except: return {}
    def auth(self, admin=False):
        token=self.headers.get('Authorization','').replace('Bearer ','').strip()
        if not token: return None
        con=db(); row=con.execute('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?',(token,)).fetchone(); con.close()
        if not row or (admin and row['role']!='admin'): return None
        return dict(row)
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/config': return self.send_json({'whatsapp':WHATSAPP_NUMBER,'stripe_enabled':bool(STRIPE_PAYMENT_LINK)})
        if path=='/api/products':
            con=db(); rows=con.execute('SELECT * FROM products WHERE active=1 ORDER BY id').fetchall(); con.close(); return self.send_json([dict(r) for r in rows])
        if path=='/api/me':
            u=self.auth(); return self.send_json({'user': {k:u[k] for k in ('id','name','email','role')} if u else None})
        if path=='/api/admin/orders':
            if not self.auth(True): return self.send_json({'error':'Non autorisé'},401)
            con=db(); orders=[]
            for r in con.execute('SELECT * FROM orders ORDER BY id DESC').fetchall():
                o=dict(r); o['items']=[dict(x) for x in con.execute('SELECT * FROM order_items WHERE order_id=?',(r['id'],)).fetchall()]; orders.append(o)
            con.close(); return self.send_json(orders)
        if path=='/api/admin/products':
            if not self.auth(True): return self.send_json({'error':'Non autorisé'},401)
            con=db(); rows=con.execute('SELECT * FROM products ORDER BY id').fetchall(); con.close(); return self.send_json([dict(r) for r in rows])
        return super().do_GET()
    def do_POST(self):
        path=urlparse(self.path).path; b=self.body()
        if path=='/api/register':
            name=str(b.get('name','')).strip(); email=str(b.get('email','')).strip().lower(); password=str(b.get('password',''))
            if not name or '@' not in email or len(password)<6: return self.send_json({'error':'Nom, e-mail valide et mot de passe de 6 caractères minimum requis.'},400)
            con=db()
            try:
                cur=con.execute('INSERT INTO users(name,email,password) VALUES(?,?,?)',(name,email,hash_password(password))); uid=cur.lastrowid; token=secrets.token_urlsafe(32); con.execute('INSERT INTO sessions(token,user_id) VALUES(?,?)',(token,uid)); con.commit(); return self.send_json({'token':token,'user':{'id':uid,'name':name,'email':email,'role':'customer'}},201)
            except sqlite3.IntegrityError: return self.send_json({'error':'Un compte existe déjà avec cet e-mail.'},409)
            finally: con.close()
        if path=='/api/login':
            email=str(b.get('email','')).strip().lower(); password=str(b.get('password','')); con=db(); u=con.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
            if not u or not verify_password(password,u['password']): con.close(); return self.send_json({'error':'Identifiants incorrects.'},401)
            token=secrets.token_urlsafe(32); con.execute('INSERT INTO sessions(token,user_id) VALUES(?,?)',(token,u['id'])); con.commit(); con.close(); return self.send_json({'token':token,'user':{'id':u['id'],'name':u['name'],'email':u['email'],'role':u['role']}})
        if path=='/api/logout':
            token=self.headers.get('Authorization','').replace('Bearer ','').strip(); con=db(); con.execute('DELETE FROM sessions WHERE token=?',(token,)); con.commit(); con.close(); return self.send_json({'ok':True})
        if path=='/api/orders':
            items=b.get('items') or []; fields=['customer_name','email','phone','address','city','postal_code','payment_method']
            if not items or any(not str(b.get(f,'')).strip() for f in fields): return self.send_json({'error':'Informations de livraison et panier requis.'},400)
            con=db(); total=0; prepared=[]
            try:
                con.execute('BEGIN IMMEDIATE')
                for x in items:
                    p=con.execute('SELECT * FROM products WHERE id=? AND active=1',(int(x.get('id',0)),)).fetchone(); qty=max(1,int(x.get('qty',1))); size=str(x.get('size','Unique'))
                    if not p: raise ValueError('Produit introuvable.')
                    if p['stock']<qty: raise ValueError(f"Stock insuffisant pour {p['name']}.")
                    if size not in p['sizes'].split(','): raise ValueError(f"Taille invalide pour {p['name']}.")
                    total += p['price']*qty; prepared.append((p,qty,size))
                u=self.auth(); cur=con.execute('INSERT INTO orders(user_id,customer_name,email,phone,address,city,postal_code,payment_method,total) VALUES(?,?,?,?,?,?,?,?,?)',((u or {}).get('id'),*[str(b[f]).strip() for f in fields],round(total,2))); oid=cur.lastrowid
                for p,qty,size in prepared:
                    con.execute('INSERT INTO order_items(order_id,product_id,name,size,qty,unit_price) VALUES(?,?,?,?,?,?)',(oid,p['id'],p['name'],size,qty,p['price'])); con.execute('UPDATE products SET stock=stock-? WHERE id=?',(qty,p['id']))
                con.commit();
                payment_url=STRIPE_PAYMENT_LINK if b['payment_method']=='stripe' and STRIPE_PAYMENT_LINK else None
                return self.send_json({'ok':True,'order_id':oid,'total':round(total,2),'payment_url':payment_url},201)
            except ValueError as e: con.rollback(); return self.send_json({'error':str(e)},400)
            finally: con.close()
        if path=='/api/admin/products':
            if not self.auth(True): return self.send_json({'error':'Non autorisé'},401)
            try:
                name=str(b['name']).strip(); price=float(b['price']); category=str(b['category']).strip(); image=str(b.get('image','assets/prod1.jpg')).strip(); sizes=str(b.get('sizes','Unique')).strip(); stock=int(b.get('stock',0)); description=str(b.get('description','')).strip()
                if not name or price<0 or stock<0: raise ValueError
            except: return self.send_json({'error':'Données produit invalides.'},400)
            con=db(); cur=con.execute('INSERT INTO products(name,price,category,image,sizes,stock,description) VALUES(?,?,?,?,?,?,?)',(name,price,category,image,sizes,stock,description)); con.commit(); pid=cur.lastrowid; con.close(); return self.send_json({'ok':True,'id':pid},201)
        return self.send_json({'error':'Route introuvable'},404)
    def do_PUT(self):
        path=urlparse(self.path).path; b=self.body()
        if path.startswith('/api/admin/products/'):
            if not self.auth(True): return self.send_json({'error':'Non autorisé'},401)
            try: pid=int(path.rsplit('/',1)[1]); fields={k:b[k] for k in ['name','price','category','image','sizes','stock','description','active'] if k in b}
            except: return self.send_json({'error':'Requête invalide'},400)
            if not fields: return self.send_json({'error':'Aucune modification'},400)
            con=db(); con.execute('UPDATE products SET '+','.join(f'{k}=?' for k in fields)+' WHERE id=?',list(fields.values())+[pid]); con.commit(); con.close(); return self.send_json({'ok':True})
        if path.startswith('/api/admin/orders/'):
            if not self.auth(True): return self.send_json({'error':'Non autorisé'},401)
            try: oid=int(path.rsplit('/',1)[1]); status=str(b.get('status','')).strip()
            except: return self.send_json({'error':'Requête invalide'},400)
            if status not in ['nouvelle','confirmée','préparation','expédiée','livrée','annulée']: return self.send_json({'error':'Statut invalide'},400)
            con=db(); con.execute('UPDATE orders SET status=? WHERE id=?',(status,oid)); con.commit(); con.close(); return self.send_json({'ok':True})
        return self.send_json({'error':'Route introuvable'},404)

if __name__=='__main__':
    init_db(); port=int(os.environ.get('PORT','8000')); print(f'Mes Essentiels: http://localhost:{port}'); print(f'Admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD} (à changer via variables d’environnement)'); ThreadingHTTPServer(('0.0.0.0',port),Handler).serve_forever()
