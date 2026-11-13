import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

export type ButtonProps = ComponentProps<typeof BaseButton> & {
	/** primary: solid green; secondary: green outline; both set in the pixel font. */
	variant?: "default" | "primary" | "secondary" | "danger" | "ghost";
	size?: "sm" | "md";
	/** Equal padding on all sides, for a button that shows only an icon (give it an aria-label). */
	square?: boolean;
};

export function Button({
	variant = "default",
	size = "md",
	square = false,
	className,
	...props
}: ButtonProps) {
	return (
		<BaseButton
			{...props}
			data-variant={variant}
			data-size={size}
			data-square={square ? "" : undefined}
			className={["vp-button", className].filter(Boolean).join(" ")}
		/>
	);
}
