import { ICommand } from '../../../../common/mediator/types.js';
import type { DevicePlatform } from '../../common/ports.js';

export type RegisterDeviceResult =
  | { outcome: 'registered' | 'refreshed' | 'transferred' }
  | { outcome: 'invalid_token' };

/** The app registers its push token after sign-in, on every start and on token refresh (FR-001). */
export class RegisterDeviceCommand extends ICommand<RegisterDeviceResult> {
  constructor(
    readonly userId: string,
    readonly token: string,
    readonly platform: DevicePlatform,
  ) {
    super();
  }
}
