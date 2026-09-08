import "../../src/native/native-bindings.ts";
import { nativeUI } from "../../src/native/native-ui.ts";
import { exercisePicker } from "../fixtures/picker.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
await exercisePicker(nativeUI(controller.signal), controller.signal);
