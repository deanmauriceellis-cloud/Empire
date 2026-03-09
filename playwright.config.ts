import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:5174",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
      ],
    },
  },
  projects: [
    {
      name: "singleplayer",
      testMatch: /singleplayer\.spec\.ts/,
      use: { browserName: "chromium" },
    },
    {
      name: "multiplayer",
      testMatch: /multiplayer\.spec\.ts/,
      use: { browserName: "chromium" },
    },
    {
      name: "perf",
      testMatch: /perf\.spec\.ts/,
      use: { browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command: "pnpm dev:client",
      port: 5174,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm dev:server",
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
