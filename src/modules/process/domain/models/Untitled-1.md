
ajouter un loader gerer ne jamais bloquer
dans le menu execution switch entre cycle et sensor casse le validateur value demande un numeric alors que c'est on/off
revoir l'ecran condition trops imbriqué il faut supprimer le nom des condition et laisser l'imbrication uniquement pour les cycles et les sequences.
ajouter ovveride duration dans le menu directement

masterdevice formulaire 
mettre l'adresse ip et le port dnas le meme chamsp avec un pattern
-configurer en DHCP ne plus afficher le port ip (garder en base) 
-alleger le formulaire on affiche la baudrate par defaud 9600 et timeout 2000ms discovery registre 0x4000 
-mettre un mecanisme de recuperation de l'ip via un scan et le faire a cahque fois que le bau et reactualisé 
-mettre en place les models à scanner. et un mecanisme d'application.
-positioner un endroit ou il faut mettre un boutton retirer des slaves àjouté.
-oublié de renseigné l'adress

formulaire sensors
-remonter en premier position si c'est child unit et scale et enabled
-problemeatique des sensors les parametre des sensors child ne remonte pa l'information du parent ...
les cron seront conditioné par le parent gérer le master_com type.

mecanisme pour ajout des slave. via qrcode.

creer les qr code pour les device + gzip + decompression + qrcode application +
comrequest les value pour les f11.03 ne fonctionne pas faire plus simple 




essayer de voir si chamsp deroulat bas le clavier cahche le champs
ajouter une reinitialisation du mode passe . 

cree une fonction dans configuration qui permet de scanner un master en parcourant les discoveryAddressRegister et de determiner quel type est le device et ajouter et appliquer le model pour creer l'enregistrement 