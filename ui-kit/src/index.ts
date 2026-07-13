export { THEMES, THEME_SPECS, applyTheme, getThemeSpec, themeClassName, type ThemeOption, type ThemeSpec } from "./theme.js";
export { FONT_SCALES, HEADER_DENSITIES, applyTypography, getFontScaleSpec, getHeaderDensitySpec, type FontScaleOption, type HeaderDensityOption } from "./typography.js";
export { AfSelect, type AfSelectProps, type AfSelectOption } from "./af_select.js";
export { ProviderModelSelect, type ProviderModelSelectProps, type ProviderOption } from "./provider_model_select.js";
export { ProviderModelPicker, type ProviderModelPickerProps, type ProviderModelPickerValue } from "./provider_model_picker.js";
export {
  GatewaySessionSignInCard,
  type GatewaySessionSignInCardProps,
  type GatewaySessionStatusTone,
} from "./gateway_session_signin.js";
export { ThemeSelect, type ThemeSelectProps } from "./theme_select.js";
export { FontScaleSelect, HeaderDensitySelect, type FontScaleSelectProps, type HeaderDensitySelectProps } from "./typography_select.js";
export { Icon, type IconName } from "./icon.js";
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
export { AfTopBarActions, type AfTopBarActionsProps } from "./af_top_bar_actions.js";
export {
  AfAppearanceDialog,
  useAppearanceSettings,
  appearanceStorageKey,
  APPEARANCE_DEFAULTS,
  type AppearanceSettings,
  type AfAppearanceDialogProps,
} from "./appearance.js";
export { useGatewayVoice, streamTtsJsonl, type GatewayVoice, type GatewayVoiceOptions, type TtsPlaybackStatus } from "./use_gateway_voice.js";
