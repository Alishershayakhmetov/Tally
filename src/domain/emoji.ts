// Task icons (Phase 8): a catalog of emoji by category for the icon picker,
// plus any emoji the user types. Icons stay plain emoji strings, so badges,
// widgets and backups need nothing new. The catalog sticks to Emoji 12 or
// older, which Android 10 and later can draw.

export type EmojiCategoryId =
  'sport' | 'health' | 'food' | 'study' | 'work' | 'home' | 'hobbies' | 'nature' | 'symbols';

export type EmojiCategory = { id: EmojiCategoryId; emojis: readonly string[] };

// Twelve per row keeps the catalog readable, so prettier leaves it alone.
// prettier-ignore
export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'sport',
    emojis: [
      '💪', '🏃', '🚶', '🏋️', '🤸', '🧘', '🚴', '🏊', '🤾', '⛹️', '🧗', '🥊',
      '🥋', '🏓', '🏸', '🎾', '⚽', '🏀', '🏐', '🏈', '⚾', '🏒', '⛷️', '🏂',
      '🛹', '🤺', '🏇', '🦵', '🦶', '👟', '⏱️', '🥇', '🏆', '🤼', '🚣', '🏄',
    ],
  },
  {
    id: 'health',
    emojis: [
      '💧', '🥛', '🍵', '☕', '💊', '🩺', '😴', '🛌', '🧠', '❤️', '🦷', '🧴',
      '🚭', '🩹', '⚖️', '🌡️', '🧼', '😌', '🙏', '👁️', '👂', '🏥', '🧖', '💆',
    ],
  },
  {
    id: 'food',
    emojis: [
      '🍎', '🍌', '🥦', '🥕', '🥗', '🍓', '🥑', '🍳', '🥚', '🍞', '🍚', '🐟',
      '🍗', '🥩', '🍫', '🍬', '🍕', '🍔', '🍟', '🍰', '🍷', '🍺', '🧃', '🥤',
      '🍉', '🍇', '🥜', '🧀', '🍯', '🥣',
    ],
  },
  {
    id: 'study',
    emojis: [
      '📖', '📚', '✍️', '📝', '🎓', '🧮', '🔬', '🧪', '🌍', '🗣️', '🔤', '💻',
      '⌨️', '👩‍💻', '📐', '🎹', '🎸', '🎻', '🥁', '🎤', '🎨', '🖌️', '📷', '👩‍🏫',
      '🗒️', '🔭', '♟️', '👨‍🎓',
    ],
  },
  {
    id: 'work',
    emojis: [
      '💼', '📈', '📊', '📅', '⏰', '✅', '📞', '📧', '💰', '💵', '🏦', '🧾',
      '📦', '🛠️', '🔧', '🚗', '🚌', '✈️', '🖥️', '📋', '🗂️', '🤝', '🎙️', '🚀',
    ],
  },
  {
    id: 'home',
    emojis: [
      '🏠', '🧹', '🧺', '🧽', '🛏️', '🌱', '🐕', '🐈', '👶', '🍽️', '🛒', '🗑️',
      '♻️', '🔑', '💡', '🚿', '🛁', '🪑', '🧸', '👕', '🧦', '🪒', '🐠', '🐦',
    ],
  },
  {
    id: 'hobbies',
    emojis: [
      '🎮', '🎲', '🧩', '🎬', '🎧', '📺', '🧶', '🎣', '🏕️', '🗺️', '📸', '🎉',
      '🎁', '🎭', '🎳', '🎱', '🎼', '🪁', '🧵', '🎯', '🎪', '🏝️', '⛺', '🚲',
    ],
  },
  {
    id: 'nature',
    emojis: [
      '🌞', '🌙', '⭐', '🌈', '☔', '❄️', '🔥', '🌊', '🌲', '🌸', '🌻', '🍀',
      '🐾', '🦋', '🐝', '🌵', '🍁', '⛰️', '🌋', '🌏', '☁️', '⚡', '🌷', '🐢',
    ],
  },
  {
    id: 'symbols',
    emojis: [
      '✔️', '❌', '💯', '♾️', '💎', '🧭', '⏳', '🔔', '📌', '🏁', '🧡', '💛',
      '💚', '💙', '💜', '🖤', '🤍', '❗', '➕', '🔁', '🆕', '🔝', '🎗️', '🕐',
    ],
  },
];

/** Longest typed icon kept, in UTF-16 units: room for flags and family emoji (11 units). */
export const MAX_EMOJI_LENGTH = 16;

// Hermes builds may lack Unicode property escapes; then a looser check is used.
let pictographic: RegExp | null = null;
try {
  pictographic = new RegExp('\\p{Extended_Pictographic}|\\p{Regional_Indicator}|\\u20E3', 'u');
} catch {
  pictographic = null;
}

/**
 * An icon typed by the user (any emoji from the keyboard), or null when it
 * isn't one: empty, too long, or plain letters and digits rather than emoji.
 */
export function normalizeEmoji(text: string): string | null {
  const value = text.trim();
  if (value === '' || value.length > MAX_EMOJI_LENGTH || /\s/.test(value)) return null;
  if (pictographic) return pictographic.test(value) ? value : null;
  return /[A-Za-z0-9]/.test(value) ? null : value;
}
