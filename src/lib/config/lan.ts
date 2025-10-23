export const lanHosts = {
	sceneController: 'shelly-scene-device.local',
	relayMain: 'shelly-relay.local',
	test: 'test.local',
	test1: 'test1.local',
	test2: 'test2.local',
	test3: 'test3.local',
	test4: 'test4.local'
} as const;

export type LanHostKey = keyof typeof lanHosts;

export const rpcEndpoint = (host: LanHostKey, rpcMethod: string) =>
	`http://${lanHosts[host]}/rpc/${rpcMethod}`;
