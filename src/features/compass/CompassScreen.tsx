import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { CompassText } from "./CompassText";
import { ANTI_VISION, lastEditedText, VISION } from "./compassCopy";

/**
 * The Compass (PRD V1): the life you are building and the life you refuse to drift
 * into, in your own words. Nothing here is shown anywhere else unless you ask.
 */
export function CompassScreen() {
  const compass = useQuery(api.compass.get);
  const save = useMutation(api.compass.save);
  const saveVision = useCallback(
    (text: string) => save({ field: VISION.field, text }).then(() => undefined),
    [save],
  );
  const saveAntiVision = useCallback(
    (text: string) =>
      save({ field: ANTI_VISION.field, text }).then(() => undefined),
    [save],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">Compass</h1>
        <p className="text-muted-foreground">
          Your own words, for the days you need them. They stay here until you
          come looking.
        </p>
      </header>
      {compass !== undefined && (
        <>
          <div className="grid gap-8 md:grid-cols-2">
            <CompassText
              title={VISION.title}
              prompts={VISION.prompts}
              saved={compass?.vision ?? ""}
              onSave={saveVision}
            />
            <CompassText
              title={ANTI_VISION.title}
              prompts={ANTI_VISION.prompts}
              saved={compass?.antiVision ?? ""}
              onSave={saveAntiVision}
            />
          </div>
          {compass !== null && (
            <p className="text-sm text-muted-foreground">
              {lastEditedText(compass.updatedAt)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
