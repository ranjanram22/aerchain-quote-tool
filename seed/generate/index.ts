// Regenerates every seed file. Run: npm run seed:files
import fs from "node:fs";
import path from "node:path";
import { generateVendorA } from "./vendor-a";
import { generateVendorB } from "./vendor-b";
import { generateVendorC } from "./vendor-c";
import { generateVendorD } from "./vendor-d";
import { generateVendorE, generateOtherCerts } from "./vendor-e-and-certs";
import { generateUnseen } from "./unseen";

const root = path.resolve(__dirname, "..", "..");
const d = (p: string) => {
  const full = path.join(root, p);
  fs.mkdirSync(full, { recursive: true });
  return full;
};

async function main() {
  const A = d("seed/files/vendor-a"), B = d("seed/files/vendor-b"), C = d("seed/files/vendor-c");
  const D = d("seed/files/vendor-d"), E = d("seed/files/vendor-e"), P = d("seed/print"), U = d("samples/unseen");
  await generateVendorA(A);
  await generateVendorB(B);
  await generateVendorC(C);
  await generateVendorD(D, P);
  await generateVendorE(E);
  await generateOtherCerts(A, D);
  await generateUnseen(U);
  console.log("Seed files written to seed/files, seed/print and samples/unseen.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
