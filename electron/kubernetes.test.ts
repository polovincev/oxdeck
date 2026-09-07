import assert from "node:assert/strict";
import test from "node:test";
import {
  kubernetesReadArgs,
  kubernetesReadError,
  parseKubernetesNamespaces,
  parseKubernetesPods,
} from "./kubernetes.js";

void test("cluster reads use fixed commands, explicit scope and a timeout", () => {
  assert.deepEqual(kubernetesReadArgs("namespaces", "staging"), [
    "--context=staging",
    "--request-timeout=10s",
    "get",
    "namespaces",
    "--output=json",
  ]);
  assert.deepEqual(kubernetesReadArgs("pods", "staging", "backend"), [
    "--context=staging",
    "--request-timeout=10s",
    "get",
    "pods",
    "--output=json",
    "--namespace=backend",
  ]);
  assert.equal(
    kubernetesReadArgs("pods", "name; $(echo bad)", "default")[0],
    "--context=name; $(echo bad)",
  );
  for (const context of [null, {}, "", "a\nb", "a".repeat(1025)]) {
    assert.throws(() => kubernetesReadArgs("pods", context, "default"));
  }
  for (const namespace of [
    null,
    {},
    "",
    "--all-namespaces",
    "ns; echo bad",
    "UPPER",
    "a".repeat(64),
  ]) {
    assert.throws(() => kubernetesReadArgs("pods", "staging", namespace));
  }
});

void test("pod summaries distinguish readiness, crash loops, init, sidecars and terminating pods", () => {
  const pod = {
    metadata: { name: "api", uid: "pod-1" },
    spec: {
      containers: [
        { name: "app", env: [{ name: "SECRET", value: "never-return-this" }] },
      ],
      initContainers: [
        { name: "setup" },
        { name: "proxy", restartPolicy: "Always" },
      ],
      ephemeralContainers: [{ name: "debug" }],
    },
    status: {
      phase: "Running",
      conditions: [{ type: "Ready", status: "True" }],
      containerStatuses: [
        { name: "app", ready: true, restartCount: 2, state: { running: {} } },
      ],
      initContainerStatuses: [
        {
          name: "setup",
          ready: false,
          restartCount: 1,
          state: { terminated: { exitCode: 0, reason: "Completed" } },
        },
        { name: "proxy", ready: true, restartCount: 3, state: { running: {} } },
      ],
    },
  };
  const [healthy] = parseKubernetesPods({ items: [pod] });
  assert.equal(healthy.status, "Running");
  assert.equal(healthy.healthy, true);
  assert.equal(healthy.ready, 2);
  assert.equal(healthy.total, 2);
  assert.equal(healthy.restarts, 6);
  assert.deepEqual(healthy.containers, [
    { name: "app", kind: "app" },
    { name: "setup", kind: "init" },
    { name: "proxy", kind: "sidecar" },
    { name: "debug", kind: "ephemeral" },
  ]);
  assert.ok(!JSON.stringify(healthy).includes("never-return-this"));
  const [crashed] = parseKubernetesPods({
    items: [
      {
        ...pod,
        status: {
          ...pod.status,
          containerStatuses: [
            {
              name: "app",
              ready: false,
              restartCount: 7,
              state: { waiting: { reason: "CrashLoopBackOff" } },
            },
          ],
        },
      },
    ],
  });
  assert.equal(crashed.status, "CrashLoopBackOff");
  assert.equal(crashed.ready, 1);
  assert.equal(crashed.healthy, false);
  const [terminating] = parseKubernetesPods({
    items: [
      {
        ...pod,
        metadata: {
          ...pod.metadata,
          deletionTimestamp: "2026-09-07T12:00:00Z",
        },
      },
    ],
  });
  assert.equal(terminating.status, "Terminating");
  assert.equal(terminating.healthy, false);
  const [pending] = parseKubernetesPods({
    items: [
      {
        metadata: { name: "pending" },
        spec: { containers: [{ name: "app" }] },
        status: { phase: "Pending" },
      },
    ],
  });
  assert.equal(pending.status, "Pending");
  assert.equal(pending.ready, 0);
  assert.equal(pending.total, 1);
  assert.equal(pending.restarts, 0);
  const [gated] = parseKubernetesPods({
    items: [
      {
        ...pod,
        status: {
          ...pod.status,
          conditions: [{ type: "Ready", status: "False" }],
        },
      },
    ],
  });
  assert.equal(gated.healthy, false);
});

void test("handles empty lists and errors without leaking credential plugin stderr", () => {
  assert.deepEqual(parseKubernetesPods({ items: [] }), []);
  assert.deepEqual(
    parseKubernetesNamespaces({
      items: [{ metadata: { name: "z" } }, { metadata: { name: "a" } }],
    }),
    ["a", "z"],
  );
  assert.throws(() => parseKubernetesPods({ message: "forbidden" }));
  assert.match(
    kubernetesReadError({ stderr: "Forbidden TOKEN=do-not-expose" }),
    /Forbidden/,
  );
  assert.match(
    kubernetesReadError({ stderr: "Unauthorized TOKEN=do-not-expose" }),
    /вход/,
  );
  assert.match(kubernetesReadError({ killed: true }), /вовремя/);
  assert.ok(
    !kubernetesReadError({
      stderr: "auth failed TOKEN=do-not-expose",
      code: 1,
    }).includes("do-not-expose"),
  );
});
