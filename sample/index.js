'use strict';

const carwings = require('../release');
const secrets = require('./secrets.json');

const client = new carwings.Client({regionCode:secrets.regionCode});

(async function () {
    console.time('login');
    await client.login(secrets.email, secrets.password);
    console.timeEnd('login');
    console.timeLog('login');

    console.time('getVehicle');
    const vehicles = await client.getVehicles();
    console.timeEnd('getVehicle');
    console.timeLog('getVehicle');
    console.log(vehicles);

    console.time('requestBatteryStatusUpdate');
    await client.requestBatteryStatusUpdate(vehicles[0].vin);
    console.timeEnd('requestBatteryStatusUpdate');
    console.timeLog('requestBatteryStatusUpdate');

    console.time('requestBatteryStatus');
    let status = await client.requestBatteryStatus(vehicles[0].vin);
    console.timeEnd('batteryStatusUpdate');
    console.timeLog('batteryStatusUpdate');
    console.log(status);

    // console.time('requestClimateControlOff');
    // client.requestClimateControlOff('VINHERE');
    // console.timeEnd('requestClimateControlOff');
    //console.timeLog('requestClimateControlOff');
})();
