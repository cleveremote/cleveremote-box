export class ScheduleModel {
    public id: string;
    public cycleId: string;
    public name: string;
    public description: string;
    public methode: () => void;
    public cron: { date?: Date; pattern: string };
}
