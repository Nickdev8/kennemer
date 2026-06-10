import { env } from '$env/dynamic/public';
import type { ShellyDevice } from './schema';

const shellySceneEndpoint =
	env.PUBLIC_SHELLY_SCENE_ENDPOINT ??
	'https://shelly-115-eu.shelly.cloud/scene/manual_run';

export const gangColorDevice: ShellyDevice = {
	id: 'gang-color',
	label: 'Gang kleur',
	group: 'Advanced',
	buttonMode: 'toggle',
	commands: {
		on: {
			label: 'Gang paars',
			type: '#7c3aed',
			cloud: {
				endpoint: shellySceneEndpoint,
				method: 'POST',
				payload: { id: 1763038295754, channel: 0, turn: 'on' },
				requiresAuthKey: true
			}
		},
		off: {
			label: 'Gang wit',
			type: '#ffffff',
			typeBorder: '#d0d7e2',
			cloud: {
				endpoint: shellySceneEndpoint,
				method: 'POST',
				payload: { id: 1763040330000, channel: 0, turn: 'on' },
				requiresAuthKey: true
			}
		}
	}
};

export const devices: ShellyDevice[] = [
	// {
	// 	id: 'scene-2de',
	// 	label: '2de',
	// 	group: 'Scene',
	// 	buttonMode: 'toggle',
	// 	commands: {
	// 		on: {
	// 			label: 'Aan',
	// 			cloud: {
	// 				endpoint: shellySceneEndpoint,
	// 				method: 'POST',
	// 				payload: { id: '1761824228559', channel: 0, turn: 'on' },
	// 				requiresAuthKey: true
	// 			}
	// 		},
	// 		off: {
	// 			label: 'Uit',
	// 			cloud: {
	// 				endpoint: shellySceneEndpoint,
	// 				method: 'POST',
	// 				payload: { id: '1761824279482', channel: 0, turn: 'off' },
	// 				requiresAuthKey: true
	// 			}
	// 		}
	// 	}
	// },
	{
		id: 'push-1',
		label: 'Push Panel 1',
		group: 'Group',
		buttonMode: 'toggle',
		statusdeviceid:'ecc9ff4a9c38',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: 'ecc9ff4a9c38', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: 'ecc9ff4a9c38', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-aula-plafond',
		label: 'Aula plafond',
		group: 'Scene',
		buttonMode: 'toggle',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-gang-entree',
		label: 'Gang + entree',
		group: 'Scene',
		buttonMode: 'toggle',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-1ste',
		label: '1ste',
		group: 'Scene',
		buttonMode: 'toggle',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-screen-lokalen',
		label: 'Screen lokalen',
		group: 'Scene',
		buttonMode: 'single',
		stateless: true,
		commands: {
			on: {
				label: 'Screens up',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1768398909398', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-kantine',
		label: 'Kantine',
		group: 'Scene',
		buttonMode: 'toggle',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-parterre',
		label: 'Parterre',
		group: 'Scene',
		buttonMode: 'toggle',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-aula-vide',
		label: 'Aula vide',
		group: 'Scene',
		buttonMode: 'toggle',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-kopje-gang',
		label: 'Kopje gang',
		group: 'Scene',
		buttonMode: 'toggle',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824228559', channel: 0, turn: 'on' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1761824279482', channel: 0, turn: 'off' },
					requiresAuthKey: true
				}
			}
		}
	}
];
