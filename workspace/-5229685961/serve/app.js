const choiceScreen = document.getElementById("choiceScreen");
const studio = document.getElementById("studio");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const els = {
  settingsBtn: document.getElementById("settingsBtn"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsTitle: document.getElementById("settingsTitle"),
  languageLabel: document.getElementById("languageLabel"),
  demoTitle: document.getElementById("demoTitle"),
  backBtn: document.getElementById("backBtn"),
  factoryResetBtn: document.getElementById("factoryResetBtn"),
  saveBtn: document.getElementById("saveBtn"),
  levelText: document.getElementById("levelText"),
  xpText: document.getElementById("xpText"),
  xpFill: document.getElementById("xpFill"),
  coinText: document.getElementById("coinText"),
  coinTargetText: document.getElementById("coinTargetText"),
  lifeText: document.getElementById("lifeText"),
  feelTag: document.getElementById("feelTag"),
  touchControls: document.getElementById("touchControls"),
  resultLayer: document.getElementById("resultLayer"),
  resultTitle: document.getElementById("resultTitle"),
  restartBtn: document.getElementById("restartBtn"),
  guideTitle: document.getElementById("guideTitle"),
  guideText: document.getElementById("guideText"),
  conceptStack: document.getElementById("conceptStack"),
  conceptTitle: document.getElementById("conceptTitle"),
  conceptText: document.getElementById("conceptText"),
  choiceRow: document.getElementById("choiceRow"),
  modeHelp: document.getElementById("modeHelp"),
  promptForm: document.getElementById("promptForm"),
  promptInput: document.getElementById("promptInput"),
  log: document.getElementById("log")
};

const languageButtons = document.querySelectorAll("[data-lang]");
const agentModeButtons = document.querySelectorAll("[data-agent-mode]");

const i18n = {
  zh: {
    lang: "zh-CN",
    ui: {
      choiceAria: "选择游戏类型",
      question: "你想做什么游戏？",
      intro: "先选一个可玩的原型。进去试玩，再从一个设计维度开始调。",
      featuredBadge: "推荐起手式",
      studioAria: "横版平台跳跃原型实验室",
      backAria: "返回选择",
      demoTitle: "横版平台跳跃原型",
      save: "保存版本",
      factoryReset: "重置原型",
      resetConfirm: "确定要重置到最初原型吗？这会删除当前项目的 Wild 沙箱代码。",
      resetDone: "已恢复最初原型，并清空 Wild 沙箱。",
      canvasAria: "横版平台跳跃原型",
      coins: "收集物",
      lives: "生命值",
      resultWin: "通关",
      resultRetry: "需要调参",
      restart: "再玩一次",
      guideLabel: "Guide Sprite",
      guideTitle: "先试玩",
      guideText: "这个原型包含移动、跳跃、收集物、敌人和终点旗。先感受移动手感、跳跃弧线和关卡节奏。",
      tweakLabel: "调一个设计维度",
      promptLabel: "描述你想要的手感",
      promptDefault: "把移动速度调快一点，但保留可控的刹车距离，不要让玩家冲过平台。",
      submit: "让 AI 调参",
      modeAria: "Agent 模式",
      guidedMode: "Guided",
      wildMode: "Wild",
      guidedHelp: "Guided 只调受控参数，适合学习设计概念和稳定迭代。",
      wildHelp: "Wild 会复制当前原型到项目沙箱，让 agent 直接改 HTML/CSS/JS 代码。",
      touchAria: "触屏控制",
      leftAria: "向左",
      rightAria: "向右",
      jumpAria: "跳跃",
      jump: "跳",
      settings: "设置",
      language: "语言"
    },
    genres: {
      platformer: ["横版平台跳跃", "移动手感、跳跃弧线、收集物、敌人、终点旗"],
      collector: ["俯视角收集玩法", "移动判定、收集循环、分数反馈、追逐压力"],
      flyer: ["街机躲避玩法", "速度曲线、生成节奏、读招与反应窗口"],
      puzzle: ["机关解谜关卡", "开关、钥匙、门、条件触发、解谜顺序"]
    },
    concepts: {
      scene: {
        title: "关卡主题",
        short: "世界观与可读性",
        guide: "关卡主题不只是背景美术。它会影响玩家对地形、危险区、奖励路线和终点方向的判断。",
        text: "先看主题如何服务玩法：地面是否清楚，平台是否像可站立区域，危险是否一眼能读懂，收集物是否在引导路线。",
        options: [
          ["火山主题", "把关卡主题改成火山岩浆：天空偏红，平台像黑色岩石，收集物沿着一条向上跳的引导线摆放。", "这是主题和关卡可读性的示例提示。"],
          ["月面主题", "把关卡主题改成月面基地：冷色天空、灰色地表，并把重力调低，让跳跃弧线更轻。", "这是主题和物理手感联动的示例提示。"],
          ["糖果主题", "把关卡主题改成糖果世界：平台像饼干，收集物像糖豆，整体色彩更轻松但仍然要看得清平台边缘。", "这是美术风格和玩法可读性的示例提示。"]
        ]
      },
      player: {
        title: "玩家角色",
        short: "移动手感与跳跃弧线",
        guide: "玩家角色是输入转成动作的核心。速度、加速度、刹车距离、空中控制和重力共同决定手感。",
        text: "“跑快一点”“跳高一点”“别那么滑”都不是单个按钮，而是在调移动模型和 game feel。",
        options: [
          ["重手感", "把玩家角色调成重手感：移动慢一点、落地更有重量，但跳跃距离仍然能过第一个坑。", "这是角色手感调校的示例提示。"],
          ["平台跳跃手感", "把玩家角色调成经典平台跳跃手感：速度适中，起跳明确，松开方向后有一点滑行但不会失控。", "这是基础 game feel 的示例提示。"],
          ["冲刺手感", "把玩家角色调成冲刺手感：最高速度更高，有一点惯性，但反向输入要能明显减速。", "这是速度曲线和刹车距离的示例提示。"]
        ]
      },
      enemy: {
        title: "敌人 AI",
        short: "压力、节奏与风险",
        guide: "敌人 AI 用来制造压力和节奏。巡逻范围、速度、站位和受击反馈会改变玩家的路线选择。",
        text: "敌人不是装饰物。它是在做 pacing：什么时候让玩家放松，什么时候要求跳跃、等待或踩踏。",
        options: [
          ["无敌人教学段", "先移除敌人，让开场成为安全教学段，只练习移动、跳跃和收集路线。", "这是 onboarding 节奏的示例提示。"],
          ["慢速巡逻敌", "保留敌人，但使用慢速巡逻，并放在玩家学会跳跃后的第一个小考点。", "这是巡逻敌配置的示例提示。"],
          ["终点前压力", "把敌人速度调快一点，放在终点前制造最后一个压力点，但不要挡死路线。", "这是关卡 pacing 的示例提示。"]
        ]
      },
      collision: {
        title: "碰撞判定",
        short: "Hitbox 与公平性",
        guide: "碰撞判定决定平台落点、收集物拾取、敌人受伤和踩踏是否成立。玩家看见的结果必须公平。",
        text: "行业里经常会把判定盒调得比美术略宽或略窄。目标不是数学精确，而是让玩家觉得“我懂为什么发生”。",
        options: [
          ["宽松 hitbox", "把敌人的伤害判定调宽松一点，玩家擦边时不容易被判受伤。", "这是新手友好判定的示例提示。"],
          ["标准 hitbox", "把平台、收集物和敌人的碰撞判定调到接近视觉大小，让反馈更直觉。", "这是默认判定的示例提示。"],
          ["硬核 hitbox", "把敌人的伤害判定调严格一点，适合挑战关，但踩踏窗口仍然要公平。", "这是高难度判定的示例提示。"]
        ]
      },
      goal: {
        title: "胜利条件",
        short: "目标、奖励与通关",
        guide: "胜利条件定义玩家怎样通关。它可以是到达终点、收集指定数量道具，或两者组合。",
        text: "目标设计要清楚，并用收集物、终点旗和路线布局不断提示玩家下一步该做什么。",
        options: [
          ["只到终点", "把胜利条件改成只要碰到终点旗就通关，不强制收集物。", "这是低门槛通关条件的示例提示。"],
          ["收集 3 个", "把胜利条件改成收集 3 个收集物再到终点，并把收集物放在主路线上。", "这是轻量收集目标的示例提示。"],
          ["收集 5 个", "把胜利条件改成收集 5 个收集物，并用它们引导玩家学习平台跳跃路线。", "这是收集路线设计的示例提示。"]
        ]
      },
      level: {
        title: "关卡设计",
        short: "Layout、节奏与难度曲线",
        guide: "关卡设计是把空间、平台距离、敌人、收集路线和终点组合成一段可学习的体验。",
        text: "好的第一关通常是安全区、教学点、小考点、奖励、终点。难度曲线要逐步抬升，而不是突然卡住玩家。",
        options: [
          ["教学关", "把 layout 改成教学关：开场安全，平台更宽，收集物放在玩家自然会跳到的位置。", "这是 onboarding layout 的示例提示。"],
          ["标准首关", "把 layout 改成标准首关：先练移动，再练跳平台，然后放一个巡逻敌和终点旗。", "这是第一关节奏的示例提示。"],
          ["挑战关", "把 layout 改成挑战关：平台间距更大，收集路线更高，终点前有更紧张的敌人巡逻。", "这是难度曲线抬升的示例提示。"]
        ]
      }
    },
    feel: {
      ice: "低摩擦手感",
      sprint: "冲刺速度曲线",
      float: "低重力手感",
      heavy: "高重力手感",
      normal: "标准手感"
    },
    logs: {
      connected: (id) => `项目已连接后台：${id}。`,
      loaded: (id) => `已从后台载入项目：${id}。`,
      saved: "已保存到后台，刷新后可以继续修改。",
      agentDone: "后台已返回修改结果。",
      hint: (label, note) => `${label}：${note} 你可以改这句话，或者换成任何想法，再让 AI 修改。`,
      localPrompt: "我把你的描述转成了一组调参结果。先 playtest，再继续说“加速度太高”“刹车距离太长”“跳跃弧线太低”这类反馈。",
      otherGenre: "这次先用横版平台跳跃原型跑完整流程，其他品类后面会变成新的章节。",
      firstStep: "先 playtest 10 秒，再选一个设计维度开始调。",
      apiUnavailable: "后台暂时不可用，会先在浏览器里继续运行。",
      saveFailed: "后台保存失败，已先保存到本地。",
      localFallback: "后台暂时不可用，已用本地规则修改。"
    }
  },
  en: {
    lang: "en",
    ui: {
      choiceAria: "Choose a game type",
      question: "What game do you want to make?",
      intro: "Pick a playable prototype, test it, then tune one design axis at a time.",
      featuredBadge: "Best starting point",
      studioAria: "2D platformer prototype lab",
      backAria: "Back to choices",
      demoTitle: "2D Platformer Prototype",
      save: "Save version",
      factoryReset: "Reset prototype",
      resetConfirm: "Reset to the factory prototype? This will delete this project's Wild sandbox code.",
      resetDone: "Factory prototype restored and Wild sandbox cleared.",
      canvasAria: "2D platformer prototype",
      coins: "Pickups",
      lives: "HP",
      resultWin: "Level clear",
      resultRetry: "Needs tuning",
      restart: "Play again",
      guideLabel: "Guide Sprite",
      guideTitle: "Playtest first",
      guideText: "This prototype has movement, jumps, pickups, enemies, and a finish flag. First, feel the game feel, jump arc, and level flow.",
      tweakLabel: "Tune one design axis",
      promptLabel: "Describe the game feel",
      promptDefault: "Increase movement speed, but keep a controllable braking distance so the player does not overshoot platforms.",
      submit: "Ask AI to tune",
      modeAria: "Agent mode",
      guidedMode: "Guided",
      wildMode: "Wild",
      guidedHelp: "Guided only tunes controlled parameters, which is better for learning design concepts and stable iteration.",
      wildHelp: "Wild copies the prototype into this project sandbox and lets the agent edit HTML/CSS/JS directly.",
      touchAria: "Touch controls",
      leftAria: "Move left",
      rightAria: "Move right",
      jumpAria: "Jump",
      jump: "Jump",
      settings: "Settings",
      language: "Language"
    },
    genres: {
      platformer: ["2D Platformer", "Game feel, jump arc, pickups, enemies, finish flag"],
      collector: ["Top-down Collector", "Movement collision, pickup loop, scoring feedback, chase pressure"],
      flyer: ["Arcade Dodger", "Speed curve, spawn cadence, telegraphing, reaction window"],
      puzzle: ["Puzzle-Mechanic Level", "Switches, keys, doors, triggers, solve order"]
    },
    concepts: {
      scene: {
        title: "Level Theme",
        short: "Worldbuilding and readability",
        guide: "A level theme is not just background art. It affects how players read terrain, hazards, reward paths, and the direction of the goal.",
        text: "Look at how the theme supports play: ground must read as solid, platforms must read as landable, hazards must read instantly, and pickups should guide the route.",
        options: [
          ["Lava theme", "Change the level theme to a lava volcano: red sky, black rock platforms, and pickups placed along an upward guide line.", "Example prompt for theme and level readability."],
          ["Moonbase theme", "Change the level theme to a moonbase: cool sky, gray lunar ground, and lower gravity so the jump arc feels lighter.", "Example prompt for linking theme with physics feel."],
          ["Candy theme", "Change the level theme to a candy world: cookie-like platforms, candy-like pickups, and brighter colors while keeping platform edges readable.", "Example prompt for art style and gameplay readability."]
        ]
      },
      player: {
        title: "Player Character",
        short: "Game feel and jump arc",
        guide: "The player character is where input becomes action. Speed, acceleration, braking distance, air control, and gravity define the game feel.",
        text: "Requests like 'run faster', 'jump higher', or 'less slippery' are movement-model tuning, not just button changes.",
        options: [
          ["Heavy feel", "Tune the player character for a heavier feel: slower movement and stronger landing weight, while still clearing the first gap.", "Example prompt for character-feel tuning."],
          ["Platformer feel", "Tune the player character for classic platformer feel: medium speed, clear takeoff, and slight drift without losing control.", "Example prompt for baseline game feel."],
          ["Sprint feel", "Tune the player character for sprint feel: higher top speed and some inertia, but reverse input should still brake clearly.", "Example prompt for speed curve and braking distance."]
        ]
      },
      enemy: {
        title: "Enemy AI",
        short: "Pressure, pacing, and risk",
        guide: "Enemy AI creates pressure and pacing. Patrol range, speed, placement, and hit feedback all change the player's route choice.",
        text: "Enemies are not decoration; they shape pacing. They decide when the player can relax and when the player must jump, wait, or stomp.",
        options: [
          ["No-enemy tutorial beat", "Remove enemies so the opening becomes a safe tutorial beat for movement, jumping, and the pickup route.", "Example prompt for onboarding pacing."],
          ["Slow patrol enemy", "Keep an enemy, but use a slow patrol and place it after the player has learned the first jump.", "Example prompt for patrol-enemy setup."],
          ["Pre-goal pressure", "Increase enemy speed a bit and place it before the finish flag as a final pressure beat without blocking the route.", "Example prompt for level pacing."]
        ]
      },
      collision: {
        title: "Hitbox & Collision",
        short: "Fairness and contact rules",
        guide: "Hitbox and collision rules decide platform landings, pickup collection, enemy damage, and stomp detection. The result must feel fair.",
        text: "In production, hitboxes are often slightly larger or smaller than the art. The goal is not perfect geometry; it is player trust.",
        options: [
          ["Forgiving hitbox", "Make the enemy damage hitbox more forgiving so edge brushes do not punish the player too easily.", "Example prompt for beginner-friendly hitboxes."],
          ["Standard hitbox", "Tune platform, pickup, and enemy collision close to the visible art so feedback feels intuitive.", "Example prompt for default collision tuning."],
          ["Hardcore hitbox", "Make enemy damage hitboxes stricter for a challenge level, while keeping the stomp window fair.", "Example prompt for high-difficulty hitboxes."]
        ]
      },
      goal: {
        title: "Win Condition",
        short: "Objective, reward, and clear state",
        guide: "The win condition defines how the player clears the level. It can be reaching the flag, collecting required pickups, or both.",
        text: "Objective design should be readable. Pickups, the finish flag, and layout should keep hinting at what the player should do next.",
        options: [
          ["Flag clear", "Change the win condition so touching the finish flag clears the level, with no required pickups.", "Example prompt for a low-friction clear condition."],
          ["3-pickup clear", "Change the win condition to collect 3 pickups before the finish flag, and place them on the main route.", "Example prompt for a light collection objective."],
          ["5-pickup route", "Change the win condition to collect 5 pickups, and use them to teach the platform-jump route.", "Example prompt for pickup-route design."]
        ]
      },
      level: {
        title: "Level Design",
        short: "Layout, pacing, and difficulty curve",
        guide: "Level design turns space, gaps, enemies, pickup routes, and goals into a learnable play experience.",
        text: "A strong first level usually goes: safe space, teaching beat, small test, reward, clear goal. The difficulty curve should rise instead of spiking.",
        options: [
          ["Tutorial layout", "Turn the layout into a tutorial level: safe opening, wider platforms, and pickups placed where the player naturally jumps.", "Example prompt for onboarding layout."],
          ["First-level flow", "Turn the layout into a standard first level: movement first, platform jumps second, then one patrol enemy and the finish flag.", "Example prompt for first-level pacing."],
          ["Challenge layout", "Turn the layout into a challenge level: wider gaps, a higher pickup route, and a tense enemy patrol before the finish.", "Example prompt for raising the difficulty curve."]
        ]
      }
    },
    feel: {
      ice: "Low-friction feel",
      sprint: "Sprint speed curve",
      float: "Low-gravity feel",
      heavy: "High-gravity feel",
      normal: "Baseline feel"
    },
    logs: {
      connected: (id) => `Project connected: ${id}.`,
      loaded: (id) => `Loaded project: ${id}.`,
      saved: "Saved to the backend. You can refresh and keep editing.",
      agentDone: "The backend returned an update.",
      hint: (label, note) => `${label}: ${note} You can edit this sentence, or replace it with any idea, then ask AI to modify.`,
      localPrompt: "I converted your note into tuning changes. Playtest again, then try feedback like 'acceleration is too high', 'braking distance is too long', or 'jump arc is too low'.",
      otherGenre: "For now, this flow uses the 2D platformer prototype. Other genres will become later chapters.",
      firstStep: "Playtest for 10 seconds, then choose one design axis to tune.",
      apiUnavailable: "Backend is unavailable, so the browser will keep running locally.",
      saveFailed: "Backend save failed, so this version was saved locally first.",
      localFallback: "Backend is unavailable, so local rules were used."
    }
  }
};

const urlLocale = new URLSearchParams(location.search).get("lang");
let locale = i18n[urlLocale] ? urlLocale : (localStorage.getItem("playcraft-locale") || "zh");
if (!i18n[locale]) locale = "zh";
let agentMode = new URLSearchParams(location.search).get("mode") === "wild"
  ? "wild"
  : (localStorage.getItem("playcraft-agent-mode") || "guided");
if (!["guided", "wild"].includes(agentMode)) agentMode = "guided";

function copy() {
  return i18n[locale];
}

function currentConcepts() {
  return copy().concepts;
}

function applyLocale({ preservePrompt = true } = {}) {
  const data = copy();
  const previousPromptDefaults = Object.values(i18n).map((entry) => entry.ui.promptDefault);
  const shouldReplacePrompt = !preservePrompt || !els.promptInput.value.trim() || previousPromptDefaults.includes(els.promptInput.value);

  document.documentElement.lang = data.lang;
  document.title = "PlayCraft Lab";
  els.settingsBtn.setAttribute("aria-label", data.ui.settings);
  els.settingsTitle.textContent = data.ui.settings;
  els.languageLabel.textContent = data.ui.language;
  choiceScreen.setAttribute("aria-label", data.ui.choiceAria);
  studio.setAttribute("aria-label", data.ui.studioAria);
  document.querySelector(".choice-copy h1").textContent = data.ui.question;
  document.querySelector(".choice-copy p").textContent = data.ui.intro;
  document.querySelector(".genre-card.featured").dataset.badge = data.ui.featuredBadge;

  document.querySelectorAll("[data-genre]").forEach((card) => {
    const genre = data.genres[card.dataset.genre];
    if (!genre) return;
    card.querySelector("strong").textContent = genre[0];
    card.querySelector("small").textContent = genre[1];
  });

  els.backBtn.setAttribute("aria-label", data.ui.backAria);
  els.demoTitle.textContent = data.ui.demoTitle;
  els.factoryResetBtn.textContent = data.ui.factoryReset;
  els.saveBtn.textContent = data.ui.save;
  canvas.setAttribute("aria-label", data.ui.canvasAria);
  els.coinText.parentElement.childNodes[0].textContent = `${data.ui.coins} `;
  els.lifeText.parentElement.childNodes[0].textContent = `${data.ui.lives} `;
  els.restartBtn.textContent = data.ui.restart;
  document.querySelector(".guide-head span").textContent = data.ui.guideLabel;
  document.querySelector(".tweak-panel .label").textContent = data.ui.tweakLabel;
  document.querySelector(".prompt-panel .label").textContent = data.ui.promptLabel;
  document.querySelector(".agent-mode-switch").setAttribute("aria-label", data.ui.modeAria);
  document.querySelector('[data-agent-mode="guided"]').textContent = data.ui.guidedMode;
  document.querySelector('[data-agent-mode="wild"]').textContent = data.ui.wildMode;
  els.modeHelp.textContent = agentMode === "wild" ? data.ui.wildHelp : data.ui.guidedHelp;
  els.promptForm.querySelector("button").textContent = data.ui.submit;
  if (shouldReplacePrompt) els.promptInput.value = data.ui.promptDefault;
  els.touchControls.setAttribute("aria-label", data.ui.touchAria);
  document.querySelector('[data-touch="left"]').setAttribute("aria-label", data.ui.leftAria);
  document.querySelector('[data-touch="right"]').setAttribute("aria-label", data.ui.rightAria);
  const jumpButton = document.querySelector('[data-touch="jump"]');
  jumpButton.setAttribute("aria-label", data.ui.jumpAria);
  jumpButton.textContent = data.ui.jump;

  document.querySelectorAll("[data-concept]").forEach((button) => {
    const concept = data.concepts[button.dataset.concept];
    if (!concept) return;
    button.querySelector("strong").textContent = concept.title;
    button.querySelector("small").textContent = concept.short;
  });

  languageButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === locale);
  });
  agentModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.agentMode === agentMode);
  });

  if (state.finished && state.resultKey) {
    els.resultTitle.textContent = state.resultKey === "win" ? data.ui.resultWin : data.ui.resultRetry;
  }
  selectConcept(state.activeConcept);
  updateHud();
}

const themePalettes = {
  grass: { skyTop: "#143c63", skyMid: "#19665a", ground: "#5b3a25", top: "#7bd88f", cloud: "rgba(255,255,255,0.12)" },
  night: { skyTop: "#07182d", skyMid: "#1c2448", ground: "#4b3a54", top: "#75c7ff", cloud: "rgba(255,255,255,0.18)" },
  snow: { skyTop: "#6f9fbd", skyMid: "#a9c6d6", ground: "#7f6a58", top: "#f4fbff", cloud: "rgba(255,255,255,0.32)" }
};

function currentPalette() {
  return {
    ...(themePalettes[state.design.sceneTheme] || themePalettes.grass),
    ...(state.design.visual || {})
  };
}

const presets = {
  default: {
    maxSpeed: 300,
    acceleration: 1300,
    deceleration: 1450,
    turnDeceleration: 2300,
    friction: 0.72,
    jumpPower: 650,
    gravity: 1600,
    fallGravity: 2100,
    airControl: 0.55
  }
};

const state = {
  activeConcept: "scene",
  xp: 0,
  level: 1,
  keys: new Set(),
  touchKeys: new Set(),
  last: performance.now(),
  params: { ...presets.default },
  projectId: null,
  design: {
    sceneTheme: "grass",
    sceneName: "草地",
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
  },
  cameraX: 0,
  player: {
    x: 80,
    y: 0,
    w: 30,
    h: 38,
    vx: 0,
    vy: 0,
    grounded: false,
    facing: 1,
    hurtTimer: 0
  },
  coins: [],
  enemies: [],
  particles: [],
  score: 0,
  lives: 3,
  finished: false,
  resultKey: null,
  worldW: 1700,
  worldH: 540,
  loopStarted: false
};

const level = {
  groundY: 430,
  flagX: 1540,
  spawn: { x: 80, y: 340 },
  platforms: [
    { x: 0, y: 430, w: 420, h: 80 },
    { x: 510, y: 430, w: 260, h: 80 },
    { x: 850, y: 430, w: 320, h: 80 },
    { x: 1240, y: 430, w: 440, h: 80 },
    { x: 360, y: 330, w: 150, h: 22 },
    { x: 760, y: 300, w: 150, h: 22 },
    { x: 1090, y: 335, w: 160, h: 22 }
  ],
  coinSpawns: [
    { x: 410, y: 290 },
    { x: 820, y: 260 },
    { x: 1145, y: 295 }
  ],
  enemySpawns: [
    { x: 610, y: 395, min: 530, max: 745 },
    { x: 1035, y: 395, min: 880, max: 1140 }
  ]
};

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.max(1, Math.min(2, devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function isTouchDevice() {
  return matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function syncTouchControls() {
  els.touchControls.hidden = !isTouchDevice();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function viewScale() {
  return Math.min(1, Math.max(0.48, canvas.clientHeight / state.worldH));
}

function viewWidth() {
  return canvas.clientWidth / viewScale();
}

function addXp(amount) {
  state.xp += amount;
  state.level = Math.floor(state.xp / 100) + 1;
  els.xpText.textContent = state.xp;
  els.levelText.textContent = state.level;
  els.xpFill.style.width = `${state.xp % 100}%`;
}

function currentGameConfig() {
  return {
    params: { ...state.params },
    design: { ...state.design }
  };
}

function applyGameConfig(config = {}) {
  if (config.params) Object.assign(state.params, config.params);
  if (config.design) Object.assign(state.design, config.design);
  resetGame();
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

async function ensureProject() {
  if (state.projectId) return state.projectId;
  const result = await apiFetch("/api/projects", {
    method: "POST",
    body: JSON.stringify({ genre: "platformer", config: currentGameConfig() })
  });
  state.projectId = result.project.id;
  const url = new URL(location.href);
  url.searchParams.set("project", state.projectId);
  history.replaceState(null, "", url);
  log(copy().logs.connected(state.projectId.slice(0, 8)), "API");
  return state.projectId;
}

async function loadProjectFromUrl() {
  const id = new URLSearchParams(location.search).get("project");
  if (!id) return false;
  const result = await apiFetch(`/api/projects/${id}`);
  state.projectId = result.project.id;
  if (result.project.config) applyGameConfig(result.project.config);
  log(copy().logs.loaded(state.projectId.slice(0, 8)), "API");
  return true;
}

async function saveProjectToServer() {
  const id = await ensureProject();
  await apiFetch(`/api/projects/${id}/save`, {
    method: "POST",
    body: JSON.stringify({ config: currentGameConfig() })
  });
  log(copy().logs.saved, "SAVE");
}

async function resetProjectToFactory() {
  const id = await ensureProject();
  const result = await apiFetch(`/api/projects/${id}/reset`, { method: "POST" });
  localStorage.setItem("playcraft-agent-mode", "guided");
  agentMode = "guided";
  log(copy().ui.resetDone, "RESET");
  const redirect = new URL(result.reset?.redirectUrl || `/?project=${id}`, location.origin);
  redirect.searchParams.set("project", id);
  redirect.searchParams.set("lang", locale);
  redirect.searchParams.set("mode", "guided");
  location.href = `${redirect.pathname}${redirect.search}`;
}

async function modifyViaAgent(message) {
  const id = await ensureProject();
  const result = await apiFetch(`/api/projects/${id}/modify`, {
    method: "POST",
    body: JSON.stringify({ message, config: currentGameConfig(), locale })
  });
  if (result.agent?.config) applyGameConfig(result.agent.config);
  if (result.agent?.learningConcept && currentConcepts()[result.agent.learningConcept]) {
    selectConcept(result.agent.learningConcept);
  }
  log(result.agent?.message || copy().logs.agentDone, "AGENT");
}

async function modifyViaWildAgent(message) {
  const id = await ensureProject();
  log(locale === "en" ? "Wild Mode is editing this project's code sandbox." : "Wild 模式正在修改当前项目的代码沙箱。", "WILD");
  const result = await apiFetch(`/api/projects/${id}/wild`, {
    method: "POST",
    body: JSON.stringify({ message, locale })
  });
  const changed = result.wild?.changedFiles?.length ? ` (${result.wild.changedFiles.join(", ")})` : "";
  log(`${result.wild?.message || "Wild 模式已完成。"}${changed}`, "WILD");
  if (result.wild?.previewUrl) {
    location.href = result.wild.previewUrl;
  }
}

function log(message, tag = "AI") {
  const p = document.createElement("p");
  p.innerHTML = `<b>${tag}</b> ${message}`;
  els.log.prepend(p);
  while (els.log.children.length > 5) els.log.lastChild.remove();
}

function currentPlatforms() {
  if (Array.isArray(state.design.platforms) && state.design.platforms.length) {
    return state.design.platforms.map((p) => ({
      x: clamp(Number(p.x) || 0, 0, state.worldW - 40),
      y: clamp(Number(p.y) || 430, 180, 470),
      w: clamp(Number(p.w) || 160, 40, 700),
      h: clamp(Number(p.h) || 40, 18, 120)
    }));
  }
  if (state.design.levelMode === "easy") {
    return [
      { x: 0, y: 430, w: 520, h: 80 },
      { x: 590, y: 430, w: 360, h: 80 },
      { x: 1020, y: 430, w: 660, h: 80 },
      { x: 430, y: 330, w: 180, h: 22 },
      { x: 860, y: 320, w: 180, h: 22 }
    ];
  }
  if (state.design.levelMode === "hard") {
    return [
      { x: 0, y: 430, w: 340, h: 80 },
      { x: 500, y: 430, w: 210, h: 80 },
      { x: 850, y: 430, w: 230, h: 80 },
      { x: 1240, y: 430, w: 440, h: 80 },
      { x: 350, y: 330, w: 130, h: 22 },
      { x: 735, y: 285, w: 125, h: 22 },
      { x: 1090, y: 335, w: 130, h: 22 }
    ];
  }
  return level.platforms;
}

function currentCoins() {
  if (Array.isArray(state.design.coinSpawns) && state.design.coinSpawns.length) {
    return state.design.coinSpawns.slice(0, 8).map((c) => ({
      x: clamp(Number(c.x) || 400, 20, state.worldW - 20),
      y: clamp(Number(c.y) || 290, 70, 420)
    }));
  }
  const base = [
    { x: 410, y: 290 },
    { x: 820, y: 260 },
    { x: 1145, y: 295 },
    { x: 620, y: 390 },
    { x: 1360, y: 390 }
  ];
  return base.slice(0, Math.max(3, state.design.requiredCoins));
}

function currentEnemies() {
  if (state.design.enemyMode === "none") return [];
  if (Array.isArray(state.design.enemySpawns) && state.design.enemySpawns.length) {
    return state.design.enemySpawns.slice(0, 5).map((e) => ({
      x: clamp(Number(e.x) || 620, 20, state.worldW - 80),
      y: clamp(Number(e.y) || 395, 160, 420),
      min: clamp(Number(e.min) || Number(e.x) - 80 || 520, 0, state.worldW - 80),
      max: clamp(Number(e.max) || Number(e.x) + 80 || 760, 80, state.worldW),
      speed: clamp(Number(e.speed) || 62, 20, 180)
    }));
  }
  const speed = state.design.enemyMode === "fast" ? 112 : 62;
  return level.enemySpawns.map((enemy) => ({ ...enemy, speed }));
}

function resetGame(keepProgress = true) {
  state.player = {
    x: level.spawn.x,
    y: level.spawn.y,
    w: 30,
    h: 38,
    vx: 0,
    vy: 0,
    grounded: false,
    facing: 1,
    hurtTimer: 0
  };
  state.cameraX = 0;
  state.score = 0;
  state.lives = 3;
  state.finished = false;
  state.resultKey = null;
  state.coins = currentCoins().map((c) => ({ ...c, r: 12, taken: false }));
  state.enemies = currentEnemies().map((e) => ({ ...e, w: 32, h: 28, vx: e.speed }));
  state.particles = [];
  els.resultLayer.hidden = true;
  if (!keepProgress) {
    state.params = { ...presets.default };
    state.design = {
      sceneTheme: "grass",
      sceneName: "草地",
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
    };
    state.xp = 0;
    state.level = 1;
    addXp(0);
  }
  updateHud();
}

function updateHud() {
  els.coinText.textContent = state.score;
  els.coinTargetText.textContent = state.design.requiredCoins;
  els.lifeText.textContent = state.lives;
  const feel = copy().feel;
  if (state.params.friction < 0.45) els.feelTag.textContent = feel.ice;
  else if (state.params.maxSpeed > 360) els.feelTag.textContent = feel.sprint;
  else if (state.params.gravity < 1300) els.feelTag.textContent = feel.float;
  else if (state.params.gravity > 1900) els.feelTag.textContent = feel.heavy;
  else els.feelTag.textContent = feel.normal;
}

function selectConcept(id) {
  state.activeConcept = id;
  const data = currentConcepts()[id];
  if (!data) return;
  els.guideTitle.textContent = data.title;
  els.guideText.textContent = data.guide;
  els.conceptTitle.textContent = data.title;
  els.conceptText.textContent = data.text;
  els.choiceRow.innerHTML = "";

  for (const [label, prompt, note] of data.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      document.querySelectorAll(".choice-row button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      els.promptInput.value = prompt;
      els.promptInput.focus();
      log(copy().logs.hint(label, note), "HINT");
    });
    els.choiceRow.appendChild(button);
  }

  document.querySelectorAll(".concept").forEach((button) => {
    button.classList.toggle("active", button.dataset.concept === id);
  });
}

function applyPrompt(text) {
  const t = text.trim();
  if (!t) return;

  if (t.includes("快")) {
    state.params.maxSpeed = clamp(state.params.maxSpeed + 55, 160, 520);
    state.params.acceleration = clamp(state.params.acceleration + 180, 600, 2400);
  }
  if (t.includes("慢")) {
    state.params.maxSpeed = clamp(state.params.maxSpeed - 45, 160, 520);
  }
  if (t.includes("跳") && (t.includes("高") || t.includes("更高"))) {
    state.params.jumpPower = clamp(state.params.jumpPower + 80, 360, 920);
  }
  if (t.includes("跳") && t.includes("低")) {
    state.params.jumpPower = clamp(state.params.jumpPower - 70, 360, 920);
  }
  if (t.includes("重") || t.includes("快点落") || t.includes("落下快")) {
    state.params.gravity = clamp(state.params.gravity + 220, 800, 2800);
    state.params.fallGravity = clamp(state.params.fallGravity + 320, 1000, 3600);
  }
  if (t.includes("轻") || t.includes("飘")) {
    state.params.gravity = clamp(state.params.gravity - 220, 800, 2800);
    state.params.fallGravity = clamp(state.params.fallGravity - 260, 1000, 3600);
  }
  if (t.includes("滑") || t.includes("冰")) {
    state.params.deceleration = clamp(state.params.deceleration - 420, 250, 3200);
    state.params.turnDeceleration = clamp(state.params.turnDeceleration - 520, 350, 4200);
    state.params.friction = clamp(state.params.friction - 0.12, 0.22, 0.95);
  }
  if (t.includes("停") || t.includes("停住") || t.includes("不滑")) {
    state.params.deceleration = clamp(state.params.deceleration + 520, 250, 3200);
    state.params.turnDeceleration = clamp(state.params.turnDeceleration + 620, 350, 4200);
    state.params.friction = clamp(state.params.friction + 0.12, 0.22, 0.95);
  }

  addXp(25);
  resetGame();
  log(copy().logs.localPrompt);
}

async function startStudio(genre) {
  choiceScreen.hidden = true;
  studio.hidden = false;
  if (genre !== "platformer") {
    log(copy().logs.otherGenre, "LAB");
  }
  fitCanvas();
  const loaded = await loadProjectFromUrl().catch((error) => {
    console.warn(error);
    return false;
  });
  if (!loaded) resetGame(false);
  selectConcept("scene");
  log(copy().logs.firstStep);
  ensureProject().catch((error) => {
    console.warn(error);
    log(copy().logs.apiUnavailable, "API");
  });
  if (!state.loopStarted) {
    state.loopStarted = true;
    requestAnimationFrame(tick);
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerCollisionBox() {
  const inset = state.design.collisionInset;
  const p = state.player;
  return {
    x: p.x + inset,
    y: p.y + inset,
    w: Math.max(4, p.w - inset * 2),
    h: Math.max(4, p.h - inset * 2)
  };
}

function solidCollision(prevY) {
  const p = state.player;
  p.grounded = false;
  for (const plat of currentPlatforms()) {
    if (!rectsOverlap(p, plat)) continue;
    const wasAbove = prevY + p.h <= plat.y + 8;
    if (wasAbove && p.vy >= 0) {
      p.y = plat.y - p.h;
      p.vy = 0;
      p.grounded = true;
    } else if (p.x + p.w / 2 < plat.x + plat.w / 2) {
      p.x = plat.x - p.w;
      p.vx = Math.min(0, p.vx);
    } else {
      p.x = plat.x + plat.w;
      p.vx = Math.max(0, p.vx);
    }
  }
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + Math.random() * 120;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      r: 2 + Math.random() * 3,
      c: color,
      life: 0.35 + Math.random() * 0.55
    });
  }
}

function update(dt) {
  if (state.finished) return;
  const p = state.player;
  const params = state.params;
  const left = state.keys.has("ArrowLeft") || state.keys.has("KeyA");
  const right = state.keys.has("ArrowRight") || state.keys.has("KeyD");
  const jump = state.keys.has("Space") || state.keys.has("ArrowUp") || state.keys.has("KeyW");
  const touchLeft = state.touchKeys.has("left");
  const touchRight = state.touchKeys.has("right");
  const touchJump = state.touchKeys.has("jump");

  let input = 0;
  if (left || touchLeft) input -= 1;
  if (right || touchRight) input += 1;

  const control = p.grounded ? 1 : params.airControl;
  if (input) {
    const changingDirection = Math.sign(p.vx) && Math.sign(p.vx) !== input;
    const accel = changingDirection ? params.turnDeceleration : params.acceleration;
    p.vx += input * accel * control * dt;
    p.facing = input;
  } else if (p.grounded) {
    const slow = params.deceleration * params.friction * dt;
    if (Math.abs(p.vx) <= slow) p.vx = 0;
    else p.vx -= Math.sign(p.vx) * slow;
  }

  p.vx = clamp(p.vx, -params.maxSpeed, params.maxSpeed);

  if ((jump || touchJump) && p.grounded) {
    p.vy = -params.jumpPower;
    p.grounded = false;
    burst(p.x + p.w / 2, p.y + p.h, "#ffffff", 8);
    addXp(2);
  }

  const prevY = p.y;
  p.vy += (p.vy > 0 ? params.fallGravity : params.gravity) * dt;
  p.vy = clamp(p.vy, -1000, 1100);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = clamp(p.x, 0, state.worldW - p.w);
  solidCollision(prevY);

  if (p.y > state.worldH + 120) {
    state.lives -= 1;
    if (state.lives <= 0) finish("retry");
    else {
      p.x = level.spawn.x;
      p.y = level.spawn.y;
      p.vx = 0;
      p.vy = 0;
    }
  }

  for (const coin of state.coins) {
    if (coin.taken) continue;
    const hit = Math.hypot((p.x + p.w / 2) - coin.x, (p.y + p.h / 2) - coin.y) < 28;
    if (hit) {
      coin.taken = true;
      state.score += 1;
      addXp(12);
      burst(coin.x, coin.y, "#ffc857", 14);
    }
  }

  for (const e of state.enemies) {
    e.x += e.vx * dt;
    if (e.x < e.min || e.x > e.max) e.vx *= -1;
    if (rectsOverlap(playerCollisionBox(), e) && p.hurtTimer <= 0) {
      const stomp = p.vy > 0 && p.y + p.h - e.y < 16 + state.design.collisionInset;
      if (stomp) {
        e.x = -9999;
        p.vy = -params.jumpPower * 0.55;
        burst(p.x + p.w / 2, p.y + p.h, "#ff6f59", 16);
        addXp(16);
      } else {
        state.lives -= 1;
        p.hurtTimer = 1;
        p.vx = -p.facing * 280;
        burst(p.x + p.w / 2, p.y + p.h / 2, "#ff6f59", 14);
        if (state.lives <= 0) finish("retry");
      }
    }
  }
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);

  if (p.x > level.flagX && state.score >= state.design.requiredCoins) finish("win");
  state.cameraX = clamp(p.x - viewWidth() * 0.42, 0, state.worldW - viewWidth());

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const part = state.particles[i];
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    part.vy += 700 * dt;
    part.life -= dt;
    if (part.life <= 0) state.particles.splice(i, 1);
  }
  updateHud();
}

function finish(resultKey) {
  state.finished = true;
  state.resultKey = resultKey;
  els.resultTitle.textContent = resultKey === "win" ? copy().ui.resultWin : copy().ui.resultRetry;
  els.resultLayer.hidden = false;
  addXp(resultKey === "win" ? 35 : 8);
}

function worldToScreen(x) {
  return x - state.cameraX;
}

function drawPlayer(x, y) {
  const p = state.player;
  ctx.save();
  ctx.translate(x + p.w / 2, y + p.h / 2);
  if (p.hurtTimer > 0 && Math.floor(p.hurtTimer * 16) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.fillStyle = state.design.playerColor || "#75c7ff";
  ctx.fillRect(-15, -18, 30, 36);
  ctx.fillStyle = "#f9fbf4";
  ctx.fillRect(-8, -8, 5, 5);
  ctx.fillRect(5, -8, 5, 5);
  ctx.fillStyle = "#ffc857";
  ctx.fillRect(p.facing > 0 ? 14 : -20, -2, 6, 12);
  ctx.restore();
}

function draw() {
  const scale = viewScale();
  const w = viewWidth();
  const h = state.worldH;
  const palette = currentPalette();
  ctx.save();
  ctx.scale(scale, scale);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.62, palette.skyMid);
  sky.addColorStop(1, "#1d2c22");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = palette.cloud;
  for (let x = -state.cameraX * 0.22 % 140; x < w + 140; x += 140) {
    ctx.beginPath();
    ctx.arc(x + 70, 96, 26, 0, Math.PI * 2);
    ctx.arc(x + 98, 100, 20, 0, Math.PI * 2);
    ctx.arc(x + 44, 103, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(-state.cameraX, 0);

  for (const plat of currentPlatforms()) {
    ctx.fillStyle = palette.top;
    ctx.fillRect(plat.x, plat.y, plat.w, 18);
    ctx.fillStyle = palette.ground;
    ctx.fillRect(plat.x, plat.y + 18, plat.w, plat.h - 18);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    for (let x = plat.x + 12; x < plat.x + plat.w; x += 34) {
      ctx.fillRect(x, plat.y + 24, 18, 7);
    }
  }

  for (const coin of state.coins) {
    if (coin.taken) continue;
    ctx.fillStyle = state.design.coinColor || "#ffc857";
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b4400";
    ctx.fillRect(coin.x - 2, coin.y - 8, 4, 16);
  }

  for (const e of state.enemies) {
    if (e.x < 0) continue;
    ctx.fillStyle = state.design.enemyColor || "#ff6f59";
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = "#101";
    ctx.fillRect(e.x + 7, e.y + 8, 4, 4);
    ctx.fillRect(e.x + 21, e.y + 8, 4, 4);
  }

  ctx.fillStyle = "#ffc857";
  ctx.fillRect(level.flagX + 8, 260, 7, 170);
  ctx.fillStyle = state.design.flagColor || "#19c3a6";
  ctx.beginPath();
  ctx.moveTo(level.flagX + 15, 265);
  ctx.lineTo(level.flagX + 92, 292);
  ctx.lineTo(level.flagX + 15, 318);
  ctx.closePath();
  ctx.fill();

  drawPlayer(state.player.x, state.player.y);

  for (const part of state.particles) {
    ctx.globalAlpha = Math.max(0, part.life);
    ctx.fillStyle = part.c;
    ctx.beginPath();
    ctx.arc(part.x, part.y, part.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.restore();
}

function tick(now) {
  const dt = Math.min(0.033, (now - state.last) / 1000);
  state.last = now;
  update(dt);
  draw();
  requestAnimationFrame(tick);
}

document.querySelectorAll("[data-genre]").forEach((button) => {
  button.addEventListener("click", () => startStudio(button.dataset.genre));
});

els.settingsBtn.addEventListener("click", () => {
  const nextHidden = !els.settingsPanel.hidden;
  els.settingsPanel.hidden = nextHidden;
  els.settingsBtn.setAttribute("aria-expanded", String(!nextHidden));
});

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    locale = button.dataset.lang;
    localStorage.setItem("playcraft-locale", locale);
    const url = new URL(location.href);
    url.searchParams.set("lang", locale);
    history.replaceState(null, "", url);
    applyLocale();
    els.settingsPanel.hidden = true;
    els.settingsBtn.setAttribute("aria-expanded", "false");
  });
});

agentModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    agentMode = button.dataset.agentMode;
    localStorage.setItem("playcraft-agent-mode", agentMode);
    const url = new URL(location.href);
    url.searchParams.set("mode", agentMode);
    history.replaceState(null, "", url);
    applyLocale();
  });
});

document.addEventListener("click", (event) => {
  if (els.settingsPanel.hidden) return;
  if (event.target.closest(".settings-menu")) return;
  els.settingsPanel.hidden = true;
  els.settingsBtn.setAttribute("aria-expanded", "false");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || els.settingsPanel.hidden) return;
  els.settingsPanel.hidden = true;
  els.settingsBtn.setAttribute("aria-expanded", "false");
  els.settingsBtn.focus();
});

els.backBtn.addEventListener("click", () => {
  studio.hidden = true;
  choiceScreen.hidden = false;
});

els.restartBtn.addEventListener("click", () => resetGame());
els.factoryResetBtn.addEventListener("click", () => {
  if (!confirm(copy().ui.resetConfirm)) return;
  resetProjectToFactory().catch((error) => {
    console.warn(error);
    log(locale === "en" ? "Reset failed. The current page is unchanged." : "重置失败，当前页面没有变化。", "RESET");
  });
});
els.saveBtn.addEventListener("click", () => {
  localStorage.setItem("playcraft-platformer-save", JSON.stringify({ params: state.params, xp: state.xp, savedAt: new Date().toISOString() }));
  addXp(20);
  saveProjectToServer().catch((error) => {
    console.warn(error);
    log(copy().logs.saveFailed, "SAVE");
  });
});

els.conceptStack.addEventListener("click", (event) => {
  const button = event.target.closest("[data-concept]");
  if (button) selectConcept(button.dataset.concept);
});

els.promptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = els.promptInput.value;
  if (agentMode === "wild") {
    modifyViaWildAgent(message).catch((error) => {
      console.warn(error);
      log(locale === "en" ? "Wild Mode failed. Switch back to Guided or try a smaller request." : "Wild 模式失败了。可以切回 Guided，或者把需求说小一点。", "WILD");
    });
    return;
  }
  modifyViaAgent(message).catch((error) => {
    console.warn(error);
    applyPrompt(message);
    log(copy().logs.localFallback, "API");
  });
});

document.querySelectorAll("[data-touch]").forEach((button) => {
  const action = button.dataset.touch;
  const press = (event) => {
    event.preventDefault();
    state.touchKeys.add(action);
    button.classList.add("active");
  };
  const release = (event) => {
    event.preventDefault();
    state.touchKeys.delete(action);
    button.classList.remove("active");
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

window.addEventListener("keydown", (event) => {
  state.keys.add(event.code);
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
});
window.addEventListener("keyup", (event) => state.keys.delete(event.code));
window.addEventListener("resize", () => {
  if (!studio.hidden) {
    fitCanvas();
    state.cameraX = clamp(state.player.x - viewWidth() * 0.42, 0, state.worldW - viewWidth());
  }
  syncTouchControls();
});

fitCanvas();
syncTouchControls();
applyLocale({ preservePrompt: false });

const initialParams = new URLSearchParams(location.search);
if (initialParams.get("demo") === "platformer" || initialParams.get("project")) {
  startStudio("platformer");
}
