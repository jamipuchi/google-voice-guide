type StatusPillProps = {
  label: string;
  tone?: 'default' | 'success';
};

const toneClasses: Record<NonNullable<StatusPillProps['tone']>, string> = {
  default: 'bg-ink/10 text-ink',
  success: 'bg-teal/10 text-teal'
};

export default function StatusPill({
  label,
  tone = 'default'
}: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
