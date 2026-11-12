import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";

export interface TextFieldProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	description?: string;
	placeholder?: string;
	type?: "text" | "password";
}

export function TextField({
	label,
	value,
	onChange,
	description,
	placeholder,
	type = "text",
}: TextFieldProps) {
	return (
		<Field.Root className="vp-field">
			<Field.Label className="vp-field-label">{label}</Field.Label>
			<Input
				className="vp-input"
				type={type}
				value={value}
				placeholder={placeholder}
				onValueChange={(next) => onChange(next)}
			/>
			{description ? (
				<Field.Description className="vp-field-description">
					{description}
				</Field.Description>
			) : null}
		</Field.Root>
	);
}
