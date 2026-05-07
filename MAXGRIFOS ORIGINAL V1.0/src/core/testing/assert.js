/**
 * Assert Library - Utilidades mínimas para tests
 */

export const assert = {
  assertTrue(val, msg) {
    if (val !== true) throw new Error(msg || `Expected true, got ${val}`);
  },
  assertEqual(actual, expected, msg) {
    if (actual !== expected) throw new Error(msg || `Expected ${expected}, got ${actual}`);
  },
  assertDefined(val, msg) {
    if (val === undefined || val === null) throw new Error(msg || `Expected defined, got ${val}`);
  },
  assertNoDuplicates(list, msg) {
    const set = new Set(list);
    if (set.size !== list.length) throw new Error(msg || `Duplicates found in list`);
  },
  assertThrows(fn, msg) {
    try {
      fn();
      throw new Error(msg || "Expected function to throw, but it didn't");
    } catch (e) {
      if (e.message === (msg || "Expected function to throw, but it didn't")) throw e;
      return true;
    }
  }
};

export default assert;
