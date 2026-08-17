import json
import os
import sys
import ast
import re
import datetime
from pathlib import Path

def get_iso_timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def analyze_file(filepath, scan_id):
    findings = []
    evidence = []
    evidence_counter = 0
    
    def next_eid():
        nonlocal evidence_counter
        evidence_counter += 1
        return f"E-{scan_id[:8]}-{evidence_counter:03d}"
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        return findings, evidence, [str(e)]
    
    lines = content.split('\n')
    
    dangerous_apis = [
        ('chrome.cookies', 'DANGEROUS_API', 'high'),
        ('chrome.tabs.executeScript', 'DANGEROUS_API', 'high'),
        ('chrome.scripting.executeScript', 'DANGEROUS_API', 'high'),
        ('chrome.webRequest', 'DANGEROUS_API', 'high'),
        ('chrome.debugger', 'DANGEROUS_API', 'critical'),
        ('chrome.management', 'DANGEROUS_API', 'high'),
        ('chrome.declarativeNetRequest', 'DANGEROUS_API', 'high'),
        ('chrome.nativeMessaging', 'DANGEROUS_API', 'high'),
        ('chrome.webNavigation', 'DANGEROUS_API', 'medium'),
        ('chrome.history', 'DATA_ACCESS', 'high'),
        ('chrome.bookmarks', 'DATA_ACCESS', 'medium'),
        ('chrome.downloads', 'DATA_ACCESS', 'medium'),
        ('chrome.identity', 'DATA_ACCESS', 'high'),
        ('clipboard.readText', 'DANGEROUS_API', 'high'),
        ('clipboard.read', 'DANGEROUS_API', 'high'),
        ('document.cookie', 'DATA_ACCESS', 'medium'),
        ('localStorage', 'DATA_ACCESS', 'low'),
        ('sessionStorage', 'DATA_ACCESS', 'low'),
        ('indexedDB', 'DATA_ACCESS', 'low'),
        ('fetch', 'NETWORK_EXFILTRATION', 'medium'),
        ('XMLHttpRequest', 'NETWORK_EXFILTRATION', 'medium'),
        ('navigator.sendBeacon', 'NETWORK_EXFILTRATION', 'medium'),
        ('WebSocket', 'NETWORK_EXFILTRATION', 'medium'),
        ('navigator.geolocation', 'DATA_ACCESS', 'high'),
        ('chrome.runtime.sendMessage', 'DATA_ACCESS', 'medium'),
        ('chrome.runtime.postMessage', 'DATA_ACCESS', 'medium'),
        ('eval', 'REMOTE_CODE_EXECUTION', 'high'),
        ('Function', 'REMOTE_CODE_EXECUTION', 'high'),
        ('importScripts', 'REMOTE_CODE_EXECUTION', 'high'),
        ('setTimeout', 'REMOTE_CODE_EXECUTION', 'medium'),
        ('setInterval', 'REMOTE_CODE_EXECUTION', 'medium'),
        ('document.write', 'REMOTE_CODE_EXECUTION', 'medium'),
        ('document.writeln', 'REMOTE_CODE_EXECUTION', 'medium'),
        ('innerHTML', 'REMOTE_CODE_EXECUTION', 'medium'),
        ('outerHTML', 'REMOTE_CODE_EXECUTION', 'medium'),
        ('insertAdjacentHTML', 'REMOTE_CODE_EXECUTION', 'medium'),
    ]
    
    obfuscation_patterns = [
        (r'eval\s*\(', 'eval_usage', 'high'),
        (r'new\s+Function\s*\(', 'function_constructor', 'high'),
        (r'setTimeout\s*\(\s*["\']', 'settimeout_string', 'medium'),
        (r'setInterval\s*\(\s*["\']', 'setinterval_string', 'medium'),
        (r'\\x[0-9a-fA-F]{2}', 'hex_encoding', 'low'),
        (r'\\u[0-9a-fA-F]{4}', 'unicode_encoding', 'low'),
        (r'atob\s*\(', 'base64_decode', 'medium'),
        (r'btoa\s*\(', 'base64_encode', 'low'),
        (r'String\.fromCharCode\s*\(', 'charcode_obfuscation', 'medium'),
        (r'\["\s*[^"\']{50,}["\']\s*,', 'large_string_array', 'medium'),
    ]
    
    for i, line in enumerate(lines, 1):
        for api, category, severity in dangerous_apis:
            if api in line:
                eid = next_eid()
                findings.append({
                    'id': f'CF-{scan_id[:8]}-{len(findings)+1:03d}',
                    'scan_id': scan_id,
                    'file_path': filepath,
                    'line': i,
                    'column': line.find(api) + 1,
                    'api': api,
                    'pattern': 'api_call',
                    'category': category.lower(),
                    'severity': severity,
                    'confidence': 'likely',
                    'context': line.strip()[:200],
                    'ast_node_type': 'CallExpression'
                })
                evidence.append({
                    'id': eid,
                    'scan_id': scan_id,
                    'type': 'static_analysis',
                    'source': 'ast',
                    'description': f'Dangerous API call: {api}',
                    'raw_data': {'api': api, 'file': filepath, 'line': i, 'category': category.lower()},
                    'confidence': 'likely',
                    'created_at': get_iso_timestamp()
                })
        
        for pattern, name, severity in obfuscation_patterns:
            if re.search(pattern, line):
                eid = next_eid()
                findings.append({
                    'id': f'CF-{scan_id[:8]}-{len(findings)+1:03d}',
                    'scan_id': scan_id,
                    'file_path': filepath,
                    'line': i,
                    'column': 1,
                    'api': name,
                    'pattern': 'obfuscation',
                    'category': 'obfuscation',
                    'severity': severity,
                    'confidence': 'potential',
                    'context': line.strip()[:200],
                    'ast_node_type': 'Expression'
                })
                evidence.append({
                    'id': eid,
                    'scan_id': scan_id,
                    'type': 'static_analysis',
                    'source': 'obfuscation',
                    'description': f'Obfuscation indicator: {name}',
                    'raw_data': {'pattern': name, 'file': filepath, 'line': i},
                    'confidence': 'potential',
                    'created_at': get_iso_timestamp()
                })
    
    urls = re.findall(r'(?:https?://|wss?://)[^\s"\'`<>]+', content)
    for url in urls:
        suspicious = False
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            suspicious_tlds = ['.tk', '.ml', '.ga', '.cf', '.top', '.xyz', '.click', '.download']
            suspicious_keywords = ['track', 'analytics', 'collect', 'telemetry', 'beacon', 'pixel', 'fingerprint']
            if parsed.hostname and any(parsed.hostname.endswith(tld) for tld in suspicious_tlds):
                suspicious = True
            if parsed.hostname and any(kw in parsed.hostname or (parsed.path and kw in parsed.path) for kw in suspicious_keywords):
                suspicious = True
            if parsed.hostname and re.match(r'^\d+\.\d+\.\d+\.\d+$', parsed.hostname):
                suspicious = True
            if parsed.hostname and len(parsed.hostname) > 50:
                suspicious = True
        except:
            pass
        
        if suspicious:
            eid = next_eid()
            url_line = 1
            for l_idx, l_str in enumerate(lines, 1):
                if url in l_str:
                    url_line = l_idx
                    break

            findings.append({
                'id': f'CF-{scan_id[:8]}-{len(findings)+1:03d}',
                'scan_id': scan_id,
                'file_path': filepath,
                'line': url_line,
                'column': 1,
                'api': url,
                'pattern': 'suspicious_url',
                'category': 'network_exfiltration',
                'severity': 'medium',
                'confidence': 'potential',
                'context': f'Suspicious URL found: {url}',
                'ast_node_type': 'Literal'
            })
            evidence.append({
                'id': eid,
                'scan_id': scan_id,
                'type': 'static_analysis',
                'source': 'network',
                'description': f'Suspicious URL in code: {url}',
                'raw_data': {'url': url, 'file': filepath, 'line': url_line},
                'confidence': 'potential',
                'created_at': get_iso_timestamp()
            })
    
    return findings, evidence, []

def main():
    if len(sys.argv) < 3:
        print(json.dumps({'codeFindings': [], 'dataFlows': [], 'evidences': [], 'errors': ['Usage: static_analyzer.py <scan_id> <extension_path>']}))
        return

    scan_id = sys.argv[1]
    extension_path = sys.argv[2]
    
    all_findings = []
    all_evidence = []
    all_errors = []
    
    for root, dirs, files in os.walk(extension_path):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build')]
            if file.endswith(('.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs')):
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, extension_path).replace('\\', '/')
                try:
                    findings, evidence, errors = analyze_file(filepath, scan_id)
                    for f in findings:
                        f['file_path'] = rel_path
                    for e in evidence:
                        if 'raw_data' in e and isinstance(e['raw_data'], dict) and 'file' in e['raw_data']:
                            e['raw_data']['file'] = rel_path
                    all_findings.extend(findings)
                    all_evidence.extend(evidence)
                    all_errors.extend(errors)
                except Exception as e:
                    all_errors.append(f"{rel_path}: {str(e)}")
    
    result = {
        'codeFindings': all_findings,
        'dataFlows': [],
        'evidences': all_evidence,
        'errors': all_errors
    }
    print(json.dumps(result))

if __name__ == '__main__':
    main()