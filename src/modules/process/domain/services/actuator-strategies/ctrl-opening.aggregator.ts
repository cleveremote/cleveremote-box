import { Observable, Subject } from 'rxjs';
import { ControlResult } from '@control/domain/models/control.model';
import { ActuatorModel } from '../../models/actuator.model';
import { ControlValueMode } from '../../models/event.model';
import { ActuatorValueChange } from './actuator-strategy.interface';

// suivi (FOLLOW) : un mouvement est termine apres FOLLOW_IDLE_PERIODS periodes de lecture sans ecriture (au moins
// FOLLOW_IDLE_MIN_MS) : la mesure suivie est stable
const FOLLOW_IDLE_MIN_MS = 5000;
const FOLLOW_IDLE_PERIODS = 3;

// variation en cours d'agregation (une par vanne) : de la premiere a la derniere ecriture
type OpeningEpisode = {
    actuator: ActuatorModel;
    mode: ControlValueMode;
    startedAt: Date;
    previousValue?: number;
    value?: number;
    min?: number;
    max?: number;
    steps: number;
    lastWriteAt?: Date;
    timer?: NodeJS.Timeout;
};

const RoundOpening = (openingPercent: number): number => Math.round(openingPercent * 10) / 10;

/**
 * Agrege les ecritures d'ouverture d'une vanne CTRL en variations (CtrlActuatorStrategy) : un positionnement, une
 * regulation (track autour de la boucle), un mouvement suivi (FOLLOW : termine apres un delai sans ecriture).
 * Une variation est publiee a sa fin (valueChanged$) si l'ouverture finale differe de celle d'avant.
 */
export class CtrlOpeningAggregator {

    // derniere ouverture commandee par vanne (arrondie au dixieme) : l'ActuatorModel est relu a chaque ordre,
    // son openingPercent ne garde pas la commande d'un ordre a l'autre
    private readonly _lastOpenings = new Map<string, number>();
    private readonly _episodes = new Map<string, OpeningEpisode>();
    // vannes en suivi : delai sans ecriture qui termine un mouvement
    private readonly _followIdleMs = new Map<string, number>();
    private readonly _valueChanged = new Subject<ActuatorValueChange>();
    public readonly valueChanged$: Observable<ActuatorValueChange> = this._valueChanged.asObservable();

    public startFollow(actuatorId: string, iterationDelayMs: number): void {
        this._followIdleMs.set(actuatorId, Math.max(FOLLOW_IDLE_MIN_MS, FOLLOW_IDLE_PERIODS * iterationDelayMs));
    }

    // fin du suivi : son mouvement en cours est publie
    public stopFollow(actuatorId: string): void {
        if (this._followIdleMs.delete(actuatorId) && this._episodes.get(actuatorId)?.mode === ControlValueMode.FOLLOW) {
            this.end(actuatorId);
        }
    }

    // remise au repos de la vanne : variation en cours publiee, la position de repos n'en est pas une
    public forget(actuatorId: string): void {
        this.stopFollow(actuatorId);
        this.end(actuatorId);
        this._lastOpenings.delete(actuatorId);
    }

    // une variation de bout en bout : positionnement direct, regulation (son resultat complete la variation)
    public async track(actuator: ActuatorModel, mode: ControlValueMode, run: () => Promise<ControlResult | void>): Promise<void> {
        this.begin(actuator, mode);
        let result: ControlResult | void;
        try {
            result = await run();
        } finally {
            this.end(actuator._id, result || undefined);
        }
    }

    // nouvelle variation ; celle encore en cours sur la vanne est d'abord publiee
    public begin(actuator: ActuatorModel, mode: ControlValueMode): OpeningEpisode {
        this.end(actuator._id);
        const episode: OpeningEpisode = {
            actuator, mode, startedAt: new Date(), previousValue: this._lastOpenings.get(actuator._id), steps: 0
        };
        this._episodes.set(actuator._id, episode);
        return episode;
    }

    // ecriture rattachee a la variation en cours ; hors variation ouverte : debut d'un mouvement suivi (FOLLOW),
    // sinon positionnement isole publie aussitot
    public record(actuator: ActuatorModel, openingPercent: number): void {
        const value = RoundOpening(openingPercent);
        const followIdleMs = this._followIdleMs.get(actuator._id);
        const isStandalone = !this._episodes.has(actuator._id) && followIdleMs === undefined;
        const episode = this._episodes.get(actuator._id)
            ?? this.begin(actuator, isStandalone ? ControlValueMode.DIRECT : ControlValueMode.FOLLOW);
        this._lastOpenings.set(actuator._id, value);
        episode.value = value;
        episode.min = Math.min(episode.min ?? value, value);
        episode.max = Math.max(episode.max ?? value, value);
        episode.steps++;
        episode.lastWriteAt = new Date();
        if (isStandalone) {
            this.end(actuator._id);
        } else if (episode.mode === ControlValueMode.FOLLOW) {
            clearTimeout(episode.timer);
            episode.timer = setTimeout(() => this.end(actuator._id), followIdleMs);
            episode.timer.unref?.();
        }
    }

    // fin de variation (result : regulation) : publiee si l'ouverture finale differe de celle d'avant
    public end(actuatorId: string, result?: ControlResult): void {
        const episode = this._episodes.get(actuatorId);
        if (!episode) {
            return;
        }
        clearTimeout(episode.timer);
        this._episodes.delete(actuatorId);
        if (!episode.steps || episode.value === episode.previousValue) {
            return;
        }
        // suivi : fin a la derniere ecriture (pas a l'expiration du delai) ; regulation : a sa stabilisation
        const endedAt = episode.mode === ControlValueMode.FOLLOW ? episode.lastWriteAt : new Date();
        this._valueChanged.next({
            actuatorId, name: episode.actuator.name, mode: episode.mode,
            previousValue: episode.previousValue, value: episode.value, min: episode.min, max: episode.max, steps: episode.steps,
            startedAt: episode.startedAt, endedAt, durationMs: endedAt.getTime() - episode.startedAt.getTime(),
            ...(result && {
                setpoint: result.setpoint, measured: result.measured, isStabilized: result.isStabilized, iterations: result.iterations
            })
        });
    }

}
