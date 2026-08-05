import { useEffect, useState } from "react";
import { Container, MonitorSmartphone, Plus, Rocket, Search, Trash2 } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { useAppData } from "../context/AppDataContext";
import { searchDockerHubImages } from "../hooks/useTemplates";
import type { DockerHubSearchResult, EnvironmentTemplate } from "../lib/types";

export function Templates() {
  const { templates, runtimesByKind, apiStatus, launchingTemplateId, launchEnvironment, addTemplate, removeTemplate } = useAppData();
  const [pending, setPending] = useState<EnvironmentTemplate | null>(null);
  const [runtime, setRuntime] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);

  function openLaunch(template: EnvironmentTemplate) {
    setPending(template);
    setRuntime(runtimesByKind[template.kind]?.[0] ?? "");
  }

  async function confirmLaunch() {
    if (!pending) return;
    await launchEnvironment(pending, runtime);
    setPending(null);
  }

  return (
    <>
      <TopBar
        title="Templates"
        subtitle="Launch a new sandbox from a built-in or custom template"
        apiStatus={apiStatus}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
            Add template
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        {templates.length === 0 && (
          <Card>
            <CardBody className="text-sm text-ink-subtle py-8 text-center">
              {apiStatus === "online"
                ? "No templates yet - add one from an image above."
                : "Waiting for the local service to connect..."}
            </CardBody>
          </Card>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const Icon = t.kind === "vm" ? MonitorSmartphone : Container;
            return (
              <Card key={t.id} hoverable>
                <CardHeader
                  icon={<Icon size={18} className="text-ink-subtle mt-0.5" />}
                  title={t.label}
                  subtitle={t.kind === "vm" ? "Virtual machine" : t.image ?? "Container"}
                  actions={
                    t.origin === "custom" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        title="Remove custom template"
                        onClick={() => removeTemplate(t.id)}
                      />
                    ) : undefined
                  }
                />
                <CardBody className="flex flex-col gap-3">
                  <dl className="grid grid-cols-2 gap-1 text-xs text-ink-subtle">
                    <dt>Default TTL</dt>
                    <dd className="text-ink text-right">{Math.round(t.defaultTtlSeconds / 60)} min</dd>
                    <dt>CPU</dt>
                    <dd className="text-ink text-right">{t.defaultResources.cpus} vCPU</dd>
                    <dt>Memory</dt>
                    <dd className="text-ink text-right">{t.defaultResources.memoryMb} MB</dd>
                  </dl>
                  <Button
                    variant="primary"
                    icon={<Rocket size={14} />}
                    disabled={apiStatus !== "online" || launchingTemplateId === t.id}
                    onClick={() => openLaunch(t)}
                    className="mt-1"
                  >
                    {launchingTemplateId === t.id ? "Launching..." : "Launch"}
                  </Button>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? `Launch ${pending.label}` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Rocket size={14} />} onClick={confirmLaunch} disabled={!!pending && launchingTemplateId === pending.id}>
              Launch
            </Button>
          </>
        }
      >
        {pending && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-ink-subtle">Choose which runtime engine should back this environment.</p>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-subtle">Runtime</span>
              <Select value={runtime} onChange={(e) => setRuntime(e.target.value)}>
                {(runtimesByKind[pending.kind] ?? []).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        )}
      </Modal>

      <AddTemplateModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={addTemplate} />
    </>
  );
}

interface AddTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: ReturnType<typeof useAppData>["addTemplate"];
}

/**
 * "Bring your own image" template creation - the user can either type any
 * OCI image reference directly (Docker Hub, ghcr.io, a private registry...)
 * or search Docker Hub's public repository index to find one. The image is
 * verified against Docker Hub before saving (server-side, see dockerHub.ts)
 * unless it's on another registry.
 */
function AddTemplateModal({ open, onClose, onAdd }: AddTemplateModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DockerHubSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [label, setLabel] = useState("");
  const [image, setImage] = useState("");
  const [tag, setTag] = useState("latest");
  const [cpus, setCpus] = useState(1);
  const [memoryMb, setMemoryMb] = useState(1024);
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setLabel("");
    setImage("");
    setTag("latest");
    setCpus(1);
    setMemoryMb(1024);
    setTtlMinutes(60);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchDockerHubImages(query)
        .then((res) => {
          if (!cancelled) setResults(res);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function pickResult(r: DockerHubSearchResult) {
    const repoRef = r.namespace === "library" ? r.name : `${r.namespace}/${r.name}`;
    setImage(repoRef);
    if (!label) setLabel(r.isOfficial ? r.name : repoRef);
  }

  async function handleSubmit() {
    setError(null);
    if (!label.trim() || !image.trim()) {
      setError("Label and image are required.");
      return;
    }
    setSubmitting(true);
    try {
      const fullImage = tag.trim() ? `${image.trim()}:${tag.trim()}` : image.trim();
      await onAdd({
        label: label.trim(),
        image: fullImage,
        defaultResources: { cpus, memoryMb },
        defaultTtlSeconds: ttlMinutes * 60,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add template.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add template from an image"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Plus size={14} />} onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Adding..." : "Add template"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-subtle">Search Docker Hub</span>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <Input
              className="pl-8 w-full"
              placeholder="e.g. postgres, my-org/my-image..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query.trim() && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {searching && <div className="px-2.5 py-2 text-xs text-ink-subtle">Searching...</div>}
              {!searching && results.length === 0 && <div className="px-2.5 py-2 text-xs text-ink-subtle">No results.</div>}
              {!searching &&
                results.map((r) => (
                  <button
                    key={`${r.namespace}/${r.name}`}
                    type="button"
                    className="w-full text-left px-2.5 py-2 hover:bg-surface-muted transition-colors"
                    onClick={() => pickResult(r)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink truncate">
                        {r.namespace === "library" ? r.name : `${r.namespace}/${r.name}`}
                      </span>
                      {r.isOfficial && <span className="text-[10px] uppercase tracking-wide text-accent shrink-0">Official</span>}
                    </div>
                    {r.description && <div className="text-xs text-ink-subtle truncate mt-0.5">{r.description}</div>}
                  </button>
                ))}
            </div>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-subtle">Image</span>
            <Input placeholder="e.g. postgres or docker.io/library/postgres" value={image} onChange={(e) => setImage(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-subtle">Tag</span>
            <Input placeholder="latest" value={tag} onChange={(e) => setTag(e.target.value)} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-subtle">Template label</span>
          <Input placeholder="e.g. PostgreSQL 16" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-subtle">CPUs</span>
            <Input type="number" min={1} value={cpus} onChange={(e) => setCpus(Number(e.target.value) || 1)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-subtle">Memory (MB)</span>
            <Input type="number" min={128} step={128} value={memoryMb} onChange={(e) => setMemoryMb(Number(e.target.value) || 128)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-subtle">Default TTL (min)</span>
            <Input type="number" min={1} value={ttlMinutes} onChange={(e) => setTtlMinutes(Number(e.target.value) || 1)} />
          </label>
        </div>

        {error && <p className="text-xs text-status-failed">{error}</p>}
      </div>
    </Modal>
  );
}
