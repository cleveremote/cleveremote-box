import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    SynopticAssignmentType, SynopticElementModel, SynopticModel, SynopticSummaryModel
} from '@synoptic/domain/models/synoptic.model';
import { Synoptic, SynopticDocument, SYNOPTIC_NAME_COLLATION } from '../schemas/synoptic.schema';

// lectures en lean : la Map `elements` revient en objet simple, svgJson tel que stocke
type SynopticLean = Omit<Synoptic, 'elements'> & { elements?: Record<string, SynopticElementModel>; createdAt?: Date; updatedAt?: Date };

export type SynopticUpdate = Partial<Pick<SynopticModel, 'name' | 'description' | 'svgJson' | 'elements'>>;

@Injectable()
export class SynopticRepository {

    public constructor(@InjectModel(Synoptic.name) private synopticModel: Model<SynopticDocument>) { }

    private static _toModel(doc: SynopticLean): SynopticModel {
        const model = new SynopticModel();
        model._id = doc._id;
        model.name = doc.name;
        model.description = doc.description;
        model.svgJson = doc.svgJson;
        model.elements = doc.elements ?? {};
        model.createdAt = doc.createdAt;
        model.updatedAt = doc.updatedAt;
        return model;
    }

    private static _toSummary(doc: SynopticLean): SynopticSummaryModel {
        const summary = new SynopticSummaryModel();
        summary._id = doc._id;
        summary.name = doc.name;
        summary.description = doc.description;
        summary.elementCount = Object.keys(doc.elements ?? {}).length;
        summary.createdAt = doc.createdAt;
        summary.updatedAt = doc.updatedAt;
        return summary;
    }

    public async create(model: Omit<SynopticModel, '_id'>): Promise<SynopticModel> {
        const created = await this.synopticModel.create({
            name: model.name, description: model.description, svgJson: model.svgJson, elements: model.elements
        });
        return this.findById(created._id);
    }

    // champs absents = inchanges ; null si le synoptique n'existe pas
    public async update(id: string, update: SynopticUpdate): Promise<SynopticModel | null> {
        const set = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
        const updated = await this.synopticModel.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).lean<SynopticLean>();
        return updated ? SynopticRepository._toModel(updated) : null;
    }

    public async findById(id: string): Promise<SynopticModel | null> {
        const doc = await this.synopticModel.findById(id).lean<SynopticLean>();
        return doc ? SynopticRepository._toModel(doc) : null;
    }

    public async exists(id: string): Promise<boolean> {
        return !!(await this.synopticModel.exists({ _id: id }));
    }

    // comparaison insensible a la casse, alignee sur l'index unique
    public async findIdByName(name: string): Promise<string | null> {
        const doc = await this.synopticModel.findOne({ name: name.trim() }, { _id: 1 }).collation(SYNOPTIC_NAME_COLLATION).lean<{ _id: string }>();
        return doc?._id ?? null;
    }

    // ordre de creation = ordre des onglets ; sans svgJson (potentiellement volumineux)
    public async findAllSummaries(): Promise<SynopticSummaryModel[]> {
        const docs = await this.synopticModel.find({}, { svgJson: 0 }).sort({ createdAt: 1 }).lean<SynopticLean[]>();
        return docs.map(SynopticRepository._toSummary);
    }

    public async delete(id: string): Promise<boolean> {
        const result = await this.synopticModel.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    // navigation vers un synoptique supprime : affectations retirees des autres synoptiques
    public async clearSynopticTargets(targetId: string): Promise<void> {
        const docs = await this.synopticModel.find({}, { elements: 1 }).lean<SynopticLean[]>();
        for (const doc of docs) {
            const keys = Object.entries(doc.elements ?? {})
                .filter(([, element]) => element.assignment?.type === SynopticAssignmentType.SYNOPTIC
                    && element.assignment.targetId === targetId)
                .map(([key]) => key);
            if (keys.length) {
                const set = Object.fromEntries(keys.map((key) => [`elements.${key}.assignment`, null]));
                await this.synopticModel.updateOne({ _id: doc._id }, { $set: set });
            }
        }
    }
}
