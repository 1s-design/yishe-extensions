const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const outputDir = path.join(rootDir, ".output", "chrome-mv3");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);

const version = String(packageJson.version || "").trim();
if (!version) {
  throw new Error("package.json 中缺少 version，无法构建发布包");
}

const releaseDirName = `yishe-extensions-v${version}`;
const releaseDir = path.join(distDir, releaseDirName);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyRecursive(sourcePath, targetPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    ensureDir(targetPath);
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function buildInstallGuide() {
  return [
    `YiShe Extensions v${version} 安装说明`,
    "",
    "1. 先执行构建，确保当前目录存在 .output/chrome-mv3。",
    "2. 打开 Chrome/Edge 的扩展管理页，例如 chrome://extensions/ 或 edge://extensions/。",
    "3. 开启右上角“开发者模式”。",
    `4. 点击“加载已解压的扩展程序”，选择当前目录中的 ${releaseDirName} 文件夹。`,
    "",
    "说明：WXT 构建产物已经位于该目录内，可直接作为已解压扩展加载。",
  ].join("\n");
}

if (!fs.existsSync(outputDir)) {
  throw new Error("未找到 .output/chrome-mv3，请先执行 npm run build");
}

ensureDir(distDir);
cleanDir(releaseDir);
ensureDir(releaseDir);
copyRecursive(outputDir, releaseDir);

for (const extraFile of ["readme.md", "快速开始.md"]) {
  const sourcePath = path.join(rootDir, extraFile);
  if (fs.existsSync(sourcePath)) {
    copyRecursive(sourcePath, path.join(releaseDir, extraFile));
  }
}

fs.writeFileSync(
  path.join(releaseDir, "安装说明.txt"),
  `${buildInstallGuide()}\n`,
  "utf8",
);

console.log(`发布目录已生成: ${releaseDir}`);
