import { useT } from "@thinkrail/locales/react";
import { useEffect, useState } from "react";
import { SETTINGS_ROWS_CONTAINER, SettingsRow } from "./SettingsRow";

interface ServerState {
	server: string;
	choices: string[];
	channelDefault: string;
}

interface DesktopBridge {
	getServer?: () => Promise<ServerState>;
	setServer?: (server: string) => Promise<{ server: string; relogin: boolean }>;
}

function desktopBridge(): DesktopBridge | null {
	const value = Reflect.get(globalThis, "__VIRTUAI_DESKTOP__");
	if (typeof value !== "object" || value === null) return null;
	return value as DesktopBridge;
}

function labelForOrigin(origin: string, channelDefault: string, t: ReturnType<typeof useT>): string {
	if (origin === "https://dev.imvirtuai.com") return t("settings.virtuaiServer.dev");
	if (origin === "https://app.imvirtuai.com") return t("settings.virtuaiServer.prod");
	if (origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost")) {
		return t("settings.virtuaiServer.local", { origin });
	}
	return origin === channelDefault
		? t("settings.virtuaiServer.channelDefault", { origin })
		: origin;
}

/** Internal allowlisted VirtuAI origin switch (desktop only). */
export function VirtuaiServerSettings() {
	const t = useT();
	const bridge = desktopBridge();
	const [state, setState] = useState<ServerState | null>(null);
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		if (!bridge?.getServer) return;
		let cancelled = false;
		void bridge.getServer().then((next) => {
			if (!cancelled) setState(next);
		});
		return () => {
			cancelled = true;
		};
	}, [bridge]);

	if (!bridge?.getServer || !bridge.setServer || !state) return null;

	return (
		<div data-testid="settings-virtuai-server" className={SETTINGS_ROWS_CONTAINER}>
			<div className="flex flex-col gap-2 pb-8">
				<h3 className="tr-title-section text-text-default">{t("settings.virtuaiServer.title")}</h3>
				<p className="tr-text-metadata text-text-muted">{t("settings.virtuaiServer.detail")}</p>
			</div>
			<SettingsRow
				label={t("settings.virtuaiServer.label")}
				control={
					<select
						data-testid="virtuai-server-select"
						aria-label={t("settings.virtuaiServer.label")}
						disabled={pending}
						className="max-w-[280px] truncate rounded-sm border border-control-border-default bg-transparent px-8 py-4 text-text-default tr-text-metadata outline-none"
						value={state.server}
						onChange={(event) => {
							const next = event.target.value;
							setPending(true);
							setNotice(null);
							void bridge.setServer?.(next).then((result) => {
								setPending(false);
								setState((prev) =>
									prev
										? { ...prev, server: result.server }
										: {
												server: result.server,
												choices: state.choices,
												channelDefault: state.channelDefault,
											},
								);
								if (result.relogin) setNotice(t("settings.virtuaiServer.relogin"));
							});
						}}
					>
						{state.choices.map((origin) => (
							<option key={origin} value={origin}>
								{labelForOrigin(origin, state.channelDefault, t)}
							</option>
						))}
					</select>
				}
			/>
			{notice ? (
				<p role="status" className="tr-text-metadata text-text-muted py-8">
					{notice}
				</p>
			) : null}
		</div>
	);
}
