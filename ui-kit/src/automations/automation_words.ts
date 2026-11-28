// The words every client says when editing an automation, for its Failed group and for the live
// line of a run in progress: ONE canonical file, `automation_edit_words.json` (next to this
// module). Clients that cannot import the kit (the Qt Assistant) vendor it byte for byte. A new
// client-visible word goes in that file first; existing words are never renamed.
import words from "./automation_edit_words.json" with { type: "json" };

export type AutomationEditWords = {
  about: string;
  edit: {
    heading: string;
    save: string;
    cancel: string;
    apply_note: string;
    discard_question: string;
    discard_changes: string;
    keep_editing: string;
    sections: Record<"what" | "model" | "schedule" | "memory" | "tools" | "results", { title: string; hint: string }>;
    fields: {
      title: string;
      task: string;
      provider: string;
      model: string;
      reasoning_and_speed: string;
      memory_switch: string;
      memory_off: string;
      memory_on: string;
      memory_budget: string;
      memory_budget_hint: string;
    };
    tools: { auto: string; ask: string; per_tool: string };
    model_default: string;
    model_not_listed: string;
    model_not_listed_suffix: string;
    model_half_pair: string;
    flow_not_installed_suffix: string;
    flow_not_installed: string;
    flow_not_installed_short: string;
    no_schedule: string;
    no_schedule_manual: string;
    tools_replace_flow: string;
    interval_invalid: string;
    check_interval_min: string;
    first_run_after_save: string;
    task_required: string;
    title_required: string;
    model_errors: { providers: string; models: string; default: string };
  };
  groups: { label: string; failed: string; remember_failed: string };
  failed: { explain: string; restart: string; restart_hint: string; restarted: string; back_on: string; turn_on: string; edit_flow_hint: string; technical: string };
  live: { starting: string; thinking: string; waiting: string; retry: string; steps_one: string; steps_many: string };
  run: { notify_sent: string; working: string };
  header: {
    next: string;
    next_title: string;
    runs_one: string;
    runs_many: string;
    runs_title: string;
    memory_off: string;
    memory_on_title: string;
    flow_title: string;
    when_title: string;
    model_title: string;
    files: string;
    files_title: string;
    workspaces_open: string;
    details: string;
    details_hint: string;
    details_title: string;
    archived: string;
    task_title: string;
    tools_title: string;
    results_title: string;
    change_hint: string;
    parameters: string;
  };
  thread: {
    task_title: string;
    answer_title: string;
    run_line: string;
    new: string;
    earlier: string;
    earlier_loading: string;
    talk_placeholder: string;
    not_run_yet: string;
    loading: string;
    waiting: string;
    stopped: string;
    no_answer: string;
    failed: string;
    sent_to: string;
  };
  context: {
    button: string;
    button_hint: string;
    title: string;
    loading: string;
    failed: string;
    builds_on: string;
    builds_on_no_numbers: string;
    starts_fresh: string;
    count_differs: string;
    instructions: string;
    system: string;
    context_task: string;
    earlier: string;
    left_out: string;
    run_label: string;
    from_task: string;
    from_answer: string;
    trigger: string;
    details: string;
    model: string;
    tools: string;
    no_tools: string;
    raw: string;
  };
};

/** `automation_edit_words.json`, typed (an assignment, not a cast: a missing word fails the build). */
export const AUTOMATION_EDIT_WORDS: Readonly<AutomationEditWords> = words;
