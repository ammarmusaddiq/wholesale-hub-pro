interface Props {
  en: string;
  ur: string;
  className?: string;
  inline?: boolean;
}

export function BiLabel({ en, ur, className = "", inline = false }: Props) {
  if (inline) {
    return (
      <span className={className}>
        {en} <span className="urdu text-muted-foreground text-sm">/ {ur}</span>
      </span>
    );
  }
  return (
    <span className={"flex flex-col leading-tight " + className}>
      <span>{en}</span>
      <span className="urdu text-xs text-muted-foreground">{ur}</span>
    </span>
  );
}
