/** Home numbers run down columns; changing numbering does not move equipment. */
export function homeGridPosition(number: number) {
	return { column: Math.floor((number - 1) / 3) + 1, row: ((number - 1) % 3) + 1 };
}
export function rowNumberToColumn(number: number) {
	return ((number - 1) % 3) * 3 + Math.floor((number - 1) / 3) + 1;
}
