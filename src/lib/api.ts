// The one door from src/ to the backend's generated API, so features import
// "@/lib/api" instead of counting "../" segments.
export { api } from "../../convex/_generated/api";
export type { Doc, Id } from "../../convex/_generated/dataModel";
