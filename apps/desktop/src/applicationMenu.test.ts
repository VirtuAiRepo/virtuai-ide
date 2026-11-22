import { expect, test } from "bun:test";
import type { ApplicationMenuItemConfig } from "electrobun/main";
import {
	desktopApplicationMenu,
	installDesktopApplicationMenu,
	isNativeCommand,
	QUIT_SHORTCUT_ACTION,
	readMenuAction,
	readMenuLabels,
	SHOW_CHAT_ACTION,
	SHOW_DEV_ACTION,
} from "./applicationMenu";

const editMenu: ApplicationMenuItemConfig = {
	label: "Edit",
	submenu: [
		{ role: "undo" },
		{ role: "redo" },
		{ type: "separator" },
		{ role: "cut" },
		{ role: "copy" },
		{ role: "paste" },
		{ role: "pasteAndMatchStyle" },
		{ role: "delete" },
		{ role: "selectAll" },
	],
};

test("builds the native macOS application, edit, view, and window menus", () => {
	expect(desktopApplicationMenu("darwin")).toEqual([
		{
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ label: "Settings…", action: "open-settings", accelerator: "CommandOrControl+," },
				{ type: "separator" },
				{ role: "hide", accelerator: "CommandOrControl+H" },
				{ role: "hideOthers", accelerator: "CommandOrControl+Alt+H" },
				{ role: "showAll" },
				{ type: "separator" },
				{
					label: "Quit VirtuAI",
					action: QUIT_SHORTCUT_ACTION,
					accelerator: "CommandOrControl+Q",
				},
			],
		},
		editMenu,
		{
			label: "View",
			submenu: [
				{ label: "Chat", action: SHOW_CHAT_ACTION, accelerator: "CommandOrControl+1" },
				{ label: "Dev", action: SHOW_DEV_ACTION, accelerator: "CommandOrControl+2" },
			],
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize", accelerator: "CommandOrControl+M" },
				{ role: "zoom" },
				{ label: "Close", action: "close-item", accelerator: "CommandOrControl+W" },
				{ type: "separator" },
				{ role: "bringAllToFront" },
			],
		},
	]);
});

test("builds the supported Windows edit menu and skips Linux", () => {
	expect(desktopApplicationMenu("win32")).toEqual([editMenu]);
	expect(desktopApplicationMenu("linux")).toBeNull();
});

test("registers the menu exactly once on supported platforms", () => {
	const calls: ApplicationMenuItemConfig[][] = [];
	const applicationMenu = {
		setApplicationMenu(menu: ApplicationMenuItemConfig[]) {
			calls.push(menu);
		},
	};
	const darwinMenu = desktopApplicationMenu("darwin");
	if (!darwinMenu) throw new Error("macOS application menu is missing");

	expect(installDesktopApplicationMenu(applicationMenu, "darwin")).toBe(true);
	expect(calls).toEqual([darwinMenu]);
	calls.length = 0;
	expect(installDesktopApplicationMenu(applicationMenu, "linux")).toBe(false);
	expect(calls).toEqual([]);
});

test("reads the action from an application-menu-clicked event", () => {
	expect(readMenuAction({ data: { id: 3, action: QUIT_SHORTCUT_ACTION } })).toBe(
		QUIT_SHORTCUT_ACTION,
	);
	expect(readMenuAction({ data: { action: 7 } })).toBeNull();
	expect(readMenuAction({ data: null })).toBeNull();
	expect(readMenuAction(undefined)).toBeNull();
});

test("recognizes forwarded native commands only", () => {
	expect(isNativeCommand("close-item")).toBe(true);
	expect(isNativeCommand("open-settings")).toBe(true);
	expect(isNativeCommand(QUIT_SHORTCUT_ACTION)).toBe(false);
	expect(isNativeCommand(null)).toBe(false);
	expect(isNativeCommand("toString")).toBe(false);
});

test("translated labels rename the custom items and fall back to English per label", () => {
	const labels = readMenuLabels({
		"desktop.menu.edit": "Bearbeiten",
		"desktop.menu.window": "",
		"desktop.menu.quit": 3,
		"desktop.menu.close": "x".repeat(81),
		"desktop.menu.settings": "Einstellungen…",
	});
	expect(labels).toEqual({
		"desktop.menu.edit": "Bearbeiten",
		"desktop.menu.settings": "Einstellungen…",
		"desktop.menu.quit": "Quit VirtuAI",
		"desktop.menu.window": "Window",
		"desktop.menu.close": "Close",
		"desktop.menu.view": "View",
		"desktop.menu.chat": "Chat",
		"desktop.menu.dev": "Dev",
	});
	const menu = desktopApplicationMenu("darwin", labels);
	expect(menu?.[1]).toMatchObject({ label: "Bearbeiten" });
	expect(JSON.stringify(menu)).toContain("Einstellungen…");
	expect(desktopApplicationMenu("win32", labels)?.[0]).toMatchObject({ label: "Bearbeiten" });
});
