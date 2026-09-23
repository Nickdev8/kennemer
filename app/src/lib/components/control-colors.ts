export type ControlColor = {
	background: string;
	border: string;
	text: string;
	soft: string;
};

const namedColors: Record<string, ControlColor> = {
	green: { background: '#16a34a', border: '#15803d', text: '#ffffff', soft: '#dcfce7' },
	red: { background: '#dc2626', border: '#b91c1c', text: '#ffffff', soft: '#fee2e2' },
	grey: { background: '#6b7280', border: '#4b5563', text: '#ffffff', soft: '#f3f4f6' },
	gray: { background: '#6b7280', border: '#4b5563', text: '#ffffff', soft: '#f3f4f6' },
	slate: { background: '#475569', border: '#334155', text: '#ffffff', soft: '#f1f5f9' },
	blue: { background: '#2563eb', border: '#1d4ed8', text: '#ffffff', soft: '#dbeafe' },
	cyan: { background: '#0891b2', border: '#0e7490', text: '#ffffff', soft: '#cffafe' },
	teal: { background: '#0d9488', border: '#0f766e', text: '#ffffff', soft: '#ccfbf1' },
	yellow: { background: '#facc15', border: '#ca8a04', text: '#422006', soft: '#fef9c3' },
	amber: { background: '#f59e0b', border: '#d97706', text: '#422006', soft: '#fef3c7' },
	orange: { background: '#ea580c', border: '#c2410c', text: '#ffffff', soft: '#ffedd5' },
	purple: { background: '#9333ea', border: '#7e22ce', text: '#ffffff', soft: '#f3e8ff' },
	pink: { background: '#db2777', border: '#be185d', text: '#ffffff', soft: '#fce7f3' },
	white: { background: '#ffffff', border: '#cbd5e1', text: '#334155', soft: '#ffffff' },
	neutral: { background: '#334155', border: '#1e293b', text: '#ffffff', soft: '#f1f5f9' },
	none: { background: '#334155', border: '#1e293b', text: '#ffffff', soft: '#f1f5f9' }
};

const hexColorRegex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHexColor(value: string): string | null {
	const trimmed = value.trim();
	if (!hexColorRegex.test(trimmed)) return null;
	if (trimmed.length === 4) {
		const [, r, g, b] = trimmed.split('');
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	return trimmed.toLowerCase();
}

function getTextColor(hexColor: string): string {
	const r = parseInt(hexColor.slice(1, 3), 16);
	const g = parseInt(hexColor.slice(3, 5), 16);
	const b = parseInt(hexColor.slice(5, 7), 16);
	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness > 150 ? '#0f172a' : '#ffffff';
}

function lightenHex(hexColor: string, weight = 0.88): string {
	const r = parseInt(hexColor.slice(1, 3), 16);
	const g = parseInt(hexColor.slice(3, 5), 16);
	const b = parseInt(hexColor.slice(5, 7), 16);
	const mix = (channel: number) =>
		Math.round(channel + (255 - channel) * weight)
			.toString(16)
			.padStart(2, '0');
	return `#${mix(r)}${mix(g)}${mix(b)}`;
}

export function resolveControlColor(value?: string): ControlColor | null {
	if (!value) return null;
	const normalized = value.trim().toLowerCase();
	if (namedColors[normalized]) return namedColors[normalized];
	const hex = normalizeHexColor(value);
	if (!hex) return null;
	return { background: hex, border: hex, text: getTextColor(hex), soft: lightenHex(hex) };
}
