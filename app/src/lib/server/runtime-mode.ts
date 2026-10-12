/** Only the explicit development launcher selects mock mode; production defaults to live. */
export function runtimeMode(value = process.env.KENNEMER_RUNTIME_MODE): 'mock' | 'live' {
	return value === 'mock' ? 'mock' : 'live';
}
export function maintenanceBlocked(value = process.env.KENNEMER_RUNTIME_MODE): boolean {
	return value === 'live';
}
