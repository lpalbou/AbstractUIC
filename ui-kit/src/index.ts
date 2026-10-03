export { THEMES, THEME_SPECS, applyTheme, getThemeSpec, themeClassName, type ThemeOption, type ThemeSpec } from "./theme.js";
export { FONT_SCALES, HEADER_DENSITIES, applyTypography, getFontScaleSpec, getHeaderDensitySpec, type FontScaleOption, type HeaderDensityOption } from "./typography.js";
export { AF_BREAKPOINTS, AF_MEDIA, installViewportVars, useAfMedia, viewportVarsFrom, type AfVisualViewportSample } from "./responsive.js";
export { AfSelect, type AfSelectProps, type AfSelectOption } from "./af_select.js";
export { ProviderModelSelect, type ProviderModelSelectProps, type ProviderOption } from "./provider_model_select.js";
export { ProviderModelPicker, type ProviderModelPickerProps, type ProviderModelPickerValue } from "./provider_model_picker.js";
export { SpeculationSelect } from "./speculation_select.js";
export { normalizeSpeculationValue, speculationCapability, speculationSelection, speculationFromSelection, type SpeculationValue, type SpeculationCapability } from "./speculation_control.js";
export {
  GatewaySessionSignInCard,
  type GatewaySessionSignInCardProps,
  type GatewaySessionStatusTone,
} from "./gateway_session_signin.js";
export { ThemeSelect, type ThemeSelectProps } from "./theme_select.js";
export { FontScaleSelect, HeaderDensitySelect, type FontScaleSelectProps, type HeaderDensitySelectProps } from "./typography_select.js";
export { Icon, type IconName } from "./icon.js";
export { GATEWAY_API_PATH, GATEWAY_CONNECTION_PATH, gatewayApiPath, gatewayResourcePath, joinBaseUrl } from "./gateway_paths.js";
export {
  ToolPolicyEditor,
  TOOL_POLICY_DEFAULTS,
  type ToolPolicyEditorProps,
  type ToolPolicySelection,
  type ToolPolicyDefaults,
  type ToolSpec,
  type ToolApprovalMode,
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
export { AfAboutDialog, type AfAboutDialogProps } from "./about.js";
export {
  AfAppearanceDialog,
  useAppearanceSettings,
  appearanceStorageKey,
  APPEARANCE_DEFAULTS,
  type AppearanceSettings,
  type AfAppearanceDialogProps,
} from "./appearance.js";
export { useGatewayVoice, streamTtsJsonl, type GatewayVoice, type GatewayVoiceOptions, type TtsPlaybackStatus } from "./use_gateway_voice.js";
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
export { VoiceSettings, type VoicePreferences, type VoiceCatalog } from "./voice_settings.js";
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
  WaitAnswer,
  WaitKind,
} from "./automations/types.js";
export {
  AUTOMATIONS_PATH,
  MY_EMAIL_PATH,
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
} from "./automations/panel_core.js";
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
  RUN_NOW_NEXT_RUN_LINE,
  RUN_NOW_ONE_LINE,
  controlHint,
  DISCUSS_LABEL,
  STATUS_ICONS,
  plainTextRenderer,
  type AutomationPanelProps,
  type AutomationTurn,
  type GatewayResource,
  type RenderText,
  type RenderTurn,
} from "./automations/AutomationPanel.js";
export { AfScheduleDialog, type AfScheduleDialogProps } from "./automations/AfScheduleDialog.js";
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
export { AutomationWorkflowPicker, type AutomationWorkflowPickerOptions } from "./automations/automation_workflow_picker.js";
export { retargetAutomationInput, automationTargetValue } from "./automations/target_selection.js";
export { prepareAutomationTarget } from "./automations/prepare_target.js";
export { automationTiming, compactCadence, compactDuration, lastRunText, nextRunText, type AutomationTiming } from "./automations/timing_line.js";
export { triggerSourceProblem } from "./automations/AutomationPanel.js";
// ui-kit 0.6.0 (round 4): rail drawer, file viewer, code highlighter, settings rows, voice section, relative time.
export { AfRailDrawer, AF_RAIL_WIDTH, railDrawerClampWidth, railDrawerKeyWidth, railDrawerNextIndex, railDrawerToggle, type AfRailDrawerProps, type AfRailItem } from "./af_rail_drawer.js";
export { AfFileViewer, fileViewerKind, fileViewerNeedsText, formatFileSize, type AfFileViewerKind, type AfFileViewerProps } from "./af_file_viewer.js";
export { AfCodeBlock, codeLanguage, highlightCode, type AfCodeBlockProps, type CodeToken, type CodeTokenKind } from "./code_highlight.js";
export { AfSettingsGroup, AfSettingRow, AfOverrideRow, type AfSettingsGroupProps, type AfSettingRowProps, type AfOverrideRowProps } from "./af_settings_rows.js";
export {
  AfVoiceSection,
  VOICE_LATENCY_OPTIONS,
  voiceTtsRequest,
  voiceSttRequest,
  voiceTtsOverrideSummary,
  voiceSttOverrideSummary,
  type AfVoiceSectionProps,
  type VoiceClientPreferences,
} from "./af_voice_section.js";
export { formatRelativeTime, formatExactTime, formatShortDate, timeValueMs } from "./relative_time.js";
export { audioOutputSelectable } from "./use_gateway_voice.js";
