import { IStructureRepository } from '@process/domain/interfaces/structure-repository.interface';
import { IActuatorModule } from '@process/domain/interfaces/actuator-module.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { ActuatorService } from '@process/domain/services/actuator.service';
import { RpiActuatorStrategy } from '@process/domain/services/actuator-strategies/rpi-actuator.strategy';
import { ComActuatorStrategy } from '@process/domain/services/actuator-strategies/com-actuator.strategy';
import { CreateStructure } from './structure.model.spec-mock';

export class StructureRepositorySpecMock implements IStructureRepository {

    private _structure: StructureModel;
    private _actuatorRegistry: Map<string, IActuatorModule>;

    public static async create(falsyType?: number): Promise<StructureRepositorySpecMock> {
        const mock = new StructureRepositorySpecMock();
        const { structure, actuatorRegistry } = await CreateStructure(falsyType);
        mock._structure = structure;
        mock._actuatorRegistry = actuatorRegistry;
        return mock;
    }

    public get structure(): StructureModel {
        return this._structure;
    }

    public get actuatorRegistry(): Map<string, IActuatorModule> {
        return this._actuatorRegistry;
    }

    // shape attendue par StructureService.getStructure()/StructureEntity.mapToModel : les
    // tableaux sont ecrases juste apres par les repositories dedies (cycle/sensor/...), seul
    // le fait d'avoir des arrays iterables ici compte.
    public get(): Promise<StructureModel> {
        return Promise.resolve(this._structure);
    }

    public getStructure(): Promise<StructureModel> {
        return Promise.resolve(this._structure);
    }

    public getCycles(): Promise<CycleModel[]> {
        return Promise.resolve(this._structure.cycles);
    }

    public getModules(): Promise<IActuatorModule[]> {
        const modules = this._structure.getModules(this._actuatorRegistry);
        return Promise.resolve(modules);
    }

    public getCycle(id: string): Promise<CycleModel> {
        const cycle = this._structure.cycles.find((x) => x._id === id);
        return Promise.resolve(cycle);
    }

    public getModule(name: string): Promise<IActuatorModule> {
        const module = this._structure.getModules(this._actuatorRegistry).find((x) => x.name === name);
        return Promise.resolve(module);
    }
    public saveStructure(structure: StructureModel): Promise<StructureModel> {
        return Promise.resolve(structure);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getSequence(_id: string): Promise<SequenceModel> {
        throw new Error('Method not implemented.');
    }
}

export function createLoggerMock(): any {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// construit une StructureService branchee sur StructureRepositorySpecMock : les autres
// repositories (sensor/modbus/inverter) sont vides par defaut dans CreateStructure(),
// seuls cycleRepository et structureRepository renvoient des donnees exploitees par les tests.
export async function createStructureServiceDeps(falsyType?: number): Promise<{
    structureService: StructureService;
    structureRepository: StructureRepositorySpecMock;
    actuatorRegistry: Map<string, IActuatorModule>;
    cycleRepository: any;
    logger: any;
}> {
    const structureRepository = await StructureRepositorySpecMock.create(falsyType);
    const structure = structureRepository.structure;
    const cycleRepository = { get: jest.fn().mockResolvedValue(structure.cycles) };
    const sensorRepository = { get: jest.fn().mockResolvedValue(structure.sensors) };
    const deviceRepository = { get: jest.fn().mockResolvedValue(structure.devices) };
    const modbusTaskRepository = { get: jest.fn().mockResolvedValue(structure.modbusTasks) };
    const valueRepository = {
        getValues: jest.fn().mockResolvedValue([]),
        getLastValue: jest.fn().mockResolvedValue(null),
        getData: jest.fn().mockResolvedValue([])
    };
    const actuatorRepository = { get: jest.fn().mockResolvedValue(structure.actuators ?? []) };
    const logger = createLoggerMock();

    const structureService = new StructureService(
        cycleRepository as any,
        sensorRepository as any,
        deviceRepository as any,
        modbusTaskRepository as any,
        valueRepository as any,
        actuatorRepository as any
    );

    return { structureService, structureRepository, actuatorRegistry: structureRepository.actuatorRegistry, cycleRepository, logger };
}

// ActuatorService reel, branche sur le actuatorRegistry construit par CreateStructure() : suffisant
// pour les tests d'execution qui resolvent des ActuatorModel (type RPI) deja configures (fake GPIO).
export function createActuatorServiceMock(actuatorRegistry: Map<string, IActuatorModule>): ActuatorService {
    const actuatorRepository = { findByIds: (ids: string[]) => Promise.resolve(ids.map((id) => actuatorRegistry.get(id)).filter(Boolean)) };
    const strategies = [new RpiActuatorStrategy(createLoggerMock() as never), new ComActuatorStrategy(undefined as never, undefined as never)];
    return new ActuatorService(createLoggerMock() as never, actuatorRepository as any, strategies as any);
}