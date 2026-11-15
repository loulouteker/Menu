# 🥗 Menu de la semaine

Application web pour organiser ses repas : livre de recettes, planning sur 5 semaines,
liste de courses générée automatiquement et suivi du budget.
L'application est hébergée gratuitement sur **GitHub Pages** et tes données sont
enregistrées dans **ton OneDrive** (dossier `Applications`), donc identiques sur ton
ordinateur, ton téléphone et ta tablette.

---

## Mise en place (une seule fois, ~15 minutes)

### Étape 1 — Mettre l'application sur GitHub

1. Connecte-toi sur <https://github.com> (crée un compte gratuit si besoin).
2. Clique sur **+** (en haut à droite) › **New repository**.
   - *Repository name* : `menu-de-la-semaine`
   - Coche **Public** (obligatoire pour GitHub Pages gratuit — seul le code est public, tes recettes restent dans ton OneDrive).
   - Clique **Create repository**.
3. Sur la page du dépôt, clique sur le lien **uploading an existing file**.
4. Glisse **tout le contenu** du dossier décompressé (les fichiers `index.html`, `app.js`, `styles.css`,
   `config.js`, `onedrive.js`, `README.md` **et** le dossier `data`), puis clique **Commit changes**.
5. Va dans **Settings › Pages**. Sous *Branch*, choisis `main` et `/ (root)`, puis **Save**.
6. Après 1 à 2 minutes, ton adresse apparaît en haut de cette page, du type :
   `https://TON-PSEUDO.github.io/menu-de-la-semaine/`

👉 L'application fonctionne déjà à cette adresse (données gardées dans le navigateur).
Les étapes suivantes activent la synchronisation OneDrive.

### Étape 2 — Autoriser l'application à utiliser OneDrive (Microsoft Azure)

1. Va sur <https://portal.azure.com> et connecte-toi avec **le même compte Microsoft que ton OneDrive**
   (un compte personnel Outlook/Hotmail/Live fonctionne, c'est gratuit, aucune carte bancaire n'est demandée).
2. Dans la barre de recherche en haut, tape **Inscriptions d'applications** (*App registrations*) et ouvre-le.
3. Clique **+ Nouvelle inscription** :
   - *Nom* : `Menu de la semaine`
   - *Types de comptes pris en charge* : **Comptes dans un annuaire organisationnel et comptes Microsoft personnels**
   - *URI de redirection* : choisis **Application monopage (SPA)** et colle ton adresse GitHub Pages
     exactement, avec le `/` final : `https://TON-PSEUDO.github.io/menu-de-la-semaine/`
   - Clique **Inscrire**.
4. Sur la page qui s'affiche, copie l'**ID d'application (client)** (une suite du type `1a2b3c4d-…`).

> Les autorisations nécessaires (accès au seul dossier de l'application dans OneDrive) sont
> demandées automatiquement à la première connexion : rien d'autre à configurer.

### Étape 3 — Coller l'identifiant dans l'application

1. Sur GitHub, ouvre le fichier `config.js` dans ton dépôt et clique sur le crayon ✏️ (*Edit*).
2. Colle l'identifiant entre les guillemets :
   ```js
   clientId: "1a2b3c4d-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
   ```
3. Clique **Commit changes**. Attends une minute que le site se mette à jour.

### Étape 4 — Se connecter

Ouvre ton adresse GitHub Pages, clique sur le bouton **Se connecter** en haut à droite,
puis **Se connecter à OneDrive**. Accepte la demande d'autorisation de Microsoft.
Le voyant passe au vert (**OneDrive ✓**) : c'est prêt.

Sur ton téléphone, ouvre la même adresse et connecte-toi de la même façon. Astuce :
dans le menu du navigateur, « Ajouter à l'écran d'accueil » pour l'ouvrir comme une appli.

---

## Où sont mes données ?

Dans ton OneDrive : **Applications › Menu de la semaine › `menu-de-la-semaine.json`**.
Une copie est aussi gardée dans le navigateur pour fonctionner hors ligne ; elle est
renvoyée vers OneDrive dès que la connexion revient.
Le bouton de synchronisation (en haut à droite) permet aussi d'**exporter / importer**
une sauvegarde `.json` à tout moment.

## Utilisation

- **Planning** : bouton **+** dans un repas pour choisir une recette (et le nombre de portions) ou écrire un repas libre (« Restes », « Resto »…).
- **Recettes** : recherche par nom ou ingrédient, filtre par catégorie et 🌿 anti-inflammatoire, convertisseur de portions, ajout et modification.
- **Courses** : liste calculée à partir du planning de la semaine (quantités additionnées et ajustées aux portions), cases à cocher, articles supplémentaires, copier / imprimer.
- **Budget** : coût par jour, par semaine et par portion, à partir des prix saisis dans les recettes.

## En cas de souci

| Message | Solution |
|---|---|
| « redirect_uri … does not match » | L'URI de redirection dans Azure doit être identique à l'adresse du site, avec le `/` final, et de type **Application monopage (SPA)**. |
| « unauthorized_client » / compte refusé | Dans Azure › Authentification, vérifie que les **comptes Microsoft personnels** sont autorisés. |
| Voyant rouge « Hors ligne » | Pas de réseau : les modifications sont gardées et seront envoyées au retour de la connexion. |

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | L'application |
| `onedrive.js` | Connexion Microsoft et lecture/écriture OneDrive (sans dépendance externe) |
| `config.js` | Ton identifiant d'application Azure |
| `data/initial.json` | Les 16 recettes et listes (ingrédients, unités, catégories) importées de ton fichier Excel « Menu » |
