/**
 * Proves the bank moves by exactly what the results sheet claims.
 *
 * A play test finished a run, read "+250" on the summary, then found ten thousand in the
 * Workshop. The arithmetic was correct — contracts had completed and paid several thousand
 * silently, on top of a balance that was already there — but nothing on screen said so, which
 * is indistinguishable from a bug and rightly reported as one.
 *
 * This asserts the invariant the display now relies on: every credit is itemised, and the
 * items sum to the change in the bank.
 */
import {
  CONTRACTS,
  contractById,
  loadSave,
  scrapFromScore,
  settleContracts,
  type SaveData,
  type ScrapCredit,
} from "../src/game/progression";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function freshSave(): SaveData {
  const s = loadSave();
  s.scrap = 9000; // a player who has been playing a while
  s.contracts = [];
  return s;
}

console.log("Scrap credit checks\n");

// Force a contract that this run will complete, so the payout is guaranteed.
const finish = contractById("finish")!;
const save = freshSave();
save.contracts = [{ id: "finish", progress: finish.target - 1 }];

const before = save.scrap;
const credits: ScrapCredit[] = [];

const score = 2500;
const banked = scrapFromScore(score, false);
save.scrap += banked;
credits.push({ label: "Run haul", amount: banked });

credits.push(
  ...settleContracts(save, {
    score,
    banked,
    won: true,
    absorbed: 5,
    collected: 40,
    pressEaten: 0,
    actions: 12,
    maxCombo: 20,
    hits: 1,
  }),
);

const itemised = credits.reduce((a, c) => a + c.amount, 0);
const actual = save.scrap - before;

check("the run haul is itemised", credits.some((c) => c.label === "Run haul"));
check(
  "the contract payout is itemised too",
  credits.length > 1,
  `only ${credits.length} credit(s); a completing contract paid nothing visible`,
);
check(
  "itemised credits equal the change in the bank",
  itemised === actual,
  `itemised ${itemised} vs actual ${actual}`,
);
check(
  "a completing contract dwarfs a modest run, which is why it must be shown",
  finish.reward > banked * 3,
  `${finish.reward} vs ${banked}`,
);
check(
  "completed contracts are replaced, not left finished",
  save.contracts.length === 3 && save.contracts.every((a) => {
    const d = contractById(a.id);
    return d ? a.progress < d.target : false;
  }),
  `${save.contracts.length} active`,
);
check("every contract id resolves", CONTRACTS.every((c) => !!contractById(c.id)));

console.log(
  `\n  run of ${score} banked ${banked}, contracts paid ${itemised - banked}, bank ${before} -> ${save.scrap}`,
);
console.log(failures === 0 ? "\nCredits reconcile." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
