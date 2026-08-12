MES ESSENTIELS — E-COMMERCE (démo complète locale)

1. Démarrer le site
   python3 server.py
   Puis ouvrir http://localhost:8000

2. Administration
   http://localhost:8000/admin.html
   E-mail initial : admin@mesessentiels.com
   Mot de passe initial : ChangeMe2026!
   IMPORTANT : en production, définir ADMIN_EMAIL et ADMIN_PASSWORD dans les variables d'environnement.

3. Fonctionnalités
   - Catalogue connecté à SQLite
   - Filtres, tailles et stock
   - Panier persistant
   - Inscription / connexion client
   - Commande avec adresse de livraison
   - Enregistrement des commandes dans SQLite
   - Décrémentation du stock lors d'une commande
   - Back-office : ajout de produit, stock, activation et statut des commandes
   - Préparation Stripe : définir STRIPE_PAYMENT_LINK pour activer un lien de paiement après commande
   - WhatsApp : définir WHATSAPP_NUMBER (format international sans +) pour la commande WhatsApp

4. Variables utiles
   PORT=8000
   DB_PATH=/chemin/mes_essentiels.db
   ADMIN_EMAIL=...
   ADMIN_PASSWORD=...
   WHATSAPP_NUMBER=33600000000
   STRIPE_PAYMENT_LINK=https://buy.stripe.com/...

5. Production
   Cette version utilise uniquement Python standard + SQLite, pratique pour une première mise en ligne sur un VPS.
   Pour un vrai paiement automatisé par montant/commande, il faudra brancher l'API Stripe avec une clé secrète côté serveur et un webhook de confirmation.
