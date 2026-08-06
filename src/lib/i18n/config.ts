export const LOCALES = ["fr", "ar", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export type Direction = "ltr" | "rtl";

export const LOCALE_META: Record<Locale, { label: string; dir: Direction; htmlLang: string }> = {
  fr: { label: "Français", dir: "ltr", htmlLang: "fr" },
  ar: { label: "العربية", dir: "rtl", htmlLang: "ar" },
  en: { label: "English", dir: "ltr", htmlLang: "en" },
};

export const DEFAULT_LOCALE: Locale = "fr";

export const LOCALE_STORAGE_KEY = "madrasti.locale";
