import { createModuleLoader } from './module-loader.mjs';
const server = await createModuleLoader();
try {
	const { controls, tabs } = await server.ssrLoadModule('/src/lib/config/registry.ts');
	const { validateConfiguration } = await server.ssrLoadModule(
		'/src/lib/config/configuration-validation.ts'
	);
	const issues = validateConfiguration(controls, tabs);
	if (issues.length) {
		console.error(issues.join('\n'));
		process.exitCode = 1;
	} else console.log(`Configuration valid: ${controls.length} controls, ${tabs.length} tabs.`);
} finally {
	await server.close();
}
