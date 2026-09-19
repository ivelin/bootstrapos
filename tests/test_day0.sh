#!/bin/sh
# Day-0 checks for the Bootstrap OS template: blank state, schema, install
# refuse/copy, first-hour constitution links, and README adoption order.
# POSIX sh + python3 only. Exit 1 on any failure.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

pass=0
fail=0

ok() {
  pass=$((pass + 1))
  printf 'ok - %s\n' "$1"
}

not_ok() {
  fail=$((fail + 1))
  printf 'not ok - %s\n' "$1"
}

TMP=$(mktemp -d)
cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT INT HUP TERM

# --- a) blank state: where-are-we.py exits 0 and prints spoken Day 0 clocks ---
a_out="$TMP/where-are-we.out"
a_err="$TMP/where-are-we.err"
a_rc=0
python3 templates/company/state/where-are-we.py \
  templates/company/state/company-state.json \
  >"$a_out" 2>"$a_err" || a_rc=$?

if [ "$a_rc" -eq 0 ] \
  && grep -q 'JOURNEY' "$a_out" \
  && grep -q 'Write the bet' "$a_out" \
  && grep -q 'Ask' "$a_out"; then
  ok "where-are-we.py on blank state (Write the bet, Ask)"
else
  not_ok "where-are-we.py on blank state (exit $a_rc)"
fi

# --- b) incomplete JSON + schema next to it must fail ---
bad="$TMP/bad-state"
mkdir -p "$bad"
printf '%s\n' '{"version":1}' >"$bad/company-state.json"
cp templates/company/state/company-state.schema.json "$bad/company-state.schema.json"
b_rc=0
python3 templates/company/state/where-are-we.py "$bad/company-state.json" \
  >/dev/null 2>&1 || b_rc=$?
if [ "$b_rc" -ne 0 ]; then
  ok "where-are-we.py rejects JSON missing required fields"
else
  not_ok "where-are-we.py should fail on incomplete state"
fi

# --- c) install refuses the template repo and a lookalike ---
c1_rc=0
./scripts/install-instance.sh "$ROOT" >/dev/null 2>&1 || c1_rc=$?
if [ "$c1_rc" -ne 0 ]; then
  ok "install-instance.sh refuses template ROOT"
else
  not_ok "install-instance.sh must refuse template ROOT"
fi

lookalike="$TMP/lookalike"
mkdir -p "$lookalike/company-os" "$lookalike/templates/instance"
printf '%s\n' '# lookalike constitution' >"$lookalike/company-os/operating-system.md"
c2_rc=0
./scripts/install-instance.sh "$lookalike" >/dev/null 2>&1 || c2_rc=$?
if [ "$c2_rc" -ne 0 ]; then
  ok "install-instance.sh refuses lookalike template"
else
  not_ok "install-instance.sh must refuse lookalike template"
fi

# --- d) install into a blank company repo ---
company="$TMP/company"
mkdir -p "$company"
d_rc=0
./scripts/install-instance.sh "$company" >"$TMP/install.out" 2>"$TMP/install.err" || d_rc=$?
if [ "$d_rc" -eq 0 ]; then
  ok "install-instance.sh into blank company"
else
  not_ok "install-instance.sh into blank company (exit $d_rc)"
fi

assert_exists() {
  rel=$1
  if [ -f "$company/$rel" ]; then
    ok "installed $rel"
  else
    not_ok "missing $rel"
  fi
}

assert_exists docs/company-os/first-hour.md
assert_exists docs/company-os/applied-here.md
assert_exists company/state/company-state.json
assert_exists company/state/company-state.schema.json
assert_exists company/state/where-are-we.py
assert_exists research/icps/TEMPLATE.md
assert_exists traces/decisions/TEMPLATE.md
assert_exists docs/company-os/instance/snapshots/TEMPLATE.md
assert_exists product/READY_FOR_HUMAN_EYES.md
assert_exists AGENTS.md
assert_exists .grok/workflows/README.md
assert_exists .grok/workflows/user-research.rhai
assert_exists .grok/workflows/company-operating-loop.rhai
assert_exists .grok/workflows/ready-for-human-eyes.rhai

if [ -f "$company/AGENTS.md" ] \
  && { grep -q 'Never advance a journey phase without' "$company/AGENTS.md" \
    || grep -q '<!-- bootstrap-os-ai-instructions -->' "$company/AGENTS.md"; }; then
  ok "AGENTS.md has hard-rule text or marker"
else
  not_ok "AGENTS.md missing hard-rule text and marker"
fi

w_rc=0
python3 "$company/company/state/where-are-we.py" >/dev/null 2>&1 || w_rc=$?
if [ "$w_rc" -eq 0 ]; then
  ok "installed where-are-we.py exits 0"
else
  not_ok "installed where-are-we.py (exit $w_rc)"
fi

# --- e) first-hour constitution links are GitHub blob URLs, not siblings ---
fh=company-os/first-hour.md
if [ -f "$fh" ] && grep -q 'https://github.com/ivelin/bootstrap' "$fh"; then
  ok "first-hour.md links to github.com/ivelin/bootstrap"
else
  not_ok "first-hour.md must contain https://github.com/ivelin/bootstrap"
fi

if grep -q '](operating-system.md)' "$fh" \
  || grep -q '](live-runtime.md)' "$fh" \
  || grep -q '](ai-instructions.md)' "$fh"; then
  not_ok "first-hour.md has sibling-only constitution links"
else
  ok "first-hour.md has no sibling-only constitution links"
fi

# --- f) README adoption order + hosted MCP honesty ---
if grep -q 'How to use this (pick one)' README.md; then
  ok "README has How to use this (pick one)"
else
  not_ok "README missing How to use this (pick one)"
fi

if grep -q '### 1. Point an AI at this pack' README.md; then
  ok "README has ### 1. Point an AI at this pack"
else
  not_ok "README missing ### 1. Point an AI at this pack"
fi

# "Point an AI" must appear before the install-script invocation.
if awk '
  /Point an AI/ { seen = 1 }
  /\.\/scripts\/install-instance\.sh/ {
    if (seen) exit 0
    exit 1
  }
  END { if (!seen) exit 1 }
' README.md; then
  ok "README: Point an AI appears before ./scripts/install-instance.sh"
else
  not_ok "README: Point an AI must appear before ./scripts/install-instance.sh"
fi

if grep -qi 'not mentee-ready' README.md \
  && grep -q 'plugin/' README.md \
  && grep -q 'Path 1 stays' README.md \
  && grep -q 'vercel.app' README.md \
  && ! grep -q 'https://mcp.pirin.ai' README.md; then
  ok "README hosted MCP honesty (preview vercel.app, not mentee-ready, not pirin.ai)"
else
  not_ok "README must stay honest: preview vercel.app host, not mentee-ready boards, not pirin.ai"
fi

# --- g) evidence-label refinements (stated / synthetic / observed) ---
if grep -q 'none yet' company-os/first-hour.md \
  && grep -q 'stated' company-os/first-hour.md; then
  ok "first-hour.md has none yet and stated"
else
  not_ok "first-hour.md must contain none yet and stated"
fi

if grep -q 'Stated evidence' templates/research/icps/TEMPLATE.md \
  && grep -q 'Observed evidence' templates/research/icps/TEMPLATE.md; then
  ok "icps TEMPLATE has Stated evidence and Observed evidence"
else
  not_ok "icps TEMPLATE must contain Stated evidence and Observed evidence"
fi

if grep -q 'When they disagree, observed wins' company-os/operating-system.md \
  || grep -q 'observed wins' company-os/operating-system.md; then
  ok "operating-system.md has observed wins"
else
  not_ok "operating-system.md must contain observed wins"
fi

if grep -q 'stated, synthetic, and observed' company-os/ai-instructions.md; then
  ok "ai-instructions.md has stated, synthetic, and observed"
else
  not_ok "ai-instructions.md must contain stated, synthetic, and observed"
fi

if grep -q 'stated | synthetic | observed' templates/traces/decisions/TEMPLATE.md; then
  ok "decisions TEMPLATE has stated | synthetic | observed"
else
  not_ok "decisions TEMPLATE must contain stated | synthetic | observed"
fi

# --- h) evidence-method locks (no naked 1-5/dollar WTP; variance/drift; new category) ---
if grep -q '1–5' company-os/first-hour.md \
  && grep -q 'then map' company-os/first-hour.md \
  && grep -q 'too uniform' company-os/first-hour.md \
  && grep -q 'New-category' company-os/first-hour.md; then
  ok "first-hour.md has no 1-5/naked-dollar, then map, too uniform, New-category"
else
  not_ok "first-hour.md must lock no 1-5/naked-dollar, then map, too uniform, New-category"
fi

if grep -q '1–5' company-os/operating-system.md \
  && grep -q 'then map' company-os/operating-system.md \
  && grep -q 'too-tight variance' company-os/operating-system.md \
  && grep -q 'unusable' company-os/operating-system.md \
  && grep -q 'new category' company-os/operating-system.md; then
  ok "operating-system.md has no 1-5/naked-dollar, too-tight variance, unusable, new category"
else
  not_ok "operating-system.md must lock no 1-5/naked-dollar, too-tight variance, unusable, new category"
fi

if grep -q 'then map' templates/research/icps/TEMPLATE.md \
  && grep -q 'too-tight variance' templates/research/icps/TEMPLATE.md \
  && grep -q 'unusable' templates/research/icps/TEMPLATE.md \
  && grep -q 'New category' templates/research/icps/TEMPLATE.md; then
  ok "icps TEMPLATE has then map, too-tight variance, unusable, New category"
else
  not_ok "icps TEMPLATE must lock then map, too-tight variance, unusable, New category"
fi

if grep -q 'Likert' company-os/ai-instructions.md \
  && grep -q 'then map' company-os/ai-instructions.md \
  && grep -q 'discard that pass' company-os/ai-instructions.md \
  && grep -q 'new category' company-os/ai-instructions.md; then
  ok "ai-instructions.md has Likert, then map, discard that pass, new category"
else
  not_ok "ai-instructions.md must lock Likert, then map, discard that pass, new category"
fi

if grep -q '1–5' company-os/live-runtime.md \
  && grep -q 'then map' company-os/live-runtime.md \
  && grep -q 'Too-tight variance' company-os/live-runtime.md \
  && grep -q 'unusable' company-os/live-runtime.md \
  && grep -q 'New category' company-os/live-runtime.md; then
  ok "live-runtime.md has no 1-5/naked-dollar, then map, Too-tight variance, unusable, New category"
else
  not_ok "live-runtime.md must lock no 1-5/naked-dollar, then map, Too-tight variance, unusable, New category"
fi


# --- i) optional Grok Build workflows (portable, de-productized) ---
wf=.grok/workflows
if [ -f "$wf/user-research.rhai" ]; then
  ok "user-research.rhai exists"
else
  not_ok "user-research.rhai missing"
fi
if [ -f "$wf/user-research.rhai" ] \
  && grep -q 'none yet' "$wf/user-research.rhai" \
  && { grep -q 'forced choice' "$wf/user-research.rhai" || grep -q 'forced_choice' "$wf/user-research.rhai"; } \
  && { grep -q '1–5' "$wf/user-research.rhai" || grep -q 'Likert' "$wf/user-research.rhai"; } \
  && { grep -q 'too-tight' "$wf/user-research.rhai" || grep -q 'too tight' "$wf/user-research.rhai"; } \
  && grep -q 'new category' "$wf/user-research.rhai"; then
  ok "user-research.rhai has none yet, forced choice, 1-5/Likert, too-tight, new category"
else
  not_ok "user-research.rhai missing required research-method phrases"
fi
if [ -f "$wf/user-research.rhai" ] \
  && ! grep -q 'Totbox' "$wf/user-research.rhai" \
  && ! grep -q 'hvac_cleaning' "$wf/user-research.rhai"; then
  ok "user-research.rhai has no baked product ids"
else
  not_ok "user-research.rhai must not contain baked product ids"
fi

if [ -f "$wf/user-research.rhai" ] && ! grep -q 'npm run company-os' "$wf/user-research.rhai"; then
  ok "user-research.rhai has no old cli invocation"
else
  not_ok "user-research.rhai must not contain old cli invocation"
fi
if [ -f "$wf/company-operating-loop.rhai" ] && grep -q 'where-are-we.py' "$wf/company-operating-loop.rhai" && ! grep -q 'npm run company-os' "$wf/company-operating-loop.rhai"; then
  ok "company-operating-loop.rhai uses where-are-we.py and has no old cli"
else
  not_ok "company-operating-loop.rhai must exist, mention where-are-we.py, omit old cli"
fi
if [ -f "$wf/ready-for-human-eyes.rhai" ] && ! grep -q 'npm run company-os' "$wf/ready-for-human-eyes.rhai"; then
  ok "ready-for-human-eyes.rhai exists and has no old cli"
else
  not_ok "ready-for-human-eyes.rhai must exist and omit old cli"
fi


# --- j) honesty pass (house rules labeled; sources vintage; no paper-backed overclaim) ---
if grep -q 'House rule' company-os/operating-system.md \
  && grep -q 'epistemology' company-os/operating-system.md; then
  ok "operating-system.md labels house/epistemology"
else
  not_ok "operating-system.md must label house/epistemology"
fi
if grep -q 'Bisbee' company-os/operating-system.md \
  && grep -q 'Brand' company-os/operating-system.md \
  && grep -q '§3.3' company-os/operating-system.md; then
  ok "operating-system.md has Bisbee + Brand §3.3 sources note"
else
  not_ok "operating-system.md must cite Bisbee and Brand §3.3 as load-bearing"
fi
if grep -q '# --- h) evidence-method locks' tests/test_day0.sh; then
  ok "test_day0.sh section h is evidence-method locks"
else
  not_ok "test_day0.sh section h must be evidence-method locks"
fi
if grep -q '2.8.2' company-os/operating-system.md \
  && grep -q '2.8.2' README.md; then
  ok "changelog still records 2.8.2"
else
  not_ok "OS and README must still record 2.8.2"
fi


# --- k) demo-only role-play house rule ---
if grep -q 'demographic one-liner' company-os/operating-system.md \
  && grep -q 'Demo-only role-play' company-os/operating-system.md \
  && grep -q 'demographic one-liner' company-os/first-hour.md \
  && grep -q 'demographic one-liner' company-os/ai-instructions.md \
  && grep -q 'demographic one-liner' company-os/live-runtime.md; then
  ok "demo-only role-play house rule in OS, first-hour, ai-instructions, live-runtime"
else
  not_ok "demo-only role-play house rule missing"
fi
if grep -q 'demographic one-liner' .grok/workflows/user-research.rhai \
  && grep -q 'Demo-only role-play' .grok/workflows/user-research.rhai; then
  ok "user-research.rhai has demo-only role-play house rule"
else
  not_ok "user-research.rhai must have demo-only role-play house rule"
fi
if ! grep -qi 'Aaru\|Simile\|Verasight\|Electric Twin' company-os/operating-system.md \
  company-os/first-hour.md company-os/ai-instructions.md company-os/live-runtime.md; then
  ok "no vendor names in constitution files"
else
  not_ok "constitution must not name Aaru/Simile/Verasight/Electric Twin"
fi
if grep -q '2.8.3' company-os/operating-system.md && grep -q '2.8.3' README.md; then
  ok "changelog still records 2.8.3"
else
  not_ok "OS and README must still record 2.8.3"
fi

# --- l) founder-day pack is additive; stability contract ---
if grep -q 'Additive by default' company-os/operating-system.md \
  && grep -q 'Jobs do not replace cards' company-os/operating-system.md \
  && grep -q 'Founder-day pack' company-os/operating-system.md \
  && grep -q 'Skill-capture' company-os/operating-system.md \
  && grep -q 'Day tools are inputs' company-os/live-runtime.md \
  && grep -q 'Jobs are not employees' company-os/ai-instructions.md \
  && grep -q 'founder-day pack' company-os/first-hour.md; then
  ok "stability contract + additive founder-day / skill-capture / jobs"
else
  not_ok "v2.8.4 must stay additive: stability contract, cards stay, packs optional"
fi
if grep -q 'Additive, rarely breaking' README.md; then
  ok "README template policy is additive / rarely breaking"
else
  not_ok "README template policy must say additive, rarely breaking"
fi
if grep -q 'Overnight drafts after proof' company-os/operating-system.md; then
  ok "growth pack overnight drafts stay after proof"
else
  not_ok "growth pack must gate overnight drafts after proof"
fi
if grep -q 'Insight quality before posting cadence' company-os/operating-system.md \
  && grep -q 'content calendar' company-os/operating-system.md \
  && ! grep -qi 'nikitabier\|LoganTGott\|meme coin' company-os/operating-system.md \
    company-os/live-runtime.md company-os/ai-instructions.md; then
  ok "insight-quality rule is portable (no account/vendor folklore)"
else
  not_ok "growth pack must have portable insight-quality rule, no X-account folklore"
fi
if grep -q '2.8.5' company-os/operating-system.md && grep -q '2.8.5' README.md; then
  ok "changelog still records 2.8.5"
else
  not_ok "OS and README must still record 2.8.5"
fi

# --- m) several ideas allowed ---
if grep -q 'Several ideas are allowed' company-os/operating-system.md \
  && grep -q 'Do not hide a second idea' company-os/operating-system.md \
  && grep -q 'Rank and kill per board' company-os/operating-system.md \
  && grep -q 'more than one idea' company-os/first-hour.md; then
  ok "several-ideas house rule in OS and first-hour"
else
  not_ok "several-ideas house rule missing"
fi

# --- n) marketing volume cannot promote (OS 2.8.6) ---
# Full rule lives once in the OS section. Other files pin + link; do not reprint the essay.
if grep -q '2.8.6' company-os/operating-system.md \
  && grep -q 'v2.8.6' README.md \
  && grep -q '### House rule: marketing volume cannot promote' company-os/operating-system.md \
  && grep -q 'does not mean get a crowd looking' company-os/operating-system.md \
  && grep -q 'Text eight people' company-os/operating-system.md \
  && grep -q 'waitlist of 400' company-os/operating-system.md \
  && grep -q 'first three jobs by hand' company-os/operating-system.md; then
  ok "OS 2.8.6 constitution section has full rule, vocabulary, and examples"
else
  not_ok "operating-system.md must hold the full 2.8.6 house-rule section"
fi
if grep -q "Eyeballs aren't buyers" company-os/first-hour.md \
  && grep -q 'house-rule-marketing-volume-cannot-promote' company-os/first-hour.md \
  && grep -q 'https://github.com/ivelin/bootstrap' company-os/first-hour.md; then
  ok "first-hour keeps room line and links to OS section"
else
  not_ok "first-hour.md must keep the room line and link to the OS section"
fi
if grep -q 'marketing volume cannot promote' company-os/ai-instructions.md \
  && grep -q 'house-rule-marketing-volume-cannot-promote' company-os/ai-instructions.md \
  && grep -q 'house-rule-marketing-volume-cannot-promote' company-os/live-runtime.md \
  && grep -q 'house-rule-marketing-volume-cannot-promote' company-os/ready-for-human-eyes.md \
  && grep -q 'house-rule-marketing-volume-cannot-promote' README.md; then
  ok "pointers link to the OS house-rule section"
else
  not_ok "ai-instructions, live-runtime, ready-for-human-eyes, and README must link the OS section"
fi
if ! grep -q 'Text eight people' company-os/first-hour.md \
    company-os/ai-instructions.md company-os/live-runtime.md \
    company-os/ready-for-human-eyes.md README.md \
  && ! grep -q 'waitlist of 400' company-os/first-hour.md \
    company-os/ai-instructions.md company-os/live-runtime.md \
    company-os/ready-for-human-eyes.md README.md \
  && ! grep -q 'does not mean get a crowd looking' company-os/first-hour.md \
    company-os/ai-instructions.md company-os/live-runtime.md \
    company-os/ready-for-human-eyes.md README.md; then
  ok "essay and example table are not copied outside the OS section"
else
  not_ok "do not reprint the 2.8.6 essay or example rows outside operating-system.md"
fi
if ! grep -qi 'Arcads\|Product Hunt' company-os/operating-system.md \
  company-os/first-hour.md company-os/ai-instructions.md company-os/live-runtime.md \
  company-os/ready-for-human-eyes.md README.md; then
  ok "no vendor / required-launch-site names in constitution"
else
  not_ok "constitution must not name Arcads or Product Hunt"
fi
if grep -q 'Say it once. Link. No filler.' company-os/operating-system.md \
  && grep -q 'Dense leftover text is good' company-os/operating-system.md \
  && grep -q 'Additive by default' company-os/operating-system.md; then
  ok "stability contract has say-it-once writing rule"
else
  not_ok "operating-system.md stability contract must include Say it once. Link. No filler."
fi
if ! grep -q 'Dense leftover text is good' company-os/first-hour.md \
    company-os/ai-instructions.md company-os/live-runtime.md \
    company-os/ready-for-human-eyes.md README.md mcp/README.md mcp/QA.md; then
  ok "say-it-once writing rule is not copied outside the OS stability contract"
else
  not_ok "do not reprint the say-it-once writing rule outside operating-system.md"
fi

# --- o) starter legal templates (hyperlink only; not a house rule) ---
# Constitution holds the section + both canonical URLs. Do not require caveats elsewhere.
if grep -q '### Starter legal templates' company-os/operating-system.md \
  && grep -q 'https://github.com/General-Legal/legal-templates' company-os/operating-system.md \
  && grep -q 'https://general.legal/library' company-os/operating-system.md; then
  ok "OS starter legal templates section has both canonical URLs"
else
  not_ok "operating-system.md must have starter legal templates + both canonical URLs"
fi
if grep -q 'starter-legal-templates' README.md \
  && grep -q 'starter-legal-templates' company-os/ai-instructions.md; then
  ok "README and ai-instructions point at the OS starter-legal-templates section"
else
  not_ok "README and ai-instructions must hyperlink the OS starter-legal-templates section"
fi
if ! find . -name '*.docx' ! -path './.git/*' | grep -q .; then
  ok "no .docx legal templates copied into this repo"
else
  not_ok "do not copy legal .docx files into this repo"
fi

# --- p) cap-table modeler (hyperlink only; not a house rule) ---
# Constitution holds the section + home URLs + companion + CLI/skill path.
# Do not require caveats elsewhere. Do not claim 1984 MCP is live.
os=company-os/operating-system.md
if grep -q '### Cap-table modeler' "$os" \
  && grep -q 'https://startup-finance.1984.vc/' "$os" \
  && grep -q 'https://github.com/1984vc/cap-table' "$os"; then
  ok "OS cap-table modeler section has both home URLs"
else
  not_ok "operating-system.md must have cap-table modeler + both home URLs"
fi
if grep -q 'https://www.ycombinator.com/safe/calculator' "$os" \
  && grep -q 'what % does this one SAFE sell' "$os"; then
  ok "YC SAFE calculator companion is present (not a second modeler)"
else
  not_ok "operating-system.md must have the YC SAFE calculator companion"
fi
if grep -q 'https://www.ycombinator.com/documents/' "$os"; then
  ok "YC SAFE instruments stay at the existing YC documents pointer"
else
  not_ok "keep https://www.ycombinator.com/documents/ at the existing instruments pointer"
fi
if grep -q 'npx skills add 1984vc/cap-table' "$os" \
  && grep -q 'npx @1984vc/cap-table' "$os" \
  && grep -q 'CLI/skill only' "$os"; then
  ok "agent path is CLI/skill only"
else
  not_ok "operating-system.md must pin npx skills add 1984vc/cap-table then npx @1984vc/cap-table"
fi
if ! grep -q 'startup-finance.1984.vc/mcp' "$os" README.md company-os/ai-instructions.md \
  && ! grep -qi '1984 MCP is live' "$os" README.md company-os/ai-instructions.md; then
  ok "do not claim 1984 MCP is live"
else
  not_ok "do not claim 1984 MCP is live or link startup-finance.1984.vc/mcp"
fi
if grep -q 'cap-table-modeler' README.md \
  && grep -q 'cap-table-modeler' company-os/ai-instructions.md; then
  ok "README and ai-instructions point at the OS cap-table-modeler section"
else
  not_ok "README and ai-instructions must hyperlink the OS cap-table-modeler section"
fi
if ! grep -q 'cap-table-modeler' company-os/first-hour.md \
  && ! grep -q 'startup-finance.1984.vc' company-os/first-hour.md \
  && ! grep -q '1984vc/cap-table' company-os/first-hour.md; then
  ok "first-hour.md stays out of the cap-table pointer"
else
  not_ok "first-hour.md must stay out (Day 0 is thesis/ICP)"
fi
if ! find . -path './.git' -prune -o -path '*/node_modules/*' -prune -o \
    -type d -name 'cap-table' -print | grep -q .; then
  ok "no 1984vc cap-table repo copied into this tree"
else
  not_ok "do not copy the 1984vc cap-table repo into this tree"
fi
cap_sec=$(sed -n '/^### Cap-table modeler$/,/^## Sources/p' "$os")
if ! printf '%s\n' "$cap_sec" | grep -Ei 'AngelList|Foundily|FoundStep|OpenCap|Eqvista|captable\.io' \
  && ! printf '%s\n' "$cap_sec" | grep -E '[^A-Za-z]Cake[^A-Za-z]|^Cake' \
  && ! printf '%s\n' "$cap_sec" | grep -E '\[[^]]*(Carta|Pulley)[^]]*\]\(' ; then
  ok "forbidden products are not listed as modelers"
else
  not_ok "do not list Carta, Pulley, AngelList, Foundily, FoundStep, OpenCap, Eqvista, Cake, or captable.io as modelers"
fi

# --- q) a security program cannot promote (OS 2.8.7) ---
# Constitution + first-hour / ai-instructions pointers. Do not require the essay elsewhere.
if grep -q '2.8.7' company-os/operating-system.md \
  && grep -q '### House rule: a security program cannot promote' company-os/operating-system.md \
  && grep -q 'v2.8.7' README.md \
  && grep -q 'house-rule-a-security-program-cannot-promote' README.md \
  && grep -q "I don't need a security department before anyone uses this" company-os/first-hour.md \
  && grep -q 'house-rule-a-security-program-cannot-promote' company-os/first-hour.md \
  && grep -q 'a security or compliance program cannot promote' company-os/ai-instructions.md \
  && grep -q 'house-rule-a-security-program-cannot-promote' company-os/ai-instructions.md; then
  ok "OS 2.8.7 section exists; first-hour and ai-instructions link to it"
else
  not_ok "2.8.7 must live in the OS section with first-hour and ai-instructions pointers"
fi

# --- r) preview plugin 0.1.1: team Import from Repo + hyperlink-only skills ---
if [ -f plugin/plugin.json ] && [ -f plugin/mcp.json ] \
  && [ -f plugin/.cursor-plugin/plugin.json ] \
  && [ -f .cursor-plugin/marketplace.json ] \
  && [ -f mcp/vercel.json ] && [ -f mcp/api/mcp.ts ] && [ -f mcp/api/health.ts ] \
  && [ -f plugin/skills/path-1-default/SKILL.md ] \
  && [ -f plugin/skills/house-rule-pins/SKILL.md ] \
  && [ -f plugin/skills/first-hour/SKILL.md ] \
  && [ -f plugin/skills/query-os-first/SKILL.md ] \
  && [ -f plugin/COVERAGE.md ]; then
  ok "plugin manifests, team marketplace listing, thin skills, and coverage story exist"
else
  not_ok "plugin/ must have plugin.json, mcp.json, query-os-first, COVERAGE.md, and repo-root marketplace.json"
fi
if python3 - <<'PY'
import json, pathlib, sys
root = pathlib.Path("plugin")
plugin = json.loads((root / "plugin.json").read_text())
assert plugin["name"] == "bootstrap-os"
assert plugin["version"] == "0.1.1"
assert plugin["$schema"] == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
cursor_plugin = json.loads((root / ".cursor-plugin/plugin.json").read_text())
assert cursor_plugin["version"] == "0.1.1"
default_url = cursor_plugin["variables"]["properties"]["BOOTSTRAP_MCP_URL"]["default"]
assert default_url == "https://mcp.bootstrap.pirin.ai/mcp"
mcp = json.loads((root / "mcp.json").read_text())
assert list(mcp["mcpServers"]) == ["bootstrap-os"]
server = mcp["mcpServers"]["bootstrap-os"]
assert server["type"] == "streamable-http"
assert server["url"] == "https://mcp.bootstrap.pirin.ai/mcp"
assert "mcp.pirin.ai" not in server["url"]
assert "command" not in server
raw = (root / "mcp.json").read_text()
assert "mcp.pirin.ai" not in raw
assert "npx" not in raw
assert "gmail" not in raw.lower()
assert "stripe" not in raw.lower()
assert not (root / "marketplace.json").exists()
market = json.loads(pathlib.Path(".cursor-plugin/marketplace.json").read_text())
assert market["name"] == "bootstrap-os"
assert len(market["plugins"]) == 1
assert market["plugins"][0]["source"] == "plugin"
assert market["plugins"][0]["name"] == "bootstrap-os"
readme = (root / "README.md").read_text()
assert "0.1.1" in readme
assert "Import from Repo" in readme
assert "https://github.com/ivelin/bootstrap" in readme
assert "https://mcp.bootstrap.pirin.ai/mcp" in readme
assert "~/.cursor/plugins/local/bootstrap-os" in readme
assert "/add-plugin" in readme
assert "we have not submitted" in readme.lower() or "We have not submitted" in readme
assert "query-os-first" in readme
assert "0-1" in readme
assert "## Feedback" in readme
assert "escalation to Ivelin" in readme
assert "not a public suggestion box" in readme
assert "ivelin@pirin.ai" in readme
assert readme.count("ivelin@pirin.ai") == 1
assert "public GitHub issue on ivelin/bootstrap" in readme
assert "Either path is fine" in readme
assert "No mentee names" in readme
assert "GitHub issue is not the escalate path" not in readme
assert "Feedback does not auto-change house rules" in readme
forbidden = [
    "Text eight people",
    "waitlist of 400",
    "does not mean get a crowd looking",
    "Dense leftover text is good",
    "Watch three numbers",
    "still paying on day 90",
    "long LTV model is fiction",
    "grind three years on a popcorn stand",
    "busy-looking machinery",
    "Factory speed is not 0→1",
    "A second ritual, channel, or agent team that does not attack it is busywork",
    "weakest link",
    "slowest soldier",
]
required = {"path-1-default", "house-rule-pins", "first-hour", "query-os-first", "after-proof-efficiency", "when-to-write"}
found = {p.parent.name for p in (root / "skills").glob("*/SKILL.md")}
assert required <= found, found
for skill in (root / "skills").glob("*/SKILL.md"):
    body = skill.read_text()
    assert "https://github.com/ivelin/bootstrap" in body, skill
    limit = 2400 if skill.parent.name in {"house-rule-pins", "query-os-first"} else 1800
    assert len(body) < limit, (skill, len(body), limit)
    for phrase in forbidden:
        assert phrase not in body, (skill, phrase)
pins = (root / "skills/house-rule-pins/SKILL.md").read_text()
assert "house-rule-marketing-volume-cannot-promote" in pins
assert "house-rule-a-security-program-cannot-promote" in pins
assert "house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed" in pins
assert "house-rule-do-not-automate-a-step-that-should-not-exist" in pins
assert "house-rule-legal-paper-cannot-promote" in pins
assert "house-rule-advisor-ride-along-is-assumed-not-observed" in pins
assert "old SaaS playbook" in pins
assert "automate the playbook" in pins
assert "one bottleneck this week" in pins
assert "new landing page" in pins
standing = (root / "skills/query-os-first/SKILL.md").read_text()
assert "0-1" in standing
assert "spoken yes" in standing
assert "do not invent their stage" in standing
assert "is not GTM" in standing
assert "verbal maybe" in standing
assert "Do not speak as Ivelin" in standing
assert "Do not host mentee" in standing
assert "Path 1 stays the front door" in standing
assert "plugin/README.md#feedback" in standing
assert "ivelin@pirin.ai" not in standing
assert "is this price optimal" in standing
assert "old SaaS playbook" in standing
assert "house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed" in standing
assert "house-rule-do-not-automate-a-step-that-should-not-exist" in standing
assert "house-rule-legal-paper-cannot-promote" in standing
assert "house-rule-advisor-ride-along-is-assumed-not-observed" in standing
assert "automate the playbook" in standing
assert "new landing page" in standing
assert "written founder override" in standing
assert "a price, or an LTV number" in standing
assert "Exit without fences+proof" in standing
assert "Two clocks" in standing
gate = (root / "skills/after-proof-efficiency/SKILL.md").read_text()
assert "ALL" in gate
assert "fences" in gate
assert "proof" in gate
assert "efficiency or an exit" in gate
assert "after-proof-efficiency.md" in gate
assert "0.75 stop-spend" not in gate
first = (root / "skills/first-hour/SKILL.md").read_text()
assert "Install-first" in first or "install-first" in first
assert "https://mcp.bootstrap.pirin.ai/mcp" in first
assert "No auth" in first
assert "No database" in first
assert "day-0-lifestyle-or-swinging-for-the-fences" in first
assert "Do not upload mentee work to Ivelin's GitHub" in first
assert "first-hour.md#standing-rules" in first
assert "Grok Bot marketplace bot" not in first
path1 = (root / "skills/path-1-default/SKILL.md").read_text()
assert "day-0-lifestyle-or-swinging-for-the-fences" in path1
assert "Do not upload mentee work to Ivelin's GitHub" in path1
assert "first-hour.md#standing-rules" in path1
assert "https://github.com/ivelin/bootstrap" in path1
assert "Grok Bot marketplace bot" not in path1
assert "Upload mentee work to Ivelin's GitHub — refuse" in standing
assert "first-hour.md#standing-rules" in standing
assert "Grok Bot marketplace bot" not in standing
assert "1.0 may-spend" not in first
assert "1.0 may-spend" not in path1
assert "NRR" not in first
assert "NRR" not in path1
assert "after-proof-efficiency.md" not in first
assert "after-proof-efficiency.md" not in path1
when = (root / "skills/when-to-write/SKILL.md").read_text()
assert "founder yes" in when
assert "Comments never mutate" in when
assert "judge-only" in when
assert "get_journey" not in when
assert "DyeConverter" not in when
assert "CoreHaul" not in when
assert "@example.test" not in when
readme = (root / "README.md").read_text()
assert "Merge-gate visitor matrix" in readme
assert "After-proof efficiency visitor matrix" in readme
assert "After First Hour visitor matrix" in readme
assert "Do not automate visitor matrix" in readme
assert "0-1 journey visitor matrix" in readme
assert "when-to-write" in readme
assert "DyeConverter" not in readme
assert "CoreHaul" not in readme
assert "do not invent their stage" in readme
assert "Do not upload mentee work to Ivelin's GitHub" in readme
assert "first-hour.md#standing-rules" in readme
assert "push mentee files to ivelin/bootstrap" in readme
coverage = (root / "COVERAGE.md").read_text()
assert "## Locked" in coverage
assert "## Not locked" in coverage
assert "## Visitor matrix" in coverage
assert "do not invent their stage" in coverage
assert "H1" in coverage and "A4" in coverage
assert "https://mcp.bootstrap.pirin.ai/mcp" in coverage
assert "GET /health" in coverage
assert "Rollback" in coverage
assert "SSO" in coverage
assert "2.8.8" in coverage
assert "2.8.9" in coverage
assert "there is no optimal price until people have paid and stayed" in coverage
assert "do not automate a step that should not exist" in coverage
assert "Do not automate visitor matrix" in coverage
assert "automate the playbook" in coverage
assert "lifestyle or swinging for the fences" in coverage
assert "After-proof efficiency visitor matrix" in coverage
assert "afterProofEfficiencyPageMayOpen" in coverage
assert "emptyContextMayInventEfficiencyMetrics" in coverage
assert "After First Hour visitor matrix" in coverage
assert "0-1 journey visitor matrix" in coverage
assert "No human Ivelin session claimed" in coverage
assert "when-to-write" in coverage
assert "DyeConverter" not in coverage
assert "CoreHaul" not in coverage
assert "Do not upload mentee work to Ivelin's GitHub" in coverage
assert "https://github.com/ivelin/bootstrap" in coverage
assert "push mentee files to ivelin/bootstrap" in coverage
print("plugin lock ok")
PY
then
  ok "plugin skills only hyperlink the published OS; team Import from Repo listed"
else
  not_ok "plugin must stay thin hyperlinks; one hosted MCP connector; team marketplace.json at plugin/"
fi

# --- s) OS 2.8.8: no-optimal-price house rule + Day 0 lifestyle/fences (do not mix) ---
# Full house rule and full Day 0 question live once in the OS. Pointers elsewhere.
# Path 1 / first-hour must not carry house-rule metrics or CAC/LTV targets.
if grep -q '### House rule: there is no optimal price until people have paid and stayed' company-os/operating-system.md \
  && grep -q 'A survey of a handful of users will lie' company-os/operating-system.md \
  && grep -q 'Watch three numbers' company-os/operating-system.md \
  && grep -q 'pay on day 31' company-os/operating-system.md \
  && grep -q 'still paying on day 90' company-os/operating-system.md \
  && grep -q 'long LTV model is fiction' company-os/operating-system.md \
  && grep -q 'SaaS 1.0 playbooks may be outdated' company-os/operating-system.md \
  && grep -q 'Do not guide to where the puck has been' company-os/operating-system.md \
  && grep -q 'dated current-year AI sources' company-os/operating-system.md \
  && grep -q 'v2.8.8' README.md \
  && grep -q 'house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed' README.md; then
  ok "OS 2.8.8 house-rule section has full rule and vocabulary"
else
  not_ok "operating-system.md must hold the full 2.8.8 no-optimal-price house rule"
fi
if grep -q '## Day 0: lifestyle or swinging for the fences' company-os/operating-system.md \
  && grep -q 'popcorn stand' company-os/operating-system.md \
  && grep -q 'about ten years' company-os/operating-system.md \
  && grep -q 'not a house rule' company-os/operating-system.md \
  && grep -q 'not a third clock' company-os/operating-system.md \
  && ! grep -q 'unicorn' company-os/operating-system.md; then
  ok "OS Day 0 lifestyle/fences section exists; not a house rule; no unicorn"
else
  not_ok "operating-system.md must hold the Day 0 lifestyle/fences question once"
fi
if grep -q 'grind three years on a popcorn stand' company-os/first-hour.md \
  && grep -q 'day-0-lifestyle-or-swinging-for-the-fences' company-os/first-hour.md \
  && grep -q 'There is no optimal price until people have paid and stayed' company-os/first-hour.md \
  && grep -q 'house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed' company-os/first-hour.md \
  && grep -q 'day-0-lifestyle-or-swinging-for-the-fences' README.md \
  && grep -q 'Lifestyle / small good business, or swinging for the fences' README.md \
  && grep -q 'house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed' company-os/ai-instructions.md \
  && grep -q 'day-0-lifestyle-or-swinging-for-the-fences' company-os/ai-instructions.md; then
  ok "first-hour, Path 1, and ai-instructions pin Day 0 and the price rule"
else
  not_ok "first-hour, README Path 1, and ai-instructions must pin both homes"
fi
if ! grep -q 'Watch three numbers' company-os/first-hour.md \
    company-os/ai-instructions.md README.md \
    plugin/skills/house-rule-pins/SKILL.md \
    plugin/skills/query-os-first/SKILL.md \
    plugin/skills/first-hour/SKILL.md \
    plugin/skills/path-1-default/SKILL.md \
  && ! grep -q 'still paying on day 90' company-os/first-hour.md \
    company-os/ai-instructions.md README.md \
    plugin/skills/*/SKILL.md \
  && ! grep -q 'long LTV model is fiction' company-os/first-hour.md \
    company-os/ai-instructions.md README.md \
    plugin/skills/*/SKILL.md; then
  ok "house-rule essay is not copied outside the OS section"
else
  not_ok "do not reprint the 2.8.8 house-rule essay outside operating-system.md"
fi
# Path 1 / Day 0 surfaces must not carry house-rule metrics or CAC/LTV targets.
# Do not paste last-decade SaaS playbook targets as the aim on those surfaces.
path1_block=$(sed -n '/^### 1. Point an AI at this pack/,/^### 2. Instantiate files/p' README.md)
day0_block=$(sed -n '/^## Day 0: lifestyle or swinging for the fences/,/^## How Mentors/p' company-os/operating-system.md)
if ! printf '%s\n' "$path1_block" | grep -Eq 'CAC|LTV|day 31|day 90|NRR|magic number|0\.75 stop-spend' \
  && ! grep -Eq 'CAC|day 31|day 90|NRR|magic number|0\.75 stop-spend' company-os/first-hour.md \
  && ! printf '%s\n' "$day0_block" | grep -Eq 'CAC|NRR|magic number|0\.75 stop-spend|after-proof-efficiency' \
  && ! grep -q 'vc-scoreboard\|VC scoreboard\|top-shelf exit' \
    company-os/operating-system.md company-os/first-hour.md README.md \
    plugin/skills/*/SKILL.md; then
  ok "Path 1, Day 0, and first-hour have no CAC/NRR/magic-number numbers"
else
  not_ok "Path 1 / Day 0 / first-hour must not carry CAC/NRR/magic-number numbers"
fi
if ! grep -Eq 'LTV:CAC|T2D3|Bessemer|magic-number|magic number' \
    company-os/operating-system.md company-os/first-hour.md \
    company-os/ai-instructions.md \
    plugin/skills/path-1-default/SKILL.md plugin/skills/first-hour/SKILL.md \
    mcp/src/house-rules.ts; then
  ok "old SaaS playbook targets are not pasted as the aim on Path 1 / Day 0 / OS pins"
else
  not_ok "do not paste LTV:CAC, T2D3, magic-number, or Bessemer tables as the aim on Path 1 / Day 0"
fi
if grep -q 'old SaaS playbook' plugin/skills/house-rule-pins/SKILL.md \
  && grep -q 'old SaaS playbook' plugin/skills/query-os-first/SKILL.md \
  && ! grep -q 'SaaS 1.0 playbooks may be outdated' company-os/first-hour.md \
  && ! grep -q 'where the puck has been' company-os/first-hour.md \
  && ! grep -q 'dated current-year AI sources' company-os/first-hour.md README.md \
    plugin/skills/*/SKILL.md; then
  ok "stay-current essay stays in the house-rule home; skills only pin"
else
  not_ok "do not copy the stay-current essay onto Day 0 / Path 1 or into skills"
fi

# --- t) after-proof efficiency page (resource; not a house rule; not a version bump) ---
eff=company-os/after-proof-efficiency.md
if [ -f "$eff" ] \
  && grep -q 'Dated:\*\* 2026-08-24' "$eff" \
  && grep -q 'CAC payback (gross-margin adjusted)' "$eff" \
  && grep -q 'NRR and GRR' "$eff" \
  && grep -q 'Pilots fake NRR' "$eff" \
  && grep -q 'Usage, not seats' "$eff" \
  && grep -q 'Gross margin' "$eff" \
  && grep -q 'Magic number only if margin-adjusted' "$eff" \
  && grep -q '0.75 stop-spend' "$eff" \
  && grep -q '1.0 may-spend' "$eff" \
  && grep -q 'Benchmarkit 2026' "$eff" \
  && grep -q 'https://www.benchmarkit.ai/2026-saas-ai-native-metrics' "$eff" \
  && grep -q 'LTV:CAC 3x' "$eff" \
  && grep -q 'dead as the aim' "$eff" \
  && grep -q 'T2D3' "$eff" \
  && grep -q 'Wiz-sized exit is not a goal' "$eff" \
  && grep -q 'older than a year' "$eff" \
  && grep -q 'Not a house rule' "$eff" \
  && ! grep -q 'House rule:' "$eff"; then
  ok "after-proof efficiency page is dated, five instruments, stale not the aim; not a house rule"
else
  not_ok "company-os/after-proof-efficiency.md must be the single dated home"
fi
if grep -q '### After-proof efficiency (fences)' company-os/operating-system.md \
  && grep -q 'after-proof-efficiency.md' company-os/operating-system.md \
  && grep -q 'after-proof-efficiency.md' README.md \
  && grep -q 'after-proof-efficiency.md' company-os/ai-instructions.md \
  && grep -q 'after-proof-efficiency.md' company-os/README.md \
  && grep -q 'after-proof-efficiency.md' company-os/live-runtime.md; then
  ok "thin pins point at the after-proof efficiency home"
else
  not_ok "OS / README / ai-instructions / live-runtime must hyperlink the page"
fi
if ! grep -q 'after-proof-efficiency' company-os/first-hour.md \
  && ! grep -q '0.75 stop-spend' company-os/first-hour.md \
  && ! grep -q 'Benchmarkit' company-os/first-hour.md; then
  ok "first-hour.md stays out of the after-proof efficiency page"
else
  not_ok "first-hour.md must stay out (Day 0 is thesis/ICP)"
fi
if grep -q 'After-proof efficiency visitor matrix' plugin/README.md \
  && grep -q 'After-proof efficiency visitor matrix' plugin/COVERAGE.md \
  && grep -q 'afterProofEfficiencyPageMayOpen' plugin/COVERAGE.md; then
  ok "plugin README and COVERAGE name the after-proof visitor matrix"
else
  not_ok "plugin README and COVERAGE must name the after-proof visitor matrix"
fi

# --- u) After First Hour standing rules (once in first-hour; pins elsewhere) ---
# Full line lives under After this hour / standing rules. Not extra Day 0 homework.
# Exact MCP URL and Path 1 GitHub stay unmodified. Skills pin + link only.
fh=company-os/first-hour.md
if grep -q '### Standing rules' "$fh" \
  && grep -q 'https://mcp.bootstrap.pirin.ai/mcp' "$fh" \
  && grep -q "upload mentee work to Ivelin's GitHub" "$fh" \
  && grep -q 'https://github.com/ivelin/bootstrap' "$fh" \
  && grep -q 'a public catalog submit' "$fh" \
  && grep -q 'mentee boards on our host' "$fh" \
  && grep -q 'Grok Bot marketplace bot' "$fh" \
  && grep -q 'Not another Day 0 checkbox' "$fh"; then
  ok "first-hour.md After this hour holds the standing rules once"
else
  not_ok "first-hour.md must hold After First Hour standing rules under After this hour"
fi
if grep -q 'Write the thesis (~20 minutes)' "$fh" \
  && grep -q 'At least three customer groups (~25 minutes)' "$fh" \
  && grep -q 'First “Where are we?” (~15 minutes)' "$fh" \
  && grep -q 'Thesis written' "$fh" \
  && grep -q '≥3 customer groups' "$fh"; then
  ok "Day 0 stays thesis / ≥3 groups / one snapshot (~60 minutes)"
else
  not_ok "Day 0 must stay thesis / ≥3 groups / one snapshot (~60 minutes)"
fi
if grep -q '~60 minutes' company-os/first-hour.md \
  && grep -q 'takes to \*\*read\*\*' company-os/first-hour.md \
  && grep -q 'Path 1 is chat plus a weekly' company-os/first-hour.md \
  && grep -q '~60 minutes' README.md \
  && grep -q 'Mental model (blueprint vs weekly loop)' README.md \
  && ! grep -q 'Mental model (two minutes)' README.md \
  && ! grep -qi 'control plane' company-os/first-hour.md \
    plugin/skills/first-hour/SKILL.md \
    plugin/skills/path-1-default/SKILL.md \
  && grep -q '60 minutes' plugin/skills/first-hour/SKILL.md \
  && grep -q 'snapshot \*read\*' plugin/skills/first-hour/SKILL.md \
  && grep -q '60 minutes' plugin/skills/path-1-default/SKILL.md; then
  ok "first-hour duration is ~60 minutes; snapshot is a two-minute read; Day 0/Path 1 copy does not say control plane"
else
  not_ok "first-hour must stay ~60 minutes; two-minute figure is the read; do not call Day 0 / Path 1 a control plane"
fi
if grep -q 'SoR index' company-os/first-hour.md \
  && grep -q 'Play may not hold' company-os/first-hour.md \
  && grep -q 'observed use' company-os/first-hour.md \
  && grep -q 'finding it is the first chore' company-os/first-hour.md \
  && grep -q 'Do not buy a new category' company-os/first-hour.md \
  && grep -q 'Not exceptions' company-os/first-hour.md \
  && grep -q 'Advice filter' company-os/first-hour.md \
  && grep -q '### SoR / buy vs build / advice (not this hour)' company-os/first-hour.md \
  && ! grep -q '## Standing rules (not this hour)' company-os/first-hour.md \
  && grep -q 'this company this week' company-os/first-hour.md \
  && grep -q 'Do not add a tool' company-os/first-hour.md \
  && grep -q 'SoR index' templates/applied-here.md \
  && grep -q 'Live site' templates/applied-here.md \
  && grep -q 'Main git repo' templates/applied-here.md \
  && grep -q 'One working folder' templates/applied-here.md \
  && grep -q 'Where leads live' templates/applied-here.md \
  && grep -q 'Play may not hold' templates/applied-here.md \
  && grep -q 'first chore' templates/applied-here.md \
  && grep -q 'SoR vs Play' plugin/skills/query-os-first/SKILL.md \
  && grep -q 'buy vs build' plugin/skills/query-os-first/SKILL.md \
  && grep -q 'advice filter' plugin/skills/query-os-first/SKILL.md \
  && grep -q 'SoR vs Play' plugin/skills/first-hour/SKILL.md \
  && grep -q 'SoR vs Play' plugin/skills/path-1-default/SKILL.md \
  && ! grep -q 'Do not buy a new category' plugin/skills/*/SKILL.md \
  && ! grep -q 'Four starters' plugin/skills/*/SKILL.md \
  && ! grep -q 'six talks' plugin/skills/*/SKILL.md \
  && grep -q 'advice pile' plugin/skills/query-os-first/SKILL.md \
  && grep -qi 'until then chat is enough' company-os/first-hour.md \
  && grep -q 'Where the company lives / instantiate' plugin/skills/query-os-first/SKILL.md \
  && ! grep -E 'advice pile / buy a CRM.*[Gg]it URL' plugin/skills/query-os-first/SKILL.md \
  && ! grep -q 'workspace-architecture' company-os/first-hour.md \
    templates/applied-here.md plugin/skills/*/SKILL.md; then
  ok "SoR / buy-vs-build / advice-filter pins live in first-hour and applied-here; skills only point"
else
  not_ok "first-hour + applied-here must hold SoR / buy-vs-build / advice-filter pins; skills must not reprint"
fi
# Done when (Day 0 homework) must not grow the standing rules.
done_when=$(sed -n '/^## Done when$/,/^## After this hour$/p' "$fh")
if ! printf '%s\n' "$done_when" | grep -q 'bootstrap-os-mcp.vercel.app' \
  && ! printf '%s\n' "$done_when" | grep -q 'mcp.bootstrap.pirin.ai' \
  && ! printf '%s\n' "$done_when" | grep -q 'upload mentee work'; then
  ok "standing rules are not extra Day 0 homework"
else
  not_ok "do not put After First Hour standing rules in the Day 0 Done when checklist"
fi
if grep -q 'first-hour.md#standing-rules' plugin/skills/first-hour/SKILL.md \
  && grep -q 'first-hour.md#standing-rules' plugin/skills/path-1-default/SKILL.md \
  && grep -q 'first-hour.md#standing-rules' plugin/skills/query-os-first/SKILL.md \
  && grep -q "Do not upload mentee work to Ivelin's GitHub" plugin/skills/first-hour/SKILL.md \
  && grep -q "Upload mentee work to Ivelin's GitHub — refuse" plugin/skills/query-os-first/SKILL.md \
  && grep -q 'After First Hour visitor matrix' plugin/README.md \
  && grep -q 'After First Hour visitor matrix' plugin/COVERAGE.md; then
  ok "plugin skills and README pin+link the standing rules"
else
  not_ok "plugin skills and README must pin+link first-hour.md#standing-rules"
fi
if ! grep -q 'Grok Bot marketplace bot' plugin/skills/first-hour/SKILL.md \
    plugin/skills/path-1-default/SKILL.md \
    plugin/skills/query-os-first/SKILL.md; then
  ok "Grok Bot essay stays in first-hour.md, not in skills"
else
  not_ok "do not copy the Grok Bot marketplace line into plugin skills"
fi
if ! grep -q 'bootstrap-os-mcp.vercel.app' plugin/skills/first-hour/SKILL.md \
    plugin/skills/path-1-default/SKILL.md \
    plugin/skills/when-to-write/SKILL.md \
    company-os/first-hour.md \
    README.md \
    AGENTS.md \
    ROADMAP.md; then
  ok "Path 1 / first-hour / discovery do not advertise vercel.app as a hosted MCP pin"
else
  not_ok "do not advertise bootstrap-os-mcp.vercel.app as a Path 1 hosted MCP pin"
fi

# --- v) OS 2.8.9: do not automate a step that should not exist ---
# Full rule lives once in the OS section. Pins + link elsewhere. Not Day 0 homework.
if grep -q '| 2.8.9 |' company-os/operating-system.md \
  && grep -q '### House rule: do not automate a step that should not exist' company-os/operating-system.md \
  && grep -q 'Do not speed up or automate a step that should not exist' company-os/operating-system.md \
  && grep -q "Every requirement has a person's name" company-os/operating-system.md \
  && grep -q 'Delete the step before you simplify it' company-os/operating-system.md \
  && grep -q 'Automate last' company-os/operating-system.md \
  && grep -q 'An agent team is automation' company-os/operating-system.md \
  && grep -q 'Name the one bottleneck this week and work that' company-os/operating-system.md \
  && grep -q 'Several ideas may attack that same bottleneck' company-os/operating-system.md \
  && grep -q 'Preference and .this is interesting. cannot name it' company-os/operating-system.md \
  && grep -q 'fun side quest dressed as the bottleneck' company-os/operating-system.md \
  && grep -q 'the agent does not rubber-stamp' company-os/operating-system.md \
  && grep -q 'new landing page' company-os/operating-system.md \
  && grep -q 'weakest link' company-os/operating-system.md \
  && grep -q 'slowest soldier' company-os/operating-system.md \
  && grep -q 'not extra law' company-os/operating-system.md \
  && ! grep -q 'Name the one constraint this week and work that' company-os/operating-system.md \
  && ! grep -q 'one constraint this week' company-os/first-hour.md README.md \
    plugin/README.md plugin/COVERAGE.md plugin/skills/*/SKILL.md \
    mcp/src/house-rules.ts \
  && grep -q 'A second ritual, channel, or agent team that does not attack it is busywork' company-os/operating-system.md \
  && ! grep -q 'Do not open a second idea, ritual, or agent team to walk around it' company-os/operating-system.md \
  && grep -q 'busy-looking machinery' company-os/operating-system.md \
  && grep -q 'Factory speed is not 0→1' company-os/operating-system.md \
  && grep -q 'an accelerate or optimize law' company-os/operating-system.md \
  && grep -q 'v2.8.9' README.md \
  && grep -q 'house-rule-do-not-automate-a-step-that-should-not-exist' README.md \
  && grep -q '### House rule: legal paper cannot promote' company-os/operating-system.md \
  && grep -q '### House rule: advisor ride-along is assumed, not observed' company-os/operating-system.md \
  && grep -q 'Legal paperwork' company-os/operating-system.md \
  && grep -q 'Write down who said what' company-os/operating-system.md \
  && grep -q 'v2.8.10' README.md \
  && grep -q 'v2.8.11' README.md; then
  ok "OS 2.8.9 house-rule section has full rule and vocabulary"
else
  not_ok "operating-system.md must hold the full 2.8.9 do-not-automate house rule"
fi
if ! grep -qiE '\bElon\b|\bMusk\b|five-step algorithm' company-os/operating-system.md \
    company-os/first-hour.md company-os/ai-instructions.md README.md \
    plugin/skills/*/SKILL.md plugin/README.md plugin/COVERAGE.md \
    mcp/src/house-rules.ts; then
  ok "no celebrity names or five-step algorithm label"
else
  not_ok "do not name Elon, Musk, or a five-step algorithm"
fi
if grep -q "I don't automate a step that should not exist" company-os/first-hour.md \
  && grep -q 'Name the one bottleneck this week and work that' company-os/first-hour.md \
  && grep -q 'Several ideas may attack that same bottleneck' company-os/first-hour.md \
  && grep -q 'new landing page' company-os/first-hour.md \
  && grep -q 'house-rule-do-not-automate-a-step-that-should-not-exist' company-os/first-hour.md \
  && grep -q 'house-rule-do-not-automate-a-step-that-should-not-exist' company-os/ai-instructions.md \
  && grep -q 'house-rule-do-not-automate-a-step-that-should-not-exist' plugin/skills/house-rule-pins/SKILL.md \
  && grep -q 'house-rule-do-not-automate-a-step-that-should-not-exist' plugin/skills/query-os-first/SKILL.md; then
  ok "first-hour, ai-instructions, and plugin skills pin the 2.8.9 OS section"
else
  not_ok "first-hour, ai-instructions, and plugin skills must pin the 2.8.9 OS section"
fi
if ! grep -q 'busy-looking machinery' company-os/first-hour.md \
    company-os/ai-instructions.md README.md \
    plugin/skills/*/SKILL.md \
  && ! grep -q 'Factory speed is not 0→1' company-os/first-hour.md \
    company-os/ai-instructions.md README.md \
    plugin/skills/*/SKILL.md \
  && ! grep -q 'A second ritual, channel, or agent team that does not attack it is busywork' \
    company-os/first-hour.md company-os/ai-instructions.md README.md \
    plugin/skills/*/SKILL.md \
  && ! grep -q 'weakest link' company-os/first-hour.md company-os/ai-instructions.md \
    README.md plugin/skills/*/SKILL.md \
  && ! grep -q 'slowest soldier' company-os/first-hour.md company-os/ai-instructions.md \
    README.md plugin/skills/*/SKILL.md \
  && ! grep -q 'Do not open a second idea, ritual, or agent team to walk around it' \
    company-os/operating-system.md company-os/first-hour.md \
    company-os/ai-instructions.md README.md plugin/skills/*/SKILL.md \
  && ! grep -q 'constraint_this_week' company-os/operating-system.md \
    company-os/first-hour.md mcp/src/house-rules.ts \
    templates/company/state/company-state.json \
    templates/company/state/company-state.schema.json; then
  ok "2.8.9 essay is not copied outside the OS section"
else
  not_ok "do not reprint the 2.8.9 house-rule essay outside operating-system.md"
fi
done_when=$(sed -n '/^## Done when$/,/^## After this hour$/p' company-os/first-hour.md)
if ! printf '%s\n' "$done_when" | grep -q 'automate a step that should not exist' \
  && ! printf '%s\n' "$done_when" | grep -q 'automate the playbook' \
  && ! printf '%s\n' "$done_when" | grep -q 'agent team' \
  && ! printf '%s\n' "$done_when" | grep -q 'one constraint this week' \
  && ! printf '%s\n' "$done_when" | grep -q 'one bottleneck this week' \
  && ! printf '%s\n' "$done_when" | grep -q 'landing page'; then
  ok "2.8.9 house rule is not extra Day 0 homework"
else
  not_ok "do not put the 2.8.9 house rule in the Day 0 Done when checklist"
fi
if grep -q 'Do not automate visitor matrix' plugin/README.md \
  && grep -q 'Do not automate visitor matrix' plugin/COVERAGE.md \
  && grep -q 'automate the playbook' plugin/README.md \
  && grep -q 'no named owner' plugin/README.md \
  && grep -qi 'delete or name the person first' plugin/README.md; then
  ok "plugin README and COVERAGE name the do-not-automate visitor matrix"
else
  not_ok "plugin README and COVERAGE must name the do-not-automate visitor matrix"
fi

# --- z) OS 2.8.12: founder checkpoints (QC / Bind / Clock / Alpha) ---
# Additive pack. Optional until useful. Absent = 2.8.9 behavior.
# Not Day 0 homework. No tenth phase. No third clock. No schema bump.
if grep -q '### Founder checkpoints (when human judgment is the work)' company-os/operating-system.md \
  && grep -q 'QC Hold is not journey Hold' company-os/operating-system.md \
  && grep -q 'Alpha — five fields' company-os/operating-system.md \
  && grep -q 'Path-local Hold' company-os/operating-system.md \
  && grep -q '2.8.12' company-os/operating-system.md \
  && grep -q 'v2.8.12' README.md \
  && grep -q 'QC Hold is path-local' company-os/live-runtime.md \
  && grep -q 'founder checkpoints: QC / Bind / Clock / Alpha' company-os/ai-instructions.md \
  && grep -q 'five Alpha fields' company-os/ai-instructions.md \
  && grep -q 'founder checkpoint, not a new clock' company-os/first-hour.md \
  && grep -q 'Checkpoint kind' templates/traces/decisions/TEMPLATE.md \
  && grep -q 'If Alpha' templates/traces/decisions/TEMPLATE.md \
  && grep -q 'OS_VERSION = "2.8.15"' mcp/src/constants.ts; then
  ok "OS 2.8.12 founder-checkpoints pack is pinned"
else
  not_ok "2.8.12 founder-checkpoints strings must exist in OS, runtime, pins, and tests"
fi
done_when=$(sed -n '/^## Done when$/,/^## After this hour$/p' company-os/first-hour.md)
if ! printf '%s\n' "$done_when" | grep -q 'founder checkpoint' \
  && ! printf '%s\n' "$done_when" | grep -q 'Alpha' \
  && ! printf '%s\n' "$done_when" | grep -q 'QC Hold'; then
  ok "2.8.12 founder checkpoints are not Day 0 Done when homework"
else
  not_ok "do not put founder checkpoint / Alpha / QC Hold in the Day 0 Done when checklist"
fi
if grep -q 'How to say this' company-os/operating-system.md \
  && grep -q 'What the founder hears' company-os/operating-system.md; then
  ok "OS 2.8.12 How to say this is pinned"
else
  not_ok "OS must have How to say this and What the founder hears"
fi
if ! grep -q 'QC holds' company-os/first-hour.md \
  && ! grep -q 'Alpha is a written' company-os/first-hour.md; then
  ok "first-hour quote does not use QC holds / Alpha is a written"
else
  not_ok "first-hour quote must not contain QC holds or Alpha is a written"
fi
if grep -q 'Do not lead with QC' company-os/ai-instructions.md; then
  ok "ai-instructions does not lead checkpoints with desk labels"
else
  not_ok "ai-instructions must say Do not lead with QC"
fi
if grep -q 'Core Belief 4' company-os/ai-instructions.md \
  && grep -q 'named human at a knowledge boundary' company-os/ai-instructions.md \
  && grep -q 'operating-system.md#core-beliefs' company-os/ai-instructions.md \
  && ! grep -q 'You stay in control' company-os/ai-instructions.md; then
  ok "ai-instructions pins Core Belief 4; essay stays in the OS"
else
  not_ok "ai-instructions must pin Core Belief 4 to #core-beliefs without copying the essay"
fi

# --- z2) OS 2.8.13: unpaid weeks cannot promote ---
# Full rule lives once in the OS section. Pins + link elsewhere. Not Day 0 homework.
# Cards hold Customer type / First paid offer / Unpaid work fields. OS holds the Who-buys table.
if grep -q '### House rule: unpaid weeks cannot promote' company-os/operating-system.md \
  && grep -q '| 2.8.13 |' company-os/operating-system.md \
  && grep -q '2.8.13' company-os/operating-system.md \
  && grep -q 'Customer type (consumer / small business / mid-market / enterprise' templates/research/icps/TEMPLATE.md \
  && grep -q 'First paid offer' templates/research/icps/TEMPLATE.md \
  && grep -q 'Unpaid work after the first talk' templates/research/icps/TEMPLATE.md \
  && grep -q 'Unpaid work on live prospects' templates/instance/snapshots/TEMPLATE.md \
  && grep -q 'Follow-up cue' company-os/operating-system.md \
  && grep -q 'BANT' company-os/operating-system.md \
  && grep -q 'MEDDIC' company-os/operating-system.md \
  && grep -q 'MEDDPICC' company-os/operating-system.md \
  && grep -q 'Listed price' company-os/operating-system.md \
  && grep -q 'Words used here' company-os/operating-system.md \
  && grep -q 'Budget (is there money)' company-os/operating-system.md \
  && grep -q 'When this rule does not apply' company-os/operating-system.md \
  && grep -q 'Waiting while their purchasing process runs' company-os/operating-system.md \
  && grep -q 'house-rule-unpaid-weeks-cannot-promote' company-os/first-hour.md \
  && grep -q 'house-rule-unpaid-weeks-cannot-promote' company-os/ai-instructions.md \
  && grep -q 'unpaid-weeks-2.8.13' mcp/src/house-rules.ts \
  && grep -q 'house-rule-unpaid-weeks-cannot-promote' mcp/src/house-rules.ts \
  && grep -q 'OS_VERSION = "2.8.15"' mcp/src/constants.ts \
  && grep -q '2.8.12' company-os/operating-system.md; then
  ok "OS 2.8.13 unpaid-weeks house-rule section has full rule, table, and card strings"
else
  not_ok "operating-system.md must hold the 2.8.13 unpaid-weeks house rule; cards and pins must match"
fi
done_when=$(sed -n '/^## Done when$/,/^## After this hour$/p' company-os/first-hour.md)
if ! printf '%s\n' "$done_when" | grep -q 'unpaid weeks' \
  && ! printf '%s\n' "$done_when" | grep -q 'Buyer class' \
  && ! printf '%s\n' "$done_when" | grep -q 'Customer type' \
  && ! printf '%s\n' "$done_when" | grep -q 'BANT' \
  && ! printf '%s\n' "$done_when" | grep -q 'MEDDIC'; then
  ok "2.8.13 unpaid weeks is not Day 0 Done when homework"
else
  not_ok "do not put unpaid weeks / Buyer class / Customer type / BANT / MEDDIC in the Day 0 Done when checklist"
fi

# --- z3) OS 2.8.14: Decision methods (IESER + FIRAC Bind-class) ---
# Additive aliases, not a third clock. Not Day 0. No IESER in first-hour.
# Lock distinctive phrases. Do not invent doctrine.
if grep -q '### Decision methods (aliases, not a third clock)' company-os/operating-system.md \
  && grep -q '| 2.8.14 |' company-os/operating-system.md \
  && grep -Fq '**Last Updated:** 2026-09-19' company-os/operating-system.md \
  && grep -q 'Use IESER, in this order' company-os/operating-system.md \
  && grep -q 'Use FIRAC before anyone signs' company-os/operating-system.md \
  && grep -q 'Checkpoint kind Clock is not the same as the two clocks' company-os/operating-system.md \
  && grep -q 'Do this week with what we have:' company-os/operating-system.md \
  && grep -q 'Clock open?: none | 83(b) by DATE | close DATE | customer DATE' company-os/operating-system.md \
  && grep -Fq 'When naming constraintThisWeek, challenge legal / Carta / SOPA / a new agent team unless a Clock checkpoint is open or the founder writes an override. Before a Bind sign-off, walk Facts / Issue / Rule / Application / Conclusion in short form.' company-os/ai-instructions.md \
  && grep -q 'unpaid weeks cannot promote' AGENTS.md \
  && grep -q 'unpaid-weeks-2.8.13' mcp/src/house-rules.ts \
  && grep -Fq 'Honest biggest bottleneck this week. Not a calendar stub. Not tickets. Not a fun side quest. Exception: an open Clock checkpoint.' mcp/src/server.ts \
  && ! grep -q 'liveClock' mcp/src/server.ts \
  && grep -q '2.8.13' company-os/operating-system.md; then
  ok "OS 2.8.14 Decision methods pack is pinned"
else
  not_ok "2.8.14 Decision methods strings must exist in OS, ai-instructions, MCP pins, and tests"
fi
done_when=$(sed -n '/^## Done when$/,/^## After this hour$/p' company-os/first-hour.md)
if ! printf '%s\n' "$done_when" | grep -q 'IESER' \
  && ! printf '%s\n' "$done_when" | grep -q 'FIRAC' \
  && ! printf '%s\n' "$done_when" | grep -q 'Decision methods'; then
  ok "2.8.14 Decision methods are not Day 0 Done when homework"
else
  not_ok "do not put IESER / FIRAC / Decision methods in the Day 0 Done when checklist"
fi
if ! grep -q 'IESER' company-os/first-hour.md \
  && ! grep -q 'FIRAC' company-os/first-hour.md; then
  ok "2.8.14 IESER/FIRAC stay out of first-hour"
else
  not_ok "do not put IESER or FIRAC in first-hour"
fi
# Speaking rule from 2.8.14 stays. Labels first; numbers in parentheses.
# Decision methods essay stays. Clock shrink is 2.8.15.
if grep -q 'When speaking the board to a human' company-os/operating-system.md \
  && grep -q 'Speaking rule: lead with descriptive labels; numbers in parentheses' company-os/operating-system.md \
  && grep -q 'lead with these names; the `#` column is storage' company-os/operating-system.md \
  && grep -q 'journey phase in everyday words (number in parentheses only if useful)' company-os/ai-instructions.md \
  && grep -q 'everyday journey-phase name + everyday loop-stage name' company-os/ai-instructions.md \
  && grep -q 'Write the bet' company-os/first-hour.md \
  && grep -q '\*\*Ask\*\*' company-os/first-hour.md \
  && grep -q 'Write the bet' templates/applied-here.md \
  && grep -q 'Ask / Make / Check / Hear / Write back' templates/applied-here.md \
  && grep -q 'lead with descriptive labels; numbers only in parentheses' .cursor/skills/verify-bootstrap/SKILL.md \
  && grep -q 'lead with descriptive labels; numbers only in parentheses' .cursor/skills/verify-bootstrap/features/journey-board.md \
  && grep -q 'Spoken or rendered summary should lead with descriptive labels' mcp/src/hosted-copy.ts \
  && grep -q 'Spoken board talk leads with descriptive labels' mcp/src/hosted-copy.ts \
  && grep -q 'Board status spoken to humans leads with descriptive labels' mcp/docs/JOURNEY.md \
  && grep -q 'Spoken board talk leads with descriptive labels' AGENTS.md \
  && grep -q 'simple phase name first; number in parentheses only if useful' company-os/operating-system.md \
  && grep -q 'simple loop name first; number in parentheses only if useful' company-os/operating-system.md \
  && ! grep -q 'step N of 9' company-os/operating-system.md \
  && ! grep -q 'step M of 7' company-os/operating-system.md \
  && grep -q 'Use IESER, in this order' company-os/operating-system.md \
  && grep -q 'Use FIRAC before anyone signs' company-os/operating-system.md; then
  ok "2.8.14 speaking rule is pinned (labels first; Decision methods essay kept)"
else
  not_ok "2.8.14 speaking rule strings must exist; do not drop Decision methods"
fi

# --- z4) OS 2.8.15: Clock shrink (five rungs + five weeks) ---
# Separate from Decision methods. No invented Advance. Stored integers stay.
if grep -Fq '**Version:** 2.8.15' company-os/operating-system.md \
  && grep -q '| 2.8.15 |' company-os/operating-system.md \
  && grep -q 'Write the bet' company-os/operating-system.md \
  && grep -q 'Filter cheaply' company-os/operating-system.md \
  && grep -q 'Ground it' company-os/operating-system.md \
  && grep -q 'Build tiny slice' company-os/operating-system.md \
  && grep -q 'Try with real people' company-os/operating-system.md \
  && grep -q 'Keep-doing map (stored integers' company-os/operating-system.md \
  && grep -q '8 or 9 | stay at Try until founder Advance' company-os/operating-system.md \
  && grep -q 'Never skip Write back' company-os/live-runtime.md \
  && grep -q 'five weeks' company-os/live-runtime.md \
  && grep -q 'v2.8.15' company-os/ai-instructions.md \
  && grep -q 'Honor OS 2.8.15' AGENTS.md \
  && grep -q 'OS_VERSION = "2.8.15"' mcp/src/constants.ts \
  && grep -q '2.8.15' company-os/live-runtime.md \
  && grep -q '2.8.15' company-os/ready-for-human-eyes.md \
  && grep -q 'spokenJourneyOf' mcp/src/clock-map.ts \
  && grep -q 'No invented Advance' mcp/src/clock-map.ts \
  && grep -q 'Do not merge Filter + Ground' company-os/operating-system.md \
  && grep -q 'Do not merge Build + Try' company-os/operating-system.md \
  && grep -q 'Do not merge Check + Hear' company-os/live-runtime.md \
  && grep -q 'Use IESER, in this order' company-os/operating-system.md \
  && grep -q 'Use FIRAC before anyone signs' company-os/operating-system.md \
  && grep -q '### Decision methods (aliases, not a third clock)' company-os/operating-system.md; then
  ok "OS 2.8.15 Clock shrink is pinned (Decision methods essay kept)"
else
  not_ok "2.8.15 clock shrink strings must exist; keep Decision methods; no invented Advance"
fi

# --- w) Bootstrap Bill install docs (invite-only; not Path 1) ---
bill=docs/install-bill.md
if [ -s "$bill" ] \
  && grep -Fq 'https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y' "$bill" \
  && grep -Fq 'https://mcp.bootstrap.pirin.ai/mcp' "$bill" \
  && grep -Fq 'https://pirin.ai/bootstrap-os/login' "$bill" \
  && grep -Fq 'https://github.com/ivelin/bootstrapos' "$bill" \
  && grep -Fq 'https://pirin.ai/bootstrap-os' "$bill" \
  && grep -Fq 'bootstrap@pirin.ai' "$bill" \
  && grep -q 'Bill checks your board weekly' "$bill" \
  && grep -q 'Bill watches the board when Cos turns it on' "$bill" \
  && grep -q 'board updates' "$bill" \
  && grep -q 'not.*Path 1' "$bill" \
  && ! grep -qi 'webhook' "$bill" \
  && ! grep -q 'subscribe_board' "$bill" \
  && ! grep -qi 'grokbot' "$bill" \
  && ! grep -q 'vercel.app' "$bill" \
  && ! grep -q 'mcp.pirin.ai' "$bill" \
  && grep -q 'docs/install-bill.md' README.md \
  && grep -q 'That is not Path 1' README.md; then
  ok "Bill install docs lock the live URL, invite MCP + login, Path 1 split, weekly board watch, and feedback"
else
  not_ok "docs/install-bill.md must ship the live Bill URL, invite-only MCP + login (not Path 1), weekly board watch, and bootstrap@pirin.ai — no webhook / subscribe_board / vercel.app or mcp.pirin.ai"
fi

# --- no instance secrets (hard contribution rule) ---
if grep -q 'No instance secrets in this template (hard)' AGENTS.md \
  && grep -q 'Instance secrets in the template' README.md \
  && grep -q 'No instance secrets in the portable template' company-os/operating-system.md \
  && grep -q 'No instance secrets in the template' ROADMAP.md mcp/QA.md; then
  ok "contribution rule no-instance-secrets is recorded"
else
  not_ok "AGENTS.md, README, OS, ROADMAP, and QA.md must record no-instance-secrets"
fi
if python3 - <<'PY'
import os, sys
needles = [
    "z" + "k0",
    "tot" + "box",
    "tot" + "boxapp",
    "tok" + "box",
    "Fed" + "Prox",
    "Smol" + "VLA",
    "hvac" + "_cleaning",
    "3 paid " + "deposits",
    "cocoon" + "hive",
    "/home/ivelin/" + "pirin-ai",
    "ivelin@" + "z" + "k0" + ".bot",
    "hold_" + "z" + "k0",
]
skip_dirs = {".git", "node_modules", "dist", "artifacts", "coverage"}
skip_files = {
    os.path.join("mcp", "test", "no-instance-secrets.test.mjs"),
    os.path.join("tests", "test_day0.sh"),
}
leaks = []
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for name in files:
        rel = os.path.normpath(os.path.join(root, name))
        if rel.startswith("./"):
            rel = rel[2:]
        if rel in skip_files or name.endswith(".lock") or name == "package-lock.json":
            continue
        path = os.path.join(root, name)
        try:
            text = open(path, "r", encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        if "\0" in text:
            continue
        lower = text.lower()
        found = [n for n in needles if n.lower() in lower]
        if found:
            leaks.append(f"{rel}: {', '.join(found)}")
if leaks:
    print("\n".join(leaks[:40]))
    sys.exit(1)
PY
then
  ok "template has no instance company names or confidential phrases"
else
  not_ok "template leaked instance company names or confidential phrases"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
if [ "$fail" -ne 0 ]; then
  exit 1
fi
exit 0
