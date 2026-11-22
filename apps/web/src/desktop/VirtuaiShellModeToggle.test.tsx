import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VirtuaiShellModeToggle } from "./VirtuaiShellModeToggle";
import { canSwitchVirtuaiShell, switchVirtuaiShellToChat } from "./virtuaiShell";

afterEach(() => {
	Reflect.deleteProperty(globalThis, "__VIRTUAI_DESKTOP__");
});

test("hides when the desktop bridge cannot switch shells", () => {
	expect(canSwitchVirtuaiShell()).toBe(false);
	expect(renderToStaticMarkup(<VirtuaiShellModeToggle />)).toBe("");
});

test("renders Chat and Dev when the IDE bridge is present", () => {
	Reflect.set(globalThis, "__VIRTUAI_DESKTOP__", {
		switchToChat: () => {},
		switchToDev: () => {},
	});
	const html = renderToStaticMarkup(<VirtuaiShellModeToggle mode="dev" />);
	expect(html).toContain('data-testid="virtuai-shell-mode"');
	expect(html).toContain('data-testid="virtuai-shell-chat"');
	expect(html).toContain('data-testid="virtuai-shell-dev"');
	expect(html).toContain('aria-pressed="true"');
});

test("switchVirtuaiShellToChat calls the bridge", () => {
	const switchToChat = () => {
		(globalThis as { __called?: boolean }).__called = true;
	};
	Reflect.set(globalThis, "__VIRTUAI_DESKTOP__", {
		switchToChat,
		switchToDev: () => {},
	});
	expect(switchVirtuaiShellToChat()).toBe(true);
	expect((globalThis as { __called?: boolean }).__called).toBe(true);
});
