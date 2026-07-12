import { PingController } from '@process/infrastructure/controllers/ping.controller';

describe('PingController', () => {
    it('should return the host status with a name/status/port/timestamp payload', () => {
        const controller = new PingController();

        const result = controller.ping();

        expect(result.status).toEqual('ok');
        expect(result.port).toEqual(3000);
        expect(typeof result.name).toEqual('string');
        expect(new Date(result.timestamp).toString()).not.toEqual('Invalid Date');
    });
});
