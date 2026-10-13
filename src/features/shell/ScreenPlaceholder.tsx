/** Stands in for a screen until its milestone builds it. */
export function ScreenPlaceholder({
  title,
  milestone,
}: {
  title: string;
  milestone: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-6">
      <h1 className="text-xl font-medium">{title}</h1>
      <p className="text-muted-foreground">Arrives in {milestone}.</p>
    </div>
  );
}
