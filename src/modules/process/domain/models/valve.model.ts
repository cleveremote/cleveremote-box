export class ValveConfigModel {
    public id: string;
    public name: string;
    public description: string;
    public connectionId: string;
    public channel: number;
    public flowMeterId: string;
    public maxFlowRate: number = 100;
    public kP: number = 5;
    public minOpening: number = 0;
    public maxOpening: number = 100;
    public openingPercent: number = 0;
    public tolerance: number = 1;
    public maxIterations: number = 20;
    public iterationDelayMs: number = 500;
}
