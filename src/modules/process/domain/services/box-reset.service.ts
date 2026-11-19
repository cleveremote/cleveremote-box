import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { BoxResetRepository } from '@process/infrastructure/repositories/box-reset.repository';
import { BoxResetModel } from '../models/authentication.model';
import { AuthenticationResultModel, AuthenticationStatus } from '../models/authentication-result.model';
import { AuthenticationService } from './authentication.service';
import { ProcessService } from './execution.service';

// délai laissé à la réponse socket avant l'arrêt du process
const RESTART_DELAY_MS = 3000;

@Injectable()
export class BoxResetService {
    public constructor(
        private readonly authenticationService: AuthenticationService,
        private readonly boxResetRepository: BoxResetRepository,
        private readonly processService: ProcessService,
        private readonly logger: Logger
    ) { }

    // account seul : compte effacé puis recréé (identifiants d'usine), sans redémarrage ;
    // data seul : toutes les collections hormis le compte supprimées ;
    // account + data : base entière supprimée puis compte recréé.
    // Dès que data est demandé, la box redémarre (structure, crons et pilotage en mémoire obsolètes)
    public async reset(request: BoxResetModel): Promise<AuthenticationResultModel> {
        const check = await this.authenticationService.checkCredentials(request.login, request.password);
        if (check.status !== AuthenticationStatus.SUCCESS) {
            return check;
        }
        if (!request.account && !request.data) {
            return this.authenticationService.result(AuthenticationStatus.RESET_SCOPE_MISSING);
        }
        const scope = { login: request.login, boxId: request.boxId, account: request.account, data: request.data };
        this.logger.warn(scope, 'box reset requested');
        try {
            if (request.data) {
                await this._stopAllModules();
            }
            if (request.account && request.data) {
                await this.boxResetRepository.dropDatabase();
            } else if (request.data) {
                const dropped = await this.boxResetRepository.dropAllExceptAccount();
                this.logger.warn({ dropped }, 'box reset : collections dropped');
            } else {
                await this.boxResetRepository.clearAccount();
            }
            if (request.account) {
                await this.authenticationService.initAuthentication();
            }
        } catch (error) {
            this.logger.error({ ...scope, err: error?.message }, 'box reset failed');
            // suppression éventuellement partielle : le redémarrage remet la box dans un état cohérent
            if (request.data) {
                this._scheduleRestart();
            }
            return this.authenticationService.result(AuthenticationStatus.RESET_FAILED);
        }
        this.logger.warn(scope, 'box reset done');
        if (request.data) {
            this._scheduleRestart();
        }
        const status = !request.data ? AuthenticationStatus.ACCOUNT_RESET
            : request.account ? AuthenticationStatus.FACTORY_RESET : AuthenticationStatus.DATA_RESET;
        return this.authenticationService.result(status);
    }

    // sorties coupées tant que la configuration existe encore : après suppression, plus rien ne permet de les arrêter
    private async _stopAllModules(): Promise<void> {
        try {
            await this.processService.resetAllModules();
        } catch (error) {
            this.logger.error({ err: error?.message }, 'box reset : stopping modules failed, reset continues');
        }
    }

    // code non nul : redémarrage par le superviseur quelle que soit sa politique (always / unless-stopped / on-failure)
    private _scheduleRestart(): void {
        this.logger.warn({ delayMs: RESTART_DELAY_MS }, 'box reset : restarting');
        setTimeout(() => process.exit(1), RESTART_DELAY_MS);
    }
}
