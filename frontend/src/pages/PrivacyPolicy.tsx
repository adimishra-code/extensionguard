import { Shield, Lock, Eye, FileText, CheckCircle, Mail } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-8">
      {/* Policy Header */}
      <div className="border-b border-gray-200 pb-6">
        <div className="flex items-center gap-2 text-primary-600 font-semibold text-xs tracking-wider uppercase mb-1">
          <Shield className="h-4 w-4" />
          <span>Legal & Compliance</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mt-1">
          Effective Date: November 3, 2026 • ExtensionGuard Security Suite & Browser Companion
        </p>
      </div>

      {/* Overview Card */}
      <div className="card p-6 border-l-4 border-l-primary-600 bg-primary-50/20 space-y-2">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary-600" />
          Our Commitment to User Privacy & Security
        </h2>
        <p className="text-gray-600 text-xs leading-relaxed">
          ExtensionGuard is dedicated to safeguarding developer and enterprise browser security without compromising user privacy.
          We practice strict data minimization: we only inspect extension manifests, behavioral risk indicators, and code safety heuristics.
          We never collect or sell your personal browsing history, keystrokes, form submissions, passwords, or personal communications.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
        <section className="space-y-2">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary-600" />
            1. Information We Collect
          </h3>
          <p className="text-xs text-gray-600">
            When you use the ExtensionGuard web platform and the ExtensionGuard Companion Monitor browser extension:
          </p>
          <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1.5">
            <li>
              <strong>Extension Metadata:</strong> Extension IDs, names, version numbers, manifest permission declarations, and public Chrome Web Store metadata.
            </li>
            <li>
              <strong>Security Telemetry:</strong> Anonymized behavioral events, static code vulnerability findings, and threat intelligence matches generated during static analysis or live monitoring sessions.
            </li>
            <li>
              <strong>Account Information:</strong> If you register an account, we collect your verified email address and hashed passwords (via bcrypt with salted key derivation) for dashboard access and automated alerting.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary-600" />
            2. Single Purpose & Chrome Web Store Compliance
          </h3>
          <p className="text-xs text-gray-600">
            In compliance with the Google Chrome Web Store Single Purpose Policy:
          </p>
          <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1.5">
            <li>
              The companion extension serves one single, explicit purpose: <strong>identifying security risks, permission abuse, and zero-day threats in installed browser extensions</strong>.
            </li>
            <li>
              The extension requests the <code>management</code> permission strictly to list and monitor installed extensions, and the <code>storage</code> permission to store local configuration and alert preferences.
            </li>
            <li>
              The extension never injects tracking scripts into normal web pages and does not monetize user analytics.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary-600" />
            3. Data Storage & Security Safeguards
          </h3>
          <p className="text-xs text-gray-600">
            All data transmitted between the browser extension and the ExtensionGuard cloud API is encrypted in transit using industry-standard TLS 1.3 / HTTPS and WSS (WebSocket Secure).
            Data stored at rest utilizes encrypted PostgreSQL partitions. Temporary package scan uploads are isolated in sandboxed volumes and routinely scrubbed via automated lifecycle pruning.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary-600" />
            4. User Rights & Data Deletion
          </h3>
          <p className="text-xs text-gray-600">
            In accordance with GDPR and CCPA regulations:
          </p>
          <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1.5">
            <li>You have the right to request access to or deletion of all telemetry records linked to your user account.</li>
            <li>You can revoke API keys or delete your registered account at any time through the Settings page or by contacting an administrator.</li>
            <li>Uninstalling the companion extension immediately terminates all telemetry streaming to the backend server.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary-600" />
            5. Contact Information & Security Disclosures
          </h3>
          <p className="text-xs text-gray-600">
            If you have questions regarding this Privacy Policy or wish to report a security vulnerability, please contact our security team:
          </p>
          <div className="p-3 bg-gray-100 rounded-lg text-xs font-mono text-gray-800 inline-block">
            security@extensionguard.io
          </div>
        </section>
      </div>

      {/* Back to Dashboard Footer */}
      <div className="pt-6 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500">
        <span>© 2026 ExtensionGuard. All rights reserved.</span>
        <NavLink to="/dashboard" className="text-primary-600 hover:underline font-medium">
          ← Return to Security Dashboard
        </NavLink>
      </div>
    </div>
  );
}

