declare module 'write-file-atomic' {
	type WriteFileAtomicOptions = {
		mode?: number;
		encoding?: BufferEncoding;
		fsync?: boolean;
	};

	const writeFileAtomic: (
		filename: string,
		data: string | Uint8Array,
		options?: WriteFileAtomicOptions
	) => Promise<void>;

	export default writeFileAtomic;
}
