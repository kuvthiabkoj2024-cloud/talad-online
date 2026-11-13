/** Market Chat training (Admin → Market Chat): limits for answers, words and the inbox. */
export const ASSISTANT_TRAINING = {
  /** Phrasings per answer, and the length of each. */
  questionsMax: 20,
  questionMax: 300,
  answerMax: 2000,
  productWordsMax: 200,
  /** Words: the word itself, and what it means (up to 10 search words). */
  wordMax: 60,
  meansMax: 10,
  /** How many answers and words Claude's instructions carry (newest first). */
  modelAnswers: 80,
  modelWords: 200,
} as const;

/** Why a question is in the inbox. */
export const ASSISTANT_MISS_OUTCOMES = ['not_understood', 'not_found', 'related'] as const;
export type AssistantMissOutcome = (typeof ASSISTANT_MISS_OUTCOMES)[number];
