// Static site content — edit freely.
export const SITE = {
  name: "ChallengeGrind",
};

export const SOCIALS: { name: string; handle: string; url: string; kind: "telegram" }[] = [
  { name: "Telegram", handle: "@Challengegrind", url: "https://t.me/Challengegrind", kind: "telegram" },
];

export const RULES: { title: string; items: string[] }[] = [
  {
    title: "Record requirements",
    items: [
      "Only 100% completions are accepted.",
      "A video is required (YouTube or Telegram), showing the whole run without cuts.",
      "Clicks (or taps) and game audio must be audible/visible.",
      "Mods that give an advantage (noclip, speedhack, etc.) are not allowed.",
    ],
  },
  {
    title: "Raw footage",
    items: [
      "Raw footage is not required when submitting.",
      "Keep your raw footage for 3 days after submitting — staff may ask for it.",
    ],
  },
  {
    title: "Levels",
    items: [
      "Only challenges approved by the list team are placed.",
      "Placements are decided by the team and may change — see the Changelog.",
    ],
  },
  {
    title: "Accounts",
    items: [
      "Register with your own nickname. Accounts made under someone else's name will be handed to the real owner.",
      "One account per player. Accounts may be banned for breaking the rules.",
    ],
  },
];
