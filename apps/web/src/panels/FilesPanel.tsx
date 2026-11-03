import {
	RiCollapseVerticalLine,
	RiFileAddLine,
	RiFolderAddLine,
} from "@remixicon/react";
import { useT } from "@thinkrail/locales/react";
import { ToggleSegment } from "@thinkrail/ui/toggle-segment";
import { useEffect, useMemo, useRef, useState } from "react";
import { selectActiveFilePath, selectFilesTreeView, useAppStore } from "../store";
import { getTransport } from "../transport";
import { ChangesPanel } from "./ChangesPanel";
import {
	buildChangeMarks,
	buildChangesTree,
	type ChangeMarks,
	changeTreeFolderPaths,
} from "./changesModel";
import { FileTree } from "./FileTree";
import { HeaderIconButton } from "./HeaderIconButton";
import { NamePromptDialog } from "./NamePromptDialog";
import { openFileInTab } from "./openTabs";
import { RememberedScrollArea } from "./RememberedScrollArea";
import { useGitStatus } from "./useGitStatus";

export function FilesPanel({ workspaceId }: { workspaceId: string }) {
	const t = useT();
	const mode = useAppStore((s) => s.filesMode);
	const setMode = useAppStore((s) => s.setFilesMode);
	const changesView = useAppStore((s) => s.changesView);
	const { status, error, reload } = useGitStatus(workspaceId);
	const marks = useMemo(() => buildChangeMarks(status?.changes ?? []), [status]);
	const count = status?.changes.length ?? 0;
	const canCollapse = mode === "all" || (changesView === "tree" && count > 0);
	const [createKind, setCreateKind] = useState<"file" | "folder" | null>(null);
	const [treeEpoch, setTreeEpoch] = useState(0);
	const collapseAll = () => {
		const store = useAppStore.getState();
		if (mode === "all") store.collapseAllFiles(workspaceId);
		else if (status) {
			store.setChangedTreeCollapsed(
				workspaceId,
				changeTreeFolderPaths(buildChangesTree(status.changes)),
				true,
			);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div
				data-testid="files-mode-toggle"
				role="toolbar"
				aria-label={t("panels.files.toolbar")}
				className="flex h-panel-header-row shrink-0 items-center gap-4 overflow-clip border-border-default border-b px-12"
			>
				<ToggleSegment
					testid="files-mode-all"
					label={t("panels.files.all")}
					active={mode === "all"}
					onClick={() => setMode("all")}
				/>
				<ToggleSegment
					testid="files-mode-changed"
					label={count > 0 ? t("panels.files.changedCount", { count }) : t("panels.files.changed")}
					active={mode === "changed"}
					onClick={() => setMode("changed")}
				/>
				<div className="ml-auto flex shrink-0 gap-2">
					{mode === "all" ? (
						<>
							<HeaderIconButton
								testid="files-new-file"
								label={t("panels.files.newFile")}
								onClick={() => setCreateKind("file")}
								icon={RiFileAddLine}
							/>
							<HeaderIconButton
								testid="files-new-folder"
								label={t("panels.files.newFolder")}
								onClick={() => setCreateKind("folder")}
								icon={RiFolderAddLine}
							/>
						</>
					) : null}
					{canCollapse ? (
						<HeaderIconButton
							testid="files-collapse-all"
							label={t("panels.files.collapseAll")}
							onClick={collapseAll}
							icon={RiCollapseVerticalLine}
						/>
					) : null}
				</div>
			</div>
			{mode === "all" ? (
				<AllFiles workspaceId={workspaceId} marks={marks} treeEpoch={treeEpoch} />
			) : (
				<div className="min-h-0 flex-1">
					<ChangesPanel workspaceId={workspaceId} status={status} error={error} reload={reload} />
				</div>
			)}
			<NamePromptDialog
				open={createKind !== null}
				title={
					createKind === "folder" ? t("panels.files.newFolderTitle") : t("panels.files.newFileTitle")
				}
				description={t("panels.files.newPathHint")}
				label={t("panels.files.pathLabel")}
				placeholder={createKind === "folder" ? "docs/notes" : "src/hello.ts"}
				confirmLabel={t("panels.files.create")}
				confirmTestId="files-create-confirm"
				onOpenChange={(open) => {
					if (!open) setCreateKind(null);
				}}
				onConfirm={async (path) => {
					if (createKind === "folder") {
						await getTransport().request("fs.mkdir", { workspaceId, path });
					} else {
						await getTransport().request("fs.writeFile", {
							workspaceId,
							path,
							content: "",
						});
						await openFileInTab(workspaceId, path, "keep");
					}
					setTreeEpoch((n) => n + 1);
					setCreateKind(null);
				}}
			/>
		</div>
	);
}

function AllFiles({
	workspaceId,
	marks,
	treeEpoch,
}: {
	workspaceId: string;
	marks: ChangeMarks;
	treeEpoch: number;
}) {
	const activePath = useAppStore((s) => selectActiveFilePath(s, workspaceId));
	const [revealOnMount] = useState(
		() =>
			activePath !== null &&
			activePath !== selectFilesTreeView(useAppStore.getState(), workspaceId).seenActivePath,
	);
	const [revealTarget, setRevealTarget] = useState<string | null>(null);
	const previousActive = useRef<string | null | undefined>(revealOnMount ? undefined : activePath);

	useEffect(() => {
		const before = previousActive.current;
		previousActive.current = activePath;
		if (activePath === null || activePath === before) return;
		useAppStore.getState().revealInFiles(workspaceId, activePath);
		setRevealTarget(activePath);
	}, [activePath, workspaceId]);

	return (
		<RememberedScrollArea
			workspaceId={workspaceId}
			view="all"
			restore={!revealOnMount}
			className="min-h-0 flex-1"
			viewportClassName="p-panel-inset"
		>
			<FileTree
				key={treeEpoch}
				workspaceId={workspaceId}
				marks={marks}
				activePath={activePath}
				revealTarget={revealTarget}
				onRevealed={() => setRevealTarget(null)}
			/>
		</RememberedScrollArea>
	);
}
