const { withPodfile } = require('expo/config-plugins');

const MARKER = '# c15t-fixture: pod deployment floor';

/**
 * Lift every pod target below the app's iOS floor to that floor.
 *
 * Resource bundle targets keep their pod's own floor, such as async-storage's
 * 13.4, which Xcode 27 refuses to build. Expo SDK 57 raises them itself; SDK 55
 * does not. The bare fixture's Podfile does the same thing by hand.
 *
 * @param {import('expo/config').ExpoConfig} config Expo configuration.
 * @param {{ floor: string }} props The lowest deployment target any pod may keep.
 * @returns {import('expo/config').ExpoConfig} The configuration with the Podfile hook.
 */
const withPodDeploymentFloor = (config, { floor }) =>
	withPodfile(config, (podfile) => {
		const { contents } = podfile.modResults;
		if (contents.includes(MARKER)) {
			return podfile;
		}
		// Append to the end of post_install, after React Native's own changes.
		const hook =
			/(?<body>post_install do \|installer\|\n[\s\S]*?\n)(?<close> {2}end\n)/u;
		if (!hook.test(contents)) {
			throw new Error('The generated Podfile has no post_install block.');
		}
		podfile.modResults.contents = contents.replace(
			hook,
			`$<body>    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build|
        current = build.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < Gem::Version.new('${floor}')
          build.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${floor}'
        end
      end
    end
$<close>`
		);
		return podfile;
	});

module.exports = withPodDeploymentFloor;
