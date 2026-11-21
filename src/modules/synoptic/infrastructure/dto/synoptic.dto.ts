import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { SynopticAssignmentType, SynopticSynchronizeModel } from '@synoptic/domain/models/synoptic.model';

export class SynopticAssignmentDTO {
    @IsEnum(SynopticAssignmentType)
    @ApiProperty({ enum: SynopticAssignmentType })
    public type: SynopticAssignmentType;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Identifiant de la ressource ciblee (sensor, cycle, cycle MODULE/PROPORTIONAL ou synoptique)' })
    public targetId: string;
}

export class SynopticAssignmentPatchDTO {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Suffixe commun de s_element_<cle> / s_element_value_<cle>' })
    public key: string;

    // absent ou null = affectation supprimee
    @IsOptional()
    @ValidateNested()
    @Type(() => SynopticAssignmentDTO)
    @ApiProperty({ type: SynopticAssignmentDTO, required: false, nullable: true })
    public assignment?: SynopticAssignmentDTO | null;
}

export class SynopticSynchronizeDTO {
    // absent = creation
    @IsOptional()
    @IsString()
    @ApiProperty({ required: false })
    public _id?: string;

    // requis a la creation
    @ValidateIf((dto: SynopticSynchronizeDTO) => !dto._id || dto.name !== undefined)
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ required: false })
    public name?: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ required: false })
    public description?: string;

    // contenu texte du fichier SVG, transmis tel quel par l'app ; requis a la creation
    @ValidateIf((dto: SynopticSynchronizeDTO) => !dto._id || dto.svg !== undefined)
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ required: false })
    public svg?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SynopticAssignmentPatchDTO)
    @ApiProperty({ type: [SynopticAssignmentPatchDTO], required: false })
    public assignments?: SynopticAssignmentPatchDTO[];

    @IsOptional()
    @IsString()
    public lang?: string;

    public static mapToModel(dto: SynopticSynchronizeDTO): SynopticSynchronizeModel {
        const model = new SynopticSynchronizeModel();
        model._id = dto._id;
        model.name = dto.name;
        model.description = dto.description;
        model.svg = dto.svg;
        model.assignments = dto.assignments?.map((patch) => ({
            key: patch.key,
            assignment: patch.assignment ? { type: patch.assignment.type, targetId: patch.assignment.targetId } : null
        }));
        return model;
    }
}

export class SynopticIdDTO {
    @IsString()
    @IsNotEmpty()
    @ApiProperty()
    public _id: string;

    @IsOptional()
    @IsString()
    public lang?: string;
}
