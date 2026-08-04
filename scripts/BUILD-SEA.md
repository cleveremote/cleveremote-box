# Génération de l'exécutable autonome (SEA)

`npm run build:sea` produit un exécutable Node.js autonome (aucune installation
de Node.js requise sur la machine cible) dans `release/<platform>-<arch>/`.

## Étapes

1. Se placer sur la machine correspondant à la plateforme cible (voir
   "Limite : pas de cross-compilation" ci-dessous).

2. Sélectionner la version de Node du projet :

   ```bash
   nvm use
   ```

3. S'assurer que les dépendances sont installées et que les modules natifs
   sont compilés pour cette machine :

   ```bash
   npm install
   ```

   (`npm run build:sea` vérifie automatiquement que les modules natifs se
   chargent correctement et relance `npm rebuild` si besoin — mais un
   `npm install` propre en amont évite les surprises.)

4. Lancer le build :

   ```bash
   npm run build:sea
   ```

5. Résultat dans `release/<platform>-<arch>/` :
   - `cleveremote-box` (ou `.exe` sous Windows) — l'exécutable
   - `node_modules/` — dépendances de production (y compris les binaires
     natifs : epoll, i2c-bus, bcrypt, serialport, etc.)
   - `.env` — copié depuis la racine du projet

## Déploiement

Copier **tout le dossier** `release/<platform>-<arch>/` (pas seulement le
binaire) sur la machine cible, puis :

```bash
cd cleveremote-box-linux-arm64   # ou le nom que vous avez donné au dossier copié
./cleveremote-box
```

Rien d'autre n'est nécessaire — pas de Node.js à installer sur la cible.

## Bluetooth : cap_net_admin

`BleService` a besoin de gérer l'interface `hci0` (l'arrêter/redémarrer) sans
tourner en root. Sans la capability Linux `cap_net_admin`, il échoue au
démarrage avec `Could not bring down hci0 interface: EPERM`.

Après chaque build (et après chaque déploiement sur une nouvelle machine),
appliquer la capability sur le binaire réel — pas sur `node` (le binaire nvm
de dev), mais sur l'exécutable généré lui-même, puisque c'est une copie du
binaire Node avec le script embarqué :

```bash
sudo setcap cap_net_admin=ep ./release/<platform>-<arch>/cleveremote-box
```

`npm run build:sea` affiche cette commande à la fin (avec le bon chemin) pour
ne pas l'oublier.

Points à retenir :
- **Effacée à chaque rebuild** : `npm run build:sea` régénère le binaire de
  zéro, donc la capability doit être réappliquée après chaque build.
- **Pas garantie de survivre à une copie** vers une autre machine (`scp`,
  `rsync` sans `-X`...) → la réappliquer directement sur la machine cible
  après déploiement, par sécurité.
- Vérifier avec :
  ```bash
  getcap ./release/<platform>-<arch>/cleveremote-box
  ```

## Limite : pas de cross-compilation

Ce script utilise le mécanisme natif **Node SEA** (`node --build-sea`), pas un
outil comme `pkg`. Concrètement :

- Le binaire produit **embarque le binaire Node exact de la machine qui a
  lancé le build** → il ne tourne que sur le même OS + architecture CPU.
- Les modules natifs (epoll, i2c-bus, bcrypt, pi-spi, hci-socket,
  `@serialport/bindings-cpp`) sont des fichiers `.node` compilés pour cette
  même machine → eux non plus ne sont pas portables d'une architecture à
  l'autre.

**Donc pour générer un exécutable pour une nouvelle plateforme (ex : un
Raspberry Pi 32 bits armv7, un serveur x64, macOS...), il faut lancer
`npm run build:sea` directement sur une machine de cette plateforme** (ou une
VM/conteneur qui matche exactement l'OS + l'architecture cible) — pas
possible de croiser depuis cette machine-ci.

Le script nomme automatiquement le dossier de sortie `release/<platform>-<arch>`
(ex : `linux-arm64`, `linux-x64`, `darwin-arm64`, `win32-x64`) pour éviter
d'écraser un build précédent d'une autre plateforme.

## Dépannage

- **Modules natifs qui échouent à charger** : le script tente un `npm
  rebuild` automatique. S'il échoue toujours, vérifier que les outils de
  compilation sont présents sur la machine (`python3`, `make`, `g++`).
- **Le binaire démarre mais ne produit aucune sortie puis se bloque** :
  vérifier que le fichier `.env` est bien présent à côté de l'exécutable
  (`ConfigModule` le cherche relativement au répertoire courant).
- **`NODE_ENV`** : le binaire force `NODE_ENV=production` par défaut (voir
  `scripts/sea-prelude.js`) pour éviter que `nestjs-pino` utilise le
  transport `pino-pretty`, qui passe par un worker thread — connu pour se
  bloquer silencieusement dans un binaire SEA.
