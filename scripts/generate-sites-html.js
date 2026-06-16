#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const path = require("path");

const S3_BASE_URL =
  "https://perception-public-data-us-east-1-prod.s3.amazonaws.com/oms_sync_check";

const DAY_MAP = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (!cur.startsWith("--")) continue;
    const key = cur.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function todaySeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Download failed: ${res.statusCode} ${url}`));
          res.resume();
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", chunk => {
          body += chunk;
        });
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

function splitCompanyClassroom(name) {
  const value = String(name || "").trim();
  const idx = value.indexOf("_");
  if (idx < 0) return { company: value, classroom: "교실미등록(기관)" };
  return {
    company: value.slice(0, idx).trim(),
    classroom: value.slice(idx + 1).trim() || "교실미등록(기관)",
  };
}

function formatServiceDays(days) {
  if (!Array.isArray(days) || !days.length) return "교실미등록(기관)";
  return days.map(day => DAY_MAP[day] || "").filter(Boolean).join("");
}

function normalizeRow(row) {
  const { company, classroom } = splitCompanyClassroom(row.companyClassroomName);
  return {
    siteId: String(row.positionId || "").trim(),
    company,
    classroom,
    schedule: String(row.schedule || "스케쥴미설정").trim(),
    serviceDays: formatServiceDays(row.serviceDays),
  };
}

function validateRows(rows) {
  const errors = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row.siteId) errors.push("positionId가 비어 있는 row가 있습니다.");
    if (seen.has(row.siteId)) errors.push(`중복 positionId: ${row.siteId}`);
    seen.add(row.siteId);
  }
  return errors;
}

function renderSitesHtml(rows, sourceLabel) {
  const lines = rows
    .map(row => [row.siteId, row.company, row.classroom, row.schedule, row.serviceDays].join("\t"))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>사이트 리스트</title>
</head>
<body>
<!--
  사이트 리스트 관리 파일
  자동 생성됨: ${new Date().toISOString()}
  원본: ${sourceLabel}
  형식: siteID / 기관명 / 교실명 / 스케쥴 / 서비스요일
-->
<pre id="site-data">
${lines}
</pre>
</body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || todaySeoul();
  const output = args.output || path.resolve(process.cwd(), "sites.html");

  let sourceLabel;
  let rawJson;

  if (args.input) {
    sourceLabel = path.resolve(args.input);
    rawJson = fs.readFileSync(sourceLabel, "utf8");
  } else {
    const url = `${S3_BASE_URL}/oms_data_${date}.json`;
    sourceLabel = url;
    rawJson = await download(url);
  }

  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) throw new Error("OMS JSON root는 배열이어야 합니다.");

  const rows = parsed.map(normalizeRow).sort((a, b) => a.siteId.localeCompare(b.siteId));
  const errors = validateRows(rows);
  if (errors.length) {
    throw new Error(`sites.html 생성 중단:\n${errors.slice(0, 20).join("\n")}`);
  }

  const html = renderSitesHtml(rows, sourceLabel);
  fs.writeFileSync(output, html, "utf8");
  console.log(`Generated ${output}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Source: ${sourceLabel}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
