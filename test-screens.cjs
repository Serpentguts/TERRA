"use strict";
// Test-only helper. TERRA shows one screen at a time, but most browser suites exercise
// controls across the whole app. Before each user action, open the screen that holds the
// target control, as a person would by tapping its tab. Navigation itself is covered by
// test-view-stack-browser.cjs, which does not load this helper.
const playwright = require("playwright");

const PAGE_ACTIONS = ["click", "dblclick", "tap", "fill", "type", "press", "check", "uncheck", "selectOption", "setInputFiles", "focus", "hover"];
// Reading a control's text also opens its screen, as a person would to read it.
const LOCATOR_ACTIONS = [...PAGE_ACTIONS, "pressSequentially", "selectText", "setChecked", "clear", "textContent", "innerText"];
const reveal = elements => elements.forEach(element => { if (typeof TerraScreens !== "undefined") TerraScreens.reveal(element); });
// Visibility checks open the screen too, except for screens themselves, whose visibility is the point.
const revealContent = elements => elements.forEach(element => {
  if (typeof TerraScreens !== "undefined" && !element.matches("[data-screen]")) TerraScreens.reveal(element);
});
// Role locators skip hidden elements, and other screens are hidden, so also look there.
const includeHidden = locator => typeof locator._selector === "string" && locator._frame
  ? locator._frame.locator(locator._selector.replace(/internal:role=([a-z]+)(?!\[include-hidden\])/g, "internal:role=$1[include-hidden]"))
  : locator;

function patch(page) {
  const pageProto = Object.getPrototypeOf(page);
  if (pageProto.__terraScreens) return;
  pageProto.__terraScreens = true;
  for (const name of PAGE_ACTIONS) {
    const original = pageProto[name];
    if (typeof original !== "function") continue;
    pageProto[name] = async function (selector, ...rest) {
      if (typeof selector === "string") await this.$$eval(selector, reveal).catch(() => {});
      return original.call(this, selector, ...rest);
    };
  }
  for (const name of ["isVisible", "isHidden"]) {
    const original = pageProto[name];
    pageProto[name] = async function (selector, ...rest) {
      if (typeof selector === "string") await this.$$eval(selector, revealContent).catch(() => {});
      return original.call(this, selector, ...rest);
    };
  }
  const locatorProto = Object.getPrototypeOf(page.locator("body"));
  const wrap = (names, fn) => {
    for (const name of names) {
      const original = locatorProto[name];
      if (typeof original !== "function") continue;
      locatorProto[name] = async function (...args) {
        await includeHidden(this).evaluateAll(fn).catch(() => {});
        return original.apply(this, args);
      };
    }
  };
  wrap(LOCATOR_ACTIONS, reveal);
  wrap(["isVisible", "isHidden"], revealContent);
}

const launch = playwright.chromium.launch.bind(playwright.chromium);
playwright.chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const page = await browser.newPage();
  patch(page);
  await page.close();
  return browser;
};
