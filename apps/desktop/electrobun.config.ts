import { version } from "@thinkrail/shared/version";
import type { ElectrobunConfig } from "electrobun";

// Hutch reads `build.bun.version` like the other toolchain versions, but ElectrobunConfig does not type
// it, so the literal is kept out of the excess-property check. It must match the root packageManager pin.
const bun = { entrypoint: "src/index.ts", version: "1.4.4" };

export default {
	app: {
		name: "VirtuAI",
		identifier: "com.virtuai.ide",
		version,
	},
	runtime: {
		exitOnLastWindowClosed: true,
	},
	release: {
		// Updater feed for packaged stable/canary builds (Electrobun desktop-updates assets).
		baseUrl: "https://github.com/VirtuAiRepo/virtuai-ide/releases/download/desktop-updates",
		generatePatch: false,
	},
	build: {
		mainProcess: "bun",
		bun,
		views: { preload: { entrypoint: "src/preload.ts", format: "iife" } },
		copy: {
			"../web/dist": "views/web",
			".stage/runtime": "runtime",
		},
		mac: { bundleCEF: false, icons: "../../packages/shared/assets/icon.iconset" },
		linux: { bundleCEF: false, icon: "../../packages/shared/assets/icon.png" },
		win: { bundleCEF: false, icon: "../../packages/shared/assets/icon.ico" },
	},
	scripts: { preBuild: "preBuild.ts", postBuild: "postBuild.ts" },
} satisfies ElectrobunConfig;
