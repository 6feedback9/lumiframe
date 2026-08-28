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
    "nav.feedback": "Відгуки",
    "nav.team": "Команда",
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
    "tenants.active": "Активні клієнти",
    "tenants.newThisMonth": "Нові цього місяця",
    "tenants.tryOnsThisMonth": "Примірки цього місяця",
    "tenants.pendingRequests": "Запити, що очікують",
    "tenants.mrr": "Оцінка MRR (за призначеними тарифами)",
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
    "tenantDetail.tabOverview": "Огляд",
    "tenantDetail.tabPlan": "Тариф",
    "tenantDetail.tabButton": "Кнопка",
    "tenantDetail.tabTeam": "Команда",
    "tenantDetail.tabProducts": "Товари",

    "buttonDesign.title": "Оформлення кнопки клієнта",
    "buttonDesign.label": "Текст кнопки",
    "buttonDesign.color1": "Колір (початок)",
    "buttonDesign.color2": "Колір (кінець)",
    "buttonDesign.textColor": "Колір тексту",
    "buttonDesign.font": "Шрифт",
    "buttonDesign.glow": "Світіння",
    "buttonDesign.preview": "Попередній перегляд",
    "buttonDesign.fontDefault": "За замовчуванням",
    "buttonDesign.style": "Заливка",
    "buttonDesign.styleGradient": "Градієнт",
    "buttonDesign.styleSolid": "Однотонна",
    "buttonDesign.size": "Розмір",
    "buttonDesign.width": "Довжина кнопки",
    "buttonDesign.shape": "Форма кнопки",
    "buttonDesign.shapeRounded": "Заокруглена",
    "buttonDesign.shapeRectangular": "Прямокутна",
    "buttonDesign.animation": "Анімація",
    "buttonDesign.animationNone": "Без анімації",
    "buttonDesign.animationPulse": "Пульсуюче кільце",
    "buttonDesign.animationShimmer": "Світловий відблиск",
    "buttonDesign.placementTitle": "Розташування та вікно примірки",
    "buttonDesign.position": "Де розмістити кнопку",
    "buttonDesign.positionAfter": "Після кнопки «Додати в кошик»",
    "buttonDesign.positionBefore": "Перед кнопкою «Додати в кошик»",
    "buttonDesign.positionFloating": "Плаваюча кнопка (кут екрана)",
    "buttonDesign.anchorSelector": "CSS-селектор (необов'язково)",
    "buttonDesign.modalWidth": "Максимальна ширина вікна примірки",
    "buttonDesign.modalWidthAuto": "На весь екран (за замовчуванням)",
    "buttonDesign.modalWidthMd": "Обмежена — стандартна",
    "buttonDesign.modalWidthLg": "Обмежена — широка",
    "buttonDesign.modalButtons": "Кнопки у вікні результату",
    "buttonDesign.showTryAnother": "«Спробувати інше фото»",
    "buttonDesign.showBack": "«Повернутись до товару»",
    "buttonDesign.modalTextTitle": "Текст вікна примірки",
    "buttonDesign.modalColorTitle": "Кольори вікна примірки",
    "buttonDesign.modalColorNote": "За замовчуванням — ті самі кольори, що й у кнопки. Змініть тут для окремого кольору вікна.",
    "buttonDesign.modalHeading": "Заголовок",
    "buttonDesign.modalSubheading": "Підзаголовок",

    "team.title": "Команда клієнта",
    "team.email": "Email",
    "team.password": "Пароль",
    "team.role": "Роль",
    "team.addUser": "Додати користувача",
    "team.remove": "Видалити",
    "team.adminTitle": "Команда платформи",
    "team.adminDesc": "Акаунти з повним доступом до цього адмін-кабінету — бачать усіх клієнтів, як і ви.",
    "team.adminAddWarning": "Новий акаунт отримає такий самий доступ, як у вас — до всіх клієнтів і всіх даних платформи.",
    "team.lastLogin": "Останній вхід",
    "team.never": "ще не заходив(-ла)",
    "team.createdAt": "Додано",
    "team.you": "(ви)",

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

    "feedback.title": "Відгуки клієнтів — усі магазини",
    "feedback.desc": "Лайки та дизлайки, які покупці залишили на результатах примірки, по всій платформі.",
    "feedback.filter": "Показати",
    "feedback.filterAll": "Усі з відгуком",
    "feedback.filterLike": "Тільки лайки",
    "feedback.filterDislike": "Тільки дизлайки",
    "feedback.tenant": "Клієнт",
    "feedback.store": "Магазин",
    "feedback.product": "Товар",
    "feedback.result": "Результат",
    "feedback.rating": "Відгук",
    "feedback.like": "👍 Подобається",
    "feedback.dislike": "👎 Не подобається",
    "feedback.date": "Дата",
    "feedback.empty": "Ще немає відгуків від клієнтів.",
  },
  en: {
    "nav.tenants": "Tenants",
    "nav.tryons": "Try-ons",
    "nav.feedback": "Feedback",
    "nav.team": "Team",
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
    "tenants.total": "Total clients",
    "tenants.active": "Active clients",
    "tenants.newThisMonth": "New this month",
    "tenants.tryOnsThisMonth": "Try-ons this month",
    "tenants.pendingRequests": "Pending requests",
    "tenants.mrr": "Estimated MRR (assigned plans)",
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
    "tenantDetail.tabOverview": "Overview",
    "tenantDetail.tabPlan": "Plan",
    "tenantDetail.tabButton": "Button",
    "tenantDetail.tabTeam": "Team",
    "tenantDetail.tabProducts": "Products",

    "buttonDesign.title": "Client's button design",
    "buttonDesign.label": "Button label",
    "buttonDesign.color1": "Color (start)",
    "buttonDesign.color2": "Color (end)",
    "buttonDesign.textColor": "Text color",
    "buttonDesign.font": "Font",
    "buttonDesign.glow": "Glow",
    "buttonDesign.preview": "Live preview",
    "buttonDesign.fontDefault": "Default",
    "buttonDesign.style": "Fill",
    "buttonDesign.styleGradient": "Gradient",
    "buttonDesign.styleSolid": "Solid",
    "buttonDesign.size": "Size",
    "buttonDesign.width": "Button length",
    "buttonDesign.shape": "Button shape",
    "buttonDesign.shapeRounded": "Rounded",
    "buttonDesign.shapeRectangular": "Rectangular",
    "buttonDesign.animation": "Animation",
    "buttonDesign.animationNone": "No animation",
    "buttonDesign.animationPulse": "Pulsing ring",
    "buttonDesign.animationShimmer": "Light shimmer",
    "buttonDesign.placementTitle": "Placement & try-on window",
    "buttonDesign.position": "Where to place the button",
    "buttonDesign.positionAfter": "After the \"Add to cart\" button",
    "buttonDesign.positionBefore": "Before the \"Add to cart\" button",
    "buttonDesign.positionFloating": "Floating button (screen corner)",
    "buttonDesign.anchorSelector": "CSS selector (optional)",
    "buttonDesign.modalWidth": "Try-on window max width",
    "buttonDesign.modalWidthAuto": "Full screen (default)",
    "buttonDesign.modalWidthMd": "Capped — standard",
    "buttonDesign.modalWidthLg": "Capped — wide",
    "buttonDesign.modalButtons": "Buttons on the result screen",
    "buttonDesign.showTryAnother": "\"Try another photo\"",
    "buttonDesign.showBack": "\"Back to product\"",
    "buttonDesign.modalTextTitle": "Try-on window text",
    "buttonDesign.modalColorTitle": "Try-on window colors",
    "buttonDesign.modalColorNote": "Defaults to the same colors as the button. Change them here for a window-specific color.",
    "buttonDesign.modalHeading": "Heading",
    "buttonDesign.modalSubheading": "Subheading",

    "team.title": "Client's team",
    "team.email": "Email",
    "team.password": "Password",
    "team.role": "Role",
    "team.addUser": "Add user",
    "team.remove": "Remove",
    "team.adminTitle": "Platform team",
    "team.adminDesc": "Accounts with full access to this admin console — they see every client, same as you.",
    "team.adminAddWarning": "A new account gets the same access as you — to every client and all platform data.",
    "team.lastLogin": "Last login",
    "team.never": "never signed in",
    "team.createdAt": "Added",
    "team.you": "(you)",

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

    "feedback.title": "Customer feedback — all stores",
    "feedback.desc": "Likes and dislikes shoppers left on their try-on results, across the whole platform.",
    "feedback.filter": "Show",
    "feedback.filterAll": "All with feedback",
    "feedback.filterLike": "Likes only",
    "feedback.filterDislike": "Dislikes only",
    "feedback.tenant": "Tenant",
    "feedback.store": "Store",
    "feedback.product": "Product",
    "feedback.result": "Result",
    "feedback.rating": "Feedback",
    "feedback.like": "👍 Like",
    "feedback.dislike": "👎 Dislike",
    "feedback.date": "Date",
    "feedback.empty": "No customer feedback yet.",
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
