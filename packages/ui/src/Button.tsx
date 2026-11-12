import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

export type ButtonProps = ComponentProps<typeof BaseButton> & {
	variant?: "default" | "primary" | "danger";
};

export function Button({
	variant = "default",
	className,
	...props
}: ButtonProps) {
	return (
		<BaseButton
			{...props}
			data-variant={variant}
			className={["vp-button", className].filter(Boolean).join(" ")}
		/>
	);
}
