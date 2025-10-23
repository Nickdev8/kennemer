export interface ShellyHttpTarget {
	endpoint: string;
	method?: 'GET' | 'POST';
	payload?: Record<string, unknown>;
	headers?: Record<string, string>;
	encoding?: 'form' | 'json';
	requiresAuthKey?: boolean;
}

export type ShellyHttpTargetConfig = ShellyHttpTarget | ShellyHttpTarget[];

export interface ShellyHttpAction {
	id: string;
	label: string;
	group: string;
	cloud: ShellyHttpTargetConfig;
	lan?: ShellyHttpTargetConfig;
	statusKey?: string;
}

export type ShellyStatusParser = 'relay';

export interface ShellyStatusTarget {
	key: string;
	label: string;
	parser: ShellyStatusParser;
	cloud: ShellyHttpTarget;
	lan?: ShellyHttpTarget;
}
