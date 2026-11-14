quand je veux supprimer un device slave non connécté ... gérer .
C'est implémenté : les paramètres de la vanne CTRL ne contiennent plus que le matériel, et la régulation passe par un module control séparé. npx tsc --noEmit passe sans erreur. Comme demandé, aucun test jest n'a été lancé, et je n'ai rien commité.

Ce qui change

Actionneur CTRL (actuator.model.ts) : il ne garde que les paramètres physiques (deviceId, actions, channel, minOpening, maxOpening, openingPercent, fullStrokeMs, valveType). J'ai fait le même nettoyage dans le schéma Mongo, le mapper et ValveConfigDTO. Dans ctrl-actuator.strategy.ts, set(actuator, %) positionne directement la vanne, sans boucle. La boucle setFlowRate et le faux débitmètre sont supprimés.
Nouveau module src/modules/control/ (alias @control/*), qui n'importe rien de process :
ControlLoopRunner exécute la boucle : lecture, calcul, écriture, attente.
Deux algorithmes : ProportionalController (même formule qu'avant) et PidController, qui sert pour PI et PID.
Le runner ne connaît qu'une interface ControlPlant (lire la mesure, écrire la sortie), sans savoir quel capteur ou actionneur se trouve derrière.
Entité ControlLoop (collection control_loops) : elle porte actuatorId, sensorId, l'algorithme, la consigne (setpoint), les gains et isEnabled. Le front la synchronise avec le nouveau message box/synchronize/control-loop.
regulation.service.ts relie la vanne et son capteur de retour au module control. Un capteur enfant est lu via la commande de son parent.
Branchement dans actuator.service.ts : quand on allume (execute(action ≠ 0)) un actionneur qui a une boucle active, on régule sur la consigne de la boucle. Sinon, on commande directement la stratégie. ExecutionService ne change pas.
Migration au démarrage, lancée en deuxième étape de InitService.initialize : pour chaque vanne CTRL qui a encore kP/flowMeterId, elle crée une ControlLoop P désactivée avec une consigne à 0, puis retire les anciens champs de l'actionneur. Elle peut être relancée sans risque.
À savoir

Changement cassant pour le front : ValveSynchronizeDTO n'accepte plus les champs de régulation. Ils passent maintenant par box/synchronize/control-loop.
Consignes à saisir : l'ancien code ne stockait aucune consigne, c'est pourquoi les boucles migrées sont désactivées. Il faut renseigner setpoint et passer isEnabled à vrai depuis le front pour que la régulation s'active.
Vanne sans boucle active : execute(mod, 1) l'ouvre maintenant à 1 %, alors que l'ancien code visait un débit de 1. Il faudra une boucle, ou une valeur d'action réelle dans la séquence.
Pas de suppression en cascade : supprimer un actionneur ne supprime pas sa boucle. Je peux l'ajouter si tu veux.
Specs
J'ai adapté les specs juste assez pour qu'elles compilent :

Le nouvel argument de constructeur est ajouté dans les specs ActuatorService, InitService et SynchronizeService.
Dans ctrl-actuator.strategy.spec.ts, les tests de setFlowRate sont remplacés par des tests de set et positioningDelayMs.
Comme rien n'a été lancé, je ne sais pas si les specs passent. Celle de InitService, qui vérifie l'ordre des étapes de démarrage, va probablement échouer à cause de la nouvelle étape de migration.


ho wt o simultaeur de device:
Le module src/modules/simulator est en place. Il ouvre une passerelle Modbus TCP locale et simule derrière tout type d'équipement détectable. Tu choisis les types simulés par variable d'environnement. Le scan d'un Master TCP qui vise cette passerelle détecte les équipements, les réadresse et les ajoute aux slaves comme du matériel réel. Je n'ai rien modifié dans register-map, le scan ou l'auto-création.

Vérifications :

tsc --noEmit et eslint passent sur les nouveaux fichiers.
J'ai écrit deux scripts de test jetables dans le scratchpad. Ils démarrent le simulateur sans Nest ni Mongo et l'interrogent avec un vrai client modbus-serial. Tout passe :
détection sur les adresses d'usine ;
silence total sur un unit id absent ;
réadressage 1 → 2 ;
marche, consigne et rampe de l'inverter ;
toggle 0x5500 sur l'IO ;
valeurs plausibles des capteurs ;
KIND:2 (le deuxième module apparaît dès que le premier est réadressé) ;
rechargement de l'état au redémarrage.
Je n'ai pas lancé la box complète ni fait de scan depuis le front.
Configuration (dans .env.local, je n'ai pas touché à tes .env) :


SIMULATOR_ENABLED=true
SIMULATOR_DEVICES=INVERTER_VEICHI_SI23_V1          # ex: INVERTER_VEICHI_SI23_V1:2,DIGITAL_IO_8CH,TEMPERATURE_MOISTURE_V1
# optionnels : SIMULATOR_HOST=127.0.0.1  SIMULATOR_PORT=5020  SIMULATOR_STATE_FILE=simulator-state.json
Sans SIMULATOR_ENABLED=true, aucun port n'est ouvert. Un type inconnu ou non détectable, comme MODBUS_SLAVE, est ignoré avec un warning. Si le port est déjà pris, la box démarre quand même, sans simulateur.

Comportements simulés :

Inverter : la fréquence de sortie monte en rampe de 5 Hz/s. Le bloc de surveillance C00.xx est calculé à partir de l'état du variateur.
- Marche : par le bornier X1 (pressostat) si F00.02 = 1, sinon par 0x2001.
- Vitesse : multi-vitesse F12.xx si un switch est fermé (X3 à X5, F02.02 à F02.04 = 16 à 18). Sinon F00.06 décide : 1 = RS485 (0x2000), 0 = PID simulé (F11.01 % de F00.09). La vitesse est bornée par F00.12 et F00.11.
- RAM et EEPROM : l'adresse de base est la RAM, l'adresse +0x1000 l'EEPROM. Une écriture EEPROM met à jour les deux. Au redémarrage du simulateur, la RAM reprend la valeur EEPROM, ou la valeur usine s'il n'y en a pas.
- Perte de liaison : si F13.07 = 1 et qu'aucune trame n'arrive pendant F13.06, le variateur passe en défaut E.CE et s'arrête. Le défaut s'efface avec 0x2001 = 7.
- Entrées X (C00.14, 0x210E) : on peut y écrire sur le simulateur pour simuler le pressostat et les switchs. Le bit 0 correspond à X1, le bit n à Xn+1. Exemple avec X1 (pressostat) et X4 (S2, manuel) fermés sur le variateur à l'adresse 2 :
  node -e "const M=require('modbus-serial');const c=new M();c.connectTCP('127.0.0.1',{port:5020}).then(()=>{c.setID(2);return c.writeRegister(0x210E,9)}).then(()=>c.close(()=>{}))"
  Écrire 1 rouvre S2 (X1 seul fermé), et 0 ouvre aussi le pressostat.

Variateur piloté par les séquences :
- Au scan, un SI23 crée l'élément INVERTER (collection inverters), les capteurs du monitoring (lus toutes les 5 s, dont c00_14 pour détecter le manuel) et les paramètres du variateur. Les champs concernés portent autoCreateType = inverter dans la register map, et leurs valeurs viennent du profil veichi-si23.profile.ts.
- Une séquence porte ses directives dans inverterDirectives : [{ inverterId, mode: 'RS485', frequency: 42 }] ou [{ inverterId, mode: 'PID', pidSetpoint: 50 }]. Les écritures se font en RAM. À la fin de la séquence, le variateur revient à son mode par défaut (PID) après releaseGraceMs.
- En manuel (S1 à S3 fermés) : une séquence avec directive est sautée, puis rattrapée au retour en auto. Une séquence en cours est arrêtée (raison INVERTER_MANUAL). Une séquence forcée tourne, mais sa directive est ignorée.
- Réglages de l'élément : message box/synchronize/inverter.
IO 8CH : les sorties répondent à ON, OFF et toggle, ainsi qu'à la commande « toutes les sorties » et aux impulsions flashOn/flashOff. Les entrées recopient les sorties.
Capteurs (débitmètres, pression, EC, température/humidité) et AI 8CH : leurs valeurs varient dans des plages plausibles, aux adresses et formats de leurs register maps.
AO : pas de comportement dédié. Ce qui est écrit se relit.
Avant de tester avec le front :

Un SlaveTemplate du type simulé doit être synchronisé sur la box (l'inverter d'abord). Sans lui, le scan détecte le module mais ne crée pas de slave, et le log affiche no slave template for detected type.
Crée un Master TCP avec l'adresse 127.0.0.1 et le port 5020, puis lance le scan.
Pour remettre les équipements simulés « neufs », arrête la box et supprime simulator-state.json. J'ai ajouté ce fichier au .gitignore.
Fichiers touchés hors du module : app.module.ts (import du module), tsconfig.json (alias @simulator/*) et .gitignore.

Pour simuler un nouveau type plus tard, il suffit qu'il ait un registre de découverte dans DEVICE_KIND_SPECS et une register map. Pour des valeurs réalistes, on ajoute un profil dans measurement-profiles.ts ou un behavior dédié.
/////


sequence pilotage variateur
Une séquence peut maintenant piloter le variateur, et une séquence est sautée quand le variateur est en manuel. Je n'ai pas lancé la box complète ni fait de scan depuis le front. tsc --noEmit passe et ESLint est propre sur les nouveaux fichiers. Deux scripts jetables passent aussi, l'un sur le variateur simulé, l'autre sur le service de pilotage avec des mocks. Aucun jest lancé, rien de commité.

Ce qui a été fait

Type d'autoCreate : dans le template SI23, les paramètres du document portent "autoCreateType": "inverter". Les champs du monitoring (c00_00, c00_01, c00_02, c00_08, c00_09, c00_14) portent "sensor". Sans type, le défaut reste sensor : les autres register maps ne changent pas.
Élément INVERTER : il a sa propre collection inverters. Au scan d'un SI23, l'auto-création crée l'élément, avec ses paramètres et ses commandes par rôle, plus les capteurs du monitoring lus toutes les 5 s. Les SI23 déjà en base sont rattrapés au démarrage.
Valeurs du document : elles sont dans veichi-si23.profile.ts. Elles ne sont réécrites en EEPROM que si l'appareil a une autre valeur.
Directive portée par la séquence : par exemple inverterDirectives: [{ inverterId, mode: 'RS485', frequency: 42 }], ou mode: 'PID' avec un pidSetpoint optionnel.
Au démarrage de la séquence : consigne puis mode, écrits en RAM et seulement s'ils changent.
En fin de séquence : retour au PID après 3 s. Ce délai évite un aller-retour PID → RS485 → PID entre deux séquences.
Deux cycles qui pilotent le même variateur passent par l'arbitrage des conflits existant.
Mode manuel : il est détecté par le capteur c00_14, après deux lectures identiques.
Une séquence avec directive est sautée, puis rattrapée au retour en auto.
Une séquence en cours est arrêtée, avec la nouvelle raison INVERTER_MANUAL.
Une séquence forcée tourne, mais sa directive n'est pas écrite.
Aucune écriture tant que le manuel dure.
Front : structure.inverters, le nouveau message box/synchronize/inverter (nom, mode par défaut, valeurs des paramètres), et les événements INVERTER_* dans le journal, en français, anglais et arabe.
Simulateur :
RAM et EEPROM séparées : un redémarrage ramène la RAM sur les valeurs EEPROM.
Marche par X1.
Vitesse choisie selon F00.06 ou les switchs, bornée par les limites.
Défaut E.CE.
Pressostat et switchs pilotables en écrivant 0x210E. La commande est dans le readme.md.
Points à connaître

42 Hz devient 40 Hz : avec F00.11 = 40 Hz, valeur du document, le variateur borne ta consigne. Si tu veux vraiment 42 Hz, il faut monter F00.11.
Écarts volontaires au document :
F13.07 vaut 0 en EEPROM et ne passe à 1 qu'en RS485.
F13.06 passe de 1 s à 10 s, pour couvrir la lecture toutes les 5 s puisqu'il n'y a plus de poller.
Variateur scanné à chaud : il est piloté tout de suite, mais ses capteurs ne sont lus qu'après un redémarrage de la box. C'est le comportement existant du scan. La détection du manuel ne marche donc qu'après ce redémarrage.
Baseline : elle n'est pas appliquée par InverterDeviceStrategy.init, mais au démarrage et à chaque modification de l'élément.
Specs : les specs touchées sont seulement adaptées pour compiler ; je ne sais pas si elles passent.
À vérifier sur le variateur réel :
l'ordre des bits X dans c00_14 (bits 2 à 4 pour X3 à X5) ;
que l'écriture sans +0x1000 va bien en RAM seulement ;
qu'une simple lecture suffit à réarmer le délai F13.06.