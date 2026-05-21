import { test as base, createBdd } from "playwright-bdd";
import { installMockWebSocket } from "./mock-ws.ts";

interface Fixtures {
  mocked: boolean;
}

export const test = base.extend<Fixtures>({
  /**
   * Step-driven flag. Setting it true via "Given the WebSocket is mocked"
   * injects the mock-ws addInitScript before the page navigates.
   */
  mocked: [false, { option: true }],
});

export const { Given, When, Then } = createBdd(test);

export { installMockWebSocket };
