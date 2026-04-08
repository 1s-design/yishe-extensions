const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);

const version = String(packageJson.version || "").trim();
if (!version) {
  throw new Error("package.json 中缺少 version，无法构建发布包");
}

const releaseDirName = `yishe-extensions-v${version}`;
const releaseDir = path.join(distDir, releaseDirName);

const includeEntries = [
  "manifest.json",
  "assets",
  "background",
  "config",
  "content",
  "libs",
  "pages",
  "popup",
  "utils",
  "readme.md",
  "快速开始.md",
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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
    "1. 下载并解压当前压缩包。",
    `2. 打开 Chrome/Edge 的扩展管理页，例如 chrome://extensions/ 或 edge://extensions/。`,
    "3. 开启右上角“开发者模式”。",
    `4. 点击“加载已解压的扩展程序”，选择当前目录中的 ${releaseDirName} 文件夹。`,
    "",
    "说明：GitHub Release 提供的是源码压缩包，浏览器通常不能直接导入 zip，需要先解压再加载。",
  ].join("\n");
}

fs.rmSync(releaseDir, { recursive: true, force: true });
ensureDir(releaseDir);

for (const entry of includeEntries) {
  const sourcePath = path.join(rootDir, entry);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`构建发布包失败，缺少必要文件或目录: ${entry}`);
  }
  copyRecursive(sourcePath, path.join(releaseDir, entry));
}

fs.writeFileSync(
  path.join(releaseDir, "安装说明.txt"),
  `${buildInstallGuide()}\n`,
  "utf8",
);

console.log(`发布目录已生成: ${releaseDir}`);
