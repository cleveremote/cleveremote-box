// Filtre/mise a jour partages pour le soft delete : les documents supprimes gardent
// `deletedAt` renseigne au lieu d'etre retires de la collection.
export const NOT_DELETED_FILTER = { deletedAt: null };

export function softDeleteUpdate(): { deletedAt: Date } {
    return { deletedAt: new Date() };
}
