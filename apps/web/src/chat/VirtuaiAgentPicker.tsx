import { useT } from "@thinkrail/locales/react";
import { useEffect, useState } from "react";

interface VirtuaiAgentChoice {
	id: string;
	name: string;
}

interface AgentList {
	agents: VirtuaiAgentChoice[];
	selectedId: string;
}

interface DesktopBridge {
	listAgents?: () => Promise<AgentList>;
	selectAgent?: (agentId: string) => Promise<void> | void;
	openAgents?: () => void;
}

/** Sentinel select value — not an agent id. */
const MANAGE_AGENTS = "__virtuai_manage_agents__";

function desktopBridge(): DesktopBridge | null {
	const value = Reflect.get(globalThis, "__VIRTUAI_DESKTOP__");
	if (typeof value !== "object" || value === null) return null;
	return value as DesktopBridge;
}

export function VirtuaiAgentPicker() {
	const t = useT();
	const bridge = desktopBridge();
	const [agents, setAgents] = useState<VirtuaiAgentChoice[]>([]);
	const [selected, setSelected] = useState("");
	useEffect(() => {
		if (!bridge?.listAgents) return;
		let cancelled = false;
		void bridge.listAgents().then((result) => {
			if (cancelled) return;
			setAgents(result.agents);
			const listed = result.agents.some((agent) => agent.id === result.selectedId);
			const next = listed ? result.selectedId : (result.agents[0]?.id ?? "");
			setSelected(next);
			// Stale env id (classic / deleted) must not stick after Completions filter.
			if (next && next !== result.selectedId) void bridge.selectAgent?.(next);
		});
		return () => {
			cancelled = true;
		};
	}, [bridge]);
	if (!bridge?.listAgents || agents.length === 0) return null;
	return (
		<select
			data-testid="virtuai-agent"
			aria-label={t("chat.agent.label")}
			className="max-w-[220px] truncate bg-transparent text-text-default tr-text-metadata outline-none"
			value={selected}
			onChange={(event) => {
				const agentId = event.target.value;
				if (agentId === MANAGE_AGENTS) {
					// Keep the previous agent selected in the control.
					event.target.value = selected;
					bridge.openAgents?.();
					return;
				}
				setSelected(agentId);
				void bridge.selectAgent?.(agentId);
			}}
		>
			{agents.map((agent) => (
				<option key={agent.id} value={agent.id}>
					{agent.name}
				</option>
			))}
			{bridge.openAgents ? (
				<option value={MANAGE_AGENTS}>{t("chat.agent.manage")}</option>
			) : null}
		</select>
	);
}
