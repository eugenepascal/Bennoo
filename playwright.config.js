import { defineConfig, devices } from "@playwright/test";

// Les tests de bout en bout tournent contre les émulateurs Firebase (npm run test:e2e) :
// aucune donnée réelle n'est touchée. Le site est servi en statique sur localhost.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5000",
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "python3 -m http.server 5000 --bind 127.0.0.1 --directory public",
    url: "http://127.0.0.1:5000/index.html",
    reuseExistingServer: false,
  },
});
