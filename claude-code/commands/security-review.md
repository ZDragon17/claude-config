---
description: Perform a security review on changed or specified files
---

Perform a comprehensive security review on the current changes or specified files.

Check for the following OWASP Top 10 and common vulnerabilities:

1. **Injection** - SQL injection, command injection, LDAP injection, XSS
2. **Broken Authentication** - Hardcoded credentials, weak session management
3. **Sensitive Data Exposure** - Secrets in code, unencrypted data, PII leaks
4. **XXE** - XML External Entity attacks
5. **Broken Access Control** - Missing authorization checks, IDOR
6. **Security Misconfiguration** - Debug mode enabled, default credentials
7. **Insecure Deserialization** - Unsafe deserialization of user input
8. **Vulnerable Dependencies** - Known CVEs in dependencies
9. **Insufficient Logging** - Missing audit trails for security events
10. **SSRF** - Server-Side Request Forgery

For each issue found, report:
- Severity: CRITICAL / HIGH / MEDIUM / LOW
- File and line number
- Description of the vulnerability
- Recommended fix with code example

If no argument is provided, review all staged/modified files via `git diff`.
If $ARGUMENTS is provided, review those specific files.
