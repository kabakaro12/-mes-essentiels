let products=[], currentFilter='all', search='', cart=JSON.parse(localStorage.getItem('mesEssentielsCart')||'[]');
let token=localStorage.getItem('mesEssentielsToken')||'', currentUser=null, config={whatsapp:'',stripe_enabled:false};
const grid=document.querySelector('#productGrid'), cartEl=document.querySelector('#cart'), overlay=document.querySelector('#overlay');
const money=n=>`${Math.round(Number(n)||0).toLocaleString('fr-FR')} FG`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,opt={}){opt.headers={...(opt.headers||{}),'Content-Type':'application/json'};if(token)opt.headers.Authorization=`Bearer ${token}`;const r=await fetch('/api'+path,opt);const j=await r.json();if(!r.ok)throw Error(j.error||'Erreur');return j}
async function load(){try{[products,config]=await Promise.all([api('/products'),api('/config')]);renderProducts();renderCart();await loadMe()}catch(e){console.error(e);toast('Erreur de connexion au serveur')}}
function renderProducts(){
 const list=products.filter(p=>(currentFilter==='all'||p.category===currentFilter)&&p.name.toLowerCase().includes(search.toLowerCase()));
 grid.innerHTML=list.map(p=>`<article class="product" data-id="${p.id}"><div class="product-image"><img src="${esc(p.image)}" alt="${esc(p.name)}"><span class="pill">${p.stock>0?'EN STOCK':'ÉPUISÉ'}</span></div><div class="product-body"><h3>${esc(p.name)}</h3><p class="product-desc">${esc(p.description||'')}</p><div class="price">${money(p.price)}</div><small class="stock">Stock : ${p.stock}</small><div class="sizes">${String(p.sizes).split(',').map((s,i)=>`<button class="${i===0?'selected':''}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div><button class="add" ${p.stock<1?'disabled':''}>🛍 Ajouter au panier</button></div></article>`).join('')||'<p>Aucun produit trouvé.</p>';
 grid.querySelectorAll('.sizes button').forEach(b=>b.onclick=e=>{e.currentTarget.parentElement.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));e.currentTarget.classList.add('selected')});
 grid.querySelectorAll('.add').forEach(b=>b.onclick=e=>{const card=e.currentTarget.closest('.product'),id=+card.dataset.id,size=card.querySelector('.sizes .selected')?.dataset.size||'Unique';addToCart(id,size)});
}
function addToCart(id,size){const p=products.find(x=>x.id===id);const existing=cart.find(x=>x.id===id&&x.size===size);const qty=(existing?.qty||0)+1;if(qty>p.stock)return toast('Stock disponible insuffisant');if(existing)existing.qty++;else cart.push({id,size,qty:1});save();toast('Produit ajouté au panier')}
function save(){localStorage.setItem('mesEssentielsCart',JSON.stringify(cart));renderCart()}
function renderCart(){
 cart=cart.filter(x=>products.some(p=>p.id===x.id)); const count=cart.reduce((s,x)=>s+x.qty,0);document.querySelector('#cartCount').textContent=count; const host=document.querySelector('#cartItems');
 host.innerHTML=cart.length?cart.map((x,i)=>{const p=products.find(p=>p.id===x.id);return `<div class="cart-item"><img src="${esc(p.image)}" alt=""><div><h4>${esc(p.name)}</h4><small>Taille : ${esc(x.size)}</small><div class="qty"><button onclick="changeQty(${i},-1)">−</button><span>${x.qty}</span><button onclick="changeQty(${i},1)">+</button></div></div><div><b>${money(p.price*x.qty)}</b><button class="remove" onclick="removeItem(${i})">✕</button></div></div>`}).join(''):'<p>Votre panier est vide.</p>';
 document.querySelector('#cartTotal').textContent=money(cart.reduce((s,x)=>s+products.find(p=>p.id===x.id).price*x.qty,0));
}
window.changeQty=(i,d)=>{const p=products.find(x=>x.id===cart[i].id);if(d>0&&cart[i].qty>=p.stock)return toast('Stock maximum atteint');cart[i].qty+=d;if(cart[i].qty<=0)cart.splice(i,1);save()};window.removeItem=i=>{cart.splice(i,1);save()};
function openCart(){cartEl.classList.add('open');overlay.classList.add('show');cartEl.setAttribute('aria-hidden','false')}function closeCart(){cartEl.classList.remove('open');overlay.classList.remove('show');cartEl.setAttribute('aria-hidden','true')}
function toast(msg){const t=document.querySelector('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function makeModal(){document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="modalBackdrop"><div class="modal-card"><button class="modal-close" id="modalClose">✕</button><div id="modalContent"></div></div></div>`);document.querySelector('#modalClose').onclick=closeModal;document.querySelector('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()}}
function modal(html){document.querySelector('#modalContent').innerHTML=html;document.querySelector('#modalBackdrop').classList.add('show')}function closeModal(){document.querySelector('#modalBackdrop').classList.remove('show')}
async function loadMe(){if(!token)return updateAccountButton();try{const r=await api('/me');currentUser=r.user;if(!currentUser){token='';localStorage.removeItem('mesEssentielsToken')}}catch{token='';currentUser=null}updateAccountButton()}
function updateAccountButton(){const b=document.querySelector('#accountBtn');if(!b)return;b.textContent='👤';b.title=currentUser?(currentUser.role==='admin'?'Espace administrateur':`Mon compte — ${currentUser.name}`):'Mon compte';b.setAttribute('aria-label',b.title)}
function showAccount(message=''){
 if(currentUser){
   if(currentUser.role==='admin'){
     modal(`<p class="eyebrow dark">ADMINISTRATION</p>
       <h2>Bonjour ${esc(currentUser.name||'Administrateur')}</h2>
       <p>✉️ ${esc(currentUser.email||'admin@mesessentiels.com')}</p>
       <button id="goAdminBtn" class="btn gold full">Accéder à l’administration</button>
       <button id="changePwdBtn" class="btn ghost dark-text full">Modifier mon mot de passe</button>
       <button id="logoutBtn" class="btn ghost dark-text full">Se déconnecter</button>`);
     document.querySelector('#goAdminBtn').onclick=()=>{location.href='/admin.html'};
     document.querySelector('#changePwdBtn').onclick=showChangePassword;
     document.querySelector('#logoutBtn').onclick=async()=>{
       try{await api('/logout',{method:'POST'})}catch{}
       token='';currentUser=null;localStorage.removeItem('mesEssentielsToken');
       closeModal();updateAccountButton()
     };
     return;
   }
   const id=currentUser.phone?`📱 +${esc(currentUser.phone)}`:(currentUser.email?`✉️ ${esc(currentUser.email)}`:'');
   modal(`<p class="eyebrow dark">MON COMPTE</p><h2>Bonjour ${esc(currentUser.name)}</h2><p>${id}</p>
     ${currentUser.phone&&currentUser.email?`<p>✉️ ${esc(currentUser.email)}</p>`:''}
     <button id="changePwdBtn" class="btn ghost dark-text full">Modifier mon mot de passe</button>
     <button id="logoutBtn" class="btn gold full">Se déconnecter</button>`);
   document.querySelector('#changePwdBtn').onclick=showChangePassword;
   document.querySelector('#logoutBtn').onclick=async()=>{
     try{await api('/logout',{method:'POST'})}catch{}
     token='';currentUser=null;localStorage.removeItem('mesEssentielsToken');
     closeModal();updateAccountButton()
   };
   return;
 }
 modal(`<p class="eyebrow dark">MON COMPTE</p><h2>Connexion</h2>
   ${message?`<p class="form-msg" style="color:#8a6500">${esc(String(message))}</p>`:''}
   <form id="loginForm" class="modal-form">
     <input name="login" placeholder="Téléphone ou e-mail" required>
     <input name="password" type="password" placeholder="Mot de passe" required>
     <button class="btn gold">Se connecter</button>
   </form>
   <button id="forgotPassword" class="text-button" type="button">Mot de passe oublié ?</button>
   <div class="modal-sep">ou</div>
   <h3>Créer un compte</h3>
   <form id="registerForm" class="modal-form">
     <input name="name" placeholder="Nom complet" required>
     <input name="phone" inputmode="tel" placeholder="Numéro de téléphone (obligatoire)" required>
     <input name="email" type="email" placeholder="E-mail (facultatif)">
     <input name="password" type="password" minlength="6" placeholder="Mot de passe (6 caractères min.)" required>
     <button class="btn ghost dark-text">Créer mon compte</button>
   </form>
   <p id="authMsg" class="form-msg"></p>`);
 document.querySelector('#loginForm').onsubmit=e=>authSubmit(e,'/login');
 document.querySelector('#registerForm').onsubmit=e=>authSubmit(e,'/register');
 document.querySelector('#forgotPassword').onclick=showForgotPassword
}
async function authSubmit(e,path){e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));try{const r=await api(path,{method:'POST',body:JSON.stringify(data)});token=r.token;currentUser=r.user;localStorage.setItem('mesEssentielsToken',token);closeModal();updateAccountButton();toast(path==='/login'?'Connexion réussie':'Compte créé')}catch(err){document.querySelector('#authMsg').textContent=err.message}}
function showForgotPassword(){modal(`<p class="eyebrow dark">MOT DE PASSE OUBLIÉ</p><h2>Récupérer mon compte</h2><form id="forgotForm" class="modal-form"><input name="login" placeholder="Téléphone ou e-mail" required><button class="btn gold">Demander sur WhatsApp</button></form><p class="form-msg">La boutique vérifiera ton identité avant de réinitialiser le mot de passe.</p>`);document.querySelector('#forgotForm').onsubmit=e=>{e.preventDefault();const login=new FormData(e.currentTarget).get('login');const txt=`Bonjour Mes Essentiels, j’ai oublié mon mot de passe. Mon identifiant est : ${login}.`;window.open(`https://wa.me/${config.whatsapp}?text=${encodeURIComponent(txt)}`,'_blank')}}
function showChangePassword(){modal(`<p class="eyebrow dark">SÉCURITÉ</p><h2>Modifier mon mot de passe</h2><form id="changePasswordForm" class="modal-form"><input name="current_password" type="password" placeholder="Mot de passe actuel" required><input name="new_password" type="password" minlength="6" placeholder="Nouveau mot de passe" required><input name="confirm_password" type="password" minlength="6" placeholder="Confirmer le nouveau mot de passe" required><button class="btn gold">Enregistrer</button></form><p id="changePwdMsg" class="form-msg"></p>`);document.querySelector('#changePasswordForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));if(d.new_password!==d.confirm_password)return document.querySelector('#changePwdMsg').textContent='Les mots de passe ne correspondent pas.';try{await api('/change-password',{method:'POST',body:JSON.stringify(d)});toast('Mot de passe modifié');showAccount()}catch(err){document.querySelector('#changePwdMsg').textContent=err.message}}}
function showCheckout(){if(!cart.length)return toast('Votre panier est vide');if(currentUser&&currentUser.role==='admin'){toast('Le compte administrateur ne passe pas de commande client');setTimeout(()=>location.href='/admin.html',700);return}if(!currentUser){closeCart();showAccount('Vous devez créer un compte client ou vous connecter avant de commander.');return}closeCart();const defaultName=currentUser.name||'',defaultEmail=currentUser.email||'',defaultPhone=currentUser.phone?`+${currentUser.phone}`:'';modal(`<p class="eyebrow dark">FINALISER</p><h2>Votre commande</h2><p class="checkout-total">Total : <strong>${document.querySelector('#cartTotal').textContent}</strong></p><form id="checkoutForm" class="modal-form checkout-grid"><input name="customer_name" value="${esc(defaultName)}" placeholder="Nom complet" required><input name="phone" inputmode="tel" value="${esc(defaultPhone)}" placeholder="Téléphone" required><input name="email" type="email" value="${esc(defaultEmail)}" placeholder="E-mail (facultatif)"><input name="address" placeholder="Adresse" required><input name="postal_code" placeholder="Code postal (facultatif)"><input name="city" placeholder="Ville" required><select name="payment_method"><option value="livraison">Paiement à la livraison</option><option value="whatsapp">Commande WhatsApp</option></select><button class="btn gold full">Confirmer la commande</button></form><p id="checkoutMsg" class="form-msg"></p>`);document.querySelector('#checkoutForm').onsubmit=submitOrder}
async function submitOrder(e){e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));data.items=cart;try{const r=await api('/orders',{method:'POST',body:JSON.stringify(data)});const oldCart=[...cart];cart=[];save();await loadProducts();if(r.payment_url){location.href=r.payment_url;return}if(data.payment_method==='whatsapp'&&config.whatsapp){const lines=oldCart.map(x=>{const p=products.find(p=>p.id===x.id);return `${x.qty}x ${p?.name||'Produit'} (${x.size})`}).join('\n');window.open(`https://wa.me/${config.whatsapp}?text=${encodeURIComponent(`Bonjour, commande Mes Essentiels #${r.order_id}\n${lines}\nTotal: ${money(r.total)}`)}`,'_blank')}modal(`<p class="eyebrow dark">MERCI</p><h2>Commande #${r.order_id} enregistrée</h2><p>Montant : <strong>${money(r.total)}</strong></p><p>Nous avons bien enregistré votre commande. Son statut est maintenant visible dans l’administration.</p><button class="btn gold full" onclick="document.querySelector('#modalBackdrop').classList.remove('show')">Continuer mes achats</button>`)}catch(err){document.querySelector('#checkoutMsg').textContent=err.message}}
async function loadProducts(){products=await api('/products');renderProducts();renderCart()}

document.querySelector('#cartBtn').onclick=openCart;document.querySelector('#closeCart').onclick=closeCart;overlay.onclick=closeCart;document.querySelector('#clearCart').onclick=()=>{cart=[];save()};document.querySelector('#orderBtn').onclick=showCheckout;
document.querySelectorAll('#filters button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#filters button').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentFilter=b.dataset.filter;renderProducts()});
document.querySelectorAll('.category').forEach(a=>a.onclick=()=>{currentFilter=a.dataset.filter;document.querySelectorAll('#filters button').forEach(x=>x.classList.toggle('active',x.dataset.filter===currentFilter));renderProducts()});
document.querySelector('#searchInput').oninput=e=>{search=e.target.value;renderProducts()};document.querySelector('#searchBtn').onclick=()=>{document.querySelector('#searchInput').focus();location.hash='boutique'};
document.querySelector('#menuBtn').onclick=()=>document.querySelector('#nav').classList.toggle('open');document.querySelector('#newsletterForm').onsubmit=e=>{e.preventDefault();toast('Merci ! Inscription enregistrée pour la démo.');e.target.reset()};
const accountBtn=document.createElement('button');accountBtn.id='accountBtn';accountBtn.title='Mon compte';accountBtn.textContent='👤';accountBtn.onclick=()=>showAccount();document.querySelector('.actions').prepend(accountBtn);makeModal();load();

document.querySelectorAll('[data-open-cart]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (typeof openCart === 'function') {
      openCart();
    } else {
      const cart = document.getElementById('cart');
      const overlay = document.getElementById('overlay');
      if (cart) {
        cart.classList.add('open');
        cart.setAttribute('aria-hidden', 'false');
      }
      if (overlay) overlay.classList.add('show');
    }
    const nav = document.querySelector('.mobile-nav.open, .nav.open, .menu.open');
    if (nav) nav.classList.remove('open');
  });
});

function syncMenuCartCount() {
  const menuCount = document.getElementById('menuCartCount');
  if (!menuCount) return;
  const candidates = [
    document.getElementById('cartCount'),
    document.querySelector('.cart-count'),
    document.querySelector('[data-cart-count]')
  ];
  const source = candidates.find(Boolean);
  menuCount.textContent = source ? (source.textContent || '0') : '0';
}
setInterval(syncMenuCartCount, 500);
syncMenuCartCount();
