const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const manifestPath = path.join(rootDir, "manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validateExtensionVersion(version) {
  if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(
      `package.json version "${version}" 不符合浏览器扩展版本格式，必须是 x.y.z 或 x.y.z.w 这样的纯数字版本。`,
    );
  }
}

const packageJson = readJson(packageJsonPath);
const manifest = readJson(manifestPath);
const version = String(packageJson.version || "").trim();

if (!version) {
  throw new Error("package.json 中缺少 version，无法同步 manifest.json");
}

validateExtensionVersion(version);

if (manifest.version === version) {
  console.log(`manifest.json 已是最新版本: ${version}`);
  process.exit(0);
}

manifest.version = version;
writeJson(manifestPath, manifest);
console.log(`已同步 manifest.json 版本 -> ${version}`);
