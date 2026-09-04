import type { Rectangle } from "electron";
import type { WindowCommand } from "../shared/layout.js";

export function getWindowBounds(command: WindowCommand, area: Rectangle) {
  const leftWidth = Math.floor(area.width / 2);
  const rightWidth = area.width - leftWidth;
  const topHeight = Math.floor(area.height / 2);
  const bottomHeight = area.height - topHeight;
  const right = area.x + leftWidth;
  const bottom = area.y + topHeight;

  return {
    left: { x: area.x, y: area.y, width: leftWidth, height: area.height },
    right: { x: right, y: area.y, width: rightWidth, height: area.height },
    top: { x: area.x, y: area.y, width: area.width, height: topHeight },
    bottom: { x: area.x, y: bottom, width: area.width, height: bottomHeight },
    topLeft: { x: area.x, y: area.y, width: leftWidth, height: topHeight },
    topRight: { x: right, y: area.y, width: rightWidth, height: topHeight },
    bottomLeft: { x: area.x, y: bottom, width: leftWidth, height: bottomHeight },
    bottomRight: { x: right, y: bottom, width: rightWidth, height: bottomHeight },
    maximize: { ...area },
  }[command];
}
