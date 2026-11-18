import { useMediaQuery } from "../../app/useMediaQuery";

/** Widths that get the phone layout of Insights (one column, bottom sheet). */
export const PHONE_QUERY = "(max-width: 600px)";

/** Whether the viewport is phone-wide; false where `matchMedia` is missing. */
export const usePhone = (): boolean => useMediaQuery(PHONE_QUERY);
