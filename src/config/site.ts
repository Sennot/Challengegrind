// Static site content — edit freely.
export const SITE = {
  name: "ChallengeGrind",
  tagline: "Список сложнейших челленджей Geometry Dash",
};

export const SOCIALS: { name: string; handle: string; url: string; kind: "telegram" }[] = [
  { name: "Telegram", handle: "@Challengegrind", url: "https://t.me/Challengegrind", kind: "telegram" },
];

export const RULES: { title: string; items: string[] }[] = [
  {
    title: "Требования к рекорду",
    items: [
      "Принимаются только прохождения на 100%.",
      "Видео обязательно (YouTube или Telegram): прохождение должно быть записано целиком, без склеек.",
      "На видео должны быть слышны клики (или видны нажатия) и звук игры.",
      "Моды, дающие преимущество (noclip, speedhack и т.п.), запрещены.",
    ],
  },
  {
    title: "Raw footage",
    items: [
      "Raw footage при подаче не требуется.",
      "Не удаляйте raw footage в течение 3 дней после подачи рекорда — администрация может его запросить.",
    ],
  },
  {
    title: "Уровни",
    items: [
      "В список попадают челленджи, одобренные командой листа.",
      "Верифер уровня получает очки за него автоматически.",
      "Позиции определяются командой и могут меняться — все изменения видны во вкладке Changelog.",
    ],
  },
  {
    title: "Аккаунты",
    items: [
      "Регистрируйтесь под своим ником. Аккаунты, созданные под чужим именем, будут переданы владельцу ника.",
      "Один аккаунт на одного игрока. За нарушения аккаунт может быть заблокирован.",
    ],
  },
];
