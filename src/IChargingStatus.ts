import { ChargingStatus } from './ChargingStatus';
export interface IChargingStatus {
    percentageCharged: number;
    chargingStatus: ChargingStatus;
    timestamp: Date;
}
