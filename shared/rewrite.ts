export const defaultRewriteInstruction = `Исправь опечатки, орфографию, пунктуацию и неудачные формулировки.
Перепиши текст так, чтобы мысли шли в логичном порядке, а изложение было ясным и связным. При необходимости переставляй предложения, объединяй или разделяй абзацы, используй списки.
Сохрани исходные язык и тон, смысл, факты, имена, числа и ссылки. Не добавляй новые сведения, приветствия или подписи.
Не используй буквы «ё» и «Ё»: заменяй их на «е» и «Е». По возможности избегай длинного тире (—): перестраивай фразу или используй другую уместную пунктуацию.`;

export const maxRewriteInstructionLength = 10_000;

export function isRewriteInstruction(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxRewriteInstructionLength &&
    !value.includes("\0")
  );
}
