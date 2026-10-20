import { useFetcher } from "react-router";
import { Star } from "lucide-react";

export function CourseRatingSummary({
  average,
  count,
}: {
  average: number | null;
  count: number;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Star
        aria-hidden="true"
        className="size-4 fill-amber-400 text-amber-500"
      />
      {average === null
        ? "No ratings yet"
        : `${average.toFixed(1)} / 5 (${count} ${count === 1 ? "rating" : "ratings"})`}
    </span>
  );
}

export function CourseRatingPicker({
  rating,
  action,
}: {
  rating: number | null;
  action: string;
}) {
  const fetcher = useFetcher<{ error?: string; success?: boolean }>();
  return (
    <div className="mt-4 space-y-2">
      <h2 className="font-semibold">Rate this course</h2>
      <fetcher.Form method="post" action={action}>
        <input type="hidden" name="intent" value="rate" />
        <div
          className="flex gap-1"
          role="group"
          aria-label="Choose your star rating"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="submit"
              name="rating"
              value={value}
              aria-label={`Rate ${value} ${value === 1 ? "star" : "stars"}`}
              aria-pressed={rating === value}
              disabled={fetcher.state !== "idle"}
              className="rounded p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Star
                aria-hidden="true"
                className={`size-6 ${value <= (rating ?? 0) ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`}
              />
            </button>
          ))}
        </div>
      </fetcher.Form>
      <p className="text-sm text-muted-foreground" role="status">
        {fetcher.state !== "idle"
          ? "Saving rating…"
          : (fetcher.data?.error ??
            (rating
              ? `Your rating: ${rating} / 5. Select a star to update it.`
              : "Select a star to save your rating."))}
      </p>
    </div>
  );
}
