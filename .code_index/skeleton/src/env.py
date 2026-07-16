from __future__ import annotations

from .types import ProxyConfig

# @origin src/env.ts:3
def parsePort(raw: str | None) -> float:
    Number(...)
    return Number.isInteger(...)
    raise Error(...)

# @origin src/env.ts:11
def parseBoolEnv(name: str, raw: str | None) -> bool:
    raw.trim(...)
    return toLowerCase(...)
    raise Error(...)

# @origin src/env.ts:29
def parseNonNegativeIntegerEnv(name: str, raw: str | None) -> float:
    raw.trim(...)
    Number(...)
    return Number.isInteger(...)
    raise Error(...)

# @origin src/env.ts:38
def parseIntervalMsEnv(name: str, raw: str | None, fallback: float) -> float:
    raw.trim(...)
    Number(...)
    return Number.isInteger(...)
    raise Error(...)

# @origin src/env.ts:47
def parseOptionalPositiveIntegerEnv(name: str, raw: str | None) -> float | None:
    raw.trim(...)
    Number(...)
    return Number.isInteger(...)
    raise Error(...)

# @origin src/env.ts:56
def parseThresholdPercentEnv(name: str, raw: str | None) -> float:
    raw.trim(...)
    Number(...)
    return Number.isFinite(...)
    raise Error(...)

# @origin src/env.ts:65
def parseModelMapEnv(name: str, raw: str | None) -> dict[str, str]:
    raw.trim(...)
    raw.split(...)
    rawEntry.trim(...)
    entry.indexOf(...)
    entry.slice(...)
    return trim(...)
    raise Error(...)

# @origin src/env.ts:85
def isTextFilePath(raw: str) -> bool:
    raw.trim(...)
    toLowerCase(...)
    return endsWith(...)

# @origin src/env.ts:89
def normalizeApiKeyEntry(raw: str) -> str:
    raw.trim(...)
    replace(...)
    return trim(...)

# @origin src/env.ts:93
def parseApiKeys(raw: str | None) -> list[str]:
    trim(...)
    isTextFilePath(...)
    Deno.readTextFileSync(...)
    split(...)
    map(...)
    filter(...)
    return source.split(...)
    raise Error(...)

# @origin src/env.ts:105
def loadDotenvIntoEnv(path: str) -> None:
    Deno.readTextFileSync(...)
    text.split(...)
    rawLine.trim(...)
    line.startsWith(...)
    line.indexOf(...)
    line.slice(...)
    trim(...)
    key.toUpperCase(...)
    startsWith(...)
    value.startsWith(...)
    value.endsWith(...)
    value.slice(...)
    Deno.env.set(...)

# @origin src/env.ts:125
def applyLogArgsToEnv(args: list[str]) -> None:
    next.startsWith(...)
    Deno.env.delete(...)
    trim(...)
    Deno.env.set(...)
    raise Error(...)

# @origin src/env.ts:162
def loadConfig() -> ProxyConfig:
    Deno.env.get(...)
    parseApiKeys(...)
    parsePort(...)
    parseBoolEnv(...)
    parseModelMapEnv(...)
    parseNonNegativeIntegerEnv(...)
    parseIntervalMsEnv(...)
    parseOptionalPositiveIntegerEnv(...)
    return parseThresholdPercentEnv(...)
    raise Error(...)
