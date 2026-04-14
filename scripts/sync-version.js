const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateExtensionVersion(version) {
  if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(
      `package.json version "${version}" 不符合浏览器扩展版本格式，必须是 x.y.z 或 x.y.z.w 这样的纯数字版本。`,
    );
  }
}

const packageJson = readJson(packageJsonPath);
const version = String(packageJson.version || "").trim();

if (!version) {
  throw new Error("package.json 中缺少 version，无法生成扩展 manifest");
}

validateExtensionVersion(version);
console.log(`WXT 将使用 package.json 版本生成 manifest: ${version}`);
