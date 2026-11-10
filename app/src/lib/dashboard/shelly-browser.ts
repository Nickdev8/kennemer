export type ShellyComponentView = {
	id: string;
	label: string;
	output: boolean | null;
	value: string | null;
	controllable: boolean;
};
export type ShellyRoomDevice = {
	id: string;
	name: string;
	online: boolean | null;
	components: ShellyComponentView[];
};
export type ShellyRoomView = {
	id: string;
	name: string;
	found: boolean;
	count: number;
	onlineCount: number;
};
export type ShellyBrowserView = {
	ok: boolean;
	rooms: ShellyRoomView[];
	devices?: ShellyRoomDevice[];
	room?: string;
	updatedAt: number | null;
	stale: boolean;
	message?: string;
};
