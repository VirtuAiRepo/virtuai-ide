import { useT } from "@thinkrail/locales/react";
import { cn } from "@thinkrail/ui/utils";

export function RunningIcon({ className }: { className?: string | undefined }) {
	const t = useT();
	return (
		<span
			data-testid="running-icon"
			data-running="true"
			role="img"
			aria-label={t("components.runningIcon.label")}
			className={cn("inline-flex shrink-0 items-center justify-center", className)}
		>
			<img
				data-testid="running-icon-mark"
				src="/virtuai-mark.png"
				alt=""
				className="size-full motion-safe:animate-pulse"
			/>
		</span>
	);
}
