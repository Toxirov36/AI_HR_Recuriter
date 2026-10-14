import {
  AssessmentQuestion,
  CandidateAssessmentAnswer,
  CandidateAssessmentResult,
  VacancyAssessment,
} from '../schemas/assessment.schema';

export function calculateAssessmentScore(
  questions: AssessmentQuestion[],
  answers: Array<{ questionId: number; selectedIndex: number }>,
): CandidateAssessmentResult {
  let correctCount = 0;
  let hardCorrect = 0;
  let hardTotal = 0;
  let softCorrect = 0;
  let softTotal = 0;

  const answerResults: CandidateAssessmentAnswer[] = questions.map((q) => {
    const userAns = answers.find((a) => a.questionId === q.id);
    const selectedIndex = userAns !== undefined ? userAns.selectedIndex : -1;
    const isCorrect = selectedIndex === q.correctIndex;
    if (isCorrect) correctCount++;

    if (q.type === 'HARD_SKILL') {
      hardTotal++;
      if (isCorrect) hardCorrect++;
    } else {
      softTotal++;
      if (isCorrect) softCorrect++;
    }

    return {
      questionId: q.id,
      selectedIndex,
      correctIndex: q.correctIndex,
      isCorrect,
      type: q.type,
    };
  });

  const totalQuestions = questions.length || 10;
  const score = Math.round((correctCount / totalQuestions) * 100);
  const hardSkillScore = hardTotal > 0 ? Math.round((hardCorrect / hardTotal) * 100) : 0;
  const softSkillScore = softTotal > 0 ? Math.round((softCorrect / softTotal) * 100) : 0;

  return {
    score,
    passed: score >= 70,
    totalQuestions,
    correctCount,
    hardSkillScore,
    softSkillScore,
    answers: answerResults,
    completedAt: new Date().toISOString(),
  };
}

export function getDefaultAssessmentForVacancy(
  vacancyTitle: string,
  requirements?: string[],
): VacancyAssessment {
  const reqSummary = requirements?.length
    ? requirements.slice(0, 3).join(', ')
    : 'standart talablar';

  return {
    questions: [
      {
        id: 1,
        type: 'HARD_SKILL',
        question: `«${vacancyTitle}» sifatida tizim arxitekturasini loyihalashda eng muhim tamoyil qaysi?`,
        options: [
          'Barcha funksionallikni bitta katta faylda tezda jamlash',
          'Modullilik, mas’uliyatlarni ajratish (SRP) va toza arxitektura tamoyillariga rioya qilish',
          'Arxitekturani faqat oxirgi bosqichda ko‘rib chiqish',
          'Faqat tashqi kutubxonalarning ichki kodini o‘zgartirish',
        ],
        correctIndex: 1,
        explanation: 'Modullilik va toza arxitektura kodni kengaytiriladigan va barqaror qilishning asosi hisoblanadi.',
      },
      {
        id: 2,
        type: 'HARD_SKILL',
        question: `Ish jarayonida ma’lumotlar bazasi so‘rovlari sekinlashsa, birinchi navbatda nima qilish kerak?`,
        options: [
          'Darhol server xotirasini 10 barobarga oshirish',
          'So‘rovlarni tahlil qilish (EXPLAIN/ANALYZE), indekslarni tekshirish va ortiqcha yuklamani aniqlash',
          'Barcha eski ma’lumotlarni o‘chirib tashlash',
          'Baza bilan ishlashni to‘xtatish',
        ],
        correctIndex: 1,
        explanation: 'So‘rov rejasini tahlil qilish va to‘g‘ri indekslash resurs sarfini kamaytiradi va tezlikni oshiradi.',
      },
      {
        id: 3,
        type: 'HARD_SKILL',
        question: `Xavfsizlik va ma’lumotlarni himoya qilishda (${reqSummary}) eng to‘g‘ri yondashuv nima?`,
        options: [
          'Foydalanuvchi kiritgan har qanday ma’lumotga to‘liq ishonish',
          'Maxfiy kalitlarni ochiq holda Git repositoryga yuklash',
          'Kiruvchi ma’lumotlarni qat’iy validatsiya qilish va maxfiy ma’lumotlarni shifrlangan holda saqlash',
          'Avtorizatsiya tekshiruvlarini o‘chirib qo‘yish',
        ],
        correctIndex: 2,
        explanation: 'Kiruvchi ma’lumotlarni tekshirish (validation) va xavfsiz kalitlar boshqaruvi himoya uchun zarur.',
      },
      {
        id: 4,
        type: 'HARD_SKILL',
        question: `Kod sifatini ta’minlash va xatoliklarni erta aniqlash uchun nima qilish tavsiya etiladi?`,
        options: [
          'Kodni faqat ishlab chiqarish (production) serverida sinab ko‘rish',
          'Avtomatlashtirilgan testlar (Unit/Integration) yozish va CI/CD jarayonini yo‘lga qo‘yish',
          'Test yozishni vaqtni yo‘qotish deb hisoblab undan voz kechish',
          'Faqat foydalanuvchilar xabar bergandan keyin xatoni tekshirish',
        ],
        correctIndex: 1,
        explanation: 'Avtomatlashtirilgan testlar va CI/CD xatoliklarni erta aniqlashning eng ishonchli usulidir.',
      },
      {
        id: 5,
        type: 'HARD_SKILL',
        question: `Tizim kutilmagan xatoga duch kelganda eng to‘g‘ri harakat qaysi?`,
        options: [
          'Xatoni hech qayerga qayd etmasdan yashirib ketish',
          'Xatolar haqida to‘liq xavfsiz log yuritish, monitoring tizimini xabardor qilish va foydalanuvchiga tushunarli xabar qaytarish',
          'Tizimni butunlay to‘xtatib qo‘yish',
          'Har bir xatoda butun bazani qayta yuklash',
        ],
        correctIndex: 1,
        explanation: 'Strukturalangan logging va xavfsiz xatolik boshqaruvi tizim ishonchliligini kafolatlaydi.',
      },
      {
        id: 6,
        type: 'SOFT_SKILL',
        question: 'Jamoada yangi funksiya bo‘yicha texnik fikrlar to‘qnash kelganda nima qilasiz?',
        options: [
          'O‘z fikrimda qat’iy turib, boshqalarning dalillarini rad etaman',
          'Faktlar, xavflar va biznes talablarini o‘rtaga qo‘yib, jamoaviy muhokama va kompromissga intilaman',
          'Munozaradan qochib, ishni butunlay to‘xtataman',
          'Rahbariyatga jamoa a’zolari ustidan shikoyat qilaman',
        ],
        correctIndex: 1,
        explanation: 'Konstruktiv muloqot va asosli dalillar jamoaviy muvaffaqiyatning kalitidir.',
      },
      {
        id: 7,
        type: 'SOFT_SKILL',
        question: 'Belgilangan muddatga (deadline) vazifani yetkaza olmaslik xavfi sezilsa nima qilasiz?',
        options: [
          'Muddat o‘tib ketguncha kutib, keyin sababini tushuntiraman',
          'Vaziyatni oldindan mas’ul rahbar yoki jamoaga xabar berib, ustuvorliklarni (priority) qayta kelishaman',
          'Kodni shoshilinch tekshirmasdan yuborib yashiraman',
          'Boshqa hamkasblarni aybdor qilib ko‘rsataman',
        ],
        correctIndex: 1,
        explanation: 'Ochiq va erta kommunikatsiya risklarni boshqarishga va to‘g‘ri yechim topishga yordam beradi.',
      },
      {
        id: 8,
        type: 'SOFT_SKILL',
        question: 'Kodingiz yoki bajargan ishingiz bo‘yicha jiddiy tanqidiy fikr (Code Review) bildirilganda munosabatingiz qanday bo‘ladi?',
        options: [
          'Buni shaxsiy adovat deb qabul qilib, xafa bo‘laman',
          'Fikrni professional nuqtai nazardan tahlil qilib, asosli tavsiyalarni o‘rganish va yaxshilash imkoniyati sifatida qabul qilaman',
          'Hech qanday o‘zgarish qilmasdan e’tiborsiz qoldiraman',
          'Boshqa odamlarning kodiga qasddan salbiy sharhlar yozaman',
        ],
        correctIndex: 1,
        explanation: 'Professional mulohazaga ochiqlik mutaxassis sifatida o‘sish uchun eng muhim fazilatdir.',
      },
      {
        id: 9,
        type: 'SOFT_SKILL',
        question: 'Ishlab chiqarish (production) tizimida siz javobgar bo‘lgan xatolik aniqlansa nima qilasiz?',
        options: [
          'Xatoni boshqa tizim yoki hamkasbga yuklashga harakat qilaman',
          'Mas’uliyatni o‘z zimmamga olaman, zudlik bilan tuzatish chorasini ko‘raman va kelgusida takrorlanmasligi uchun tahlil (post-mortem) o‘tkazaman',
          'Jim o‘tirib, hech kim sezmasligiga umid qilaman',
          'Xatolikni tuzatishdan bosh tortaman',
        ],
        correctIndex: 1,
        explanation: 'Mas’uliyatni his qilish va tuzatishga qaratilgan harakat yetuk mutaxassis belgisi.',
      },
      {
        id: 10,
        type: 'SOFT_SKILL',
        question: 'Sizga mutlaqo notanish bo‘lgan yangi texnologiya yoki noaniq topshiriq berilsa qanday yo‘l tutasiz?',
        options: [
          'Buni bilmayman deb topshiriqni darhol rad etaman',
          'Rasmiy hujjatlar va namunalarni o‘rganaman, noaniq joylariga oydinlik kiritish uchun savollar beraman va bosqichma-bosqich yechim yarataman',
          'Hech kimdan so‘ramasdan tasodifiy kod yozib topshiraman',
          'Boshqa birov bu ishni qilib berishini kutib turaman',
        ],
        correctIndex: 1,
        explanation: 'Mustaqil o‘rganish va kerakli vaqtda aniqlashtiruvchi savollar berish moslashuvchanlikni ko‘rsatadi.',
      },
    ],
  };
}
