import { useEffect, useState } from "react";
import type { KubernetesListResult } from "../../../shared/kubernetes";

export function useKubernetesList<T>(
  load: (
    context: string,
    namespace: string,
  ) => Promise<KubernetesListResult<T>>,
  context: string,
  namespace: string,
  enabled = true,
  keepItemsOnRefresh = false,
) {
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    scope: string;
    result: KubernetesListResult<T>;
  } | null>(null);
  const key = JSON.stringify([context, namespace, revision]);
  const scope = JSON.stringify([context, namespace]);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    void load(context, namespace)
      .then((result) => {
        if (!cancelled) {
          setResponse({ key, scope, result });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResponse({
            key,
            scope,
            result: {
              ok: false,
              message: "Не удалось загрузить данные. Повторите запрос.",
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [context, namespace, key, scope, enabled, load]);
  const result = enabled && response?.key === key ? response.result : null;
  return {
    items: result?.ok
      ? result.items
      : enabled &&
          !result &&
          keepItemsOnRefresh &&
          response?.scope === scope &&
          response.result.ok
        ? response.result.items
        : [],
    error: result && !result.ok ? result.message : "",
    loading: enabled && result === null,
    refresh: () => setRevision((value) => value + 1),
  };
}
