const API='/api'; let token=localStorage.getItem('mesEssentielsAdminToken')||''; let productImageData='';
const $=s=>document.querySelector(s); const money=n=>`${Math.round(Number(n)||0).toLocaleString('fr-FR')} FG`;
async function req(path,opt={}){opt.headers={...(opt.headers||{}),'Content-Type':'application/json',Authorization:`Bearer ${token}`};const r=await fetch(API+path,opt);const j=await r.json();if(!r.ok)throw Error(j.error||'Erreur');return j}
function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function showDash(){ $('#loginPanel').classList.add('hidden');$('#dashboard').classList.remove('hidden');loadProducts();loadOrders();loadCustomersForPasswordAdmin();}
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
async function loadOrders(){try{const os=await req('/admin/orders');$('#ordersAdmin').innerHTML=os.length?`<table class="admin-table"><thead><tr><th>#</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Date</th></tr></thead><tbody>${os.map(o=>`<tr><td>${o.id}</td><td><b>${esc(o.customer_name)}</b><br><small>${esc(o.email)}<br>${esc(o.phone)}</small></td><td>${money(o.total)}</td><td>${esc(o.payment_method)}</td><td><select class="status-select" onchange="setStatus(${o.id},this.value)">${['nouvelle','confirmée','préparation','expédiée','livrée','annulée'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></td><td>${esc(o.created_at)}</td></tr>`).join('')}</tbody></table>`:'<p>Aucune commande.</p>'}catch(e){console.error(e)}}
window.setStatus=async(id,status)=>{await req('/admin/orders/'+id,{method:'PUT',body:JSON.stringify({status})});loadOrders()};
let selectedCustomerId=null;
async function loadCustomersForPasswordAdmin(){const host=$('#customersList');if(!host)return;try{const customers=await req('/admin/customers');host.innerHTML=customers.length?customers.map(c=>`<div class="admin-row"><div><strong>${esc(c.name||'Client')}</strong><span>${c.phone?'📱 +'+esc(c.phone):''}${c.email?'<br>✉️ '+esc(c.email):''}</span></div><button class="btn ghost reset-customer-password" data-id="${c.id}" data-label="${esc(c.name||c.email||'Client')}">Modifier le mot de passe</button></div>`).join(''):'<p>Aucun client enregistré.</p>';host.querySelectorAll('.reset-customer-password').forEach(btn=>btn.onclick=()=>{selectedCustomerId=btn.dataset.id;$('#clientPasswordLabel').textContent=`Client : ${btn.dataset.label}`;$('#newClientPassword').value='';$('#clientPasswordModal').classList.add('show');$('#clientPasswordModal').setAttribute('aria-hidden','false')})}catch{host.innerHTML='<p>Impossible de charger les clients.</p>'}}
$('#closeClientPasswordModal')?.addEventListener('click',()=>{$('#clientPasswordModal').classList.remove('show');$('#clientPasswordModal').setAttribute('aria-hidden','true')});
$('#saveClientPassword')?.addEventListener('click',async()=>{const password=$('#newClientPassword').value.trim();if(!selectedCustomerId)return;if(password.length<6){alert('Le mot de passe doit contenir au moins 6 caractères.');return}try{await req(`/admin/customers/${selectedCustomerId}/password`,{method:'POST',body:JSON.stringify({password})});alert('Mot de passe modifié avec succès.');$('#clientPasswordModal').classList.remove('show')}catch(e){alert(e.message)}});
