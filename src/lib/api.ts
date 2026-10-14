// The one door from src/ to the backend's generated API, so features import
// "@/lib/api" instead of counting "../" segments.
export { api } from "../../convex/_generated/api";
import type { FunctionArgs } from "convex/server";
import type { WithPlan } from "@shared/blocks";
import type { api as generatedApi } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
export type { Doc, Id } from "../../convex/_generated/dataModel";

/** A block with plan times: every block except an unplanned entry. */
export type PlannedBlockDoc = WithPlan<Doc<"blocks">>;

/** The arguments of blocks.update: what block detail and entry detail save. */
export type BlockUpdate = FunctionArgs<typeof generatedApi.blocks.update>;
