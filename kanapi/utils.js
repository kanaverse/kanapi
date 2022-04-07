
// from kana
export function generateRandomName(prefix = "", suffix = "") {
    return prefix + String(Number(new Date())) + suffix
}