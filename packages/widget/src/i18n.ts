import type { MountWidgetOptions } from "./types";

export interface Copy {
  title: string;
  head: string;
  desc: string;
  upload: string;
  hint: string;
  generate: string;
  addToCart: string;
  tryAnother: string;
  backToProduct: string;
  close: string;
  privacy: string;
  generating: string;
  genSub: string;
  errUpload: string;
  errGen: string;
  aiNote: string;
  expired: string;
  addingToCart: string;
  addedToCart: string;
  addToCartFallback: string;
}

const COPY: Record<MountWidgetOptions["locale"], Copy> = {
  en: {
    title: "Virtual Try-On",
    head: "Upload your photo",
    desc: "A clear front-facing photo with good lighting works best.",
    upload: "Upload photo",
    hint: "JPG · PNG · up to 10 MB",
    generate: "Try On",
    addToCart: "Add to cart",
    tryAnother: "Try another photo",
    backToProduct: "Back to product",
    close: "Close",
    privacy: "Your photo is used only to generate this preview and is not kept permanently.",
    generating: "Creating your try-on…",
    genSub: "This usually takes a few seconds.",
    errUpload: "We couldn't read this photo. Please try another one.",
    errGen: "Something went wrong. Please try again.",
    aiNote: "This image is AI-generated. Actual fit may vary.",
    expired: "This preview has expired according to our privacy policy.",
    addingToCart: "Adding…",
    addedToCart: "Added ✓",
    addToCartFallback: "Use the store's \"Add to cart\" button to finish your order.",
  },
  uk: {
    title: "Віртуальна примірка",
    head: "Завантаж своє фото",
    desc: "Чітке фото анфас з хорошим освітленням дає найкращий результат.",
    upload: "Завантажити фото",
    hint: "JPG · PNG · до 10 МБ",
    generate: "Приміряти",
    addToCart: "Додати до кошика",
    tryAnother: "Спробувати інше фото",
    backToProduct: "Повернутись до товару",
    close: "Закрити",
    privacy: "Фото використовується лише для генерації прев'ю і не зберігається постійно.",
    generating: "Створюємо примірку…",
    genSub: "Зазвичай це займає кілька секунд.",
    errUpload: "Не вдалося зчитати фото. Спробуйте інше.",
    errGen: "Щось пішло не так. Спробуйте ще раз.",
    aiNote: "Зображення згенеровано ШІ. Результат може відрізнятися.",
    expired: "Це прев'ю більше недоступне згідно з політикою конфіденційності.",
    addingToCart: "Додаємо…",
    addedToCart: "Додано ✓",
    addToCartFallback: "Щоб завершити замовлення, натисніть «Додати до кошика» на сторінці товару.",
  },
  ru: {
    title: "Виртуальная примерка",
    head: "Загрузи своё фото",
    desc: "Чёткое фото анфас с хорошим освещением даёт лучший результат.",
    upload: "Загрузить фото",
    hint: "JPG · PNG · до 10 МБ",
    generate: "Примерить",
    addToCart: "Добавить в корзину",
    tryAnother: "Попробовать другое фото",
    backToProduct: "Вернуться к товару",
    close: "Закрыть",
    privacy: "Фото используется только для генерации превью и не хранится постоянно.",
    generating: "Создаём примерку…",
    genSub: "Обычно это занимает несколько секунд.",
    errUpload: "Не удалось прочитать фото. Попробуйте другое.",
    errGen: "Что-то пошло не так. Попробуйте ещё раз.",
    aiNote: "Изображение сгенерировано ИИ. Результат может отличаться.",
    expired: "Это превью больше недоступно согласно политике конфиденциальности.",
    addingToCart: "Добавляем…",
    addedToCart: "Добавлено ✓",
    addToCartFallback: "Чтобы завершить заказ, нажмите «Добавить в корзину» на странице товара.",
  },
};

export function getCopy(locale: MountWidgetOptions["locale"]): Copy {
  return COPY[locale] ?? COPY.en;
}
