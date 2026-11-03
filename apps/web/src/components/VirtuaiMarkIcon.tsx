import { cn } from "@thinkrail/ui/utils";

/** VirtuAI mark. `tone="ink"` flattens the colour mark to UI black/white. */
export function VirtuaiMarkIcon({
	className,
	tone = "color",
	testId = "virtuai-mark-icon",
}: {
	className?: string | undefined;
	tone?: "color" | "ink";
	testId?: string;
}) {
	return (
		<img
			data-testid={testId}
			src="/virtuai-mark.png"
			alt=""
			draggable={false}
			className={cn(
				"inline-block shrink-0 object-contain",
				tone === "ink" &&
					"[filter:brightness(0)] opacity-[0.72] dark:[filter:brightness(0)_invert(1)] dark:opacity-90",
				className,
			)}
		/>
	);
}
