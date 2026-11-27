/* Device catalogue and frame geometry. All sizes are CSS pixels. */
(function () {
  'use strict';

  const PRESETS = [
    { id: 'iphone-se', name: 'iPhone SE', group: 'ios', w: 375, h: 667, dpr: 2, frame: 'classic' },
    { id: 'iphone-13', name: 'iPhone 13 / 14', group: 'ios', w: 390, h: 844, dpr: 3, frame: 'notch' },
    { id: 'iphone-15-pro', name: 'iPhone 15 Pro', group: 'ios', w: 393, h: 852, dpr: 3, frame: 'island' },
    { id: 'iphone-16-pro', name: 'iPhone 16 Pro', group: 'ios', w: 402, h: 874, dpr: 3, frame: 'island' },
    { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', group: 'ios', w: 430, h: 932, dpr: 3, frame: 'island' },
    { id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', group: 'ios', w: 440, h: 956, dpr: 3, frame: 'island' },

    { id: 'galaxy-s24', name: 'Galaxy S24', group: 'android', w: 360, h: 780, dpr: 3, frame: 'punch', model: 'SM-S921B' },
    { id: 'galaxy-s24-ultra', name: 'Galaxy S24 Ultra', group: 'android', w: 384, h: 832, dpr: 3.75, frame: 'punch', model: 'SM-S928B' },
    { id: 'galaxy-a51', name: 'Galaxy A51 / A71', group: 'android', w: 412, h: 914, dpr: 2.625, frame: 'punch', model: 'SM-A515F' },
    { id: 'redmi-note-13', name: 'Redmi Note 13', group: 'android', w: 393, h: 873, dpr: 2.75, frame: 'punch', model: 'Redmi Note 13' },
    { id: 'pixel-8', name: 'Pixel 8', group: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', model: 'Pixel 8' },
    { id: 'galaxy-z-fold5', name: 'Galaxy Z Fold5', group: 'android', w: 344, h: 882, dpr: 2.625, frame: 'punch', model: 'SM-F946B' },

    { id: 'ipad-mini', name: 'iPad mini', group: 'tablet', platform: 'ios', w: 744, h: 1133, dpr: 2, frame: 'tablet' },
    { id: 'ipad-air', name: 'iPad Air 11″', group: 'tablet', platform: 'ios', w: 820, h: 1180, dpr: 2, frame: 'tablet' },
    { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9', group: 'tablet', platform: 'android', w: 800, h: 1280, dpr: 2, frame: 'tablet', model: 'SM-X710' },
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
    const sw = landscape ? preset.h : preset.w;
    const sh = landscape ? preset.w : preset.h;
    const isTablet = preset.frame === 'tablet';

    let sb = 0;
    if (frame && statusBar) sb = landscape && !isTablet ? 0 : f.statusBar;

    let bt = f.bezel; let bb = f.bezel; let bl = f.bezel; let br = f.bezel;
    if (preset.frame === 'classic') {
      if (landscape) { bl = f.bezelLong; br = f.bezelLong; } else { bt = f.bezelLong; bb = f.bezelLong; }
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
      vw: sw,
      vh: sh - sb,
      bt, bb, bl, br,
      frameW: sw + bl + br,
      frameH: sh + bt + bb,
      radius: frame ? f.radius : 10,
      screenRadius: frame ? f.screenRadius : 10,
      indicator: frame ? f.indicator : null,
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
  window.MP.devices = { PRESETS, FRAMES, geometry, userAgentFor, platformOf, makeCustom };
})();
