/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { StructureRepository } from '@process/infrastructure/repositories/structure.repository';
import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import * as fs from 'fs';
import * as HciSocket from 'hci-socket';
import { AuthenticationService } from './authentication.service';
const NodeBleHost = require('ble-host');
const network = require("node-network-manager");
const BleManager = NodeBleHost.BleManager;
const AdvertisingDataBuilder = NodeBleHost.AdvertisingDataBuilder;
const HciErrors = NodeBleHost.HciErrors;
const AttErrors = NodeBleHost.AttErrors;

const deviceName = 'clv-ble';
var transport = new HciSocket(); 
var options = {};

@Injectable()
export class BleService {

    public constructor(
        private structureRepository: StructureRepository,
        private valueRepository: ValueRepository,
        private authenticationService: AuthenticationService
    ) {
    }

    async initialize(): Promise<void> {
        BleManager.create(transport, options, (err, manager) => {
            // err is either null or an Error object
            // if err is null, manager contains a fully initialized BleManager object
            if (err) {
                console.error(err);
                return;
            }

            var notificationCharacteristic;

            manager.gattDb.setDeviceName(deviceName);
            manager.gattDb.addServices([
                {
                    uuid: '22222222-3333-4444-5555-666666666666',
                    characteristics: [
                        {
                            uuid: '22222222-3333-4444-5555-666666666667',
                            properties: ['read', 'write'],
                            value: 'some default value' // could be a Buffer for a binary value
                        },
                        {
                            uuid: '22222222-3333-4444-5555-666666666668',
                            properties: ['read'],
                            onRead: async (connection, callback) => {
                                const t = await this.getWifiNetworks();
                                callback(AttErrors.SUCCESS, JSON.stringify(t));
                            }
                        },
                        {
                            uuid: '22222222-3333-4444-5555-666666666669',
                            properties: ['write'],
                            onWrite: async (connection, needsResponse, value, callback) => {
                                callback(await this.buildContenteConfigFile(JSON.parse(value.toString()))); // actually only needs to be called when needsResponse is true
                            }
                        },
                        notificationCharacteristic = {
                            uuid: '22222222-3333-4444-5555-66666666666A',
                            properties: ['notify'],
                            onSubscriptionChange: function (connection, notification, indication, isWrite) {
                                if (notification) {
                                    // Notifications are now enabled, so let's send something
                                    notificationCharacteristic.notify(connection, 'Sample notification');
                                }
                            }
                        }
                    ]
                }
            ]);

            const advDataBuffer = new AdvertisingDataBuilder()
                .addFlags(['leGeneralDiscoverableMode', 'brEdrNotSupported'])
                .addLocalName(/*isComplete*/ true, fs.readFileSync('/home/clv/udi/unique_device_id', 'utf8'))
                .add128BitServiceUUIDs(/*isComplete*/ true, ['22222222-3333-4444-5555-666666666666'])
                .build();
            manager.setAdvertisingData(advDataBuffer);
            // call manager.setScanResponseData(...) if scan response data is desired too
            startAdv();

            function startAdv() {
                manager.startAdvertising({/*options*/ }, connectCallback);
            }

            function connectCallback(status, conn) {
                if (status != HciErrors.SUCCESS) {
                    // Advertising could not be started for some controller-specific reason, try again after 10 seconds
                    setTimeout(startAdv, 10000);
                    return;
                }
                conn.on('disconnect', startAdv); // restart advertising after disconnect
            }
        });
    }

    private async getConfiguredWifiNetworks(): Promise<any[]> {
        const lst: any[] = await network.getConnectionProfilesList()
        return lst.filter(x => x.TYPE === 'wifi').map(x => ({ name: x.NAME, isConfigured: true }));
    }

    private async getAllWifiNetworks(): Promise<any[]> {
        const lst: any[] = await network.getWifiList(true)
        return this.getUniqueSSIDs(lst);
    }


    private async buildContenteConfigFile(data: { ssid: string, psk: string, password: string }) {
        const isValid = await this.authenticationService.checkPassword({ id: data.ssid, login: data.ssid, password: data.password });
        if (!isValid) { 
            return AttErrors.WRITE_NOT_PERMITTED;
        } 
        await network.wifiConnect(data.ssid, data.psk);
        return AttErrors.SUCCESS;
    }

    private getUniqueSSIDs(networks) {
        const ssidMap = new Map();

        networks.forEach(network => {
            const { SSID, inUseBoolean } = network; 

            // Check if the SSID is already in the map
            if (!ssidMap.has(SSID)) {
                ssidMap.set(SSID, { name: SSID, "in-use": inUseBoolean });
            } else if (inUseBoolean) {
                // Update the "in-use" field if this entry is in use
                ssidMap.get(SSID)["in-use"] = true;
            }
        });

        // Convert the map to an array
        return Array.from(ssidMap.values());
    }


    private async getWifiNetworks() {

        const alreadyConfiguredWifiNetworks = await this.getConfiguredWifiNetworks();
        const allWifiNetworks = await this.getAllWifiNetworks()


        const mergedMap = new Map();

        // Add all records from the usage list
        alreadyConfiguredWifiNetworks.forEach(item => {
            mergedMap.set(item.name, { ...item, isConfigured: false }); // Default `isConfigured` to false
        });

        // Merge records from the configured list
        allWifiNetworks.forEach(item => {
            if (mergedMap.has(item.name)) {
                mergedMap.set(item.name, { ...mergedMap.get(item.name), ...item });
            } else {
                mergedMap.set(item.name, { ...item, "in-use": false }); // Default `in-use` to false
            }
        });

        // Convert the map back to an array
        return Array.from(mergedMap.values());
    }

}
