import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { briefingJsonSchema } from "./schema";

export interface BriefingGenerator {
  generate(prompt: string): Promise<unknown>;
}

function executeCodex(
  directory: string,
  prompt: string,
  model: string | null,
): Promise<{ text: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const args = process.env.MYBLOOMBERG_CODEX_BIN
      ? ["proxy", process.env.MYBLOOMBERG_CODEX_BIN]
      : [
          "proxy",
          process.execPath,
          path.join(
            process.cwd(),
            "node_modules",
            "@openai",
            "codex",
            "bin",
            "codex.js",
          ),
        ];
    args.push(
      "exec",
      "--ignore-user-config",
      "-c",
      "web_search=disabled",
      "-c",
      "features.shell_tool=false",
      "-c",
      "project_doc_max_bytes=0",
      "-c",
      `model_reasoning_effort=${process.env.MYBLOOMBERG_CODEX_REASONING_EFFORT || process.env.MYBLOOMBERG_CODEX_REASONING || "medium"}`,
    );
    if (model) args.push("--model", model);
    args.push(
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--output-schema",
      path.join(directory, "schema.json"),
      "--output-last-message",
      path.join(directory, "result.json"),
      "-",
    );
    const environment = { ...process.env };
    // Explicitly reuse the saved ChatGPT login, never an unrelated API key in the environment.
    delete environment.OPENAI_API_KEY;
    delete environment.CODEX_API_KEY;
    delete environment.RUST_LOG;
    const child = spawn("rtk", args, {
      cwd: directory,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      bytes = 0,
      settled = false;
    const stop = () => {
      if (process.platform === "win32" && child.pid) {
        // RTK, Node and the native CLI form a process tree on Windows.
        const killer = spawn(
          "rtk",
          ["proxy", "taskkill", "/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        killer.on("error", () => {
          child.kill();
        });
      } else child.kill();
    };
    const finish = (error?: Error, code = 1) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ text: output, exitCode: code });
    };
    const capture = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 2_000_000) {
        stop();
        finish(new Error("Codex 응답이 너무 큽니다."));
      } else output += chunk.toString("utf8");
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", () =>
      finish(
        new Error(
          "Codex CLI를 실행할 수 없습니다. Codex와 RTK 설치 경로를 확인하세요.",
        ),
      ),
    );
    child.on("close", (code) => finish(undefined, code ?? 1));
    child.stdin.on("error", () => {});
    const timer = setTimeout(() => {
      stop();
      finish(
        new Error(
          "Codex 분석 시간이 5분을 초과했습니다. 이전 성공 브리핑은 유지됩니다.",
        ),
      );
    }, 300_000);
    child.stdin.end(prompt, "utf8");
  });
}

export class LocalCodexGenerator implements BriefingGenerator {
  async generate(prompt: string): Promise<unknown> {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "mybloomberg-codex-"),
    );
    try {
      await writeFile(
        path.join(directory, "schema.json"),
        JSON.stringify(briefingJsonSchema),
        "utf8",
      );
      let model = process.env.MYBLOOMBERG_CODEX_MODEL || null;
      if (!model) {
        try {
          const config = await readFile(
            path.join(
              process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
              "config.toml",
            ),
            "utf8",
          );
          model =
            config.match(/^model\s*=\s*["']([^"'\r\n]+)["']/m)?.[1] ?? null;
        } catch {
          /* The CLI's own model default remains available. */
        }
      }
      // An isolated invocation reuses auth but not unrelated MCP servers, hooks, or service-tier settings.
      const result = await executeCodex(directory, prompt, model);
      if (result.exitCode !== 0) {
        if (
          /not logged|login|unauthorized|401|refresh.token/i.test(result.text)
        )
          throw new Error(
            "Codex 로그인이 필요합니다. 로컬 터미널에서 rtk pnpm exec codex login 후 다시 생성하세요.",
          );
        if (/usage.limit|rate.limit|429|quota/i.test(result.text))
          throw new Error(
            "Codex 사용 한도 또는 요청 제한입니다. 잠시 후 다시 생성하세요.",
          );
        throw new Error(
          "Codex 실행에 실패했습니다. CLI 설정과 연결 상태를 확인하세요. 이전 성공 브리핑은 유지됩니다.",
        );
      }
      const raw = await readFile(path.join(directory, "result.json"), "utf8");
      return JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    } finally {
      if (
        path
          .resolve(directory)
          .startsWith(path.join(os.tmpdir(), "mybloomberg-codex-"))
      )
        await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }
}
