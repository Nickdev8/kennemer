export interface ShellyHttpTarget {
  endpoint: string;
  method?: 'GET' | 'POST';
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
  encoding?: 'form' | 'json';
  requiresAuthKey?: boolean;
}

export interface ShellyHttpAction {
  id: string;
  label: string;
  group: string;
  cloud: ShellyHttpTarget;
  lan?: ShellyHttpTarget;
}

export const actions: ShellyHttpAction[] = [
  {
    id: 'scene-on',
    label: 'Scene On',
    group: 'Scene',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
      payload: { id: '1727329580882' }
    },
    lan: {
      endpoint: 'http://shelly-scene-device.local/rpc/Scene.Activate',
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 1 }
    }
  },
  {
    id: 'scene-off',
    label: 'Scene Off',
    group: 'Scene',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
      payload: { id: '1730105330475' }
    },
    lan: {
      endpoint: 'http://shelly-scene-device.local/rpc/Scene.Activate',
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 2 }
    }
  },
  {
    id: 'relay-on',
    label: 'Relay On',
    group: 'Relay',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
      payload: { id: '8cbfea9bc6d0', turn: 'on', channel: 0 }
    },
    lan: {
      endpoint: 'http://shelly-relay.local/rpc/Switch.Set',
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 0, on: true }
    }
  },
  {
    id: 'relay-off',
    label: 'Relay Off',
    group: 'Relay',
    cloud: {
      endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
      payload: { id: '8cbfea9bc6d0', turn: 'off', channel: 0 }
    },
    lan: {
      endpoint: 'http://shelly-relay.local/rpc/Switch.Set',
      encoding: 'json',
      requiresAuthKey: false,
      payload: { id: 0, on: false }
    }
  }
];
