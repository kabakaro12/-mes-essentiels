const API='/api'; let token=localStorage.getItem('mesEssentielsAdminToken')||''; let productImageData='';
const $=s=>document.querySelector(s); const money=n=>`${Math.round(Number(n)||0).toLocaleString('fr-FR')} FG`;
async function req(path,opt={}){opt.headers={...(opt.headers||{}),'Content-Type':'application/json',Authorization:`Bearer ${token}`};const r=await fetch(API+path,opt);const j=await r.json();if(!r.ok)throw Error(j.error||'Erreur');return j}
function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function showDash(){ $('#loginPanel').classList.add('hidden');$('#dashboard').classList.remove('hidden');loadProducts();loadOrders();loadCustomersForPasswordAdmin();loadInvoices();}
$('#adminLogin').onsubmit=async e=>{e.preventDefault();try{const r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#aEmail').value,password:$('#aPassword').value})});const j=await r.json();if(!r.ok||j.user.role!=='admin')throw Error('Accès administrateur refusé.');token=j.token;localStorage.setItem('mesEssentielsAdminToken',token);showDash()}catch(err){$('#loginMsg').textContent=err.message}};

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tab').forEach(x=>x.classList.add('hidden'));$('#'+b.dataset.tab).classList.remove('hidden')});
$('#logoutAdmin').onclick=()=>{localStorage.removeItem('mesEssentielsAdminToken');token='';location.reload()};
if(token) req('/me').then(r=>{if(r.user?.role==='admin')showDash()}).catch(()=>{});

function compressImage(file){return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('Lecture de la photo impossible.'));
  reader.onload=()=>{
    const img=new Image();
    img.onerror=()=>reject(new Error('Format de photo non pris en charge. Essaie JPG ou PNG.'));
    img.onload=()=>{
      const max=900;let w=img.width,h=img.height;
      if(w>max||h>max){const k=Math.min(max/w,max/h);w=Math.max(1,Math.round(w*k));h=Math.max(1,Math.round(h*k))}
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
      let quality=.68;let data=canvas.toDataURL('image/jpeg',quality);
      while(data.length>1300000 && quality>.42){quality-=.08;data=canvas.toDataURL('image/jpeg',quality)}
      if(data.length>1800000) return reject(new Error('Photo encore trop lourde. Choisis une autre photo.'));
      resolve(data);
    };
    img.src=reader.result;
  };
  reader.readAsDataURL(file);
})}
async function handleProductImage(file){
  if(!file)return;
  $('#imageHelp').textContent='Préparation et compression de la photo…';
  try{
    productImageData=await compressImage(file);
    const preview=$('#productImagePreview');
    preview.src=productImageData;
    preview.classList.add('show');
    $('#imageHelp').textContent='✅ Photo prête. Tu peux ajouter le produit.';
  }catch(err){
    $('#imageHelp').textContent=err.message||'Impossible de lire cette photo.';
    productImageData='';
  }
}
$('#productImageLibrary').addEventListener('change',e=>handleProductImage(e.target.files?.[0]));
const priceInput=$('#productPrice');
function updatePricePreview(){const n=Math.max(0,Number(priceInput?.value||0));const el=$('#pricePreview');if(el)el.textContent='Prix affiché : '+money(n)}
priceInput?.addEventListener('input',updatePricePreview);updatePricePreview();

$('#productForm').onsubmit=async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const msg=$('#productMsg');
  msg.className='admin-msg';
  msg.textContent='';
  if(!productImageData){
    msg.classList.add('err');
    msg.textContent='Choisis une photo avant d’ajouter le produit.';
    return;
  }
  const d=Object.fromEntries(new FormData(form));
  d.price=+d.price;
  d.stock=+d.stock;
  d.image=productImageData;
  const btn=$('#addProductBtn');
  btn.disabled=true;
  btn.textContent='Ajout en cours…';
  try{
    await req('/admin/products',{method:'POST',body:JSON.stringify(d)});
    msg.classList.add('ok');
    msg.textContent='✅ Produit ajouté avec sa photo.';
    form.reset();
    updatePricePreview();
    form.querySelector('[name="sizes"]').value='S,M,L,XL';
    form.querySelector('[name="stock"]').value='5';
    productImageData='';
    $('#productImagePreview').src='';
    $('#productImagePreview').classList.remove('show');
    $('#imageHelp').textContent='Choisis une image déjà enregistrée dans ton iPhone.';
    loadProducts();
  }catch(err){
    msg.classList.add('err');
    msg.textContent=err.message||'Impossible d’ajouter le produit.';
  }finally{
    btn.disabled=false;
    btn.textContent='Ajouter le produit';
  }
};

async function loadProducts(){try{
  const ps=await req('/admin/products');
  const total=ps.reduce((a,p)=>a+(Number(p.stock)||0),0);
  const low=ps.filter(p=>Number(p.stock)<=3).length;
  const out=ps.filter(p=>Number(p.stock)<=0).length;
  const summary=$('#stockSummary');
  if(summary) summary.innerHTML=`<div class="stock-cards"><div><strong>${total}</strong><span>articles restants</span></div><div><strong>${ps.length}</strong><span>produits</span></div><div><strong>${low}</strong><span>stocks faibles ≤ 3</span></div><div><strong>${out}</strong><span>ruptures</span></div></div>`;
  $('#productsAdmin').innerHTML=`<table class="admin-table"><thead><tr><th>Photo</th><th>Produit</th><th>Prix</th><th>Stock restant</th><th>Actif</th></tr></thead><tbody>${ps.map(p=>`<tr><td><img class="product-thumb" src="${esc(p.image)}" alt=""></td><td>${esc(p.name)}</td><td>${money(p.price)}</td><td><div class="stock-cell"><b class="${Number(p.stock)<=3?'stock-low':''}">${p.stock} restant${Number(p.stock)>1?'s':''}</b><input type="number" min="0" value="${p.stock}" onchange="updateProduct(${p.id},'stock',+this.value)"></div></td><td><input type="checkbox" ${p.active?'checked':''} onchange="updateProduct(${p.id},'active',this.checked?1:0)"></td></tr>`).join('')}</tbody></table>`
}catch(e){console.error(e)}}
window.updateProduct=async(id,key,val)=>{await req('/admin/products/'+id,{method:'PUT',body:JSON.stringify({[key]:val})});loadProducts()};
let adminOrders=[];
async function loadOrders(){try{
  const os=await req('/admin/orders');adminOrders=os;
  $('#ordersAdmin').innerHTML=os.length?`<table class="admin-table"><thead><tr><th>#</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${os.map(o=>`<tr><td><b>#${o.id}</b><br><small>${esc(o.created_at)}</small></td><td><b>${esc(o.customer_name)}</b><br><small>${esc(o.email)}<br>${esc(o.phone)}</small></td><td>${money(o.total)}</td><td><select class="status-select" onchange="setPaymentStatus(${o.id},this.value)">${['non payé','payé','remboursé'].map(s=>`<option value="${s}" ${s===(o.payment_status||'non payé')?'selected':''}>${s}</option>`).join('')}</select><small>${esc(o.payment_method)}</small></td><td><select class="status-select" onchange="setStatus(${o.id},this.value)">${['nouvelle','confirmée','préparation','expédiée','livrée','annulée'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></td><td><div class="order-actions"><button class="mini-btn" onclick="viewOrder(${o.id})">Détails</button><button class="mini-btn gold-mini" onclick="printInvoice(${o.id})">Facture</button></div></td></tr>`).join('')}</tbody></table>`:'<p>Aucune commande.</p>';
  loadInvoices(os);
}catch(e){console.error(e)}}
window.setStatus=async(id,status)=>{await req('/admin/orders/'+id,{method:'PUT',body:JSON.stringify({status})});loadOrders()};
window.setPaymentStatus=async(id,payment_status)=>{await req('/admin/orders/'+id,{method:'PUT',body:JSON.stringify({payment_status})});loadOrders()};
window.viewOrder=id=>{
  const o=adminOrders.find(x=>Number(x.id)===Number(id));if(!o)return;
  $('#orderDetailContent').innerHTML=`<p class="eyebrow dark">COMMANDE #${o.id}</p><h2>${esc(o.customer_name)}</h2><p><b>Date :</b> ${esc(o.created_at)}<br><b>Téléphone :</b> ${esc(o.phone)}<br>${o.email?`<b>E-mail :</b> ${esc(o.email)}<br>`:''}<b>Adresse :</b> ${esc(o.address)}, ${esc(o.city)} ${esc(o.postal_code||'')}<br><b>Paiement :</b> ${esc(o.payment_method)} — ${esc(o.payment_status||'non payé')}<br><b>Statut :</b> ${esc(o.status)}</p><table class="order-items"><thead><tr><th>Article</th><th>Taille</th><th>Qté</th><th>Prix</th></tr></thead><tbody>${(o.items||[]).map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.size)}</td><td>${i.qty}</td><td>${money(i.unit_price*i.qty)}</td></tr>`).join('')}</tbody></table><div class="invoice-summary"><strong>Total : ${money(o.total)}</strong><button class="btn gold" onclick="printInvoice(${o.id})">Générer / imprimer la facture</button></div>`;
  $('#orderDetailModal').classList.add('show');$('#orderDetailModal').setAttribute('aria-hidden','false');
};
$('#closeOrderDetailModal')?.addEventListener('click',()=>{$('#orderDetailModal').classList.remove('show');$('#orderDetailModal').setAttribute('aria-hidden','true')});
function invoiceNumber(o){const year=String(o.created_at||new Date().getFullYear()).slice(0,4);return `FAC-${year}-${String(o.id).padStart(6,'0')}`}
function loadInvoices(orders=adminOrders){
  const host=$('#invoicesAdmin');if(!host)return;
  host.innerHTML=orders.length?`<table class="admin-table"><thead><tr><th>Facture</th><th>Client</th><th>Total</th><th>Paiement</th><th>Date</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr><td><b>${invoiceNumber(o)}</b></td><td>${esc(o.customer_name)}</td><td>${money(o.total)}</td><td><span class="${(o.payment_status||'non payé')==='payé'?'payment-paid':'payment-unpaid'}">${esc(o.payment_status||'non payé')}</span></td><td>${esc(o.created_at)}</td><td><button class="mini-btn gold-mini" onclick="printInvoice(${o.id})">Ouvrir</button></td></tr>`).join('')}</tbody></table>`:'<p>Aucune facture pour le moment.</p>';
}
window.printInvoice=id=>{
  const o=adminOrders.find(x=>Number(x.id)===Number(id));if(!o)return;
  const items=(o.items||[]).map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.size)}</td><td>${i.qty}</td><td>${money(i.unit_price)}</td><td>${money(i.unit_price*i.qty)}</td></tr>`).join('');
  const doc=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${invoiceNumber(o)}</title><style>body{font-family:Arial,sans-serif;color:#171717;margin:35px}header{display:flex;justify-content:space-between;border-bottom:3px solid #d4a63b;padding-bottom:20px;margin-bottom:25px}.brand{font-family:Georgia,serif;font-size:28px;font-weight:bold;color:#a87812}h1{margin:0;font-size:28px}.meta{line-height:1.6}.box{background:#f8f3ea;padding:16px;border-radius:10px;margin:18px 0}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}th{background:#111;color:#fff}.total{text-align:right;font-size:22px;font-weight:bold;margin-top:22px}.status{margin-top:8px;text-align:right}.actions{margin:30px 0;text-align:center}button{padding:12px 20px;background:#111;color:#efc85d;border:0;border-radius:7px;font-weight:bold}@media print{.actions{display:none}body{margin:15mm}}</style></head><body><header><div><div class="brand">ME — MES ESSENTIELS</div><div>Guinée<br>WhatsApp : +224 621 35 32 57</div></div><div><h1>FACTURE</h1><b>${invoiceNumber(o)}</b><br>${esc(o.created_at)}</div></header><div class="box"><b>Facturé à</b><br>${esc(o.customer_name)}<br>${esc(o.phone)}${o.email?'<br>'+esc(o.email):''}<br>${esc(o.address)}, ${esc(o.city)} ${esc(o.postal_code||'')}</div><table><thead><tr><th>Article</th><th>Taille</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr></thead><tbody>${items}</tbody></table><div class="total">TOTAL : ${money(o.total)}</div><div class="status">Paiement : <b>${esc(o.payment_status||'non payé')}</b> — Mode : ${esc(o.payment_method)}</div><div class="actions"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div></body></html>`;
  const w=window.open('','_blank');if(!w){alert('Autorise les fenêtres pop-up pour ouvrir la facture.');return}w.document.open();w.document.write(doc);w.document.close();
};
let selectedCustomerId=null;
async function loadCustomersForPasswordAdmin(){const host=$('#customersList');if(!host)return;try{const customers=await req('/admin/customers');host.innerHTML=customers.length?customers.map(c=>`<div class="admin-row"><div><strong>${esc(c.name||'Client')}</strong><span>${c.phone?'📱 +'+esc(c.phone):''}${c.email?'<br>✉️ '+esc(c.email):''}</span></div><button class="btn ghost reset-customer-password" data-id="${c.id}" data-label="${esc(c.name||c.email||'Client')}">Modifier le mot de passe</button></div>`).join(''):'<p>Aucun client enregistré.</p>';host.querySelectorAll('.reset-customer-password').forEach(btn=>btn.onclick=()=>{selectedCustomerId=btn.dataset.id;$('#clientPasswordLabel').textContent=`Client : ${btn.dataset.label}`;$('#newClientPassword').value='';$('#clientPasswordModal').classList.add('show');$('#clientPasswordModal').setAttribute('aria-hidden','false')})}catch{host.innerHTML='<p>Impossible de charger les clients.</p>'}}
$('#closeClientPasswordModal')?.addEventListener('click',()=>{$('#clientPasswordModal').classList.remove('show');$('#clientPasswordModal').setAttribute('aria-hidden','true')});
$('#saveClientPassword')?.addEventListener('click',async()=>{const password=$('#newClientPassword').value.trim();if(!selectedCustomerId)return;if(password.length<6){alert('Le mot de passe doit contenir au moins 6 caractères.');return}try{await req(`/admin/customers/${selectedCustomerId}/password`,{method:'POST',body:JSON.stringify({password})});alert('Mot de passe modifié avec succès.');$('#clientPasswordModal').classList.remove('show')}catch(e){alert(e.message)}});
