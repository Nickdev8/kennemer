import { env } from '$env/dynamic/public';
import type { ShellyDevice } from '../src/lib/config/schema';

const shellySceneEndpoint =
	env.PUBLIC_SHELLY_SCENE_ENDPOINT ?? 'https://shelly-115-eu.shelly.cloud/scene/manual_run';

export const devices: ShellyDevice[] = [
	{
		id: 'push-1',
		label: '1ste etage',
		type: 'Scene',
		pushNumber: 1,
		buttonMode: 'toggle',
		statusdeviceid: '8813bfd6d300_1',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560412180' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560433138' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-aula-plafond',
		label: 'Aula plafond',
		type: 'Scene',
		pushNumber: 2,
		buttonMode: 'toggle',
		statusdeviceid: '8813bfd6d300',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560339941' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560362113' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-gang-entree',
		label: 'Gang + entree',
		type: 'Scene',
		pushNumber: 3,
		buttonMode: 'toggle',
		statusdeviceid: '2043a80ac3e4',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560289492' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560313748' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-1ste',
		label: '1ste',
		type: 'Scene',
		pushNumber: 4,
		buttonMode: 'toggle',
		statusdeviceid: '30c92276c1d4',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560234895' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560262228' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-screen-lokalen',
		label: 'Screen lokalen',
		type: 'Scene',
		pushNumber: 5,
		buttonMode: 'single',
		stateless: true,
		activeDurationMs: 60_000,
		commands: {
			on: {
				label: 'Screens omhoog',
				icon: 'arrow-up',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1781189778293' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-kantine',
		label: 'Kantine',
		type: 'Scene',
		pushNumber: 6,
		buttonMode: 'toggle',
		statusdeviceid: '2043a80ac3e4_1',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560154701' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789560202028' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-parterre',
		label: 'Parterre',
		type: 'Scene',
		pushNumber: 7,
		buttonMode: 'toggle',
		statusdeviceid: '30c92276c1d4_1',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789559627914' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789559664484' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-aula-vide',
		label: 'Aula vide',
		type: 'Scene',
		pushNumber: 8,
		buttonMode: 'toggle',
		statusdeviceid: '2cbcbb3d9af0',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789559514915' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789559559159' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-kopje-gang',
		label: 'Kopje',
		type: 'Scene',
		pushNumber: 9,
		buttonMode: 'toggle',
		statusdeviceid: '2cbcbb3d9af0_1',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789557426197' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1789557375466' },
					requiresAuthKey: true
				}
			}
		}
	}
];
