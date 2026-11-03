import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@thinkrail/ui/dialog";
import { useEffect, useState } from "react";

export function NamePromptDialog({
	open,
	title,
	description,
	label,
	placeholder,
	confirmLabel,
	confirmTestId,
	initialValue = "",
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	title: string;
	description?: string;
	label: string;
	placeholder?: string;
	confirmLabel: string;
	confirmTestId?: string;
	initialValue?: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: (value: string) => void | Promise<void>;
}) {
	const t = useT();
	const [value, setValue] = useState(initialValue);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const canSubmit = value.trim() !== "" && !busy;

	useEffect(() => {
		if (!open) return;
		setValue(initialValue);
		setBusy(false);
		setError(null);
	}, [open, initialValue]);

	const submit = async () => {
		const next = value.trim();
		if (!next || busy) return;
		setBusy(true);
		setError(null);
		try {
			await onConfirm(next);
			onOpenChange(false);
		} catch (err) {
			setBusy(false);
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
			<DialogContent data-testid="name-prompt-dialog" className="max-w-[24rem] gap-12">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? <DialogDescription>{description}</DialogDescription> : null}
				</DialogHeader>
				<form
					className="flex flex-col gap-12"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<label className="flex flex-col gap-4">
						<span className="tr-title-compact text-text-default">{label}</span>
						<input
							data-testid="name-prompt-input"
							autoFocus
							autoComplete="off"
							spellCheck={false}
							value={value}
							placeholder={placeholder}
							disabled={busy}
							onChange={(event) => setValue(event.target.value)}
							className="w-full min-w-0 rounded-sm border border-control-border-default bg-control-bg px-12 py-8 tr-text-ui text-text-default outline-none transition-colors placeholder:text-text-muted focus-visible:border-control-border-active"
						/>
					</label>
					{error ? (
						<p data-testid="name-prompt-error" className="tr-text-metadata text-feedback-error">
							{error}
						</p>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={busy}
							onClick={() => onOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="primary"
							type="submit"
							disabled={!canSubmit}
							data-testid={confirmTestId}
						>
							{confirmLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
