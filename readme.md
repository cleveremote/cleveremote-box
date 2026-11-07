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

Inverter : la consigne arrive en 0x2000, la marche et l'arrêt en 0x2001. La fréquence de sortie monte en rampe de 5 Hz/s. Le bloc de surveillance C00.xx est calculé à partir de cet état. Les écritures en EEPROM (adresse +0x1000) sont ramenées sur l'adresse de base.
IO 8CH : les sorties répondent à ON, OFF et toggle, ainsi qu'à la commande « toutes les sorties » et aux impulsions flashOn/flashOff. Les entrées recopient les sorties.
Capteurs (débitmètres, pression, EC, température/humidité) et AI 8CH : leurs valeurs varient dans des plages plausibles, aux adresses et formats de leurs register maps.
AO : pas de comportement dédié. Ce qui est écrit se relit.
Avant de tester avec le front :

Un SlaveTemplate du type simulé doit être synchronisé sur la box (l'inverter d'abord). Sans lui, le scan détecte le module mais ne crée pas de slave, et le log affiche no slave template for detected type.
Crée un Master TCP avec l'adresse 127.0.0.1 et le port 5020, puis lance le scan.
Pour remettre les équipements simulés « neufs », arrête la box et supprime simulator-state.json. J'ai ajouté ce fichier au .gitignore.
Fichiers touchés hors du module : app.module.ts (import du module), tsconfig.json (alias @simulator/*) et .gitignore.

Pour simuler un nouveau type plus tard, il suffit qu'il ait un registre de découverte dans DEVICE_KIND_SPECS et une register map. Pour des valeurs réalistes, on ajoute un profil dans measurement-profiles.ts ou un behavior dédié.
