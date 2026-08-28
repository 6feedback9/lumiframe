"use client";

// Lightweight dictionary-based i18n — no ICU/pluralization, just key ->
// string per locale, which is all this dashboard's UI needs. Ukrainian is
// the default (the merchant-facing product's primary market); English is
// the fallback/secondary. Persisted per-browser in localStorage, same
// pattern as the auth token (lib/api.ts).

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Locale = "uk" | "en";
const LOCALE_KEY = "lumiframe_dashboard_locale";
const DEFAULT_LOCALE: Locale = "uk";

const DICT = {
  uk: {
    "nav.overview": "Огляд",
    "nav.tryons": "Примірки",
    "nav.integration": "Кнопка та інтеграція",
    "nav.team": "Команда",
    "nav.billing": "Тариф",
    "nav.poweredBy": "на базі Lumi Frame",

    "common.loading": "Завантаження…",
    "common.save": "Зберегти",
    "common.saving": "Збереження…",
    "common.saved": "Збережено",
    "common.cancel": "Скасувати",
    "common.copy": "Копіювати",
    "common.copied": "Скопійовано",
    "common.previous": "Назад",
    "common.next": "Далі",
    "common.allTime": "За весь час",
    "common.close": "Закрити",
    "common.language": "Мова",

    "login.title": "Увійти в Lumi Frame",
    "login.email": "Email",
    "login.password": "Пароль",
    "login.submit": "Увійти",
    "login.submitting": "Вхід…",
    "login.newHere": "Вперше тут?",
    "login.createAccount": "Створити акаунт магазину",

    "register.title": "Створити акаунт магазину",
    "register.storeName": "Назва магазину",
    "register.storeUrl": "Адреса магазину",
    "register.submit": "Створити акаунт",
    "register.submitting": "Створення…",
    "register.haveAccount": "Вже є акаунт?",
    "register.signIn": "Увійти",
    "register.readyTitle": "готовий",
    "register.readyDesc": "Залишилось одне: додайте це на свій сайт (у шаблон сторінки товару), потім натисніть «Продовжити».",
    "register.continue": "Перейти в кабінет",

    "overview.title": "Огляд",
    "overview.tryons30d": "Примірки (30 днів)",
    "overview.uniqueVisitors": "Унікальні відвідувачі",
    "overview.completed": "Завершено",
    "overview.failed": "Помилка",
    "overview.addToCart": "Додано в кошик",
    "overview.orders": "Замовлення",
    "overview.conversionRate": "Конверсія",
    "overview.revenue": "Дохід (атрибутований)",
    "overview.product": "Товар",
    "overview.tryOnsCol": "Примірки",
    "overview.ordersCol": "Замовлення",
    "overview.revenueCol": "Дохід",
    "overview.empty": "Ще немає примірок.",
    "overview.currentPlan": "Поточний тариф",
    "overview.usedThisMonth": "Використано цього місяця",
    "overview.creditsLeft": "Запас додаткових примірок",
    "overview.dailyTryOns": "Примірки по днях (14 днів)",
    "overview.monthlyTryOns": "Примірки по місяцях (6 місяців)",
    "overview.creditsUsage": "Використання кредитів (6 місяців)",

    "tryons.title": "Примірки",
    "tryons.image": "Фото товару",
    "tryons.result": "Результат",
    "tryons.product": "Товар",
    "tryons.status": "Статус",
    "tryons.duration": "Тривалість",
    "tryons.utm": "UTM",
    "tryons.createdAt": "Створено",
    "tryons.emptyMonth": "Немає примірок за цей місяц.",
    "tryons.empty": "Ще немає примірок.",
    "tryons.viewDetail": "Відкрити",

    "detail.title": "Деталі примірки",
    "detail.productPhoto": "Фото товару",
    "detail.customerPhoto": "Фото клієнта",
    "detail.resultPhoto": "Результат",
    "detail.noPhoto": "Немає фото",
    "detail.notAvailable": "Недоступно (ще не завершено або сталася помилка)",
    "detail.back": "Назад до списку",

    "integration.title": "Інтеграція",
    "integration.snippetTitle": "Код для вставки",
    "integration.snippetDesc": "storeId не є секретом — він обмежений дозволеними доменами нижче і лімітом запитів, так само як у Stripe/Shopify.",
    "integration.domainsTitle": "Дозволені домени",
    "integration.domainsDesc": "Віджет створюватиме примірки лише для запитів з цих доменів — і лише для фото товарів, розміщених на них.",
    "integration.snippetHelp": "Вставте це один раз, ближче до кінця шаблону сторінки товару. Кнопка «Try on» додається автоматично поруч із кнопкою «Додати в кошик» — без додаткового редагування теми.",

    "customize.title": "Оформлення кнопки",
    "customize.desc": "Налаштуйте, як виглядає кнопка «Try on» на вашому сайті. Зміни застосуються після того, як ви скопіюєте оновлений код і вставите його замість старого.",
    "customize.label": "Текст кнопки",
    "customize.color1": "Колір (початок градієнта)",
    "customize.color2": "Колір (кінець градієнта)",
    "customize.textColor": "Колір тексту",
    "customize.font": "Шрифт",
    "customize.glow": "Світіння навколо кнопки",
    "customize.preview": "Попередній перегляд",
    "customize.fontDefault": "За замовчуванням (системний)",
    "customize.fontManrope": "Manrope",
    "customize.fontInter": "Inter",
    "customize.fontPoppins": "Poppins",
    "customize.fontGeorgia": "Georgia (з засічками)",
    "customize.style": "Заливка",
    "customize.styleGradient": "Градієнт",
    "customize.styleSolid": "Однотонна",
    "customize.size": "Розмір кнопки",
    "customize.sizeSm": "Маленька",
    "customize.sizeMd": "Середня",
    "customize.sizeLg": "Велика",
    "customize.animation": "Анімація",
    "customize.animationNone": "Без анімації",
    "customize.animationPulse": "Пульсуюче кільце",
    "customize.animationShimmer": "Світловий відблиск",
    "customize.placementTitle": "Розташування та вікно примірки",
    "customize.position": "Де розмістити кнопку",
    "customize.positionAfter": "Після кнопки «Додати в кошик»",
    "customize.positionBefore": "Перед кнопкою «Додати в кошик»",
    "customize.positionFloating": "Плаваюча кнопка (кут екрана)",
    "customize.anchorSelector": "CSS-селектор для розміщення (необов'язково)",
    "customize.anchorSelectorHint": "Залиште порожнім — ми самі знайдемо кнопку «Додати в кошик».",
    "customize.modalWidth": "Ширина вікна примірки",
    "customize.modalWidthSm": "Компактна",
    "customize.modalWidthMd": "Стандартна",
    "customize.modalWidthLg": "Широка",
    "customize.modalButtons": "Кнопки у вікні результату",
    "customize.showTryAnother": "«Спробувати інше фото»",
    "customize.showBack": "«Повернутись до товару»",

    "billing.title": "Тариф і використання",
    "billing.currentPlan": "Поточний тариф",
    "billing.noPlan": "Тариф не призначено — зверніться до підтримки",
    "billing.usedThisMonth": "Використано цього місяця",
    "billing.topUpCredits": "Додаткові примірки (запас)",
    "billing.perMonth": "/міс",
    "billing.requestUpgrade": "Запросити підвищення тарифу",
    "billing.requestTopUp": "Запросити пакет додаткових примірок",
    "billing.requestSent": "Запит надіслано — ми зв'яжемось з вами щодо оплати.",
    "billing.pendingRequest": "Ваш запит очікує на розгляд",
    "billing.plans": "Доступні тарифи",
    "billing.topUpPack": "пакет",
    "billing.monthlyLimit": "Ліміт на місяць",
    "billing.price": "Ціна",
    "billing.choosePlan": "Запросити цей тариф",
    "billing.currentBadge": "Поточний",

    "team.title": "Команда",
    "team.desc": "Люди з доступом до цього кабінету.",
    "team.email": "Email",
    "team.password": "Пароль",
    "team.role": "Роль",
    "team.roleOwner": "Власник",
    "team.roleAdmin": "Адміністратор",
    "team.roleMember": "Учасник",
    "team.addUser": "Додати користувача",
    "team.remove": "Видалити",
    "team.you": "(ви)",
    "team.lastLogin": "Останній вхід",
    "team.never": "ще не заходив(-ла)",
    "team.createdAt": "Додано",
  },
  en: {
    "nav.overview": "Overview",
    "nav.tryons": "Try-ons",
    "nav.integration": "Button & integration",
    "nav.team": "Team",
    "nav.billing": "Plan",
    "nav.poweredBy": "powered by Lumi Frame",

    "common.loading": "Loading…",
    "common.save": "Save",
    "common.saving": "Saving…",
    "common.saved": "Saved",
    "common.cancel": "Cancel",
    "common.copy": "Copy",
    "common.copied": "Copied",
    "common.previous": "Previous",
    "common.next": "Next",
    "common.allTime": "All time",
    "common.close": "Close",
    "common.language": "Language",

    "login.title": "Sign in to Lumi Frame",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in…",
    "login.newHere": "New here?",
    "login.createAccount": "Create a store account",

    "register.title": "Create your store account",
    "register.storeName": "Store name",
    "register.storeUrl": "Store URL",
    "register.submit": "Create account",
    "register.submitting": "Creating…",
    "register.haveAccount": "Already have an account?",
    "register.signIn": "Sign in",
    "register.readyTitle": "is ready",
    "register.readyDesc": "One thing left: add this to your site (product page template), then click Continue.",
    "register.continue": "Continue to dashboard",

    "overview.title": "Overview",
    "overview.tryons30d": "Try-ons (30d)",
    "overview.uniqueVisitors": "Unique visitors",
    "overview.completed": "Completed",
    "overview.failed": "Failed",
    "overview.addToCart": "Add to cart",
    "overview.orders": "Orders",
    "overview.conversionRate": "Conversion rate",
    "overview.revenue": "Revenue attributed",
    "overview.product": "Product",
    "overview.tryOnsCol": "Try-ons",
    "overview.ordersCol": "Orders",
    "overview.revenueCol": "Revenue",
    "overview.empty": "No try-ons yet.",
    "overview.currentPlan": "Current plan",
    "overview.usedThisMonth": "Used this month",
    "overview.creditsLeft": "Extra try-ons (balance)",
    "overview.dailyTryOns": "Daily try-ons (last 14 days)",
    "overview.monthlyTryOns": "Monthly try-ons (last 6 months)",
    "overview.creditsUsage": "Credits usage (last 6 months)",

    "tryons.title": "Try-ons",
    "tryons.image": "Product photo",
    "tryons.result": "Result",
    "tryons.product": "Product",
    "tryons.status": "Status",
    "tryons.duration": "Duration",
    "tryons.utm": "UTM",
    "tryons.createdAt": "Created At",
    "tryons.emptyMonth": "No try-ons in this month.",
    "tryons.empty": "No try-ons yet.",
    "tryons.viewDetail": "Open",

    "detail.title": "Try-on detail",
    "detail.productPhoto": "Product photo",
    "detail.customerPhoto": "Customer photo",
    "detail.resultPhoto": "Result",
    "detail.noPhoto": "No photo",
    "detail.notAvailable": "Not available (not completed yet, or it failed)",
    "detail.back": "Back to list",

    "integration.title": "Integration",
    "integration.snippetTitle": "Embed snippet",
    "integration.snippetDesc": "storeId is not secret — it's scoped by the allowed domains below and rate-limited, the same pattern Stripe/Shopify widgets use.",
    "integration.domainsTitle": "Allowed domains",
    "integration.domainsDesc": "The widget will only create try-ons for requests coming from — and product images hosted on — these domains.",
    "integration.snippetHelp": "Paste this once, near the bottom of your product page template. It inserts a “Try on” button next to your add-to-cart button automatically — no theme editing beyond this one snippet.",

    "customize.title": "Button design",
    "customize.desc": "Customize how the “Try on” button looks on your site. Changes apply once you copy the updated snippet and paste it in place of the old one.",
    "customize.label": "Button label",
    "customize.color1": "Color (gradient start)",
    "customize.color2": "Color (gradient end)",
    "customize.textColor": "Text color",
    "customize.font": "Font",
    "customize.glow": "Glow around the button",
    "customize.preview": "Live preview",
    "customize.fontDefault": "Default (system)",
    "customize.fontManrope": "Manrope",
    "customize.fontInter": "Inter",
    "customize.fontPoppins": "Poppins",
    "customize.fontGeorgia": "Georgia (serif)",
    "customize.style": "Fill",
    "customize.styleGradient": "Gradient",
    "customize.styleSolid": "Solid",
    "customize.size": "Button size",
    "customize.sizeSm": "Small",
    "customize.sizeMd": "Medium",
    "customize.sizeLg": "Large",
    "customize.animation": "Animation",
    "customize.animationNone": "No animation",
    "customize.animationPulse": "Pulsing ring",
    "customize.animationShimmer": "Light shimmer",
    "customize.placementTitle": "Placement & try-on window",
    "customize.position": "Where to place the button",
    "customize.positionAfter": "After the \"Add to cart\" button",
    "customize.positionBefore": "Before the \"Add to cart\" button",
    "customize.positionFloating": "Floating button (screen corner)",
    "customize.anchorSelector": "CSS selector to anchor to (optional)",
    "customize.anchorSelectorHint": "Leave blank — we'll find your \"Add to cart\" button automatically.",
    "customize.modalWidth": "Try-on window width",
    "customize.modalWidthSm": "Compact",
    "customize.modalWidthMd": "Standard",
    "customize.modalWidthLg": "Wide",
    "customize.modalButtons": "Buttons on the result screen",
    "customize.showTryAnother": "\"Try another photo\"",
    "customize.showBack": "\"Back to product\"",

    "billing.title": "Plan & usage",
    "billing.currentPlan": "Current plan",
    "billing.noPlan": "No plan assigned — please contact support",
    "billing.usedThisMonth": "Used this month",
    "billing.topUpCredits": "Extra try-ons (balance)",
    "billing.perMonth": "/mo",
    "billing.requestUpgrade": "Request a plan upgrade",
    "billing.requestTopUp": "Request a top-up pack",
    "billing.requestSent": "Request sent — we'll be in touch about payment.",
    "billing.pendingRequest": "Your request is pending",
    "billing.plans": "Available plans",
    "billing.topUpPack": "pack",
    "billing.monthlyLimit": "Monthly limit",
    "billing.price": "Price",
    "billing.choosePlan": "Request this plan",
    "billing.currentBadge": "Current",

    "team.title": "Team",
    "team.desc": "People with access to this account.",
    "team.email": "Email",
    "team.password": "Password",
    "team.role": "Role",
    "team.roleOwner": "Owner",
    "team.roleAdmin": "Admin",
    "team.roleMember": "Member",
    "team.addUser": "Add user",
    "team.remove": "Remove",
    "team.you": "(you)",
    "team.lastLogin": "Last login",
    "team.never": "never signed in",
    "team.createdAt": "Added",
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
      // localStorage unavailable (private mode, blocked) — locale just
      // won't persist across reloads, not worth failing over.
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
