import type {
	NativeCommand,
	NativeNotificationInput,
	NativeQuitHint,
	NativeUpdateState,
	NativeWindowState,
} from "@thinkrail/contracts";
import type { PageZoomAction, PageZoomGesture } from "./pageZoom";
import type { WindowChromeGeometry } from "./windowChrome";

export type DesktopRpc = {
	bun: {
		requests: {
			getUpdateState: { params: undefined; response: NativeUpdateState };
			getWindowState: { params: undefined; response: NativeWindowState };
			minimizeWindow: { params: undefined; response: undefined };
			toggleMaximizeWindow: { params: undefined; response: undefined };
			closeWindow: { params: undefined; response: undefined };
			quitApp: { params: undefined; response: undefined };
			checkForUpdates: { params: undefined; response: undefined };
			downloadUpdate: { params: undefined; response: undefined };
			restartToUpdate: { params: undefined; response: undefined };
			dismissInstallResult: { params: undefined; response: undefined };
			showNotification: { params: NativeNotificationInput; response: undefined };
			listVirtuaiAgents: {
				params: undefined;
				response: { agents: { id: string; name: string }[]; selectedId: string };
			};
			selectVirtuaiAgent: { params: { agentId: string }; response: undefined };
			getVirtuaiServer: {
				params: undefined;
				response: { server: string; choices: string[]; channelDefault: string };
			};
			setVirtuaiServer: {
				params: { server: string };
				response: { server: string; relogin: boolean };
			};
		};
		messages: {
			routeChanged: { hash: string };
			preferenceWrite: { key: string; value: string };
			preferenceRemove: { key: string };
			titleBarDoubleClick: undefined;
			pageZoomRequested: { action: PageZoomAction };
			pageZoomGestureRequested: PageZoomGesture;
			menuLabelsChanged: { labels: Record<string, string> };
			openVirtuaiSkills: undefined;
			openVirtuaiMcp: undefined;
		};
	};
	webview: {
		requests: Record<string, never>;
		messages: {
			updateStateChanged: NativeUpdateState;
			windowChromeChanged: WindowChromeGeometry;
			windowStateChanged: NativeWindowState;
			windowFocusChanged: { focused: boolean };
			quitHintChanged: { hint: NativeQuitHint };
			nativeCommand: { command: NativeCommand };
		};
	};
};
