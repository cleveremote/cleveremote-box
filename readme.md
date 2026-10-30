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