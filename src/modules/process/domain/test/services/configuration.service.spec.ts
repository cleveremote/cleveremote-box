import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ConfigurationSynchronizeDTO } from '@process/infrastructure/dto/configuration-synchronize.dto';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';


describe('Notification Service unit testing ', () => {

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('Should save configuration & read It', async () => {
        //GIVEN
        const configurationRepository = new ConfigurationRepository();
        const configurationService = new ConfigurationService(configurationRepository);
        const dto = new ConfigurationSynchronizeDTO()
        // eslint-disable-next-line max-len
        dto.configuration = '{"cycles":[{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":21,"direction":"out","edge":"both","instance":{}}],"id":"13","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}}],"id":"13","duration":10}],"id":"2"},{"status":"STOPPED","sequences":[]}],"sequences":[ { "status":"STOPPED", "modules":[ { "activeLow":false, "reconfigureDirection":true, "status":"OFF", "portNum":16, "direction":"in", "edge":"both", "instance":{ } }, { "activeLow":false, "reconfigureDirection":true, "status":"OFF", "portNum":21, "direction":"out", "edge":"both", "instance":{ } } ], "id":"falsyxxx", "duration":10 }]}'
        const configurationModel = ConfigurationSynchronizeDTO.mapToNotificationModel(dto);
        //WHEN
        const configModel = await configurationService.synchronize(configurationModel);

        //THEN
        expect(configModel).toEqual(configurationModel);

        const response = await configurationService.getConfiguration();
        expect(response.toString()).toEqual(configurationModel.toString());
    });

});
