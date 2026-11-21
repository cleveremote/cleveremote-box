import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'svgson';
import { BoxError, BoxErrorCode } from '@framework/errors/box-error';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleModel } from '@process/domain/models/cycle.model';
import { CycleType } from '@process/domain/interfaces/executable.interface';
import { SynopticRepository } from '@synoptic/infrastructure/repositories/synoptic.repository';
import {
    SvgNode, SynopticAssignmentModel, SynopticAssignmentPatchModel, SynopticAssignmentType, SynopticDeleteResultModel,
    SynopticElementModel, SynopticModel, SynopticSummaryModel, SynopticSynchronizeModel
} from '../models/synoptic.model';
import { ExtractSynopticElements, MergeSynopticElements } from '../utils/synoptic-elements.util';

// au-dela, le document Mongo (svgJson ~ 2 a 3 fois le SVG) approcherait la limite de 16 Mo
export const SYNOPTIC_MAX_SVG_BYTES = 5 * 1024 * 1024;

// cycles cibles par une affectation MODULE ; les autres types (CYCLE, GROUP) relevent d'une affectation CYCLE
export const SYNOPTIC_MODULE_CYCLE_TYPES: readonly CycleType[] = [CycleType.MODULE, CycleType.PROPORTIONAL];

const MONGO_DUPLICATE_KEY = 11000;

@Injectable()
export class SynopticService {
    private readonly _logger = new Logger(SynopticService.name);

    public constructor(
        private synopticRepository: SynopticRepository,
        private sensorRepository: SensorRepository,
        private cycleRepository: CycleRepository
    ) { }

    public list(): Promise<SynopticSummaryModel[]> {
        return this.synopticRepository.findAllSummaries();
    }

    public async get(id: string): Promise<SynopticModel> {
        const synoptic = await this.synopticRepository.findById(id);
        if (!synoptic) {
            throw new BoxError(`synoptic ${id} not found`, BoxErrorCode.SYNOPTIC_NOT_FOUND, { synopticId: id });
        }
        return synoptic;
    }

    // sans _id : creation (name + svg requis, verifies par le DTO) ; avec _id : mise a jour partielle
    public synchronize(input: SynopticSynchronizeModel): Promise<SynopticModel> {
        return input._id ? this._update(input._id, input) : this._create(input);
    }

    public async delete(id: string): Promise<SynopticDeleteResultModel> {
        const isDeleted = await this._persist(() => this.synopticRepository.delete(id));
        if (!isDeleted) {
            throw new BoxError(`synoptic ${id} not found`, BoxErrorCode.SYNOPTIC_NOT_FOUND, { synopticId: id });
        }
        await this._persist(() => this.synopticRepository.clearSynopticTargets(id));
        return { _id: id, isDeleted: true };
    }

    private async _create(input: SynopticSynchronizeModel): Promise<SynopticModel> {
        const name = input.name.trim();
        await this._assertNameAvailable(name);
        const svgJson = await this._convertSvg(input.svg);
        const elements = ExtractSynopticElements(svgJson);
        // affectations envoyees avec la creation : cible SYNOPTIC vers lui-meme impossible (pas encore d'_id)
        await this._applyAssignments(elements, input.assignments);
        return this._persist(() => this.synopticRepository.create({ name, description: input.description, svgJson, elements }), name);
    }

    private async _update(id: string, input: SynopticSynchronizeModel): Promise<SynopticModel> {
        const current = await this.get(id);
        const name = input.name?.trim();
        if (name && name.toLowerCase() !== current.name.toLowerCase()) {
            await this._assertNameAvailable(name);
        }
        let svgJson: SvgNode | undefined;
        let elements = current.elements;
        if (input.svg !== undefined) {
            svgJson = await this._convertSvg(input.svg);
            elements = MergeSynopticElements(ExtractSynopticElements(svgJson), current.elements);
        }
        elements = { ...elements };
        await this._applyAssignments(elements, input.assignments, id);
        const updated = await this._persist(
            () => this.synopticRepository.update(id, { name, description: input.description, svgJson, elements }), name
        );
        if (!updated) {
            throw new BoxError(`synoptic ${id} not found`, BoxErrorCode.SYNOPTIC_NOT_FOUND, { synopticId: id });
        }
        return updated;
    }

    private async _convertSvg(svg: string): Promise<SvgNode> {
        const size = Buffer.byteLength(svg ?? '', 'utf8');
        if (size > SYNOPTIC_MAX_SVG_BYTES) {
            throw new BoxError(`svg too large (${size} bytes)`, BoxErrorCode.SYNOPTIC_SVG_TOO_LARGE, { size, max: SYNOPTIC_MAX_SVG_BYTES });
        }
        let svgJson: SvgNode;
        try {
            svgJson = (await parse(svg)) as SvgNode;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new BoxError(`svg conversion failed: ${reason}`, BoxErrorCode.SYNOPTIC_SVG_INVALID, { reason });
        }
        if (svgJson?.name !== 'svg') {
            throw new BoxError(`unexpected root element ${svgJson?.name}`, BoxErrorCode.SYNOPTIC_SVG_INVALID, { reason: 'root <svg> missing' });
        }
        return svgJson;
    }

    private async _assertNameAvailable(name: string): Promise<void> {
        if (await this.synopticRepository.findIdByName(name)) {
            throw new BoxError(`synoptic name ${name} already used`, BoxErrorCode.SYNOPTIC_NAME_ALREADY_USED, { name });
        }
    }

    private async _applyAssignments(
        elements: Record<string, SynopticElementModel>,
        patches: SynopticAssignmentPatchModel[] = [],
        selfId?: string
    ): Promise<void> {
        for (const patch of patches) {
            const element = elements[patch.key];
            if (!element) {
                throw new BoxError(`element ${patch.key} not found`, BoxErrorCode.SYNOPTIC_ELEMENT_NOT_FOUND, { key: patch.key });
            }
            if (patch.assignment) {
                await this._assertTargetExists(patch.assignment, selfId);
            }
            elements[patch.key] = {
                ...element,
                assignment: patch.assignment ? { type: patch.assignment.type, targetId: patch.assignment.targetId } : null
            };
        }
    }

    private async _assertTargetExists(assignment: SynopticAssignmentModel, selfId?: string): Promise<void> {
        const { type, targetId } = assignment;
        let isFound: boolean;
        switch (type) {
            case SynopticAssignmentType.SENSOR:
                isFound = !!(await this.sensorRepository.get(targetId));
                break;
            // CYCLE et MODULE ciblent tous deux un cycle, distingues par son type
            case SynopticAssignmentType.CYCLE:
            case SynopticAssignmentType.MODULE: {
                const cycle = await this.cycleRepository.get(targetId) as CycleModel | null;
                isFound = !!cycle && SYNOPTIC_MODULE_CYCLE_TYPES.includes(cycle.type) === (type === SynopticAssignmentType.MODULE);
                break;
            }
            case SynopticAssignmentType.SYNOPTIC:
                isFound = targetId !== selfId && await this.synopticRepository.exists(targetId);
                break;
            default:
                isFound = false;
        }
        if (!isFound) {
            throw new BoxError(`${type} ${targetId} not found`, BoxErrorCode.SYNOPTIC_TARGET_NOT_FOUND, { type, targetId });
        }
    }

    // erreurs Mongo : nom en double (index unique, cas concurrent) ou echec d'ecriture generique
    private async _persist<T>(write: () => Promise<T>, name?: string): Promise<T> {
        try {
            return await write();
        } catch (error) {
            if (error instanceof BoxError) { throw error; }
            if ((error as { code?: number })?.code === MONGO_DUPLICATE_KEY) {
                throw new BoxError(`synoptic name ${name} already used`, BoxErrorCode.SYNOPTIC_NAME_ALREADY_USED, { name });
            }
            this._logger.error({ err: error }, 'synoptic persistence failed');
            throw new BoxError(`synoptic persistence failed: ${(error as Error)?.message}`, BoxErrorCode.SYNOPTIC_SAVE_FAILED);
        }
    }
}
