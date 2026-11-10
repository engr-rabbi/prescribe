import type { Col } from "./schema";
import { EXTRA_SHEETS } from "./schema";
export const audit: Col[] = EXTRA_SHEETS.find((s) => s.sheet === "AuditLogs")!.cols;
