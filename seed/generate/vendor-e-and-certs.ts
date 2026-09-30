// Vendor E (incumbent): one-line email plus an ISO 9001 certificate that
// expired before the RFx date; no questionnaire answers.
// Also Vendor A (ISO + FSC) and Vendor D (ISO) certificates.
import fs from "node:fs";
import { certificate } from "./pdf";

export async function generateVendorE(outDir: string) {
  const email = [
    "From: Santosh Shinde <omsaicartons@example.com>",
    "To: Ranjan (Buyer) <buyer@chakan-plant.example>",
    "Date: Tue, 29 Sep 2026 21:47:12 +0530",
    "Subject: Re: RFQ – Corrugated Packaging – Chakan Plant FY27 Annual Contract",
    "Attachment: ISO certificate.pdf",
    "",
    "Sir,",
    "",
    "₹42/kg for the 5-ply, 38 for the 3-ply, rest same as last year, freight extra.",
    "",
    "Regards,",
    "Santosh",
    "Om Sai Cartons, Chakan",
    "Sent from my phone",
  ].join("\n");
  fs.writeFileSync(`${outDir}/email.txt`, email);

  await certificate(`${outDir}/ISO certificate.pdf`, {
    body: "ACCURA CERTIFICATION SERVICES PVT LTD",
    title: "CERTIFICATE OF APPROVAL",
    standard: "ISO 9001:2015",
    holder: "OM SAI CARTONS",
    address: "Gat No. 1187, Kharabwadi, Chakan, Tal. Khed, Pune 410501",
    certNo: "ACS/QMS/21/3390",
    scope: "Manufacturing of corrugated boxes",
    issued: "01 September 2023",
    validUntil: "31 August 2026",
    accent: "#5b3a8c",
  });
}

export async function generateOtherCerts(dirA: string, dirD: string) {
  await certificate(`${dirA}/Transpac_ISO9001_2015.pdf`, {
    body: "GLOBAL ASSURANCE REGISTRAR (SINGAPORE) PTE LTD",
    title: "CERTIFICATE OF REGISTRATION",
    standard: "ISO 9001:2015",
    holder: "TRANSPAC GLOBAL PACKAGING (INDIA) PVT LTD",
    address: "Bldg 7, Rajlaxmi Complex, Bhiwandi 421302, Maharashtra, India",
    certNo: "QMS/IN/88213",
    scope: "Manufacture and distribution of corrugated and printed packaging",
    issued: "15 January 2025",
    validUntil: "14 January 2028",
    accent: "#1f3864",
  });
  await certificate(`${dirA}/Transpac_FSC_CoC.pdf`, {
    body: "FOREST STEWARDSHIP COUNCIL — ACCREDITED CERTIFICATION BODY",
    title: "FSC CHAIN OF CUSTODY CERTIFICATE",
    standard: "FSC-STD-40-004 V3-1 (Chain of Custody)",
    holder: "TRANSPAC GLOBAL PACKAGING (INDIA) PVT LTD",
    address: "Bldg 7, Rajlaxmi Complex, Bhiwandi 421302, Maharashtra, India",
    certNo: "FSC-C171204",
    scope: "Corrugated boxes and sheets, FSC Mix and FSC Recycled",
    issued: "20 June 2024",
    validUntil: "19 June 2029",
    accent: "#2f6b3a",
  });
  await certificate(`${dirD}/Mahalaxmi_ISO.pdf`, {
    body: "QUALITY RESEARCH ORGANIZATION (QRO) INDIA",
    title: "CERTIFICATE OF REGISTRATION",
    standard: "ISO 9001:2015",
    holder: "MAHALAXMI PACKAGING WORKS",
    address: "Plot 58, MIDC Ambad, Nashik 422010, Maharashtra",
    certNo: "QRO/IN/QMS/77120",
    scope: "Manufacture of corrugated boxes, sheets and heavy-duty cartons",
    issued: "10 May 2025",
    validUntil: "09 May 2028",
    accent: "#8b1a1a",
  });
}
