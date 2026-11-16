import { expect, test } from "@playwright/test";

/** Smoke test for Scenario 1: the full loop from the ArchLab.md "How It Works" section. */
test("Scenario 1: raise the load, read the diagnosis, pick a fix, get a verdict", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /One Server Is Enough/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("One Server Is Enough (Until It Isn't)");

  const diagnosis = page.getByTestId("diagnosis");
  await expect(diagnosis).toContainText("Healthy");
  await expect(page.getByText("✓ Meets the target")).toBeVisible();

  // Fixing too early: not needed yet.
  await page.getByRole("radio", { name: /Bigger server/ }).click();
  await expect(page.getByTestId("verdict")).toContainText("You did not need this yet");

  // Raise the load past the breaking point (about 185 rps).
  await page.getByRole("button", { name: "Back to the current setup" }).click();
  await page.getByRole("slider", { name: "Load" }).fill("250");
  await expect(diagnosis).toContainText("The app server is full");
  await expect(page.getByText("✗ Misses the target")).toBeVisible();

  await page.getByRole("radio", { name: /Bigger server/ }).click();
  await expect(page.getByTestId("verdict")).toContainText("Worth it at this load");
  await expect(page.getByRole("heading", { name: "Before and after at 250 rps" })).toBeVisible();

  await page.getByRole("radio", { name: /Second server \+ load balancer/ }).click();
  await expect(page.getByTestId("verdict")).toContainText("a cheaper fix exists");
  await expect(page.getByRole("img", { name: /Load balancer/ })).toBeVisible();
});

test("unknown scenario shows the not-found page", async ({ page }) => {
  // With Cache Components the shell streams before notFound() runs, so the HTTP status is 200.
  await page.goto("/scenarios/nope");
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
});
