// src/lib/config/devices.ts
export interface ShellyHttpAction {
  id: string;
  label: string;
  endpoint: string;
  method?: 'GET' | 'POST';
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export const actions: ShellyHttpAction[] = [
  {
    id: 'scene-on',
    label: 'Scene On',
    endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
    payload: { id: '1727329580882' }
  },
  {
    id: 'scene-off',
    label: 'Scene Off',
    endpoint: 'https://shelly-115-eu.shelly.cloud/scene/manual_run',
    payload: { id: '1730105330475' }
  },
  {
    id: 'relay-on',
    label: 'Relay On',
    endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
    payload: { id: '8cbfea9bc6d0', turn: 'on', channel: 0 }
  },
  {
    id: 'relay-off',
    label: 'Relay Off',
    endpoint: 'https://shelly-115-eu.shelly.cloud/device/relay/control',
    payload: { id: '8cbfea9bc6d0', turn: 'off', channel: 0 }
  }
];
