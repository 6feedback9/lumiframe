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
    "nav.integration": "Інтеграція",
    "nav.customize": "Оформлення кнопки",
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

    "tryons.title": "Примірки",
    "tryons.image": "Фото",
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
  },
  en: {
    "nav.overview": "Overview",
    "nav.tryons": "Try-ons",
    "nav.integration": "Integration",
    "nav.customize": "Button design",
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

    "tryons.title": "Try-ons",
    "tryons.image": "Image",
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
