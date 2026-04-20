import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PLAYCRAFT_API_PORT || 3101);
const DATA_DIR = path.resolve("backend/data");
const STORE_FILE = path.join(DATA_DIR, "projects.json");
const AGENT_WORKSPACE = path.resolve("backend/agent-workspace");
const WILD_WORKSPACES = path.resolve("backend/wild-workspaces");
const SERVE_TEMPLATE = path.resolve("serve");
const AGENT_MODE = process.env.PLAYCRAFT_AGENT_MODE || "claude";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(AGENT_WORKSPACE, { recursive: true });
fs.mkdirSync(WILD_WORKSPACES, { recursive: true });

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { projects: {} };
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function assertSafeProjectId(id) {
  if (!/^[a-zA-Z0-9-]+$/.test(String(id || ""))) {
    throw new Error("Invalid project id");
  }
}

function wildWorkspaceRoot(projectId) {
  assertSafeProjectId(projectId);
  return path.join(WILD_WORKSPACES, projectId);
}

function copyServeTemplate(targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const file of ["index.html", "styles.css", "app.js"]) {
    fs.copyFileSync(path.join(SERVE_TEMPLATE, file), path.join(targetRoot, file));
  }
  fs.writeFileSync(path.join(targetRoot, "WILD_MODE.md"), [
    "# PlayCraft Lab Wild Mode",
    "",
    "This is an isolated per-project sandbox.",
    "The agent may edit the files in this directory for this project preview.",
    "Do not depend on files outside this directory."
  ].join("\n"));
}

function ensureWildWorkspace(project) {
  const root = wildWorkspaceRoot(project.id);
  if (!fs.existsSync(path.join(root, "index.html"))) {
    copyServeTemplate(root);
  }
  return root;
}

function listSandboxFiles(root) {
  const result = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const rel = path.relative(root, full);
        result.set(rel, fs.statSync(full).mtimeMs);
      }
    }
  };
  walk(root);
  return result;
}

function changedFilesSince(before, root) {
  const after = listSandboxFiles(root);
  const changed = [];
  for (const [file, mtime] of after.entries()) {
    if (!before.has(file) || before.get(file) !== mtime) changed.push(file);
  }
  return changed.sort();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) resolve({});
      else {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error("Invalid JSON")); }
      }
    });
    req.on("error", reject);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mergeConfig(base = {}, patch = {}) {
  return {
    params: { ...(base.params || {}), ...(patch.params || {}) },
    design: { ...(base.design || {}), ...(patch.design || {}) }
  };
}

function defaultGameConfig() {
  return {
    params: {
      maxSpeed: 300,
      acceleration: 1300,
      deceleration: 1450,
      turnDeceleration: 2300,
      friction: 0.72,
      jumpPower: 650,
      gravity: 1600,
      fallGravity: 2100,
      airControl: 0.55
    },
    design: {
      sceneTheme: "grass",
      sceneName: "Grass",
      visual: null,
      playerColor: "#75c7ff",
      enemyColor: "#ff6f59",
      coinColor: "#ffc857",
      flagColor: "#19c3a6",
      enemyMode: "slow",
      collisionInset: 3,
      requiredCoins: 3,
      levelMode: "normal",
      platforms: null,
      coinSpawns: null,
      enemySpawns: null
    }
  };
}

async function runRuleAgentAdapter(message, config, locale = "zh") {
  const text = String(message || "");
  const lower = text.toLowerCase();
  const isEn = locale === "en";
  const patch = { params: {}, design: {} };
  const explanations = [];
  const has = (...words) => words.some((word) => text.includes(word) || lower.includes(String(word).toLowerCase()));
  const explain = (zh, en) => explanations.push(isEn ? en : zh);

  if (has("快", "fast", "faster", "speed") && !has("敌人", "enemy", "enemies")) {
    patch.params.maxSpeed = clamp((config.params?.maxSpeed || 300) + 55, 160, 520);
    patch.params.acceleration = clamp((config.params?.acceleration || 1300) + 180, 600, 2400);
    explain("玩家角色的速度曲线更快", "player character speed curve is faster");
  }
  if (has("慢", "slow", "slower") && !has("敌人", "enemy", "enemies")) {
    patch.params.maxSpeed = clamp((config.params?.maxSpeed || 300) - 45, 160, 520);
    explain("玩家角色的速度曲线更慢", "player character speed curve is slower");
  }
  if (has("跳", "jump") && has("高", "更高", "higher", "high")) {
    patch.params.jumpPower = clamp((config.params?.jumpPower || 650) + 80, 360, 920);
    explain("玩家角色的跳跃弧线更高", "player character has a higher jump arc");
  }
  if (has("跳", "jump") && has("低", "lower", "low")) {
    patch.params.jumpPower = clamp((config.params?.jumpPower || 650) - 70, 360, 920);
    explain("玩家角色的跳跃弧线更低", "player character has a lower jump arc");
  }
  if (has("滑", "冰", "slippery", "ice", "icy")) {
    patch.params.deceleration = clamp((config.params?.deceleration || 1450) - 420, 250, 3200);
    patch.params.turnDeceleration = clamp((config.params?.turnDeceleration || 2300) - 520, 350, 4200);
    patch.params.friction = clamp((config.params?.friction || 0.72) - 0.12, 0.22, 0.95);
    if (has("雪", "冰", "snow", "ice", "icy")) patch.design.sceneTheme = "snow";
    explain("低摩擦手感更明显，刹车距离变长", "low-friction feel is stronger and braking distance is longer");
  }
  if (has("不滑", "停住", "精准", "less slippery", "stop", "precise")) {
    patch.params.deceleration = clamp((config.params?.deceleration || 1450) + 520, 250, 3200);
    patch.params.turnDeceleration = clamp((config.params?.turnDeceleration || 2300) + 620, 350, 4200);
    patch.params.friction = clamp((config.params?.friction || 0.72) + 0.12, 0.22, 0.95);
    explain("反向输入的刹车响应更强", "reverse input has stronger braking response");
  }
  if (has("夜晚", "night")) {
    patch.design.sceneTheme = "night";
    patch.design.sceneName = isEn ? "Night" : "夜晚";
    explain("关卡主题切换成夜晚", "level theme changed to night");
  }
  if (has("草地", "grass", "meadow")) {
    patch.design.sceneTheme = "grass";
    patch.design.sceneName = isEn ? "Grass" : "草地";
    explain("关卡主题切换成草地", "level theme changed to grass");
  }
  if (has("岩浆", "火山", "lava", "volcano")) {
    patch.design.sceneTheme = "custom";
    patch.design.sceneName = isEn ? "Lava Volcano" : "火山岩浆";
    patch.design.visual = { skyTop: "#3b1320", skyMid: "#7b2d26", ground: "#171312", top: "#2a211e", cloud: "rgba(255,160,80,0.18)" };
    patch.design.enemyColor = "#ffcf5a";
    patch.design.coinColor = "#ffe066";
    explain("关卡主题改成火山岩浆风格", "level theme changed to a lava volcano style");
  }
  if (has("月亮", "月球", "moon", "lunar")) {
    patch.design.sceneName = isEn ? "Moon" : "月球";
    patch.design.visual = { skyTop: "#11172f", skyMid: "#2c315f", ground: "#6f7180", top: "#d9dce8", cloud: "rgba(255,255,255,0.2)" };
    patch.params.gravity = 1150;
    patch.params.fallGravity = 1400;
    explain("关卡主题改成月面，并降低重力", "level theme changed to the moon with lower gravity");
  }
  if (has("金币", "coin", "coins") && has("往上", "向上", "路线", "upward", "higher", "route", "path")) {
    patch.design.requiredCoins = Math.max(Number(config.design?.requiredCoins || 3), 5);
    patch.design.coinSpawns = [
      { x: 360, y: 380 },
      { x: 510, y: 330 },
      { x: 670, y: 280 },
      { x: 850, y: 240 },
      { x: 1050, y: 300 }
    ];
    explain("收集物形成一条向上跳的引导线", "pickups form an upward guide line");
  }
  if (has("平台", "platform", "platforms") && has("往上", "向上", "路线", "岩石", "upward", "higher", "route", "rock")) {
    patch.design.platforms = [
      { x: 0, y: 430, w: 360, h: 80 },
      { x: 470, y: 430, w: 250, h: 80 },
      { x: 840, y: 430, w: 260, h: 80 },
      { x: 1240, y: 430, w: 440, h: 80 },
      { x: 330, y: 355, w: 150, h: 22 },
      { x: 500, y: 315, w: 145, h: 22 },
      { x: 680, y: 275, w: 145, h: 22 },
      { x: 890, y: 335, w: 170, h: 22 }
    ];
    explain("layout 改成更清晰的跳跃台阶", "layout now has clearer jumping steps");
  }
  if (has("没有敌人", "不要敌人", "no enemies", "remove enemies")) {
    patch.design.enemyMode = "none";
    explain("移除敌人 AI，形成安全教学段", "enemy AI removed for a safe tutorial beat");
  }
  if (has("敌人", "enemy", "enemies") && has("快", "fast", "faster")) {
    patch.design.enemyMode = "fast";
    explain("敌人 AI 的巡逻速度更快", "enemy AI patrol speed is faster");
  }
  if (has("敌人", "enemy", "enemies") && has("慢", "slow", "slower")) {
    patch.design.enemyMode = "slow";
    explain("敌人 AI 的巡逻速度更慢", "enemy AI patrol speed is slower");
  }
  if (has("宽松", "forgiving", "easier hitbox")) {
    patch.design.collisionInset = 8;
    explain("碰撞判定更宽松", "hitbox tuning is more forgiving");
  }
  if (has("严格", "strict", "stricter")) {
    patch.design.collisionInset = 0;
    explain("碰撞判定更严格", "hitbox tuning is stricter");
  }

  const coinMatch = text.match(/(?:收集|收|金币|目标|collect|coin|coins|goal).*?(\d+)/i);
  if (coinMatch) {
    patch.design.requiredCoins = clamp(Number(coinMatch[1]), 0, 5);
    explanations.push(isEn ? `win condition changed to collect ${patch.design.requiredCoins} pickups` : `胜利条件改为收集 ${patch.design.requiredCoins} 个收集物`);
  }

  if (has("简单", "练习关", "easy", "practice")) {
    patch.design.levelMode = "easy";
    explain("layout 改为教学关节奏", "layout changed to a tutorial flow");
  }
  if (has("挑战", "难一点", "challenge", "harder")) {
    patch.design.levelMode = "hard";
    explain("layout 改为挑战关节奏", "layout changed to a challenge flow");
  }

  const nextConfig = mergeConfig(config, patch);
  const changed = explanations.length > 0;

  return {
    config: changed ? nextConfig : config,
    message: changed
      ? (isEn ? `Changed: ${explanations.join(", ")}.` : `已修改：${explanations.join("，")}。`)
      : (isEn
        ? "I did not recognize a specific tuning request yet. Try: raise the jump arc, slow enemy patrols, make hitboxes more forgiving, or require 5 pickups."
        : "我还没有识别到具体调参请求。可以说：把跳跃弧线调高、敌人巡逻慢一点、hitbox 宽松一点、胜利条件改成收集 5 个收集物。"),
    learningConcept: inferConcept(text)
  };
}

async function runAgentAdapter(message, config, project, locale = "zh") {
  if (AGENT_MODE === "local") {
    return runRuleAgentAdapter(message, config, locale);
  }

  try {
    if (AGENT_MODE === "claude") {
      return await runClaudeAgent(message, config, project, locale);
    }
  } catch (error) {
    console.warn(`[agent] ${AGENT_MODE} failed, falling back to local rules: ${error.message}`);
  }

  return runRuleAgentAdapter(message, config, locale);
}

function buildAgentPrompt(message, config, project, locale = "zh") {
  const targetLanguage = locale === "en" ? "English" : "Chinese";
  const exampleSceneName = locale === "en" ? "Lava Volcano" : "火山岩浆";
  const exampleMessage = locale === "en"
    ? "Changed the level theme to a lava volcano and arranged pickups into an upward guide line. This tunes theme readability and level flow."
    : "已把关卡主题改成火山岩浆，并把收集物排成向上跳的引导线。这是在调主题可读性和关卡节奏。";
  return `You are the PlayCraft Lab game-design agent.

Your job:
- Interpret the user's Chinese or English natural-language request.
- Modify ONLY the game configuration JSON.
- Teach through one short ${targetLanguage} explanation.
- Return ONLY one compact valid JSON object. No Markdown. No code fences. No comments.

Valid output example:
{
  "config": {
    "params": {
      "maxSpeed": 300,
      "acceleration": 1300,
      "deceleration": 1450,
      "turnDeceleration": 2300,
      "friction": 0.72,
      "jumpPower": 650,
      "gravity": 1600,
      "fallGravity": 2100,
      "airControl": 0.55
    },
    "design": {
      "sceneTheme": "custom",
      "sceneName": "${exampleSceneName}",
      "visual": {
        "skyTop": "#3b1320",
        "skyMid": "#7b2d26",
        "ground": "#2a211e",
        "top": "#ff8a3d",
        "cloud": "rgba(255,160,80,0.18)"
      },
      "playerColor": "#RRGGBB",
      "enemyColor": "#RRGGBB",
      "coinColor": "#RRGGBB",
      "flagColor": "#RRGGBB",
      "enemyMode": "slow",
      "collisionInset": 3,
      "requiredCoins": 3,
      "levelMode": "normal",
      "platforms": [{"x": 0, "y": 430, "w": 420, "h": 80}],
      "coinSpawns": [{"x": 410, "y": 290}],
      "enemySpawns": [{"x": 610, "y": 395, "min": 530, "max": 745, "speed": 62}]
    }
  },
  "message": "${exampleMessage}",
  "learningConcept": "scene"
}

Rules:
- Output must be valid JSON parsable by JSON.parse. Escape any quotes inside strings.
- The "message" field must be written in ${targetLanguage}.
- Preserve existing fields unless the user asks to change them.
- You are not limited to predefined scene choices. If the user asks for lava, moon, candy, underwater, city, etc., create suitable visual colors and level object positions using the flexible fields above.
- You may create a custom platform layout by returning "platforms", "coinSpawns", and "enemySpawns".
- Keep platformer coordinates inside this world: x 0-1700, y 70-470. Ground-like platforms should use y around 430.
- Keep values inside reasonable ranges:
  maxSpeed 160-520
  acceleration 600-2400
  deceleration 250-3200
  turnDeceleration 350-4200
  friction 0.22-0.95
  jumpPower 360-920
  gravity 800-2800
  fallGravity 1000-3600
  airControl 0.15-0.95
- Allowed learningConcept values: "scene", "player", "enemy", "collision", "goal", "level".
- Allowed enemyMode values: "none", "slow", "fast".
- Allowed collisionInset values: 0, 3, 8.
- Allowed levelMode values: "easy", "normal", "hard".
- If the request is vague, make a conservative useful change and explain it.
- Do not invent unsupported game mechanics beyond visuals, platform layout, coins, enemies, goals, collision leniency, and player movement feel.
- The message must describe changes that are actually present in config. Never say a scene, route, platform, or behavior changed unless the corresponding config fields changed.
- Do not include comments or extra keys.

Current project id: ${project?.id || "unknown"}
Current config:
${JSON.stringify(config, null, 2)}

User request:
${message}
`;
}

function runClaudeAgent(message, config, project, locale = "zh") {
  const prompt = buildAgentPrompt(message, config, project, locale);

  return new Promise((resolve, reject) => {
    const proc = spawn("claude", [
      "-p", prompt,
      "--output-format", "stream-json",
      "--verbose"
    ], {
      cwd: AGENT_WORKSPACE,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false
    });

    let lineBuffer = "";
    let stderr = "";
    let finalText = "";
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Agent timed out"));
    }, Number(process.env.PLAYCRAFT_AGENT_TIMEOUT_MS || 45_000));

    proc.stdout.on("data", (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "result" && event.result) {
            finalText = event.result;
          }
        } catch {}
      }
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = parseAgentJson(finalText);
        const normalized = normalizeAgentResult(parsed, config);
        resolve(normalized);
      } catch (error) {
        console.warn(`[agent] failed to parse claude output: ${error.message}\n${String(finalText || "").slice(0, 2000)}`);
        reject(new Error(`Agent JSON parse failed: ${error.message}`));
      }
    });
  });
}

function buildWildPrompt(message, project, locale = "zh") {
  const targetLanguage = locale === "en" ? "English" : "Chinese";
  return `You are PlayCraft Lab Wild Mode.

You are working inside one user's isolated project sandbox. You may edit any code file in the current directory, but you must not read or write outside this directory.

Goal:
- Interpret the user's request.
- Modify the playable web prototype directly by editing HTML, CSS, and JavaScript files in this sandbox.
- Keep the prototype runnable as a static website.
- Preserve the existing PlayCraft flow unless the user explicitly asks to change it.
- Keep changes focused and testable.
- After editing, return ONLY a compact JSON object:
{"message":"short ${targetLanguage} summary of what you changed","changedFiles":["app.js","styles.css"]}

Rules:
- Do not use external network resources.
- Do not add build steps or package managers.
- Do not delete the settings/language controls unless asked.
- Do not modify files outside the sandbox directory.
- If a request is too broad, make the smallest playable version.

Project id: ${project.id}
User request:
${message}
`;
}

function runWildAgent(message, project, locale = "zh") {
  const root = ensureWildWorkspace(project);
  const before = listSandboxFiles(root);
  const prompt = buildWildPrompt(message, project, locale);

  return new Promise((resolve, reject) => {
    const proc = spawn("claude", [
      "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--permission-mode", "acceptEdits",
      "--tools", "Read,Edit,MultiEdit,Write,Glob,Grep"
    ], {
      cwd: root,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false
    });

    let lineBuffer = "";
    let stderr = "";
    let finalText = "";
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Wild agent timed out"));
    }, Number(process.env.PLAYCRAFT_WILD_TIMEOUT_MS || 90_000));

    proc.stdout.on("data", (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "result" && event.result) finalText = event.result;
        } catch {}
      }
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Wild agent exited with code ${code}: ${stderr}`));
        return;
      }

      const changedFiles = changedFilesSince(before, root);
      let parsed = {};
      try {
        parsed = parseAgentJson(finalText);
      } catch {
        parsed = {};
      }
      resolve({
        message: typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : (locale === "en" ? "Wild Mode updated the sandbox code." : "Wild 模式已更新沙箱代码。"),
        changedFiles: Array.isArray(parsed.changedFiles) && parsed.changedFiles.length
          ? parsed.changedFiles
          : changedFiles,
        previewUrl: `/api/wild/${project.id}/index.html?project=${project.id}&lang=${locale}&mode=wild`
      });
    });
  });
}

function parseAgentJson(text) {
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Agent returned empty text");

  const candidates = [clean];
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const balanced = extractBalancedJson(clean);
  if (balanced) candidates.push(balanced);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Agent did not return JSON: ${clean.slice(0, 200)}`);
}

function extractBalancedJson(text) {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return "";
}

function normalizeAgentResult(result, previousConfig) {
  const allowedConcepts = new Set(["scene", "player", "enemy", "collision", "goal", "level"]);
  const merged = mergeConfig(previousConfig, result.config || {});
  const params = merged.params;
  const design = merged.design;

  params.maxSpeed = clamp(Number(params.maxSpeed ?? 300), 160, 520);
  params.acceleration = clamp(Number(params.acceleration ?? 1300), 600, 2400);
  params.deceleration = clamp(Number(params.deceleration ?? 1450), 250, 3200);
  params.turnDeceleration = clamp(Number(params.turnDeceleration ?? 2300), 350, 4200);
  params.friction = clamp(Number(params.friction ?? 0.72), 0.22, 0.95);
  params.jumpPower = clamp(Number(params.jumpPower ?? 650), 360, 920);
  params.gravity = clamp(Number(params.gravity ?? 1600), 800, 2800);
  params.fallGravity = clamp(Number(params.fallGravity ?? 2100), 1000, 3600);
  params.airControl = clamp(Number(params.airControl ?? 0.55), 0.15, 0.95);

  if (!design.sceneTheme) design.sceneTheme = "grass";
  if (!["grass", "night", "snow"].includes(design.sceneTheme) && !design.visual) {
    design.sceneTheme = "grass";
  }
  if (design.visual && typeof design.visual !== "object") design.visual = null;
  for (const key of ["playerColor", "enemyColor", "coinColor", "flagColor"]) {
    if (design[key] && !/^#[0-9a-fA-F]{6}$/.test(String(design[key]))) delete design[key];
  }
  if (!["none", "slow", "fast"].includes(design.enemyMode)) design.enemyMode = "slow";
  design.collisionInset = [0, 3, 8].includes(Number(design.collisionInset)) ? Number(design.collisionInset) : 3;
  design.requiredCoins = clamp(Number(design.requiredCoins ?? 3), 0, 8);
  if (!["easy", "normal", "hard"].includes(design.levelMode)) design.levelMode = "normal";
  if (Array.isArray(design.platforms)) {
    design.platforms = design.platforms.slice(0, 12).map((p) => ({
      x: clamp(Number(p.x) || 0, 0, 1660),
      y: clamp(Number(p.y) || 430, 180, 470),
      w: clamp(Number(p.w) || 160, 40, 700),
      h: clamp(Number(p.h) || 40, 18, 120)
    }));
  }
  if (Array.isArray(design.coinSpawns)) {
    design.coinSpawns = design.coinSpawns.slice(0, 8).map((c) => ({
      x: clamp(Number(c.x) || 400, 20, 1680),
      y: clamp(Number(c.y) || 290, 70, 420)
    }));
  }
  if (Array.isArray(design.enemySpawns)) {
    design.enemySpawns = design.enemySpawns.slice(0, 5).map((e) => ({
      x: clamp(Number(e.x) || 620, 20, 1620),
      y: clamp(Number(e.y) || 395, 160, 420),
      min: clamp(Number(e.min) || Number(e.x) - 80 || 520, 0, 1620),
      max: clamp(Number(e.max) || Number(e.x) + 80 || 760, 80, 1700),
      speed: clamp(Number(e.speed) || 62, 20, 180)
    }));
  }

  return {
    config: { params, design },
    message: typeof result.message === "string" && result.message.trim()
      ? result.message.trim()
      : "已根据你的描述更新游戏配置。",
    learningConcept: allowedConcepts.has(result.learningConcept) ? result.learningConcept : "player"
  };
}

function inferConcept(text) {
  const lower = String(text || "").toLowerCase();
  if (text.includes("敌人") || lower.includes("enemy")) return "enemy";
  if (text.includes("碰撞") || text.includes("宽松") || text.includes("严格") || lower.includes("collision") || lower.includes("hitbox")) return "collision";
  if (text.includes("目标") || text.includes("金币") || text.includes("收集") || lower.includes("goal") || lower.includes("coin") || lower.includes("collect")) return "goal";
  if (text.includes("关卡") || text.includes("简单") || text.includes("挑战") || lower.includes("level") || lower.includes("challenge") || lower.includes("practice")) return "level";
  if (text.includes("场景") || text.includes("夜晚") || text.includes("草地") || text.includes("雪") || lower.includes("scene") || lower.includes("night") || lower.includes("grass") || lower.includes("snow") || lower.includes("lava") || lower.includes("moon")) return "scene";
  return "player";
}

function getProjectIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)(?:\/([^/]+))?$/);
  return match ? { id: match[1], action: match[2] || "" } : null;
}

function getWildStaticPath(pathname) {
  const match = pathname.match(/^\/api\/wild\/([^/]+)\/?(.*)$/);
  return match ? { id: match[1], file: match[2] || "index.html" } : null;
}

function serveWildStatic(res, projectId, requestedFile) {
  const root = wildWorkspaceRoot(projectId);
  const safeRel = path.normalize(decodeURIComponent(requestedFile || "index.html")).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(root, safeRel);
  if (!filePath.startsWith(root)) return sendJson(res, 403, { error: "Forbidden" });
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendJson(res, 404, { error: "Wild file not found" });
  }
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "content-type": contentTypeFor(filePath),
    "content-length": body.length,
    "cache-control": "no-store"
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    const wildStaticPath = getWildStaticPath(url.pathname);
    if (req.method === "GET" && wildStaticPath) {
      return serveWildStatic(res, wildStaticPath.id, wildStaticPath.file);
    }

    if (req.method === "POST" && url.pathname === "/api/projects") {
      const body = await readBody(req);
      const store = readStore();
      const id = randomUUID();
      const project = {
        id,
        genre: body.genre || "platformer",
        config: body.config || {},
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.projects[id] = project;
      writeStore(store);
      return sendJson(res, 201, { project });
    }

    const projectPath = getProjectIdFromPath(url.pathname);
    if (projectPath) {
      const store = readStore();
      const project = store.projects[projectPath.id];
      if (!project) return sendJson(res, 404, { error: "Project not found" });

      if (req.method === "GET" && !projectPath.action) {
        return sendJson(res, 200, { project });
      }

      if (req.method === "POST" && projectPath.action === "save") {
        const body = await readBody(req);
        project.config = body.config || project.config;
        project.updatedAt = new Date().toISOString();
        store.projects[project.id] = project;
        writeStore(store);
        return sendJson(res, 200, { project });
      }

      if (req.method === "POST" && projectPath.action === "reset") {
        const root = wildWorkspaceRoot(project.id);
        fs.rmSync(root, { recursive: true, force: true });
        project.config = defaultGameConfig();
        project.wild = { enabled: false, previewUrl: "", updatedAt: new Date().toISOString() };
        project.history.push({
          mode: "reset",
          message: "Reset project to factory prototype",
          result: "Factory prototype restored and Wild sandbox removed.",
          createdAt: new Date().toISOString()
        });
        project.updatedAt = new Date().toISOString();
        store.projects[project.id] = project;
        writeStore(store);
        return sendJson(res, 200, {
          project,
          reset: {
            ok: true,
            redirectUrl: `/?project=${project.id}&mode=guided`
          }
        });
      }

      if (req.method === "POST" && projectPath.action === "modify") {
        const body = await readBody(req);
        const currentConfig = body.config || project.config || {};
        const locale = body.locale === "en" ? "en" : "zh";
        const result = await runAgentAdapter(body.message, currentConfig, project, locale);
        project.config = result.config;
        project.history.push({
          message: body.message,
          result: result.message,
          learningConcept: result.learningConcept,
          createdAt: new Date().toISOString()
        });
        project.updatedAt = new Date().toISOString();
        store.projects[project.id] = project;
        writeStore(store);
        return sendJson(res, 200, { project, agent: result });
      }

      if (req.method === "POST" && projectPath.action === "wild") {
        const body = await readBody(req);
        const locale = body.locale === "en" ? "en" : "zh";
        const result = await runWildAgent(body.message, project, locale);
        project.wild = {
          enabled: true,
          previewUrl: result.previewUrl,
          updatedAt: new Date().toISOString()
        };
        project.history.push({
          mode: "wild",
          message: body.message,
          result: result.message,
          changedFiles: result.changedFiles,
          createdAt: new Date().toISOString()
        });
        project.updatedAt = new Date().toISOString();
        store.projects[project.id] = project;
        writeStore(store);
        return sendJson(res, 200, { project, wild: result });
      }
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PlayCraft API listening on http://127.0.0.1:${PORT}`);
});
