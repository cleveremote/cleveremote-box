// les dates recues de l'app sont des instants : un ISO sans Z ni offset serait lu par new Date()
// dans le fuseau du process, d'ou un decalage silencieux des bornes.
export const ISO_WITH_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;
export const ISO_WITH_OFFSET_MESSAGE = '$property must be an ISO 8601 date with Z or an explicit offset (UTC instant)';
