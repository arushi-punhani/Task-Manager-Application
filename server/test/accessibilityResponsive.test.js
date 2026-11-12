'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('responsive styles target 360px minimum and keyboard focus remains visible', () => {
  const css = read('client/src/styles/global.css');
  const dashboardCss = read('client/src/pages/Dashboard.css');
  assert.match(css, /html\s*\{[^}]*min-width:\s*360px/s);
  assert.match(css, /body\s*\{[^}]*min-width:\s*360px/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)/);
  assert.match(dashboardCss, /@media\s*\(max-width:\s*820px\)/);
  assert.match(dashboardCss, /@media\s*\(max-width:\s*480px\)/);
});

test('skip navigation and primary navigation landmark are implemented in application shell', () => {
  const app = read('client/src/App.jsx');
  const css = read('client/src/styles/global.css');
  assert.match(app, /<a\s+className="skip-link"\s+href="#main-content">Skip to main content<\/a>/);
  assert.match(app, /aria-label="Primary navigation"/);
  assert.match(app, /<main\s+id="main-content"/);
  assert.match(css, /\.skip-link\s*\{/);
  assert.match(css, /\.skip-link:focus\s*\{/);
});

test('login inputs expose accessible labels and feedback', () => {
  const login = read('client/src/pages/Login.jsx');
  assert.match(login, /htmlFor="login-email"/);
  assert.match(login, /id="login-email"/);
  assert.match(login, /htmlFor="login-password"/);
  assert.match(login, /id="login-password"/);
  assert.match(login, /role="alert"/);
});

test('dashboard exposes accessible names, live regions, and alert feedback', () => {
  const dashboard = read('client/src/pages/Dashboard.jsx');
  assert.match(dashboard, /Export tasks \(CSV\)/);
  assert.match(dashboard, /aria-live="polite"/);
  assert.match(dashboard, /role="alert"/);
  assert.match(dashboard, /aria-busy/);
});

test('key interface text colour pairs meet WCAG AA normal-text contrast (4.5:1)', () => {
  const luminance = (hex) => {
    const rgb = hex.match(/[a-f0-9]{2}/gi).map((value) => parseInt(value, 16) / 255);
    const linear = rgb.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const ratio = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  const dashboardCss = read('client/src/pages/Dashboard.css');
  assert.match(dashboardCss, /\.dashboard-note\s*\{[^}]*color:\s*#5f6b7d/s);
  assert.ok(ratio('#5f6b7d', '#f6f8fb') >= 4.5);
  assert.ok(ratio('#64748b', '#ffffff') >= 4.5);
  assert.ok(ratio('#596579', '#ffffff') >= 4.5);
  assert.ok(ratio('#7f1d1d', '#fef2f2') >= 4.5);
  assert.ok(ratio('#14532d', '#f0fdf4') >= 4.5);
});
