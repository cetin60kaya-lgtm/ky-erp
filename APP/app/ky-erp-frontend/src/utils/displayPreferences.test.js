import assert from "node:assert/strict";
import test from "node:test";
import {
  detectRecommendedMode,
  detectRecommendedScale,
  resolveDisplayState,
  sanitizeDisplayPreferences,
} from "./displayPreferences.js";

test("display preference girdileri guvenli hale gelir", () => {
  assert.deepEqual(sanitizeDisplayPreferences({ mode: "tablet", scale: 110 }), { mode: "tablet", scale: 110 });
  assert.deepEqual(sanitizeDisplayPreferences({ mode: "tv", scale: 77 }), { mode: "auto", scale: "auto" });
});

test("otomatik mod telefon tablet ve PC ayrimini yapar", () => {
  assert.equal(detectRecommendedMode({ width: 390, height: 844, coarsePointer: true, maxTouchPoints: 5 }), "phone");
  assert.equal(detectRecommendedMode({ width: 1280, height: 800, coarsePointer: true, maxTouchPoints: 10 }), "tablet");
  assert.equal(detectRecommendedMode({ width: 1920, height: 1080, coarsePointer: false, maxTouchPoints: 0 }), "pc");
});

test("2K 1x Windows ekranda onerilen olcek 110 olur", () => {
  assert.equal(detectRecommendedScale({ width: 2560, devicePixelRatio: 1 }, "pc"), 110);
  assert.equal(detectRecommendedScale({ width: 2048, devicePixelRatio: 1.25 }, "pc"), 100);
  assert.equal(detectRecommendedScale({ width: 1280, devicePixelRatio: 1 }, "tablet"), 100);
});

test("manuel mod ve manuel olcek otomatik algilamayi ezer", () => {
  const state = resolveDisplayState(
    { mode: "phone", scale: 90 },
    { width: 1920, height: 1080, devicePixelRatio: 1, coarsePointer: false },
  );
  assert.equal(state.recommendedMode, "pc");
  assert.equal(state.effectiveMode, "phone");
  assert.equal(state.effectiveScale, 90);
});
