import { version } from '../../../package.json';

export const appVersion = version;
export const buildCommit: string | null =
	typeof __KENNEMER_BUILD_COMMIT__ === 'undefined' ? null : __KENNEMER_BUILD_COMMIT__;
