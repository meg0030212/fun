/* Chinese / Japanese / Korean input methods (IME) compose text before committing it.
   While composing, the page must not rewrite the field or save it, otherwise some
   browsers (Safari, several Windows IMEs) insert the committed text a second time. */
import React, { useState } from 'react';

/** true for keys that belong to the IME (e.g. the Enter that confirms a candidate) */
export function isImeKey(e: React.KeyboardEvent | KeyboardEvent): boolean {
  const n = 'nativeEvent' in e ? e.nativeEvent : e;
  // Safari reports the confirming Enter after compositionend with keyCode 229
  return !!n.isComposing || n.keyCode === 229;
}

/**
 * props for a controlled <input>/<textarea> bound to saved data: while composing, the text
 * stays local and onValue is called once, when the composition is confirmed.
 */
export function useImeValue(value: string, onValue: (v: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? value,
    onCompositionStart: (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.currentTarget.value),
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.currentTarget.value;
      setDraft(null);
      onValue(v);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (draft !== null || (e.nativeEvent as InputEvent).isComposing) setDraft(e.target.value);
      else onValue(e.target.value);
    },
  };
}

/** <input> that is safe to type Chinese into while it is bound to saved data */
export function ImeInput({ value, onValue, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onValue: (v: string) => void }) {
  const ime = useImeValue(value, onValue);
  return React.createElement('input', { ...rest, ...ime });
}
