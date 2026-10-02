export type ScanType = 'quick' | 'deep' | 'sandbox' | 'full';
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type Confidence = 'confirmed' | 'likely' | 'potential' | 'unknown' | 'not_observed' | 'analysis_incomplete';
export type FindingCategory = 'permission_risk' | 'dangerous_api' | 'data_access' | 'network_exfiltration' | 'obfuscation' | 'dependency_risk' | 'purpose_mismatch' | 'privacy_policy_discrepancy' | 'runtime_behavior' | 'csp_bypass' | 'remote_code_execution' | 'supply_chain';
export interface ExtensionManifest {
    manifest_version: 2 | 3;
    name: string;
    version: string;
    description?: string;
    permissions?: string[];
    host_permissions?: string[];
    optional_permissions?: string[];
    content_scripts?: ContentScript[];
    background?: BackgroundScript;
    externally_connectable?: ExternallyConnectable;
    content_security_policy?: string | CSPObject;
    web_accessible_resources?: WebAccessibleResource[];
    declarative_net_request?: DeclarativeNetRequest;
    commands?: Record<string, Command>;
    minimum_chrome_version?: string;
    icons?: Record<string, string>;
    author?: string;
    homepage_url?: string;
    update_url?: string;
    offline_enabled?: boolean;
    sandbox?: SandboxConfig;
}
export interface ContentScript {
    matches: string[];
    exclude_matches?: string[];
    js?: string[];
    css?: string[];
    run_at?: 'document_start' | 'document_end' | 'document_idle';
    all_frames?: boolean;
    match_about_blank?: boolean;
    world?: 'ISOLATED' | 'MAIN';
}
export interface BackgroundScript {
    service_worker?: string;
    scripts?: string[];
    page?: string;
    persistent?: boolean;
    type?: 'module';
}
export interface ExternallyConnectable {
    matches?: string[];
    accept_tls_channel_id?: boolean;
    ids?: string[];
}
export interface CSPObject {
    extension_pages?: string;
    sandbox?: string;
}
export interface WebAccessibleResource {
    resources: string[];
    matches: string[];
    extension_ids?: string[];
    use_dynamic_url?: boolean;
}
export interface DeclarativeNetRequest {
    rule_resources?: RuleResource[];
}
export interface RuleResource {
    id: string;
    enabled: boolean;
    path: string;
}
export interface Command {
    suggested_key?: Record<string, string>;
    description: string;
}
export interface SandboxConfig {
    pages: string[];
    content_security_policy?: string;
}
export interface PermissionRisk {
    id: string;
    scan_id: string;
    permission: string;
    risk_level: Severity;
    reason: string;
    used_in_code: boolean | null;
    evidence_ids: string[];
}
export interface Finding {
    id: string;
    scan_id: string;
    category: FindingCategory;
    severity: Severity;
    confidence: Confidence;
    title: string;
    description: string;
    technical_details: string;
    recommendation: string;
    limitations: string;
    evidence_ids: string[];
    affected_file?: string;
    affected_line?: number;
    affected_api?: string;
    code_snippet?: string;
    created_at: string;
}
export interface Evidence {
    id: string;
    scan_id: string;
    type: 'manifest' | 'static_analysis' | 'runtime' | 'network' | 'data_flow' | 'dependency' | 'policy';
    source: string;
    description: string;
    raw_data: Record<string, unknown>;
    confidence: Confidence;
    created_at: string;
}
export interface NetworkEvent {
    id: string;
    scan_id: string;
    url: string;
    domain: string;
    method: string;
    request_headers?: Record<string, string>;
    response_headers?: Record<string, string>;
    request_size?: number;
    response_size?: number;
    timestamp: string;
    initiator?: string;
    stack_trace?: string;
    is_third_party: boolean;
    risk_level: Severity;
    classification: 'first_party' | 'third_party' | 'unknown' | 'suspicious' | 'tracking' | 'analytics' | 'cdn' | 'api';
}
export interface CodeFinding {
    id: string;
    scan_id: string;
    file_path: string;
    line: number;
    column: number;
    api: string;
    pattern: string;
    category: FindingCategory;
    severity: Severity;
    confidence: Confidence;
    context: string;
    ast_node_type: string;
}
export interface DataFlowPath {
    id: string;
    scan_id: string;
    source: DataFlowNode;
    transformations: DataFlowNode[];
    sink: DataFlowNode;
    confidence: Confidence;
}
export interface DataFlowNode {
    file: string;
    line: number;
    variable: string;
    operation: string;
    value_preview: string;
}
export interface RiskScores {
    scan_id: string;
    overall_score: number;
    permission_score: number;
    code_score: number;
    data_access_score: number;
    exfiltration_score: number;
    network_score: number;
    obfuscation_score: number;
    dependency_score: number;
    purpose_mismatch_score: number;
    runtime_score: number;
    confidence: number;
    breakdown: RiskBreakdown[];
}
export interface RiskBreakdown {
    category: FindingCategory;
    score: number;
    finding_count: number;
    max_severity: Severity;
}
export interface Scan {
    id: string;
    extension_id: string;
    extension?: Extension;
    type: ScanType;
    status: ScanStatus;
    started_at: string;
    completed_at?: string;
    error?: string;
    config?: ScanConfig;
    config_json?: ScanConfig;
    manifest_hash?: string;
    analyzer_version: string;
    ruleset_version: string;
    llm_model?: string;
    llm_provider?: string;
    findings?: Finding[];
    evidence?: Evidence[];
    network_events?: NetworkEvent[];
    code_findings?: CodeFinding[];
    data_flows?: DataFlowPath[];
    permission_risks?: PermissionRisk[];
    risk_scores?: RiskScores;
}
export interface ScanConfig {
    enable_static: boolean;
    enable_runtime: boolean;
    enable_network: boolean;
    enable_data_flow: boolean;
    enable_llm: boolean;
    runtime_timeout_seconds: number;
    max_file_size_mb: number;
    rulesets: string[];
}
export interface Extension {
    id: string;
    name: string;
    version: string;
    browser: 'chrome' | 'firefox' | 'edge' | 'opera' | 'brave';
    source: 'upload' | 'store' | 'local' | 'github';
    hash: string;
    size_bytes: number;
    created_at: string;
    last_scanned_at?: string;
    manifest?: ExtensionManifest;
    manifest_json?: ExtensionManifest;
    scans?: Scan[];
}
export interface ExtensionSummary {
    extension: Extension;
    latest_scan?: Scan;
    risk_scores?: RiskScores;
    finding_counts: Record<Severity, number>;
}
export interface LLMAnalysisInput {
    extension: {
        name: string;
        version: string;
    };
    permissions: PermissionRisk[];
    code_findings: CodeFinding[];
    network_findings: NetworkEvent[];
    data_flows: DataFlowPath[];
    runtime_events: NetworkEvent[];
    purpose: string;
    privacy_policy_summary?: string;
}
export interface LLMAnalysisOutput {
    summary: string;
    risk_assessment: {
        severity: Severity;
        confidence: Confidence;
    };
    key_findings: Array<{
        claim: string;
        evidence_ids: string[];
        severity: Severity;
    }>;
    behavioral_mismatch: Array<{
        description: string;
        evidence_ids: string[];
    }>;
    recommended_actions: string[];
    uncertainties: string[];
}
export interface ThreatIntelligenceItem {
    id: string;
    extension_id?: string | null;
    pattern?: string | null;
    domain?: string | null;
    type: 'extension' | 'domain' | 'code_pattern' | 'maintainer' | 'supply_chain';
    severity: Severity;
    description: string;
    source: string;
    confidence: number;
    reported_at: string;
    verified_at?: string | null;
    verified_by?: string | null;
    metadata?: Record<string, unknown> | null;
    active: boolean;
    false_positive: boolean;
}
export interface CommunityReportItem {
    id: string;
    user_id: string;
    extension_id: string;
    extension_name: string;
    extension_version?: string | null;
    report_type: string;
    description: string;
    evidence?: Record<string, unknown> | null;
    status: 'pending' | 'verified' | 'rejected' | 'investigating';
    reported_at: string;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    review_notes?: string | null;
}
export interface DifferentialAnalysisItem {
    id: string;
    extension_id: string;
    old_version: string;
    new_version: string;
    permissions_added: string[];
    permissions_removed: string[];
    host_permissions_added: string[];
    host_permissions_removed: string[];
    manifest_changes: Record<string, unknown>;
    code_changes_summary?: string | null;
    risk_delta: number;
    severity: Severity;
    findings_added: number;
    findings_removed: number;
    findings_comparison?: Record<string, unknown> | null;
    analysis_date: string;
}
export interface SupplyChainEventItem {
    id: string;
    extension_version_id?: string | null;
    extension_id: string;
    event_type: 'version_released' | 'permission_added' | 'permission_removed' | 'maintainer_changed' | 'ownership_transfer' | 'delisted' | 'reinstated' | 'malware_detected' | 'suspicious_network';
    severity: Severity;
    description: string;
    metadata?: Record<string, unknown> | null;
    detected_at: string;
}
export interface AlertItem {
    id: string;
    user_id: string;
    extension_id: string;
    severity: Severity;
    title: string;
    message: string;
    action_required: boolean;
    read: boolean;
    created_at: string;
}
export interface NetworkLogItem {
    id: string;
    extension_id: string;
    url: string;
    method: string;
    request_headers?: Record<string, unknown> | null;
    response_headers?: Record<string, unknown> | null;
    status_code?: number | null;
    blocked: boolean;
    timestamp: string;
}
export interface Report {
    scan_id: string;
    generated_at: string;
    extension: Extension;
    scan: Scan;
    manifest_analysis: PermissionRisk[];
    findings: Finding[];
    evidence: Evidence[];
    network_events: NetworkEvent[];
    code_findings: CodeFinding[];
    data_flows: DataFlowPath[];
    risk_scores: RiskScores;
    llm_analysis?: LLMAnalysisOutput;
    limitations: string[];
}
//# sourceMappingURL=domain.d.ts.map