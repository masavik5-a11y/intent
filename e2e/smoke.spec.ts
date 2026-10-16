import { expect, test } from "@playwright/test";

// One smoke path (docs/ARCHITECTURE.md, section 13): sign in, create a block, mark it
// done, see it in the actual lane. It works on a day long past, with a title no one
// else uses, so it never touches real days, and it deletes the block at the end.

const email = process.env.E2E_EMAIL ?? "dev@intent.test";
const password = process.env.E2E_PASSWORD ?? "intent-local-dev-1";

/** A day in 2001–2020 picked per run, so a run left half-done never collides. */
function pastDay(seed: number): string {
  const day = new Date(Date.UTC(2001 + (seed % 20), 0, 1 + (seed % 300)));
  return day.toISOString().slice(0, 10);
}

test("sign in, plan a block, mark it done, see it in the actual lane", async ({
  page,
}) => {
  const seed = Math.floor(Math.random() * 1_000_000);
  const title = `Smoke ${seed}`;
  const date = pastDay(seed);

  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Signed in, the app opens on today (or first-run setup for a new account).
  await expect(page).toHaveURL(/\/(day|welcome)\//, { timeout: 30_000 });

  // A day long past: its plan is behind "Edit plan".
  await page.goto(`/day/${date}`);
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What").fill(title);
  await dialog.getByRole("radio", { name: "Deep work" }).click();
  await dialog.getByLabel("Start").fill("10:00");
  await dialog.getByLabel("Length").fill("30m");
  await dialog.getByRole("button", { name: "Add block" }).click();

  const plan = page.getByRole("list", { name: "Plan" });
  const card = plan.getByRole("button", { name: new RegExp(`^${title},`) });
  await expect(card).toBeVisible();

  // Done from block detail: the past is recorded as what happened.
  await card.click();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  const actual = page.getByRole("list", { name: "Actual" });
  await expect(
    actual.getByRole("button", {
      name: new RegExp(`^${title}, 10:00 to 10:30, done`),
    }),
  ).toBeVisible();

  // Leave the day as it was.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);
});
