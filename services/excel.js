import xlsx from "xlsx";
import { z } from "zod";

const RowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  college: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  externalRef: z.string().optional().nullable()
});

function normalizeRow(row) {
  const pick = (keys) => {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return undefined;
  };

  return {
    name: pick(["name", "Name", "Full Name", "full_name"]),
    email: pick(["email", "Email", "Email Address", "email_address"])?.toLowerCase(),
    phone: pick(["phone", "Phone", "Mobile", "mobile"]),
    college: pick(["college", "College", "Institution", "institution"]),
    department: pick(["department", "Department", "Dept", "dept"]),
    externalRef: pick(["id", "ID", "Registration ID", "registration_id", "external_ref"])
  };
}

export function parseExcel(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
  const seen = new Set();

  return rows.map((row, index) => {
    const normalized = normalizeRow(row);
    const parsed = RowSchema.safeParse(normalized);
    const errors = [];

    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    }

    if (normalized.email) {
      if (seen.has(normalized.email)) {
        errors.push("Duplicate email inside import file.");
      }
      seen.add(normalized.email);
    }

    return {
      rowNumber: index + 2,
      data: parsed.success ? parsed.data : null,
      errors
    };
  });
}
