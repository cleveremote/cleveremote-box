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
        dto.configuration = '{"cycles":[{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":26,"direction":"out","edge":"both","instance":{}}],"id":"11","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":19,"direction":"out","edge":"both","instance":{}}],"id":"12","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":21,"direction":"out","edge":"both","instance":{}}],"id":"13","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}}],"id":"14","duration":10}],"id":"1"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":26,"direction":"out","edge":"both","instance":{}}],"id":"21","duration":10}],"id":"2"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":19,"direction":"out","edge":"both","instance":{}}],"id":"31","duration":10}],"id":"3"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":21,"direction":"out","edge":"both","instance":{}}],"id":"41","duration":10}],"id":"4"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}}],"id":"51","duration":10}],"id":"5"}]}'
        const configurationModel = ConfigurationSynchronizeDTO.mapToNotificationModel(dto);
        //WHEN
        const configModel = await configurationService.synchronize(configurationModel);

        //THEN
        expect(configModel).toEqual(configurationModel);

        const response = await configurationService.getConfiguration();
        expect(response.toString()).toEqual(configurationModel.toString());
    });

});
