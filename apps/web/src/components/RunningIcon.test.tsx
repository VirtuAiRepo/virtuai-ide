import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RunningIcon } from "./RunningIcon";

test("running icon is the VirtuAI mark", () => {
	const markup = renderToStaticMarkup(<RunningIcon className="size-14 text-primary" />);
	expect(markup).toContain('aria-label="Agent working"');
	expect(markup).toContain('data-testid="running-icon"');
	expect(markup).toContain('data-testid="running-icon-mark"');
	expect(markup).toContain('src="/virtuai-mark.png"');
	expect(markup).toContain("motion-safe:animate-pulse");
	expect(markup).toContain("size-14 text-primary");
	expect(markup).not.toContain("loader-r-");
});
