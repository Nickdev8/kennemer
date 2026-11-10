export type VacationRow = {
	id: string;
	label: string;
	kind: 'output' | 'scene' | 'unsupported';
	actual: boolean | null;
	begin: boolean | null;
	end: boolean | null;
	source: 'lan' | 'cloud' | 'unknown';
	delays: { begin: number[]; end: number[] };
	issue?: string;
};
export type VacationStatusView = {
	state: 'active' | 'inactive' | 'partial' | 'unknown';
	rows: VacationRow[];
	updatedAt: number | null;
	stale: boolean;
	simulation: boolean;
	message?: string;
};
export function aggregateVacation(rows: VacationRow[]): VacationStatusView['state'] {
	if (
		!rows.length ||
		rows.some(
			(row) =>
				row.kind === 'unsupported' || row.actual === null || row.begin === null || row.end === null
		)
	)
		return 'unknown';
	const begin = rows.every((row) => row.actual === row.begin),
		end = rows.every((row) => row.actual === row.end);
	return begin && !end
		? 'active'
		: end && !begin
			? 'inactive'
			: !begin && !end
				? 'partial'
				: 'unknown';
}
