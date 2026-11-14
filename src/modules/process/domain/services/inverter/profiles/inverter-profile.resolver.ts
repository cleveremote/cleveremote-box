import { DeviceKind } from '@process/domain/models/device.model';
import { InverterProfile } from './inverter-profile.interface';
import { VEICHI_SI23_PROFILE } from './veichi-si23.profile';

const PROFILES: InverterProfile[] = [VEICHI_SI23_PROFILE];

// Profil du kind de variateur ; undefined : kind non pilotable
export const ResolveInverterProfile = (kind: DeviceKind | string): InverterProfile | undefined =>
    PROFILES.find((profile) => profile.kind === kind);
