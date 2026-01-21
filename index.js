const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// --- 变量配置 ---
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const FILE_PATH = process.env.FILE_PATH || './tmp';
// 修正点 1：修复了这里的全角引号
const SUB_PATH = process.env.SUB_PATH || 'zhongnanhai1'; 
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || 'cd18c3ec-e517-440c-a463-fe2d26808b55';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'anothergalaxy.dyhoutlook.dpdns.org';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiNDUyZmViZDM5MzgxMjM0Nzk1NGU2ZjdmM2QxMjJjMDQiLCJ0IjoiNjA1ZDZhZDQtYTI4NC00MDRjLWE1YjEtMmMyNjc5ZTdmZmQwIiwicyI6IllXUTJNbVF6WW1VdE9EYzNNUzAwWlRZM0xXRTNPRGd0TldVM05qUTNOak5pWlRrdyJ9';
const ARGO_PORT = process.env.ARGO_PORT || 22333;
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || '';

// --- 基础路由 ---
// 修正点 2：确保根路由在最前面
app.get("/", (req, res) => {
  res.status(200).send("Hello world! App is running.");
});

// --- 启动服务器 ---
// 修正点 3：先监听端口，确保健康检查立即通过
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server is running on port:${PORT}`);
  // 启动后台逻辑
  startserver().catch(err => console.error('Startserver Error:', err));
});

// --- 逻辑函数 ---

// 创建运行文件夹
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH, { recursive: true });
}

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

function deleteNodes() {
  try {
    if (!UPLOAD_URL || !fs.existsSync(subPath)) return;
    let fileContent = fs.readFileSync(subPath, 'utf-8');
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
    if (nodes.length === 0) return;
    axios.post(`${UPLOAD_URL}/api/delete-nodes`, { nodes }).catch(() => null);
  } catch (err) {}
}

function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
    });
  } catch (err) {}
}

async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    outbounds: [{ protocol: "freedom", tag: "direct" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getSystemArchitecture() {
  const arch = os.arch();
  return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

function downloadFile(fileName, fileUrl, callback) {
  const writer = fs.createWriteStream(fileName);
  axios({ method: 'get', url: fileUrl, responseType: 'stream' })
    .then(response => {
      response.data.pipe(writer);
      writer.on('finish', () => callback(null, fileName));
      writer.on('error', err => callback(err));
    })
    .catch(err => callback(err));
}

async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);
  
  for (const file of filesToDownload) {
    await new Promise((resolve, reject) => {
      downloadFile(file.fileName, file.fileUrl, (err) => err ? reject(err) : resolve());
    });
    fs.chmodSync(file.fileName, 0o775);
  }

  // 运行各组件 (逻辑保持不变)
  if (NEZHA_SERVER && NEZHA_KEY) {
    const nezhaCmd = NEZHA_PORT 
      ? `nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} --disable-auto-update >/dev/null 2>&1 &`
      : `nohup ${phpPath} -s ${NEZHA_SERVER} -p ${NEZHA_KEY} >/dev/null 2>&1 &`; // 简化版
    exec(nezhaCmd);
  }
  
  exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);

  let argoArgs = ARGO_AUTH.length > 120 
    ? `tunnel --no-autoupdate run --token ${ARGO_AUTH}`
    : `tunnel --no-autoupdate --url http://localhost:${ARGO_PORT}`;
  exec(`nohup ${botPath} ${argoArgs} >/dev/null 2>&1 &`);
}

function getFilesForArchitecture(arch) {
  const prefix = arch === 'arm' ? "https://arm64.ssss.nyc.mn" : "https://amd64.ssss.nyc.mn";
  return [
    { fileName: webPath, fileUrl: `${prefix}/web` },
    { fileName: botPath, fileUrl: `${prefix}/bot` },
    { fileName: NEZHA_PORT ? npmPath : phpPath, fileUrl: NEZHA_PORT ? `${prefix}/agent` : `${prefix}/v1` }
  ];
}

async function extractDomains() {
  // 简化的逻辑：等待几秒后生成订阅
  setTimeout(async () => {
    await generateLinks(ARGO_DOMAIN);
  }, 5000);
}

async function generateLinks(argoDomain) {
  const nodeName = NAME || "Cloud-Node";
  const subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Fvless-argo#${nodeName}`;
  const encoded = Buffer.from(subTxt).toString('base64');
  
  fs.writeFileSync(subPath, encoded);
  
  app.get(`/${SUB_PATH}`, (req, res) => {
    res.set('Content-Type', 'text/plain').send(encoded);
  });
  console.log(`Subscription ready at /${SUB_PATH}`);
}

async function startserver() {
  cleanupOldFiles();
  await generateConfig();
  await downloadFilesAndRun();
  await extractDomains();
}
