import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  buildKubernetesCommand,
  changeKubernetesScope,
  defaultKubernetesSettings,
  kubernetesNamespace,
  restoreKubernetesSettings,
  type KubernetesSettings,
} from "./kubernetes.js";

const settings: KubernetesSettings = {
  ...defaultKubernetesSettings,
  context: "staging",
  namespaces: { staging: "backend" },
  pod: "api-7d8f9",
  container: "app",
};
const base = "kubectl --context=staging --namespace=backend";

void test("builds all six commands with explicit scope and only relevant options", () => {
  const cases: Array<[Partial<KubernetesSettings>, string]> = [
    [{ action: "pods" }, "get pods"],
    [{ action: "pods", wide: true }, "get pods --output=wide"],
    [{ action: "logs" }, "logs api-7d8f9 --tail=200 --container=app"],
    [
      { action: "logs", logMode: "follow", since: "1h30m" },
      "logs api-7d8f9 --tail=200 --since=1h30m --follow --container=app",
    ],
    [
      { action: "logs", logMode: "previous", container: "" },
      "logs api-7d8f9 --tail=200 --previous",
    ],
    [{ action: "describe" }, "describe pod api-7d8f9"],
    [{ action: "manifest" }, "get pod api-7d8f9 --output=yaml"],
    [{ action: "manifest", format: "json" }, "get pod api-7d8f9 --output=json"],
    [{ action: "exec" }, "exec api-7d8f9 -it --container=app -- sh"],
    [
      { action: "exec", shell: "bash", container: "" },
      "exec api-7d8f9 -it -- bash",
    ],
    [{ action: "forward" }, "port-forward pod/api-7d8f9 8080:80"],
    [
      { action: "forward", resource: "service", service: "api", pod: "" },
      "port-forward service/api 8080:80",
    ],
  ];
  for (const [changes, expected] of cases) {
    assert.deepEqual(buildKubernetesCommand({ ...settings, ...changes }), {
      command: `${base} ${expected}`,
      error: "",
    });
  }
});

void test("rejects missing fields, option injection and invalid numbers", () => {
  for (const changes of [
    { context: "" },
    { context: "stage\nprod" },
    { namespaces: { staging: "" } },
    { namespaces: { staging: "bad namespace" } },
    { action: "logs", pod: "--all-pods" },
    { action: "describe", pod: "" },
    { action: "logs", container: "app; echo bad" },
    { action: "logs", tail: "-1" },
    { action: "logs", tail: "1.5" },
    { action: "logs", since: "1d" },
    { action: "logs", since: "15m; echo bad" },
    { action: "forward", localPort: "0" },
    { action: "forward", remotePort: "65536" },
    { action: "forward", resource: "service", service: "" },
  ] satisfies Partial<KubernetesSettings>[]) {
    const result = buildKubernetesCommand({ ...settings, ...changes });
    assert.equal(result.command, "", JSON.stringify(changes));
    assert.ok(result.error);
  }
});

void test("shell quoting preserves contexts literally without executing substitutions", () => {
  const context = "stage ' $(printf INJECTED) `printf BAD` ; *";
  const result = buildKubernetesCommand({ ...settings, context });
  // A shell function captures argv; kubectl is never executed.
  const output = execFileSync(
    "/bin/sh",
    ["-c", `kubectl() { printf '%s\\n' "$@"; }; ${result.command}`],
    { encoding: "utf8" },
  );
  assert.deepEqual(output.trimEnd().split("\n"), [
    `--context=${context}`,
    "--namespace=default",
    "get",
    "pods",
  ]);
});

void test("restores settings and remembers namespace per context while clearing resource names", () => {
  const saved = {
    ...settings,
    action: "logs",
    logMode: "previous",
    tail: "500",
  };
  const restored = restoreKubernetesSettings(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored, saved);
  const production = changeKubernetesScope(restored, "production", "payments");
  assert.equal(production.pod, "");
  assert.equal(production.container, "");
  assert.equal(production.service, "");
  assert.equal(kubernetesNamespace(production), "payments");
  assert.equal(
    kubernetesNamespace(changeKubernetesScope(production, "staging")),
    "backend",
  );
  assert.equal(production.tail, "500");
  assert.deepEqual(restoreKubernetesSettings(null), defaultKubernetesSettings);
  assert.equal(
    restoreKubernetesSettings({ action: "delete", namespaces: [] }).action,
    "pods",
  );
  assert.equal(
    kubernetesNamespace({ ...settings, context: "toString", namespaces: {} }),
    "default",
  );
});
