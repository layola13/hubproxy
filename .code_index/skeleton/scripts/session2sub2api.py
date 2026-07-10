from __future__ import annotations

import fs as fs

# @origin scripts/session2sub2api.js:11
def firstNonEmpty(rest_values: Any) -> Any:
    return v.trim(...)

# @origin scripts/session2sub2api.js:17
def isPlainObject(v: Any) -> Any:
    return Array.isArray(...)

# @origin scripts/session2sub2api.js:18
def isAvailable(v: Any) -> Any:
    ...

# @origin scripts/session2sub2api.js:19
def stripUnavailable(value: Any) -> Any:
    Array.isArray(...)
    value.map(...)
    filter(...)
    isPlainObject(...)
    Object.entries(...)
    map(...)
    stripUnavailable(...)
    Object.fromEntries(...)
    return isAvailable(...)

# @origin scripts/session2sub2api.js:32
def b64urlDecode(seg: Any) -> Any:
    seg.replace(...)
    replace(...)
    n.padEnd(...)
    Math.ceil(...)
    Buffer.from_(...)
    return toString(...)

# @origin scripts/session2sub2api.js:37
def b64urlEncodeJson(v: Any) -> Any:
    Buffer.from_(...)
    JSON.stringify(...)
    toString(...)
    return replace(...)

# @origin scripts/session2sub2api.js:40
def parseJwtPayload(token: Any) -> Any:
    token.trim(...)
    token.split(...)
    JSON.parse(...)
    return b64urlDecode(...)

# @origin scripts/session2sub2api.js:46
def getAuthSection(p: Any) -> Any:
    return isPlainObject(...)

# @origin scripts/session2sub2api.js:47
def getProfileSection(p: Any) -> Any:
    return isPlainObject(...)

# @origin scripts/session2sub2api.js:48
def normalizeTimestamp(value: Any) -> Any:
    Number.isNaN(...)
    value.getTime(...)
    value.toISOString(...)
    Number.isFinite(...)
    Date(...)
    d.getTime(...)
    d.toISOString(...)
    return value.trim(...)

# @origin scripts/session2sub2api.js:59
def timestampFromUnixSeconds(value: Any) -> Any:
    Number(...)
    Number.isFinite(...)
    Date(...)
    Number.isNaN(...)
    d.getTime(...)
    return d.toISOString(...)

# @origin scripts/session2sub2api.js:65
def unixSecondsFromJwtExp(value: Any) -> Any:
    Number(...)
    Number.isFinite(...)
    return Math.trunc(...)

# @origin scripts/session2sub2api.js:70
def epochSecondsFromValue(v: Any) -> Any:
    Number(...)
    Number.isFinite(...)
    Math.trunc(...)
    Date.parse(...)
    return String(...)

# @origin scripts/session2sub2api.js:77
def buildSyntheticIdToken(email: Any, accountId: Any, planType: Any, userId: Any, expiresAt: Any) -> Any:
    Math.trunc(...)
    Date.now(...)
    epochSecondsFromValue(...)
    return b64urlEncodeJson(...)

# @origin scripts/session2sub2api.js:88
def getExpiresIn(expiresAt: Any, now: Any) -> Any:
    Date(...)
    getTime(...)
    Number.isNaN(...)
    Math.max(...)
    return Math.floor(...)

# @origin scripts/session2sub2api.js:94
def toEmailKey(email: Any) -> Any:
    email.trim(...)
    toLowerCase(...)
    return replace(...)

# @origin scripts/session2sub2api.js:99
def extractRecords(root: Any, sourcePath: Any) -> Any:
    isPlainObject(...)
    Array.isArray(...)
    root.accounts.map(...)
    return root.map(...)
    raise Error(...)

# @origin scripts/session2sub2api.js:108
def convertOne(record: Any, sourceName: Any, now: Any) -> Any:
    firstNonEmpty(...)
    parseJwtPayload(...)
    getAuthSection(...)
    getProfileSection(...)
    Boolean(...)
    unixSecondsFromJwtExp(...)
    timestampFromUnixSeconds(...)
    normalizeTimestamp(...)
    getExpiresIn(...)
    buildSyntheticIdToken(...)
    stripUnavailable(...)
    return toEmailKey(...)
    raise Error(...)

# @origin scripts/session2sub2api.js:203
def main() -> Any:
    process.argv.slice(...)
    console.error(...)
    process.exit(...)
    fs.readFileSync(...)
    JSON.parse(...)
    extractRecords(...)
    Date(...)
    records.map(...)
    convertOne(...)
    normalizeTimestamp(...)
    JSON.stringify(...)
    fs.writeFileSync(...)
    return process.stdout.write(...)
