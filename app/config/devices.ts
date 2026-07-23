import { env } from '$env/dynamic/public';
import type { ShellyDevice } from '../src/lib/config/schema';

const shellySceneEndpoint =
	env.PUBLIC_SHELLY_SCENE_ENDPOINT ?? 'https://shelly-115-eu.shelly.cloud/scene/manual_run';

export const gangColorDevice: ShellyDevice = {
	id: 'gang-color',
	label: 'Gang kleur',
	type: 'Advanced',
	buttonMode: 'toggle',
	commands: {
		on: {
			label: 'Gang paars',
			type: '#7c3aed',
			cloud: {
				endpoint: shellySceneEndpoint,
				method: 'POST',
				payload: { id: 1763038295754 },
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
				payload: { id: 1763040330000 },
				requiresAuthKey: true
			}
		}
	}
};

export const devices: ShellyDevice[] = [
	{
		id: 'push-1',
		label: '1ste etage',
		type: 'Scene',
		pushNumber: 1,
		buttonMode: 'toggle',
		statusdeviceid: '2cbcbb3d9af0_1',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1781190610396' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '1781190699437' },
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
		statusdeviceid: '2043a80ac3e4',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
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
		statusdeviceid: '2043a80ac3e4_1',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
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
		statusdeviceid: '2cbcbb3d9af0',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
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
		statusdeviceid: '30c92276c1d4_1',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
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
		statusdeviceid: '8813bfd6d300',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
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
		statusdeviceid: '8813bfd6d300_1',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			}
		}
	},
	{
		id: 'scene-kopje-gang',
		label: 'Kopje gang',
		type: 'Scene',
		pushNumber: 9,
		buttonMode: 'toggle',
		statusdeviceid: '30c92276c1d4',
		commands: {
			on: {
				label: 'Aan',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			},
			off: {
				label: 'Uit',
				cloud: {
					endpoint: shellySceneEndpoint,
					method: 'POST',
					payload: { id: '' },
					requiresAuthKey: true
				}
			}
		}
	}
];
