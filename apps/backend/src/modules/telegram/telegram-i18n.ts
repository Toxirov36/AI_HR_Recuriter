/** Languages the candidate bot speaks. Uzbek is the default (and what every message used before). */
export const BOT_LANGS = ['uz', 'ru', 'tg'] as const;
export type BotLang = (typeof BOT_LANGS)[number];
export const DEFAULT_BOT_LANG: BotLang = 'uz';

export const BOT_LANG_LABELS: Record<BotLang, string> = {
  uz: '🇺🇿 O‘zbekcha',
  ru: '🇷🇺 Русский',
  tg: '🇹🇯 Тоҷикӣ',
};

export const LANGUAGE_PROMPT = 'Tilni tanlang / Выберите язык / Забонро интихоб кунед:';

export function isBotLang(value: unknown): value is BotLang {
  return typeof value === 'string' && (BOT_LANGS as readonly string[]).includes(value);
}

/** Maps a Telegram `language_code` (e.g. "ru-RU") to a bot language, if it is one we speak. */
export function botLangFromTelegram(code?: string | null): BotLang | null {
  const base = code?.toLowerCase().split('-')[0];
  return isBotLang(base) ? base : null;
}

const uz = {
  languageChanged: 'Til o‘zgartirildi: O‘zbekcha 🇺🇿',
  vacancyClosed: 'Bu vakansiya ariza qabul qilmayapti.',
  alreadyApplied: 'Ushbu vakansiyaga arizangiz allaqachon qabul qilingan.',
  alreadyAppliedTitle: '«{title}» vakansiyasiga arizangiz allaqachon qabul qilingan.',
  applyStorageOff: 'Telegram orqali CV qabul qilish sozlanmagan. Saytda ariza yuboring: {url}',
  applyConsent:
    '«{title}» vakansiyasiga ariza.\n\n{company} ma’lumotlaringiz, Telegram profilingizdagi ism va CVni ishga qabul qilish uchun saqlaydi ({days} kungacha). Lavozimga mos test savollari AI yordamida yaratiladi va CVingiz AI orqali tahlil qilinadi; natijalar HRga ko‘rsatiladi. Davom etishga rozimisiz?',
  agree: 'Roziman',
  decline: 'Rad etaman',
  applySessionExpired: 'Ariza sessiyasi tugagan. E’lon havolasini qayta oching.',
  stepDone: 'Bu bosqich allaqachon yakunlangan.',
  applyCancelled: 'Ariza bekor qilindi',
  noConsent: 'Rozilik berilmadi. Ma’lumotlar saqlanmaydi.',
  testNotApproved:
    'Bu vakansiya uchun test hali HR tomonidan tasdiqlanmagan. Arizangiz qo‘lda ko‘rib chiqiladi. Telefon raqamingizni yuboring (masalan: +998901234567):',
  quizIntroApply:
    '📋 <b>Lavozimga mos test (10 ta savol)</b>\n\n• 5 ta Hard skill va 5 ta Soft skill savoli\n🎯 O‘tish bali: 70% (kamida 7 ta to‘g‘ri javob).\nNatijadan qat’i nazar, CVingiz qabul qilinadi.',
  quizIntroJoin:
    '📋 <b>Lavozimga mos test (10 ta savol)</b>\n\n• 5 ta Hard skill va 5 ta Soft skill savoli\n🎯 O‘tish bali: 70% (kamida 7 ta to‘g‘ri javob).\nNatijadan qat’i nazar, arizangiz qabul qilingan.',
  startQuiz: '▶️ Testni boshlash',
  oldButton: 'Eski tugma. Vakansiya havolasini qayta oching.',
  buttonStale: 'Bu tugma avvalgi so‘rovga tegishli.',
  quizInactive: 'Test faol emas yoki yakunlangan.',
  quizMissing: 'Test mavjud emas. Vakansiya havolasini qayta oching.',
  quizStarted: 'Test boshlandi!',
  quizFinished: 'Test yakunlangan.',
  alreadyAnswered: 'Bu savolga allaqachon javob berdingiz.',
  answerClaimed: 'Javob allaqachon qabul qilingan.',
  answerAccepted: 'Javob qabul qilindi',
  quizResultAskPhone:
    '📊 <b>Test natijangiz: {score}%</b> ({correct}/10)\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\nArizangizni yakunlash uchun telefon raqamingizni yuboring (masalan: <code>+998901234567</code>):',
  phoneInvalidApply: 'Iltimos, telefon raqamingizni xalqaro formatda to‘g‘ri kiriting (masalan: <code>+998901234567</code>):',
  phoneSaved:
    '✅ Telefon raqamingiz saqlandi: <b>{phone}</b>\n\nEndi «{title}» vakansiyasi uchun rezyumeyingizni (CV) <b>PDF</b> yoki <b>DOCX</b> formatidagi fayl sifatida yuboring (10 MB gacha).',
  phoneAccepted:
    '✅ Telefon raqamingiz qabul qilindi: <b>{phone}</b>\n\nEndi «{title}» vakansiyasi uchun rezyumeyingizni (CV) <b>PDF</b> yoki <b>DOCX</b> formatidagi fayl sifatida yuboring (10 MB gacha).',
  useQuizButtons: 'Iltimos, test savollariga javob berish uchun yuqoridagi tugmalardan (A, B, C, D) foydalaning.',
  applyFirst: 'Avval vacancy havolasini ochib, test va ma’lumotlarni kiritish bosqichlarini yakunlang.',
  cvInvalid: 'PDF yoki DOCX formatidagi, 10 MB dan kichik CV fayl yuboring.',
  alreadySubmitted: 'Ushbu ariza avval qabul qilingan.',
  applyAccepted: '✅ <b>Rezyumeyingiz va arizangiz qabul qilindi!</b>\n\n',
  applyScore:
    '📊 Test natijangiz: <b>{score}%</b> ({correct}/10 to‘g‘ri)\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\n',
  applyNoTest: 'Test vaqtincha ishlamadi; arizangiz HR tomonidan qo‘lda ko‘rib chiqiladi.\n\n',
  hrReview: 'HR mutaxassislari arizangizni ko‘rib chiqadi.',
  queueFailed:
    'Ariza va test natijalari qabul qilindi, ammo CVni qayta ishlash navbatida uzilish bo‘ldi. HRga xabar yetkaziladi.',
  question: '❓ <b>Savol {n}/{total}</b> [{badge}]',
  btnBack: '⬅️ Orqaga',
  btnCancel: '✖️ Bekor qilish',
  namePrompt: 'Ism va familiyangizni yozing (masalan: Aziz Karimov):',
  cancelHint: 'Bekor qilish uchun /cancel yozing.',
  joinInvalidLink: 'Bu havola yaroqsiz yoki ariza qabul qilish to‘xtatilgan.',
  joinStorageOff: 'Hozircha Telegram orqali ariza qabul qilinmayapti. Keyinroq urinib ko‘ring.',
  joinConsent:
    '{company} ga ariza.\n\n{company} ma’lumotlaringiz, ismingiz, telefon raqamingiz va CVni ishga qabul qilish uchun saqlaydi ({days} kungacha). Tanlangan lavozimga mos test savollari AI yordamida yaratiladi va CVingiz AI orqali tahlil qilinadi; natijalar HRga ko‘rsatiladi. Davom etishga rozimisiz?',
  joinSessionExpired: 'Ariza sessiyasi tugagan. Havolani qayta oching.',
  nameInvalid: 'Iltimos, ism va familiyangizni to‘liq yozing (masalan: Aziz Karimov).',
  phoneInvalidJoin:
    'Iltimos, telefon raqamingizni xalqaro formatda kiriting (masalan: <code>+998901234567</code>) yoki «Raqamni ulashish» tugmasini bosing.',
  sendCv: 'Rezyumeyingizni (CV) <b>PDF</b> yoki <b>DOCX</b> fayl sifatida yuboring (10 MB gacha).',
  pickButton: 'Iltimos, yuqoridagi tugmalardan birini tanlang.',
  contactInvalid: 'Raqam noto‘g‘ri ko‘rinadi. Iltimos, raqamni qo‘lda kiriting (masalan: +998901234567).',
  cvPrecondition: 'CV yuborishdan oldin avvalgi bosqichlarni (soha, ism, telefon) yakunlang.',
  vacancyStopped: 'Bu vakansiya endi ariza qabul qilmayapti. Havolani qayta ochib, boshqa vakansiyani tanlang.',
  noVacancyDone:
    '✅ <b>Ma’lumotlaringiz va CV qabul qilindi!</b>\n\nHozircha bu sohada ochiq vakansiya yo‘q. Yangi vakansiya ochilsa, HR siz bilan bog‘lanadi.',
  cvAcceptedQuiz: '✅ <b>CV qabul qilindi.</b> Endi qisqa test topshiring.',
  vacancyIntro: 'Vakansiya: «{title}».\n\n{prompt}',
  noOpenVacancy:
    'Hozircha ochiq vakansiya yo‘q, lekin ma’lumotlaringizni qoldirishingiz mumkin: yangi vakansiya ochilsa HR siz bilan bog‘lanadi.\n\n{prompt}',
  whichVacancy: 'Qaysi vakansiyaga ariza topshirmoqchisiz?',
  cannotCancel: 'CV allaqachon qabul qilingan, test boshlangan. Testni yakunlash uchun yuqoridagi tugmalardan foydalaning.',
  cancelledFull: 'Ariza bekor qilindi. Ma’lumotlaringiz saqlanmadi. Qayta boshlash uchun HR havolasini oching.',
  vacancyGone: 'Bu vakansiya endi mavjud emas.',
  joinPhoneSaved:
    '✅ Telefon raqamingiz saqlandi: <b>{phone}</b>\n\nEndi rezyumeyingizni (CV) <b>PDF</b> yoki <b>DOCX</b> formatidagi fayl sifatida yuboring (10 MB gacha).',
  askPhone:
    'Rahmat, {name}!\n\nTelefon raqamingizni yuboring: «Raqamni ulashish» tugmasini bosing yoki raqamni yozing (masalan: <code>+998901234567</code>).',
  shareNumber: 'Raqamni ulashish',
  quizNotReadyLater: 'Test hali tayyor emas. Birozdan keyin urinib ko‘ring.',
  quizNotReady: 'Test hali tayyor emas.',
  joinNoApprovedTest:
    'Bu vakansiya uchun test hali HR tomonidan tasdiqlanmagan. Arizangiz qabul qilindi va HR tomonidan qo‘lda ko‘rib chiqiladi.',
  joinFinish:
    '📊 <b>Test natijangiz: {score}%</b> ({correct}/{total})\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\n✅ Arizangiz qabul qilindi. HR mutaxassislari uni ko‘rib chiqadi.',
  alreadyAppliedField:
    'Siz «{field}» sohasiga allaqachon ariza topshirgansiz. Har bir sohaga faqat bitta ariza topshirish mumkin.\n\nArizalaringizni ko‘rish: /applications',
  alreadyAppliedAll:
    'Siz bu kompaniyadagi mavjud vakansiyalarga allaqachon ariza topshirgansiz. Har bir sohaga faqat bitta ariza topshirish mumkin.\n\nArizalaringizni ko‘rish: /applications',
  myAppsButton: '📋 Arizalarim',
  myAppsTitle: '📋 <b>Arizalarim</b>',
  myAppsEmpty: 'Sizda hali arizalar yo‘q.',
  myAppsMore: '… va yana {count} ta ariza',
  labelField: 'Soha',
  labelStatus: 'Holat',
  labelTest: 'Test',
  statusNEW: 'Yangi',
  statusREVIEWING: 'Ko‘rib chiqilmoqda',
  statusINTERVIEW: 'Suhbat',
  statusOFFER: 'Taklif',
  statusHIRED: 'Qabul qilindi',
  statusREJECTED: 'Rad etildi',
  menuFields: '🗂 Sohalar',
  menuLanguage: '🌐 Til',
  menuHelp: '❓ Yordam',
  menuPrompt: 'Quyidagi menyudan tanlang:',
  menuHelpText:
    'ℹ️ Bu bot orqali vakansiyalarga ariza topshirishingiz mumkin.\n\n🗂 Sohalar — ochiq vakansiyalar\n📋 Arizalarim — topshirgan arizalaringiz\n🌐 Til — tilni o‘zgartirish\n\nHar bir sohaga faqat bitta ariza topshirish mumkin.',
  menuNoCompany: 'Sohalar ro‘yxati chiqishi uchun avval HR yuborgan havola orqali botga kiring.',
  fieldsTitle: 'Sohani tanlang:',
  fieldsEmpty: 'Hozircha ochiq sohalar yo‘q.',
  fieldVacancies: '«{field}» sohasidagi vakansiyalar:',
  fieldNoVacancies: 'Bu sohada hozircha ochiq vakansiya yo‘q.',
};

export type BotMessageKey = keyof typeof uz;

const ru: Record<BotMessageKey, string> = {
  languageChanged: 'Язык изменён: Русский 🇷🇺',
  vacancyClosed: 'Эта вакансия больше не принимает заявки.',
  alreadyApplied: 'Ваша заявка на эту вакансию уже принята.',
  alreadyAppliedTitle: 'Ваша заявка на вакансию «{title}» уже принята.',
  applyStorageOff: 'Приём резюме через Telegram не настроен. Отправьте заявку на сайте: {url}',
  applyConsent:
    'Заявка на вакансию «{title}».\n\n{company} сохранит ваши данные, имя из профиля Telegram и резюме для подбора персонала (до {days} дн.). Тестовые вопросы по должности создаются с помощью ИИ, а ваше резюме анализируется ИИ; результаты увидит HR. Вы согласны продолжить?',
  agree: 'Согласен',
  decline: 'Отказываюсь',
  applySessionExpired: 'Сессия заявки истекла. Откройте ссылку на вакансию ещё раз.',
  stepDone: 'Этот шаг уже завершён.',
  applyCancelled: 'Заявка отменена',
  noConsent: 'Согласие не получено. Данные не сохраняются.',
  testNotApproved:
    'Тест для этой вакансии ещё не утверждён HR. Ваша заявка будет рассмотрена вручную. Отправьте свой номер телефона (например: +998901234567):',
  quizIntroApply:
    '📋 <b>Тест по должности (10 вопросов)</b>\n\n• 5 вопросов по Hard skills и 5 по Soft skills\n🎯 Проходной балл: 70% (не менее 7 правильных ответов).\nНезависимо от результата ваше резюме будет принято.',
  quizIntroJoin:
    '📋 <b>Тест по должности (10 вопросов)</b>\n\n• 5 вопросов по Hard skills и 5 по Soft skills\n🎯 Проходной балл: 70% (не менее 7 правильных ответов).\nНезависимо от результата ваша заявка принята.',
  startQuiz: '▶️ Начать тест',
  oldButton: 'Устаревшая кнопка. Откройте ссылку на вакансию ещё раз.',
  buttonStale: 'Эта кнопка относится к предыдущему запросу.',
  quizInactive: 'Тест не активен или уже завершён.',
  quizMissing: 'Тест недоступен. Откройте ссылку на вакансию ещё раз.',
  quizStarted: 'Тест начался!',
  quizFinished: 'Тест завершён.',
  alreadyAnswered: 'Вы уже ответили на этот вопрос.',
  answerClaimed: 'Ответ уже принят.',
  answerAccepted: 'Ответ принят',
  quizResultAskPhone:
    '📊 <b>Ваш результат: {score}%</b> ({correct}/10)\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\nЧтобы завершить заявку, отправьте номер телефона (например: <code>+998901234567</code>):',
  phoneInvalidApply: 'Пожалуйста, введите номер телефона в международном формате (например: <code>+998901234567</code>):',
  phoneSaved:
    '✅ Ваш номер телефона сохранён: <b>{phone}</b>\n\nТеперь отправьте резюме (CV) для вакансии «{title}» файлом в формате <b>PDF</b> или <b>DOCX</b> (до 10 МБ).',
  phoneAccepted:
    '✅ Ваш номер телефона принят: <b>{phone}</b>\n\nТеперь отправьте резюме (CV) для вакансии «{title}» файлом в формате <b>PDF</b> или <b>DOCX</b> (до 10 МБ).',
  useQuizButtons: 'Чтобы ответить на вопросы теста, пользуйтесь кнопками выше (A, B, C, D).',
  applyFirst: 'Сначала откройте ссылку на вакансию и пройдите шаги теста и ввода данных.',
  cvInvalid: 'Отправьте резюме в формате PDF или DOCX размером до 10 МБ.',
  alreadySubmitted: 'Эта заявка уже была принята.',
  applyAccepted: '✅ <b>Ваше резюме и заявка приняты!</b>\n\n',
  applyScore:
    '📊 Ваш результат: <b>{score}%</b> ({correct}/10 верно)\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\n',
  applyNoTest: 'Тест временно недоступен; HR рассмотрит вашу заявку вручную.\n\n',
  hrReview: 'Специалисты HR рассмотрят вашу заявку.',
  queueFailed:
    'Заявка и результаты теста приняты, но при постановке резюме в очередь обработки произошёл сбой. HR будет уведомлён.',
  question: '❓ <b>Вопрос {n}/{total}</b> [{badge}]',
  btnBack: '⬅️ Назад',
  btnCancel: '✖️ Отмена',
  namePrompt: 'Напишите имя и фамилию (например: Азиз Каримов):',
  cancelHint: 'Чтобы отменить, напишите /cancel.',
  joinInvalidLink: 'Эта ссылка недействительна или приём заявок остановлен.',
  joinStorageOff: 'Сейчас заявки через Telegram не принимаются. Попробуйте позже.',
  joinConsent:
    'Заявка в {company}.\n\n{company} сохранит ваши данные, имя, номер телефона и резюме для подбора персонала (до {days} дн.). Тестовые вопросы по выбранной должности создаются с помощью ИИ, а ваше резюме анализируется ИИ; результаты увидит HR. Вы согласны продолжить?',
  joinSessionExpired: 'Сессия заявки истекла. Откройте ссылку ещё раз.',
  nameInvalid: 'Пожалуйста, напишите имя и фамилию полностью (например: Азиз Каримов).',
  phoneInvalidJoin:
    'Пожалуйста, введите номер телефона в международном формате (например: <code>+998901234567</code>) или нажмите кнопку «Поделиться номером».',
  sendCv: 'Отправьте резюме (CV) файлом в формате <b>PDF</b> или <b>DOCX</b> (до 10 МБ).',
  pickButton: 'Пожалуйста, выберите одну из кнопок выше.',
  contactInvalid: 'Номер выглядит неверно. Пожалуйста, введите номер вручную (например: +998901234567).',
  cvPrecondition: 'Перед отправкой резюме завершите предыдущие шаги (имя, телефон).',
  vacancyStopped: 'Эта вакансия больше не принимает заявки. Откройте ссылку ещё раз и выберите другую вакансию.',
  noVacancyDone:
    '✅ <b>Ваши данные и резюме приняты!</b>\n\nСейчас в этой сфере нет открытых вакансий. Когда появится новая, HR свяжется с вами.',
  cvAcceptedQuiz: '✅ <b>Резюме принято.</b> Теперь пройдите короткий тест.',
  vacancyIntro: 'Вакансия: «{title}».\n\n{prompt}',
  noOpenVacancy:
    'Сейчас нет открытых вакансий, но вы можете оставить свои данные: когда появится новая, HR свяжется с вами.\n\n{prompt}',
  whichVacancy: 'На какую вакансию вы хотите подать заявку?',
  cannotCancel: 'Резюме уже принято, тест начат. Чтобы завершить тест, пользуйтесь кнопками выше.',
  cancelledFull: 'Заявка отменена. Ваши данные не сохранены. Чтобы начать заново, откройте ссылку HR.',
  vacancyGone: 'Эта вакансия больше недоступна.',
  joinPhoneSaved:
    '✅ Ваш номер телефона сохранён: <b>{phone}</b>\n\nТеперь отправьте резюме (CV) файлом в формате <b>PDF</b> или <b>DOCX</b> (до 10 МБ).',
  askPhone:
    'Спасибо, {name}!\n\nОтправьте номер телефона: нажмите кнопку «Поделиться номером» или напишите номер (например: <code>+998901234567</code>).',
  shareNumber: 'Поделиться номером',
  quizNotReadyLater: 'Тест ещё не готов. Попробуйте чуть позже.',
  quizNotReady: 'Тест ещё не готов.',
  joinNoApprovedTest:
    'Тест для этой вакансии ещё не утверждён HR. Ваша заявка принята и будет рассмотрена HR вручную.',
  joinFinish:
    '📊 <b>Ваш результат: {score}%</b> ({correct}/{total})\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\n✅ Ваша заявка принята. Специалисты HR её рассмотрят.',
  alreadyAppliedField:
    'Вы уже подавали заявку в сферу «{field}». В каждую сферу можно подать только одну заявку.\n\nПосмотреть свои заявки: /applications',
  alreadyAppliedAll:
    'Вы уже подали заявки на доступные вакансии этой компании. В каждую сферу можно подать только одну заявку.\n\nПосмотреть свои заявки: /applications',
  myAppsButton: '📋 Мои заявки',
  myAppsTitle: '📋 <b>Мои заявки</b>',
  myAppsEmpty: 'У вас пока нет заявок.',
  myAppsMore: '… и ещё заявок: {count}',
  labelField: 'Сфера',
  labelStatus: 'Статус',
  labelTest: 'Тест',
  statusNEW: 'Новая',
  statusREVIEWING: 'На рассмотрении',
  statusINTERVIEW: 'Интервью',
  statusOFFER: 'Оффер',
  statusHIRED: 'Принят',
  statusREJECTED: 'Отказ',
  menuFields: '🗂 Сферы',
  menuLanguage: '🌐 Язык',
  menuHelp: '❓ Помощь',
  menuPrompt: 'Выберите в меню ниже:',
  menuHelpText:
    'ℹ️ Через этого бота можно подать заявку на вакансии.\n\n🗂 Сферы — открытые вакансии\n📋 Мои заявки — ваши поданные заявки\n🌐 Язык — сменить язык\n\nВ каждую сферу можно подать только одну заявку.',
  menuNoCompany: 'Чтобы увидеть список сфер, сначала зайдите в бот по ссылке от HR.',
  fieldsTitle: 'Выберите сферу:',
  fieldsEmpty: 'Сейчас нет открытых сфер.',
  fieldVacancies: 'Вакансии в сфере «{field}»:',
  fieldNoVacancies: 'В этой сфере сейчас нет открытых вакансий.',
};

const tg: Record<BotMessageKey, string> = {
  languageChanged: 'Забон иваз шуд: Тоҷикӣ 🇹🇯',
  vacancyClosed: 'Ин вакансия дигар дархост қабул намекунад.',
  alreadyApplied: 'Дархости шумо ба ин вакансия аллакай қабул шудааст.',
  alreadyAppliedTitle: 'Дархости шумо ба вакансияи «{title}» аллакай қабул шудааст.',
  applyStorageOff: 'Қабули резюме тавассути Telegram танзим нашудааст. Дархостро дар сайт фиристед: {url}',
  applyConsent:
    'Дархост ба вакансияи «{title}».\n\n{company} маълумоти шумо, номи профили Telegram ва резюмеро барои ба кор қабул кардан нигоҳ медорад (то {days} рӯз). Саволҳои санҷишӣ аз рӯи вазифа бо ёрии ИИ сохта мешаванд ва резюмеи шумо тавассути ИИ таҳлил карда мешавад; натиҷаҳо ба HR нишон дода мешаванд. Оё розӣ ҳастед, ки идома диҳем?',
  agree: 'Розӣ ҳастам',
  decline: 'Рад мекунам',
  applySessionExpired: 'Сессияи дархост ба охир расид. Истиноди эълонро дубора кушоед.',
  stepDone: 'Ин марҳила аллакай анҷом ёфтааст.',
  applyCancelled: 'Дархост бекор карда шуд',
  noConsent: 'Розигӣ гирифта нашуд. Маълумот нигоҳ дошта намешавад.',
  testNotApproved:
    'Санҷиш барои ин вакансия ҳанӯз аз ҷониби HR тасдиқ нашудааст. Дархости шумо дастӣ баррасӣ мешавад. Рақами телефони худро фиристед (масалан: +998901234567):',
  quizIntroApply:
    '📋 <b>Санҷиш аз рӯи вазифа (10 савол)</b>\n\n• 5 савол аз Hard skills ва 5 савол аз Soft skills\n🎯 Холи гузариш: 70% (на камтар аз 7 ҷавоби дуруст).\nБидуни назар ба натиҷа, резюмеи шумо қабул карда мешавад.',
  quizIntroJoin:
    '📋 <b>Санҷиш аз рӯи вазифа (10 савол)</b>\n\n• 5 савол аз Hard skills ва 5 савол аз Soft skills\n🎯 Холи гузариш: 70% (на камтар аз 7 ҷавоби дуруст).\nБидуни назар ба натиҷа, дархости шумо қабул шудааст.',
  startQuiz: '▶️ Оғози санҷиш',
  oldButton: 'Тугмаи кӯҳна. Истиноди вакансияро дубора кушоед.',
  buttonStale: 'Ин тугма ба дархости пешина тааллуқ дорад.',
  quizInactive: 'Санҷиш фаъол нест ё анҷом ёфтааст.',
  quizMissing: 'Санҷиш мавҷуд нест. Истиноди вакансияро дубора кушоед.',
  quizStarted: 'Санҷиш оғоз шуд!',
  quizFinished: 'Санҷиш анҷом ёфт.',
  alreadyAnswered: 'Шумо ба ин савол аллакай ҷавоб додаед.',
  answerClaimed: 'Ҷавоб аллакай қабул шудааст.',
  answerAccepted: 'Ҷавоб қабул шуд',
  quizResultAskPhone:
    '📊 <b>Натиҷаи санҷиши шумо: {score}%</b> ({correct}/10)\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\nБарои анҷом додани дархост рақами телефони худро фиристед (масалан: <code>+998901234567</code>):',
  phoneInvalidApply: 'Лутфан, рақами телефонро дар шакли байналмилалӣ дуруст ворид кунед (масалан: <code>+998901234567</code>):',
  phoneSaved:
    '✅ Рақами телефони шумо захира шуд: <b>{phone}</b>\n\nАкнун резюмеи худро (CV) барои вакансияи «{title}» ҳамчун файл дар формати <b>PDF</b> ё <b>DOCX</b> фиристед (то 10 МБ).',
  phoneAccepted:
    '✅ Рақами телефони шумо қабул шуд: <b>{phone}</b>\n\nАкнун резюмеи худро (CV) барои вакансияи «{title}» ҳамчун файл дар формати <b>PDF</b> ё <b>DOCX</b> фиристед (то 10 МБ).',
  useQuizButtons: 'Лутфан, барои ҷавоб додан ба саволҳои санҷиш аз тугмаҳои боло (A, B, C, D) истифода баред.',
  applyFirst: 'Аввал истиноди вакансияро кушоед ва марҳилаҳои санҷиш ва ворид кардани маълумотро анҷом диҳед.',
  cvInvalid: 'Резюмеро дар формати PDF ё DOCX, аз 10 МБ хурдтар фиристед.',
  alreadySubmitted: 'Ин дархост пештар қабул шудааст.',
  applyAccepted: '✅ <b>Резюме ва дархости шумо қабул шуд!</b>\n\n',
  applyScore:
    '📊 Натиҷаи санҷиши шумо: <b>{score}%</b> ({correct}/10 дуруст)\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\n',
  applyNoTest: 'Санҷиш муваққатан кор накард; дархости шумо аз ҷониби HR дастӣ баррасӣ мешавад.\n\n',
  hrReview: 'Мутахассисони HR дархости шуморо баррасӣ мекунанд.',
  queueFailed:
    'Дархост ва натиҷаҳои санҷиш қабул шуданд, аммо ҳангоми гузоштани резюме ба навбати коркард ғалат рух дод. HR огоҳ карда мешавад.',
  question: '❓ <b>Савол {n}/{total}</b> [{badge}]',
  btnBack: '⬅️ Бозгашт',
  btnCancel: '✖️ Бекор кардан',
  namePrompt: 'Ном ва насаби худро нависед (масалан: Азиз Каримов):',
  cancelHint: 'Барои бекор кардан /cancel нависед.',
  joinInvalidLink: 'Ин истинод дуруст нест ё қабули дархост боздошта шудааст.',
  joinStorageOff: 'Ҳоло дархост тавассути Telegram қабул намешавад. Баъдтар кӯшиш кунед.',
  joinConsent:
    'Дархост ба {company}.\n\n{company} маълумоти шумо, ном, рақами телефон ва резюмеро барои ба кор қабул кардан нигоҳ медорад (то {days} рӯз). Саволҳои санҷишӣ аз рӯи вазифаи интихобшуда бо ёрии ИИ сохта мешаванд ва резюмеи шумо тавассути ИИ таҳлил карда мешавад; натиҷаҳо ба HR нишон дода мешаванд. Оё розӣ ҳастед, ки идома диҳем?',
  joinSessionExpired: 'Сессияи дархост ба охир расид. Истинодро дубора кушоед.',
  nameInvalid: 'Лутфан, ном ва насаби худро пурра нависед (масалан: Азиз Каримов).',
  phoneInvalidJoin:
    'Лутфан, рақами телефонро дар шакли байналмилалӣ ворид кунед (масалан: <code>+998901234567</code>) ё тугмаи «Рақамро мубодила кардан»-ро пахш кунед.',
  sendCv: 'Резюмеи худро (CV) ҳамчун файл дар формати <b>PDF</b> ё <b>DOCX</b> фиристед (то 10 МБ).',
  pickButton: 'Лутфан, яке аз тугмаҳои болоро интихоб кунед.',
  contactInvalid: 'Рақам нодуруст менамояд. Лутфан, рақамро дастӣ ворид кунед (масалан: +998901234567).',
  cvPrecondition: 'Пеш аз фиристодани резюме марҳилаҳои қаблиро (ном, телефон) анҷом диҳед.',
  vacancyStopped: 'Ин вакансия дигар дархост қабул намекунад. Истинодро дубора кушоед ва вакансияи дигарро интихоб кунед.',
  noVacancyDone:
    '✅ <b>Маълумот ва резюмеи шумо қабул шуд!</b>\n\nҲоло дар ин соҳа вакансияи кушода нест. Вақте вакансияи нав кушода шавад, HR бо шумо тамос мегирад.',
  cvAcceptedQuiz: '✅ <b>Резюме қабул шуд.</b> Акнун санҷиши кӯтоҳро супоред.',
  vacancyIntro: 'Вакансия: «{title}».\n\n{prompt}',
  noOpenVacancy:
    'Ҳоло вакансияи кушода нест, аммо шумо метавонед маълумоти худро гузоред: вақте вакансияи нав кушода шавад, HR бо шумо тамос мегирад.\n\n{prompt}',
  whichVacancy: 'Ба кадом вакансия дархост супоридан мехоҳед?',
  cannotCancel: 'Резюме аллакай қабул шуда, санҷиш оғоз ёфтааст. Барои анҷом додани санҷиш аз тугмаҳои боло истифода баред.',
  cancelledFull: 'Дархост бекор карда шуд. Маълумоти шумо захира нашуд. Барои аз нав оғоз кардан истиноди HR-ро кушоед.',
  vacancyGone: 'Ин вакансия дигар мавҷуд нест.',
  joinPhoneSaved:
    '✅ Рақами телефони шумо захира шуд: <b>{phone}</b>\n\nАкнун резюмеи худро (CV) ҳамчун файл дар формати <b>PDF</b> ё <b>DOCX</b> фиристед (то 10 МБ).',
  askPhone:
    'Ташаккур, {name}!\n\nРақами телефони худро фиристед: тугмаи «Рақамро мубодила кардан»-ро пахш кунед ё рақамро нависед (масалан: <code>+998901234567</code>).',
  shareNumber: 'Рақамро мубодила кардан',
  quizNotReadyLater: 'Санҷиш ҳанӯз тайёр нест. Каме баъдтар кӯшиш кунед.',
  quizNotReady: 'Санҷиш ҳанӯз тайёр нест.',
  joinNoApprovedTest:
    'Санҷиш барои ин вакансия ҳанӯз аз ҷониби HR тасдиқ нашудааст. Дархости шумо қабул шуд ва аз ҷониби HR дастӣ баррасӣ мешавад.',
  joinFinish:
    '📊 <b>Натиҷаи санҷиши шумо: {score}%</b> ({correct}/{total})\n• Hard skills: {hard}%\n• Soft skills: {soft}%\n\n✅ Дархости шумо қабул шуд. Мутахассисони HR онро баррасӣ мекунанд.',
  alreadyAppliedField:
    'Шумо ба соҳаи «{field}» аллакай дархост додаед. Ба ҳар як соҳа танҳо як дархост додан мумкин аст.\n\nДидани дархостҳо: /applications',
  alreadyAppliedAll:
    'Шумо ба вакансияҳои дастраси ин ширкат аллакай дархост додаед. Ба ҳар як соҳа танҳо як дархост додан мумкин аст.\n\nДидани дархостҳо: /applications',
  myAppsButton: '📋 Дархостҳои ман',
  myAppsTitle: '📋 <b>Дархостҳои ман</b>',
  myAppsEmpty: 'Шумо ҳоло дархост надоред.',
  myAppsMore: '… ва боз {count} дархост',
  labelField: 'Соҳа',
  labelStatus: 'Ҳолат',
  labelTest: 'Санҷиш',
  statusNEW: 'Нав',
  statusREVIEWING: 'Дар баррасӣ',
  statusINTERVIEW: 'Мусоҳиба',
  statusOFFER: 'Пешниҳод',
  statusHIRED: 'Қабул шуд',
  statusREJECTED: 'Рад шуд',
  menuFields: '🗂 Соҳаҳо',
  menuLanguage: '🌐 Забон',
  menuHelp: '❓ Кумак',
  menuPrompt: 'Аз менюи зерин интихоб кунед:',
  menuHelpText:
    'ℹ️ Тавассути ин бот шумо метавонед ба вакансияҳо дархост диҳед.\n\n🗂 Соҳаҳо — вакансияҳои кушода\n📋 Дархостҳои ман — дархостҳои супоридаи шумо\n🌐 Забон — иваз кардани забон\n\nБа ҳар як соҳа танҳо як дархост додан мумкин аст.',
  menuNoCompany: 'Барои дидани рӯйхати соҳаҳо аввал тавассути истиноди HR ба бот ворид шавед.',
  fieldsTitle: 'Соҳаро интихоб кунед:',
  fieldsEmpty: 'Ҳоло соҳаҳои кушода нест.',
  fieldVacancies: 'Вакансияҳо дар соҳаи «{field}»:',
  fieldNoVacancies: 'Дар ин соҳа ҳоло вакансияи кушода нест.',
};

const MESSAGES: Record<BotLang, Record<BotMessageKey, string>> = { uz, ru, tg };

/** Looks up a message and fills `{name}` placeholders. Callers escape HTML in the values themselves. */
export function botText(lang: BotLang, key: BotMessageKey, params: Record<string, string | number> = {}): string {
  return MESSAGES[lang][key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export const BOT_MESSAGE_KEYS = Object.keys(uz) as BotMessageKey[];

/** True when `text` is the given button label in any language (reply-keyboard taps arrive as plain text). */
export function matchesAnyLang(text: string, key: BotMessageKey): boolean {
  return BOT_LANGS.some((lang) => MESSAGES[lang][key] === text);
}
