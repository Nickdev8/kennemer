import { rpcEndpoint } from './lan';
import type {
	ShellyHttpAction,
	ShellyStatusTarget
} from './schema';

export const actions: ShellyHttpAction[] = [
  {
    id: 'scene-on',
    label: 'Scene On',
    group: 'Scene',
    statusKey: 'relay-main',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
      payload: { id: '1727329580882' }
    },
    lan: {
      endpoint: rpcEndpoint('sceneController', 'Group.On'),
      method: 'POST',
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 1 }
    }
  },
  {
    id: 'scene-off',
    label: 'Scene Off',
    group: 'Scene',
    statusKey: 'relay-main',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
      payload: { id: '1730105330475' }
    },
    lan: {
      endpoint: rpcEndpoint('sceneController', 'Group.Off'),
      method: 'POST',
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 2 }
    }
  },
  {
    id: 'relay-on',
    label: 'Relay On',
    group: 'Relay',
    statusKey: 'relay-main',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
      payload: { id: '8cbfea9bc6d0', turn: 'on', channel: 0 }
    },
    lan: {
      endpoint: rpcEndpoint('relayMain', 'Switch.Set'),
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 0, on: true }
    }
  },
  {
    id: 'relay-off',
    label: 'Relay Off',
    group: 'Relay',
    statusKey: 'relay-main',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
      payload: { id: '8cbfea9bc6d0', turn: 'off', channel: 0 }
    },
    lan: {
      endpoint: rpcEndpoint('relayMain', 'Switch.Set'),
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 0, on: false }
    }
  },
  {
    id: 'test-toggle',
    label: 'Test Toggle',
    group: 'Test',
    cloud: {
      endpoint: 'https://example.com/fake/test',
      method: 'POST',
      encoding: 'json',
      payload: { action: 'toggle' }
    },
    lan: {
      endpoint: rpcEndpoint('test', 'Switch.Toggle'),
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 0 }
    }
  }
];

export const statusTargets: Record<string, ShellyStatusTarget> = {
  'relay-main': {
    key: 'relay-main',
    label: 'Lights',
    parser: 'relay',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/device/status',
      method: 'GET',
      payload: { id: '8cbfea9bc6d0' }
    },
    lan: {
      endpoint: rpcEndpoint('relayMain', 'Switch.GetStatus'),
      encoding: 'json',
      requiresAuthKey: false,
      method: 'POST',
      payload: { id: 0 }
    }
  }
};
