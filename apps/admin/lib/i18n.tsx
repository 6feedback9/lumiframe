"use client";

// Same lightweight pattern as apps/dashboard/lib/i18n.tsx — Ukrainian
// default, English fallback, persisted in localStorage.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Locale = "uk" | "en";
const LOCALE_KEY = "lumiframe_admin_locale";
const DEFAULT_LOCALE: Locale = "uk";

const DICT = {
  uk: {
    "nav.tenants": "Клієнти",
    "nav.tryons": "Примірки",
    "nav.tag": "Платформний адмін",

    "common.loading": "Завантаження…",
    "common.previous": "Назад",
    "common.next": "Далі",
    "common.save": "Зберегти",
    "common.saving": "Збереження…",
    "common.allStores": "Усі магазини",

    "login.title": "Вхід для платформного адміна",
    "login.email": "Email",
    "login.password": "Пароль",
    "login.submit": "Увійти",
    "login.submitting": "Вхід…",

    "tenants.title": "Клієнти — усі магазини на Lumi Frame",
    "tenants.total": "Усього клієнтів",
    "tenants.totalTryOns": "Усього примірок",
    "tenants.totalUnits": "Усього оплачуваних одиниць",
    "tenants.tenant": "Клієнт",
    "tenants.store": "Магазин",
    "tenants.status": "Статус",
    "tenants.plan": "Тариф",
    "tenants.usedThisMonth": "Цього місяця",
    "tenants.topUp": "Запас",
    "tenants.tryOns": "Примірки",
    "tenants.usageUnits": "Одиниці",
    "tenants.created": "Створено",
    "tenants.empty": "Ще немає клієнтів.",
    "tenants.noPlan": "Без тарифу",
    "tenants.pendingRequest": "Є запит від клієнта",
    "tenants.back": "← Усі клієнти",

    "tenantDetail.tryOnsAllTime": "Примірки (весь час)",
    "tenantDetail.billableUnits": "Оплачувані одиниці",
    "tenantDetail.teamMembers": "Учасники команди",
    "tenantDetail.store": "Магазин",
    "tenantDetail.url": "URL",
    "tenantDetail.status": "Статус",
    "tenantDetail.allowedDomains": "Дозволені домени",
    "tenantDetail.product": "Товар",
    "tenantDetail.created": "Створено",
    "tenantDetail.empty": "Ще немає примірок.",
    "tenantDetail.billingTitle": "Тариф і використання",
    "tenantDetail.currentPlan": "Поточний тариф",
    "tenantDetail.assignPlan": "Призначити тариф",
    "tenantDetail.noPlan": "Без тарифу",
    "tenantDetail.usedThisMonth": "Використано цього місяця",
    "tenantDetail.topUpCredits": "Запас додаткових примірок",
    "tenantDetail.addCredits": "Додати кредити",
    "tenantDetail.addCreditsPlaceholder": "напр. 50",
    "tenantDetail.pendingRequestTitle": "Запит від клієнта",
    "tenantDetail.viewAllTryOns": "Переглянути всі примірки цього клієнта →",

    "buttonDesign.title": "Оформлення кнопки клієнта",
    "buttonDesign.label": "Текст кнопки",
    "buttonDesign.color1": "Колір (початок)",
    "buttonDesign.color2": "Колір (кінець)",
    "buttonDesign.textColor": "Колір тексту",
    "buttonDesign.font": "Шрифт",
    "buttonDesign.glow": "Світіння",
    "buttonDesign.preview": "Попередній перегляд",
    "buttonDesign.fontDefault": "За замовчуванням",

    "tryons.title": "Усі примірки",
    "tryons.tenant": "Клієнт",
    "tryons.store": "Магазин",
    "tryons.product": "Товар",
    "tryons.status": "Статус",
    "tryons.createdAt": "Створено",
    "tryons.empty": "Ще немає примірок.",
    "tryons.selectStore": "Оберіть магазин",
    "tryons.countLabel": "Кількість примірок",

    "detail.back": "← Назад",
    "detail.productPhoto": "Фото товару",
    "detail.customerPhoto": "Фото клієнта",
    "detail.resultPhoto": "Результат",
    "detail.noPhoto": "Немає фото",
    "detail.notAvailable": "Недоступно",
  },
  en: {
    "nav.tenants": "Tenants",
    "nav.tryons": "Try-ons",
    "nav.tag": "Platform Admin",

    "common.loading": "Loading…",
    "common.previous": "Previous",
    "common.next": "Next",
    "common.save": "Save",
    "common.saving": "Saving…",
    "common.allStores": "All stores",

    "login.title": "Platform admin sign in",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in…",

    "tenants.title": "Tenants — every client on Lumi Frame",
    "tenants.total": "Total tenants",
    "tenants.totalTryOns": "Total try-ons (all time)",
    "tenants.totalUnits": "Total billable units",
    "tenants.tenant": "Tenant",
    "tenants.store": "Store",
    "tenants.status": "Status",
    "tenants.plan": "Plan",
    "tenants.usedThisMonth": "This month",
    "tenants.topUp": "Top-up",
    "tenants.tryOns": "Try-ons",
    "tenants.usageUnits": "Usage units",
    "tenants.created": "Created",
    "tenants.empty": "No tenants yet.",
    "tenants.noPlan": "No plan",
    "tenants.pendingRequest": "Has a pending request",
    "tenants.back": "← All tenants",

    "tenantDetail.tryOnsAllTime": "Try-ons (all time)",
    "tenantDetail.billableUnits": "Billable units",
    "tenantDetail.teamMembers": "Team members",
    "tenantDetail.store": "Store",
    "tenantDetail.url": "URL",
    "tenantDetail.status": "Status",
    "tenantDetail.allowedDomains": "Allowed domains",
    "tenantDetail.product": "Product",
    "tenantDetail.created": "Created",
    "tenantDetail.empty": "No try-ons yet.",
    "tenantDetail.billingTitle": "Plan & usage",
    "tenantDetail.currentPlan": "Current plan",
    "tenantDetail.assignPlan": "Assign plan",
    "tenantDetail.noPlan": "No plan",
    "tenantDetail.usedThisMonth": "Used this month",
    "tenantDetail.topUpCredits": "Top-up credits balance",
    "tenantDetail.addCredits": "Add credits",
    "tenantDetail.addCreditsPlaceholder": "e.g. 50",
    "tenantDetail.pendingRequestTitle": "Request from the merchant",
    "tenantDetail.viewAllTryOns": "View all of this tenant's try-ons →",

    "buttonDesign.title": "Client's button design",
    "buttonDesign.label": "Button label",
    "buttonDesign.color1": "Color (start)",
    "buttonDesign.color2": "Color (end)",
    "buttonDesign.textColor": "Text color",
    "buttonDesign.font": "Font",
    "buttonDesign.glow": "Glow",
    "buttonDesign.preview": "Live preview",
    "buttonDesign.fontDefault": "Default",

    "tryons.title": "All try-ons",
    "tryons.tenant": "Tenant",
    "tryons.store": "Store",
    "tryons.product": "Product",
    "tryons.status": "Status",
    "tryons.createdAt": "Created At",
    "tryons.empty": "No try-ons yet.",
    "tryons.selectStore": "Select a store",
    "tryons.countLabel": "Try-on count",

    "detail.back": "← Back",
    "detail.productPhoto": "Product photo",
    "detail.customerPhoto": "Customer photo",
    "detail.resultPhoto": "Result",
    "detail.noPhoto": "No photo",
    "detail.notAvailable": "Not available",
  },
} as const;

export type TranslationKey = keyof (typeof DICT)["en"];

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_KEY);
  return stored === "en" || stored === "uk" ? stored : DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // localStorage unavailable — locale just won't persist across reloads.
    }
  }, []);

  const t = useCallback((key: TranslationKey) => DICT[locale][key] ?? DICT.en[key] ?? key, [locale]);

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
