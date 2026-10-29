export { THEMES, THEME_SPECS, applyTheme, getThemeSpec, themeClassName, type ThemeOption, type ThemeSpec } from "./theme.js";
export { FONT_SCALES, HEADER_DENSITIES, applyTypography, getFontScaleSpec, getHeaderDensitySpec, type FontScaleOption, type HeaderDensityOption } from "./typography.js";
export { AF_BREAKPOINTS, AF_MEDIA, installViewportVars, useAfMedia, viewportVarsFrom, type AfVisualViewportSample } from "./responsive.js";
export { AfSelect, type AfSelectProps, type AfSelectOption } from "./af_select.js";
export { ProviderModelSelect, type ProviderModelSelectProps, type ProviderOption } from "./provider_model_select.js";
export { ProviderModelPicker, PICKER_DISCOVERY_UNAVAILABLE, PICKER_REASONING_UNAVAILABLE, type ProviderModelPickerProps, type ProviderModelPickerValue } from "./provider_model_picker.js";
export { SpeculationSelect } from "./speculation_select.js";
export { normalizeSpeculationValue, speculationCapability, speculationSelection, speculationFromSelection, type SpeculationValue, type SpeculationCapability } from "./speculation_control.js";
export {
  GatewaySessionSignInCard,
  type GatewaySessionSignInCardProps,
  type GatewaySessionStatusTone,
} from "./gateway_session_signin.js";
export { ThemeSelect, type ThemeSelectProps } from "./theme_select.js";
export { FontScaleSelect, HeaderDensitySelect, type FontScaleSelectProps, type HeaderDensitySelectProps } from "./typography_select.js";
export { Icon, ICON_NAMES, type IconName } from "./icon.js";
export { GATEWAY_API_PATH, GATEWAY_CONNECTION_PATH, gatewayApiPath, gatewayResourcePath, joinBaseUrl } from "./gateway_paths.js";
export {
  ToolPolicyEditor,
  TOOL_POLICY_DEFAULTS,
  type ToolPolicyEditorProps,
  type ToolPolicySelection,
  type ToolPolicyDefaults,
  type ToolSpec,
  type ToolApprovalMode,
  type ToolStateBadge,
} from "./tool_policy_editor.js";
export {
  MATRIX_SCHEMA_VERSION,
  validateMatrixPayload,
  resolveCellView,
  applyCellAction,
  reconcilePatches,
  serializeCellPatches,
  type MatrixPayload,
  type MatrixPhase,
  type MatrixSection,
  type MatrixItem,
  type MatrixCell,
  type MatrixCellView,
  type MatrixCellControl,
  type MatrixCellOp,
  type MatrixCellPatch,
  type MatrixPatchDocument,
  type MatrixAvailability,
  type MatrixProvenance,
  type MatrixTrustState,
  type MatrixValidation,
} from "./phase_capability_matrix_core.js";
export { PhaseCapabilityMatrix, type PhaseCapabilityMatrixProps } from "./phase_capability_matrix.js";
export {
  resolveCriticalActionGate,
  normalizeCriticalActionFacts,
  type CriticalActionFact,
  type CriticalActionFacts,
  type CriticalActionGate,
  type CriticalActionGateInput,
} from "./critical_action_core.js";
export { CriticalActionDialog, type CriticalActionDialogProps } from "./critical_action_dialog.js";
export {
  GatewayConnectModal,
  fetchGatewayConnection,
  signInGateway,
  signOutGateway,
  gatewayStatusBadge,
  normalizeGatewayUrl,
  type GatewayConnectModalProps,
  type GatewayConnectionState,
} from "./gateway_connect_modal.js";
export {
  useGatewayConnection,
  isGatewayConnected,
  type GatewayConnection,
  type GatewayConnectionPhase,
  type UseGatewayConnectionOptions,
} from "./use_gateway_connection.js";
export {
  SteerComposer,
  submitSteer,
  readGatewayCsrfToken,
  readGatewayCsrfTokens,
  type SteerComposerProps,
  type SteerSubmitResult,
} from "./steer_composer.js";
export {
  DisclosureList,
  type DisclosureRow,
  type DisclosureSelection,
  type DisclosureListProps,
  type DisclosureListHandle,
} from "./disclosure_list.js";
export { AfChip, AfChipButton, afChipHue, type AfChipProps, type AfChipButtonProps, type AfChipTone } from "./af_chip.js";
export { AfDrawer, type AfDrawerProps } from "./af_drawer.js";
export { AfModal, type AfModalProps } from "./af_modal.js";
export { bindAfModal, afModalTabTarget, afModalFocusables, AF_MODAL_FOCUSABLE, type BindAfModalOptions } from "./af_modal_core.js";
export { AfMenu, type AfMenuProps, type AfMenuItem } from "./af_menu.js";
export { bindAfMenu, afMenuPlacement, type BindAfMenuOptions, type AfMenuPlacement, type AfMenuRect } from "./af_menu_core.js";
export { AfTopBarActions, type AfTopBarActionsProps } from "./af_top_bar_actions.js";
export {
  frameworkIdentity,
  appIdentity,
  knownAppIds,
  aboutRows,
  gatewayVersionRows,
  type FrameworkIdentity,
  type AppIdentity,
  type AboutRow,
  type GatewayAboutPayload,
} from "./identity.js";
export { AfAbout, AfAboutDialog, aboutLinks, aboutVersionFacts, aboutVersionsFromGateway, type AfAboutDialogProps, type AfAboutProps, type AfAboutVersions } from "./about.js";
export {
  AfAppearanceDialog,
  useAppearanceSettings,
  appearanceStorageKey,
  APPEARANCE_DEFAULTS,
  type AppearanceSettings,
  type AfAppearanceDialogProps,
} from "./appearance.js";
export { useGatewayVoice, streamTtsJsonl, voiceErrorSentence, MIN_RECORDING_MS, type GatewayVoice, type GatewayVoiceOptions, type TtsPlaybackStatus, type VoiceTranscription } from "./use_gateway_voice.js";
export { AfPhaseRadio, type AfPhaseRadioProps, type AfPhaseSlot } from "./af_phase_radio.js";
export { AfCognitionBloom, type AfCognitionBloomProps } from "./af_cognition_bloom.js";
export { AfConductGauge, type AfConductGaugeProps } from "./af_conduct_gauge.js";
export { AfMemoryHintChip, type AfMemoryHintChipProps } from "./af_memory_hint_chip.js";
export {
  conductAxes,
  isVerifyShaped,
  runningMedian,
  type ConductFacts,
  type ConductToolCall,
  type ConductBaseline,
  type ConductAxis,
  type ConductAxisId,
} from "./cognition_conduct_core.js";
export {
  EMOTION_REGISTERS,
  createBloomState,
  setBloomTargets,
  tickBloom,
  readBloom,
  drawBloomFrame,
  vignetteColor,
  effortRows,
  type EmotionRegister,
  type BloomState,
  type BloomReading,
  type BloomRenderOptions,
  type EffortFacts,
  type EffortRow,
} from "./cognition_bloom_core.js";
export {
  VoiceSettings,
  CreateVoicePanel,
  VOICE_SAMPLE_DEBOUNCE_MS,
  voiceGroup,
  voiceLanguage,
  voiceLanguages,
  voiceSpeaks,
  voiceLanguageLabel,
  voiceNameInCatalog,
  voiceLabel,
  isOpaqueId,
  cloneModelOf,
  type VoicePreferences,
  type VoiceCatalog,
  type VoiceCreation,
} from "./voice_settings.js";
export {
  RULED_PHASES,
  PHASE_DESCRIPTORS,
  normalizePhase,
  reconcilePhaseList,
  type AfPhase,
  type PhaseDescriptor,
} from "./phase_radio_core.js";
export type {
  ApiError,
  ApiErrorCode,
  AttentionItem,
  AttentionWait,
  AutomationAttention,
  AutomationChanges,
  AutomationCommandType,
  AutomationDefinition,
  AutomationDetail,
  AutomationPolicyInput,
  AutomationStatus,
  AutomationNotify,
  EmailEventPayload,
  EmailFilter,
  EmailReceivedConfig,
  MyEmailStatus,
  NotifyChannel,
  AutomationSummary,
  AutomationTarget,
  CommandReceipt,
  ContextMode,
  CurrentOccurrence,
  CreateAutomationRequest,
  CreateAutomationResponse,
  DiscussResponse,
  Duration,
  LastOccurrence,
  ManualEventPayload,
  Notify,
  OccurrenceArtifact,
  OccurrenceFailure,
  OccurrenceRow,
  OccurrenceWait,
  Page,
  RetryPolicy,
  ScheduleConfig,
  CalendarDay,
  CalendarScheduleConfig,
  ScheduleV2Config,
  SchedulePreview,
  ScheduleEventPayload,
  Timestamp,
  ToolApprovalPolicy,
  ToolCallToApprove,
  TriggerBinding,
  TriggerEnvelope,
  TriggerSource,
  TriggerSourceEntry,
  TriggerSourceKind,
  TriggerSpec,
  TriggerConnection,
  Mailbox,
  WaitAnswer,
  WaitKind,
} from "./automations/types.js";
export {
  AUTOMATIONS_PATH,
  MY_EMAIL_PATH,
  MY_MAILBOXES_PATH,
  TRIGGER_CONNECTIONS_PATH,
  SCHEDULE_PREVIEW_PATH,
  TRIGGER_SOURCES_PATH,
  AutomationApiError,
  createAutomationsClient,
  parseApiError,
  type AutomationsClient,
  type AutomationsClientOptions,
  type ListAutomationsQuery,
  type PageQuery,
} from "./automations/client.js";
export {
  API_ERROR_TEXT,
  ActionIds,
  SeenAckTracker,
  isDefinitiveError,
  TOOL_APPROVAL_CONSENT,
  WAIT_KIND_LABELS,
  waitToolCalls,
  parseEventPayload,
  CONTROL_COMMANDS,
  SCHEDULE_PRESETS,
  STATUS_LABELS,
  apiErrorText,
  attentionAckCursor,
  attentionLabel,
  automationControls,
  buildCreateRequest,
  contextLabel,
  DEFAULT_EMAIL_RECIPIENTS,
  DEFAULT_EMAIL_TRIGGER_FORM,
  EMAIL_DEFAULT_EVERY_MODEL,
  EMAIL_DEFAULT_EVERY_NO_MODEL,
  EMAIL_DEFAULT_MAX_BATCH,
  EMAIL_MAX_BATCH,
  EMAIL_MIN_EVERY_SECONDS,
  EMAIL_TEXT,
  EMAIL_TRIGGER_SOURCE_ID,
  EMAIL_TRIGGER_SOURCE_VERSION,
  emailAllowedRecipientsFrom,
  emailDefaultEvery,
  emailRecipientsFormFrom,
  emailRecipientsLabel,
  emailTriggerConfigFrom,
  emailTriggerLabel,
  emailUsable,
  isEmailTrigger,
  isPlainAddress,
  isPlainDomain,
  notifyEmails,
  notifyFor,
  notifyLabel,
  parseEntryList,
  type EmailAttachmentFilter,
  type EmailRecipientsForm,
  type EmailTriggerForm,
  currentOccurrenceLabel,
  relativeIn,
  formatUtc,
  intervalLabel,
  isApiError,
  occurrenceViews,
  parseDuration,
  DEFAULT_GROWING_MAX_TOKENS,
  GROWING_CONTEXT_HELP,
  reviseChanges,
  reviseFormFrom,
  scheduleLabel,
  triggerSummary,
  activeToggleCommand,
  type ControlId,
  type ControlState,
  type OccurrenceTone,
  type OccurrenceView,
  type ReviseDefinition,
  type ReviseForm,
  type ScheduleForm,
  type ScheduleWhen,
  // Round 16 (R16.1): calendar rules + served schedule facts.
  CALENDAR_DAYS,
  CALENDAR_KINDS,
  SCHEDULE_VERSION,
  SCHEDULE_TEXT,
  WALL_TIME_RE,
  calendarConfigFrom,
  calendarWhenFrom,
  isScheduleV2,
  isServedPreviewWhen,
  formatServedLocal,
  nextRunLabel,
  NEXT_RUN_WORDS,
  WALL_DATETIME_RE,
  isCalendarWhen,
  scheduleTriggerFrom,
  scheduleConfigFrom,
  schedulePreview,
  servedRuleText,
  timeZoneLine,
  type CalendarKind,
  type ScheduleText,
} from "./automations/panel_core.js";
export {
  AfCalendarRuleFields,
  AfServedSchedule,
  AfTimeZoneLine,
  DEFAULT_CALENDAR_AT,
  DEFAULT_CALENDAR_DAYS,
  calendarWhenOf,
  calendarRuleOf,
  calendarStateOf,
  withCalendarRule,
  DEFAULT_CALENDAR_STATE,
  type CalendarRuleState,
  useSchedulePreview,
  type CalendarWhen,
  type PreviewSchedule,
  type PreviewState,
} from "./automations/schedule_when.js";
export {
  AutomationPanel,
  AutomationReviseForm,
  type AutomationReviseFormProps,
  AutomationStateLabel,
  CONTROL_ICONS,
  CONTROL_HINTS,
  CONTROL_LABELS,
  RUN_NOW_GROWING_LINE,
  RUN_NOW_GLYPH,
  ATTENTION_GLYPH,
  ATTENTION_TEXT,
  attentionBadgeTooltip,
  attentionBadgeLabel,
  type AttentionText,
  RUN_NOW_NEXT_RUN_LINE,
  RUN_NOW_ONE_LINE,
  controlHint,
  DISCUSS_LABEL,
  RECEIVED_LABEL,
  taskOfTurn,
  occurrenceStartWords,
  STATUS_ICONS,
  plainTextRenderer,
  type AutomationPanelProps,
  type AutomationTurn,
  type GatewayResource,
  type RenderText,
  type RenderTurn,
} from "./automations/AutomationPanel.js";
export { AfScheduleDialog, dialogPreviewTrigger, dialogShowsZone, type AfScheduleDialogProps } from "./automations/AfScheduleDialog.js";
export {
  AfEmailOptionsFields,
  AfEmailSetupNotice,
  AfEmailTriggerFields,
  type AfEmailOptionsFieldsProps,
  type AfEmailSetupNoticeProps,
  type AfEmailTriggerFieldsProps,
} from "./automations/email_fields.js";
export { AfSwitch, AfSwitchInput, afSwitchIsActionable, afSwitchNextState, type AfSwitchProps } from "./af_switch.js";
export { findVerbToggleLabels, type VerbToggleHit } from "./state_toggle_lint.js";
export { randomId, uuidV4FromBytes, insecureContextReason } from "./random_id.js";
export { checkLabelScale, LABEL_SCALE_SELECTOR, type LabelScaleHit, type LabelScaleOptions, HELPER_SCALE_SELECTOR, HELPER_MIN_PX, HELPER_MIN_TOUCH_PX, HELPER_TOUCH_MEDIA } from "./label_scale.js";
export { AfTabs, afTabsNextIndex, type AfTab, type AfTabsProps } from "./af_tabs.js";
export {
  WorkflowPicker,
  WorkflowPickerListbox,
  useExecutableWorkflows,
  type WorkflowPickerListboxProps,
  type ExecutableWorkflowsState,
  type UseExecutableWorkflowsOptions,
  type WorkflowPickerProps,
  type WorkflowPickerRequest,
} from "./workflow_picker.js";
export {
  WORKFLOW_PICKER_DEFAULT,
  WORKFLOW_PICKER_EMPTY,
  WORKFLOW_PICKER_GROUP_LABELS,
  WorkflowPickerContractError,
  allWorkflowsPath,
  executableWorkflowsPath,
  parseWorkflowListing,
  workflowPickerPath,
  gatewayDefaultDetail,
  parseExecutableWorkflows,
  workflowEntryDetail,
  workflowEntryTitle,
  workflowInterfaceLabel,
  WORKFLOW_INTERFACE_LABELS,
  workflowPickerGroups,
  workflowPickerNextIndex,
  workflowPickerRows,
  type ExecutableWorkflows,
  type WorkflowPickerRow,
  type WorkflowPickerDefault,
  type WorkflowPickerEntry,
  type WorkflowPickerGroup,
  type WorkflowPickerGroupId,
} from "./workflow_picker_core.js";

export { MultiSelect } from "./multi_select.js";
export { automationToolSelection, withAutomationTools } from "./automations/tool_selection.js";
export { AutomationToolsPicker } from "./automations/automation_tools_picker.js";
export { AutomationWorkflowPicker, flowNameOf, type AutomationWorkflowPickerOptions } from "./automations/automation_workflow_picker.js";
export { retargetAutomationInput, automationTargetValue } from "./automations/target_selection.js";
export { prepareAutomationTarget } from "./automations/prepare_target.js";
export {
  TRIGGER_WORDS_TEXT,
  connectionKind,
  connectionOf,
  connectionSentence,
  isEventTrigger,
  mailboxName,
  occurrenceEventCard,
  triggerConnectionId,
  triggerSourceName,
  triggerWords,
  whenWords,
  type OccurrenceEventCard,
} from "./automations/trigger_words.js";
export { automationTiming, compactCadence, compactDuration, lastRunText, nextRunText, type AutomationTiming } from "./automations/timing_line.js";
export { triggerSourceProblem } from "./automations/AutomationPanel.js";
// ui-kit 0.6.0 (round 4): rail drawer, file viewer, code highlighter, settings rows, voice section, relative time.
export { AfRailDrawer, AF_RAIL_WIDTH, railDrawerClampWidth, railDrawerKeyWidth, railDrawerNextIndex, railDrawerToggle, type AfRailDrawerProps, type AfRailItem } from "./af_rail_drawer.js";
export { AfFileViewer, fileViewerKind, fileViewerNeedsText, formatFileSize, type AfFileViewerKind, type AfFileViewerProps } from "./af_file_viewer.js";
export { AfCodeBlock, codeLanguage, highlightCode, type AfCodeBlockProps, type CodeToken, type CodeTokenKind } from "./code_highlight.js";
export { WorkspaceChooser, workspaceRunState, type WorkspaceChooserProps, type WorkspaceChooserStoredProps, type WorkspaceChooserRunProps } from "./workspace_chooser.js";
export {
  WORKSPACE_CHOOSER_TEXT,
  workspacePostureLabel,
  workspacePostureHelp,
  workspaceModeLabel,
  workspaceLevelHelp,
  workspaceModesUnderCap,
  workspaceChooserView,
  workspaceNewRowMode,
  workspaceModePayload,
  workspacePosturePayload,
  workspaceDefaultModePayload,
  workspaceAddPayload,
  workspaceRemovePayload,
  workspaceFollowPayload,
  workspacePolicyPath,
  workspaceDryRunPath,
  workspaceAsPolicy,
  workspaceAsEffective,
  workspaceAsState,
  workspaceChooserClient,
  workspaceDryRun,
  workspaceErrorSentence,
  workspaceRefusal,
  type WorkspaceMode,
  type WorkspaceAccess,
  type WorkspacePosture,
  type WorkspaceLevel,
  type WorkspaceRule,
  type WorkspacePolicy,
  type WorkspaceEffective,
  type WorkspaceEffectiveRow,
  type WorkspaceChooserState,
  type WorkspaceRunValue,
  type WorkspacePayload,
  type WorkspaceChooserView,
  type WorkspaceChooserRow,
  type WorkspaceChooserText,
  type WorkspaceTarget,
  type WorkspaceRequest,
} from "./workspace_chooser_core.js";
export { AfSettingsGroup, AfSettingRow, AfOverrideRow, type AfSettingsGroupProps, type AfSettingRowProps, type AfOverrideRowProps } from "./af_settings_rows.js";
export {
  AfVoiceSection,
  VOICE_LATENCY_OPTIONS,
  VOICE_LANGUAGE_OPTIONS,
  voiceTtsRequest,
  voiceSttRequest,
  voiceTtsOverrideSummary,
  voiceSttOverrideSummary,
  type AfVoiceSectionProps,
  type VoiceClientPreferences,
} from "./af_voice_section.js";
export { formatRelativeTime, formatExactTime, formatShortDate, timeValueMs } from "./relative_time.js";
export { audioOutputSelectable } from "./use_gateway_voice.js";
// ui-kit 0.7.0 (round 5): the shared waveform audio player (AfFileViewer plays audio with it).
export { AfAudioPlayer, AUDIO_WAVEFORM_BARS, audioPeaks, audioSeekTime, formatAudioTime, type AfAudioPlayerProps } from "./af_audio_player.js";
// ui-kit 0.7.1 (round 6): the gateway's voice routes + devices, tests, level meter.
export {
  voiceDefaultSummary,
  voiceRouteText,
  sttRouteText,
  transcribingLine,
  elapsedSeconds,
  microphoneErrorSentence,
  listVoiceDevices,
  unlockDeviceLabels,
  openMicrophone,
  watchLevel,
  recordSample,
  playOnDevice,
  playTestTone,
  inputGainSupported,
  clampVolume,
  SILENT_LEVEL,
  type VoiceDefaults,
  type VoiceRouteDefault,
  type VoiceDevice,
} from "./voice_devices.js";
export { AfTooltip, useAfTooltips, type AfTooltipProps } from "./af_tooltip.js";
export { bindAfTooltips, acquireAfTooltips, afTooltipPlacement, AF_TOOLTIP_DELAY_MS, AF_TOOLTIP_ATTR, type BindAfTooltipsOptions, type AfTooltipPlacement, type AfTooltipRect } from "./af_tooltip_core.js";
// ui-kit 0.8.7 (round 16, R16.1 A2): the account time-zone picker (preferences).
export { AfTimeZonePicker, TIME_ZONE_GATEWAY_DEFAULT, timeZoneOptions, type AfTimeZonePickerProps, type TimeZonePreference } from "./time_zone_picker.js";
// --- ui-primitives (voice) ---
// 0035: voice IN / voice OUT as standalone composables, the one microphone button, the
// preference and defaults hooks, the voice library, the gateway's voice routes.
export { AfVoiceOutput, SAFARI_OUTPUT_NOTE, type AfVoiceOutputProps, type AfVoiceOutputLabels, type VoiceOutputValue, type VoiceDeviceLister } from "./af_voice_output.js";
export { AfVoiceInput, clampInputGain, type AfVoiceInputProps, type AfVoiceInputLabels, type VoiceInputValue } from "./af_voice_input.js";
export { AfVoiceMicButton, VOICE_MIC_TEXT, type AfVoiceMicButtonProps } from "./af_voice_mic_button.js";
export { useVoiceDefaults, type VoiceDefaultsState } from "./use_voice_defaults.js";
export { useVoicePreferences, loadVoicePreferences, saveVoicePreferences } from "./use_voice_preferences.js";
export { VOICE_CAPTURE_OPTIONS, gatewayVoiceOptions, type AfVoiceSectionRows } from "./af_voice_section.js";
export {
  VoiceLibraryPanel,
  VOICE_LANGUAGE_LABELS,
  VOICE_RECORDING_MAX_MS,
  voiceLanguagesFromAnswer,
  voiceRecordId,
  type VoiceLibrary,
  type VoiceRecord,
  type VoiceRecordFrom,
  type VoicePlayOn,
} from "./voice_settings.js";
export { voiceCaptureMode, type VoiceCaptureMode } from "./use_gateway_voice.js";
export { recordingAbortError } from "./voice_devices.js";
export { AfVoiceLevelMeter, useVoiceLevel, type AfVoiceLevelMeterProps, type VoiceLevelSource } from "./af_voice_level_meter.js";
export { GATEWAY_VOICE_ROUTES, voiceClonePath, voiceCloneDeployPath, runVoiceTtsPath, runTranscribePath, entityVoicePath } from "./gateway_paths.js";
// --- ui-primitives (tools-models) ---
// Backlog 0033 (tool selection) + 0034 (provider/model/reasoning/MTP picker), ADR 0001.
export {
  TOOL_MODES,
  normalizeToolMode,
  toolModeInDialect,
  normalizeToolCatalog,
  toolCatalogWarnings,
  effectiveToolLayers,
  resolveToolModes,
  inheritedToolModes,
  setToolMode,
  setGroupToolMode,
  BULK_AUTO_MAX_RANK,
  bulkAutoReaches,
  hasToolChoices,
  planRunTools,
  withRunTools,
  toWorkflowApprovalPolicy,
  trustAfterApproveAll,
  approvalCovered,
  type ToolMode,
  type ToolModeDialect,
  type ToolCatalogItem,
  type ToolModeLayer,
  type ToolLayers,
  type ToolModeSource,
  type ResolvedToolMode,
  type RunToolPolicy,
  type RunToolPlan,
  type WorkflowToolApprovalPolicyShape,
} from "./tool_plan.js";
export {
  ToolModeEditor,
  ToolModeEditorForPayload,
  type ToolModeEditorForPayloadProps,
  TOOL_MODE_LABELS,
  TOOL_LAYER_RESET,
  TOOL_LAYER_OWNER,
  BULK_AUTO_CAP_SENTENCE,
  type ToolModeEditorProps,
  type ToolModeLabels,
} from "./tool_mode_editor.js";
export {
  createToolLayerStore,
  toolIdentityKey,
  TOOL_LAYER_STORE_WHERE,
  TOOL_SESSION_LAYERS_MAX,
  type ToolLayerStore,
} from "./tool_layer_store.js";
export { describeToolMode, toolPolicySelectionToLayer } from "./tool_policy_editor.js";
export {
  gatewayTextDefault,
  gatewayDefaultSummary,
  gatewayDefaultLabel,
  reasoningLadderFrom,
  createGatewayModelTransport,
  withRunModel,
  type GatewayModelDefault,
  type GatewayRequest,
  type GatewayModelTransport,
  type RunModelValue,
} from "./gateway_models.js";
export {
  GATEWAY_TOOLS_ROUTE,
  GATEWAY_PROVIDERS_ROUTE,
  GATEWAY_MODEL_CAPABILITIES_ROUTE,
  GATEWAY_CAPABILITY_DEFAULTS_ROUTE,
  GATEWAY_CAPABILITIES_ROUTE,
  gatewayProviderModelsRoute,
} from "./gateway_paths.js";
export { PINNED_FIELD_TEXT } from "./provider_model_select.js";
export { PICKER_REASONING_UNKNOWN, PICKER_REASONING_OVERRIDE } from "./provider_model_picker.js";
// --- ui-primitives (shell) ---
// Backlog 0036 (ADR 0001): the app shell — identity in the top-right cluster, the drawer
// system (AfRailDrawer is now a wrapper over it), AfAppShell, the kit-owned About fetch.
export { AfAppShell, type AfAppShellProps, type AfAppShellTopBar, type AfAppShellNav } from "./af_app_shell.js";
export {
  AfDrawerSystem,
  AfPanelHeaderActions,
  AfPanelErrorBoundary,
  railDrawerDragWidth,
  railDrawerSide,
  railDrawerActiveFor,
  railDrawerSetActive,
  railDrawerParseRequest,
  railDrawerMounted,
  railDrawerReadStored,
  railDrawerWriteStored,
  railDrawerPanelWidth,
  railDrawerStoredActive,
  railDrawerTopOffset,
  type AfDrawerSystemProps,
  type AfDrawerPanel,
  type AfDrawerActive,
  type AfDrawerSide,
  type AfDrawerStored,
} from "./af_drawer_system.js";
export { drawerTop, drawerFocusTarget } from "./af_drawer.js";
export { topBarPillText, topBarConnection, identityTitle, useAfTopBarHeight, AF_TOPBAR_HEIGHT_VAR, type AfTopBarConnection } from "./af_top_bar_actions.js";
export { principalFromConnection, principalLabel, gatewayHostLabel, AF_DEFAULT_TENANT, type AfPrincipal } from "./principal.js";
export { fetchAboutVersions, ABOUT_VERSIONS_CHECKING, type AfGatewayFetch } from "./about.js";
export type { GatewayPrincipalPayload } from "./gateway_connect_modal.js";
// --- ui-primitives (session-policy-kit) ---
// A conversation's tool policy on the gateway (session tool policy contract v1) and its bridge to
// the tool layers (backlog 0033).
export {
  sessionToolPolicyCapability,
  createSessionToolPolicyClient,
  asSessionToolPolicy,
  sessionPolicyFromLayer,
  layerFromSessionPolicy,
  sessionPolicyClampedLines,
  SESSION_TOOL_POLICY_UNSUPPORTED,
  SessionToolPolicyUnsupportedError,
  SessionToolPolicyConflictError,
  SessionToolPolicyRevisionError,
  SESSION_TOOL_POLICY_NO_REVISION,
  sessionPolicyBodyIsEmpty,
  sessionToolPolicyScope,
  type SessionToolPolicyScope,
  type SessionToolPolicyRevisionedClient,
  type SessionToolPolicyBody,
  type SessionToolPolicy,
  type SessionToolPolicyClient,
  type SessionToolPolicyCapability,
  type SessionToolPolicyRequest,
} from "./session_tool_policy.js";
export {
  TOOL_LAYER_GATEWAY_WHERE,
  TOOL_LAYER_BROWSER_FALLBACK,
  type ToolLayerStorage,
  type SessionLayerState,
  type ToolLayerStoreOptions,
} from "./tool_layer_store.js";
export { policySetLine, TOOL_SESSION_OFF_HELP, TOOL_POLICY_SCOPE_UNSAID } from "./tool_mode_editor.js";
export { SESSION_ID_PATTERN, sessionToolPolicyRoute } from "./gateway_paths.js";

// Tool calls in words (operator QA 2026-10-29): approval cards never print raw JSON.
export { describeToolCall, groupToolCalls, prettyQuotes, readableKey, shortUrl, type ToolCallInput, type ToolCallWords } from "./tool_call_words.js";
export { ToolCallWordsList, type ToolCallWordsListProps } from "./tool_call_words_view.js";
