import { useT } from "@thinkrail/locales/react";
import { cn } from "@thinkrail/ui/utils";
import {
	canSwitchVirtuaiShell,
	switchVirtuaiShellToChat,
	switchVirtuaiShellToDev,
	type VirtuaiShellMode,
} from "./virtuaiShell";

/**
 * Chat | Dev control for the ThinkRail topbar. Only mounts inside VirtuAI IDE
 * (bridge exposes switchToChat / switchToDev). This surface is always Dev.
 */
export function VirtuaiShellModeToggle({ mode = "dev" }: { mode?: VirtuaiShellMode }) {
	const t = useT();
	if (!canSwitchVirtuaiShell()) return null;
	return (
		<fieldset
			aria-label={t("shell.virtuaiShell.label")}
			data-testid="virtuai-shell-mode"
			className="window-no-drag m-0 flex h-28 items-center rounded-sm border border-control-border-default p-2"
		>
			<button
				type="button"
				data-testid="virtuai-shell-chat"
				aria-pressed={mode === "chat"}
				title={t("shell.virtuaiShell.chatHint")}
				onClick={() => switchVirtuaiShellToChat()}
				className={cn(
					"rounded-sm px-8 py-2 tr-text-ui outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
					mode === "chat"
						? "bg-control-bg-selected text-text-default"
						: "text-text-muted hover:bg-control-bg-hovered hover:text-text-default",
				)}
			>
				{t("shell.virtuaiShell.chat")}
			</button>
			<button
				type="button"
				data-testid="virtuai-shell-dev"
				aria-pressed={mode === "dev"}
				title={t("shell.virtuaiShell.devHint")}
				onClick={() => switchVirtuaiShellToDev()}
				className={cn(
					"rounded-sm px-8 py-2 tr-text-ui outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
					mode === "dev"
						? "bg-control-bg-selected text-text-default"
						: "text-text-muted hover:bg-control-bg-hovered hover:text-text-default",
				)}
			>
				{t("shell.virtuaiShell.dev")}
			</button>
		</fieldset>
	);
}
