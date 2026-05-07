import { SEED_DATA } from '../src/mock/maxgrifos-seed-data.js';
import { SeedValidator } from '../src/core/seed/seed-validator.js';

function validate() {
  console.log(">>> Validating Seed Data Integrity...");
  const result = SeedValidator.validate(SEED_DATA);
  
  if (result.valid) {
    console.log("  [PASS] Seed data is valid and deterministic.");
    process.exit(0);
  } else {
    console.error("  [FAIL] Seed data invalid:");
    result.findings.forEach(f => console.error(`    - ${f}`));
    process.exit(1);
  }
}

validate();
