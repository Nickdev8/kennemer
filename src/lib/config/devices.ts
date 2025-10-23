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
    statusKey: 'relay-main',
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
    statusKey: 'relay-main',
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
    statusKey: 'relay-main',
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
      endpoint: 'http://shelly-relay.local/rpc/Switch.GetStatus',
      encoding: 'json',
      requiresAuthKey: false,
      method: 'POST',
      payload: { id: 0 }
    }
  }
};