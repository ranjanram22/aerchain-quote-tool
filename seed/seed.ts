// npm run seed  — resets the demo database (see lib/demo-reset.ts).
// npm run seed -- --no-extract  — master data only.
import { resetDemo } from "../lib/demo-reset";

resetDemo(console.log, { extract: !process.argv.includes("--no-extract") }).catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
