import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { Button } from "../../ui/Button/Button";
import "./FileShelf.css";

export function FileShelf({
  editing,
  notify,
}: {
  editing: boolean;
  notify: (text: string) => void;
}) {
  const [items, setItems] = useState<OxDeckFile[]>([]);
  const [drop, setDrop] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => void window.oxdeck.listFiles().then(setItems), []);

  async function open(item: OxDeckFile) {
    const result = await window.oxdeck.openFile(item.path);
    if (!result.ok) {
      notify(result.message);
    }
  }

  async function menu(event: MouseEvent, item: OxDeckFile) {
    event.preventDefault();
    if (editing) {
      return;
    }
    const action = await window.oxdeck.fileMenu(item.path);
    if (action === "reveal") {
      const result = await window.oxdeck.revealFile(item.path);
      if (!result.ok) {
        notify(result.message);
      }
    }
    if (action === "remove") {
      setItems(await window.oxdeck.removeFile(item.path));
    }
    if (action === "replace") {
      setItems(await window.oxdeck.replaceFile(item.path));
    }
  }

  function startDrag(event: DragEvent, filePath: string) {
    event.preventDefault();
    event.stopPropagation();
    window.oxdeck.startFileDrag(filePath);
  }

  function hasFiles(event: DragEvent) {
    return !editing && Array.from(event.dataTransfer.types).includes("Files");
  }

  async function receive(event: DragEvent) {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDrop(false);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.oxdeck.pathForFile(file))
      .filter(Boolean);
    const result = await window.oxdeck.addFiles(paths);
    if (!result.ok) {
      notify(result.message);
      return;
    }
    setItems(result.items);
    notify(
      result.added ? `Добавлено: ${result.added}` : "Эти файлы уже на полке",
    );
  }

  return (
    <section
      className={`file-shelf${drop ? " drop" : ""}`}
      onDragEnter={(event) => {
        if (!hasFiles(event)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current += 1;
        setDrop(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        event.stopPropagation();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDrop(false);
        }
      }}
      onDrop={(event) => void receive(event)}
    >
      <header>
        <strong>ФАЙЛЫ</strong>
        <span>{items.length}</span>
      </header>
      <div className="file-grid">
        {items.length ? (
          items.map((item) => (
            <Button
              className={`file${item.exists ? "" : " missing"}`}
              type="button"
              key={item.path}
              disabled={editing}
              draggable={!editing && item.exists}
              title={item.exists ? item.path : `${item.path}\nФайл недоступен`}
              onClick={() => void open(item)}
              onContextMenu={(event) => void menu(event, item)}
              onDragStart={(event) => startDrag(event, item.path)}
            >
              {item.icon ? (
                <img src={item.icon} alt="" />
              ) : (
                <span>{item.isDirectory ? "▰" : "▧"}</span>
              )}
              <small>{item.name}</small>
            </Button>
          ))
        ) : (
          <p>{drop ? "Отпустите файлы" : "Перетащите файлы сюда"}</p>
        )}
      </div>
    </section>
  );
}
