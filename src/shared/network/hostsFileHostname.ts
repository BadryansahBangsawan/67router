/**
 * Hostname shape accepted for hosts-file entries (Traffic Inspector custom hosts,
 * AgentBridge DNS overrides). Each value becomes `<ip> <hostname>` on its own line
 * in /etc/hosts, so anything beyond letters, digits, `-`, `_` and `.` separators —
 * whitespace, control characters, `#`, `:` — must be refused.
 *
 * Labels: 1-63 chars, start with a letter/digit/underscore (underscores appear in
 * test sentinels and some internal names). Whole name: at most 253 chars.
 */
const HOSTS_FILE_HOSTNAME_RE =
  /^[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,62})(?:\.[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,62}))*$/;

export function isValidHostsFileHostname(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 253 &&
    HOSTS_FILE_HOSTNAME_RE.test(value)
  );
}
