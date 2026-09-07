import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Button } from "../../ui/Button/Button";
import "./KubernetesPage.css";

export type KubernetesPageOption = {
  id: string;
  name: string;
  detail?: string;
  healthy?: boolean;
};

export function KubernetesPage({
  label,
  options,
  value,
  onSelect,
  message,
  tools,
  searchable = true,
}: {
  label: string;
  options: ReadonlyArray<KubernetesPageOption>;
  value?: string;
  onSelect: (id: string) => void;
  message?: string;
  tools?: ReactNode;
  searchable?: boolean;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState({ columns: 1, rows: 1, compact: false });
  useEffect(() => {
    const element = grid.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const columns = Math.max(1, Math.floor((element.clientWidth + 12) / 232));
      const rows = Math.max(1, Math.floor((element.clientHeight + 12) / 104));
      setSize({ columns, rows, compact: element.clientHeight < 80 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const filtered = options.filter((option) =>
    option.name.toLowerCase().includes(search.toLowerCase()),
  );
  const capacity = size.columns * size.rows;
  const pages = Math.max(1, Math.ceil(filtered.length / capacity));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * capacity, (current + 1) * capacity);
  return (
    <section className="kubernetes-page" aria-label={label}>
      <div className="kubernetes-page-toolbar">
        {searchable ? (
          <input
            type="search"
            aria-label={`Поиск: ${label}`}
            placeholder={`Поиск: ${label}`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        ) : (
          <h2>{label}</h2>
        )}
        {tools}
      </div>
      <div
        ref={grid}
        className={`kubernetes-page-grid${size.compact ? " compact" : ""}`}
        role="group"
        aria-label={label}
        style={
          {
            "--page-columns": size.columns,
            "--page-rows": size.rows,
          } as CSSProperties
        }
      >
        {message || !visible.length ? (
          <p className="kubernetes-page-message" role="status">
            {message || "Ничего не найдено"}
          </p>
        ) : (
          visible.map((option) => (
            <Button
              type="button"
              className="kubernetes-page-card"
              key={option.id}
              aria-pressed={value === option.id}
              title={[option.name, option.detail].filter(Boolean).join("\n")}
              onClick={() => onSelect(option.id)}
            >
              <strong>{option.name}</strong>
              {option.detail && (
                <span
                  className={
                    option.healthy === undefined
                      ? ""
                      : option.healthy
                        ? "healthy"
                        : "attention"
                  }
                >
                  {option.detail}
                </span>
              )}
            </Button>
          ))
        )}
      </div>
      <nav className="kubernetes-pagination" aria-label={`Страницы: ${label}`}>
        <span>
          {filtered.length} · {current + 1} / {pages}
        </span>
        <Button
          type="button"
          aria-label="Предыдущая страница"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          ←
        </Button>
        <Button
          type="button"
          aria-label="Следующая страница"
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          →
        </Button>
      </nav>
    </section>
  );
}
