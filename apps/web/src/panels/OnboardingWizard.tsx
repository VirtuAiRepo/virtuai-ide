import { RiArrowRightLine as ArrowRight, RiFileTextLine as FileText, RiGitBranchLine as GitBranch, type RemixiconComponentType } from "@remixicon/react";
import type { MessageKey } from "@thinkrail/locales";
import { useT } from "@thinkrail/locales/react";
import { Button } from "@thinkrail/ui/button";
import { PRODUCT_NAME } from "@/constants/branding";

const INTRO_BEATS = [
	{
		icon: GitBranch,
		title: "panels.onboarding.intro.worktreesTitle",
		detail: "panels.onboarding.intro.worktreesDetail",
	},
	{
		icon: FileText,
		title: "panels.onboarding.intro.specsTitle",
		detail: "panels.onboarding.intro.specsDetail",
	},
] as const satisfies readonly {
	icon: RemixiconComponentType;
	title: MessageKey;
	detail: MessageKey;
}[];

/** First-run welcome. VirtuAI supplies the agent, so this never asks for a provider. */
export function OnboardingWizard({ onDone }: { onDone: () => void }) {
	const t = useT();
	return (
		<div
			data-testid="onboarding-wizard"
			data-step="intro"
			className="flex w-full max-w-[640px] flex-col items-center gap-24"
		>
			<div data-testid="onboarding-intro" className="flex flex-col items-center gap-24 text-center">
				<div className="flex flex-col items-center gap-8">
					<span className="tr-text-eyebrow text-text-muted">
						{t("panels.onboarding.intro.welcomeTo")}
					</span>
					<h1 data-testid="welcome-title" className="tr-brand-hero text-primary">
						{PRODUCT_NAME}
					</h1>
					<p className="tr-heading-sm text-text-default">{t("panels.onboarding.intro.tagline")}</p>
				</div>
				<ul className="grid w-full gap-12 sm:grid-cols-2">
					{INTRO_BEATS.map(({ icon: Icon, title, detail }) => (
						<li
							key={title}
							className="flex flex-col gap-8 rounded-sm border border-border-default bg-clip-padding bg-container-workspace-bg p-16 text-left"
						>
							<Icon className="size-16 text-primary" />
							<span className="tr-title-card text-text-default">{t(title)}</span>
							<span className="text-text-muted tr-text-metadata">{t(detail)}</span>
						</li>
					))}
				</ul>
				<Button
					variant="primary"
					size="l"
					iconRight={ArrowRight}
					data-testid="onboarding-start"
					onClick={onDone}
				>
					{t("panels.onboarding.intro.start")}
				</Button>
			</div>
			<Button variant="ghost" size="m" data-testid="onboarding-skip" onClick={onDone}>
				{t("panels.onboarding.skip")}
			</Button>
		</div>
	);
}
