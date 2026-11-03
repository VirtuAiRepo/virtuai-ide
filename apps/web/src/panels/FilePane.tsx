import { useT } from "@thinkrail/locales/react";
import {
	describeResource,
	PENDING_TEXT_META,
	RendererToggles,
	RendererView,
	rendererImplementationKey,
	resourceContent,
	UnplacedReviewStrip,
	useRendererSelection,
} from "@thinkrail/resource-renderers";
import { Button } from "@thinkrail/ui/button";
import { LoadingRegion } from "@thinkrail/ui/skeleton";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { isPhoneViewport } from "../lib";
import type { FileTab } from "../store";
import { useAppStore } from "../store";
import { getTransport } from "../transport";
import { resourceBytesUrl, useResetViewStateOnImplementationChange } from "./resourcePane";
import { reviewFlagFor } from "./reviewModel";
import { SendReviewButton } from "./SendReviewButton";
import { useLiveTabContent } from "./useLiveTabContent";
import { useFileReview } from "./useReviewCommenting";

const loading = <LoadingRegion rows={12} className="h-full p-12" testId="file-pane-loading" />;

export function FilePane({ tab }: { tab: FileTab }) {
	const t = useT();
	const setTabRenderer = useAppStore((state) => state.setTabRenderer);
	const review = useFileReview(tab.workspaceId, tab.path, "inline");
	const reviewComments = useAppStore(
		(state) => state.reviewsByWorkspace[tab.workspaceId]?.comments,
	);
	const fileHasDraft = useMemo(
		() => reviewFlagFor(reviewComments, tab.path) === "draft",
		[reviewComments, tab.path],
	);
	const [draft, setDraft] = useState<string | null>(null);
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const dirtyRef = useRef(false);
	dirtyRef.current = dirty;

	useEffect(() => {
		setDraft(null);
		setDirty(false);
		setSaveError(null);
	}, [tab.id, tab.path]);

	useLiveTabContent(tab, {
		read: () =>
			getTransport().request("fs.readFile", { workspaceId: tab.workspaceId, path: tab.path }),
		applyFresh: ({ content, meta }, tick) => {
			if (dirtyRef.current) {
				useAppStore
					.getState()
					.updateFileTabContent(tab.workspaceId, tab.id, tab.content, tab.meta, tick);
				return;
			}
			useAppStore.getState().updateFileTabContent(tab.workspaceId, tab.id, content, meta, tick);
		},
		keepCurrent: (tick) =>
			useAppStore
				.getState()
				.updateFileTabContent(tab.workspaceId, tab.id, tab.content, tab.meta, tick),
	});

	const displayContent = draft ?? tab.content;
	const resource = useMemo(
		() => describeResource(tab.workspaceId, tab.path, tab.meta ?? PENDING_TEXT_META),
		[tab.workspaceId, tab.path, tab.meta],
	);
	const { mobile, candidates, renderer, implementationKey, placedThreadIds, onPlacedThreadIds } =
		useRendererSelection(resource, "view", tab.rendererId);
	useResetViewStateOnImplementationChange(tab.workspaceId, tab.id, implementationKey);
	const content = resourceContent(displayContent, tab.meta, () =>
		resourceBytesUrl(tab.workspaceId, tab.path),
	);
	const reviews = [review.worktree];
	const showToolbar = candidates.length >= 2 || fileHasDraft || dirty || Boolean(saveError);
	const saveViewState = (state: unknown) => {
		const current = useAppStore
			.getState()
			.tabsByWorkspace[tab.workspaceId]?.find((candidate) => candidate.id === tab.id);
		if (
			current?.kind === "file" &&
			(current.rendererId === undefined || current.rendererId === renderer.id) &&
			rendererImplementationKey(renderer.id, isPhoneViewport()) === implementationKey
		) {
			useAppStore.getState().setTabViewState(tab.workspaceId, tab.id, state);
		}
	};

	const save = async () => {
		if (!dirty || saving) return;
		const next = draft ?? tab.content;
		setSaving(true);
		setSaveError(null);
		try {
			const result = await getTransport().request("fs.writeFile", {
				workspaceId: tab.workspaceId,
				path: tab.path,
				content: next,
			});
			useAppStore
				.getState()
				.updateFileTabContent(
					tab.workspaceId,
					tab.id,
					result.content,
					result.meta,
					tab.loadedTick ?? 0,
				);
			setDraft(null);
			setDirty(false);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	const saveRef = useRef(save);
	saveRef.current = save;
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
			if (!dirtyRef.current) return;
			event.preventDefault();
			void saveRef.current();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<div className="flex h-full min-h-0 flex-col">
			{showToolbar ? (
				<div
					data-testid="resource-view-toggle"
					role="toolbar"
					aria-label={t("panels.filePane.resourceView")}
					className="flex h-32 shrink-0 items-center justify-end gap-4 border-border-default border-b bg-container-header-bg px-12"
				>
					{saveError ? (
						<span className="mr-auto tr-text-metadata text-feedback-error">{saveError}</span>
					) : null}
					{dirty ? (
						<Button
							variant="primary"
							size="s"
							disabled={saving}
							data-testid="file-pane-save"
							onClick={() => void save()}
						>
							{saving ? t("panels.filePane.saving") : t("panels.filePane.save")}
						</Button>
					) : null}
					<SendReviewButton workspaceId={tab.workspaceId} path={tab.path} />
					<RendererToggles
						candidates={candidates}
						renderer={renderer}
						onRendererId={(rendererId) => setTabRenderer(tab.workspaceId, tab.id, rendererId)}
					/>
				</div>
			) : null}
			<UnplacedReviewStrip
				reviews={reviews}
				renderer={renderer}
				intent="view"
				candidates={candidates}
				{...(placedThreadIds ? { placedThreadIds } : {})}
				onSelectRenderer={(rendererId) => setTabRenderer(tab.workspaceId, tab.id, rendererId)}
			/>
			<div className="min-h-0 flex-1">
				<Suspense fallback={loading}>
					<RendererView
						key={implementationKey}
						renderer={renderer}
						mobile={mobile}
						resource={resource}
						content={content}
						review={review.worktree}
						onPlacedThreadIds={onPlacedThreadIds}
						viewState={tab.viewState}
						onViewState={saveViewState}
						{...(content.kind === "text"
							? {
									onTextChange: (next: string) => {
										setDraft(next);
										setDirty(next !== tab.content);
										setSaveError(null);
									},
								}
							: {})}
					/>
				</Suspense>
			</div>
		</div>
	);
}
