import { BuildCycleRuns } from '@process/domain/utils/cycle-history.util';
import { RunOutcome } from '@process/domain/models/cycle-history.model';
import { ElementType, EventModel, EventSource, ProcessEventKind, StopReason } from '@process/domain/models/event.model';

function CreateEvent(elementId: string, minute: number, additionalData: object): EventModel {
    return {
        elementId, date: new Date(Date.UTC(2026, 0, 1, 6, minute)),
        elementType: elementId.startsWith('seq') ? ElementType.SEQUENCE : ElementType.CYCLE,
        additionalData: { type: 'SCHEDULE', ...additionalData }
    };
}

describe('BuildCycleRuns', () => {
    it('should group cycle and sequence events by run and summarize the run', () => {
        const origin = { source: EventSource.SCHEDULE, refName: 'Matin' };
        const runs = BuildCycleRuns([
            CreateEvent('cycle-1', 17, { kind: ProcessEventKind.CYCLE_ENDED, runId: 'r1', stop: { reason: StopReason.COMPLETED },
                realDuration: 900000, sequences: { run: ['Zone 1'], skipped: [], forced: [] } }),
            CreateEvent('seq-1', 2, { kind: ProcessEventKind.SEQUENCE_STARTED, runId: 'r1', cycleId: 'cycle-1' }),
            CreateEvent('cycle-1', 0, { kind: ProcessEventKind.CONFIRMATION_REQUESTED, runId: 'r1', name: 'Nord', origin,
                confirmation: { isRequested: true, conflicts: [] } }),
            CreateEvent('cycle-1', 2, { kind: ProcessEventKind.CYCLE_STARTED, runId: 'r1', origin, plannedDuration: 1500000,
                confirmation: { isRequested: true, conflicts: [], answer: 'FORCE', waitMs: 120000 } })
        ]);

        expect(runs).toHaveLength(1);
        const [run] = runs;
        expect(run).toEqual(expect.objectContaining({
            runId: 'r1', cycleId: 'cycle-1', name: 'Nord', origin, outcome: RunOutcome.ENDED,
            requestedAt: new Date(Date.UTC(2026, 0, 1, 6, 0)), startedAt: new Date(Date.UTC(2026, 0, 1, 6, 2)),
            plannedDuration: 1500000, realDuration: 900000, stop: { reason: StopReason.COMPLETED }
        }));
        expect(run.confirmation.answer).toEqual('FORCE');
        expect(run.timeline.map((x) => x.kind)).toEqual([
            ProcessEventKind.CONFIRMATION_REQUESTED, ProcessEventKind.CYCLE_STARTED,
            ProcessEventKind.SEQUENCE_STARTED, ProcessEventKind.CYCLE_ENDED
        ]);
    });

    it('should order runs of several cycles from the most recent, and ignore events without runId', () => {
        const runs = BuildCycleRuns([
            CreateEvent('cycle-1', 5, { kind: ProcessEventKind.START_REFUSED, runId: 'r1', conditions: ['cuve < 20'] }),
            CreateEvent('cycle-1', 1, { value: 'STOPPED', status: 'STOPPED' }),
            CreateEvent('cycle-2', 10, { kind: ProcessEventKind.CYCLE_STARTED, runId: 'r2' })
        ]);

        expect(runs.map((x) => [x.runId, x.cycleId, x.outcome])).toEqual([
            ['r2', 'cycle-2', RunOutcome.RUNNING], ['r1', 'cycle-1', RunOutcome.REFUSED]
        ]);
        expect(runs[1].conditions).toEqual(['cuve < 20']);
    });
});
