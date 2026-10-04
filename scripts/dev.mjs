// Runs the FastAPI backend and the Vite frontend together with prefixed output.
// Usage: npm run dev   (Ctrl+C stops both)
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const services = [
  {
    name: "api",
    color: "\x1b[35m",
    command: python,
    args: ["-m", "uvicorn", "main:app", "--reload", "--port", "8000", "--app-dir", "backend"],
  },
  {
    name: "web",
    color: "\x1b[34m",
    command: "npm",
    args: ["--prefix", "frontend", "run", "dev"],
  },
];

const reset = "\x1b[0m";
const children = [];
let shuttingDown = false;

function prefixLines(name, color, chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) process.stdout.write(`${color}${name.padEnd(4)}${reset}| ${line}\n`);
  }
}

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === "win32") {
      // npm and uvicorn --reload spawn their own children; kill the whole tree.
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 500);
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: root,
    shell: process.platform === "win32",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  children.push(child);
  child.stdout.on("data", (chunk) => prefixLines(service.name, service.color, chunk));
  child.stderr.on("data", (chunk) => prefixLines(service.name, service.color, chunk));
  child.on("exit", (code) => {
    if (!shuttingDown) {
      process.stdout.write(`${service.color}${service.name}${reset} exited with code ${code}; stopping.\n`);
      stopAll(code ?? 1);
    }
  });
}

process.stdout.write("ShopOS: API on http://127.0.0.1:8000 · app on http://127.0.0.1:5173\n");
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
