import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import {
  BoxWizardError,
  type CreateEnvironmentRequest,
  type EnvironmentRecord,
  type ExecRequest,
  type ExecResult,
  type ResourceUsage,
} from "./types.js";
import { findTemplate } from "./templates.js";
import { MAX_TTL_SECONDS } from "./runtimeAdapter.js";
import type { RuntimeAdapter } from "./runtimeAdapter.js";

/** Default VNC port assumed on the guest; override per-deployment via env. */
const DEFAULT_VNC_PORT = Number(process.env.BOXWIZARD_VM_VNC_PORT ?? 5900);
/** Where ephemeral differencing disks are written; must exist and be writable. */
const VM_WORK_DIR = process.env.BOXWIZARD_VM_WORK_DIR ?? "C:\\BoxWizard\\vms";

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new BoxWizardError("runtime_unavailable", `PowerShell command failed: ${stderr || err.message}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

interface VmBookkeeping {
  vmName: string;
  diffDiskPath: string;
  vncHost: string | null;
  vncPort: number;
}

/**
 * Real VM backend, driving Hyper-V via PowerShell cmdlets exactly as
 * validated in scripts/prototypes/hyperv-vm-runtime/new-ephemeral-vm.ps1:
 * differencing disk off a reusable base VHDX, Gen2 VM, hard TTL teardown.
 *
 * Requires (checked lazily, on first create()):
 *   - Hyper-V Windows feature enabled (admin + reboot; see
 *     docs/runtime-vm-prototype.md) - Get-VM/New-VM must resolve.
 *   - BOXWIZARD_VM_BASE_VHDX_<KIND> env var pointing at a sysprepped base
 *     image to differencing off of.
 *   - For in-browser console access: the guest image must run a VNC server
 *     on BOXWIZARD_VM_VNC_PORT (default 5900). BoxWizard cannot install this
 *     inside an arbitrary guest - see docs/runtime-vm-prototype.md.
 */
export class HyperVRuntimeAdapter implements RuntimeAdapter {
  private environments = new Map<string, EnvironmentRecord>();
  private bookkeeping = new Map<string, VmBookkeeping>();
  private ttlTimers = new Map<string, NodeJS.Timeout>();
  private featureChecked = false;

  private async ensureHyperVAvailable(): Promise<void> {
    if (this.featureChecked) return;
    try {
      await runPowerShell("Get-Command Get-VM -ErrorAction Stop | Out-Null");
    } catch {
      throw new BoxWizardError(
        "runtime_unavailable",
        "Hyper-V is not available on this machine (module/feature not present). Enable the " +
          "Hyper-V Windows feature (requires admin rights + reboot) to launch VM sandboxes - " +
          "see docs/runtime-vm-prototype.md. Container sandboxes work without this.",
      );
    }
    this.featureChecked = true;
  }

  private baseVhdxFor(templateId: string | null): string {
    const envKey = `BOXWIZARD_VM_BASE_VHDX_${(templateId ?? "default").toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const specific = process.env[envKey];
    const generic = process.env.BOXWIZARD_VM_BASE_VHDX;
    const base = specific ?? generic;
    if (!base) {
      throw new BoxWizardError(
        "runtime_unavailable",
        `No base VHDX configured for template "${templateId}". Set ${envKey} or BOXWIZARD_VM_BASE_VHDX to a ` +
          "sysprepped base image path - see docs/runtime-vm-prototype.md.",
      );
    }
    return base;
  }

  async create(req: CreateEnvironmentRequest): Promise<EnvironmentRecord> {
    if (req.kind !== "vm") {
      throw new BoxWizardError("not_supported_for_kind", "HyperVRuntimeAdapter only handles kind=vm.");
    }
    if (req.ttlSeconds > MAX_TTL_SECONDS) {
      throw new BoxWizardError(
        "ttl_exceeded_max",
        `Requested ttlSeconds (${req.ttlSeconds}) exceeds the server-enforced max (${MAX_TTL_SECONDS}).`,
      );
    }
    await this.ensureHyperVAvailable();

    if (req.template) {
      const tpl = findTemplate(req.template);
      if (!tpl) throw new BoxWizardError("invalid_template", `Unknown template id: ${req.template}`);
      if (tpl.kind !== "vm") throw new BoxWizardError("invalid_template", `Template ${req.template} is kind=${tpl.kind}, not vm.`);
    }

    const baseVhdx = this.baseVhdxFor(req.template ?? null);
    const cpus = req.resources?.cpus ?? 2;
    const memoryMb = req.resources?.memoryMb ?? 4096;
    const id = randomUUID();
    const vmName = `boxwizard-${id.slice(0, 8)}`;
    const diffDiskPath = path.join(VM_WORK_DIR, `${vmName}.vhdx`);
    const memBytes = Math.round(memoryMb * 1024 * 1024);

    const script = `
      New-Item -ItemType Directory -Force -Path "${VM_WORK_DIR}" | Out-Null
      New-VHD -Path "${diffDiskPath}" -ParentPath "${baseVhdx}" -Differencing | Out-Null
      New-VM -Name "${vmName}" -MemoryStartupBytes ${memBytes} -VHDPath "${diffDiskPath}" -Generation 2 | Out-Null
      Set-VMProcessor -VMName "${vmName}" -Count ${cpus}
      Set-VMMemory -VMName "${vmName}" -DynamicMemoryEnabled $true -MinimumBytes ${Math.round(memBytes / 2)} -MaximumBytes ${memBytes}
      Set-VMFirmware -VMName "${vmName}" -EnableSecureBoot On
      Start-VM -Name "${vmName}"
    `;
    try {
      await runPowerShell(script);
    } catch (err) {
      throw new BoxWizardError("runtime_unavailable", `Failed to create/start VM: ${(err as Error).message}`);
    }

    const now = new Date();
    const record: EnvironmentRecord = {
      id,
      kind: "vm",
      template: req.template ?? null,
      image: null,
      status: "running",
      createdAt: now.toISOString(),
      ttlSeconds: req.ttlSeconds,
      ttlExpiresAt: new Date(now.getTime() + req.ttlSeconds * 1000).toISOString(),
      resources: { cpus, memoryMb },
      ports: req.ports ?? [],
      usage: null,
      connection: { type: "vnc", url: `/vnc-proxy/${id}`, host: null, port: DEFAULT_VNC_PORT },
    };
    this.environments.set(id, record);
    this.bookkeeping.set(id, { vmName, diffDiskPath, vncHost: null, vncPort: DEFAULT_VNC_PORT });
    this.scheduleTtlDestroy(id, req.ttlSeconds);

    // Best-effort: guest IP takes a few seconds to be reported via Integration
    // Services; don't block create() on it.
    void this.pollGuestIp(id, vmName);

    return record;
  }

  private async pollGuestIp(id: string, vmName: string, attemptsLeft = 15): Promise<void> {
    if (attemptsLeft <= 0) return;
    try {
      const out = await runPowerShell(
        `(Get-VMNetworkAdapter -VMName "${vmName}" | Select-Object -First 1 -ExpandProperty IPAddresses | Where-Object { $_ -notlike '*:*' } | Select-Object -First 1)`,
      );
      const ip = out.trim();
      const bk = this.bookkeeping.get(id);
      const record = this.environments.get(id);
      if (ip && bk && record && record.connection?.type === "vnc") {
        bk.vncHost = ip;
        record.connection = { ...record.connection, host: ip };
        return;
      }
    } catch {
      // guest not ready yet; retry below
    }
    setTimeout(() => void this.pollGuestIp(id, vmName, attemptsLeft - 1), 4000).unref();
  }

  async list(): Promise<EnvironmentRecord[]> {
    const records = Array.from(this.environments.values());
    return Promise.all(records.map((r) => this.refresh(r)));
  }

  async get(id: string): Promise<EnvironmentRecord> {
    const record = this.environments.get(id);
    if (!record) throw new BoxWizardError("not_found", `No environment with id ${id}`);
    return this.refresh(record);
  }

  private async refresh(record: EnvironmentRecord): Promise<EnvironmentRecord> {
    if (record.status !== "running") return { ...record, usage: null };
    try {
      record.usage = await this.getUsage(record.id);
    } catch {
      record.usage = null;
    }
    return record;
  }

  async getUsage(id: string): Promise<ResourceUsage> {
    const record = this.environments.get(id);
    const bk = this.bookkeeping.get(id);
    if (!record || !bk) throw new BoxWizardError("not_found", `No environment with id ${id}`);
    if (record.status !== "running") throw new BoxWizardError("not_found", `Environment ${id} is not running.`);

    const out = await runPowerShell(
      `Get-VM -Name "${bk.vmName}" | Select-Object CPUUsage, MemoryAssigned, MemoryDemand | ConvertTo-Json -Compress`,
    );
    const parsed = JSON.parse(out) as { CPUUsage: number; MemoryAssigned: number; MemoryDemand: number };
    return {
      cpuPercent: parsed.CPUUsage ?? 0,
      memoryUsedMb: Math.round((parsed.MemoryAssigned ?? 0) / (1024 * 1024)),
      memoryLimitMb: record.resources.memoryMb,
      sampledAt: new Date().toISOString(),
    };
  }

  async getVncTarget(id: string): Promise<{ host: string; port: number }> {
    const bk = this.bookkeeping.get(id);
    if (!bk) throw new BoxWizardError("not_found", `No environment with id ${id}`);
    if (!bk.vncHost) {
      throw new BoxWizardError(
        "runtime_unavailable",
        "VM guest IP address is not yet available (guest may still be booting, or Hyper-V Integration " +
          "Services aren't running). Also ensure the guest is running a VNC server on the configured port - " +
          "see docs/runtime-vm-prototype.md.",
      );
    }
    return { host: bk.vncHost, port: bk.vncPort };
  }

  async exec(id: string, _req: ExecRequest): Promise<ExecResult> {
    await this.get(id);
    throw new BoxWizardError("not_supported_for_kind", "exec_command is only supported for kind=container; use the VNC console for VMs.");
  }

  async extend(id: string, additionalSeconds: number): Promise<EnvironmentRecord> {
    const record = await this.get(id);
    const newExpiry = new Date(new Date(record.ttlExpiresAt).getTime() + additionalSeconds * 1000);
    const cappedExpiry = new Date(Math.min(newExpiry.getTime(), new Date(record.createdAt).getTime() + MAX_TTL_SECONDS * 1000));
    record.ttlExpiresAt = cappedExpiry.toISOString();
    this.scheduleTtlDestroy(id, Math.max(0, (cappedExpiry.getTime() - Date.now()) / 1000));
    return record;
  }

  async destroy(id: string): Promise<void> {
    const record = await this.get(id);
    const bk = this.bookkeeping.get(id);
    record.status = "destroying";
    const timer = this.ttlTimers.get(id);
    if (timer) clearTimeout(timer);
    if (bk) {
      try {
        await runPowerShell(
          `Stop-VM -Name "${bk.vmName}" -TurnOff -Force -ErrorAction SilentlyContinue; ` +
            `Remove-VM -Name "${bk.vmName}" -Force -ErrorAction SilentlyContinue; ` +
            `Remove-Item -Path "${bk.diffDiskPath}" -Force -ErrorAction SilentlyContinue`,
        );
      } catch {
        // best-effort teardown; VM is still marked destroyed below so it
        // disappears from the "running" view even if cleanup needs a retry.
      }
    }
    record.status = "destroyed";
    record.usage = null;
  }

  private scheduleTtlDestroy(id: string, ttlSeconds: number) {
    const existing = this.ttlTimers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => void this.destroy(id), ttlSeconds * 1000);
    timer.unref();
    this.ttlTimers.set(id, timer);
  }
}
