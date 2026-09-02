#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const path = require("path");
const crypto = require("crypto");

const S3_BUCKET = "perception-public-data-us-east-1-prod";
const S3_PREFIX = "oms_sync_check";
const S3_BASE_URL =
  `https://${S3_BUCKET}.s3.amazonaws.com/${S3_PREFIX}`;

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

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function sha256(value, encoding) {
  return crypto.createHash("sha256").update(value, "utf8").digest(encoding);
}

function getSignatureKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function encodeS3Key(key) {
  return key.split("/").map(part => encodeURIComponent(part)).join("/");
}

function signedS3RequestOptions(key) {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  const region = process.env.AWS_REGION || "us-east-1";

  if (!accessKeyId || !secretAccessKey) return null;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = `${S3_BUCKET}.s3.${region}.amazonaws.com`;
  const canonicalUri = `/${encodeS3Key(key)}`;
  const headers = {
    host,
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    "x-amz-date": amzDate,
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(name => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = [
    "GET",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest, "hex"),
  ].join("\n");
  const signature = hmac(
    getSignatureKey(secretAccessKey, dateStamp, region, "s3"),
    stringToSign,
    "hex",
  );

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    hostname: host,
    path: canonicalUri,
    method: "GET",
    headers,
  };
}

function downloadSignedS3(key) {
  const options = signedS3RequestOptions(key);
  if (!options) return null;

  return new Promise((resolve, reject) => {
    https
      .request(options, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`S3 download failed: ${res.statusCode} s3://${S3_BUCKET}/${key}`));
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
      .on("error", reject)
      .end();
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
    storylineCompanyId: String(row.company_id || row.companyId || row.teacher_org_id || row.teacherOrgId || "").trim(),
    storylineClassroomId: String(row.classroom_id || row.classroomId || row.teacher_class_id || row.teacherClassId || "").trim(),
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
    .map(row => [
      row.siteId,
      row.company,
      row.classroom,
      row.schedule,
      row.serviceDays,
      row.storylineCompanyId,
      row.storylineClassroomId,
    ].join("\t"))
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
  형식: siteID / 기관명 / 교실명 / 스케쥴 / 서비스요일 / 스토리라인기관ID / 스토리라인교실ID
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
    const key = `${S3_PREFIX}/oms_data_${date}.json`;
    const url = `${S3_BASE_URL}/oms_data_${date}.json`;
    sourceLabel = `s3://${S3_BUCKET}/${key}`;
    rawJson = await downloadSignedS3(key);

    if (!rawJson) {
      sourceLabel = url;
      rawJson = await download(url);
    }
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
