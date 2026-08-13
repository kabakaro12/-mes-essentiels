const API='/api'; let token=localStorage.getItem('mesEssentielsAdminToken')||'';
const $=s=>document.querySelector(s); const money=n=>`${Math.round(Number(n)||0).toLocaleString('fr-FR')} FG`;
async function req(path,opt={}){opt.headers={...(opt.headers||{}),'Content-Type':'application/json',Authorization:`Bearer ${token}`};const r=await fetch(API+path,opt);const j=await r.json();if(!r.ok)throw Error(j.error||'Erreur');return j}
function showDash(){ $('#loginPanel').classList.add('hidden');$('#dashboard').classList.remove('hidden');loadProducts();loadOrders();loadCustomersForPasswordAdmin();}
$('#adminLogin').onsubmit=async e=>{e.preventDefault();try{const r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#aEmail').value,password:$('#aPassword').value})});const j=await r.json();if(!r.ok||j.user.role!=='admin')throw Error('Accès administrateur refusé.');token=j.token;localStorage.setItem('mesEssentielsAdminToken',token);showDash()}catch(err){$('#loginMsg').textContent=err.message}};
async function loadProducts(){try{const ps=await req('/admin/products');$('#productsAdmin').innerHTML=`<table class="admin-table"><thead><tr><th>Produit</th><th>Prix</th><th>Stock</th><th>Actif</th></tr></thead><tbody>${ps.map(p=>`<tr><td>${p.name}</td><td>${money(p.price)}</td><td><input style="width:64px" type="number" min="0" value="${p.stock}" onchange="updateProduct(${p.id},'stock',+this.value)"></td><td><input type="checkbox" ${p.active?'checked':''} onchange="updateProduct(${p.id},'active',this.checked?1:0)"></td></tr>`).join('')}</tbody></table>`}catch(e){console.error(e)}}
window.updateProduct=async(id,key,val)=>{await req('/admin/products/'+id,{method:'PUT',body:JSON.stringify({[key]:val})});loadProducts()}
$('#productForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));d.price=+d.price;d.stock=+d.stock;await req('/admin/products',{method:'POST',body:JSON.stringify(d)});e.currentTarget.reset();loadProducts()};
async function loadOrders(){try{const os=await req('/admin/orders');$('#ordersAdmin').innerHTML=os.length?`<table class="admin-table"><thead><tr><th>#</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Date</th></tr></thead><tbody>${os.map(o=>`<tr><td>${o.id}</td><td><b>${o.customer_name}</b><br><small>${o.email}<br>${o.phone}</small></td><td>${money(o.total)}</td><td>${o.payment_method}</td><td><select class="status-select" onchange="setStatus(${o.id},this.value)">${['nouvelle','confirmée','préparation','expédiée','livrée','annulée'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></td><td>${o.created_at}</td></tr>`).join('')}</tbody></table>`:'<p>Aucune commande.</p>'}catch(e){console.error(e)}}
window.setStatus=async(id,status)=>{await req('/admin/orders/'+id,{method:'PUT',body:JSON.stringify({status})});loadOrders()};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tab').forEach(x=>x.classList.add('hidden'));$('#'+b.dataset.tab).classList.remove('hidden')});
$('#logoutAdmin').onclick=()=>{localStorage.removeItem('mesEssentielsAdminToken');token='';location.reload()};
if(token) req('/me').then(r=>{if(r.user?.role==='admin')showDash()}).catch(()=>{});

let selectedCustomerId = null;

async function loadCustomersForPasswordAdmin() {
  const host = document.getElementById('customersList');
  if (!host) return;
  try {
    const res = await fetch('/api/admin/customers', { headers:{Authorization:`Bearer ${token}`} });
    const data = await res.json();
    const customers = Array.isArray(data) ? data : (data.customers || data.users || []);
    host.innerHTML = customers.length ? customers.map(c => `
      <div class="admin-row">
        <div>
          <strong>${c.name || 'Client'}</strong>
          <span>${c.phone ? '📱 +'+c.phone : ''}${c.email ? '<br>✉️ '+c.email : ''}</span>
        </div>
        <button class="btn ghost reset-customer-password" data-id="${c.id}" data-label="${(c.name || c.email || 'Client').replace(/"/g,'&quot;')}">
          Modifier le mot de passe
        </button>
      </div>
    `).join('') : '<p>Aucun client enregistré.</p>';
    host.querySelectorAll('.reset-customer-password').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedCustomerId = btn.dataset.id;
        document.getElementById('clientPasswordLabel').textContent = `Client : ${btn.dataset.label}`;
        document.getElementById('newClientPassword').value = '';
        document.getElementById('clientPasswordModal').classList.add('show');
        document.getElementById('clientPasswordModal').setAttribute('aria-hidden','false');
      });
    });
  } catch (e) {
    host.innerHTML = '<p>Impossible de charger les clients.</p>';
  }
}

document.getElementById('closeClientPasswordModal')?.addEventListener('click', () => {
  document.getElementById('clientPasswordModal').classList.remove('show');
  document.getElementById('clientPasswordModal').setAttribute('aria-hidden','true');
});

document.getElementById('saveClientPassword')?.addEventListener('click', async () => {
  const password = document.getElementById('newClientPassword').value.trim();
  if (!selectedCustomerId) return;
  if (password.length < 6) {
    alert('Le mot de passe doit contenir au moins 6 caractères.');
    return;
  }
  const res = await fetch(`/api/admin/customers/${selectedCustomerId}/password`, {
    method: 'POST',
    headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`},
    body: JSON.stringify({password})
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Erreur lors de la modification du mot de passe.');
    return;
  }
  alert('Mot de passe modifié avec succès.');
  document.getElementById('clientPasswordModal').classList.remove('show');
  document.getElementById('clientPasswordModal').setAttribute('aria-hidden','true');
});

