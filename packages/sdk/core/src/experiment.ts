/**
 * Banner-experiment arm validation. The runtime loads the experiment code
 * on its own when the `experiment` option is set, so most sites never
 * import this entry. Import it to check arms in a test.
 *
 * @packageDocumentation
 */
export { validateExperiment } from './libs/experiment-engine';
export type {
	ExperimentDiagnostics,
	ValidateExperimentOptions,
} from './libs/experiment-engine';
