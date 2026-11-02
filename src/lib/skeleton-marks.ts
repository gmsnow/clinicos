export type Laterality = "LEFT" | "RIGHT" | "BILATERAL" | "NOT_APPLICABLE";

export type ParsedBone = {
  name: string;
  laterality: Laterality;
};

export type SkeletonMarkSource = {
  id: string;
  name: string;
  notes: string | null;
  codeSystem: string | null;
};

export const SKELETON_CODE_SYSTEM = "SKELETON_3D";

const MARK_RE = /3D skeleton/i;
const BONE_TAG_RE = /\[bone:([^\]]+)\]/i;
const NON_BONE = /cartilage|sinus|\btooth\b|\bteeth\b|incisor|canine|premolar|molar|cells? of/i;

export function isSkeletonMark(diagnosis: {
  codeSystem: string | null;
  notes: string | null;
}) {
  return diagnosis.codeSystem === SKELETON_CODE_SYSTEM || MARK_RE.test(diagnosis.notes ?? "");
}

export function parseBoneName(raw: string): ParsedBone | null {
  let base = raw.trim();
  let laterality: Laterality = "NOT_APPLICABLE";

  if (base.includes(".")) {
    base = base.replace(/\.\d{3}$/, "").trim();

    if (/\.r$/i.test(base)) {
      laterality = "RIGHT";
      base = base.replace(/\.r$/i, "");
    } else if (/\.l$/i.test(base)) {
      laterality = "LEFT";
      base = base.replace(/\.l$/i, "");
    } else if (/^right\b/i.test(base)) {
      laterality = "RIGHT";
      base = base.replace(/^right\s+/i, "");
    } else if (/^left\b/i.test(base)) {
      laterality = "LEFT";
      base = base.replace(/^left\s+/i, "");
    }

    base = base.replace(/\./g, " ").replace(/\s+/g, " ").trim();
  } else {
    base = base.replace(/\d{3}$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();

    if (/r$/i.test(base) && !/^vomer$/i.test(base)) {
      laterality = "RIGHT";
      base = base.replace(/r$/i, "");
    } else if (/l$/i.test(base)) {
      laterality = "LEFT";
      base = base.replace(/l$/i, "");
    }

    base = base.replace(/\s+/g, " ").trim();
  }

  if (NON_BONE.test(base)) return null;
  if (!base) return null;

  const suffix =
    laterality === "RIGHT" ? " (right)" : laterality === "LEFT" ? " (left)" : "";

  return {
    name: `${base.charAt(0).toUpperCase()}${base.slice(1)}${suffix}`,
    laterality,
  };
}

export function skeletonMarkBoneName(mark: SkeletonMarkSource) {
  const tagged = BONE_TAG_RE.exec(mark.notes ?? "")?.[1];
  if (tagged) return tagged.trim();
  return parseBoneName(mark.name)?.name ?? mark.name;
}

export function skeletonMarkDisplayName(mark: SkeletonMarkSource) {
  if (BONE_TAG_RE.test(mark.notes ?? "")) return mark.name;
  return parseBoneName(mark.name)?.name ?? mark.name;
}

export function skeletonMarkDisplayNote(mark: SkeletonMarkSource) {
  return (mark.notes ?? "")
    .replace(BONE_TAG_RE, "")
    .replace(/Added from 3D skeleton model|3D skeleton mark/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeSkeletonMarkNotes(boneName: string, note: string) {
  const extra = note.trim();
  return `3D skeleton mark [bone:${boneName}]${extra ? ` ${extra}` : ""}`;
}
