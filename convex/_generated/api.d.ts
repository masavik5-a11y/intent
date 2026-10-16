/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as auth from "../auth.js";
import type * as blocks from "../blocks.js";
import type * as categories from "../categories.js";
import type * as compass from "../compass.js";
import type * as crons from "../crons.js";
import type * as days from "../days.js";
import type * as goals from "../goals.js";
import type * as http from "../http.js";
import type * as lib_allowedEmails from "../lib/allowedEmails.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as model_activities from "../model/activities.js";
import type * as model_blocks from "../model/blocks.js";
import type * as model_categories from "../model/categories.js";
import type * as model_compass from "../model/compass.js";
import type * as model_days from "../model/days.js";
import type * as model_goals from "../model/goals.js";
import type * as model_recurrences from "../model/recurrences.js";
import type * as model_settings from "../model/settings.js";
import type * as recurrences from "../recurrences.js";
import type * as settings from "../settings.js";
import type * as setup from "../setup.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  auth: typeof auth;
  blocks: typeof blocks;
  categories: typeof categories;
  compass: typeof compass;
  crons: typeof crons;
  days: typeof days;
  goals: typeof goals;
  http: typeof http;
  "lib/allowedEmails": typeof lib_allowedEmails;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "model/activities": typeof model_activities;
  "model/blocks": typeof model_blocks;
  "model/categories": typeof model_categories;
  "model/compass": typeof model_compass;
  "model/days": typeof model_days;
  "model/goals": typeof model_goals;
  "model/recurrences": typeof model_recurrences;
  "model/settings": typeof model_settings;
  recurrences: typeof recurrences;
  settings: typeof settings;
  setup: typeof setup;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
