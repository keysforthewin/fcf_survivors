import { After } from "@cucumber/cucumber";
import { TestWorld } from "./world.ts";

After(async function (this: TestWorld) {
  await this.teardown();
});
