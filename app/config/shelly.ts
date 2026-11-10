// Rooms shown in the Shelly tab. Use the exact room name and ID from Shelly.
// Each dashboard id must be unique. Adding a room also enables its device controls.
export const SHELLY_ROOMS = [
	{ id: 'nieuwbouw', name: 'Nieuwbouw', accountId: '21' },
	{ id: 'light-hfd', name: 'Light Hfd', accountId: '2' }
] as const;
