/**
 * 浏览器指纹随机化模块
 * 为每个注册会话生成随机的浏览器指纹，避免被检测为批量注册
 * 支持基于 IP 地理位置生成一致性指纹
 */

// 地区 → language/timezone 映射表
const GEO_PROFILES = {
  JP: { languages: [['ja-JP', 'ja']], timezones: ['Asia/Tokyo'] },
  US: { languages: [['en-US', 'en']], timezones: ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Denver'] },
  GB: { languages: [['en-GB', 'en']], timezones: ['Europe/London'] },
  DE: { languages: [['de-DE', 'de'], ['en-US', 'en']], timezones: ['Europe/Berlin'] },
  FR: { languages: [['fr-FR', 'fr'], ['en-US', 'en']], timezones: ['Europe/Paris'] },
  CN: { languages: [['zh-CN', 'zh']], timezones: ['Asia/Shanghai'] },
  KR: { languages: [['ko-KR', 'ko'], ['en-US', 'en']], timezones: ['Asia/Seoul'] },
  SG: { languages: [['en-US', 'en'], ['zh-CN', 'zh']], timezones: ['Asia/Singapore'] },
  AU: { languages: [['en-AU', 'en']], timezones: ['Australia/Sydney'] },
  CA: { languages: [['en-US', 'en'], ['fr-CA', 'fr']], timezones: ['America/Toronto', 'America/Vancouver'] },
  BR: { languages: [['pt-BR', 'pt']], timezones: ['America/Sao_Paulo'] },
  IN: { languages: [['en-IN', 'en'], ['hi-IN', 'hi']], timezones: ['Asia/Kolkata'] },
  RU: { languages: [['ru-RU', 'ru']], timezones: ['Europe/Moscow'] },
  TW: { languages: [['zh-TW', 'zh']], timezones: ['Asia/Taipei'] },
  HK: { languages: [['zh-HK', 'zh'], ['en-US', 'en']], timezones: ['Asia/Hong_Kong'] },
  CO: { languages: [['es-CO', 'es']], timezones: ['America/Bogota'] },
  MX: { languages: [['es-MX', 'es']], timezones: ['America/Mexico_City'] },
  AR: { languages: [['es-AR', 'es']], timezones: ['America/Argentina/Buenos_Aires'] },
  CL: { languages: [['es-CL', 'es']], timezones: ['America/Santiago'] },
  PE: { languages: [['es-PE', 'es']], timezones: ['America/Lima'] },
  TH: { languages: [['th-TH', 'th'], ['en-US', 'en']], timezones: ['Asia/Bangkok'] },
  VN: { languages: [['vi-VN', 'vi']], timezones: ['Asia/Ho_Chi_Minh'] },
  ID: { languages: [['id-ID', 'id'], ['en-US', 'en']], timezones: ['Asia/Jakarta'] },
  PH: { languages: [['en-PH', 'en']], timezones: ['Asia/Manila'] },
  MY: { languages: [['ms-MY', 'ms'], ['en-US', 'en']], timezones: ['Asia/Kuala_Lumpur'] },
  TR: { languages: [['tr-TR', 'tr']], timezones: ['Europe/Istanbul'] },
  SA: { languages: [['ar-SA', 'ar'], ['en-US', 'en']], timezones: ['Asia/Riyadh'] },
  AE: { languages: [['ar-AE', 'ar'], ['en-US', 'en']], timezones: ['Asia/Dubai'] },
  ZA: { languages: [['en-ZA', 'en']], timezones: ['Africa/Johannesburg'] },
  NL: { languages: [['nl-NL', 'nl'], ['en-US', 'en']], timezones: ['Europe/Amsterdam'] },
  IT: { languages: [['it-IT', 'it']], timezones: ['Europe/Rome'] },
  ES: { languages: [['es-ES', 'es']], timezones: ['Europe/Madrid'] },
  PL: { languages: [['pl-PL', 'pl']], timezones: ['Europe/Warsaw'] },
  SE: { languages: [['sv-SE', 'sv'], ['en-US', 'en']], timezones: ['Europe/Stockholm'] },
  NO: { languages: [['nb-NO', 'nb'], ['en-US', 'en']], timezones: ['Europe/Oslo'] },
  UA: { languages: [['uk-UA', 'uk']], timezones: ['Europe/Kiev'] },
  IL: { languages: [['he-IL', 'he'], ['en-US', 'en']], timezones: ['Asia/Jerusalem'] },
  NZ: { languages: [['en-NZ', 'en']], timezones: ['Pacific/Auckland'] },
};

/**
 * 生成随机 User-Agent
 */
function generateRandomUserAgent() {
  const browsers = [
    {
      name: 'Chrome',
      versions: ['120.0.0.0', '119.0.0.0', '118.0.0.0', '117.0.0.0'],
      platforms: [
        'Windows NT 10.0; Win64; x64',
        'Windows NT 10.0; WOW64',
        'Macintosh; Intel Mac OS X 10_15_7',
        'X11; Linux x86_64'
      ]
    },
    {
      name: 'Firefox',
      versions: ['121.0', '120.0', '119.0', '118.0'],
      platforms: [
        'Windows NT 10.0; Win64; x64; rv:121.0',
        'Macintosh; Intel Mac OS X 10.15',
        'X11; Linux x86_64'
      ]
    },
    {
      name: 'Safari',
      versions: ['17.1', '17.0', '16.6', '16.5'],
      platforms: [
        'Macintosh; Intel Mac OS X 10_15_7',
        'Macintosh; Intel Mac OS X 10_14_6'
      ]
    }
  ];

  const browser = browsers[Math.floor(Math.random() * browsers.length)];
  const version = browser.versions[Math.floor(Math.random() * browser.versions.length)];
  const platform = browser.platforms[Math.floor(Math.random() * browser.platforms.length)];

  let userAgent;
  switch (browser.name) {
    case 'Chrome':
      userAgent = `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
      break;
    case 'Firefox':
      userAgent = `Mozilla/5.0 (${platform}) Gecko/20100101 Firefox/${version}`;
      break;
    case 'Safari':
      userAgent = `Mozilla/5.0 (${platform}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`;
      break;
  }

  return userAgent;
}

/**
 * 生成随机屏幕分辨率
 */
function generateRandomScreenResolution() {
  const resolutions = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 },
    { width: 1600, height: 900 }
  ];

  return resolutions[Math.floor(Math.random() * resolutions.length)];
}

/**
 * 生成随机时区（支持地理一致性）
 */
function generateRandomTimezone(geoInfo) {
  if (geoInfo?.countryCode) {
    const profile = GEO_PROFILES[geoInfo.countryCode];
    if (profile) {
      // 优先使用 API 返回的真实 timezone，否则从 profile 中随机选
      if (geoInfo.timezone && profile.timezones.includes(geoInfo.timezone)) {
        return geoInfo.timezone;
      }
      return profile.timezones[Math.floor(Math.random() * profile.timezones.length)];
    }
    // 国家不在映射表中，直接使用 API 返回的 timezone
    if (geoInfo.timezone) {
      return geoInfo.timezone;
    }
  }

  const timezones = [
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
    'America/Chicago'
  ];

  return timezones[Math.floor(Math.random() * timezones.length)];
}

/**
 * 生成随机语言设置（支持地理一致性）
 */
function generateRandomLanguages(geoInfo) {
  if (geoInfo?.countryCode) {
    const profile = GEO_PROFILES[geoInfo.countryCode];
    if (profile) {
      return profile.languages[Math.floor(Math.random() * profile.languages.length)];
    }
    // 国家不在映射表中，根据 timezone 推断语言
    if (geoInfo.timezone) {
      const tz = geoInfo.timezone;
      if (tz.startsWith('America/')) return ['es-419', 'es'];
      if (tz.startsWith('Europe/')) return ['en-GB', 'en'];
      if (tz.startsWith('Asia/')) return ['en-US', 'en'];
      if (tz.startsWith('Africa/')) return ['en-US', 'en'];
    }
  }

  const languageSets = [
    ['en-US', 'en'],
    ['zh-CN', 'zh'],
    ['en-GB', 'en'],
    ['fr-FR', 'fr'],
    ['de-DE', 'de'],
    ['ja-JP', 'ja'],
    ['es-ES', 'es']
  ];

  return languageSets[Math.floor(Math.random() * languageSets.length)];
}

/**
 * 生成随机 Canvas 指纹干扰值
 */
function generateCanvasNoise() {
  return {
    r: Math.floor(Math.random() * 10) - 5,
    g: Math.floor(Math.random() * 10) - 5,
    b: Math.floor(Math.random() * 10) - 5,
    a: Math.random() * 0.1 - 0.05
  };
}

/**
 * 生成随机 WebGL 参数
 */
function generateWebGLParams() {
  const vendors = [
    'Google Inc.',
    'Mozilla',
    'Apple Inc.',
    'Microsoft Corporation'
  ];

  const renderers = [
    'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'WebKit WebGL',
    'Mozilla -- ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)'
  ];

  return {
    vendor: vendors[Math.floor(Math.random() * vendors.length)],
    renderer: renderers[Math.floor(Math.random() * renderers.length)]
  };
}

/**
 * 生成完整的随机指纹配置
 * @param {Object} geoInfo - 可选，IP 地理位置信息 { countryCode, timezone, ip }
 */
function generateRandomFingerprint(geoInfo) {
  const userAgent = generateRandomUserAgent();
  const screen = generateRandomScreenResolution();
  const timezone = generateRandomTimezone(geoInfo);
  const languages = generateRandomLanguages(geoInfo);
  const canvasNoise = generateCanvasNoise();
  const webgl = generateWebGLParams();

  return {
    userAgent,
    screen,
    timezone,
    languages,
    canvasNoise,
    webgl,
    // 其他随机参数
    hardwareConcurrency: Math.floor(Math.random() * 8) + 2, // 2-10 核心
    deviceMemory: [2, 4, 8, 16][Math.floor(Math.random() * 4)], // GB
    colorDepth: [24, 32][Math.floor(Math.random() * 2)],
    pixelDepth: [24, 32][Math.floor(Math.random() * 2)]
  };
}

/**
 * 指纹注入函数（直接传给 chrome.scripting.executeScript 的 func 参数）
 * 注意：此函数在页面 MAIN world 中执行，不能引用外部闭包
 */
function injectFingerprint(fp) {
  'use strict';

  Object.defineProperty(navigator, 'userAgent', { get: () => fp.userAgent });

  Object.defineProperty(screen, 'width', { get: () => fp.screen.width });
  Object.defineProperty(screen, 'height', { get: () => fp.screen.height });
  Object.defineProperty(screen, 'availWidth', { get: () => fp.screen.width });
  Object.defineProperty(screen, 'availHeight', { get: () => fp.screen.height - 40 });

  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });

  Object.defineProperty(screen, 'colorDepth', { get: () => fp.colorDepth });
  Object.defineProperty(screen, 'pixelDepth', { get: () => fp.pixelDepth });

  Object.defineProperty(navigator, 'language', { get: () => fp.languages[0] });
  Object.defineProperty(navigator, 'languages', { get: () => fp.languages });

  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function(...args) {
    if (args.length === 0 || (args.length === 1 && typeof args[0] === 'undefined')) {
      args[0] = fp.languages[0];
    }
    if (args.length <= 1 || !args[1] || !args[1].timeZone) {
      args[1] = args[1] || {};
      args[1].timeZone = fp.timezone;
    }
    return new originalDateTimeFormat(...args);
  };

  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    const imageData = originalGetImageData.apply(this, args);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] += fp.canvasNoise.r;
      data[i + 1] += fp.canvasNoise.g;
      data[i + 2] += fp.canvasNoise.b;
      data[i + 3] += fp.canvasNoise.a;
    }
    return imageData;
  };

  const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return fp.webgl.vendor;
    if (parameter === 37446) return fp.webgl.renderer;
    return originalGetParameter.apply(this, arguments);
  };

  if (typeof WebGL2RenderingContext !== 'undefined') {
    const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return fp.webgl.vendor;
      if (parameter === 37446) return fp.webgl.renderer;
      return originalGetParameter2.apply(this, arguments);
    };
  }

  console.log('[Fingerprint] 随机指纹已注入:', {
    userAgent: fp.userAgent,
    screen: `${fp.screen.width}x${fp.screen.height}`,
    timezone: fp.timezone,
    language: fp.languages[0]
  });
}

export {
  generateRandomFingerprint,
  injectFingerprint
};