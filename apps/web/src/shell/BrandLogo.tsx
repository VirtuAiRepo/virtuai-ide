import { PRODUCT_NAME } from "../constants/branding";

export function BrandLogo() {
	return (
		<img
			data-testid="brand-logo"
			alt={PRODUCT_NAME}
			src="/virtuai-mark.png"
			width={32}
			height={32}
			className="size-[32px] shrink-0"
		/>
	);
}
