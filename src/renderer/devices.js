/* Device catalogue and frame geometry. All sizes are CSS pixels. */
(function () {
  'use strict';

  const PRESETS = [
    { id: 'iphone-se', name: 'iPhone SE', group: 'ios', w: 375, h: 667, dpr: 2, frame: 'classic' },
    { id: 'iphone-13', name: 'iPhone 13', group: 'ios', w: 390, h: 844, dpr: 3, frame: 'notch' },
    { id: 'iphone-15-pro', name: 'iPhone 15 Pro', group: 'ios', w: 393, h: 852, dpr: 3, frame: 'island' },
    { id: 'iphone-16-pro', name: 'iPhone 16 Pro', group: 'ios', w: 402, h: 874, dpr: 3, frame: 'island' },
    { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', group: 'ios', w: 430, h: 932, dpr: 3, frame: 'island' },
    { id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', group: 'ios', w: 440, h: 956, dpr: 3, frame: 'island' },

    { id: 'galaxy-s24', name: 'Galaxy S24', group: 'android', w: 360, h: 780, dpr: 3, frame: 'punch', model: 'SM-S921B' },
    { id: 'galaxy-s24-ultra', name: 'Galaxy S24 Ultra', group: 'android', w: 384, h: 832, dpr: 3.75, frame: 'punch', model: 'SM-S928B' },
    { id: 'galaxy-a51', name: 'Galaxy A51', group: 'android', w: 412, h: 914, dpr: 2.625, frame: 'punch', model: 'SM-A515F' },
    { id: 'redmi-note-13', name: 'Redmi Note 13', group: 'android', w: 393, h: 873, dpr: 2.75, frame: 'punch', model: 'Redmi Note 13' },
    { id: 'pixel-8', name: 'Pixel 8', group: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', model: 'Pixel 8' },
    { id: 'galaxy-z-fold5', name: 'Galaxy Z Fold5 (cover)', group: 'android', w: 344, h: 882, dpr: 2.625, frame: 'punch', model: 'SM-F946B' },

    { id: 'ipad-mini', name: 'iPad mini', group: 'tablet', platform: 'ios', w: 744, h: 1133, dpr: 2, frame: 'tablet' },
    { id: 'ipad-air', name: 'iPad Air 11″', group: 'tablet', platform: 'ios', w: 820, h: 1180, dpr: 2, frame: 'tablet' },
    { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9', group: 'tablet', platform: 'android', w: 800, h: 1280, dpr: 2, frame: 'tablet', model: 'SM-X710' },

    { id: 'iphone-12-mini', name: 'iPhone 12 mini', group: 'ios', w: 375, h: 812, dpr: 3, frame: 'notch' },
    { id: 'iphone-12', name: 'iPhone 12', group: 'ios', w: 390, h: 844, dpr: 3, frame: 'notch' },
    { id: 'iphone-12-pro', name: 'iPhone 12 Pro', group: 'ios', w: 390, h: 844, dpr: 3, frame: 'notch' },
    { id: 'iphone-12-pro-max', name: 'iPhone 12 Pro Max', group: 'ios', w: 428, h: 926, dpr: 3, frame: 'notch' },
    { id: 'iphone-13-mini', name: 'iPhone 13 mini', group: 'ios', w: 375, h: 812, dpr: 3, frame: 'notch' },
    { id: 'iphone-13-pro', name: 'iPhone 13 Pro', group: 'ios', w: 390, h: 844, dpr: 3, frame: 'notch' },
    { id: 'iphone-13-pro-max', name: 'iPhone 13 Pro Max', group: 'ios', w: 428, h: 926, dpr: 3, frame: 'notch' },
    { id: 'iphone-14', name: 'iPhone 14', group: 'ios', w: 390, h: 844, dpr: 3, frame: 'notch' },
    { id: 'iphone-14-plus', name: 'iPhone 14 Plus', group: 'ios', w: 428, h: 926, dpr: 3, frame: 'notch' },
    { id: 'iphone-14-pro', name: 'iPhone 14 Pro', group: 'ios', w: 393, h: 852, dpr: 3, frame: 'island' },
    { id: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', group: 'ios', w: 430, h: 932, dpr: 3, frame: 'island' },
    { id: 'iphone-15', name: 'iPhone 15', group: 'ios', w: 393, h: 852, dpr: 3, frame: 'island' },
    { id: 'iphone-15-plus', name: 'iPhone 15 Plus', group: 'ios', w: 430, h: 932, dpr: 3, frame: 'island' },
    { id: 'iphone-16', name: 'iPhone 16', group: 'ios', w: 393, h: 852, dpr: 3, frame: 'island' },
    { id: 'iphone-16-plus', name: 'iPhone 16 Plus', group: 'ios', w: 430, h: 932, dpr: 3, frame: 'island' },
    { id: 'galaxy-s23', name: 'Galaxy S23', group: 'android', w: 360, h: 780, dpr: 3, frame: 'punch', model: 'SM-S911B' },
    { id: 'galaxy-s23-plus', name: 'Galaxy S23+', group: 'android', w: 384, h: 832, dpr: 2.8125, frame: 'punch', model: 'SM-S916B' },
    { id: 'galaxy-s24-plus', name: 'Galaxy S24+', group: 'android', w: 384, h: 832, dpr: 3.75, frame: 'punch', model: 'SM-S926B' },
    { id: 'galaxy-a71', name: 'Galaxy A71', group: 'android', w: 412, h: 914, dpr: 2.625, frame: 'punch', model: 'SM-A715F' },
    { id: 'pixel-7', name: 'Pixel 7', group: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', model: 'Pixel 7' },
    { id: 'pixel-7a', name: 'Pixel 7a', group: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', model: 'Pixel 7a' },
    { id: 'pixel-8a', name: 'Pixel 8a', group: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', model: 'Pixel 8a' },
  ];

  /**
   * bezel: frame thickness; radius: outer corner; screenRadius: display corner;
   * statusBar: height of the system status bar in portrait.
   */
  const FRAMES = {
    island: { bezel: 11, radius: 57, screenRadius: 47, statusBar: 54, indicator: 'ios', safeBottom: 34, safeSide: 59 },
    notch: { bezel: 11, radius: 53, screenRadius: 43, statusBar: 47, indicator: 'ios', safeBottom: 34, safeSide: 47 },
    punch: { bezel: 8, radius: 40, screenRadius: 32, statusBar: 32, indicator: 'android', safeBottom: 0, safeSide: 32 },
    classic: { bezel: 15, bezelLong: 74, radius: 54, screenRadius: 0, statusBar: 20, indicator: null, safeBottom: 0, safeSide: 0 },
    tablet: { bezel: 20, radius: 38, screenRadius: 18, statusBar: 24, indicator: 'ios', safeBottom: 20, safeSide: 0 },
  };

  // Front housing values are visual approximations in CSS pixels.
  const HOUSINGS = {
    'iphone-12-mini': { bezel: 12, radius: 48, screenRadius: 36 },
    'iphone-13-mini': { bezel: 11, radius: 48, screenRadius: 37 },
    'iphone-14-pro': { bezel: 12, radius: 59, screenRadius: 47 },
    'iphone-14-pro-max': { bezel: 12, radius: 62, screenRadius: 50 },
    'iphone-15': { bezel: 12, radius: 58, screenRadius: 46 },
    'iphone-15-plus': { bezel: 12, radius: 62, screenRadius: 50 },
    'iphone-16': { bezel: 11, radius: 58, screenRadius: 47 },
    'iphone-16-plus': { bezel: 11, radius: 62, screenRadius: 51 },
    'galaxy-s23': { bezel: 8, radius: 35, screenRadius: 27 },
    'galaxy-s23-plus': { bezel: 8, radius: 36, screenRadius: 28 },
    'galaxy-s24-plus': { bezel: 7, radius: 36, screenRadius: 29 },
    'galaxy-a71': { bezel: 9, radius: 35, screenRadius: 26, chin: 4 },
    'pixel-7': { bezel: 9, radius: 34, screenRadius: 25, chin: 2 },
    'pixel-7a': { bezel: 12, radius: 35, screenRadius: 23, chin: 4 },
    'pixel-8a': { bezel: 12, radius: 54, screenRadius: 42, chin: 3 },
    'iphone-16-pro': { bezel: 9, radius: 59, screenRadius: 50 },
    'iphone-16-pro-max': { bezel: 9, radius: 62, screenRadius: 53 },
    'iphone-15-pro-max': { radius: 61, screenRadius: 50 },
    'galaxy-s24': { bezel: 7, radius: 34, screenRadius: 27 },
    'galaxy-s24-ultra': { bezel: 7, radius: 17, screenRadius: 10 },
    'galaxy-a51': { radius: 34, screenRadius: 26, chin: 3 },
    'redmi-note-13': { bezel: 7, radius: 32, screenRadius: 25, chin: 2 },
    'pixel-8': { radius: 52, screenRadius: 44, chin: 1 },
    'galaxy-z-fold5': { radius: 25, screenRadius: 17, hinge: 9 },
    'ipad-air': { bezel: 17, radius: 42, screenRadius: 25 },
    'galaxy-tab-s9': { bezel: 16, radius: 32, screenRadius: 16 },
  };

  function categoryOf(preset) {
    const id = preset.id;
    if (preset.custom) return { brand: 'custom', family: 'custom' };
    if (id.startsWith('iphone-')) {
      const generation = id.match(/^iphone-(12|13|14|15|16)(?:-|$)/);
      return { brand: 'Apple', family: generation ? 'iPhone ' + generation[1] : 'iPhone SE' };
    }
    if (id.startsWith('ipad-')) return { brand: 'Apple', family: 'iPad' };
    if (id.startsWith('galaxy-')) {
      const series = { s: 'Galaxy S', a: 'Galaxy A', z: 'Galaxy Z', t: 'Galaxy Tab' };
      return { brand: 'Samsung', family: series[id.charAt(7)] || 'Galaxy' };
    }
    if (id.startsWith('pixel-')) return { brand: 'Google', family: 'Pixel ' + id.charAt(6) };
    return { brand: 'Xiaomi', family: 'Redmi' };
  }

  function platformOf(preset) {
    if (preset.platform) return preset.platform;
    return preset.group === 'android' ? 'android' : 'ios';
  }

  function userAgentFor(preset, chromeMajor) {
    const platform = platformOf(preset);
    const tablet = preset.frame === 'tablet';
    if (platform === 'ios') {
      const kind = tablet ? 'iPad; CPU OS 18_6' : 'iPhone; CPU iPhone OS 18_6';
      return {
        userAgent: `Mozilla/5.0 (${kind} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1`,
        platform: tablet ? 'iPad' : 'iPhone',
        metadata: null,
      };
    }
    const major = String(chromeMajor || '140');
    return {
      userAgent: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 ${tablet ? '' : 'Mobile '}Safari/537.36`,
      platform: 'Linux armv8l',
      metadata: {
        brands: [
          { brand: 'Chromium', version: major },
          { brand: 'Google Chrome', version: major },
          { brand: 'Not?A_Brand', version: '99' },
        ],
        fullVersion: `${major}.0.0.0`,
        platform: 'Android',
        platformVersion: '14.0.0',
        architecture: '',
        model: preset.model || '',
        mobile: !tablet,
      },
    };
  }

  /**
   * Geometry for a device in a given orientation.
   * sw/sh: full screen size; vw/vh: viewport the page actually gets.
   */
  function geometry(preset, { landscape = false, statusBar = true, frame = true } = {}) {
    const f = FRAMES[preset.frame] || FRAMES.punch;
    const housing = HOUSINGS[preset.id] || {};
    const wideNotch = preset.id.startsWith('iphone-12');
    const bezel = housing.bezel ?? f.bezel;
    const sw = landscape ? preset.h : preset.w;
    const sh = landscape ? preset.w : preset.h;
    const isTablet = preset.frame === 'tablet';

    let sb = 0;
    if (frame && statusBar) sb = landscape && !isTablet ? 0 : f.statusBar;

    let bt = bezel; let bb = bezel; let bl = bezel; let br = bezel;
    if (preset.frame === 'classic') {
      if (landscape) { bl = f.bezelLong; br = f.bezelLong; } else { bt = f.bezelLong; bb = f.bezelLong; }
    }
    if (landscape) {
      br += housing.chin || 0;
      bb += housing.hinge || 0;
    } else {
      bb += housing.chin || 0;
      bl += housing.hinge || 0;
    }
    if (!frame) { bt = 0; bb = 0; bl = 0; br = 0; }

    // Safe-area insets only matter for pages that opt in with viewport-fit=cover.
    const safeArea = { top: 0, bottom: 0, left: 0, right: 0 };
    if (frame) {
      if (landscape && !isTablet) {
        safeArea.left = f.safeSide;
        safeArea.right = preset.frame === 'punch' ? 0 : f.safeSide;
        safeArea.bottom = f.indicator === 'ios' ? 21 : 0;
      } else {
        safeArea.top = sb ? 0 : f.statusBar;
        safeArea.bottom = f.safeBottom;
      }
    }

    return {
      sw, sh, sb,
      wideNotch,
      vw: sw,
      vh: sh - sb,
      bt, bb, bl, br,
      frameW: sw + bl + br,
      frameH: sh + bt + bb,
      radius: frame ? (housing.radius ?? f.radius) : 10,
      screenRadius: frame ? (housing.screenRadius ?? f.screenRadius) : 10,
      indicator: frame && f.indicator ? platformOf(preset) : null,
      safeArea,
    };
  }

  function makeCustom({ name, w, h, dpr, platform, kind }) {
    const id = `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const tablet = kind === 'tablet';
    return {
      id,
      name: name || `${w}×${h}`,
      group: 'custom',
      platform,
      w, h, dpr,
      frame: tablet ? 'tablet' : (platform === 'ios' ? 'island' : 'punch'),
      custom: true,
    };
  }

  window.MP = window.MP || {};
  window.MP.devices = { PRESETS, FRAMES, categoryOf, geometry, userAgentFor, platformOf, makeCustom };
})();
