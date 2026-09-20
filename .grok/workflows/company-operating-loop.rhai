let meta = #{
    name: "company-operating-loop",
    description: "Inspect the company OS living instance (status / continue / start); quality-bar artifacts not loopStage writes; founder gates for journey phase",
    when_to_use: "When working the company operating system loop: where are we, continue a week's artifact, or start a new live loop cycle",
    phases: [
        #{ title: "Inspect", detail: "Read instance state and open questions" },
        #{ title: "Research handoff", detail: "When loop/journey is in research-validation, require user-research workflow" },
        #{ title: "Act", detail: "status report, continue loop, or start loop" },
        #{ title: "Gate", detail: "Founder approval if journey advance is requested" },
    ],
};

// args.action: "status" | "continue" | "start" | "advance-journey" | "user-research" (default status)
// args.approve_journey: true only when founder already approved journey advance
// args.note: optional string
// args.signal: optional product signal for the current stage
// args.skip_research_handoff: true only to bypass research gate (founder override)

let action = "status";
let approve_journey = false;
let note = "";
let signal = "";
let skip_research_handoff = false;

if args != () {
    if args.action != () { action = args.action; }
    if args.approve_journey == true { approve_journey = true; }
    if args.note != () { note = args.note; }
    if args.signal != () { signal = args.signal; }
    if args.skip_research_handoff == true { skip_research_handoff = true; }
}

if action != "status" && action != "continue" && action != "start" && action != "advance-journey" && action != "user-research" {
    pause("verification", "args.action must be status | continue | start | advance-journey | user-research");
}

phase("Inspect");

let status_schema = #{
    "type": "object",
    "required": ["journey_phase", "loop_stage", "gate", "summary", "has_state_file"],
    "properties": #{
        "journey_phase": #{ "type": "number" },
        "loop_stage": #{ "type": "number" },
        "gate": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "has_state_file": #{ "type": "boolean" },
        "recommended_next": #{ "type": "string" },
        "state_dir": #{ "type": "string" },
    },
};

let inspect_prompt = "";
inspect_prompt += "You are inspecting THIS company's operating system instance (portable Bootstrap OS). Do not invent a product or import another company's market.\n";
inspect_prompt += "Resolve paths first (do not invent files):\n";
inspect_prompt += "- STATE_DIR: if company/state/company-state.json exists, use company/state/ ; else if templates/company/state/company-state.json exists, use templates/company/state/\n";
inspect_prompt += "- DOCS: if docs/company-os/ exists, use it; else company-os/ and templates/instance/\n";
inspect_prompt += "- RESEARCH: if research/icps/ exists, use it; else templates/research/icps/\n";
inspect_prompt += "Inspect via python3 on where-are-we.py + company-state.json:\n";
inspect_prompt += "  python3 STATE_DIR/where-are-we.py STATE_DIR/company-state.json\n";
inspect_prompt += "Then read STATE_DIR/company-state.json (journeyPhase, gateStatus, lastWeeklySnapshotAt). loopStage is stored back-compat only — not where-we-are.\n";
inspect_prompt += "Optional: DOCS instance README / scores if present.\n";
inspect_prompt += "Report journey_phase (1-9), loop_stage (stored 1-7 back-compat only), gate, a short teenage-founder summary, has_state_file=true if JSON existed,\n";
inspect_prompt += "state_dir used, and recommended_next one of: run-stage, continue, start, advance-journey-needs-founder, user-research, hold.\n";
inspect_prompt += "Where-are-we is journey + gate + constraint + missing artifacts. Do not treat Ask/Do/Write back as a card. If journey_phase is 1-3, recommended_next should lean user-research unless READY_FOR_REAL_WORLD.md exists.\n";
inspect_prompt += "Never claim journey advanced without founder approval. Public-safe. No PII.\n";

let insp = agent(inspect_prompt, #{
    label: "cos-inspect",
    capability_mode: "execute",
    output_schema: status_schema,
});

if insp == () || !insp.success || insp.output == () {
    pause("infra", "Inspect agent failed; fix tools and resume.");
}

let jph = 0;
let lst = 0;
let gate_s = "unknown";
let sum_s = "";
let rec_s = "hold";
if insp.output.journey_phase != () { jph = insp.output.journey_phase; }
if insp.output.loop_stage != () { lst = insp.output.loop_stage; }
if insp.output.gate != () { gate_s = insp.output.gate; }
if insp.output.summary != () { sum_s = insp.output.summary; }
if insp.output.recommended_next != () { rec_s = insp.output.recommended_next; }

log("Inspected company OS: journey=" + jph.to_string() + " loop=" + lst.to_string() + " gate=" + gate_s);

let needs_user_research = false;
if lst == 1 || lst == 2 { needs_user_research = true; }
if jph >= 1 && jph <= 3 { needs_user_research = true; }

phase("Research handoff");

if action == "user-research" {
    let ur_msg = "";
    ur_msg += "Launch the sibling workflow **user-research** (project: .grok/workflows/user-research.rhai).\n\n";
    ur_msg += "Suggested args: { \"mode\": \"round\", \"round_label\": \"1\", \"slate_n\": 3 }\n";
    ur_msg += "Optional: founder_notes, max_rounds (1-5), slate_n (3-10, default 3 for Day-0).\n\n";
    ur_msg += "That workflow: proposes N ICPs from THIS instance thesis → reward/risk scorecards →\n";
    ur_msg += "forced-choice synthetic dialogues → adversarial challenge → report under research/icps/ →\n";
    ur_msg += "founder FOUNDER_FEEDBACK.md gate → iterate until decision agree_ready (writes READY_FOR_REAL_WORLD.md) or kill.\n\n";
    ur_msg += "After agree_ready, re-run company-operating-loop with action=continue.\n";
    ur_msg += "Current cursor: journey=" + jph.to_string() + " loop=" + lst.to_string() + ".\n";
    let urp = write_scratch_file("company-os-user-research-handoff.md", ur_msg);
    await_user("user", ur_msg);
    complete(#{
        action: "user-research",
        path: urp,
        journey_phase: jph,
        loop_stage: lst,
        message: "Handoff: run workflow user-research, then resume company loop.",
        handoff_workflow: "user-research",
    });
}

phase("Act");

if action == "status" {
    let report = "";
    report += "# Company OS status\n\n";
    report += sum_s + "\n\n";
    report += "- journey_phase: " + jph.to_string() + "\n";
    report += "- loop_stage: " + lst.to_string() + "\n";
    report += "- gate: " + gate_s + "\n";
    report += "- recommended_next: " + rec_s + "\n";
    report += "- research_stage_flag: " + needs_user_research.to_string() + "\n";
    report += "\nRead: python3 on where-are-we.py + company-state.json (instance company/state/ if present, else templates/company/state/).\n";
    if needs_user_research {
        report += "\n**Research/validation stage:** run workflow `user-research` (or company-operating-loop action=user-research).\n";
        report += "Artifacts: research/icps/ROUND_*_report.md, FOUNDER_FEEDBACK.md, READY_FOR_REAL_WORLD.md\n";
    }
    let p = write_scratch_file("company-os-status.md", report);
    complete(#{
        action: "status",
        path: p,
        journey_phase: jph,
        loop_stage: lst,
        gate: gate_s,
        summary: sum_s,
        needs_user_research: needs_user_research,
    });
}

let act_schema = #{
    "type": "object",
    "required": ["ok", "message", "journey_phase", "loop_stage", "gate"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "message": #{ "type": "string" },
        "journey_phase": #{ "type": "number" },
        "loop_stage": #{ "type": "number" },
        "gate": #{ "type": "string" },
    },
};

if action == "start" {
    let start_prompt = "";
    start_prompt += "Start or restart the company OS live loop. Founder-visible. Do not invent a product.\n";
    start_prompt += "Resolve STATE_DIR: company/state/ if company-state.json is there, else templates/company/state/.\n";
    start_prompt += "Do NOT write loopStage. Mutations are rejected. Ask/Do/Write back is a quality bar, not a card.\n";
    start_prompt += "Do NOT change journeyPhase.\n";
    start_prompt += "Set lastAction to a short note like loop_started so the founder can see it.\n";
    start_prompt += "Update updatedAt if that field exists.\n";
    if note != "" {
        start_prompt += "Founder note to record in lastAction or open questions: " + note + "\n";
    }
    start_prompt += "Then re-run: python3 STATE_DIR/where-are-we.py STATE_DIR/company-state.json\n";
    start_prompt += "Report ok, message, journey_phase, loop_stage (unchanged stored integer), gate.\n";
    start_prompt += "Journey phase must NOT increase. Do not mutate loopStage.\n";
    start_prompt += "Public-safe only. No PII.\n";

    let started = agent(start_prompt, #{
        label: "cos-start",
        capability_mode: "execute",
        output_schema: act_schema,
    });

    if started == () || !started.success || started.output == () {
        pause("infra", "start action agent failed");
    }

    let sok = true;
    let smsg = "start completed";
    let sj = jph;
    let sl = 1;
    let sg = gate_s;
    if started.output.ok != () { sok = started.output.ok; }
    if started.output.message != () { smsg = started.output.message; }
    if started.output.journey_phase != () { sj = started.output.journey_phase; }
    if started.output.loop_stage != () { sl = started.output.loop_stage; }
    if started.output.gate != () { sg = started.output.gate; }

    complete(#{
        action: "start",
        ok: sok,
        message: smsg,
        journey_phase: sj,
        loop_stage: sl,
        gate: sg,
    });
}

if action == "continue" {
    if needs_user_research && !skip_research_handoff {
        let ready_check_schema = #{
            "type": "object",
            "required": ["ready_marker", "summary"],
            "properties": #{
                "ready_marker": #{ "type": "boolean" },
                "summary": #{ "type": "string" },
                "latest_report": #{ "type": "string" },
            },
        };
        let rc_p = "";
        rc_p += "Check whether synthetic user research is complete enough to advance past research stages.\n";
        rc_p += "Resolve RESEARCH dir: research/icps/ if present, else templates/research/icps/.\n";
        rc_p += "Read with tools (do not invent):\n";
        rc_p += "- RESEARCH/READY_FOR_REAL_WORLD.md (ready_marker=true only if file exists and founder agreed)\n";
        rc_p += "- RESEARCH/FOUNDER_FEEDBACK.md and latest ROUND_*_report.md if present\n";
        rc_p += "If the ready marker is missing, ready_marker=false. Return ready_marker, summary, latest_report path or empty string.\n";
        let rchk = agent(rc_p, #{
            label: "cos-research-ready-check",
            capability_mode: "read-only",
            output_schema: ready_check_schema,
        });
        let is_ready = false;
        let rsum = "research readiness unknown";
        if rchk != () && rchk.success && rchk.output != () {
            if rchk.output.ready_marker == true { is_ready = true; }
            if rchk.output.summary != () { rsum = rchk.output.summary; }
        }
        if !is_ready {
            let hand = "";
            hand += "Company OS continue blocked: loop/journey is in RESEARCH or VALIDATION territory\n";
            hand += "(loop_stage " + lst.to_string() + ", journey_phase " + jph.to_string() + ").\n\n";
            hand += "Readiness check: " + rsum + "\n\n";
            hand += "Run sibling workflow **user-research** until founder decision agree_ready\n";
            hand += "(creates research/icps/READY_FOR_REAL_WORLD.md).\n\n";
            hand += "How:\n";
            hand += "1) /workflow user-research with args {\"mode\":\"round\",\"round_label\":\"1\",\"slate_n\":3}\n";
            hand += "   or company-operating-loop action=user-research for the handoff card\n";
            hand += "2) Review research/icps/ROUND_*_report.md; edit FOUNDER_FEEDBACK.md; resume until agree_ready\n";
            hand += "3) Re-run company-operating-loop continue\n\n";
            hand += "Override only if intentional: args.skip_research_handoff=true\n";
            write_scratch_file("company-os-research-blocked.md", hand);
            await_user("user", hand);
            let rchk2 = agent(rc_p, #{
                label: "cos-research-ready-recheck",
                capability_mode: "read-only",
                output_schema: ready_check_schema,
            });
            let is_ready2 = false;
            let rsum2 = rsum;
            if rchk2 != () && rchk2.success && rchk2.output != () {
                if rchk2.output.ready_marker == true { is_ready2 = true; }
                if rchk2.output.summary != () { rsum2 = rchk2.output.summary; }
            }
            if !is_ready2 {
                complete(#{
                    action: "continue",
                    ok: false,
                    message: "Blocked pending user-research agree_ready: " + rsum2,
                    journey_phase: jph,
                    loop_stage: lst,
                    gate: gate_s,
                    handoff_workflow: "user-research",
                    needs_user_research: true,
                });
            }
            log("Research ready marker present after handoff; proceeding with continue");
        }
    }

    let cont_prompt = "";
    cont_prompt += "Continue the company OS live loop by closing this week's artifact. Do not invent a product.\n";
    cont_prompt += "Resolve STATE_DIR: company/state/ if present, else templates/company/state/.\n";
    cont_prompt += "1) Read company-state.json. Note journeyPhase, gate, lastWeeklySnapshotAt. loopStage is not a card.\n";
    if signal != "" {
        cont_prompt += "   Product signal the founder passed (do not treat as proof): " + signal + "\n";
    }
    cont_prompt += "2) Do NOT write loopStage. Refuse station work without the artifact (Ask = kill line + groups; Do = one-page thesis; Write back = dated stated + what we will not do). clock-examples is teaching only.\n";
    cont_prompt += "3) Do NOT change journeyPhase. Never silent-advance the journey.\n";
    cont_prompt += "4) Set lastAction to a short founder-visible note (loop_continue). Patch openQuestions if needed. Update updatedAt if present.\n";
    cont_prompt += "5) Re-run: python3 STATE_DIR/where-are-we.py STATE_DIR/company-state.json\n";
    cont_prompt += "If research/icps/READY_FOR_REAL_WORLD.md exists, mention it in message.\n";
    cont_prompt += "Report ok, message, journey_phase, loop_stage, gate.\n";
    cont_prompt += "If gate is waiting or waiting_for_founder, set ok=false and explain founder is needed.\n";

    let cont = agent(cont_prompt, #{
        label: "cos-continue",
        capability_mode: "execute",
        output_schema: act_schema,
    });

    if cont == () || !cont.success || cont.output == () {
        pause("infra", "continue action agent failed");
    }

    let cok = true;
    let cmsg = "continue completed";
    let cj = jph;
    let cl = lst;
    let cg = gate_s;
    if cont.output.ok != () { cok = cont.output.ok; }
    if cont.output.message != () { cmsg = cont.output.message; }
    if cont.output.journey_phase != () { cj = cont.output.journey_phase; }
    if cont.output.loop_stage != () { cl = cont.output.loop_stage; }
    if cont.output.gate != () { cg = cont.output.gate; }

    complete(#{
        action: "continue",
        ok: cok,
        message: cmsg,
        journey_phase: cj,
        loop_stage: cl,
        gate: cg,
        needs_user_research: needs_user_research,
    });
}

phase("Gate");

if action == "advance-journey" {
    if !approve_journey {
        await_user(
            "user",
            "Journey phase advance requires explicit founder approval. Resume only if you approve advancing ONE journey phase, and re-run with args.approve_journey=true. This edits company-state.json journeyPhase by +1 — never silent."
        );
        pause(
            "verification",
            "Re-launch company-operating-loop with args: { \"action\": \"advance-journey\", \"approve_journey\": true } after you approve."
        );
    }

    let adv_prompt = "";
    adv_prompt += "Founder APPROVED journey advance. This must be visible — never silent.\n";
    adv_prompt += "Resolve STATE_DIR: company/state/ if present, else templates/company/state/.\n";
    adv_prompt += "Edit company-state.json: increment journeyPhase by 1 (max 9). Do not skip phases.\n";
    adv_prompt += "Set lastAction to journey_advanced. Update updatedAt if present.\n";
    if note != "" {
        adv_prompt += "Include note context: " + note + "\n";
    }
    adv_prompt += "Re-run: python3 STATE_DIR/where-are-we.py STATE_DIR/company-state.json\n";
    adv_prompt += "journey_phase must increase by 1. Report ok, message, journey_phase, loop_stage, gate.\n";

    let adv = agent(adv_prompt, #{
        label: "cos-journey-advance",
        capability_mode: "execute",
        output_schema: act_schema,
    });

    if adv == () || !adv.success || adv.output == () {
        pause("infra", "advance-journey agent failed");
    }

    let aok = true;
    let amsg = "journey advanced";
    let aj = jph;
    let al = lst;
    let ag = gate_s;
    if adv.output.ok != () { aok = adv.output.ok; }
    if adv.output.message != () { amsg = adv.output.message; }
    if adv.output.journey_phase != () { aj = adv.output.journey_phase; }
    if adv.output.loop_stage != () { al = adv.output.loop_stage; }
    if adv.output.gate != () { ag = adv.output.gate; }

    complete(#{
        action: "advance-journey",
        ok: aok,
        message: amsg,
        journey_phase: aj,
        loop_stage: al,
        gate: ag,
    });
}

pause("verification", "Unhandled action branch");
