import { organizationUI } from "../../experiments/node/organization-ui.ts";
import { exercisePicker } from "./picker.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
await exercisePicker(organizationUI(controller.signal), controller.signal);
