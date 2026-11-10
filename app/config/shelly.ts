// Rooms shown in the Shelly tab. Use the exact room name and ID from Shelly.
// Each dashboard id must be unique. Adding a room also enables its device controls.
export const SHELLY_ROOMS = [
	{ id: 'nieuwbouw', name: 'Nieuwbouw', accountId: '21' },
	{ id: 'light-hfd', name: 'Light Hfd', accountId: '2' },
	{ id: 'light-2de-hfd', name: 'Light 2de hfd', accountId: '22' },
	{ id: 'light-1-ste-hfd', name: 'Light 1 ste hfd', accountId: '15' },
	{ id: 'gang-color', name: 'Gang Color', accountId: '7' },
	{ id: 'techniek', name: 'Techniek', accountId: '8' },
	{ id: 'screen', name: 'Screen', accountId: '1' },
	{ id: 'powersocket', name: 'Powersocket', accountId: '3' },
	{ id: 'spare-room-1', name: 'spare room 1', accountId: '23' },
	{ id: 'spare-room-2', name: 'spare room 2', accountId: '24' },
	{ id: 'space-room-3', name: 'space room 3', accountId: '25' },
	{ id: 'space-room-4', name: 'space room 4', accountId: '26' }
] as const;

// NIET
// Display units
// Tuin
// Vakantie
// Licht techniek
// Push control
// test room
// Licht lokalen
