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
  consentLabel: string;
  feedbackPrompt: string;
  likeAria: string;
  dislikeAria: string;
  feedbackThanks: string;
  examplePhoto: string;
  tip1: string;
  tip2: string;
  tip3: string;
  tip4: string;
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
    aiNote: "This is an AI-generated preview, not an exact copy of the real product — just an approximate example of how it might look.",
    expired: "This preview has expired according to our privacy policy.",
    addingToCart: "Adding…",
    addedToCart: "Added ✓",
    addToCartFallback: "Use the store's \"Add to cart\" button to finish your order.",
    consentLabel: "I agree that my photo will be used only to generate this preview.",
    feedbackPrompt: "How do you like it?",
    likeAria: "Like this result",
    dislikeAria: "Dislike this result",
    feedbackThanks: "Thanks for the feedback!",
    examplePhoto: "Example photo",
    tip1: "Only you in the photo",
    tip2: "No glasses in the photo",
    tip3: "Good lighting",
    tip4: "No clutter in the background",
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
    aiNote: "Це орієнтовний вигляд, згенерований ШІ, а не точна копія товару — лише приклад того, як він може виглядати.",
    expired: "Це прев'ю більше недоступне згідно з політикою конфіденційності.",
    addingToCart: "Додаємо…",
    addedToCart: "Додано ✓",
    addToCartFallback: "Щоб завершити замовлення, натисніть «Додати до кошика» на сторінці товару.",
    consentLabel: "Я погоджуюсь, що моє фото буде використано лише для генерації цього прев'ю.",
    feedbackPrompt: "Як вам результат?",
    likeAria: "Подобається",
    dislikeAria: "Не подобається",
    feedbackThanks: "Дякуємо за відгук!",
    examplePhoto: "Приклад фото",
    tip1: "Лише ти на фото",
    tip2: "Без окулярів на фото",
    tip3: "Гарне освітлення",
    tip4: "Без зайвих предметів на фоні",
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
    aiNote: "Это ориентировочный вид, сгенерированный ИИ, а не точная копия товара — лишь пример того, как он может выглядеть.",
    expired: "Это превью больше недоступно согласно политике конфиденциальности.",
    addingToCart: "Добавляем…",
    addedToCart: "Добавлено ✓",
    addToCartFallback: "Чтобы завершить заказ, нажмите «Добавить в корзину» на странице товара.",
    consentLabel: "Я согласен(на), что моё фото будет использовано только для генерации этого превью.",
    feedbackPrompt: "Как вам результат?",
    likeAria: "Нравится",
    dislikeAria: "Не нравится",
    feedbackThanks: "Спасибо за отзыв!",
    examplePhoto: "Пример фото",
    tip1: "Только ты на фото",
    tip2: "Без очков на фото",
    tip3: "Хорошее освещение",
    tip4: "Без лишних предметов на фоне",
  },
};

export function getCopy(locale: MountWidgetOptions["locale"]): Copy {
  return COPY[locale] ?? COPY.en;
}
