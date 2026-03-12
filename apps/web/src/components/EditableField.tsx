import { useEffect, useRef, useState } from 'react';
import { useTypewriter } from '@/hooks/useTypewriter';

type EditableFieldProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  /** When true, incoming value changes animate with typewriter + glow */
  animateChanges?: boolean;
};

export default function EditableField({
  value,
  onChange,
  className = '',
  inputClassName = '',
  placeholder = '--',
  animateChanges = false,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [glowing, setGlowing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevValueRef = useRef(value);

  // Detect external (AI) value changes to trigger animation
  const shouldAnimate = animateChanges && value !== prevValueRef.current && !isEditing;

  const { displayValue, isTyping } = useTypewriter(value, shouldAnimate, {
    speed: 35,
    onComplete: () => {
      // Keep glow for a beat after typing finishes, then fade
      setTimeout(() => setGlowing(false), 600);
    },
  });

  // Track when value changes externally to trigger glow
  useEffect(() => {
    if (value !== prevValueRef.current && !isEditing) {
      if (animateChanges) {
        setGlowing(true);
      }
      prevValueRef.current = value;
      setLocalValue(value);
    } else if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      setLocalValue(value);
    }
  }, [value, isEditing, animateChanges]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  function handleCommit() {
    setIsEditing(false);
    const trimmed = localValue.trim();
    if (trimmed !== value) {
      onChange(trimmed);
    } else {
      setLocalValue(value);
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className={`rounded-md border border-solid border-brand-600 bg-default-background px-1 py-0.5 outline-none ${inputClassName}`}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCommit();
          if (e.key === 'Escape') {
            setLocalValue(value);
            setIsEditing(false);
          }
        }}
      />
    );
  }

  const shown = animateChanges && (isTyping || glowing) ? displayValue : value;

  return (
    <span
      className={`cursor-pointer rounded-md px-1 py-0.5 transition-all duration-500 hover:bg-neutral-100 ${
        glowing
          ? 'ring-2 ring-brand-500/60 bg-brand-50 shadow-[0_0_16px_rgba(59,130,246,0.35)]'
          : ''
      } ${className}`}
      onClick={() => {
        setIsEditing(true);
        setLocalValue(value);
      }}
      title="Click to edit"
    >
      {shown || <span className="text-subtext-color">{placeholder}</span>}
      {isTyping && (
        <span className="animate-pulse text-brand-600 ml-px">|</span>
      )}
    </span>
  );
}
