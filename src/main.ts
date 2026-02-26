import { basename, join } from "node:path";
import { existsSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type ChromeChannel = "stable" | "canary" | "dev" | "beta";

type ChromeProcess = {
  pid: number;
  ppid: number;
  name: string;
  executable: string;
};

function getVersionAndUserDataPath(): Map<ChromeChannel, string> {
  const osAndUserDataPaths: Record<string, Record<ChromeChannel, string>> = {
    win32: {
      stable: "~/AppData/Local/Google/Chrome/User Data",
      canary: "~/AppData/Local/Google/Chrome SxS/User Data",
      dev: "~/AppData/Local/Google/Chrome Dev/User Data",
      beta: "~/AppData/Local/Google/Chrome Beta/User Data",
    },
    linux: {
      stable: "~/.config/google-chrome",
      canary: "~/.config/google-chrome-canary",
      dev: "~/.config/google-chrome-unstable",
      beta: "~/.config/google-chrome-beta",
    },
    darwin: {
      stable: "~/Library/Application Support/Google/Chrome",
      canary: "~/Library/Application Support/Google/Chrome Canary",
      dev: "~/Library/Application Support/Google/Chrome Dev",
      beta: "~/Library/Application Support/Google/Chrome Beta",
    },
  };

  const match = Object.entries(osAndUserDataPaths).find(([platform]) => process.platform.startsWith(platform));
  if (!match) {
    throw new Error(`Unsupported platform ${process.platform}`);
  }

  const availableVersionAndUserDataPath = new Map<ChromeChannel, string>();
  for (const [version, userDataPath] of Object.entries(match[1]) as [ChromeChannel, string][]) {
    const expandedPath = userDataPath.replace(/^~(?=$|\/|\\)/, process.env.HOME ?? "~");
    if (existsSync(expandedPath)) {
      availableVersionAndUserDataPath.set(version, expandedPath);
    }
  }

  return availableVersionAndUserDataPath;
}

function parseMacOrLinuxProcessList(): ChromeProcess[] {
  const lines = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,comm="], { encoding: "utf-8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) {
        return null;
      }

      const pid = Number(match[1]);
      const ppid = Number(match[2]);
      const comm = match[3];
      const name = basename(comm);

      let executable = comm;
      if (process.platform === "linux") {
        const procExe = `/proc/${pid}/exe`;
        try {
          executable = readlinkSync(procExe);
        } catch {
          executable = comm;
        }
      }

      return { pid, ppid, name, executable };
    })
    .filter((proc): proc is ChromeProcess => proc !== null);
}

function parseWindowsProcessList(): ChromeProcess[] {
  const command = [
    "$procs = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath",
    "$procs | ForEach-Object {\"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$($_.ExecutablePath)\"}",
  ].join("; ");

  const lines = execFileSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf-8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const [pidText, ppidText, name, executable] = line.split("\t");
      const pid = Number(pidText);
      const ppid = Number(ppidText);
      if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !name) {
        return null;
      }
      return { pid, ppid, name, executable: executable || "" };
    })
    .filter((proc): proc is ChromeProcess => proc !== null);
}

function isChromeProcessName(name: string): boolean {
  if (process.platform === "darwin") {
    return name.startsWith("Google Chrome");
  }

  const lower = basename(name).toLowerCase().replace(/\.exe$/, "");
  return lower === "chrome";
}

function listChromeProcesses(): ChromeProcess[] {
  if (process.platform === "win32") {
    return parseWindowsProcessList();
  }

  return parseMacOrLinuxProcessList();
}

function shutdownChrome(): Set<string> {
  const processes = listChromeProcesses();
  const nameByPid = new Map<number, string>(processes.map((proc) => [proc.pid, proc.name]));
  const restartTargets = new Set<string>();

  for (const proc of processes) {
    if (!isChromeProcessName(proc.name)) {
      continue;
    }

    const parentName = nameByPid.get(proc.ppid);
    if (parentName && parentName === proc.name) {
      continue;
    }

    try {
      process.kill(proc.pid, "SIGKILL");
      if (process.platform === "darwin") {
        restartTargets.add(proc.name);
      } else if (proc.executable) {
        restartTargets.add(proc.executable);
      }
    } catch {
      // Ignore races with process exit.
    }
  }

  return restartTargets;
}

function getLastVersion(userDataPath: string): string | null {
  const lastVersionFile = join(userDataPath, "Last Version");
  if (!existsSync(lastVersionFile)) {
    return null;
  }

  return readFileSync(lastVersionFile, "utf-8");
}

function setAllIsGlicEligible(obj: unknown): boolean {
  let modified = false;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === "object" && item !== null && setAllIsGlicEligible(item)) {
        modified = true;
      }
    }
    return modified;
  }

  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const record = obj as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === "is_glic_eligible" && value !== true) {
      record[key] = true;
      modified = true;
      continue;
    }

    if (typeof value === "object" && value !== null && setAllIsGlicEligible(value)) {
      modified = true;
    }
  }

  return modified;
}

function patchLocalState(userDataPath: string, lastVersion: string): void {
  const localStateFile = join(userDataPath, "Local State");
  if (!existsSync(localStateFile)) {
    console.log("Failed to patch Local State. File not found", localStateFile);
    return;
  }

  const localState = JSON.parse(readFileSync(localStateFile, "utf-8")) as Record<string, unknown>;
  let modified = false;

  if (setAllIsGlicEligible(localState)) {
    modified = true;
    console.log("Patched is_glic_eligible");
  }

  if (localState.variations_country !== "us") {
    localState.variations_country = "us";
    modified = true;
    console.log("Patched variations_country");
  }

  const consistencyCountry = localState.variations_permanent_consistency_country;
  if (Array.isArray(consistencyCountry) && consistencyCountry.length >= 2) {
    if (consistencyCountry[0] !== lastVersion || consistencyCountry[1] !== "us") {
      consistencyCountry[0] = lastVersion;
      consistencyCountry[1] = "us";
      modified = true;
      console.log("Patched variations_permanent_consistency_country");
    }
  }

  if (modified) {
    writeFileSync(localStateFile, JSON.stringify(localState), "utf-8");
    console.log("Succeeded in patching Local State");
  } else {
    console.log("No need to patch Local State");
  }
}

function restartChrome(targets: Set<string>): void {
  for (const target of targets) {
    if (process.platform === "darwin") {
      spawn("open", ["-a", target], { stdio: "ignore", detached: true }).unref();
      continue;
    }

    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", target], { stdio: "ignore", detached: true }).unref();
      continue;
    }

    spawn(target, { stdio: "ignore", detached: true }).unref();
  }
}

async function waitForEnter(): Promise<void> {
  if (!process.stdin.isTTY) {
    return;
  }

  const rl = createInterface({ input, output });
  await rl.question("Enter to continue...");
  rl.close();
}

async function main(): Promise<void> {
  const versionAndUserDataPath = getVersionAndUserDataPath();
  if (versionAndUserDataPath.size === 0) {
    throw new Error("No available user data path found");
  }

  const terminatedChromes = shutdownChrome();
  if (terminatedChromes.size > 0) {
    console.log("Shutdown Chrome");
  }

  for (const [version, userDataPath] of versionAndUserDataPath.entries()) {
    const lastVersion = getLastVersion(userDataPath);
    if (lastVersion === null) {
      console.log("Failed to get version. File not found", join(userDataPath, "Last Version"));
      continue;
    }

    console.log("Patching Chrome", version, lastVersion, `\"${userDataPath}\"`);
    patchLocalState(userDataPath, lastVersion);
  }

  if (terminatedChromes.size > 0) {
    console.log("Restart Chrome");
    restartChrome(terminatedChromes);
  }

  await waitForEnter();
}

await main();
