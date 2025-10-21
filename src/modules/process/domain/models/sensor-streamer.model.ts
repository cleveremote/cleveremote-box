import { SensorType } from '../interfaces/sensor.interface';
import { EventEmitter } from 'events';

export class SensorStreamer extends EventEmitter {
    public intervalId;
    public type: SensorType;
    public intervals = [];
    intervalMs: number;
    constructor() {
        super();
        this.intervalId = null;
        this.type = null;
    }

    start(intervalMs, sensorType) {
        if (this.intervalId) {
            console.log('Déjà en cours.');
            return;
        }

        this.type = sensorType;

        this.intervalId = setInterval(() => {
            this.emit('tick', this.type); // On utilise toujours les valeurs actuelles
        }, intervalMs);

        console.log(`Stream démarré toutes les ${intervalMs} ms avec x1=${sensorType}`);
    }

    _startInterval() {
        this.intervalId = setInterval(() => {
            this.emit('tick', this.type);
        }, this.intervalMs);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Stream arrêté.');
        } else {
            console.log('Aucun stream à arrêter.');
        }
    }

    updateParams(newX1, newIntervalMs = null) {
        this.type = newX1;
        if (newIntervalMs !== null && newIntervalMs !== this.intervalMs) {
            console.log(`Intervalle changé de ${this.intervalMs} ms à ${newIntervalMs} ms`);

            this.intervalMs = newIntervalMs;

            // Redémarrer avec le nouveau timing
            clearInterval(this.intervalId);
            this._startInterval();
        }

        console.log(`Paramètres mis à jour : x1=${newX1}`);
    }

    
}

