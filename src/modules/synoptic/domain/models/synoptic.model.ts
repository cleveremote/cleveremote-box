// Noeud SVG tel que produit par svgson (cf. INode) : source de reference du rendu cote app.
// Conserve tel quel (attributs graphiques, styles, transformations, textes) pour reconstruire le SVG d'origine.
export interface SvgNode {
    name: string;
    type: string;
    value: string;
    attributes: Record<string, string>;
    children: SvgNode[];
}

// Ressource ciblee par un element interactif. Extensible : ajouter un type ici, sa verification dans
// SynopticService._assertTargetExists et sa prise en charge cote app.
export enum SynopticAssignmentType {
    SENSOR = 'SENSOR',
    // cycle de type CYCLE ou GROUP
    CYCLE = 'CYCLE',
    // cycle de type MODULE ou PROPORTIONAL (cf. SYNOPTIC_MODULE_CYCLE_TYPES)
    MODULE = 'MODULE',
    // navigation vers un autre synoptique
    SYNOPTIC = 'SYNOPTIC'
}

export class SynopticAssignmentModel {
    public type: SynopticAssignmentType;
    public targetId: string;
}

// Couple s_element_<cle> / s_element_value_<cle> detecte dans le SVG ; la cle (suffixe commun) indexe `elements`
export class SynopticElementModel {
    public elementId: string;
    public valueElementId?: string;
    public assignment?: SynopticAssignmentModel | null;
}

export class SynopticModel {
    public _id: string;
    public name: string;
    public description?: string;
    public svgJson: SvgNode;
    public elements: Record<string, SynopticElementModel>;
    public createdAt?: Date;
    public updatedAt?: Date;
}

// Entree de la liste des synoptiques (onglets) : sans svgJson, recupere a la demande par box/fetch/synoptic
export class SynopticSummaryModel {
    public _id: string;
    public name: string;
    public description?: string;
    public elementCount: number;
    public createdAt?: Date;
    public updatedAt?: Date;
}

// Modification de l'affectation d'un element ; assignment absent/null = affectation supprimee
export class SynopticAssignmentPatchModel {
    public key: string;
    public assignment?: SynopticAssignmentModel | null;
}

// Creation (sans _id) ou mise a jour partielle (avec _id) d'un synoptique.
// assignments : seules les cles fournies sont modifiees.
// svg : (re)import du fichier ; les affectations des cles toujours presentes sont conservees.
export class SynopticSynchronizeModel {
    public _id?: string;
    public name?: string;
    public description?: string;
    public svg?: string;
    public assignments?: SynopticAssignmentPatchModel[];
}

export class SynopticDeleteResultModel {
    public _id: string;
    public isDeleted: boolean;
}
