import { DescribeProcessEvent, FormatDuration } from '@process/domain/utils/process-event-message.util';
import { ConfirmationAnswer, EventSource, ProcessEventKind, StopReason } from '@process/domain/models/event.model';
import { ProcessMode } from '@process/domain/interfaces/executable.interface';

describe('process-event-message.util', () => {
    describe('FormatDuration', () => {
        it.each([
            [45000, '45 s'],
            [133000, '2 min 13 s'],
            [900000, '15 min'],
            [3900000, '1 h 05 min'],
            [undefined, '?']
        ])('should format %s ms as %s', (ms, expected) => {
            expect(FormatDuration(ms)).toEqual(expected);
        });
    });

    describe('DescribeProcessEvent', () => {
        it('should describe a confirmed scheduled start that preempted another cycle', () => {
            expect(DescribeProcessEvent({
                type: ProcessMode.SCHEDULED, kind: ProcessEventKind.CYCLE_STARTED, name: 'Arrosage Nord',
                origin: { source: EventSource.SCHEDULE, refName: 'Matin 6h' },
                confirmation: { isRequested: false, conflicts: [], answer: ConfirmationAnswer.FORCE, waitMs: 133000 },
                preempted: ['Pompe Sud']
            })).toEqual('« Arrosage Nord » démarré par le planning « Matin 6h », confirmé (FORCE) après 2 min 13 s — « Pompe Sud » stoppé');
        });

        it('should describe a confirmation request with a lost conflict', () => {
            expect(DescribeProcessEvent({
                type: ProcessMode.TRIGGER, kind: ProcessEventKind.CONFIRMATION_REQUESTED, name: 'Arrosage Est',
                origin: { source: EventSource.TRIGGER, refName: 'Sol sec' },
                confirmation: { isRequested: false, conflicts: [{ cycleId: 'c', name: 'Pompe Sud', mode: ProcessMode.MANUAL, isWinning: false }] }
            })).toEqual('« Arrosage Est » en attente de confirmation (déclenché par le déclencheur « Sol sec »)' +
                ' — conflit perdu avec « Pompe Sud » (MANUAL)');
        });

        it('should describe a normal end with its summary', () => {
            expect(DescribeProcessEvent({
                type: ProcessMode.MANUAL, kind: ProcessEventKind.CYCLE_ENDED, name: 'Arrosage Nord',
                stop: { reason: StopReason.COMPLETED }, realDuration: 900000, plannedDuration: 1500000,
                sequences: { run: ['Zone 1', 'Zone 3'], skipped: ['Zone 2'], forced: [] }
            })).toEqual('« Arrosage Nord » terminé normalement après 15 min (prévu 25 min) — 2 séquences exécutées, 1 sautée');
        });

        it('should describe a push button start and a preemption stop', () => {
            expect(DescribeProcessEvent({
                type: ProcessMode.TRIGGER, kind: ProcessEventKind.CYCLE_STARTED, name: 'Vanne 3',
                origin: { source: EventSource.PUSH_BUTTON, refName: 'DO-3' }
            })).toEqual('« Vanne 3 » démarré par bouton poussoir (actionneur « DO-3 ») (sans confirmation)');
            expect(DescribeProcessEvent({
                type: ProcessMode.SYSTEM, kind: ProcessEventKind.CYCLE_ENDED, name: 'Pompe Sud',
                stop: { reason: StopReason.PREEMPTED, by: { source: EventSource.SCHEDULE, refName: 'Arrosage Nord' } }, realDuration: 242000
            })).toEqual('« Pompe Sud » arrêté : préempté par « Arrosage Nord » après 4 min 02 s');
        });

        it('should describe skipped sequences and refused starts with their conditions', () => {
            expect(DescribeProcessEvent({
                type: ProcessMode.MANUAL, kind: ProcessEventKind.SEQUENCE_SKIPPED, name: 'Zone 2', conditions: ['humidité > 60 (current : 72)']
            })).toEqual('Séquence « Zone 2 » sautée : conditions non vérifiées — humidité > 60 (current : 72)');
            expect(DescribeProcessEvent({
                type: ProcessMode.SCHEDULED, kind: ProcessEventKind.START_REFUSED, name: 'Arrosage Est',
                origin: { source: EventSource.SCHEDULE, refName: 'Soir' }, conditions: ['cuve < 20 (current : 12)']
            })).toEqual('« Arrosage Est » non démarré (déclenché par le planning « Soir ») : conditions non vérifiées — cuve < 20 (current : 12)');
        });

        it('should return an empty message for an event without kind', () => {
            expect(DescribeProcessEvent({ type: ProcessMode.MANUAL })).toEqual('');
        });
    });
});
