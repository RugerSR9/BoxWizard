/**
 * Minimal client for the public Docker Hub Registry HTTP API v2
 * (https://docs.docker.com/docker-hub/api/latest/), used to let a user "add
 * a template from Docker Hub" with confidence the image reference they typed
 * actually exists before we persist it, and to power a lightweight search box
 * in the GUI's "Add template" dialog.
 *
 * Only images hosted on Docker Hub itself can be verified this way. Anything
 * pointing at another registry (ghcr.io, a private registry, etc.) is passed
 * through untouched - the real pull attempt at container-create time is the
 * final source of truth either way.
 */

const HUB_API_BASE = "https://hub.docker.com/v2";

export interface ParsedImageRef {
  /** "library" for official images (e.g. `python`), otherwise the Docker Hub namespace/user. */
  namespace: string;
  repo: string;
  tag: string;
  /** False when the reference points at a non-Docker-Hub registry (has a host segment, e.g. ghcr.io/foo/bar). */
  isDockerHub: boolean;
}

/**
 * Parses an OCI image reference the same way `docker pull` would for the
 * purposes of figuring out where to check it: `python`, `python:3.12`,
 * `library/python:3.12`, `someuser/repo`, `ghcr.io/someuser/repo:tag`, etc.
 */
export function parseImageRef(image: string): ParsedImageRef {
  const trimmed = image.trim().replace(/^docker\.io\//, "");
  const [namePart, tagPart] = splitTag(trimmed);
  const segments = namePart.split("/");

  // A leading segment containing a "." or ":" (or literally "localhost") is a
  // registry host, e.g. ghcr.io/foo/bar or localhost:5000/foo.
  const hasRegistryHost = segments.length > 1 && (segments[0].includes(".") || segments[0].includes(":") || segments[0] === "localhost");
  if (hasRegistryHost) {
    return { namespace: segments[0], repo: segments.slice(1).join("/"), tag: tagPart ?? "latest", isDockerHub: false };
  }

  if (segments.length === 1) {
    return { namespace: "library", repo: segments[0], tag: tagPart ?? "latest", isDockerHub: true };
  }
  return { namespace: segments[0], repo: segments.slice(1).join("/"), tag: tagPart ?? "latest", isDockerHub: true };
}

function splitTag(nameAndMaybeTag: string): [string, string | null] {
  const atDigest = nameAndMaybeTag.indexOf("@");
  const base = atDigest === -1 ? nameAndMaybeTag : nameAndMaybeTag.slice(0, atDigest);
  const lastColon = base.lastIndexOf(":");
  const lastSlash = base.lastIndexOf("/");
  if (lastColon === -1 || lastColon < lastSlash) return [base, null];
  return [base.slice(0, lastColon), base.slice(lastColon + 1)];
}

export interface DockerHubCheckResult {
  ok: boolean;
  /** Human-readable reason when ok=false, e.g. "repository not found" or "tag not found". */
  reason?: string;
  /** True if we couldn't check at all (network error, non-Docker-Hub registry) - caller should not hard-fail on this. */
  skipped?: boolean;
}

/** Verifies a repository + tag exist on Docker Hub. Never throws. */
export async function checkDockerHubImage(image: string): Promise<DockerHubCheckResult> {
  const ref = parseImageRef(image);
  if (!ref.isDockerHub) {
    return { ok: true, skipped: true, reason: "Non-Docker Hub registry reference; skipping live verification." };
  }

  try {
    const repoRes = await fetch(`${HUB_API_BASE}/repositories/${ref.namespace}/${ref.repo}/`);
    if (repoRes.status === 404) {
      return { ok: false, reason: `No Docker Hub repository named "${ref.namespace}/${ref.repo}".` };
    }
    if (!repoRes.ok) {
      return { ok: true, skipped: true, reason: `Docker Hub returned HTTP ${repoRes.status}; skipping verification.` };
    }

    const tagRes = await fetch(`${HUB_API_BASE}/repositories/${ref.namespace}/${ref.repo}/tags/${encodeURIComponent(ref.tag)}/`);
    if (tagRes.status === 404) {
      return { ok: false, reason: `Repository "${ref.namespace}/${ref.repo}" exists, but has no tag "${ref.tag}".` };
    }
    if (!tagRes.ok) {
      return { ok: true, skipped: true, reason: `Docker Hub returned HTTP ${tagRes.status} for tag lookup; skipping verification.` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: true, skipped: true, reason: err instanceof Error ? err.message : "Docker Hub unreachable; skipping verification." };
  }
}

export interface DockerHubSearchResult {
  name: string;
  namespace: string;
  description: string;
  starCount: number;
  isOfficial: boolean;
}

/** Backs the GUI's "search Docker Hub" box in the Add Template dialog. */
export async function searchDockerHub(query: string): Promise<DockerHubSearchResult[]> {
  const res = await fetch(`${HUB_API_BASE}/search/repositories/?query=${encodeURIComponent(query)}&page_size=20`);
  if (!res.ok) throw new Error(`Docker Hub search failed with HTTP ${res.status}`);
  const json = (await res.json()) as {
    results?: Array<{ repo_name: string; short_description?: string; star_count?: number; is_official?: boolean }>;
  };
  return (json.results ?? []).map((r) => {
    const [namespace, ...rest] = r.repo_name.split("/");
    const isOfficial = rest.length === 0;
    return {
      name: isOfficial ? namespace : rest.join("/"),
      namespace: isOfficial ? "library" : namespace,
      description: r.short_description ?? "",
      starCount: r.star_count ?? 0,
      isOfficial: r.is_official ?? isOfficial,
    };
  });
}
