import { IVehicle } from './IVehicle';
import { IChargingStatus } from './IChargingStatus';
import { ChargingStatus } from './ChargingStatus';
import * as superagent from 'superagent';
import * as moment from 'moment';

export class Client {

    private bearerToken: string;
    private settings: any;

    public async login(username: string, password: string) {
        const API_VERSION = 'protocol=1.0,resource=2.1';
        const SRP_KEY =
            'D5AF0E14718E662D12DBB4FE42304DF5A8E48359E22261138B40AA16CC85C76A11B43200A1EECB3C9546A262D1FBD51ACE6FCDE558C00665BBF93FF86B9F8F76AA7A53CA74F5B4DFF9A4B847295E7D82450A2078B5A28814A7A07F8BBDD34F8EEB42B0E70499087A242AA2C5BA9513C8F9D35A81B33A121EEF0A71F3F9071CCD';

        this.settings = {
            'EU': {
                'client_id': 'a-ncb-prod-android',
                'client_secret': '0sAcrtwvwEXXZp5nzQhPexSRhxUVKa0d76F4uqDvxvvKFHXpo4myoJwUuV4vuNqC',
                'scope': 'openid profile vehicles',
                'auth_base_url': 'https://prod.eu2.auth.kamereon.org/kauth/',
                'realm': 'a-ncb-prod',
                'redirect_uri': 'org.kamereon.service.nci:/oauth2redirect',
                'car_adapter_base_url': 'https://alliance-platform-caradapter-prod.apps.eu2.kamereon.io/car-adapter/',
                'user_adapter_base_url': 'https://alliance-platform-usersadapter-prod.apps.eu2.kamereon.io/user-adapter/',
                'user_base_url': 'https://nci-bff-web-prod.apps.eu.kamereon.io/bff-web/'
            }
        };

        this.bearerToken = undefined;

        const authenticateUrl = this.settings.EU.auth_base_url + 'json/realms/root/realms/' + this.settings.EU.realm + '/authenticate';

        const authId = await this.getAuthId(authenticateUrl, API_VERSION);

        let { authCookie, realm } = await this.getAuthCookieAndRealm(authenticateUrl, API_VERSION, authId, username, password);

        let authorisationCode: string = await this.getAuthorisationCode(realm, authCookie);

        const accessToken = await this.getAccessToken(realm, authorisationCode);
        this.bearerToken = accessToken;

        if (!this.bearerToken) {
            throw new Error('Token not set');
        }
    }
    private async getAccessToken(realm: any, authorisationCode: string) {
        const expectedAccessTokenResponseUrl = this.settings.EU.auth_base_url + 'oauth2' + realm +
            '/access_token?code=' + authorisationCode +
            '&client_id=' + this.settings.EU.client_id +
            '&client_secret=' + this.settings.EU.client_secret +
            '&redirect_uri=' + encodeURIComponent(this.settings.EU.redirect_uri) +
            '&grant_type=authorization_code';
        const expectedAccessTokenResponse = await superagent
            .post(expectedAccessTokenResponseUrl)
            .type('form')
            .send();
        if (expectedAccessTokenResponse.status !== 200) {
            throw new Error('Response was status code: ' + expectedAccessTokenResponse.status + ' (' + expectedAccessTokenResponse.text + ')');
        }
        const expectedAccessTokenResponseBody = JSON.parse(expectedAccessTokenResponse.text);
        return expectedAccessTokenResponseBody.access_token;
    }

    private async getAuthorisationCode(realm: any, authCookie: any) {
        // Extremely dirty
        // The http client throws an error due to an invalid URI from the API
        // We parse the code used for authentication from the error message
        const authorizeUrl = this.settings.EU.auth_base_url + 'oauth2' + realm +
            '/authorize?client_id=' + this.settings.EU.client_id +
            '&redirect_uri=' + encodeURIComponent(this.settings.EU.redirect_uri) +
            '&response_type=code&scope=' + encodeURIComponent(this.settings.EU.scope) +
            '&nonce=sdfdsfez';

        let authorisationCode: string;

        try {
            await superagent
                .get(authorizeUrl)
                .on('error', err => {
                    if (err.status === 302) {
                        //Expected
                        authorisationCode = err.response.header.location.split('=')[1].split('&')[0];
                    }
                })
                .redirects(0)
                .set('Cookie', 'i18next=en-UK; amlbcookie=05; kauthSession="' + authCookie + '"');
        } catch (error) {
            // Handle below
        }

        if (!authorisationCode) {
            throw 'Code was not returned in redirect from authorize request';
        }
        return authorisationCode;
    }

    private async getAuthCookieAndRealm(authenticateUrl, API_VERSION, authId, username, password) {
        const maxAttemptsOn401 = 10;
        for (let attempt = 1; attempt <= maxAttemptsOn401; attempt++) {
            console.log('Auth cookie attempt ' + attempt);

            let tokenIdResponse = null;
            try {
                tokenIdResponse = await superagent
                    .post(authenticateUrl)
                    .set('Accept-Api-Version', API_VERSION)
                    .set('X-Username', 'anonymous')
                    .set('X-Password', 'anonymous')
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/json')
                    .send({
                        'authId': authId,
                        'template': '',
                        'stage': 'LDAP1',
                        'header': 'Sign in',
                        'callbacks': [
                            {
                                'type': 'NameCallback',
                                'output': [
                                    { 'name': 'prompt', 'value': 'User Name:' }
                                ],
                                'input': [
                                    { 'name': 'IDToken1', 'value': username }
                                ]
                            },
                            {
                                'type': 'PasswordCallback',
                                'output': [
                                    { 'name': 'prompt', 'value': 'Password:' }
                                ],
                                'input': [
                                    { 'name': 'IDToken2', 'value': password }
                                ]
                            }
                        ]
                    });
            }
            catch (error) {
                tokenIdResponse = error.response;
            }

            if (tokenIdResponse.status === 200) {
                // okay!
                const tokenIdResponseBody = JSON.parse(tokenIdResponse.text);
                return {
                    authCookie: tokenIdResponseBody.tokenId,
                    realm: tokenIdResponseBody.realm
                };
            } else if (tokenIdResponse.status === 401
                && tokenIdResponse.text.includes('Session has timed out') 
                && attempt !== maxAttemptsOn401) {
                // next attempt
                continue;
            } else {
                // don't retry other responses
                throw 'Auth returned with status ' + tokenIdResponse.status;
            }
        }

        throw 'Auth cookie and Realmn unexpectedly null';
    }

    private async getAuthId(authenticateUrl: string, API_VERSION: string) {
        const authIdResponse = await superagent
            .post(authenticateUrl)
            .set('Accept-Api-Version', API_VERSION)
            .set('X-Username', 'anonymous')
            .set('X-Password', 'anonymous')
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .send();

        const authIdResponseBody = JSON.parse(authIdResponse.text);
        return authIdResponseBody.authId;
    }

    public async getVehicles(): Promise<Array<IVehicle>> {
        const currentUserUrl = this.settings.EU.user_adapter_base_url + 'v1/users/current';
        const currentUserResponse = await superagent
            .get(currentUserUrl)
            .set('Authorization', 'Bearer ' + this.bearerToken)
            .on('error', err => {
                //Expected
                console.log('current users ' + err.response.text);
            })
            .send();

        if (currentUserResponse.status !== 200) {
            throw new Error('Response was status code: ' + currentUserResponse.status + ' (' + currentUserResponse.text + ')');
        }
        const currentUserResponseBody = JSON.parse(currentUserResponse.text);
        const userId = currentUserResponseBody.userId;

        const vehiclesUrl = this.settings.EU.user_base_url + 'v2/users/' + userId + '/cars';
        const vehiclesResponse = await superagent
            .get(vehiclesUrl)
            .set('Authorization', 'Bearer ' + this.bearerToken)
            .on('error', err => {
                console.log('user cars ' + err.response.text);
            })
            .send();
        if (vehiclesResponse.status !== 200) {
            throw new Error('Response was status code: ' + vehiclesResponse.status + ' (' + vehiclesResponse.text + ')');
        }
        const vehicles: Array<IVehicle> = [];
        const vehiclesResponseBody = JSON.parse(vehiclesResponse.text);
        for (let index = 0; index < vehiclesResponseBody.data.length; index++) {
            vehicles.push({
                vin: vehiclesResponseBody.data[index].vin
            });
        }
        return vehicles;
    }

    public async requestClimateControlOff(vin: string) {
        const targetTemperature: number = 21;

        const startDateTime = moment().add(5, 's').format();

        const climateUrl = this.settings.EU.car_adapter_base_url + 'v1/cars/' + vin + '/actions/hvac-start';

        const climateResponse = await superagent
            .post(climateUrl)
            .set('Authorization', 'Bearer ' + this.bearerToken)
            .set('Content-Type', 'application/vnd.api+json')
            .send({
                'data': {
                    'type': 'HvacStart',
                    'attributes': {
                        'action': 'stop',
                        'targetTemperature': targetTemperature,
                        'startDateTime': startDateTime
                    }
                }
            });

        if (climateResponse.status !== 200) {
            throw new Error('Response was status code: ' + climateResponse.status + ' (' + climateResponse.text + ')');
        }
    }

    public async requestClimateControlOn(vin: string) {
        const targetTemperature: number = 21;

        const startDateTime = moment().add(5, 's').format();

        const climateUrl = this.settings.EU.car_adapter_base_url + 'v1/cars/' + vin + '/actions/hvac-start';

        const climateResponse = await superagent
            .post(climateUrl)
            .set('Authorization', 'Bearer ' + this.bearerToken)
            .set('Content-Type', 'application/vnd.api+json')
            .send({
                'data': {
                    'type': 'HvacStart',
                    'attributes': {
                        'action': 'start',
                        'targetTemperature': targetTemperature,
                        'startDateTime': startDateTime
                    }
                }
            });

        if (climateResponse.status !== 200) {
            throw new Error('Response was status code: ' + climateResponse.status + ' (' + climateResponse.text + ')');
        }
    }

    public async requestBatteryStatusUpdate(vin: string) {
        const batteryUrl = this.settings.EU.car_adapter_base_url + 'v1/cars/' + vin + '/actions/refresh-battery-status';

        const batteryResponse = await superagent
            .post(batteryUrl)
            .set('Authorization', 'Bearer ' + this.bearerToken)
            .set('Content-Type', 'application/vnd.api+json')
            .send({
                'data': {
                    'type': 'RefreshBatteryStatus'
                }
            });

        if (batteryResponse.status !== 200) {
            throw new Error('Response was status code: ' + batteryResponse.status + ' (' + batteryResponse.text + ')');
        }
    }

    public async requestBatteryStatus(vin: string): Promise<IChargingStatus> {
        const batteryUrl = this.settings.EU.car_adapter_base_url + 'v1/cars/' + vin + '/battery-status';

        const batteryResponse = await superagent
            .get(batteryUrl)
            .set('Authorization', 'Bearer ' + this.bearerToken)
            .send();

        if (batteryResponse.status !== 200) {
            throw new Error('Response was status code: ' + batteryResponse.status + ' (' + batteryResponse.text + ')');
        }

        const batteryResponseBody = JSON.parse(batteryResponse.text);

        let timestamp: Date;
        if (batteryResponseBody.data.attributes.lastUpdateTime.split(':').length === 3) {
            timestamp = moment(batteryResponseBody.data.attributes.lastUpdateTime, 'YYYY/MM/DD hh:mm:ssZ', false).toDate();
        } else {
            timestamp = moment(batteryResponseBody.data.attributes.lastUpdateTime, 'YYYY/MM/DD hh:mmZ', false).toDate();
        }

        return {
            'percentageCharged': batteryResponseBody.data.attributes.batteryLevel,
            'chargingStatus': batteryResponseBody.data.attributes.chargeStatus === 0 ? ChargingStatus.off : ChargingStatus.on,
            'timestamp': timestamp
        };
    }
}
