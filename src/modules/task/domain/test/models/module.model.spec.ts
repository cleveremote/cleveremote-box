import { GPIODirection, GPIOEdge, ModuleStatus } from '@order/domain/interfaces/structure.interface';
import { ModuleModel } from '@order/domain/models/module.model';

describe('ModuleModel model', () => {
    it('Should create a new module Model', () => {
        //declare modules ///////////////
        const pump = new ModuleModel();
        pump.status = ModuleStatus.OFF;
        pump.portNum = 16;
        pump.direction = GPIODirection.OUT;
        pump.edge = GPIOEdge.BOTH;
        pump.configure();
        expect(pump.instance).toBeDefined();
        //mod1.debounceTimeout: number = undefined;
        //mod1.activeLow: boolean = false;
        //mod1.reconfigureDirection: boolean = true;
        expect(pump).toBeDefined();
        expect(pump.instance).toBeDefined();
    });

    it('Should create a new module Model & switch on wait 500 then switch off', () => {
        //declare modules ///////////////
        const pump = new ModuleModel();
        pump.status = ModuleStatus.OFF;
        pump.portNum = 16;
        pump.direction = GPIODirection.OUT;
        pump.edge = GPIOEdge.BOTH;
        pump.configure();
        pump.execute(1);
        expect(pump.status).toEqual(ModuleStatus.ON);
        let value = pump.instance.readSync();
        expect(value).toEqual(1);
        
        setTimeout(() => {
            pump.execute(0);
            expect(pump.status).toEqual(ModuleStatus.OFF);
            value = pump.instance.readSync();
            expect(value).toEqual(0);
            pump.instance.unexport();
        }, 5000);
    });
});
