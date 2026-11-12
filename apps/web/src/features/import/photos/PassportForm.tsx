import { isIsoDate } from "@voyput/core";
import { Button, Notice, TextField } from "@voyput/ui";
import { type FormEvent, useState } from "react";
import { type PassportInput, storageErrorMessage } from "./passportStore";

/** Name and validity dates of a passport; used to create and to edit one. */
export function PassportForm({
	initial,
	submitLabel,
	layout = "row",
	onSubmit,
}: {
	initial?: PassportInput;
	/** "row" puts the fields side by side on wide screens; "stacked" for dialogs. */
	layout?: "row" | "stacked";
	submitLabel: string;
	onSubmit: (input: PassportInput) => Promise<void>;
}) {
	const [name, setName] = useState(initial?.name ?? "");
	const [validFrom, setValidFrom] = useState(initial?.validFrom ?? "");
	const [validTo, setValidTo] = useState(initial?.validTo ?? "");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return setError("Give the passport a name.");
		for (const date of [validFrom, validTo]) {
			if (date && !isIsoDate(date))
				return setError(`"${date}" is not a date in YYYY-MM-DD form.`);
		}
		if (validFrom && validTo && validFrom > validTo)
			return setError("Valid from must not be after valid to.");
		setError(null);
		setSaving(true);
		try {
			await onSubmit({
				name: trimmed,
				validFrom: validFrom || null,
				validTo: validTo || null,
			});
		} catch (failure) {
			return setError(storageErrorMessage("save the passport", failure));
		} finally {
			setSaving(false);
		}
		if (!initial) {
			setName("");
			setValidFrom("");
			setValidTo("");
		}
	};

	return (
		<form
			onSubmit={submit}
			className="import-passport-form"
			data-layout={layout}
		>
			<TextField label="Passport name" value={name} onChange={setName} />
			<TextField
				label="Valid from"
				value={validFrom}
				onChange={setValidFrom}
				placeholder="YYYY-MM-DD"
				description="Optional. Helps flag misread stamp years."
			/>
			<TextField
				label="Valid to"
				value={validTo}
				onChange={setValidTo}
				placeholder="YYYY-MM-DD"
			/>
			<div className="import-form-submit">
				<Button type="submit" variant="primary" disabled={saving}>
					{submitLabel}
				</Button>
			</div>
			{error ? (
				<Notice tone="bad" role="alert">
					{error}
				</Notice>
			) : null}
		</form>
	);
}
