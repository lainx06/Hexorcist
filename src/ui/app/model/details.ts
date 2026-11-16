// Details_Switch stored value mapping. Storage access belongs to the views. Pure.
export const DETAILS_KEY = "hexorcist.showTechnicalDetails";

export function detailsFromStored(v: string | null | undefined): boolean {
  return v === "on";
}
